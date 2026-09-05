"""Kontrol odası uçları — DESIGN-V4.

Panel bir işlem terminali değil, 30 kollu bir ölçüm deneyinin kontrol odası.
Bu modül üç şeyi servis eder ve üçü de aynı ilkeye uyar: **payda gizlenmez.**

- `/kontrol/nobet` — bütçeler ve sayaçlar. Her satır bir orandır, tek sayı
  değil: ölçülen ÷ beklenen. 2026-09-04/05'te bulunan sekiz arızanın altısı
  tam olarak paydası görünmediği için aylarca fark edilmedi.
- `/kontrol/huni` — karar hunisi (`entry_decisions`). Her basamakta kaç aday
  öldüğü ve **ölenlerin ölçülen kenar özelliği** yan yana durur.
- `/kontrol/hipotez` — ön-kayıt kartları. Her kolun mekanizma ölçüsü (yüksek
  güçlü, kesitsel) ve sonuç ölçüsü (düşük güçlü, kol defteri) ayrı ayrı.

Hiçbir uç "her şey yolunda" demez; sağlıklı durum sayıların kendisinden okunur.
"""

from __future__ import annotations

import math
from datetime import UTC, datetime, timedelta
from typing import Any

from fastapi import APIRouter, Query
from sqlalchemy import bindparam, func, select, text

from sarnic.api.deps import CurrentUser, RedisDep, SessionDep
from sarnic.core.enums import BotState, ExitReason, PositionStatus
from sarnic.db.models import (
    Bot,
    BotEvent,
    CorrelationCluster,
    EntryDecision,
    Position,
    Score,
    Trade,
    UniverseSnapshot,
)
from sarnic.strategy.definition import TIMEFRAME_MINUTES

router = APIRouter(prefix="/kontrol", tags=["kontrol"])

#: Supervisor'ın nabız eşiği. Kesici payı = eşik ÷ ölçülen p90 karar süresi.
#: 2026-09-04'te 35 ÷ 270 = 0,13× idi ve filo günde 1697 kez yeniden doğdu.
from sarnic.bots.supervisor import HEARTBEAT_TIMEOUT  # noqa: E402

#: Kesici payı kuralı: eşik ölçülen en kötü karar süresinin en az bu katı olmalı.
KESICI_PAYI_KURALI = 1.5

#: Boyutlandırma motorunun tavanları. Hiç bağlamayan bir tavan koruma değil
#: yanılsamadır (DESIGN-V4 §7, üçüncü sayaç sınıfı).
TAVANLAR = ("tek_pozisyon_tavanı", "serbest_nakit", "toplam_maruziyet", "likidite_tavanı")

#: Hunide basamak sırası. Sıra karar yolunun sırasıdır, sayıya göre değil.
BASAMAKLAR = ("havuz", "kapi", "slot", "veri", "boyut", "acildi")

BASAMAK_ADI = {
    "havuz": "havuz kesiti",
    "kapi": "puan kapısı",
    "slot": "slot doluluğu",
    "veri": "veri eksiği",
    "boyut": "boyutlandırma",
    "acildi": "pozisyon açıldı",
}


def _now() -> datetime:
    return datetime.now(UTC)


def _oran(pay: float | None, payda: float | None) -> float | None:
    if pay is None or not payda:
        return None
    return pay / payda


def _t_testi(a: list[float], b: list[float]) -> float | None:
    """Welch t — eşit varyans varsaymaz. İki grup da ≥ 3 gözlem istiyor."""
    if len(a) < 3 or len(b) < 3:
        return None
    na, nb = len(a), len(b)
    ma, mb = sum(a) / na, sum(b) / nb
    va = sum((x - ma) ** 2 for x in a) / (na - 1)
    vb = sum((x - mb) ** 2 for x in b) / (nb - 1)
    payda = math.sqrt(va / na + vb / nb)
    if payda == 0:
        return None
    return (ma - mb) / payda


# --------------------------------------------------------------------------- #
#  Karar hunisi
# --------------------------------------------------------------------------- #
@router.get("/huni")
async def huni(
    session: SessionDep,
    user: CurrentUser,
    bot_id: int | None = None,
    saat: int = Query(24, ge=1, le=720),
    ozellik: str = "atr_pct",
) -> dict:
    """Karar hunisi — DESIGN-V4 §4'ün amiral bileşeni.

    Her basamak iki sayı taşır: kaç aday öldü ve **ölenlerin ölçülen kenar
    özelliği neydi**. İkincisi olmadan huni bilgi vermez; "293 aday doluluk
    kapısında öldü" cümlesi sistemin zaten öyle çalıştığını söyler. Yanına
    "ölenlerin sakinlik yüzdeliği 82,0, açılanların 36,0" konunca huni bir
    teşhis aracına dönüşür (KAR-TESHISI §9, t = −9,20).
    """
    since = _now() - timedelta(hours=saat)
    kosul = [EntryDecision.bar_time >= since]
    if bot_id is not None:
        kosul.append(EntryDecision.bot_id == bot_id)

    satirlar = (
        await session.execute(
            select(
                EntryDecision.stage,
                EntryDecision.adet,
                EntryDecision.percentiles,
                EntryDecision.reject_detail,
                EntryDecision.binding_constraint,
                EntryDecision.fill_ratio,
                EntryDecision.bar_time,
            ).where(*kosul)
        )
    ).all()

    barlar = {r.bar_time for r in satirlar}
    toplam: dict[str, dict[str, Any]] = {}
    tekil: dict[str, list[float]] = {"boyut": [], "acildi": []}
    kisit: dict[str, int] = {}
    dolum: list[float] = []

    for r in satirlar:
        kutu = toplam.setdefault(r.stage, {"adet": 0, "agirlik": {}, "toplam": {}, "nedenler": {}})
        kutu["adet"] += r.adet
        for k, v in (r.percentiles or {}).items():
            kutu["toplam"][k] = kutu["toplam"].get(k, 0.0) + float(v) * r.adet
            kutu["agirlik"][k] = kutu["agirlik"].get(k, 0) + r.adet
        if r.reject_detail:
            neden = r.reject_detail[:64]
            kutu["nedenler"][neden] = kutu["nedenler"].get(neden, 0) + r.adet
        if r.stage in tekil and r.adet == 1:
            deger = (r.percentiles or {}).get(ozellik)
            if deger is not None:
                tekil[r.stage].append(float(deger))
        if r.binding_constraint:
            kisit[r.binding_constraint] = kisit.get(r.binding_constraint, 0) + r.adet
        if r.fill_ratio is not None:
            dolum.append(float(r.fill_ratio))

    basamaklar = []
    for ad in BASAMAKLAR:
        kutu = toplam.get(ad)
        if kutu is None:
            continue
        ortalama = {
            k: round(kutu["toplam"][k] / kutu["agirlik"][k], 1)
            for k in kutu["toplam"]
            if kutu["agirlik"].get(k)
        }
        basamaklar.append(
            {
                "asama": ad,
                "ad": BASAMAK_ADI[ad],
                "adet": kutu["adet"],
                "ozellikler": ortalama,
                "nedenler": sorted(
                    ({"neden": n, "adet": a} for n, a in kutu["nedenler"].items()),
                    key=lambda x: -x["adet"],
                )[:6],
            }
        )

    olen, acilan = tekil["boyut"], tekil["acildi"]
    kenar = {
        "ozellik": ozellik,
        "olen_ortalama": round(sum(olen) / len(olen), 1) if olen else None,
        "acilan_ortalama": round(sum(acilan) / len(acilan), 1) if acilan else None,
        "n_olen": len(olen),
        "n_acilan": len(acilan),
        "t": round(t, 2) if (t := _t_testi(acilan, olen)) is not None else None,
    }

    # Hiç bağlamayan tavan yanılsamadır: sayaç sıfırsa da satır basılır.
    tavanlar = [{"ad": t, "adet": kisit.get(t, 0)} for t in TAVANLAR]
    tavanlar += [{"ad": k, "adet": v} for k, v in sorted(kisit.items()) if k not in TAVANLAR]

    return {
        "uretim": _now().isoformat(),
        "pencere_saat": saat,
        "bot_id": bot_id,
        "bar_sayisi": len(barlar),
        "basamaklar": basamaklar,
        "kenar": kenar,
        "tavanlar": tavanlar,
        "dolum_orani": {
            "n": len(dolum),
            "ortanca": round(sorted(dolum)[len(dolum) // 2], 3) if dolum else None,
        },
    }


# --------------------------------------------------------------------------- #
#  Nöbet — bütçeler ve sayaçlar
# --------------------------------------------------------------------------- #
async def _kesici_payi(session, saat: int) -> dict:
    """Zaman bütçesi: supervisor eşiği ÷ ölçülen p90 karar süresi."""
    satir = (
        await session.execute(
            text(
                "select percentile_disc(0.5) within group "
                "  (order by (payload->>'duration_ms')::numeric) p50, "
                "percentile_disc(0.9) within group "
                "  (order by (payload->>'duration_ms')::numeric) p90, count(*) n "
                "from bot_events where kind='scores.updated' "
                "  and created_at > now() - make_interval(hours => :s) "
                "  and payload ? 'duration_ms'"
            ),
            {"s": saat},
        )
    ).one()
    p50 = float(satir.p50) / 1000 if satir.p50 is not None else None
    p90 = float(satir.p90) / 1000 if satir.p90 is not None else None
    esik = HEARTBEAT_TIMEOUT.total_seconds()
    return {
        "esik_s": esik,
        "p50_s": round(p50, 1) if p50 else None,
        "p90_s": round(p90, 1) if p90 else None,
        "n": satir.n,
        "pay": round(esik / p90, 2) if p90 else None,
        "kural": KESICI_PAYI_KURALI,
    }


async def _baglanti_butcesi(session) -> dict:
    satir = (
        await session.execute(
            text(
                "select (select count(*) from pg_stat_activity) acik, "
                "(select setting::int from pg_settings where name='max_connections') tavan"
            )
        )
    ).one()
    return {"acik": int(satir.acik), "tavan": int(satir.tavan)}


@router.get("/nobet")
async def nobet(
    session: SessionDep,
    redis: RedisDep,
    user: CurrentUser,
    saat: int = Query(24, ge=1, le=168),
) -> dict:
    """Nöbet ekranı — "dün geceden beri ne bozuldu?"

    Üç sayaç sınıfı ayrı ayrı döner: OLDU, OLMADI-BEKLENİYORDU, HİÇ OLMADI.
    Üçüncüsü en pahalısı: yapılandırılmış ama ömrü boyunca bir kez bile iş
    görmemiş bir kural koruma değil yanılsamadır.
    """
    simdi = _now()
    since = simdi - timedelta(hours=saat)

    bots = (await session.execute(select(Bot).order_by(Bot.id))).scalars().all()
    kosan = [b for b in bots if b.state == BotState.PAPER_RUNNING]

    # --- Bar bütçesi: beklenen karar sayısı ÷ üretilen ---
    beklenen = 0
    for b in kosan:
        dakika = TIMEFRAME_MINUTES.get(b.timeframe, 60)
        beklenen += max(0, int(saat * 60 / dakika))
    uretilen = (
        await session.execute(
            select(func.count())
            .select_from(BotEvent)
            .where(BotEvent.kind == "scores.updated", BotEvent.created_at >= since)
        )
    ).scalar_one()

    # --- Sembol bütçesi: havuz ÷ son barda puanlanan ---
    snap = (
        await session.execute(
            select(UniverseSnapshot)
            .where(UniverseSnapshot.market == "CRYPTO")
            .order_by(UniverseSnapshot.taken_at.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    son_bar = (
        await session.execute(select(func.max(Score.bar_time)).where(Score.bar_time >= since))
    ).scalar_one_or_none()
    puanlanan = 0
    if son_bar is not None:
        puanlanan = (
            await session.execute(
                select(func.count(func.distinct(Score.symbol))).where(Score.bar_time == son_bar)
            )
        ).scalar_one()

    # --- Açık bar sayacı: kapanmamış mum kapanmış diye yazıldı mı (5. arıza) ---
    #: Dilim → dakika. Eksik bir dilim sessizce 60 sayılırsa sayaç yalan söyler:
    #: ilk sürüm '30m'i kaçırdı ve 121 sağlam 30 dakikalık barı "açıkken kapalı
    #: yazıldı" diye raporladı. Eşleme motorun tablosundan gelir.
    dilim_sql = " ".join(f"when '{k}' then {v}" for k, v in TIMEFRAME_MINUTES.items())
    acik_yazilan = (
        await session.execute(
            text(
                "select count(*) from ohlcv where is_closed = true "
                "and timeframe in :dilimler and open_time + "
                f"make_interval(mins => case timeframe {dilim_sql} end) > now()"
            ).bindparams(bindparam("dilimler", expanding=True)),
            {"dilimler": list(TIMEFRAME_MINUTES)},
        )
    ).scalar_one()

    # --- Kollar: donuk olan var mı ---
    kollar = []
    for b in bots:
        dakika = TIMEFRAME_MINUTES.get(b.timeframe, 60)
        gecikme = (simdi - b.last_bar_at).total_seconds() / 60 if b.last_bar_at else None
        nabiz = (simdi - b.last_heartbeat_at).total_seconds() if b.last_heartbeat_at else None
        kollar.append(
            {
                "id": b.id,
                "ad": b.name,
                "durum": str(b.state),
                "dilim": b.timeframe,
                "bar_gecikmesi_bar": round(gecikme / dakika, 1) if gecikme is not None else None,
                "nabiz_s": round(nabiz) if nabiz is not None else None,
                "halt": b.halt_reason,
                "deney": bool((b.config or {}).get("deney")),
            }
        )
    donuk = [
        k
        for k in kollar
        if k["durum"] == BotState.PAPER_RUNNING
        and k["bar_gecikmesi_bar"] is not None
        and k["bar_gecikmesi_bar"] >= 2
    ]

    # --- Sayaçlar ---
    async def say(model, kosul) -> int:
        return (
            await session.execute(select(func.count()).select_from(model).where(*kosul))
        ).scalar_one()

    acilan = await say(Position, [Position.entry_time >= since])
    kapanan = await say(Trade, [Trade.exit_time >= since])
    restart = await say(BotEvent, [BotEvent.kind == "worker.restart", BotEvent.created_at >= since])
    kritik = await say(
        BotEvent, [BotEvent.level.in_(("ERROR", "CRITICAL")), BotEvent.created_at >= since]
    )
    reddedilen = await say(
        BotEvent, [BotEvent.kind == "order.rejected", BotEvent.created_at >= since]
    )

    # HİÇ OLMADI: ömür boyu sayaçlar. Sıfır kalan satır ekranda yer kaplamalı.
    rotasyon = await say(Trade, [Trade.exit_reason == ExitReason.ROTATION])
    kume = (
        await session.execute(select(func.count()).select_from(CorrelationCluster))
    ).scalar_one()
    baglayan = (
        await session.execute(
            select(EntryDecision.binding_constraint, func.count())
            .where(EntryDecision.binding_constraint.isnot(None))
            .group_by(EntryDecision.binding_constraint)
        )
    ).all()
    baglayan_map = {k: v for k, v in baglayan}

    return {
        "uretim": simdi.isoformat(),
        "pencere_saat": saat,
        "butceler": [
            {
                "ad": "bar bütçesi",
                "aciklama": "koşan kolların beklenen karar sayısı",
                "olculen": uretilen,
                "payda": beklenen,
                "oran": round(o, 3) if (o := _oran(uretilen, beklenen)) is not None else None,
                "birim": "karar",
            },
            {
                "ad": "sembol bütçesi",
                "aciklama": "havuzdaki sembol ÷ son barda puanlanan",
                "olculen": puanlanan,
                "payda": len(snap.symbols) if snap else 0,
                "oran": round(o, 3)
                if (o := _oran(puanlanan, len(snap.symbols) if snap else 0)) is not None
                else None,
                "birim": "sembol",
            },
            {
                "ad": "bağlantı bütçesi",
                "aciklama": "açık Postgres bağlantısı ÷ tavan",
                **{
                    "olculen": (b := await _baglanti_butcesi(session))["acik"],
                    "payda": b["tavan"],
                    "oran": round(b["acik"] / b["tavan"], 3) if b["tavan"] else None,
                },
                "birim": "bağlantı",
            },
        ],
        "kesici_payi": await _kesici_payi(session, saat),
        "kollar": kollar,
        "donuk": [k["id"] for k in donuk],
        "sayaclar": {
            "oldu": [
                {"ad": "pozisyon açıldı", "adet": acilan},
                {"ad": "pozisyon kapandı", "adet": kapanan},
                {"ad": "kesit puanlandı", "adet": uretilen},
            ],
            "beklendi_olmadi": [
                {"ad": "donuk kol", "adet": len(donuk), "esik": "≥ 2 bar geride"},
                {"ad": "worker yeniden doğdu", "adet": restart, "esik": "0 olmalı"},
                {"ad": "kritik olay", "adet": kritik, "esik": "0 olmalı"},
                {"ad": "emir reddedildi", "adet": reddedilen, "esik": "0 olmalı"},
                {"ad": "açık bar kapalı yazıldı", "adet": int(acik_yazilan), "esik": "0 olmalı"},
            ],
            "hic_olmadi": [
                {"ad": "rotasyon çıkışı", "adet": rotasyon, "kapsam": "ömür boyu"},
                {"ad": "korelasyon kümesi", "adet": kume, "kapsam": "ömür boyu"},
                *[
                    {"ad": f"tavan: {t}", "adet": baglayan_map.get(t, 0), "kapsam": "karar izi"}
                    for t in TAVANLAR
                ],
            ],
        },
        "acik_pozisyon": await say(Position, [Position.status == PositionStatus.OPEN]),
    }


# --------------------------------------------------------------------------- #
#  Hipotez tahtası — ön-kayıt + mekanizma ölçüsü
# --------------------------------------------------------------------------- #
#: Mekanizma ölçüleri (DESIGN-V4 §5). Hepsi **kesitsel**: örneklem günde
#: yüzlerce karar, t = +5 mertebesinde cevap. Kol defteri (R beklentisi)
#: ölçüldü ki bugünkü hızda +0,05R'yi 149 yılda ayırt ediyor — hüküm oradan
#: okunamaz. Her ölçü kol başına bir **gözlem listesi** döndürür; ortalamanın
#: yanında t hesaplanabilsin diye.
MEKANIZMA_OLCULERI: dict[str, tuple[str, str, str]] = {
    # anahtar: (insan adı, kaynak, kaynak alanı)
    "acilan_sakinlik": ("açılan pozisyonun sakinlik yüzdeliği", "iz", "atr_pct"),
    "acilan_sikisma": ("açılan pozisyonun sıkışma yüzdeliği", "iz", "bb_width"),
    "acilan_trend": ("açılan pozisyonun trend yüzdeliği", "iz", "trend_1d"),
    "acilan_akis": ("açılan pozisyonun alıcı akışı yüzdeliği", "iz", "taker_buy_ratio"),
    "kisa_payi": ("açılan pozisyonların kısa oranı", "iz", "yon"),
    "tutma_saati": ("kapanan pozisyonun tutma süresi (saat)", "islem", "sure"),
    "kismi_cikis_payi": ("kısmi kâr alınan pozisyon oranı", "pozisyon", "partial"),
}


async def _mekanizma_gozlemleri(session, olcu: str, since: datetime) -> dict[int, list[float]]:
    """Kol başına mekanizma gözlemleri — her karar/işlem bir gözlem.

    Ortalamanın yanında t hesaplanabilsin diye ham liste döner: kol defterinin
    aksine bu kanal günde yüzlerce gözlem üretir ve hüküm ondan okunur.
    """
    tanim = MEKANIZMA_OLCULERI.get(olcu)
    if tanim is None:
        return {}
    _, kaynak, alan = tanim
    out: dict[int, list[float]] = {}

    if kaynak == "iz":
        satirlar = (
            await session.execute(
                select(
                    EntryDecision.bot_id, EntryDecision.percentiles, EntryDecision.direction
                ).where(EntryDecision.stage == "acildi", EntryDecision.bar_time >= since)
            )
        ).all()
        for bot_id, pct, yon in satirlar:
            deger = (100.0 if yon < 0 else 0.0) if alan == "yon" else (pct or {}).get(alan)
            if deger is not None:
                out.setdefault(bot_id, []).append(float(deger))
        return out

    if kaynak == "islem":
        satirlar = (
            await session.execute(
                select(Trade.bot_id, Trade.exit_time, Position.entry_time)
                .join(Position, Position.id == Trade.position_id)
                .where(Trade.exit_time >= since)
            )
        ).all()
        for bot_id, cikis, giris in satirlar:
            out.setdefault(bot_id, []).append((cikis - giris).total_seconds() / 3600)
        return out

    satirlar = (
        await session.execute(
            select(Position.bot_id, Position.partial_done).where(Position.entry_time >= since)
        )
    ).all()
    for bot_id, kismi in satirlar:
        out.setdefault(bot_id, []).append(100.0 if kismi else 0.0)
    return out


def _muhur(on_kayit: dict) -> str:
    """Ön-kaydın mührü. Kırılırsa toplanan kanıt geçersizdir."""
    import hashlib
    import json as _json

    govde = {
        k: on_kayit.get(k)
        for k in ("hipotez", "kontrol_bot_id", "tek_degisken", "mekanizma", "curutme", "karar_gunu")
    }
    return hashlib.sha256(
        _json.dumps(govde, sort_keys=True, ensure_ascii=False).encode()
    ).hexdigest()[:16]


@router.get("/hipotez")
async def hipotez(
    session: SessionDep,
    user: CurrentUser,
    gun: int = Query(30, ge=1, le=365),
) -> dict:
    """Hipotez tahtası — "hangi soru soruluyor, kanıt ne durumda?"

    Her kol iki ölçü taşır. **Mekanizma** yüksek güçlüdür, kesitseldir ve
    hüküm ondan okunur. **Sonuç** (R beklentisi) düşük güçlüdür, birikir,
    hüküm vermez ve belirsizlik aralığıyla basılır.

    Mekanizma ölçüsü tanımlanamayan kol `GÜÇSÜZ` damgası alır: sonuçlanamayacağını
    baştan ilan eder. Ön-kaydı hiç olmayan kol `ÖN-KAYIT YOK` damgası alır ve
    listede kalır — sessizlik bir durumdur, eksik ön-kayıt gizlenmez.
    """
    since = _now() - timedelta(days=gun)
    bots = (await session.execute(select(Bot).order_by(Bot.id))).scalars().all()

    # Kol defteri: katılım damgasından beri kapanan işlemler.
    islemler = (
        await session.execute(
            select(Trade.bot_id, Trade.pnl_r, Position.entry_time)
            .join(Position, Position.id == Trade.position_id)
            .where(Trade.exit_time >= since)
        )
    ).all()
    defter: dict[int, list[tuple[float, datetime]]] = {}
    for bot_id, r, giris in islemler:
        defter.setdefault(bot_id, []).append((float(r or 0), giris))

    # Mekanizma gözlemleri, ölçü başına bir kez çekilir.
    gozlem_onbellek: dict[str, dict[int, list[float]]] = {}

    kartlar = []
    for bot in bots:
        cfg = bot.config or {}
        on_kayit = cfg.get("on_kayit")
        rebase = cfg.get("rebased_at")
        rebase_dt = datetime.fromisoformat(rebase) if isinstance(rebase, str) else since
        kol_r = [r for r, giris in defter.get(bot.id, []) if giris >= rebase_dt]

        sonuc = {
            "olcu": "R beklentisi",
            "n": len(kol_r),
            "deger": round(sum(kol_r) / len(kol_r), 3) if kol_r else None,
            "belirsizlik": None,
        }
        if len(kol_r) >= 3:
            ort = sum(kol_r) / len(kol_r)
            sd = math.sqrt(sum((x - ort) ** 2 for x in kol_r) / (len(kol_r) - 1))
            sonuc["belirsizlik"] = round(1.96 * sd / math.sqrt(len(kol_r)), 3)

        if not isinstance(on_kayit, dict):
            kartlar.append(
                {
                    "bot_id": bot.id,
                    "ad": bot.name,
                    "durum": str(bot.state),
                    "damga": (
                        "ARŞİV"
                        if bot.state == BotState.STOPPED
                        else ("ÖN-KAYIT YOK" if cfg.get("deney") else "KONTROL")
                    ),
                    "on_kayit": None,
                    "mekanizma": None,
                    "sonuc": sonuc,
                }
            )
            continue

        mek_tanim = on_kayit.get("mekanizma") or {}
        olcu = mek_tanim.get("olcu")
        mekanizma: dict[str, Any] | None = None
        damga = "GÜÇSÜZ"

        if olcu in MEKANIZMA_OLCULERI:
            if olcu not in gozlem_onbellek:
                gozlem_onbellek[olcu] = await _mekanizma_gozlemleri(session, olcu, since)
            gozlemler = gozlem_onbellek[olcu]
            benim = gozlemler.get(bot.id, [])
            kontrol_id = on_kayit.get("kontrol_bot_id")
            kontrol = gozlemler.get(kontrol_id, []) if kontrol_id else []
            hedef = mek_tanim.get("hedef")
            gereken = int(mek_tanim.get("gereken_n") or 0)
            deger = round(sum(benim) / len(benim), 1) if benim else None
            t = _t_testi(benim, kontrol)
            ulasti = (
                deger is not None
                and hedef is not None
                and (
                    deger >= float(hedef)
                    if mek_tanim.get("yon", "artis") == "artis"
                    else deger <= float(hedef)
                )
            )
            damga = (
                "KANIT TOPLUYOR"
                if len(benim) < gereken
                else ("HEDEFE ULAŞTI" if ulasti and (t or 0) >= 2 else "ÇÜRÜTÜLDÜ")
            )
            mekanizma = {
                "olcu": olcu,
                "ad": MEKANIZMA_OLCULERI[olcu][0],
                "deger": deger,
                "hedef": hedef,
                "yon": mek_tanim.get("yon", "artis"),
                "n": len(benim),
                "gereken_n": gereken,
                "kontrol_deger": round(sum(kontrol) / len(kontrol), 1) if kontrol else None,
                "kontrol_n": len(kontrol),
                "t": round(t, 2) if t is not None else None,
            }

        muhur = _muhur(on_kayit)
        kartlar.append(
            {
                "bot_id": bot.id,
                "ad": bot.name,
                "durum": str(bot.state),
                "damga": damga,
                "on_kayit": {
                    "hipotez": on_kayit.get("hipotez"),
                    "kontrol_bot_id": on_kayit.get("kontrol_bot_id"),
                    "tek_degisken": on_kayit.get("tek_degisken"),
                    "curutme": on_kayit.get("curutme"),
                    "on_kayit_at": on_kayit.get("on_kayit_at"),
                    "karar_gunu": on_kayit.get("karar_gunu"),
                    "muhur_hash": muhur,
                    "muhur_kirik": bool(
                        on_kayit.get("muhur_hash") and on_kayit["muhur_hash"] != muhur
                    ),
                },
                "mekanizma": mekanizma,
                "sonuc": sonuc,
            }
        )

    return {
        "uretim": _now().isoformat(),
        "pencere_gun": gun,
        "kartlar": kartlar,
        "olculer": [
            {"anahtar": k, "ad": v[0], "kaynak": v[1], "alan": v[2]}
            for k, v in MEKANIZMA_OLCULERI.items()
        ],
    }
