"""Veri kalitesi denetçisi testleri — §2.3 / Faz 1 kabul kriteri."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pandas as pd
import pytest
from sqlalchemy import select

from sarnic.data.quality import (
    QualityFinding,
    QualityReport,
    audit_frame,
    find_gaps,
    find_outliers,
    find_sanity_violations,
    finding_fingerprint,
    is_stale,
    persist_report,
)
from sarnic.data.store import expected_bar_count, floor_to_bar, last_closed_bar
from tests.conftest import make_ohlcv, utc

NOW = datetime(2026, 8, 13, 14, 37, 12, tzinfo=UTC)


# --------------------------------------------------------------------------- #
#  Boşluk tespiti
# --------------------------------------------------------------------------- #
def test_no_gaps_in_continuous_frame():
    assert find_gaps(make_ohlcv(100), "X", "1h") == []


def test_detects_six_hour_gap():
    """Faz 1 kabul: kasıtlı 6 saatlik boşluk yaratılıp tespit edilmeli."""
    df = make_ohlcv(100)
    # 40–46 arası altı barı sil.
    broken = pd.concat([df.iloc[:40], df.iloc[46:]]).reset_index(drop=True)
    gaps = find_gaps(broken, "X", "1h")
    assert len(gaps) == 1
    assert gaps[0].missing_bars == 6


def test_detects_multiple_gaps():
    df = make_ohlcv(100)
    broken = pd.concat([df.iloc[:20], df.iloc[23:60], df.iloc[65:]]).reset_index(drop=True)
    gaps = find_gaps(broken, "X", "1h")
    assert len(gaps) == 2
    assert [g.missing_bars for g in gaps] == [3, 5]


def test_gap_detection_needs_two_bars():
    assert find_gaps(make_ohlcv(1), "X", "1h") == []


# --------------------------------------------------------------------------- #
#  Aykırı değer
# --------------------------------------------------------------------------- #
def test_detects_outlier_bar():
    """|log getiri| > 0.5 → işaretlenir (kötü tick mi, gerçek hareket mi?)."""
    df = make_ohlcv(100)
    df.loc[50, "close"] = df.loc[49, "close"] * 3  # +%200
    outliers = find_outliers(df)
    assert outliers
    assert any(abs(o["log_return"]) > 0.5 for o in outliers)


def test_no_outliers_in_calm_series():
    assert find_outliers(make_ohlcv(200, vol=0.005)) == []


def test_outlier_threshold_is_configurable():
    df = make_ohlcv(100, vol=0.02, seed=99)
    assert len(find_outliers(df, threshold=0.001)) > len(find_outliers(df, threshold=0.5))


# --------------------------------------------------------------------------- #
#  Mantık kontrolü
# --------------------------------------------------------------------------- #
def test_sanity_passes_on_valid_frame():
    assert find_sanity_violations(make_ohlcv(50)) == []


def test_detects_low_above_high():
    df = make_ohlcv(50)
    df.loc[10, "low"] = df.loc[10, "high"] + 1
    violations = find_sanity_violations(df)
    assert len(violations) == 1


def test_detects_close_above_high():
    df = make_ohlcv(50)
    df.loc[10, "close"] = df.loc[10, "high"] * 2
    assert len(find_sanity_violations(df)) == 1


def test_detects_negative_volume():
    df = make_ohlcv(50)
    df.loc[10, "volume"] = -5.0
    assert len(find_sanity_violations(df)) == 1


# --------------------------------------------------------------------------- #
#  Bayat veri
# --------------------------------------------------------------------------- #
def test_stale_when_silent_too_long():
    assert is_stale(NOW - timedelta(seconds=90), NOW, 60) is True


def test_not_stale_when_recent():
    assert is_stale(NOW - timedelta(seconds=30), NOW, 60) is False


def test_never_seen_is_stale():
    """Hiç mesaj gelmediyse veri bayattır — "belki gelir" diye beklemeyiz."""
    assert is_stale(None, NOW, 60) is True


# --------------------------------------------------------------------------- #
#  Tam denetim
# --------------------------------------------------------------------------- #
def test_audit_clean_frame_has_no_findings():
    report = audit_frame(make_ohlcv(200, vol=0.005), "X", "1h")
    assert report.ok
    assert report.completeness == pytest.approx(1.0)


def test_audit_empty_frame_reports_error():
    report = audit_frame(pd.DataFrame(), "X", "1h")
    assert not report.ok
    assert report.findings[0].kind == "gap"


def test_audit_reports_gap_severity():
    df = make_ohlcv(200)
    broken = pd.concat([df.iloc[:50], df.iloc[100:]]).reset_index(drop=True)  # 50 bar
    report = audit_frame(broken, "X", "1h")
    gap_findings = [f for f in report.findings if f.kind == "gap"]
    assert gap_findings
    assert gap_findings[0].severity == "ERROR"


def test_audit_completeness_reflects_missing_bars():
    df = make_ohlcv(100)
    broken = pd.concat([df.iloc[:40], df.iloc[50:]]).reset_index(drop=True)
    report = audit_frame(broken, "X", "1h")
    assert report.completeness < 1.0


# --------------------------------------------------------------------------- #
#  Bar zamanı yardımcıları — look-ahead korumasının temeli
# --------------------------------------------------------------------------- #
def test_floor_to_bar():
    assert floor_to_bar(NOW, "1h") == datetime(2026, 8, 13, 14, 0, tzinfo=UTC)
    assert floor_to_bar(NOW, "15m") == datetime(2026, 8, 13, 14, 30, tzinfo=UTC)
    assert floor_to_bar(NOW, "4h") == datetime(2026, 8, 13, 12, 0, tzinfo=UTC)
    assert floor_to_bar(NOW, "1d") == datetime(2026, 8, 13, 0, 0, tzinfo=UTC)


def test_last_closed_bar_excludes_current_bar():
    """14:37'de en son **kapanmış** 1h barı 13:00'tür — 14:00 hâlâ açıktır."""
    assert last_closed_bar(NOW, "1h") == datetime(2026, 8, 13, 13, 0, tzinfo=UTC)
    assert last_closed_bar(NOW, "15m") == datetime(2026, 8, 13, 14, 15, tzinfo=UTC)
    assert last_closed_bar(NOW, "1d") == datetime(2026, 8, 12, 0, 0, tzinfo=UTC)


def test_last_closed_bar_at_exact_boundary():
    """Tam 14:00:00'da bile 14:00 barı henüz kapanmamıştır."""
    boundary = datetime(2026, 8, 13, 14, 0, 0, tzinfo=UTC)
    assert last_closed_bar(boundary, "1h") == datetime(2026, 8, 13, 13, 0, tzinfo=UTC)


def test_expected_bar_count():
    start = datetime(2026, 8, 13, 0, 0, tzinfo=UTC)
    end = datetime(2026, 8, 13, 10, 0, tzinfo=UTC)
    assert expected_bar_count(start, end, "1h") == 11
    assert expected_bar_count(start, end, "15m") == 41


# --------------------------------------------------------------------------- #
# Saatlik denetim zamanlaması — §2.3 "her saatlik döngü sonrası"
# --------------------------------------------------------------------------- #
def test_next_audit_lands_after_the_bar_close():
    """Denetim bar kapanışının **sonrasına** düşmeli.

    Tam saat başında çalışırsa kapanan bar henüz yazılmamış olur ve denetim
    her turda sahte bir boşluk raporlar.
    """
    from sarnic.data.marketdata import AUDIT_DELAY, MarketDataService

    delay = MarketDataService._seconds_to_next_audit()
    assert 0 < delay <= 3600 + AUDIT_DELAY.total_seconds()
    assert AUDIT_DELAY.total_seconds() > 0


def test_quality_audit_is_a_supervised_task():
    """Denetim gözcünün dirilttiği görevler arasında olmalı — sessizce ölmesin."""
    from sarnic.data.marketdata import MarketDataService

    names = MarketDataService._task_factories(MarketDataService.__new__(MarketDataService))
    assert "md-quality" in names


# --------------------------------------------------------------------------- #
# Bar kapanış olayları toplu yayınlanır
#
# Her sembol için ayrı olay yayınlanıyordu: 45 sembol × 2 zaman dilimi =
# çeyrek saatte 90 olay. Son 500 olayın 484'ü buydu; pozisyon ve risk olayları
# bu gürültüde kayboluyordu.
# --------------------------------------------------------------------------- #
async def test_bar_closes_are_batched_per_timeframe_and_bar():
    from datetime import UTC, datetime

    from sarnic.data.binance import Kline
    from sarnic.data.marketdata import MarketDataService

    service = MarketDataService.__new__(MarketDataService)
    service._bar_batches = {}

    bar = datetime(2026, 8, 16, 3, 0, tzinfo=UTC)
    for symbol in ("BTCUSDT", "ETHUSDT", "SOLUSDT"):
        service._note_bar_close(
            Kline(
                symbol=symbol,
                timeframe="1h",
                open_time=bar,
                open=1.0,
                high=1.0,
                low=1.0,
                close=1.0,
                volume=1.0,
                quote_volume=1.0,
                trades=1,
                taker_buy_base=0.5,
                taker_buy_quote=0.5,
                is_closed=True,
            )
        )

    assert len(service._bar_batches) == 1, "üç sembol tek gruba düşmeli"
    assert next(iter(service._bar_batches.values())).count == 3


async def test_different_timeframes_are_separate_batches():
    from datetime import UTC, datetime

    from sarnic.data.binance import Kline
    from sarnic.data.marketdata import MarketDataService

    service = MarketDataService.__new__(MarketDataService)
    service._bar_batches = {}
    bar = datetime(2026, 8, 16, 3, 0, tzinfo=UTC)

    for timeframe in ("15m", "1h"):
        service._note_bar_close(
            Kline(
                symbol="BTCUSDT",
                timeframe=timeframe,
                open_time=bar,
                open=1.0,
                high=1.0,
                low=1.0,
                close=1.0,
                volume=1.0,
                quote_volume=1.0,
                trades=1,
                taker_buy_base=0.5,
                taker_buy_quote=0.5,
                is_closed=True,
            )
        )

    assert len(service._bar_batches) == 2


# --------------------------------------------------------------------------- #
#  Kuyruk boşluğu — donmuş zaman dilimi (SYSTEM-REVIEW §2)
#
# 1d ve 4h akışı iki gün boyunca hiç bar yazmadı. Çerçevede **iç** boşluk
# oluşmadığı için (sadece kısa kaldı) denetim "temiz" dedi ve panel "0 bulgu"
# gösterdi. Donmuş bir dilimi görmenin tek yolu çerçevenin sonuna bakmaktır.
# --------------------------------------------------------------------------- #
def test_donmus_dilim_kuyruk_boslugu_uretir():
    from sarnic.data.quality import find_trailing_gap

    # 1d çerçevesi 3 gün önce bitmiş.
    df = make_ohlcv(30, timeframe_minutes=1440, start=NOW - timedelta(days=33))
    gap = find_trailing_gap(df, "BTCUSDT", "1d", NOW)

    assert gap is not None
    assert gap.missing_bars >= 2
    assert gap.timeframe == "1d"


def test_taze_dilim_kuyruk_boslugu_uretmez():
    """Son bar henüz kapanmış: gecikme yok, bulgu yok."""
    from sarnic.data.quality import find_trailing_gap

    df = make_ohlcv(50, start=NOW - timedelta(hours=50))
    assert find_trailing_gap(df, "X", "1h", NOW) is None


def test_tek_bar_gecikme_tolere_edilir():
    """Barın yazılması saniyeler sürer; bir bar boyu gecikme durma değildir."""
    from sarnic.data.quality import find_trailing_gap

    df = make_ohlcv(50, start=NOW - timedelta(hours=51))
    assert find_trailing_gap(df, "X", "1h", NOW) is None


def test_audit_frame_now_verilmezse_sona_bakmaz():
    """Saf yol korunur: `now` yoksa yalnızca iç tutarlılık denetlenir."""
    df = make_ohlcv(30, timeframe_minutes=1440, start=NOW - timedelta(days=33))
    assert audit_frame(df, "BTCUSDT", "1d").gaps == []


def test_audit_frame_now_verilirse_donmayi_bulur():
    df = make_ohlcv(30, timeframe_minutes=1440, start=NOW - timedelta(days=33))
    report = audit_frame(df, "BTCUSDT", "1d", now=NOW)

    assert len(report.gaps) == 1
    assert any(f.kind == "gap" for f in report.findings)
    # Not: önem eşiği bar sayısına bakıyor (24 bar → ERROR) ve 1h için ayarlanmış.
    # 1d'de 24 bar 24 gün demek, dolayısıyla üç günlük donma "WARN" kalıyor.
    assert next(f for f in report.findings if f.kind == "gap").severity == "WARN"


# --------------------------------------------------------------------------- #
#  §4b — aynı açık bulgu iki kez yazılmaz
# --------------------------------------------------------------------------- #
def test_fingerprint_stable_while_stream_stays_down():
    """Kuyruk boşluğu büyürken bulgunun kimliği **değişmemeli**.

    Denetim saatlik çalışıyor ve akış durduğu sürece boşluğun `end` ve
    `missing_bars` alanları her turda ilerliyor. Kimlik bunlara dayansaydı aynı
    durma her saat yeni bir satır yazardı — engellemek istediğimiz şeyin ta
    kendisi (`SYSTEM-REVIEW` §4b).
    """
    df = make_ohlcv(50)
    last = df["open_time"].max().to_pydatetime()

    def gap_fingerprint(hours_down: int) -> str:
        report = audit_frame(df, "X", "1h", now=last + timedelta(hours=hours_down))
        gaps = [f for f in report.findings if f.kind == "gap"]
        assert gaps, "kuyruk boşluğu bulunmalıydı"
        return finding_fingerprint(gaps[0])

    assert gap_fingerprint(5) == gap_fingerprint(30)


def test_fingerprint_differs_per_bar():
    """Farklı barlardaki aykırı değerler ayrı bulgulardır."""
    a = QualityFinding("outlier", "X", "1h", "WARN", {"open_time": "2026-01-01T00:00:00+00:00"})
    b = QualityFinding("outlier", "X", "1h", "WARN", {"open_time": "2026-01-02T00:00:00+00:00"})
    assert finding_fingerprint(a) != finding_fingerprint(b)


def test_fingerprint_ignores_volatile_detail_fields():
    """Aynı bar, farklı ölçüm ayrıntısı → yine aynı bulgu."""
    bar = "2026-01-01T00:00:00+00:00"
    a = QualityFinding("outlier", "X", "1h", "WARN", {"open_time": bar, "close": 1.0})
    b = QualityFinding("outlier", "X", "1h", "WARN", {"open_time": bar, "close": 2.0})
    assert finding_fingerprint(a) == finding_fingerprint(b)


def test_empty_frame_gap_has_identity():
    """Çerçeve boşken de kimlik üretilmeli; boş dize indekste çakışma yaratır."""
    report = audit_frame(pd.DataFrame(), "X", "1d")
    assert report.findings
    assert finding_fingerprint(report.findings[0]) == "veri-yok"


@pytest.mark.asyncio
async def test_persist_report_writes_each_finding_once(api_session):
    """Denetim tekrar tekrar koşsa da açık bulgu bir kez yazılır."""
    from sqlalchemy import func, select

    from sarnic.db.models import DataQualityReport

    report = QualityReport(symbol="X", timeframe="1d")
    report.findings = [
        QualityFinding("outlier", "X", "1d", "WARN", {"open_time": "2026-06-06T00:00:00+00:00"}),
        QualityFinding("outlier", "X", "1d", "WARN", {"open_time": "2026-06-07T00:00:00+00:00"}),
    ]

    first = await persist_report(api_session, report)
    await api_session.commit()
    assert first == 2

    # Saatler sonra aynı tarihsel barlar yeniden raporlanır.
    second = await persist_report(api_session, report)
    await api_session.commit()
    assert second == 0, "aynı bulgu ikinci kez yazılmamalıydı"

    total = (await api_session.execute(select(func.count(DataQualityReport.id)))).scalar_one()
    assert total == 2


@pytest.mark.asyncio
async def test_resolved_gap_can_be_reported_again(api_session):
    """Kapanan bir boşluk yeniden oluşursa bu **yeni** bir olaydır.

    Benzersiz indeksin kısmi olmasının sebebi budur: yalnızca açık kayıtları
    kapsar. Aykırı değer hiç kapanmadığı için sonsuza dek tekilleşir; boşluk
    ise onarıldıktan sonra tekrar bozulabilir ve bu görünmelidir.
    """
    from sqlalchemy import func, select, update

    from sarnic.db.models import DataQualityReport

    report = QualityReport(symbol="X", timeframe="1h")
    report.findings = [
        QualityFinding("gap", "X", "1h", "WARN", {"start": "2026-06-06T00:00:00+00:00"}),
    ]

    assert await persist_report(api_session, report) == 1
    await api_session.commit()

    await api_session.execute(update(DataQualityReport).values(resolved=True))
    await api_session.commit()

    assert await persist_report(api_session, report) == 1
    await api_session.commit()

    total = (await api_session.execute(select(func.count(DataQualityReport.id)))).scalar_one()
    assert total == 2


# --------------------------------------------------------------------------- #
#  Ticker akışı — `!miniTicker@arr` yükü
# --------------------------------------------------------------------------- #
def test_parses_mini_ticker_and_derives_change():
    """`miniTicker` yükünde `P` yoktur; açılış/kapanıştan hesaplanmalı.

    Sistem `!ticker@arr` yerine `!miniTicker@arr` kullanıyor çünkü Binance
    birincisinin aboneliğini kabul edip hiç veri göndermiyor (ölçüldü:
    9443/443/vision uçlarında 25 saniyede 0 mesaj).
    """
    from sarnic.data.binance import BinanceWebSocket

    payload = [
        {
            "e": "24hrMiniTicker",
            "s": "BTCUSDT",
            "c": "110.00",
            "o": "100.00",
            "h": "115.00",
            "l": "95.00",
            "v": "1000",
            "q": "110000",
        }
    ]
    out = BinanceWebSocket.parse_ticker_array(payload)
    assert len(out) == 1
    t = out[0]
    assert t.symbol == "BTCUSDT"
    assert float(t.last_price) == 110.0
    assert float(t.quote_volume) == 110000.0
    assert float(t.price_change_pct) == pytest.approx(10.0)


def test_parses_full_ticker_payload_unchanged():
    """Tam `ticker` yükü hâlâ okunmalı — `P` varsa o kullanılır."""
    from sarnic.data.binance import BinanceWebSocket

    payload = [
        {
            "e": "24hrTicker",
            "s": "ETHUSDT",
            "c": "50.00",
            "o": "40.00",
            "P": "-3.5",
            "h": "55.00",
            "l": "35.00",
            "q": "9000",
        }
    ]
    t = BinanceWebSocket.parse_ticker_array(payload)[0]
    assert float(t.price_change_pct) == pytest.approx(-3.5)


def test_mini_ticker_zero_open_does_not_divide_by_zero():
    """Açılış sıfırsa yüzde hesaplanamaz; çökmek yerine sıfır döner."""
    from sarnic.data.binance import BinanceWebSocket

    payload = [{"s": "XUSDT", "c": "1.0", "o": "0", "h": "1", "l": "1", "q": "10"}]
    t = BinanceWebSocket.parse_ticker_array(payload)[0]
    assert float(t.price_change_pct) == 0.0


async def test_open_gap_findings_close_once_the_bars_exist(api_session, test_database):
    """Havuzdan çıkan sembolün bulgusu sonsuza dek açık kalmamalı.

    `close_resolved_gaps` yalnızca o sembol denetlenirken çalışır, denetim de
    yalnızca izlenen sembollerde döner. Sembol havuzdan çıkınca bulgusu donar:
    ölçüldüğünde panelde duran 21 ERROR boşluğun tamamı çoktan onarılmıştı ve
    hiçbiri havuzda değildi. Kalıcı hayalet hata, kullanıcıya sayfayı yok
    saymayı öğretir.
    """
    from decimal import Decimal

    from sarnic.data.marketdata import MarketDataService
    from sarnic.db.models import OHLCV, DataQualityReport

    baslangic = utc(2026, 8, 15, 0)
    api_session.add(
        DataQualityReport(
            kind="gap",
            symbol="ESKIUSDT",
            timeframe="1h",
            severity="ERROR",
            resolved=False,
            fingerprint=baslangic.isoformat(),
            detail={
                "start": baslangic.isoformat(),
                "end": utc(2026, 8, 15, 3).isoformat(),
                "missing_bars": 4,
            },
        )
    )
    # Aynı aralıkta hâlâ eksik olan ikinci bir bulgu — kapanmamalı.
    api_session.add(
        DataQualityReport(
            kind="gap",
            symbol="EKSIKUSDT",
            timeframe="1h",
            severity="ERROR",
            resolved=False,
            fingerprint=baslangic.isoformat(),
            detail={
                "start": baslangic.isoformat(),
                "end": utc(2026, 8, 15, 3).isoformat(),
                "missing_bars": 4,
            },
        )
    )
    for saat in range(4):  # boşluk yalnızca ESKIUSDT için dolduruldu
        api_session.add(
            OHLCV(
                symbol="ESKIUSDT",
                timeframe="1h",
                open_time=utc(2026, 8, 15, saat),
                open=Decimal("1"),
                high=Decimal("1"),
                low=Decimal("1"),
                close=Decimal("1"),
                volume=Decimal("1"),
                quote_volume=Decimal("1"),
            )
        )
    await api_session.commit()

    service = MarketDataService.__new__(MarketDataService)
    await service.verify_open_gaps()

    # `verify_open_gaps` kendi oturumunda yazar; buradaki oturumun önbelleği
    # tazelenmezse eski hâli okunur.
    api_session.expire_all()
    rows = (
        (
            await api_session.execute(
                select(DataQualityReport).where(
                    DataQualityReport.symbol.in_(["ESKIUSDT", "EKSIKUSDT"])
                )
            )
        )
        .scalars()
        .all()
    )
    durum = {r.symbol: r.resolved for r in rows}
    assert durum["ESKIUSDT"] is True
    assert durum["EKSIKUSDT"] is False
