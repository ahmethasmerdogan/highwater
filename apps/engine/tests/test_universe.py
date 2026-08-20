"""Havuz motoru testleri — Faz 2 kabul kriteri.

* 12 filtre sırayla çalışıyor, huni her adımın elediğini raporluyor
* Aynı `config_hash` + aynı veri → aynı havuz (determinizm)
* Histerezis 100–120 bandında tutuyor, altında bırakıyor
* Kara listeye alınan sembol çıkıyor
"""

from __future__ import annotations

import json

import pytest

from sarnic.universe.filters import (
    Candidate,
    FunnelStep,
    TickSizeFilter,
    UniverseConfig,
    apply_hysteresis,
    is_leveraged_token,
    run_chain,
)


def candidate(symbol: str, **overrides) -> Candidate:
    """Tüm filtrelerden geçen sağlıklı bir aday; `overrides` ile bozulur."""
    base = {
        "base_asset": symbol.replace("USDT", ""),
        "quote_asset": "USDT",
        "status": "TRADING",
        "is_spot_allowed": True,
        "price": 100.0,
        "quote_volume": 1_000_000.0,
        "age_days": 365.0,
        "spread_pct": 0.05,
        "spread_samples": 12,
        "tick_size": 0.001,
        "volatility_ann_pct": 80.0,
        "range_3d_pct": 20.0,
        "delist_announced": False,
    }
    base.update(overrides)
    return Candidate(symbol=symbol, **base)


def pool(n: int = 150) -> list[Candidate]:
    return [candidate(f"C{i:03d}USDT", quote_volume=1_000_000.0 - i * 1000) for i in range(n)]


# --------------------------------------------------------------------------- #
#  Filtreler
# --------------------------------------------------------------------------- #
def test_chain_reports_every_step():
    result = run_chain(pool(150), UniverseConfig())
    assert len(result.funnel) == 12
    names = [s.name for s in result.funnel]
    assert names[0] == "MarketFilter"
    assert names[-1] == "TopNSelector"
    for step in result.funnel:
        assert step.kept >= 0
        assert step.dropped >= 0


def test_top_n_selects_exactly_n():
    result = run_chain(pool(150), UniverseConfig(top_n=100))
    assert len(result.selected) == 100
    # En yüksek hacimliler seçilmeli.
    assert result.selected[0].symbol == "C000USDT"


def test_market_filter_drops_non_trading():
    cands = [candidate("AUSDT"), candidate("BUSDT", status="BREAK")]
    result = run_chain(cands, UniverseConfig())
    assert {c.symbol for c in result.selected} == {"AUSDT"}
    assert result.funnel[0].dropped == 1
    assert "BUSDT" in result.funnel[0].dropped_symbols


def test_market_filter_drops_non_usdt_quote():
    cands = [candidate("AUSDT"), candidate("BBTC", quote_asset="BTC")]
    result = run_chain(cands, UniverseConfig())
    assert {c.symbol for c in result.selected} == {"AUSDT"}


@pytest.mark.parametrize(
    "asset,expected",
    [
        ("BTCUP", True),
        ("ETHDOWN", True),
        ("XRPBULL", True),
        ("ADABEAR", True),
        ("BTC3L", True),
        ("ETH3S", True),
        ("BTC", False),
        ("ETH", False),
        ("SOL", False),
        ("UNI", False),  # "UNI" içinde UP yok — yanlış pozitif olmamalı
        ("JUP", False),
    ],
)
def test_leveraged_token_detection(asset, expected):
    assert is_leveraged_token(asset) is expected


def test_stablecoin_pairs_removed():
    cands = [candidate("BTCUSDT", base_asset="BTC"), candidate("FDUSDUSDT", base_asset="FDUSD")]
    result = run_chain(cands, UniverseConfig())
    assert {c.symbol for c in result.selected} == {"BTCUSDT"}


def test_blacklist_removes_symbol():
    cands = [candidate("AUSDT"), candidate("BUSDT")]
    result = run_chain(cands, UniverseConfig(), blacklist={"BUSDT"})
    assert {c.symbol for c in result.selected} == {"AUSDT"}
    blacklist_step = next(s for s in result.funnel if s.name == "BlacklistFilter")
    assert blacklist_step.dropped == 1


def test_age_filter_drops_young_listings():
    cands = [candidate("AUSDT", age_days=90), candidate("BUSDT", age_days=30)]
    result = run_chain(cands, UniverseConfig(min_age_days=60))
    assert {c.symbol for c in result.selected} == {"AUSDT"}


def test_spread_filter_drops_wide_and_unsampled():
    cands = [
        candidate("AUSDT", spread_pct=0.10),
        candidate("BUSDT", spread_pct=0.90),  # çok geniş
        candidate("CUSDT", spread_pct=None),  # örnek yok
        candidate("DUSDT", spread_pct=0.05, spread_samples=3),  # yetersiz örnek
    ]
    result = run_chain(cands, UniverseConfig())
    assert {c.symbol for c in result.selected} == {"AUSDT"}


def test_tick_size_filter():
    # tick/price = %5 → eşik %0.05'in çok üstünde
    cands = [candidate("AUSDT", tick_size=0.001), candidate("BUSDT", tick_size=5.0)]
    result = run_chain(cands, UniverseConfig())
    assert {c.symbol for c in result.selected} == {"AUSDT"}


def test_volatility_filter_bounds():
    cands = [
        candidate("AUSDT", volatility_ann_pct=100),
        candidate("BUSDT", volatility_ann_pct=10),  # çok sakin
        candidate("CUSDT", volatility_ann_pct=400),  # çok çılgın
    ]
    result = run_chain(cands, UniverseConfig())
    assert {c.symbol for c in result.selected} == {"AUSDT"}


def test_range_stability_filter_bounds():
    cands = [
        candidate("AUSDT", range_3d_pct=20),
        candidate("BUSDT", range_3d_pct=1),
        candidate("CUSDT", range_3d_pct=500),
    ]
    result = run_chain(cands, UniverseConfig())
    assert {c.symbol for c in result.selected} == {"AUSDT"}


def test_delist_filter():
    cands = [candidate("AUSDT"), candidate("BUSDT", delist_announced=True)]
    result = run_chain(cands, UniverseConfig())
    assert {c.symbol for c in result.selected} == {"AUSDT"}


def test_universe_has_no_momentum_filter():
    """Tasarım ilkesi (§3.1): havuz alfa filtresi değildir.

    24 saatlik getirisi çok yüksek bir coin havuzdan **elenmemelidir** —
    o kararı ScoringEngine'in crowding cezası verir.
    """
    cands = [candidate("AUSDT"), candidate("BUSDT")]
    result = run_chain(cands, UniverseConfig())
    assert len(result.selected) == 2


# --------------------------------------------------------------------------- #
#  Determinizm
# --------------------------------------------------------------------------- #
def test_same_config_and_data_produce_same_universe():
    cfg = UniverseConfig()
    a = run_chain(pool(150), cfg)
    b = run_chain(pool(150), cfg)
    assert [c.symbol for c in a.selected] == [c.symbol for c in b.selected]
    assert [s.as_dict() for s in a.funnel] == [s.as_dict() for s in b.funnel]


def test_config_hash_changes_with_parameters():
    assert UniverseConfig().hash() == UniverseConfig().hash()
    assert UniverseConfig(top_n=100).hash() != UniverseConfig(top_n=80).hash()
    assert UniverseConfig(min_age_days=60).hash() != UniverseConfig(min_age_days=90).hash()


def test_input_order_does_not_change_result():
    cfg = UniverseConfig()
    original = pool(120)
    shuffled = list(reversed(original))
    a = run_chain(original, cfg)
    b = run_chain(shuffled, cfg)
    assert [c.symbol for c in a.selected] == [c.symbol for c in b.selected]


def test_ties_broken_deterministically_by_symbol():
    """Eşit hacimde sıralama sembole göre belirlenir — rastgele değil."""
    cands = [candidate(s, quote_volume=500.0) for s in ("ZUSDT", "AUSDT", "MUSDT")]
    result = run_chain(cands, UniverseConfig(top_n=2))
    assert [c.symbol for c in result.selected] == ["AUSDT", "MUSDT"]


# --------------------------------------------------------------------------- #
#  Histerezis — §3.3
# --------------------------------------------------------------------------- #
def test_hysteresis_keeps_symbol_in_band():
    """Havuzdaki bir coin 100–120 bandına düşerse çıkarılmaz."""
    cfg = UniverseConfig(top_n=100, hysteresis_band=120)
    ranked = [candidate(f"C{i:03d}USDT") for i in range(130)]
    for i, c in enumerate(ranked, start=1):
        c.rank = i
    selected = ranked[:100]

    previous = {"C104USDT"}  # rank 105 → bandın içinde
    final = apply_hysteresis(selected, ranked, previous, cfg)
    assert "C104USDT" in {c.symbol for c in final}
    assert len(final) == 101


def test_hysteresis_drops_below_band():
    cfg = UniverseConfig(top_n=100, hysteresis_band=120)
    ranked = [candidate(f"C{i:03d}USDT") for i in range(130)]
    for i, c in enumerate(ranked, start=1):
        c.rank = i
    selected = ranked[:100]

    previous = {"C124USDT"}  # rank 125 → bandın altında
    final = apply_hysteresis(selected, ranked, previous, cfg)
    assert "C124USDT" not in {c.symbol for c in final}
    assert len(final) == 100


def test_open_position_symbol_always_stays():
    """Açık pozisyonu olan coin pozisyon kapanana kadar havuzda kalır (§3.3)."""
    cfg = UniverseConfig(top_n=100, hysteresis_band=120)
    ranked = [candidate(f"C{i:03d}USDT") for i in range(200)]
    for i, c in enumerate(ranked, start=1):
        c.rank = i
    selected = ranked[:100]

    final = apply_hysteresis(selected, ranked, set(), cfg, protected={"C180USDT"})
    assert "C180USDT" in {c.symbol for c in final}


def test_hysteresis_output_is_rank_sorted():
    cfg = UniverseConfig(top_n=50, hysteresis_band=60)
    ranked = [candidate(f"C{i:03d}USDT") for i in range(80)]
    for i, c in enumerate(ranked, start=1):
        c.rank = i
    final = apply_hysteresis(ranked[:50], ranked, {"C054USDT"}, cfg)
    assert [c.rank for c in final] == sorted(c.rank for c in final)


# --------------------------------------------------------------------------- #
#  Filtre 8 ile filtre 7 arasındaki ilişki — §9.20
# --------------------------------------------------------------------------- #
def test_tick_threshold_is_not_stricter_than_spread_threshold():
    """Tick eşiği, spread eşiğinden **sıkı olmamalı**.

    Tick oranı (`tickSize / price`) ulaşılabilecek en dar spread'in alt
    sınırıdır: bir sembolün spread'i bir tick'ten küçük olamaz. Dolayısıyla
    tick filtresi, spread filtresinin zaten yakaladığı riski ölçer. Tick eşiği
    spread eşiğinden sıkı olursa aynı risk ikinci kez ve daha sert uygulanır —
    havuzun yarısı bu yüzden eleniyordu (170 → 87).

    Bu test bir **gerekçeyi** kilitler, bir sayıyı değil: eşik ileride
    değişebilir ama bu ilişkiyi bozmamalı.
    """
    cfg = UniverseConfig()
    assert cfg.max_tick_ratio_pct <= cfg.max_spread_pct


def test_liquid_mid_cap_passes_tick_filter():
    """Fiyatı ~0,18 olan, tick'i 0,0001 olan bir sembol (ADAUSDT profili) geçmeli.

    %0,05 eşiğiyle bu profil eleniyordu (%0,0564) — Binance'in en likit
    çiftlerinden biri havuza giremiyordu.
    """
    candidate = Candidate(
        symbol="ADAUSDT",
        base_asset="ADA",
        quote_asset="USDT",
        status="TRADING",
        is_spot_allowed=True,
        price=0.1773,
        quote_volume=5e7,
        tick_size=0.0001,
    )
    assert candidate.tick_ratio_pct == pytest.approx(0.0564, abs=1e-3)
    assert TickSizeFilter().apply([candidate], UniverseConfig()) == [candidate]


# --------------------------------------------------------------------------- #
# Yeniden başlatma dayanıklılığı — 2026-08-16 elektrik kesintisi
#
# Süpervizör, piyasa verisi servisi Redis'e ilk ticker'ı yazmadan 2 saniye önce
# havuzu yeniledi. Aday listesi boştu, zincir hiçbir şey döndürmedi ve motor
# **boş bir havuzu snapshot olarak yazdı**: canlı havuz 65 → 0 oldu ve o ana ait
# point-in-time kayıt, havuz gerçekten boşmuş gibi yalan söylemeye başladı.
# Girdi yokluğu bir piyasa gözlemi değildir; yenileme yazmadan iptal edilmelidir.
# --------------------------------------------------------------------------- #


class _EmptyRedis:
    """Ticker önbelleği boş bir Redis — servis daha yeni açılmış."""

    async def hgetall(self, key: str) -> dict:
        return {}


class _TickerRedis:
    """Ticker önbelleği dolu bir Redis. Aday listesi boş olmasın diye yeterli.

    Zincirin bu adayları eleyip elemediği önemli değil; bu testler snapshot
    **yazma kararını** ölçüyor, filtre davranışını değil.
    """

    def __init__(self, symbols: tuple[str, ...] = ("BTCUSDT", "ETHUSDT")) -> None:
        self._payload = {s: json.dumps({"last_price": 100.0, "quote_volume": 5e8}) for s in symbols}

    async def hgetall(self, key: str) -> dict:
        return dict(self._payload)


@pytest.mark.asyncio
async def test_ticker_yoksa_yenileme_iptal_edilir(api_session):
    """Girdi yokken `UniverseInputUnavailable` yükselir."""
    from sarnic.universe.engine import UniverseEngine, UniverseInputUnavailable

    with pytest.raises(UniverseInputUnavailable):
        await UniverseEngine().refresh(api_session, _EmptyRedis(), reason="test")


@pytest.mark.asyncio
async def test_ticker_yoksa_snapshot_yazilmaz(api_session):
    """Asıl hasar buydu: boş havuz snapshot'ı kaydı bozar (bozulmaz kural 3)."""
    from sqlalchemy import func, select

    from sarnic.db.models import UniverseSnapshot
    from sarnic.universe.engine import UniverseEngine, UniverseInputUnavailable

    onceki = await api_session.scalar(select(func.count()).select_from(UniverseSnapshot))
    with pytest.raises(UniverseInputUnavailable):
        await UniverseEngine().refresh(api_session, _EmptyRedis(), reason="test")
    sonraki = await api_session.scalar(select(func.count()).select_from(UniverseSnapshot))
    assert sonraki == onceki


def test_acik_pozisyonlar_her_zaman_emir_defteri_alir():
    """Açık pozisyon sembolü havuz sırasının dışında kalsa bile defteri açılır.

    Derinlik akışı 40 sembolle sınırlı; liste havuz sırasından kesiliyordu ve
    41. sıradaki bir açık pozisyon defter alamıyordu. Defter yoksa çıkış emri
    dolamaz — stop tetiklense bile pozisyon açık kalır (2026-08-16 kesintisi).
    """
    from sarnic.cli import _book_selection

    havuz = [f"SYM{i}USDT" for i in range(60)]
    acik = ["CRCLBUSDT", "MUBUSDT"]  # havuzda yok
    secim = _book_selection(havuz, acik, limit=40)

    assert len(secim) == 40
    assert set(acik) <= set(secim)
    assert secim[:2] == acik  # önce açık pozisyonlar


def test_book_secimi_kopya_uretmez():
    """Açık pozisyon zaten havuzdaysa sınır boşa harcanmaz."""
    from sarnic.cli import _book_selection

    havuz = [f"SYM{i}USDT" for i in range(60)]
    secim = _book_selection(havuz, ["SYM5USDT"], limit=40)

    assert len(secim) == len(set(secim)) == 40
    assert secim[0] == "SYM5USDT"


@pytest.mark.asyncio
async def test_degismeyen_havuz_yeni_snapshot_yazmaz(api_session):
    """Otomatik yeniden denemede aynı liste ikinci kez yazılmaz (§10.2).

    Havuz hedefin altındayken 3 dakikada bir denenir; sonuç çoğu turda aynıdır.
    Aynı satırı tekrar yazmak kaydı büyütür, bilgi eklemez.
    """
    from sqlalchemy import func, select

    from sarnic.db.models import UniverseSnapshot
    from sarnic.universe.engine import UniverseEngine

    engine = UniverseEngine()
    redis = _TickerRedis()

    ilk = await engine.refresh(api_session, redis, reason="manual")
    assert ilk.snapshot_id is not None

    onceki = await api_session.scalar(select(func.count()).select_from(UniverseSnapshot))
    ikinci = await engine.refresh(api_session, redis, reason="retry", skip_if_unchanged=True)
    sonraki = await api_session.scalar(select(func.count()).select_from(UniverseSnapshot))

    assert ikinci.snapshot_id is None
    assert ikinci.symbols == ilk.symbols
    assert sonraki == onceki


@pytest.mark.asyncio
async def test_planli_yenileme_degismese_de_yazar(api_session):
    """Planlı yenileme bayrağı kullanmaz — kural 3 gereği her zaman yazar."""
    from sqlalchemy import func, select

    from sarnic.db.models import UniverseSnapshot
    from sarnic.universe.engine import UniverseEngine

    engine = UniverseEngine()
    redis = _TickerRedis()

    await engine.refresh(api_session, redis, reason="manual")
    onceki = await api_session.scalar(select(func.count()).select_from(UniverseSnapshot))
    sonuc = await engine.refresh(api_session, redis, reason="scheduled")
    sonraki = await api_session.scalar(select(func.count()).select_from(UniverseSnapshot))

    assert sonuc.snapshot_id is not None
    assert sonraki == onceki + 1


def test_referans_sembol_her_zaman_izlenir():
    """BTC bir işlem adayı değil, rejim ölçü aletidir (SYSTEM-REVIEW §2).

    Havuzun volatilite filtresi onu düzenli olarak eliyor; elenince hiçbir dilimi
    akmıyor ve rejim kontrolü eski fiyatla karar veriyordu.
    """
    from sarnic.cli import _tracked_set
    from sarnic.config import settings

    havuz = ["AUSDT", "BUSDT"]  # referans havuzda yok
    izlenen = _tracked_set(havuz, [])

    assert settings.reference_symbol in izlenen
    assert set(havuz) <= set(izlenen)


def test_referans_sembol_iki_kez_eklenmez():
    from sarnic.cli import _tracked_set
    from sarnic.config import settings

    izlenen = _tracked_set([settings.reference_symbol, "AUSDT"], [settings.reference_symbol])
    assert izlenen.count(settings.reference_symbol) == 1


# --------------------------------------------------------------------------- #
#  Sınır salınımı
# --------------------------------------------------------------------------- #
def _aday(symbol: str, rank: int = 1, **kw) -> Candidate:
    c = Candidate(symbol=symbol, **kw)
    c.rank = rank
    return c


def test_measurement_filter_drop_is_tolerated_for_one_round():
    """Eşiğin dibinde gezinen üye her yenilemede taraf değiştirmemeli.

    Ölçüldü (2026-08-19): havuz 86↔87 arasında salınıyordu. BABYUSDT 25
    dakikada beş kez girip çıktı, OPGUSDT üç kez; günde 31–68 snapshot
    yazılıyordu. Her çıkış puanlamanın kesitini de değiştiriyor — yani salınım
    yalnızca kaydı değil kararı da kirletiyordu.
    """
    cfg = UniverseConfig()
    onceki = {"AUSDT", "BUSDT"}
    kalan = [_aday("AUSDT", rank=1)]
    huni = [FunnelStep(index=9, name="VolatilityFilter", kept=1, dropped=1,
                       dropped_symbols=["BUSDT"])]
    sayac: dict[str, int] = {}

    ilk = apply_hysteresis(kalan, kalan, onceki, cfg, funnel=huni, soft_misses=sayac)
    assert {c.symbol for c in ilk} == {"AUSDT", "BUSDT"}, "ilk turda korunmalı"

    ikinci = apply_hysteresis(kalan, kalan, onceki, cfg, funnel=huni, soft_misses=sayac)
    assert {c.symbol for c in ikinci} == {"AUSDT"}, "üst üste düşerse gerçekten çıkmalı"


def test_hard_filter_drop_removes_immediately():
    """Delist edilmiş sembolde beklemek anlamsız ve tehlikelidir."""
    cfg = UniverseConfig()
    kalan = [_aday("AUSDT", rank=1)]
    huni = [FunnelStep(index=11, name="DelistFilter", kept=1, dropped=1,
                       dropped_symbols=["BUSDT"])]

    sonuc = apply_hysteresis(kalan, kalan, {"AUSDT", "BUSDT"}, cfg, funnel=huni, soft_misses={})
    assert {c.symbol for c in sonuc} == {"AUSDT"}


def test_recovering_member_resets_its_grace_counter():
    """Geri dönen üye sayacı sıfırlamalı; aksi hâlde koruma birikerek tükenir."""
    cfg = UniverseConfig()
    onceki = {"AUSDT", "BUSDT"}
    dusuk = [_aday("AUSDT", rank=1)]
    tam = [_aday("AUSDT", rank=1), _aday("BUSDT", rank=2)]
    huni = [FunnelStep(index=9, name="VolatilityFilter", kept=1, dropped=1,
                       dropped_symbols=["BUSDT"])]
    sayac: dict[str, int] = {}

    apply_hysteresis(dusuk, dusuk, onceki, cfg, funnel=huni, soft_misses=sayac)
    assert sayac == {"BUSDT": 1}
    apply_hysteresis(tam, tam, onceki, cfg, funnel=[], soft_misses=sayac)
    assert sayac == {}, "ölçüm normale dönünce koruma yeniden dolmalı"
