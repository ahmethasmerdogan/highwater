"""Altın regresyon — uzun-only backtest bayt bayt aynı kalır.

Kısa yön (KISA-YON-PLANI) eklenmeden ÖNCE kaydedildi: `direction=+1` için
her formül bugünkü aritmetiğe indirgenmek zorunda. İşlem listesi ve
özsermaye eğrisi fixture ile birebir eşleşmezse uzun botların davranışı
değişmiş demektir — 9 maraton kolu bunu yasaklar.

Fixture'ı yeniden üretmek (yalnız bilinçli bir davranış değişikliğinde):
    ALTIN_YENILE=1 uv run pytest tests/test_altin_uzun.py
"""

from __future__ import annotations

import json
import os
from datetime import timedelta
from pathlib import Path

import pytest

from sarnic.backtest.engine import BacktestEngine, BacktestParams, UniverseTimeline
from sarnic.strategy.definition import StrategyDefinition
from tests.test_backtest_run import START, SYMBOLS, build_data

FIXTURES = Path(__file__).parent / "fixtures"
#: İki varyant: varsayılan tanım (3 işlem) ve kaldıraçlı + kısmi kârlı + kapı 60
#: (çok işlem; likidasyon, borç, kısmi dilim yolları da altına girer).
VARYANTLAR = {
    "varsayilan": {},
    "kaldiracli": {
        "entry": {"min_score": 60.0, "max_positions": 6},
        "exit": {"score_exit": 40.0, "partial_tp_r": 1.0, "partial_fraction": 0.5},
        "sizing": {
            "leverage": {
                "max_leverage": 3.0,
                "min_score": 0.0,
                "tiers": [[0.0, 3.0]],
                "require_pattern": False,
                "min_headroom_atr": 0.0,
                "stop_margin_fit": 0.8,
                "hourly_rate": 0.0000208,
                "scale_risk": True,
            },
            "min_fill_ratio": 0.0,
            "max_exposure_pct": 2.4,
        },
    },
}
ALTIN_TANIM_HASH = "c2169f61c23ebee02818a141a2891b9a"


def _kos(varyant: dict) -> dict:
    d = StrategyDefinition.from_dict(
        {**StrategyDefinition().to_dict(), **{k: v for k, v in varyant.items() if k != "sizing"}}
    )
    d.sizing = {**d.sizing, **varyant.get("sizing", {})}
    params = BacktestParams(
        start=START + timedelta(hours=260),
        end=START + timedelta(hours=880),
        initial_equity=5000.0,
        symbols=SYMBOLS,
        with_patterns=False,
    )
    engine = BacktestEngine(d, params)
    data = build_data()
    times = engine.bar_times(data)
    sonuc = engine.run_scenario(data, UniverseTimeline([], fallback=SYMBOLS), times, 1.0, "base")
    return {
        "trades": sonuc.trades,
        "curve": [[t.isoformat(), round(v, 6)] for t, v in sonuc.equity_curve],
    }


@pytest.mark.parametrize("ad", list(VARYANTLAR))
def test_uzun_backtest_altin_fixture_ile_birebir(ad):
    fixture = FIXTURES / f"altin_uzun_{ad}.json"
    gercek = _kos(VARYANTLAR[ad])
    if os.environ.get("ALTIN_YENILE") or not fixture.exists():
        fixture.write_text(json.dumps(gercek, indent=1, ensure_ascii=False))
        pytest.skip("altın fixture yazıldı")
    beklenen = json.loads(fixture.read_text())
    assert len(gercek["trades"]) > 0
    assert len(gercek["trades"]) == len(beklenen["trades"])
    for g, b in zip(gercek["trades"], beklenen["trades"], strict=True):
        for k, v in b.items():
            assert g[k] == pytest.approx(v, rel=1e-9) if isinstance(v, float) else g[k] == v, k
    assert len(gercek["curve"]) == len(beklenen["curve"])
    for (gt, gv), (bt, bv) in zip(gercek["curve"], beklenen["curve"], strict=True):
        assert gt == bt and gv == pytest.approx(bv, rel=1e-9)


def test_varsayilan_tanim_hashi_sabit():
    """Yeni alan eklemek saklı tanımların hash'ini değiştiremez (bkz. to_dict)."""
    assert StrategyDefinition().hash() == ALTIN_TANIM_HASH
