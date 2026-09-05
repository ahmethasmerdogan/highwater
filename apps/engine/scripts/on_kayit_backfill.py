"""Deney kollarının ön-kaydını `bots.config.on_kayit`'e yazar (DESIGN-V4 §8.2).

Ön-kayıt bugüne kadar belgelerde yaşıyordu: hangi kolun hangi soruyu sorduğu
`docs/KAR-TESHISI` ve `docs/KAR-MARJI-ARASTIRMASI` metinlerinde, kabul ölçütü
ise hiçbir yerde makine tarafından okunabilir değildi. Bu betik onları kolun
kendi kaydına taşır ve mühürler; mühür kırılırsa toplanan kanıt geçersizdir.

**Maraton kolları (1–6, 11, 12, 13) hiç dokunulmaz.** Onlar kontrol
kollarıdır ve 30 gün boyunca değişmez.

Mekanizma ölçüsü tanımlanamayan kol bilinçli olarak boş bırakılır: `GÜÇSÜZ`
damgasını hak eder ve sonuçlanamayacağını baştan ilan eder (MEYDAN-OKUMA
2026-09-05: 14 günlük "kontrol + 0,05R" kuralı bugünkü hızda 149 yılda
karar veriyor).
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import sys

from sqlalchemy import select

from sarnic.db.models import Bot
from sarnic.db.session import get_sessionmaker

KARAR_GUNU = "2026-09-19"
SIMDI = "2026-09-05T07:30:00+00:00"


def mek(olcu: str, hedef: float, gereken_n: int, yon: str = "artis") -> dict:
    return {"olcu": olcu, "hedef": hedef, "gereken_n": gereken_n, "yon": yon}


#: bot_id → ön-kayıt. `mekanizma` boşsa kol GÜÇSÜZ damgası alır.
ON_KAYITLAR: dict[int, dict] = {
    14: {
        "hipotez": "Kaldıraç kenarı büyütür: aynı seçim kuralı 3× notional ile "
        "aynı işaretli ama daha büyük R üretir.",
        "kontrol_bot_id": 3,
        "tek_degisken": "leverage.max_leverage 1 → 3",
        "mekanizma": {},
        "curutme": "Kaldıraç seçimi değiştirmez, yalnız ölçeği. Mekanizma ölçüsü "
        "tanımlanamaz; hüküm ancak kol defterinden okunabilir ve o kanal 149 yıl ister.",
    },
    15: {
        "hipotez": "Yarı-Kelly boyutlandırma, sabit riskten daha iyi bileşik büyüme verir.",
        "kontrol_bot_id": 3,
        "tek_degisken": "risk_pct sabit → yarı-Kelly",
        "mekanizma": {},
        "curutme": "Boyutlandırma seçimi değiştirmez; mekanizma ölçüsü yok.",
    },
    16: {
        "hipotez": "Tam-Kelly boyutlandırma yarı-Kelly'den daha hızlı büyür.",
        "kontrol_bot_id": 15,
        "tek_degisken": "Kelly kesri 0,5 → 1,0",
        "mekanizma": {},
        "curutme": "Boyutlandırma seçimi değiştirmez; mekanizma ölçüsü yok.",
    },
    17: {
        "hipotez": "Kenar 48–72 saatte olgunlaşıyor; zaman çıkışını 168 saate "
        "uzatmak pozisyonu maliyet bariyerinin üstünde tutar.",
        "kontrol_bot_id": 3,
        "tek_degisken": "exit.max_hold_hours 24 → 168",
        "mekanizma": mek("tutma_saati", 48.0, 20),
        "curutme": "Ortalama tutma süresi kontrolden anlamlı yüksek değilse (t < 2) "
        "kol zaten farklı davranmıyor; sonuç ölçüsüne bakmanın anlamı yok.",
    },
    18: {
        "hipotez": "1R'de yarıyı satmak, kalan yarının stopa dönmesini ucuzlatır.",
        "kontrol_bot_id": 3,
        "tek_degisken": "kısmi kâr: 1,0R'de %50",
        "mekanizma": mek("kismi_cikis_payi", 25.0, 20),
        "curutme": "Pozisyonların en az dörtte biri kısmi çıkış görmüyorsa kural "
        "fiilen çalışmıyor demektir.",
    },
    19: {
        "hipotez": "Kenar yalnız oynaklık ailesinde ölçüldü (IC +0,129); vol "
        "ağırlığını 60'a çıkarmak açılan pozisyonların sakinliğini yükseltir.",
        "kontrol_bot_id": 3,
        "tek_degisken": "aile ağırlığı vol 15 → 60",
        "mekanizma": mek("acilan_sakinlik", 60.0, 60),
        "curutme": "Açılan pozisyonların sakinlik yüzdeliği kontrolden anlamlı "
        "yüksek değilse (t < 2) ağırlık değişikliği seçime yansımamıştır.",
    },
    21: {
        "hipotez": "Kısmi kâr + geniş iz sürme, kalan dilimin uzun hareketi "
        "yakalamasına izin verir.",
        "kontrol_bot_id": 18,
        "tek_degisken": "iz sürme 2,0 → 2,5 ATR",
        "mekanizma": mek("kismi_cikis_payi", 25.0, 20),
        "curutme": "Kısmi çıkış payı kontrolle aynıysa tek değişken iz sürmedir "
        "ve mekanizma bu ölçüyle ayırt edilemez.",
    },
    22: {
        "hipotez": "3× risk çarpanı kenarı büyütür.",
        "kontrol_bot_id": 3,
        "tek_degisken": "risk çarpanı 1× → 3×",
        "mekanizma": {},
        "curutme": "Risk çarpanı seçimi değiştirmez; mekanizma ölçüsü yok.",
    },
    23: {
        "hipotez": "30 dakikalık kolda 5× kaldıraç daha hızlı bileşik büyüme verir.",
        "kontrol_bot_id": 5,
        "tek_degisken": "kaldıraç 1× → 5×",
        "mekanizma": {},
        "curutme": "Kaldıraç seçimi değiştirmez; mekanizma ölçüsü yok.",
    },
    24: {
        "hipotez": "Vol-ağırlıklı puanlama + 3× kaldıraç birlikte, tek başına kaldıraçtan iyidir.",
        "kontrol_bot_id": 19,
        "tek_degisken": "kaldıraç 1× → 3× (puanlama V1 ile aynı)",
        "mekanizma": mek("acilan_sakinlik", 60.0, 60),
        "curutme": "Sakinlik yüzdeliği V1'den farklıysa tek değişken kaldıraç değildir; "
        "karşılaştırma geçersizdir.",
    },
    25: {
        "hipotez": "Kapıyı 75'e indirip slotu 6'ya çıkarmak seçimi derinleştirir; "
        "ölçüldü ki en tepe %1 negatif, tatlı nokta üst %5–10.",
        "kontrol_bot_id": 3,
        "tek_degisken": "min_score 80 → 75 ve max_positions 4 → 6",
        "mekanizma": mek("acilan_sakinlik", 55.0, 60),
        "curutme": "Kapı gevşetildiği hâlde açılan pozisyonların kenar profili "
        "değişmiyorsa gevşetme yalnız gürültü ekliyor demektir.",
    },
    26: {
        "hipotez": "Sıralamanın ALT ucu (oynak ve dağınık) üst uçtan güçlü sinyal "
        "veriyor: ham medyan −133 bps, kısa açıldığında +133 bps.",
        "kontrol_bot_id": 3,
        "tek_degisken": "yön LONG → SHORT",
        "mekanizma": mek("kisa_payi", 90.0, 20),
        "curutme": "Açılan pozisyonların en az %90'ı kısa değilse kol tanımladığı "
        "deneyi yapmıyordur.",
    },
    27: {
        "hipotez": "İki yön açık olduğunda düşen piyasada da seçim gücü kullanılır; "
        "ölçüm penceresinde barların %57'si düşen bar.",
        "kontrol_bot_id": 26,
        "tek_degisken": "yön SHORT → BOTH",
        "mekanizma": mek("kisa_payi", 25.0, 20),
        "curutme": "Kısa pay %25'in altındaysa kol fiilen uzun-only çalışıyordur.",
    },
    28: {
        "hipotez": "Gece penceresinde (18–05 UTC) açılan pozisyonlar gündüz "
        "açılanlardan iyi; giriş saatini kısıtlamak kenarı korur.",
        "kontrol_bot_id": 1,
        "tek_degisken": "entry_hours 18–05 ile sınırlı",
        "mekanizma": {},
        "curutme": "Saat kısıtı kenar özelliğini değiştirmez, yalnız örneklemi "
        "böler; kesitsel mekanizma ölçüsü tanımlanamadı.",
    },
    29: {
        "hipotez": "Kapıyı 85'e çıkarıp slotu 3'e indirmek seçiciliği artırır.",
        "kontrol_bot_id": 1,
        "tek_degisken": "min_score 80 → 85 ve max_positions 4 → 3",
        "mekanizma": mek("acilan_sakinlik", 45.0, 40),
        "curutme": "Kapı yükseltildiği hâlde açılanların kenar profili kontrolle "
        "aynıysa seçicilik yalnız işlem sayısını düşürüyor demektir.",
    },
    30: {
        "hipotez": "Gece penceresi + vol 60 + kapı 82 birlikte, tek tek uygulanmalarından iyidir.",
        "kontrol_bot_id": 1,
        "tek_degisken": "üç ayar birlikte (çok değişkenli — bilinçli)",
        "mekanizma": mek("acilan_sakinlik", 60.0, 40),
        "curutme": "Sakinlik hedefi tutmazsa vol ağırlığı seçime yansımamıştır; "
        "diğer iki ayarın katkısı bu kolda ayrıştırılamaz.",
    },
    31: {
        "hipotez": "Doluluk kapısı (min_fill_ratio %25) sistemin ÖLÇTÜĞÜ kenarı "
        "eliyor: açılanların sakinlik yüzdeliği 36,0, reddedilenlerin 64,9, t = −9,20.",
        "kontrol_bot_id": 1,
        "tek_degisken": "min_fill_ratio 0,25 → 0,00",
        "mekanizma": mek("acilan_sakinlik", 60.0, 100),
        "curutme": "Kapı kapatıldığı hâlde açılan pozisyonların sakinlik yüzdeliği "
        "60'a çıkmıyorsa eleme boyutlandırmadan değil başka bir yerden geliyordur.",
    },
    32: {
        "hipotez": "Doluluk kapısı kapalı + vol 60: kenarı hem ölçüp hem elemeyi "
        "bırakmak, tek başına kapıyı açmaktan iyidir.",
        "kontrol_bot_id": 31,
        "tek_degisken": "aile ağırlığı vol 15 → 60 (doluluk kapısı ikisinde de kapalı)",
        "mekanizma": mek("acilan_sakinlik", 70.0, 100),
        "curutme": "K1'den anlamlı yüksek sakinlik gelmezse vol ağırlığının katkısı yoktur.",
    },
    33: {
        "hipotez": "Formasyon ve mum düzelticilerinin IC'si negatif ölçüldü; "
        "düzelticiyi kaldırmak seçimi iyileştirir.",
        "kontrol_bot_id": 1,
        "tek_degisken": "pattern/candle modifier kapalı",
        "mekanizma": mek("acilan_sakinlik", 45.0, 60),
        "curutme": "Düzeltici kaldırıldığı hâlde açılanların kenar profili "
        "değişmiyorsa düzeltici zaten seçimi belirlemiyordu.",
    },
    34: {
        "hipotez": "Beş kaldıraç noktası (tutma, kapı, slot, stop, ağırlık) BİRLİKTE "
        "uygulanınca kenar maliyet bariyerini aşar; tek tek uygulanınca aşmıyor.",
        "kontrol_bot_id": 1,
        "tek_degisken": "beş ayar birlikte (bilinçli çok değişkenli — faktörler "
        "birbirini şart koşuyor)",
        "mekanizma": mek("acilan_sakinlik", 60.0, 100),
        "curutme": "Açılan pozisyonların sakinlik yüzdeliği 60'a çıkmazsa vol 60 "
        "ağırlığı ve gevşek kapı seçime yansımamıştır; kalan dört ayarın etkisi ölçülemez.",
    },
    35: {
        "hipotez": "B1'in beş ayarı + iki yön: düşen piyasada da seçim gücü kullanılır.",
        "kontrol_bot_id": 34,
        "tek_degisken": "yön LONG → BOTH",
        "mekanizma": mek("kisa_payi", 25.0, 40),
        "curutme": "Kısa pay %25'in altındaysa kol B1'den farklı davranmıyordur ve "
        "iki kolun karşılaştırılması anlamsızdır.",
    },
}


def muhur(on_kayit: dict) -> str:
    govde = {
        k: on_kayit.get(k)
        for k in ("hipotez", "kontrol_bot_id", "tek_degisken", "mekanizma", "curutme", "karar_gunu")
    }
    return hashlib.sha256(
        json.dumps(govde, sort_keys=True, ensure_ascii=False).encode()
    ).hexdigest()[:16]


async def main(uygula: bool) -> None:
    async with get_sessionmaker()() as session:
        bots = {b.id: b for b in (await session.execute(select(Bot))).scalars().all()}
        yazilan = 0
        for bot_id, kayit in sorted(ON_KAYITLAR.items()):
            bot = bots.get(bot_id)
            if bot is None:
                print(f"  ! bot {bot_id} yok, atlandı")
                continue
            cfg = dict(bot.config or {})
            if "on_kayit" in cfg:
                print(f"  = bot {bot_id} zaten ön-kayıtlı, dokunulmadı")
                continue
            tam = {**kayit, "on_kayit_at": SIMDI, "karar_gunu": KARAR_GUNU}
            tam["muhur_hash"] = muhur(tam)
            cfg["on_kayit"] = tam
            olcu = (tam.get("mekanizma") or {}).get("olcu") or "GÜÇSÜZ"
            print(f"  + bot {bot_id:2d} {bot.name[:40]:42s} mekanizma={olcu}")
            if uygula:
                bot.config = cfg
                yazilan += 1
        if uygula:
            await session.commit()
        print(f"\n{yazilan} kol yazıldı." if uygula else "\nKURU KOŞU — hiçbir şey yazılmadı.")


if __name__ == "__main__":
    asyncio.run(main("--uygula" in sys.argv))
