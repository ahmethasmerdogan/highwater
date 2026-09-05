"""Kontrol odası uçları — DESIGN-V4.

Bu dosyanın koruduğu tek söz: **payda gizlenmez.** Sekiz arızanın altısı
(2026-09-04/05) tam olarak paydası görünmediği için aylarca fark edilmedi.
Uçlar veri yokken de tam gövde döndürmek, sıfır kalan sayacı da basmak ve
"hiç olmamış" kuralı ayrı sınıfta göstermek zorunda.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select

from sarnic.core.enums import BotState
from sarnic.db.models import BotEvent, EntryDecision
from tests.test_api import make_bot


def _iz(bot_id: int, bar, asama: str, **kw) -> EntryDecision:
    return EntryDecision(bot_id=bot_id, bar_time=bar, stage=asama, **kw)


@pytest.fixture
async def huni_verisi(api_session, test_database):
    """Bir barlık karar izi: 121 aday, 2'si açıldı, 3'ü boyutta öldü."""
    bot, _ = await make_bot(api_session, "huni")
    bar = datetime.now(UTC).replace(minute=0, second=0, microsecond=0)
    api_session.add_all(
        [
            _iz(bot.id, bar, "havuz", adet=121, percentiles={"atr_pct": 50.0}),
            _iz(
                bot.id,
                bar,
                "kapi",
                adet=109,
                rejected_by="kapi",
                reject_detail="puan < 80",
                percentiles={"atr_pct": 49.2},
            ),
            _iz(
                bot.id,
                bar,
                "slot",
                adet=4,
                rejected_by="slot",
                reject_detail="portföy dolu (4)",
                percentiles={"atr_pct": 88.1},
            ),
            # Boyutta ölen üç aday: tek tek, yüksek sakinlik yüzdeliğiyle.
            *[
                _iz(
                    bot.id,
                    bar,
                    "boyut",
                    adet=1,
                    symbol=f"D{i}USDT",
                    rejected_by="kısıtlar",
                    reject_detail="kısıtlar boyutu hedefin %19",
                    binding_constraint="serbest_nakit",
                    fill_ratio=0.19,
                    percentiles={"atr_pct": 80.0 + i},
                )
                for i in range(3)
            ],
            # Açılan üç pozisyon: düşük sakinlik yüzdeliği (KAR-TESHISI §9).
            *[
                _iz(
                    bot.id,
                    bar,
                    "acildi",
                    adet=1,
                    symbol=f"A{i}USDT",
                    percentiles={"atr_pct": 35.0 + i},
                )
                for i in range(3)
            ],
        ]
    )
    await api_session.commit()
    return bot


async def test_huni_her_basamakta_oleni_ve_kenarini_verir(api_client, auth, huni_verisi):
    """Huni tek başına 'kaç aday öldü' der; bu bilgi değildir. Yanında
    ölenlerin ölçülen kenar özelliği durmak zorunda (DESIGN-V4 §4)."""
    body = (await api_client.get("/kontrol/huni", headers=auth)).json()

    basamak = {b["asama"]: b for b in body["basamaklar"]}
    assert list(basamak) == ["havuz", "kapi", "slot", "boyut", "acildi"], (
        "sıra karar yolunun sırası"
    )
    assert basamak["havuz"]["adet"] == 121, "payda görünür"
    assert basamak["kapi"]["adet"] == 109
    assert basamak["boyut"]["adet"] == 3
    assert basamak["acildi"]["adet"] == 3
    assert basamak["kapi"]["ozellikler"]["atr_pct"] == 49.2
    assert basamak["kapi"]["nedenler"][0] == {"neden": "puan < 80", "adet": 109}

    kenar = body["kenar"]
    assert kenar["ozellik"] == "atr_pct"
    assert kenar["olen_ortalama"] == 81.0 and kenar["acilan_ortalama"] == 36.0
    assert kenar["n_olen"] == 3 and kenar["n_acilan"] == 3
    assert kenar["t"] is not None and kenar["t"] < 0, "açılanlar daha oynak → negatif t"


async def test_huni_hic_baglamayan_tavani_sifirla_basar(api_client, auth, huni_verisi):
    """Yapılandırılmış ama hiç iş görmemiş tavan koruma değil yanılsamadır."""
    body = (await api_client.get("/kontrol/huni", headers=auth)).json()
    tavan = {t["ad"]: t["adet"] for t in body["tavanlar"]}
    assert tavan["serbest_nakit"] == 3
    assert tavan["likidite_tavanı"] == 0, "sıfır da satır"
    assert tavan["toplam_maruziyet"] == 0
    assert body["dolum_orani"]["ortanca"] == 0.19


async def test_huni_veri_yokken_de_tam_govde(api_client, auth, test_database):
    body = (await api_client.get("/kontrol/huni", headers=auth)).json()
    assert body["basamaklar"] == [] and body["bar_sayisi"] == 0
    assert body["kenar"]["olen_ortalama"] is None and body["kenar"]["t"] is None
    assert len(body["tavanlar"]) == 4, "tavan listesi veri olmadan da tam"


async def test_nobet_butceleri_oran_olarak_verir(api_client, auth, api_session, test_database):
    """Her bütçe satırı ölçülen ÷ payda. Tek sayı yeterli değil."""
    bot, _ = await make_bot(api_session, "nobet")
    bot.state = BotState.PAPER_RUNNING
    bot.timeframe = "1h"
    await api_session.commit()

    body = (await api_client.get("/kontrol/nobet", headers=auth, params={"saat": 24})).json()
    butce = {b["ad"]: b for b in body["butceler"]}
    assert set(butce) == {"bar bütçesi", "sembol bütçesi", "bağlantı bütçesi"}
    assert butce["bar bütçesi"]["payda"] == 24, "1h kol 24 saatte 24 karar bekler"
    for satir in butce.values():
        assert "olculen" in satir and "payda" in satir, "payda gizlenmez"

    kesici = body["kesici_payi"]
    assert kesici["esik_s"] == 360.0 and kesici["kural"] == 1.5


async def test_nobet_uc_sayac_sinifini_ayirir(api_client, auth, api_session, test_database):
    """OLDU / OLMADI-BEKLENİYORDU / HİÇ OLMADI. Üçüncüsü en pahalısı."""
    bot, _ = await make_bot(api_session, "sayac")
    api_session.add(BotEvent(bot_id=bot.id, kind="worker.restart", level="WARN", payload={}))
    await api_session.commit()

    body = (await api_client.get("/kontrol/nobet", headers=auth)).json()
    s = body["sayaclar"]
    assert set(s) == {"oldu", "beklendi_olmadi", "hic_olmadi"}

    beklendi = {r["ad"]: r for r in s["beklendi_olmadi"]}
    assert beklendi["worker yeniden doğdu"]["adet"] == 1
    assert beklendi["worker yeniden doğdu"]["esik"] == "0 olmalı"
    assert "açık bar kapalı yazıldı" in beklendi, "5. arıza kalıcı bir satır"

    hic = {r["ad"]: r["adet"] for r in s["hic_olmadi"]}
    assert hic["rotasyon çıkışı"] == 0 and hic["korelasyon kümesi"] == 0
    assert "tavan: likidite_tavanı" in hic, "hiç bağlamayan tavan da listelenir"


async def test_nobet_donuk_kolu_bar_cinsinden_olcer(api_client, auth, api_session, test_database):
    """Sessizlik bir durumdur: son barı 2 bar geride kalan kol ekranda yer kaplar."""
    bot, _ = await make_bot(api_session, "donuk")
    bot.state = BotState.PAPER_RUNNING
    bot.timeframe = "1h"
    bot.last_bar_at = datetime.now(UTC) - timedelta(hours=3)
    await api_session.commit()

    body = (await api_client.get("/kontrol/nobet", headers=auth)).json()
    kol = next(k for k in body["kollar"] if k["id"] == bot.id)
    assert kol["bar_gecikmesi_bar"] >= 3.0
    assert bot.id in body["donuk"]


async def test_iz_yazmak_karar_yolunu_kesmez(api_session, test_database):
    """Karar izi bir gözlem kaydıdır. Yazılamazsa pozisyon yine açılmalı."""
    from sarnic.bots.worker import BotWorker

    class Patlayan:
        def add_all(self, _):
            raise RuntimeError("disk dolu")

    w = BotWorker.__new__(BotWorker)
    w.bot_id = 1
    await w._karar_izini_yaz(Patlayan(), [object()])  # istisna dışarı sızmamalı

    bos = (await api_session.execute(select(EntryDecision))).scalars().all()
    assert bos == []


# --------------------------------------------------------------------------- #
#  Hipotez tahtası
# --------------------------------------------------------------------------- #
ON_KAYIT = {
    "hipotez": "Doluluk kapısı sistemin ölçtüğü kenarı eliyor.",
    "kontrol_bot_id": None,  # fixture doldurur
    "tek_degisken": "min_fill_ratio 0,25 → 0,00",
    "mekanizma": {"olcu": "acilan_sakinlik", "hedef": 60.0, "gereken_n": 4, "yon": "artis"},
    "curutme": "sakinlik 60'a çıkmazsa eleme başka yerden geliyordur",
    "karar_gunu": "2026-09-19",
}


async def test_hipotez_mekanizmayi_kol_defterinden_ayirir(
    api_session, api_client, auth, test_database
):
    """Hüküm mekanizmadan okunur, kol defterinden değil: R beklentisi bugünkü
    hızda +0,05R'yi 149 yılda ayırt ediyor (MEYDAN-OKUMA 2026-09-05)."""
    kontrol, _ = await make_bot(api_session, "kontrol")
    kol, _ = await make_bot(api_session, "K1")
    kol.config = {"deney": True, "on_kayit": {**ON_KAYIT, "kontrol_bot_id": kontrol.id}}
    bar = datetime.now(UTC).replace(minute=0, second=0, microsecond=0)
    api_session.add_all(
        [
            *[
                _iz(
                    kontrol.id,
                    bar,
                    "acildi",
                    adet=1,
                    symbol=f"K{i}",
                    percentiles={"atr_pct": 35.0 + i},
                )
                for i in range(5)
            ],
            *[
                _iz(
                    kol.id, bar, "acildi", adet=1, symbol=f"D{i}", percentiles={"atr_pct": 70.0 + i}
                )
                for i in range(5)
            ],
        ]
    )
    await api_session.commit()

    body = (await api_client.get("/kontrol/hipotez", headers=auth)).json()
    kart = {k["bot_id"]: k for k in body["kartlar"]}

    m = kart[kol.id]["mekanizma"]
    assert m["deger"] == 72.0 and m["kontrol_deger"] == 37.0
    assert m["n"] == 5 and m["gereken_n"] == 4
    assert m["t"] > 2, "kesitsel kanal yüksek güçlü — t büyük çıkmalı"
    assert kart[kol.id]["damga"] == "HEDEFE ULAŞTI"

    assert kart[kol.id]["sonuc"]["n"] == 0 and kart[kol.id]["sonuc"]["deger"] is None
    assert kart[kontrol.id]["damga"] == "KONTROL"


async def test_hipotez_mekanizmasiz_kolu_gucsuz_damgalar(
    api_session, api_client, auth, test_database
):
    """Saf kaldıraç kolunun mekanizma ölçüsü yoktur; sonuçlanamayacağını
    baştan ilan eder (DESIGN-V4 §5)."""
    kol, _ = await make_bot(api_session, "A1")
    kol.config = {"deney": True, "on_kayit": {**ON_KAYIT, "mekanizma": {}}}
    await api_session.commit()

    body = (await api_client.get("/kontrol/hipotez", headers=auth)).json()
    kart = next(k for k in body["kartlar"] if k["bot_id"] == kol.id)
    assert kart["damga"] == "GÜÇSÜZ" and kart["mekanizma"] is None
    assert kart["on_kayit"]["muhur_hash"], "mühür her ön-kayıtta hesaplanır"


async def test_hipotez_on_kayitsiz_deney_kolunu_gizlemez(
    api_session, api_client, auth, test_database
):
    """Sessizlik bir durumdur: ön-kaydı olmayan deney kolu listede kalır."""
    kol, _ = await make_bot(api_session, "kayıtsız")
    kol.config = {"deney": True}
    await api_session.commit()

    body = (await api_client.get("/kontrol/hipotez", headers=auth)).json()
    kart = next(k for k in body["kartlar"] if k["bot_id"] == kol.id)
    assert kart["damga"] == "ÖN-KAYIT YOK" and kart["on_kayit"] is None


async def test_hipotez_kirik_muhru_bildirir(api_session, api_client, auth, test_database):
    """Mühür kırılırsa toplanan kanıt geçersizdir; kart bunu söylemek zorunda."""
    kol, _ = await make_bot(api_session, "mühür")
    kol.config = {"deney": True, "on_kayit": {**ON_KAYIT, "muhur_hash": "eskimuhur000000"}}
    await api_session.commit()

    body = (await api_client.get("/kontrol/hipotez", headers=auth)).json()
    kart = next(k for k in body["kartlar"] if k["bot_id"] == kol.id)
    assert kart["on_kayit"]["muhur_kirik"] is True


async def test_kisa_payi_olcusu_sakinligi_bozmaz(api_session, api_client, auth, test_database):
    """KISA yönlü açılış, ölçü 'kisa_payi' DEĞİLKEN de kendi yüzdeliğiyle
    sayılmalı. Üçlü işleç önceliği yüzünden her kısa açılış 100 dönüyordu."""
    kontrol, _ = await make_bot(api_session, "uzun-kontrol")
    kol, _ = await make_bot(api_session, "S2")
    kol.config = {"deney": True, "on_kayit": {**ON_KAYIT, "kontrol_bot_id": kontrol.id}}
    bar = datetime.now(UTC).replace(minute=0, second=0, microsecond=0)
    api_session.add_all(
        [
            _iz(
                kol.id,
                bar,
                "acildi",
                adet=1,
                symbol=f"S{i}",
                direction=-1,
                percentiles={"atr_pct": 40.0},
            )
            for i in range(5)
        ]
    )
    await api_session.commit()

    body = (await api_client.get("/kontrol/hipotez", headers=auth)).json()
    kart = next(k for k in body["kartlar"] if k["bot_id"] == kol.id)
    assert kart["mekanizma"]["deger"] == 40.0, "kısa yön sakinlik ölçüsünü ezmemeli"
