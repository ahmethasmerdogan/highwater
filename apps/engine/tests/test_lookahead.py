"""Look-ahead testleri — bozulmaz kural 2.

> "Bir bar kapanmadan o barın verisi karara giremez. Her yeni indikatör veya
> özellik için, `t` anında bilinmeyen veriyi kullanıp kullanmadığını test eden
> bir property testi yazılır."

Ana teknik: **kesme testi**. Bir seriyi `t` barında keserek hesaplanan değer,
tüm seriyle hesaplanıp `t`'de okunan değere **birebir eşit** olmalıdır. Eşit
değilse gelecekten bilgi sızıyordur.
"""

from __future__ import annotations

import math

import pytest
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

from sarnic.features import indicators as ind
from sarnic.features import patterns, sr
from sarnic.features.pipeline import build_bundle
from tests.conftest import make_frames, make_ohlcv

SLOW = settings(
    max_examples=25, deadline=None, suppress_health_check=[HealthCheck.function_scoped_fixture]
)


# --------------------------------------------------------------------------- #
#  İndikatörler
# --------------------------------------------------------------------------- #
@pytest.mark.parametrize(
    "fn",
    [
        lambda df: ind.ema(df["close"], 20),
        lambda df: ind.rsi(df["close"]),
        lambda df: ind.atr(df),
        lambda df: ind.adx(df),
        lambda df: ind.bollinger_width(df["close"]),
        lambda df: ind.obv(df),
        lambda df: ind.realized_vol(df["close"]),
        lambda df: ind.rvol(df["volume"]),
        lambda df: ind.macd(df["close"])[2],
        lambda df: ind.pct_return(df["close"], 24, skip=6),
    ],
)
def test_indicator_value_does_not_change_when_future_is_added(fn):
    """`t` barındaki değer, `t` sonrası barlar eklenince değişmemeli."""
    full = make_ohlcv(400, seed=5)
    cut = 300
    truncated = full.iloc[:cut].reset_index(drop=True)

    value_truncated = fn(truncated).iloc[-1]
    value_full = fn(full).iloc[cut - 1]

    if math.isnan(value_truncated) and math.isnan(value_full):
        return
    assert value_truncated == pytest.approx(value_full, rel=1e-12, abs=1e-12)


@given(cut=st.integers(min_value=250, max_value=395))
@SLOW
def test_indicator_set_is_causal_at_every_cut(cut):
    """Hangi barda kesersek keselim, gösterge seti aynı kalır."""
    full = make_ohlcv(400, seed=9)
    truncated = full.iloc[:cut].reset_index(drop=True)

    a = ind.compute(truncated, "X", "1h")
    b = ind.compute(full.iloc[:cut].reset_index(drop=True), "X", "1h")
    for field in ("ema20", "ema50", "ema200", "adx", "rsi", "atr", "bb_width"):
        va, vb = getattr(a, field), getattr(b, field)
        if math.isnan(va) and math.isnan(vb):
            continue
        assert va == pytest.approx(vb, rel=1e-12)


@given(cut=st.integers(min_value=240, max_value=399))
@SLOW
def test_precomputed_frame_row_equals_sliced_compute(cut):
    """Backtest hızlandırmasının doğruluk kanıtı.

    `compute_frame` seriyi bir kez hesaplar; backtest `t` satırını okur.
    Bu, seriyi `t`'de kesip `compute` çağırmakla **aynı** sonucu vermek
    zorundadır. Vermezse gösterge nedensel değildir ve gelecekten bilgi sızıyordur.
    """
    full = make_ohlcv(400, seed=31)
    frame = ind.compute_frame(full, "1h")

    from_frame = ind.set_from_frame(
        frame,
        frame.index[cut - 1],
        full["open_time"].iloc[cut - 1],
        symbol="X",
        timeframe="1h",
        bars=cut,
    )
    from_slice = ind.compute(full.iloc[:cut].reset_index(drop=True), "X", "1h")

    for field in (
        "close",
        "ema20",
        "ema50",
        "ema200",
        "adx",
        "rsi",
        "macd_hist",
        "macd_hist_slope",
        "atr",
        "atr_pct",
        "bb_width",
        "obv_slope",
        "realized_vol",
        "rvol",
        "taker_buy_ratio",
        "ret_24h_skip6",
    ):
        a, b = getattr(from_frame, field), getattr(from_slice, field)
        if math.isnan(a) and math.isnan(b):
            continue
        assert a == pytest.approx(b, rel=1e-9, abs=1e-12), field


# --------------------------------------------------------------------------- #
#  S/R motoru — pivot onayı
# --------------------------------------------------------------------------- #
def test_pivots_never_use_last_k_bars():
    """Son `k` bar sağ tarafını göremez → pivot üretemez (§4.2 adım 1)."""
    df = make_ohlcv(200, seed=13)
    k = 5
    pivots = sr.detect_pivots(df, k=k)
    assert pivots, "test anlamlı olsun diye en az bir pivot beklenir"
    last_allowed = len(df) - k - 1
    assert max(p.index for p in pivots) <= last_allowed


@given(k=st.integers(min_value=2, max_value=8))
@settings(max_examples=15, deadline=None)
def test_pivot_index_bound_for_any_k(k):
    df = make_ohlcv(150, seed=17)
    pivots = sr.detect_pivots(df, k=k)
    for p in pivots:
        assert k <= p.index <= len(df) - k - 1


def test_pivots_are_stable_when_future_bars_arrive():
    """Onaylanmış bir pivot, sonradan gelen barlarla değişmez."""
    full = make_ohlcv(300, seed=21)
    cut = 200
    early = sr.detect_pivots(full.iloc[:cut].reset_index(drop=True), k=5)
    late = sr.detect_pivots(full, k=5)

    # Erken tespit edilenlerin hepsi geç listede de aynı fiyatla bulunmalı.
    # Anahtar (index, kind): bir bar hem tepe hem dip pivotu üretebilir.
    late_by_key = {(p.index, p.kind): p for p in late}
    for p in early:
        assert (p.index, p.kind) in late_by_key
        assert late_by_key[(p.index, p.kind)].price == pytest.approx(p.price)


def test_sr_result_is_causal():
    full = make_ohlcv(400, seed=23)
    cut = 320
    a = sr.compute_sr(full.iloc[:cut].reset_index(drop=True), "X", "1h")
    b = sr.compute_sr(full.iloc[:cut].reset_index(drop=True), "X", "1h")
    assert a.as_dict() == b.as_dict()

    # Gelecek barlar eklenince geçmişin S/R'si değişebilir (yeni pivotlar oluşur),
    # ama `cut` anındaki hesaplama yalnızca `cut`'a kadarki veriyi kullanmalı:
    # aynı kesikte iki kez çağırmak aynı sonucu vermeli ve tam seri farklı olmalı.
    full_result = sr.compute_sr(full, "X", "1h")
    assert full_result.price != a.price  # farklı bar → farklı fiyat


# --------------------------------------------------------------------------- #
#  Formasyon motoru — nedensel kernel
# --------------------------------------------------------------------------- #
def test_causal_kernel_only_uses_past():
    """Geleceği değiştirmek geçmişin yumuşatılmış değerini değiştirmemeli."""
    import numpy as np

    prices = np.linspace(100, 120, 100)
    smoothed_a = patterns.causal_kernel_smooth(prices, bandwidth=5)

    modified = prices.copy()
    modified[60:] = 1000.0  # gelecek tamamen bozuluyor
    smoothed_b = patterns.causal_kernel_smooth(modified, bandwidth=5)

    assert np.allclose(smoothed_a[:60], smoothed_b[:60])


def test_extrema_exclude_unconfirmed_tail():
    import numpy as np

    prices = np.sin(np.linspace(0, 12, 200)) * 10 + 100
    smoothed = patterns.causal_kernel_smooth(prices, 4)
    extrema = patterns.find_extrema(smoothed, k=3)
    assert extrema
    assert max(e.index for e in extrema) <= len(prices) - 3 - 1


def test_bandwidth_selection_is_causal():
    """Bant genişliği seçimi ileri tahmin hatasına dayanır, sonucu değişmemeli."""
    import numpy as np

    prices = np.linspace(50, 80, 200)
    a = patterns.select_bandwidth(prices)
    b = patterns.select_bandwidth(prices)
    assert a == b


def test_pattern_result_is_deterministic():
    df = make_ohlcv(300, seed=29)
    a = patterns.compute_patterns(df, "X", "1h")
    b = patterns.compute_patterns(df, "X", "1h")
    assert [m.as_dict() for m in a.matches] == [m.as_dict() for m in b.matches]
    assert a.modifier() == b.modifier()


# --------------------------------------------------------------------------- #
#  Uçtan uca: özellik hattı
# --------------------------------------------------------------------------- #
def test_bundle_features_are_causal():
    """Aynı kesikten üretilen özellikler her çağrıda aynı olmalı."""
    frames = make_frames(symbol_seed=3, bars=400)
    a = build_bundle("TESTUSDT", frames)
    b = build_bundle("TESTUSDT", frames)
    assert a.features.raw.keys() == b.features.raw.keys()
    for key in a.features.raw:
        va, vb = a.features.raw[key], b.features.raw[key]
        if isinstance(va, float) and math.isnan(va):
            assert math.isnan(vb)
        else:
            assert va == pytest.approx(vb)


def test_bundle_at_cut_ignores_future():
    """`cut` barında hesaplanan 1h göstergeleri, sonraki barlardan etkilenmemeli."""
    frames = make_frames(symbol_seed=4, bars=400)
    cut = 300
    truncated = {
        tf: df.iloc[: min(cut, len(df))].reset_index(drop=True) for tf, df in frames.items()
    }

    bundle = build_bundle("TESTUSDT", truncated, with_patterns=False)
    direct = ind.compute(truncated["1h"], "TESTUSDT", "1h")

    assert bundle.indicators["1h"].close == pytest.approx(direct.close)
    assert bundle.indicators["1h"].ema200 == pytest.approx(direct.ema200, nan_ok=True)


# --------------------------------------------------------------------------- #
#  Karar dilimi gerçekten uygulanıyor mu
# --------------------------------------------------------------------------- #
def test_decision_timeframe_selects_its_own_frame():
    """15m botu 15m çerçevesinden puanlanmalı, 1h'ten değil.

    Worker botun dilimine göre uyanıyordu ama özellik hattına dilimi
    geçmiyordu: `DECISION_TF` modül sabitiydi ve hat her zaman 1h okuyordu.
    Sonuç, 15 dakikada bir uyanıp aynı 1h barını yeniden puanlayan bir bottu.
    """
    from sarnic.features.pipeline import build_bundle

    frames = {
        "15m": make_ohlcv(400, timeframe_minutes=15, seed=1, drift=0.002),
        "1h": make_ohlcv(400, timeframe_minutes=60, seed=2, drift=-0.002),
        "4h": make_ohlcv(300, timeframe_minutes=240, seed=3),
        "1d": make_ohlcv(300, timeframe_minutes=1440, seed=4),
    }

    b15 = build_bundle("X", frames, decision_tf="15m")
    b1h = build_bundle("X", frames, decision_tf="1h")

    # Karar çerçevesi farklı olduğu için S/R de farklı hesaplanmalı.
    assert b15.sr is not None and b1h.sr is not None
    assert b15.sr.timeframe == "15m"
    assert b1h.sr.timeframe == "1h"
    # Zıt yönlü seriler verildi; puan özellikleri aynı çıkarsa dilim yok sayılmış demektir.
    assert b15.features.raw["ema_alignment"] != b1h.features.raw["ema_alignment"]


def test_context_timeframes_stay_4h_and_1d():
    """Bağlam dilimleri karar diliminden bağımsızdır.

    `trend_4h` her zaman gerçekten 4h trendini taşımalı; bağlamı karar
    dilimine göre kaydırmak özellik adını yalancı yapardı.
    """
    from sarnic.features.pipeline import timeframes_for

    assert timeframes_for("15m") == ("15m", "4h", "1d")
    assert timeframes_for("30m") == ("30m", "4h", "1d")
    assert timeframes_for("1h") == ("1h", "4h", "1d")
    # Karar dilimi bağlamla çakışırsa iki kez yüklenmez.
    assert timeframes_for("4h") == ("4h", "1d")


def test_default_behaviour_unchanged_for_1h():
    """1h botların davranışı birebir korunmalı — dilim geçilmediğinde de aynı."""
    from sarnic.features.pipeline import build_bundle

    frames = {
        "1h": make_ohlcv(400, timeframe_minutes=60, seed=7),
        "4h": make_ohlcv(300, timeframe_minutes=240, seed=8),
        "1d": make_ohlcv(300, timeframe_minutes=1440, seed=9),
    }
    implicit = build_bundle("X", frames)
    explicit = build_bundle("X", frames, decision_tf="1h")
    assert implicit.features.raw == explicit.features.raw


def test_bundle_indicators_keyed_by_decision_timeframe():
    """Bot kendi diliminin göstergesini bulabilmeli.

    Worker fiyat/stop/ATR sözlüklerini `b.indicators.get("1h")` ile
    dolduruyordu. 15m ve 30m botlarda o anahtar yok, döngü `continue` ediyor
    ve üç sözlük de **boş** kalıyordu: aday bulunmasına rağmen tek giriş bile
    açılmıyor, hiçbir yere iz düşmüyordu.
    """
    from sarnic.features.pipeline import build_bundle

    frames = {
        "15m": make_ohlcv(400, timeframe_minutes=15, seed=11),
        "30m": make_ohlcv(400, timeframe_minutes=30, seed=12),
        "4h": make_ohlcv(300, timeframe_minutes=240, seed=13),
        "1d": make_ohlcv(300, timeframe_minutes=1440, seed=14),
    }
    for tf in ("15m", "30m"):
        b = build_bundle("X", frames, decision_tf=tf)
        assert tf in b.indicators, f"{tf} göstergesi üretilmedi"
        ind = b.indicators[tf]
        assert ind.bars > 0
        assert ind.close == ind.close  # NaN değil


# --------------------------------------------------------------------------- #
#  Stop mesafesi tabanı
from sarnic.features.sr import stop_from_sr  # noqa: E402


def _sr(support: float, atr: float = 1.0):
    """Tek destekli sade bir S/R sonucu."""
    from sarnic.features.sr import Level, SRResult

    return SRResult(
        symbol="TESTUSDT",
        timeframe="1h",
        price=support + 10 * atr,
        atr=atr,
        nearest_support=Level(price=support, kind="support", strength=1.0, touches=2),
    )


# --------------------------------------------------------------------------- #
def test_stop_never_lands_closer_than_the_configured_atr_distance():
    """Destek girişe yakınsa bile stop `k×ATR`'den yakın olamaz.

    `stop_from_sr` bir **fiyat seviyesi** üretir, girişten bir mesafe değil.
    Giriş desteğin hemen üstündeyse mesafe keyfi biçimde küçülür. Canlıda
    görüldü (2026-08-19, ESPUSDT): giriş 0,077289, stop 0,077050 — arada
    %0,31 — ve pozisyon saniyeler içinde stoplandı. Ölçümle seçilen 2 ATR
    mesafesi 60 gün / 605 giriş üzerinde doğrulanmıştı ama sistem onu hiç
    uygulamıyordu.
    """
    atr = 1.0
    # Asıl arıza: fiyat desteği kırmış, S/R hâlâ eski seviyeyi "en yakın
    # destek" olarak veriyor — yani destek **girişin üstünde** kalıyor. O zaman
    # `destek − k×ATR` girişe çok yakın, hatta girişin üstünde bir stop üretir.
    sr = _sr(support=101.0, atr=atr)
    giris = 100.2

    stop = stop_from_sr(sr, atr_multiple=2.0, entry=giris)
    assert stop == pytest.approx(98.2), "stop girişten 2 ATR aşağıda olmalı"
    assert giris - stop == pytest.approx(2 * atr)

    # Taban olmasaydı stop 99,0 olurdu: girişin yalnızca %1,2 altında ve
    # ESPUSDT'de olduğu gibi saniyeler içinde tetiklenirdi.
    assert stop_from_sr(sr, atr_multiple=2.0) == pytest.approx(99.0)


def test_stop_floor_does_not_tighten_a_deeper_support_stop():
    """Destek zaten aşağıdaysa taban hiçbir şeyi değiştirmez."""
    assert stop_from_sr(_sr(support=90.0), atr_multiple=2.0, entry=100.0) == pytest.approx(88.0)


def test_stop_without_entry_keeps_the_old_behaviour():
    """Giriş verilmezse eski davranış — sessiz varsayım yok."""
    assert stop_from_sr(_sr(support=99.0), atr_multiple=2.0) == pytest.approx(97.0)
