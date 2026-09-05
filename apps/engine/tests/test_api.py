"""API uç testleri — §15.

Uçlar bugüne kadar hiç test edilmemişti ve kusurlar ancak canlı sistemde,
kullanıcı şikâyet ettiğinde ortaya çıkıyordu:

* §9.12 — `/symbols/{sembol}/patterns` her sembolde 500 veriyordu
  (`numpy.bool_` serileştirilemez).
* §9.14 — `/scores` iki puanlama konfigürasyonunu karıştırıyor, 45 sembol için
  90 satır döndürüyordu.
* Kalibrasyon ucu gözlem yokken **eksik** gövde döndürüyor, panel çöküyordu.

Buradaki testler o kusurları geriye dönük kilitler. Hepsi ayrı bir test
veritabanında çalışır (`tests/conftest.py` → `api_engine`).
"""

from __future__ import annotations

from datetime import timedelta
from decimal import Decimal

import pytest

from sarnic.core.enums import BotMode, BotState, PositionStatus
from sarnic.db.models import Bot, EquityPoint, Position, Score, Strategy, StrategyVersion, Trade
from sarnic.strategy.definition import StrategyDefinition
from tests.conftest import utc


# --------------------------------------------------------------------------- #
#  Yardımcılar
# --------------------------------------------------------------------------- #
async def make_bot(session, name: str, *, weights: dict | None = None, bot_id: int | None = None):
    """Bir strateji sürümü ve ona bağlı bir bot yaratır."""
    definition = StrategyDefinition()
    if weights:
        definition.scoring.weights = {**definition.scoring.weights, **weights}

    strategy = Strategy(name=name)
    session.add(strategy)
    await session.flush()

    version = StrategyVersion(
        strategy_id=strategy.id,
        version=1,
        definition=definition.to_dict(),
        definition_hash=definition.hash(),
        frozen=True,
    )
    session.add(version)
    await session.flush()

    bot = Bot(
        id=bot_id,
        name=name,
        strategy_version_id=version.id,
        mode=BotMode.PAPER,
        state=BotState.PAPER_RUNNING,
        timeframe="1h",
        capital=Decimal("5000"),
        cash=Decimal("5000"),
        equity_peak=Decimal("5000"),
    )
    session.add(bot)
    await session.flush()
    return bot, definition


def config_hash_of(definition: StrategyDefinition) -> str:
    from sarnic.scoring.engine import ScoringEngine

    return ScoringEngine(
        weights=definition.scoring.weights,
        use_pattern=definition.scoring.modifiers.get("pattern", True),
        use_candle=definition.scoring.modifiers.get("candle", True),
        use_crowding=definition.scoring.modifiers.get("crowding", True),
    ).config_hash()


def make_score(symbol: str, config_hash: str, score: float, bar=utc(2026, 8, 16, 0)):
    return Score(
        symbol=symbol,
        bar_time=bar,
        timeframe="1h",
        score=Decimal(str(score)),
        families={"trend": 20.0, "momentum": 15.0, "vol": 10.0, "flow": 5.0, "sr": 2.0},
        modifiers={"pattern": 0.0, "crowding": 0.0},
        rationale={"top_drivers": []},
        config_hash=config_hash,
    )


# --------------------------------------------------------------------------- #
#  Kimlik doğrulama
# --------------------------------------------------------------------------- #
async def test_endpoint_requires_authentication(api_client):
    response = await api_client.get("/positions")
    assert response.status_code == 401


async def test_health_is_public(api_client):
    assert (await api_client.get("/health")).status_code == 200


async def test_authenticated_request_succeeds(api_client, auth):
    response = await api_client.get("/positions", headers=auth)
    assert response.status_code == 200
    assert response.json() == []


# --------------------------------------------------------------------------- #
#  §9.14 — /scores konfigürasyonları karıştırmamalı
# --------------------------------------------------------------------------- #
@pytest.fixture
async def two_configs(api_session):
    """İki farklı puanlama konfigürasyonu, aynı sembolleri puanlamış."""
    base_bot, base_def = await make_bot(api_session, "taban")
    trend_bot, trend_def = await make_bot(
        api_session, "trend ağırlıklı", weights={"trend": 40.0, "momentum": 15.0}
    )
    base_hash = config_hash_of(base_def)
    trend_hash = config_hash_of(trend_def)
    assert base_hash != trend_hash, "iki konfigürasyon gerçekten farklı olmalı"

    for symbol, base_score, trend_score in [
        ("BTCUSDT", 70.0, 75.0),
        ("ETHUSDT", 65.0, 60.0),
        ("SOLUSDT", 80.0, 72.0),
    ]:
        api_session.add(make_score(symbol, base_hash, base_score))
        api_session.add(make_score(symbol, trend_hash, trend_score))
    await api_session.commit()
    return {"base": (base_bot, base_hash), "trend": (trend_bot, trend_hash)}


async def test_scores_returns_one_row_per_symbol(api_client, auth, two_configs):
    """Asıl regresyon: 3 sembol → 3 satır, 6 değil.

    Karıştırıldığında React `Encountered two children with the same key`
    uyarısı veriyor, panel "6 sembol" yazıyor ve sıralama anlamsızlaşıyordu.
    """
    rows = (await api_client.get("/scores", headers=auth)).json()

    symbols = [r["symbol"] for r in rows]
    assert len(symbols) == len(set(symbols)) == 3
    assert len({r["config_hash"] for r in rows}) == 1


async def test_scores_filter_by_config_hash(api_client, auth, two_configs):
    _, trend_hash = two_configs["trend"]
    rows = (
        await api_client.get("/scores", headers=auth, params={"config_hash": trend_hash})
    ).json()

    assert {r["config_hash"] for r in rows} == {trend_hash}
    assert next(r["score"] for r in rows if r["symbol"] == "BTCUSDT") == pytest.approx(75.0)


async def test_score_configs_lists_and_labels_each_config(api_client, auth, two_configs):
    configs = (await api_client.get("/scores/configs", headers=auth)).json()

    assert len(configs) == 2
    labels = {c["label"] for c in configs}
    assert labels == {"taban", "trend ağırlıklı"}
    assert all(c["symbols"] == 3 for c in configs)
    # Sıra bot kimliğine göre; ilki panelin varsayılanı.
    assert configs[0]["label"] == "taban"


async def test_score_detail_matches_the_listed_config(api_client, auth, two_configs):
    """Tabloda tıklanan puan ile kartta yazan sayı **aynı** olmalı."""
    listed = (await api_client.get("/scores", headers=auth)).json()
    listed_score = next(r["score"] for r in listed if r["symbol"] == "BTCUSDT")

    detail = (await api_client.get("/scores/BTCUSDT", headers=auth)).json()
    assert detail["score"] == pytest.approx(listed_score)


async def test_score_detail_honours_explicit_config(api_client, auth, two_configs):
    _, trend_hash = two_configs["trend"]
    detail = (
        await api_client.get("/scores/BTCUSDT", headers=auth, params={"config_hash": trend_hash})
    ).json()
    assert detail["score"] == pytest.approx(75.0)


async def test_score_history_does_not_mix_configs(api_client, auth, two_configs):
    """Her bar için tek nokta — iki seri arasında zikzak yapmamalı."""
    points = (await api_client.get("/scores/BTCUSDT/history", headers=auth)).json()
    assert len(points) == len({p["bar_time"] for p in points})


async def test_scores_empty_when_no_data(api_client, auth):
    assert (await api_client.get("/scores", headers=auth)).json() == []
    assert (await api_client.get("/scores/configs", headers=auth)).json() == []


# --------------------------------------------------------------------------- #
#  Kalibrasyon — gövde her zaman tam olmalı
# --------------------------------------------------------------------------- #
REPORT_KEYS = {
    "horizon",
    "n",
    "span_days",
    "sufficient",
    "deciles",
    "spearman",
    "spearman_p",
    "rolling_spearman",
    "family_ic",
    "ic_series",
    "monotonic",
    "top_minus_bottom",
    "verdict",
}


async def test_calibration_returns_full_shape_when_empty(api_client, auth):
    """Gözlem yokken de tam gövde döner.

    Eski sürüm beş alanlık kısa devre gövdesi döndürüyor, panel
    `rolling_spearman.filter(...)` çağırınca çöküyordu — sistemin dürüstlük
    organı olan sayfa hiç açılmıyordu.
    """
    body = (await api_client.get("/calibration", headers=auth)).json()

    assert set(body) >= REPORT_KEYS
    assert body["n"] == 0
    assert body["deciles"] == []
    assert body["rolling_spearman"] == []
    assert body["sufficient"] is False
    assert "gözlem" in body["verdict"].lower()


async def test_calibration_rejects_unknown_horizon(api_client, auth):
    response = await api_client.get("/calibration", headers=auth, params={"horizon": "13h"})
    assert response.status_code == 400


# --------------------------------------------------------------------------- #
#  Portföy — özsermaye, kıyas, maliyet
# --------------------------------------------------------------------------- #
@pytest.fixture
async def two_bots_with_equity(api_session):
    a, _ = await make_bot(api_session, "bot-a")
    b, _ = await make_bot(api_session, "bot-b")
    for bot, values in ((a, [5000, 5100, 5200]), (b, [5000, 4900, 5050])):
        for index, value in enumerate(values):
            api_session.add(
                EquityPoint(
                    bot_id=bot.id,
                    at=utc(2026, 8, 16, index),
                    equity=Decimal(str(value)),
                    cash=Decimal(str(value)),
                    exposure=Decimal("0"),
                    open_positions=0,
                )
            )
    await api_session.commit()
    return a, b


async def test_equity_returns_per_bot_and_total(api_client, auth, two_bots_with_equity):
    body = (await api_client.get("/portfolio/equity", headers=auth)).json()

    assert len(body["bots"]) == 2
    assert [p["equity"] for p in body["total"]] == [10000.0, 10000.0, 10250.0]


async def test_equity_total_forward_fills_missing_points(api_client, auth, api_session):
    """Bir bot bir barı kaçırırsa portföy **düşmemeli**."""
    a, _ = await make_bot(api_session, "bot-a")
    b, _ = await make_bot(api_session, "bot-b")
    api_session.add_all(
        [
            EquityPoint(
                bot_id=a.id,
                at=utc(2026, 8, 16, hour),
                equity=Decimal("5000"),
                cash=Decimal("5000"),
                exposure=Decimal("0"),
                open_positions=0,
            )
            for hour in (0, 1, 2)
        ]
        + [
            EquityPoint(
                bot_id=b.id,
                at=utc(2026, 8, 16, 0),
                equity=Decimal("5000"),
                cash=Decimal("5000"),
                exposure=Decimal("0"),
                open_positions=0,
            )
        ]
    )
    await api_session.commit()

    body = (await api_client.get("/portfolio/equity", headers=auth)).json()
    assert [p["equity"] for p in body["total"]] == [10000.0, 10000.0, 10000.0]


async def test_costs_reports_gross_net_and_ratio(api_client, auth, api_session):
    bot, _ = await make_bot(api_session, "bot-a")
    position = Position(
        bot_id=bot.id,
        symbol="BTCUSDT",
        qty=Decimal("1"),
        entry_price=Decimal("90"),
        entry_time=utc(2026, 8, 16, 0),
        stop=Decimal("85"),
        initial_stop=Decimal("85"),
        score_at_entry=Decimal("75"),
        status=PositionStatus.CLOSED,
        entry_fees=Decimal("0"),
        mfe=Decimal("0"),
        mae=Decimal("0"),
    )
    api_session.add(position)
    await api_session.flush()
    api_session.add_all(
        [
            Trade(
                bot_id=bot.id,
                symbol="BTCUSDT",
                position_id=position.id,
                exit_price=Decimal("100"),
                exit_time=utc(2026, 8, 16, 1),
                exit_reason="TRAILING",
                pnl=Decimal("90"),
                pnl_r=Decimal("1.5"),
                fees=Decimal("10"),
                slippage_bps=Decimal("12"),
                mfe=Decimal("0"),
                mae=Decimal("0"),
                hold_hours=Decimal("4"),
            )
        ]
    )
    await api_session.commit()

    body = (await api_client.get("/portfolio/costs", headers=auth)).json()
    assert body["trades"] == 1
    assert body["net_pnl"] == pytest.approx(90.0)
    # Brüt = net + komisyon; maliyet payı brüt kâra oranıdır.
    assert body["gross_pnl"] == pytest.approx(100.0)
    assert body["cost_ratio"] == pytest.approx(0.1)
    assert body["avg_slippage_bps"] == pytest.approx(12.0)


async def test_costs_empty_without_trades(api_client, auth):
    body = (await api_client.get("/portfolio/costs", headers=auth)).json()
    assert body["trades"] == 0
    assert body["cost_ratio"] is None


async def test_benchmark_flags_insufficient_sample(api_client, auth, two_bots_with_equity):
    """Üç saatlik veriyle "strateji çalışıyor" denemez — panel bunu söylemeli."""
    body = (await api_client.get("/portfolio/benchmark", headers=auth)).json()

    assert body["sufficient"] is False
    assert "yetersiz" in body["verdict"].lower()
    assert body["span_days"] < 1


async def test_benchmark_without_equity_is_not_an_error(api_client, auth):
    body = (await api_client.get("/portfolio/benchmark", headers=auth)).json()
    assert body["benchmark"] == []
    assert body["start"] is None


# --------------------------------------------------------------------------- #
#  Pozisyonlar — bot ataması taşınmalı
# --------------------------------------------------------------------------- #
async def test_positions_carry_bot_id(api_client, auth, api_session):
    """Üç bot aynı sembolü açabilir; hangi satırın kime ait olduğu taşınmazsa
    tablo veriyi tekrarlanmış gibi gösterir."""
    a, _ = await make_bot(api_session, "bot-a")
    b, _ = await make_bot(api_session, "bot-b")
    for bot in (a, b):
        api_session.add(
            Position(
                bot_id=bot.id,
                symbol="BTCUSDT",
                qty=Decimal("1"),
                entry_price=Decimal("100"),
                entry_time=utc(2026, 8, 16, 0),
                stop=Decimal("95"),
                initial_stop=Decimal("95"),
                score_at_entry=Decimal("75"),
                status=PositionStatus.OPEN,
                entry_fees=Decimal("0"),
                mfe=Decimal("0"),
                mae=Decimal("0"),
            )
        )
    await api_session.commit()

    rows = (await api_client.get("/positions", headers=auth)).json()
    assert len(rows) == 2
    assert {r["bot_id"] for r in rows} == {a.id, b.id}


# --------------------------------------------------------------------------- #
#  §9.12 — numpy tipleri serileştirmeyi bozmamalı
# --------------------------------------------------------------------------- #
async def test_patterns_endpoint_serialises_without_numpy_types(api_client, auth, api_session):
    """`numpy.bool_` yüzünden bu uç **her sembolde** 500 veriyordu.

    Veri yoksa 404 beklenir; hangi olursa olsun 500 **olmamalı**.
    """
    response = await api_client.get("/symbols/BTCUSDT/patterns", headers=auth)
    assert response.status_code != 500
    assert response.status_code == 404


async def test_system_status_is_serialisable(api_client, auth):
    assert (await api_client.get("/system/status", headers=auth)).status_code == 200


async def test_load_frames_respects_explicit_start(api_session):
    """`start` verildiğinde alt sınır doğrudan odur — `limit`'ten türetilmez.

    Kıyas ucu 23 barlık pencere için 5.000 bar çekiyordu (44 sembolde ~208
    gün) ve 1,4 saniye sürüyordu. Bu test, dar pencerenin sorguda kaldığını
    doğrular.
    """
    from sarnic.data.binance import Kline
    from sarnic.data.store import load_frames, upsert_klines

    bars = [
        Kline(
            symbol="BTCUSDT",
            timeframe="1h",
            open_time=utc(2026, 8, 16, hour),
            open=100.0,
            high=101.0,
            low=99.0,
            close=100.0 + hour,
            volume=10.0,
            quote_volume=1000.0,
            trades=5,
            taker_buy_base=5.0,
            taker_buy_quote=500.0,
            is_closed=True,
        )
        for hour in range(10)
    ]
    await upsert_klines(api_session, bars)
    await api_session.commit()

    wide = await load_frames(api_session, ["BTCUSDT"], "1h", end=utc(2026, 8, 16, 9), limit=5000)
    narrow = await load_frames(
        api_session,
        ["BTCUSDT"],
        "1h",
        start=utc(2026, 8, 16, 7),
        end=utc(2026, 8, 16, 9),
        limit=5000,
    )

    assert len(wide["BTCUSDT"]) == 10
    assert len(narrow["BTCUSDT"]) == 3
    assert narrow["BTCUSDT"]["open_time"].min().hour == 7


# --------------------------------------------------------------------------- #
#  Veri kalitesi — onarılan bulgu kapatılmalı
# --------------------------------------------------------------------------- #
async def test_data_quality_can_filter_unresolved(api_client, auth, api_session):
    """Panel yalnızca **açık** bulguları göstermeli.

    Boşluklar otomatik onarılıyor ama `resolved` alanı hiçbir yerde
    doldurulmuyordu; panel saatler önce kapanmış 37 boşluğu güncel sorunmuş
    gibi listeliyordu.
    """
    from sarnic.db.models import DataQualityReport

    api_session.add_all(
        [
            DataQualityReport(
                kind="gap",
                symbol="BTCUSDT",
                timeframe="1h",
                severity="WARN",
                resolved=True,
                detail={"missing_bars": 3},
            ),
            DataQualityReport(
                kind="sanity",
                symbol="ETHUSDT",
                timeframe="1h",
                severity="ERROR",
                resolved=False,
                detail={},
            ),
        ]
    )
    await api_session.commit()

    hepsi = (await api_client.get("/data-quality", headers=auth)).json()
    acik = (
        await api_client.get("/data-quality", headers=auth, params={"unresolved_only": "true"})
    ).json()

    assert len(hepsi) == 2
    assert [r["symbol"] for r in acik] == ["ETHUSDT"]


async def test_clean_audit_closes_earlier_gaps(api_session, test_database):
    """Temiz bir denetim, eski boşlukların kapandığının kanıtıdır."""
    from sarnic.data.marketdata import MarketDataService
    from sarnic.db.models import DataQualityReport

    # İki **farklı** boşluk: aynı sembolde ayrı zamanlarda kesilmiş veri.
    # Birebir aynı iki açık bulgu artık şema düzeyinde yasak (`uq_quality_open`,
    # `SYSTEM-REVIEW` §4b), bu yüzden kimlikleri ayrı olmak zorunda.
    api_session.add_all(
        [
            DataQualityReport(
                kind="gap",
                symbol="BTCUSDT",
                timeframe="1h",
                resolved=False,
                detail={"start": "2026-06-01T00:00:00+00:00"},
                fingerprint="2026-06-01T00:00:00+00:00",
            ),
            DataQualityReport(
                kind="gap",
                symbol="BTCUSDT",
                timeframe="1h",
                resolved=False,
                detail={"start": "2026-06-05T00:00:00+00:00"},
                fingerprint="2026-06-05T00:00:00+00:00",
            ),
            # Başka sembol ve başka tür etkilenmemeli.
            DataQualityReport(
                kind="gap",
                symbol="ETHUSDT",
                timeframe="1h",
                resolved=False,
                detail={"start": "2026-06-01T00:00:00+00:00"},
                fingerprint="2026-06-01T00:00:00+00:00",
            ),
            DataQualityReport(
                kind="sanity",
                symbol="BTCUSDT",
                timeframe="1h",
                resolved=False,
                detail={"open_time": "2026-06-01T00:00:00+00:00"},
                fingerprint="2026-06-01T00:00:00+00:00",
            ),
        ]
    )
    await api_session.commit()

    service = MarketDataService()
    closed = await service.close_resolved_gaps("BTCUSDT", "1h")
    assert closed == 2

    from sqlalchemy import select

    api_session.expire_all()
    rows = (await api_session.execute(select(DataQualityReport))).scalars().all()
    kapali = {(r.symbol, r.kind) for r in rows if r.resolved}
    assert kapali == {("BTCUSDT", "gap")}


# --------------------------------------------------------------------------- #
#  Giriş deneme sınırlaması
# --------------------------------------------------------------------------- #
async def test_login_is_rate_limited(api_client, api_session):
    """Panel dışarı açıkken parola denemesi sınırsız olamaz."""
    from sarnic.api.routes import auth as auth_routes

    auth_routes._ATTEMPTS.clear()
    codes = []
    for _ in range(auth_routes.MAX_ATTEMPTS + 2):
        r = await api_client.post(
            "/auth/login", json={"email": "yok@sarnic.local", "password": "yanlis"}
        )
        codes.append(r.status_code)
    assert 429 in codes, "sınırsız deneme yapılabiliyor"
    assert codes.count(401) == auth_routes.MAX_ATTEMPTS
    auth_routes._ATTEMPTS.clear()


async def test_successful_login_clears_attempt_counter(api_client, api_session):
    """Doğru parola sayacı sıfırlar; normal kullanıcı kilide takılmamalı."""
    from sarnic.api.routes import auth as auth_routes
    from sarnic.core.security import hash_password
    from sarnic.db.models import User

    auth_routes._ATTEMPTS.clear()
    api_session.add(
        User(
            email="kilit@sarnic.local",
            password_hash=hash_password("dogru-parola"),
            role="TRADER",
            display_name="Kilit",
            totp_secret="JBSWY3DPEHPK3PXP",
            totp_enabled=True,
        )
    )
    await api_session.commit()

    for _ in range(auth_routes.MAX_ATTEMPTS - 1):
        await api_client.post(
            "/auth/login", json={"email": "kilit@sarnic.local", "password": "yanlis"}
        )
    ok = await api_client.post(
        "/auth/login", json={"email": "kilit@sarnic.local", "password": "dogru-parola"}
    )
    assert ok.status_code == 200

    # Sayaç sıfırlandığı için yeniden tam kota var.
    again = await api_client.post(
        "/auth/login", json={"email": "kilit@sarnic.local", "password": "yanlis"}
    )
    assert again.status_code == 401
    auth_routes._ATTEMPTS.clear()


async def test_score_lookup_is_unique_per_timeframe(api_session):
    """Aynı ayarla çalışan iki dilim, aynı barda çakışmamalı.

    `_open_position` puan kaydını (sembol, bar, ayar) üçlüsüyle arıyordu.
    15m ve 30m botlar aynı `config_hash`'i paylaşıyor ve 16:00 hem 15m hem 30m
    barı olduğu için sorgu iki satır döndürüyor, `MultipleResultsFound` ile
    worker çöküyordu. Kimlik dörtlüdür: dilim de dahil.
    """
    from sqlalchemy import select

    from sarnic.db.models import Score

    bar = utc(2026, 8, 18, 16)
    for tf in ("15m", "30m"):
        row = make_score("BTCUSDT", "ayni-hash", 75.0, bar=bar)
        row.timeframe = tf
        api_session.add(row)
    await api_session.commit()

    # Dilimsiz sorgu iki satır görür — eski kusurun ta kendisi.
    both = (
        (
            await api_session.execute(
                select(Score.id).where(
                    Score.symbol == "BTCUSDT",
                    Score.bar_time == bar,
                    Score.config_hash == "ayni-hash",
                )
            )
        )
        .scalars()
        .all()
    )
    assert len(both) == 2

    # Dilimle sorgu tek satır döndürmeli.
    one = (
        await api_session.execute(
            select(Score.id).where(
                Score.symbol == "BTCUSDT",
                Score.bar_time == bar,
                Score.config_hash == "ayni-hash",
                Score.timeframe == "30m",
            )
        )
    ).scalar_one_or_none()
    assert one is not None


async def test_loss_streak_stops_at_strategy_version_boundary(api_session):
    """Zarar serisi yalnızca tek bir kural kümesi içinde anlamlıdır.

    Sayaç botun *tüm* işlemlerine bakıyordu. Stop ayarı düzeltildiğinde eski
    dar-stop ayarının kayıpları sayaçta durduğu için yeni ayar daha ilk barında
    devre kesiciye takıldı ve 6 saat duraklatıldı — yeni kural, eski kuralın
    hatalarıyla cezalandırıldı.
    """
    from decimal import Decimal

    from sqlalchemy import select

    from sarnic.bots.portfolio import consecutive_losses
    from sarnic.db.models import Position, Trade

    bot, _ = await make_bot(api_session, "seri")
    eski_surum = bot.strategy_version_id

    # Ayar düzeltilir: stop genişletilir, yeni bir sürüm dondurulur.
    yeni = StrategyVersion(
        strategy_id=(
            await api_session.execute(
                select(StrategyVersion.strategy_id).where(StrategyVersion.id == eski_surum)
            )
        ).scalar_one(),
        version=2,
        definition={"stop_atr_multiple": 2.0},
        definition_hash="seri-v2",
        frozen=True,
    )
    api_session.add(yeni)
    await api_session.flush()
    yeni_surum = yeni.id
    bot.strategy_version_id = yeni_surum

    async def kapat(pnl: float, version: int | None, saat: int) -> None:
        pos = Position(
            bot_id=bot.id,
            symbol="XUSDT",
            side="BUY",
            qty=Decimal("1"),
            entry_price=Decimal("100"),
            entry_time=utc(2026, 8, 18, saat),
            stop=Decimal("90"),
            initial_stop=Decimal("90"),
            score_at_entry=Decimal("75"),
            status="CLOSED",
        )
        api_session.add(pos)
        await api_session.flush()
        api_session.add(
            Trade(
                position_id=pos.id,
                bot_id=bot.id,
                symbol="XUSDT",
                exit_price=Decimal("95"),
                exit_time=utc(2026, 8, 18, saat),
                exit_reason="STOP",
                pnl=Decimal(str(pnl)),
                strategy_version_id=version,
            )
        )

    # Eski sürümde üç kayıp, yeni sürümde bir kayıp.
    for i in range(3):
        await kapat(-10.0, eski_surum, 10 + i)
    await kapat(-10.0, yeni_surum, 20)
    await api_session.commit()

    # Sürüm filtresi olmadan seri dört görünür — eski kusur.
    assert await consecutive_losses(api_session, bot.id) == 4
    # Yeni sürümle sınırlandığında yalnızca kendi kaybını sayar.
    assert await consecutive_losses(api_session, bot.id, strategy_version_id=yeni_surum) == 1


# --------------------------------------------------------------------------- #
#  Çok zaman dilimli sıralamalar
# --------------------------------------------------------------------------- #
@pytest.fixture
async def multi_timeframe_scores(api_session):
    """Aynı ağırlıklar, iki farklı karar zaman dilimi.

    15 dakikalık bot eklendiğinde ortaya çıkan durum: aynı `config_hash`,
    farklı `timeframe`, ve 15m barı her zaman 1h barından daha yeni.
    """
    _, definition = await make_bot(api_session, "saatlik")
    hizli, _ = await make_bot(api_session, "on beş dakika")
    hizli.timeframe = "15m"
    cfg = config_hash_of(definition)

    for symbol in ("AUSDT", "BUSDT", "CUSDT"):
        api_session.add(make_score(symbol, cfg, 70.0, bar=utc(2026, 8, 16, 5)))
    # 15m barı daha yeni — küresel "son bar" bu olur.
    for symbol in ("XUSDT", "YUSDT"):
        row = make_score(symbol, cfg, 60.0, bar=utc(2026, 8, 16, 5))
        row.bar_time = utc(2026, 8, 16, 5).replace(minute=45)
        row.timeframe = "15m"
        api_session.add(row)
    await api_session.commit()
    return cfg


async def test_score_configs_separates_timeframes(api_client, auth, multi_timeframe_scores):
    """Saatlik sıralama, 15 dakikalık bar daha yeni diye kaybolmamalı.

    Son bar küresel olarak aranıyordu: 05:45'te 15m barı varken 1h barı
    05:00'daydı ve saatlik konfigürasyonlar hiç listelenmedi. Kullanıcı saatlik
    havuza baktığını sanarken 15 dakikalık puanları görüyordu.
    """
    configs = (await api_client.get("/scores/configs", headers=auth)).json()

    assert {c["timeframe"] for c in configs} == {"1h", "15m"}
    saatlik = next(c for c in configs if c["timeframe"] == "1h")
    hizli = next(c for c in configs if c["timeframe"] == "15m")
    assert saatlik["symbols"] == 3
    assert hizli["symbols"] == 2
    assert saatlik["bar_time"] != hizli["bar_time"]


async def test_config_identity_is_hash_plus_timeframe(api_client, auth, multi_timeframe_scores):
    """Aynı hash iki kez listelenir; ayıran şey zaman dilimidir."""
    configs = (await api_client.get("/scores/configs", headers=auth)).json()
    assert len({c["config_hash"] for c in configs}) == 1
    assert len({(c["config_hash"], c["timeframe"]) for c in configs}) == 2


async def test_scores_uses_the_last_bar_of_the_selected_timeframe(
    api_client, auth, multi_timeframe_scores
):
    rows = (
        await api_client.get(
            "/scores",
            headers=auth,
            params={"config_hash": multi_timeframe_scores, "timeframe": "1h"},
        )
    ).json()
    assert {r["symbol"] for r in rows} == {"AUSDT", "BUSDT", "CUSDT"}


async def test_calibration_reports_the_traded_region_separately(api_client, auth, api_session):
    """Dağılım geneli düz olsa bile kapının üstü çalışıyor olabilir.

    Spearman ve üst-alt desil farkı tüm dağılıma bakar; sistem yalnızca giriş
    kapısının üstünü alır. Ölçüldü: 60 günlük örnekte Spearman +0,014
    ("ilişki yok") çıkarken puanı ≥ 80 olanlar havuzu 72 saatte +%3,96 geçiyordu
    (t=+3,3). Panel bunu söylemezse çalışan bir kenarı "öngörü yok" diye
    raporluyor demektir — dürüstlük organının tam tersi.
    """
    from sarnic.db.models import ScoreObservation

    # Bot, kapının (`min_score`) nereden okunduğunu belirler: kalibrasyon
    # sabit bir sayı değil, çalışan botların gerçek eşiğini kullanır.
    await make_bot(api_session, "kapı")
    await api_session.flush()

    # Her barda 10 sembol: kapının üstündekiler sistematik olarak daha iyi.
    # Yeterlilik eşiği: 500 gözlem ve 30 gün. Altında kalırsa rapor hüküm
    # vermez ve haklı olarak vermemeli — kapı ölçümü de bir iddiadır.
    cfg = "kapi-testi"
    for adim in range(70):
        bar = utc(2026, 7, 1, 0) + timedelta(hours=12 * adim)
        saat = adim
        gurultu = [round(((saat * 7 + i * 3) % 11 - 5) / 1000, 4) for i in range(10)]
        for i in range(10):
            yuksek = i >= 8
            puan = Decimal("85") if yuksek else Decimal("50")
            row = make_score(f"S{i}USDT", cfg, float(puan), bar=bar)
            api_session.add(row)
            await api_session.flush()
            api_session.add(
                ScoreObservation(
                    score_id=row.id,
                    symbol=row.symbol,
                    bar_time=bar,
                    score=puan,
                    families={},
                    # Gürültü olmadan farkların varyansı sıfır olur ve t
                    # hesaplanamaz; gerçek veri hiç böyle değildir.
                    fwd_return_24h=Decimal(str((0.03 if yuksek else 0.0) + gurultu[i])),
                )
            )
    await api_session.commit()

    report = (await api_client.get("/calibration", headers=auth, params={"horizon": "24h"})).json()

    assert report["gate"] == 80.0
    assert report["gate_n"] >= 20
    assert report["gate_edge"] > 0.02, "kapı üstü havuzu açıkça geçiyor"
    assert report["gate_edge_t"] > 2.0
    assert "işlem yaptığı bölge" in report["verdict"]


# --------------------------------------------------------------------------- #
#  Bot düzenleme — strateji sürümü değiştirme
# --------------------------------------------------------------------------- #
async def test_bot_patch_swaps_frozen_strategy_version(api_client, auth, api_session):
    """Duran bir botun kural seti, geçmişi bölünmeden değiştirilebilmeli."""
    bot, _ = await make_bot(api_session, "sürüm-degis")
    hedef, _ = await make_bot(api_session, "hedef-surum")
    bot.state = BotState.STOPPED
    await api_session.commit()

    response = await api_client.patch(
        f"/bots/{bot.id}",
        json={"strategy_version_id": hedef.strategy_version_id},
        headers=auth,
    )

    assert response.status_code == 200
    await api_session.refresh(bot)
    assert bot.strategy_version_id == hedef.strategy_version_id


async def test_bot_patch_rejects_draft_strategy_version(api_client, auth, api_session):
    """Taslak sürüm altımızdan değişebilir; bağlanırsa bot hangi kurallarla
    işlem yaptığı geriye dönük belirsizleşir."""
    bot, _ = await make_bot(api_session, "taslak-red")
    taslak_bot, _ = await make_bot(api_session, "taslak-surum")
    taslak = await api_session.get(StrategyVersion, taslak_bot.strategy_version_id)
    taslak.frozen = False
    bot.state = BotState.STOPPED
    await api_session.commit()

    response = await api_client.patch(
        f"/bots/{bot.id}", json={"strategy_version_id": taslak.id}, headers=auth
    )

    assert response.status_code == 409


async def test_bot_patch_rejects_unknown_field(api_client, auth, api_session):
    """Tanınmayan alan sessizce yutulmamalı.

    Yutulduğunda çağıran 200 görür ve değişikliğin uygulandığını sanır — bu
    ucun kendisinde bir kez yaşandı ve fark edilmesi saatler aldı.
    """
    bot, _ = await make_bot(api_session, "bilinmeyen-alan")
    bot.state = BotState.STOPPED
    await api_session.commit()

    response = await api_client.patch(f"/bots/{bot.id}", json={"timeframe": "4h"}, headers=auth)

    assert response.status_code == 422


@pytest.mark.asyncio
async def test_attention_giris_yasagini_ve_akislari_listeler(api_client, api_session, auth):
    """/system/status bot 4 yasaktayken 'alarm 0' diyordu. Dikkat ucu yasağı
    listeler, üç pazar akışını raporlar ve filo sayacını verir."""
    from datetime import UTC, datetime, timedelta

    bot, _ = await make_bot(api_session, "yasakli")
    bot.entries_blocked_until = datetime.now(UTC) + timedelta(hours=5)
    bot.last_heartbeat_at = datetime.now(UTC)
    await api_session.flush()

    res = await api_client.get("/system/attention", headers=auth)
    assert res.status_code == 200, res.text
    body = res.json()
    kinds = {i["kind"] for i in body["items"]}
    assert "entries_blocked" in kinds
    assert [f["market"] for f in body["feeds"]] == ["CRYPTO", "BIST", "US"]
    assert body["fleet"]["blocked"] == 1 and body["fleet"]["running"] == 1
    # Seviye sırası: CRITICAL önce (boş depoda kripto akışı 'bayat' → CRITICAL başta).
    seviyeler = [i["level"] for i in body["items"]]
    assert seviyeler == sorted(seviyeler, key={"CRITICAL": 0, "WARN": 1, "INFO": 2}.get)

    tek = (await api_client.get(f"/bots/{bot.id}", headers=auth)).json()
    assert tek.get("entries_blocked_until"), tek


# --------------------------------------------------------------------------- #
#  /bots/fleet — Köprü'nün filo defteri tek uçtan
# --------------------------------------------------------------------------- #
async def test_fleet_bos_filoda_liste_doner(api_client, auth):
    response = await api_client.get("/bots/fleet", headers=auth)
    assert response.status_code == 200
    assert isinstance(response.json(), list)


async def test_fleet_satiri_islem_istatistigi_ve_pencereleri_tasir(api_client, auth, api_session):
    """Bir bot, biri kârlı biri zararlı iki kapanmış işlem; açık kısa pozisyon
    negatif değer taşır, maruziyet brüttür."""
    from datetime import UTC, datetime

    bot, _ = await make_bot(api_session, "filo-bot")
    bot.config = {"deney": True, "rebased_at": "2026-09-01T00:00:00+00:00"}
    simdi = datetime.now(UTC)
    for i, (pnl, pnl_r) in enumerate([(90.0, 1.5), (-30.0, -1.0)]):
        pos = Position(
            bot_id=bot.id,
            symbol=f"F{i}USDT",
            side="BUY",
            qty=Decimal("1"),
            entry_price=Decimal("100"),
            entry_time=simdi - timedelta(hours=5),
            stop=Decimal("90"),
            initial_stop=Decimal("90"),
            score_at_entry=Decimal("80"),
            status=PositionStatus.CLOSED,
        )
        api_session.add(pos)
        await api_session.flush()
        api_session.add(
            Trade(
                bot_id=bot.id,
                symbol=pos.symbol,
                position_id=pos.id,
                exit_price=Decimal("100"),
                # Gün başından sonra VE 24 saat içinde: aksi hâlde test gece
                # yarısı civarında koşunca 'bugün' ile '24 saat' pencereleri
                # ayrışır ve kod doğruyken kırılır.
                exit_time=max(
                    simdi - timedelta(hours=1 + i),
                    simdi.replace(hour=0, minute=0, second=0, microsecond=0)
                    + timedelta(minutes=1 + i),
                ),
                exit_reason="STOP",
                pnl=Decimal(str(pnl)),
                pnl_r=Decimal(str(pnl_r)),
                fees=Decimal("1"),
                slippage_bps=Decimal("5"),
                mfe=Decimal("0"),
                mae=Decimal("0"),
                hold_hours=Decimal("4"),
            )
        )
    # Açık kısa: 10 adet @ 50 → değer −500, maruziyet 500 (fiyat yok → giriş).
    api_session.add(
        Position(
            bot_id=bot.id,
            symbol="KISAUSDT",
            side="SELL",
            qty=Decimal("10"),
            entry_price=Decimal("50"),
            entry_time=simdi,
            stop=Decimal("55"),
            initial_stop=Decimal("55"),
            score_at_entry=Decimal("80"),
            leverage=Decimal("3"),
            status=PositionStatus.OPEN,
        )
    )
    await api_session.commit()

    rows = (await api_client.get("/bots/fleet", headers=auth)).json()
    satir = next(r for r in rows if r["id"] == bot.id)
    assert satir["group"] == "deney" and satir["deney"] is True
    assert satir["trades"] == 2 and satir["win_rate"] == pytest.approx(0.5)
    assert satir["avg_r"] == pytest.approx(0.25)
    assert satir["profit_factor"] == pytest.approx(3.0)
    assert satir["consecutive_losses"] == 0  # en yeni işlem kârlı
    assert satir["realized_since_rebase"] == pytest.approx(60.0)
    assert satir["realized_today"] == satir["realized_24h"] == satir["realized_7d"]
    assert (
        satir["open_positions"] == 1 and satir["open_short"] == 1 and satir["open_leveraged"] == 1
    )
    assert satir["exposure"] == pytest.approx(500.0)
    assert satir["equity"] == pytest.approx(5000.0 - 500.0)
    assert satir["return_pct"] == pytest.approx(-0.1)
    assert satir["rebased_at"].startswith("2026-09-01")


async def test_live_tl_ile_usd_yi_toplamiyor(api_client, auth, api_session):
    """BIST kolu TL, kalanı USD. İkisini toplamak anlamsız bir özsermaye üretiyordu
    (panel 2026-09-04'te 30.860 gösteriyordu: 10.314 USD + 19.232 TL)."""
    from decimal import Decimal

    from tests.test_api import make_bot

    usd, _ = await make_bot(api_session, "usd-kol")
    usd.capital = Decimal("400")
    usd.cash = Decimal("400")
    tl, _ = await make_bot(api_session, "bist-kol")
    await api_session.refresh(tl, attribute_names=["strategy_version"])
    tanim = dict(tl.strategy_version.definition or {})
    tanim["universe"] = {**(tanim.get("universe") or {}), "market": "BIST"}
    tl.strategy_version.definition = tanim
    tl.capital = Decimal("19232")
    tl.cash = Decimal("19232")
    await api_session.commit()

    veri = (await api_client.get("/portfolio/live", headers=auth)).json()
    assert veri["equity"] < 19232, "TL kolu USD toplamına karışmamalı"
    assert veri["try_equity"] == pytest.approx(19232.0)
    assert veri["try_capital"] == pytest.approx(19232.0)
    # Kol listesi yine ikisini de taşır; ayrım yalnız toplamlarda.
    assert {b["name"] for b in veri["bots"]} >= {"usd-kol", "bist-kol"}
