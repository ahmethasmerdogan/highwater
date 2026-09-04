# Kâr teşhisi — maraton dönemi, tüm kollar (2026-09-04)

> Soru: "Çok fazla bot zararda, kârda olanlar da az kârda — atladığımız bir şey mi var?"
> Yöntem: 31 Ağu 22:15Z'den bu yana kapanan **69 işlem** (19 kol, 28 sembol, arşivler hariç),
> 117 giriş dolumu, 6.829 canlı puan satırı, 125 sembollük evren. Her sayı DB'den;
> betik `scratchpad/kar_analizi.py`.

## 1. Kısa cevap

Atlanan şey tek bir şey değil, dört şeyin üst üste binmesi:

1. **Bileşik puanın kenarı yok; kenar yalnız `vol` ailesinde.** Canlı IC (kesitsel rank,
   24s ileri): `vol` +0,105 (t +10,8), `momentum` −0,054 (t −3,1), `trend` +0,006,
   `flow` −0,006, `sr` −0,019, **bileşik puan −0,010**. Faz 0a'daki bulgunun canlıda
   aynen tekrarı. Ağırlıkların %55'i (trend 30 + momentum 25) sıfır ya da negatif
   öngörülü ailelerde.
2. **Kapı 80–82 arası girişler zarar, 85+ kâr.** Puan (80,82]: 29 işlem, −52 $, kazanma
   %28. (85,90]: 5 işlem, +23 $, kazanma %60, +1,43R. Kapıyı geçen sembollerin 24s ileri
   getirisi evrenin ALTINDA (−122 bps vs +131 bps): puan 1–4 saatlik sürüklenmeyi
   yakalıyor, 24 saatte tersine dönüyor.
3. **06–12 UTC girişleri kaybediyor.** 29 işlem (tümünün %42'si), −51 $, −0,53R, kazanma
   %24. 18–24 UTC: +0,61R, kazanma %62. 00–06: +0,18R. Backtest H1 ile aynı yönde.
4. **Filo tek bir bahis.** 19 kol aynı puanı üretip aynı sembolü alıyor: LINKUSDT 11
   kolda −52 $ (ortalama −1,08R). Kollar arası "çeşitlendirme" yok; bir sinyal
   kaybedince bütün filo kaybediyor.

Sorun olmayanlar (ölçüldü, temize çıktı): **maliyet** (komisyon+borç brüt hareketin %8,5'i,
işlem başına ≈0,09R), **dolum** (giriş dolumu karar barı kapanışından ortalama 4 bps
aleyhte, p90 34 bps), **piyasa** (evren eşit-ağırlık +%1,97, BTC +%1,08 — yukarı
piyasada uzun-only kaybettik, yani rejim bahanesi yok), **stop genişliği** (aşağıda),
**tokenize hisseler** (6 işlem, +14 $).

## 2. İşlem defteri

| Kesit | n | net $ | ort R | kazanma |
|---|---|---|---|---|
| Hepsi | 69 | −69,0 | −0,08 | %35 |
| STOP | 27 | −121,4 | −1,09 | %0 |
| TRAILING | 14 | +38,8 | +0,75 | %93 |
| SCORE | 19 | +45,3 | +0,75 | %53 |
| BREAKEVEN | 6 | −2,8 | −0,11 | %0 |
| tutma < 2 s | 10 | −53,4 | −0,64 | %20 |
| tutma 2–6 s | 24 | −76,6 | −0,71 | %13 |
| tutma 6–12 s | 18 | +29,0 | +0,33 | %44 |
| tutma 24–72 s | 12 | +42,8 | +1,01 | %83 |
| 15m kolu | 20 | −29,5 | −0,29 | %35 |
| 30m kolu | 12 | +10,6 | +0,82 | %58 |

Kazanan ortalaması +1,23R (24), kaybeden −0,78R (45); beklenti −0,08R. Kazananlar
MFE'nin %60'ını yakalıyor (2,05R'ye ulaşıp 1,23R'de kapanıyor); +1R'ye ulaşıp eksi
kapanan işlem oranı yalnız %7 — çıkış kuralları makul, sorun girişte.

## 3. Stop dar mı? Hayır.

STOP ile kapanan 27 işlemde, stop sonrası fiyat 6 saatte ortalama **%0,02** hareket
etmiş; yalnız %7'si giriş fiyatına dönmüş. Stop olmasaydı 6 saat sonra ortalama
−1,05R, 24 saat sonra −0,68R (yalnız %15'i artıda). Kaybeden işlemlerin MAE medyanı
−1,01R (yani tam stop). Kazananların %32'si MAE ≤ −0,5R gördü: daha dar stop
kazananların üçte birini öldürürdü. Sonuç: 2 ATR stop görevini yapıyor; ne
genişletmek ne daraltmak kazandırır. Kayıp, girişin kendisinde.

## 4. Öneri — ölçüm, sonra kol

Maraton kolları 30 gün boyunca dokunulmaz; bulgular yeni kollarla ve holdout'lu
taramayla sınanır (ön-kayıt kuralı: in-sample VE holdout ≥ kontrol + 0,05R, düşüş ≤ 1,2×).

| Hipotez | Canlı kanıt | Önceki tarama (18 gün) | Yeni sınama |
|---|---|---|---|
| vol-ağır puan (vol 60) | V1 filo lideri (+%1,6), A3 en kârlı agresif (+25 $) | "ablasyon vol=0" en kötü | kol var: V1/A3; şerit H'de vol 75 ve momentum 0 |
| momentum = 0 | IC −0,054 (t −3,1) | in +1,49, holdout −0,37 (6 işlem) | şerit H |
| kapı 82 / 85 | (82,90] +18 $, (80,82] −52 $ | kapı 82: +2,58%/işlem; kapı 85: 4 işlem | şerit H + kol N2 |
| gece girişi (18–06) | 06–12: −0,53R; 18–24: +0,61R | E şeridi: park (holdout küçük) | şerit H + kol N1 |
| birleşik: gece + vol-ağır + kapı 82 | üçü birden | — | şerit H + kol N3 |

Yeni kollar (400 $, deney, 14 gün eleme kuralı): **N1** gece penceresi (18–05 UTC),
**N2** kapı 85 · 3 slot, **N3** gece + vol 60 + kapı 82. Şerit H uzun pencerede
(veri izin verdiği kadar geriye) in-sample/holdout ile koşar; sonuç deftere.

## 5. Dürüstlük notu

69 işlem az; kesitler 5–30 işlemlik. Yön ve büyüklük tutarlı (Faz 0a IC, 18 günlük
tarama, canlı defter üçü aynı şeyi söylüyor), ama tek başına hiçbiri "kanıt" değil.
Bu belge bir kararın gerekçesi değil, bir ölçüm programının gerekçesidir.
