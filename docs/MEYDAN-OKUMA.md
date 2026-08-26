# Meydan Okuma — 20.000 ₺ → 100.000 ₺

> Sahibin koyduğu hedef (2026-08-26): sistemi geliştire geliştire beş katına
> çıkarmak. Bu dosya **denemelerin defteridir.** Backtest sayfası "kaç deneme
> yaptığınızı kaydedin" diyor; kaç kez denendiği bilinmeden sonucun anlamı
> ölçülemez. Defter tutulmazsa meydan okuma bir ölçüm değil, bir hikâye olur.

## Sermaye ve hedef

| | ₺ | USDT |
|---|---|---|
| Başlangıç | 20.000 | **416** |
| Hedef | 100.000 | **2.080** |

Kur 48,08 (USDTTRY, 2026-08-26). Sistem USDT cinsindendir; ₺ karşılığı yalnızca
bu defterde tutulur ve kur değişimi hedefi kaydırır — bu kasıtlıdır, sahibin
ölçüsü ₺'dir.

**Canlı para yoktur.** Tüm emirler kağıt motordan geçer. Beş kat, kağıt üstünde
beş kattır.

## Değişiklik kuralı

Sahibin ilk kuralı "bir gün eksi yazdı, hemen başka algoritma" idi. Bu kural
sistemin yakalamak için yazıldığı hatanın kendisi: 30 işlemlik bir örneklem
hiçbir şey kanıtlamaz ve kötü güne bakıp ayar değiştirmek, sonunda o veriye
uyan bir kombinasyon bulmakla biter — keşif değil, ezber.

Yerine geçen kural, **ölçülebilir tetikleyici**:

1. Bir değişiklik ancak şu üçünden biri olduğunda yapılır:
   - Kalibrasyon yeni bir yapı gösterdi (ölçüm, önsezi değil),
   - Devre kesici tetiklendi (sistem kendi sınırını aştı),
   - En az **30 gün ve 30 işlem** dolduktan sonra kıyas sepetinin altında kalındı.
2. Her değişiklik **yeni bir strateji sürümü** doğurur; eskisi durur. Mutasyon
   değil, dallanma — böylece hangisi neyi yaptı ayrışır.
3. Aday, canlı sermayeye girmeden önce **backtest'te** sınanır. Backtest
   bedavadır, meydan okuma parası değildir.
4. Her deneme aşağıya yazılır: **ne değişti, neden, ne bekleniyordu, ne oldu.**
   Beklenti sonuçtan **önce** yazılır; sonradan yazılan beklenti her zaman tutar.
5. Kilitli dönem (`use_holdout`) ayar aramada kullanılmaz. Yalnızca nihai
   adayın son doğrulaması için, **bir kez**.

## Zemin ölçümü — 2026-08-26

Çalışan altı bot kontrol grubudur: aynı piyasayı aynı anda görürler.

Özsermaye 31.544 USDT (+%5,15), 151 kapanmış işlem, son iki gün −521 USDT
(30 işlem, ortalama −0,41R, 5/30 kazanan).

Üç ufukta kalibrasyon (365 gün):

| Ufuk | n | Spearman | Kapı farkı | t |
|---|---|---|---|---|
| 4h | 127.659 | −0,0051 | +%0,203 | 2,02 |
| 24h | 123.610 | +0,0086 | +%0,437 | 1,74 |
| 72h | 118.455 | +0,0240 | **+%1,494** | **4,11** |

Aile öngörü gücü (IC):

| Aile | Ağırlık | 4h | 24h | 72h |
|---|---|---|---|---|
| trend | 45 | −0,0120 | +0,0037 | **+0,0445** |
| momentum | 25 | −0,0303 | −0,0216 | −0,0140 |
| flow | 15 | −0,0225 | −0,0372 | −0,0442 |
| vol | 10 | **+0,0442** | **+0,0647** | +0,0346 |
| sr | 5 | −0,0185 | −0,0443 | **−0,0833** |

### Üç bulgu

1. **İlişki düz değil, U şeklinde.** Desil ortalamaları her ufukta aynı deseni
   veriyor: uçlar yüksek, orta çökük (72h: `1.72 1.13 0.83 0.91 1.15 1.08 1.18
   1.68 1.81 1.98`). Spearman bir U'da tanım gereği sıfır çıkar; "öngörü gücü
   yok" hükmü monotonluk varsayan bir istatistikten geliyor ve veri o varsayımı
   çiğniyor. Sistem yalnızca ≥80 alıyor, yani U'nun **yükselen sağ yarısında**
   çalışıyor — bu, `EntrySpec` içinde belgelenen "az slot daha iyi, çünkü kenar
   puanla artıyor" ölçümüyle birebir örtüşüyor.
2. **Kenar ufukla büyüyor**, 72 saatte olgunlaşıyor. Botlar ise `score_exit: 60`
   yüzünden saatler içinde çıkıyor (son iki günün 30 çıkışının 10'u SCORE).
3. **Ağırlıklar ölçülen güçle neredeyse ters orantılı.** Puanın %70'i, ölçüldüğünde
   sıfır (trend @24h) ya da negatif (momentum) çıkan iki aileden geliyor; tek
   istikrarlı pozitif olan `vol` %10 alıyor.

### İki uyarı — sonuç okunurken unutulmamalı

- **72h getirileri saatlik örneklendiği için pencereler örtüşüyor.** Etkin
  örneklem 886 bardan çok daha küçüktür; t=4,11 olduğundan iyimserdir.
- **U'nun iki ucu yüksek volatiliteli coinler olabilir.** O zaman kazandığımız
  şey seçicilik değil **volatilite betasıdır.** `vol` ailesinin tek istikrarlı
  pozitif olması bu şüpheyi güçlendiriyor. Rastgele portföy kıyası tam olarak
  bunu ayırt etmek içindir ve her adayda okunacaktır.

### Dokunulmayacaklar

Motorda **ölçülmüş** ve gerekçesi yazılı olan üç şey; bunlar önsezi ile
oynanmaz:

- **Kapı 80.** (70: +%0,008 → 80: +%1,699, t=+4,26; zaman dilimine göre
  çevirisi `EntrySpec` içinde.)
- **Az slot daha iyi.** (2→+%18,5 … 6→+%6,3, monoton.)
- **`breakeven_r × stop_atr_multiple ≈ 2 ATR`.** 2026-08-18'de bu çarpım
  5 ATR'ye fırlayınca sistemin kârlı olan tek tarafı — 19 trailing çıkışı,
  +213 — sessizce kapandı.

---

## Deneme defteri

### Deneme 1 — 2026-08-26 · dört hipotez, backtest

Strateji **Meydan Okuma** (#12). Her sürüm tek bir şeyi değiştirir ki hangisinin
işe yaradığı ayrışsın.

| Sürüm | Değişiklik |
|---|---|
| #59 H0 | kontrol — çalışan "trend ağırlıklı" ayarın kopyası |
| #60 H1 | `score_exit: 60 → 0` (72 saate kadar tutulur) |
| #61 H2 | ağırlıklar `trend 55 / vol 45`, negatif IC'li üç aile sıfır |
| #62 H3 | H1 + H2 |

**Neden bunlar:** ikisi de motorda ölçülmemiş tek iki alan. Kapı, slot sayısı ve
çıkış merdiveni ölçülmüş ve belgelenmiş; ağırlıklar ve `score_exit` değil.

**Beklenti (sonuçtan önce yazıldı):** H1 işlem sayısını düşürüp işlem başına
getiriyi artırır; H2 kenarı keskinleştirir ama işlem sayısını fazla düşürmez;
H3 ikisinin toplamı kadar olmaz — çünkü ikisi de aynı kenarı hedefliyor.
**Ana risk:** dördü de rastgele portföyü geçemez, yani hepsi volatilite
betasıdır.

**Koşu:** 365 gün, 416 USDT, havuz otomatik, formasyonlar açık. Havuz fotoğrafı
10 günden eskiye gitmediği için koşular "yaklaşık evren" damgası alacak —
mutlak getiriler iyimser, ama dördü de aynı evreni gördüğü için **göreli sıra**
geçerli.

**Sonuç:** _(koşular sürüyor)_
