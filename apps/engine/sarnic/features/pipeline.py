"""Özellik hattı — ham OHLCV'den `SymbolFeatures`'a.

Bozulmaz kural 1: backtest, paper ve canlı **bu aynı fonksiyonu** çağırır.
Fark yalnızca çerçevelerin nereden geldiğidir (canlıda DB'nin son barları,
backtest'te sanal saatin gösterdiği ana kadarki barlar).
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from datetime import datetime

import pandas as pd
from sqlalchemy.ext.asyncio import AsyncSession

from sarnic.core.logging import get_logger
from sarnic.data.store import load_frames
from sarnic.features import indicators, patterns, sr
from sarnic.scoring.engine import SymbolFeatures, build_features

log = get_logger(__name__)

# Varsayılan karar zaman dilimi. Bot kendi dilimini geçebilir; geçmezse 1h
# kullanılır ve davranış eskisiyle **birebir** aynı kalır.
DECISION_TF = "1h"

# Bağlam dilimleri karar diliminden **bağımsızdır** ve her zaman 4h + 1d'dir.
#
# Bunlar piyasa rejimini anlatır: "4h trendi yukarı mı, 1d trendi yukarı mı".
# Bu soruların cevabı, ne sıklıkla karar verdiğinle değişmez. 15 dakikada bir
# karar veren bir bot da 4h ve 1d rejimini bilmek ister. Bağlamı karar
# dilimine göre kaydırmak `trend_4h` özelliğinin adını yalancı yapardı —
# 15m botta içinde 1h trendi taşıyan bir alan `trend_4h` diye anılırdı.
CONTEXT_TFS = ("4h", "1d")

# EMA200 için 220 bar gerekir; emniyetli tampon. Karar dilimi ne olursa olsun
# aynı **bar sayısı** gerekir — 15m'de 400 bar ~4 gün, 1h'te ~17 gündür.
BARS_NEEDED = {"15m": 400, "30m": 400, "1h": 400, "4h": 300, "1d": 300}


def timeframes_for(decision_tf: str = DECISION_TF) -> tuple[str, ...]:
    """Bir karar dilimi için yüklenecek tüm çerçeveler.

    Karar dilimi bağlam dilimlerinden biriyse (ör. 4h botu) tekrar yüklenmez.
    """
    return (decision_tf, *(tf for tf in CONTEXT_TFS if tf != decision_tf))


ALL_TFS = timeframes_for()


@dataclass(slots=True)
class SymbolBundle:
    """Bir sembolün bir bardaki tüm ham çıktıları — panelin de kaynağı."""

    symbol: str
    indicators: dict[str, indicators.IndicatorSet]
    sr: sr.SRResult | None
    patterns: patterns.PatternResult | None
    features: SymbolFeatures


def build_bundle(
    symbol: str,
    frames: dict[str, pd.DataFrame],
    *,
    with_patterns: bool = True,
    decision_tf: str = DECISION_TF,
) -> SymbolBundle:
    """Saf: verilen (yalnızca kapanmış barlardan oluşan) çerçevelerden özellik üretir."""
    tfs = timeframes_for(decision_tf)
    ind = {tf: indicators.compute(frames.get(tf, pd.DataFrame()), symbol, tf) for tf in tfs}

    base = frames.get(decision_tf)
    sr_res = None
    pat_res = None
    if base is not None and not base.empty:
        sr_res = sr.compute_sr(base, symbol, decision_tf)
        if with_patterns:
            pat_res = patterns.compute_patterns(base, symbol, decision_tf)

    feats = build_features(symbol, ind, sr_res, pat_res, decision_tf=decision_tf)
    return SymbolBundle(symbol=symbol, indicators=ind, sr=sr_res, patterns=pat_res, features=feats)


def precompute_indicators(
    frames: dict[str, pd.DataFrame],
) -> dict[str, pd.DataFrame]:
    """Zaman dilimi başına gösterge sütunlarını bir kez hesaplar.

    Backtest bar-bar ilerlerken her barda 400 barlık seriyi yeniden hesaplamak
    maliyeti bar sayısının karesine çıkarır. Göstergeler nedensel olduğu için
    seriyi bir kez hesaplayıp `t` satırını okumak birebir aynı sonucu verir
    (`tests/test_lookahead.py::test_precomputed_frame_row_equals_sliced_compute`).
    """
    return {
        tf: indicators.compute_frame(df, tf)
        for tf, df in frames.items()
        if df is not None and not df.empty
    }


def build_bundle_precomputed(
    symbol: str,
    frames: dict[str, pd.DataFrame],
    indicator_frames: dict[str, pd.DataFrame],
    cuts: dict[str, int],
    *,
    with_patterns: bool = True,
    decision_tf: str = DECISION_TF,
) -> SymbolBundle:
    """`cuts[tf]` = o zaman diliminde kullanılabilir bar sayısı (dahil).

    S/R ve formasyon motorları bar bar yeniden hesaplanır — onlar pencere
    tabanlıdır ve satır okumasıyla elde edilemez.
    """
    ind: dict[str, indicators.IndicatorSet] = {}
    for tf in timeframes_for(decision_tf):
        frame = indicator_frames.get(tf)
        df = frames.get(tf)
        cut = cuts.get(tf, 0)
        if frame is None or df is None or cut <= 0:
            empty = indicators.IndicatorSet(symbol=symbol, timeframe=tf, bars=0)
            empty.warnings.append("veri yok")
            ind[tf] = empty
            continue
        row = cut - 1
        ind[tf] = indicators.set_from_frame(
            frame,
            frame.index[row],
            df["open_time"].iloc[row],
            symbol=symbol,
            timeframe=tf,
            bars=cut,
        )

    base = frames.get(decision_tf)
    cut_base = cuts.get(decision_tf, 0)
    sr_res = None
    pat_res = None
    if base is not None and cut_base > 0:
        need = BARS_NEEDED.get(decision_tf, 400)
        window = base.iloc[max(0, cut_base - need) : cut_base]
        if not window.empty:
            sr_res = sr.compute_sr(window, symbol, decision_tf)
            if with_patterns:
                pat_res = patterns.compute_patterns(window, symbol, decision_tf)

    feats = build_features(symbol, ind, sr_res, pat_res, decision_tf=decision_tf)
    return SymbolBundle(symbol=symbol, indicators=ind, sr=sr_res, patterns=pat_res, features=feats)


def build_bundles(
    frames_by_symbol: dict[str, dict[str, pd.DataFrame]],
    *,
    with_patterns: bool = True,
    max_workers: int = 0,
    decision_tf: str = DECISION_TF,
) -> list[SymbolBundle]:
    """Havuzun tamamı. `max_workers=0` → sırayla (deterministik)."""
    return [
        build_bundle(symbol, frames, with_patterns=with_patterns, decision_tf=decision_tf)
        for symbol, frames in frames_by_symbol.items()
    ]


async def load_bundles(
    session: AsyncSession,
    symbols: list[str],
    *,
    at: datetime,
    with_patterns: bool = True,
    decision_tf: str = DECISION_TF,
) -> list[SymbolBundle]:
    """Canlı yol: DB'den `at` anına kadarki kapanmış barları çeker, özellik üretir.

    `load_frames` `is_closed = TRUE` ve `open_time <= at` filtreleri uygular;
    `at` barı ancak kapanmışsa hesaba girer (bozulmaz kural 2).
    """
    if not symbols:
        return []

    tfs = timeframes_for(decision_tf)
    per_tf = await asyncio.gather(
        *(
            load_frames(session, symbols, tf, end=at, limit=BARS_NEEDED.get(tf, 400))
            for tf in tfs
        )
    )
    by_symbol: dict[str, dict[str, pd.DataFrame]] = {
        s: {tf: per_tf[i].get(s, pd.DataFrame()) for i, tf in enumerate(tfs)} for s in symbols
    }
    return await asyncio.to_thread(
        build_bundles, by_symbol, with_patterns=with_patterns, decision_tf=decision_tf
    )
