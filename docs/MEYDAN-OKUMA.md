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

**Sonuç:** _(koşular sürüyor — 120 güne indirildi; 365 gün koşu başına 30+ dk
sürüyordu ve dört hipotez için iterasyon hızını öldürüyordu.)_

---

### Ara bulgu — 2026-08-26 · "U şekli" benim hatammış

Backtest'ler koşarken kalibrasyonu ham veriden yeniden hesapladım ve **kendi
bulgumu çürüttüm.**

Kalibrasyon ucu desilleri **havuzlanmış** hesaplıyor. Puan ise kesitsel bir
ölçüdür — aynı bar içindeki diğer coinlere göre sıradır. Desil de o yüzden
**bar içinde** hesaplanmalı. Doğru yapıldığında U kayboluyor; ilişki üst yarıda
düzgün artıyor.

Daha önemlisi: her barın kesitsel ortalaması çıkarılınca kenar **ayakta
kalıyor.**

| Dilim | Ort. puan | `vol` ailesi | Ham % | Piyasa-nötr % | ± s.h. |
|---|---|---|---|---|---|
| 1 | 28,3 | 5,78 | 1,214 | −0,109 | 0,117 |
| 2 | 36,6 | 6,93 | 1,160 | −0,158 | 0,077 |
| 8 | 59,9 | 7,55 | 1,659 | **+0,255** | 0,105 |
| 9 | 64,5 | 7,52 | 1,503 | +0,112 | 0,106 |
| 10 | 72,2 | 7,66 | 1,650 | **+0,261** | 0,100 |

Üst dilimler piyasadan arındırıldıktan sonra da pozitif (t=2,4 ve 2,6), alt
dilimler negatif. `vol` ailesi ortalaması dilimler arasında **düz** — üst
dilimler daha volatil coinler değil.

**Volatilite betası şüphesi çürüdü.** Sistem gerçekten seçiyor. Zemin ölçümünde
yazdığım ikinci uyarı geçersizdir; birincisi (örtüşen pencereler) durmaya devam
ediyor.

### Ara bulgu — kenar tamamen 72 saatlik bir olay

Kapının üstünde (puan ≥ 80), piyasadan arındırılmış:

| Ufuk | n | Getiri | ± s.h. | t |
|---|---|---|---|---|
| 4h | 746 | +%0,054 | 0,128 | 0,42 |
| 24h | 741 | −%0,045 | 0,345 | −0,13 |
| **72h** | 709 | **+%1,234** | 0,451 | **2,74** |

4 ve 24 saatte hiçbir şey yok.

Canlı işlemler bunun aynadaki görüntüsü:

| Tutma | Adet | Ort. R | Toplam |
|---|---|---|---|
| 0–8 saat | 74 | −0,012 | −13,65 |
| 8–24 saat | 44 | +0,229 | −37,46 |
| 24–60 saat | 32 | **+2,798** | **+1.547,88** |
| 60+ saat | 1 | +8,981 | +204,13 |

151 işlemin 118'i (%78) 24 saat dolmadan kapanıyor ve net −51 USDT getiriyor.

**Tuzağa düşmemek için not:** kazananlar doğası gereği uzun tutulur (trailing
çalışır), kaybedenler stopla erken çıkar — yani bu tablo tek başına "uzun tut"
demez. Uzun tutmanın temiz kanıtı yukarıdaki **gözlem seviyesi** ölçümdür;
orada işlem seçimi yoktur, kapıyı geçen her gözlem sayılır.

**Teşhis:** kusur çıkış kuralında değil, **stop mesafesinde.** Stop, karar
diliminin (1 saat) ATR'sinden hesaplanıyor ama tez 72 saatlik. 2×ATR(1h) stop
üç günlük gürültü bandının içinde kalıyor:

```
STOP  51 işlem  medyan 4,7 saat  −1.246,67  ort −1,10R
```

Median 4,7 saat — stop, gürültünün içinde.

---

### Deneme 2 — 2026-08-26 · stop ufka uydurulur

| Sürüm | Değişiklik |
|---|---|
| #63 H4 | `stop_atr 2,0 → 4,0`, `breakeven_r 1,0 → 0,5`, `trail_atr 4,0`, `max_stop_pct 0,08 → 0,15` |
| #64 H5 | H4 + `score_exit → 0` |

**18 Ağustos kuralına uyuldu:** `breakeven_r × stop_atr = 0,5 × 4,0 = 2,0 ATR`.
Çarpım korunmasaydı trailing merdiveni yine sessizce ölecekti.

`max_stop_pct` de yükseltildi: 4 ATR'lik stop volatil coinlerde %8 tavanını
aşıp işlemi tamamen düşürürdü, bu da seçimi düşük volatiliteli isimlere doğru
sessizce çarpıtırdı.

**Beklenti (sonuçtan önce):** H4 stop çıkışlarını azaltıp ortalama tutma
süresini 24 saatin üstüne taşır; işlem sayısı düşer, işlem başına getiri artar.
Toplam getirinin artması **kesin değil** — daha geniş stop, kaybeden işlemde
daha büyük kayıp demektir. Asıl sınav budur.
**Ana risk:** geniş stop, kaybedenleri de büyütür ve düşüş (drawdown) derinleşir.


### Ara bulgu — `score_exit` gerekçesiz kesiyor

Backtest beklemeden, gözlem verisiyle doğrudan sınandı. Kapıyı geçen (≥80)
gözlemler, **6 saat sonraki** puanlarına göre gruplandı:

| 6. saatteki puan | n | 72h piyasa-nötr | ± s.h. |
|---|---|---|---|
| < 60 — `score_exit` tetiklerdi | 23 | **+%6,343** | 4,090 |
| 60–80 | 483 | +%0,322 | 0,549 |
| ≥ 80 | 200 | +%2,628 | 0,722 |

Puanı çöken grup **en yüksek** ileri getiriyi veriyor. n=23 ve t=1,55 olduğu
için "kesinlikle iyi" denemez — ama kuralın gerekçesi puan düşüşünün **kötü**
getiri haber vermesidir ve burada onun izi bile yok.

Mekanizma muhtemelen şu: puan çökmesi çoğunlukla fiyatın sert koşmuş olması
demek (momentum/trend özellikleri sıçramadan sonra geri çekilir); coin sırada
geriliyor ama hareketi sürebiliyor.

**Yöntem notu:** burada geleceğe (giriş sonrası puana) koşullanılıyor. Bu
kasıtlıdır ve doğrudur: değerlendirilen kuralın kendisi de o bilgiyi kullanıyor.

Yan bulgu: puanı ≥80'de **kalan** grup +%2,628 (t=3,6) — yüksek puanın
kalıcılığı gerçek bir sinyal.

### Ara bulgu — meydan okumayı yanlış tabana kurmuşum

Canlıda altı bot zaten farklı ayarlarla çalışıyor; bu bedava bir kontrol
grubudur ve okunması gerekiyordu. Okuyunca ağırlık kümesine göre net bir ayrım
çıktı:

| Bot | Bar | İşlem | Ort. saat | K/Z | Ort. R | Komisyon |
|---|---|---|---|---|---|---|
| 15 dakika | 15m | 44 | 7,3 | +564,28 | 0,361 | 99,98 |
| **taban** | 1h | 27 | 16,6 | +461,32 | **1,469** | 38,52 |
| **seçici** | 1h | 19 | 18,0 | +245,37 | **1,368** | 38,04 |
| trend ağırlıklı | 1h | 37 | 16,6 | +219,20 | **0,310** | 54,11 |
| 30 dakika | 30m | 24 | 10,1 | +210,73 | 0,613 | 38,26 |
| 4 saat | 4h | 0 | — | — | — | — |

Ayrım ağırlık kümesinde:

* **Varsayılan** (trend 30 / mom 25 / flow 20 / vol 15 / sr 10) → botlar 1, 2, 6
* **Trend ağırlıklı** (45 / 25 / 15 / 10 / 5) → botlar 3, 4, 5

Varsayılan kümedeki iki bot 1,47R ve 1,37R; trend ağırlıklı üçü 0,31R, 0,36R ve
0,61R. Üç bota karşı üç bot — tek botluk şans değil.

**H0'ı trend ağırlıklı sürümün (53) üstüne kurmuştum, yani üç 1h botun en
kötüsünün.** Geniş-stop hipotezleri de o tabandan klonlandı.

Bu ayrıca **H2'yi çürütüyor.** H2 trend ağırlığını 55'e çıkarıyordu; canlı veri
tam ters yönü gösteriyor. Kendi IC ölçümümü yanlış okumuşum: IC her ailenin
**tek başına** öngörü gücüdür, puan ise korelasyonlu ailelerin bileşimidir. Tek
başına negatif IC'li bir aile bileşimde gürültü kırarak katkı verebilir.
Univariate IC'ye bakıp ağırlık dağıtmak bu yüzden yanlış.

**Düzeltme:** deney 2×2 faktöriyele çevrildi.

| | mevcut çıkış | iyileştirilmiş çıkış (geniş stop + puan-çıkışı yok) |
|---|---|---|
| **trend ağırlıklı** | koşu #12 (H0) | H5 · sürüm #64 |
| **varsayılan** | G0 · sürüm #65 | G1 · sürüm #66 |

Böylece üç soru birden cevaplanıyor: hangi ağırlık kümesi, çıkış rejimi işe
yarıyor mu, ve ikisi etkileşiyor mu.

### Ara bulgu — 4 saatlik bot 7 gündür tek pozisyon açabilmiş

Bot çalışıyor: her barda 87 sembol puanlıyor. Ama girişler reddediliyor:

```
"MSTRBUSDT giriş reddedildi: stop çok uzak (%14.7 > %8)"
```

`max_stop_pct = 0,08` bir saatlik ATR'ye göre ayarlanmış. 4 saatlik barda ATR
çok daha büyük ve 2×ATR(4h) stop %14–15 çıkıyor, tavana takılıyor.

Bu, `EntrySpec` içinde kapı için yazılmış tuzağın aynısı: *"Yeni bir karar
dilimi eklerken bu hesap yapılmadan 80 kopyalanmamalı."* Kapı çevrilmiş,
`max_stop_pct` çevrilmemiş.

Reddedilen giriş sayısı: bot 3 (1h) 39, bot 6 (4h) 11, bot 4 (15m) 9,
bot 5 (30m) 5, bot 2 (1h) 2, bot 1 (1h) 1.

**Değiştirmedim** — bot kullanıcının kontrol grubunun parçası ve ayarını
uykusunda değiştirmek 7 günlük veriyi başka bir şeye çevirirdi. Düzeltme
hazır: 4 saatlik bot için `max_stop_pct` ~0,15'e çıkarılmalı (G1/H5
sürümlerinde zaten böyle).

### Kazanan seçme kuralı — sonuçlar görülmeden yazıldı

Sonradan yazılan bir kural her zaman kazananı haklı çıkarır. Bu yüzden dört
koşu bitmeden önce sabitleniyor:

1. **Rastgele portföyü geçmeli** (temel maliyet senaryosu). Geçemiyorsa kazanç
   seçimden değil, sadece sık işlem yapmanın mekanik etkisindendir.
2. **2x maliyet senaryosunda da pozitif kalmalı.** Yalnızca iyimser maliyet
   varsayımıyla kâr eden bir strateji kırılgandır.
3. **En az 30 işlem** üretmeli. Altındaysa sonuç bir-iki işleme bağlıdır.
4. Bu üçünü geçenler arasından **en yüksek toplam getiri** seçilir.
5. Kırmızı bayraklar bilgilendiricidir; işaretli bir sonuç ekstra incelenir ama
   kendiliğinden elenmez — "çok az işlem" zaten 3. maddede.

**Hiçbiri geçemezse:** meydan okuma botu backtest'le optimize edilmiş bir ayara
değil, **canlıda en iyi ölçülen** ayara kurulur (bot 1'in ayarı = G0, sürüm
#65) ve ölçmeye devam edilir. Backtest'in söyleyecek bir şeyi yoksa, uydurmak
yerine canlı kanıta düşmek doğru davranıştır.

---

## Meydan okuma başladı — 2026-08-26 03:1x

**Bot #7 · "MEYDAN OKUMA · 20k₺→100k₺" · 416 USDT · sürüm #66 (G1) · 1h**

### Neden backtest bitmeden kuruldu

Bir backtest koşusu ~85 dakika sürüyor (üç maliyet senaryosu ayrı ayrı simüle
ediliyor); dördü sabaha yetişmiyordu. Kazanan seçme kuralının yedek maddesi
uygulandı: backtest karar veremiyorsa canlıda en iyi ölçülen ayara düşülür.

Ama **G0 zaten canlıda çalışıyor** — bot 1 birebir o ayar. Kopyasını kurmak
hiçbir şey öğretmezdi. Bunun yerine bot #7, G0'ın üstüne iki **ölçülmüş**
değişiklik ekleyen G1 ile kuruldu:

| Değişiklik | Dayanağı |
|---|---|
| stop 2 → 4 ATR, başabaş 1,0 → 0,5R | Kenar yalnız 72h'te (+%1,234, t=2,74); 4h ve 24h'te sıfır. Stoplar medyan 4,7 saatte tetikleniyor — gürültünün içinde. Çarpım 2,0 ATR korundu (18-08 dersi). |
| `score_exit` 60 → 0 | Puanı 60'ın altına çöken grup en yüksek ileri getiriyi veriyor (+%6,3), en düşüğünü değil. Kuralın dayanağı yok. |
| `max_stop_pct` 0,08 → 0,15 | 4 ATR'lik stop eski tavana takılıp işlemi tamamen düşürürdü — 4 saatlik botun 7 gündür susmasının sebebi tam olarak bu. |

Böylece **bot 1 (G0) ile bot 7 (G1) canlı bir A/B oluyor**: aynı havuz, aynı
barlar, aynı an. Bu, iki ayarı karşılaştırmanın en dürüst yolu.

### Bunu geri alacak şey

G1 koşusu (#sürüm 66) hâlâ kuyrukta. Backtest G1'i kontrolün belirgin altında
gösterirse bot durdurulup G0'a çevrilir. Bu satır, sonucu görmeden yazıldı.

### Takip

Panele **Meydan Okuma** sayfası eklendi (`/meydan-okuma`): hedefe uzaklık,
kontrol grubuyla karşılaştırma ve sistem yükü. Uca `/system/load` eklendi —
çekirdek baskısı görünmeden hangi botun durdurulacağına karar verilemezdi.

Sayfa botu **adından** tanır (`MEYDAN OKUMA` ile başlayan). Bot silinir ya da
yeniden adlandırılırsa sayfa bunu sessizce boş göstermez, açıkça söyler.

Durdurma adayı sıralaması **ortalama R**'ye göredir; TL kârına göre değil.
Farklı sermayeli botları TL kârıyla sıralamak, büyük sermayeliyi otomatik
kazandırır. Hiç işlem kapatmamış botlar sıralamaya **girmez**: ortalama R'leri
yoktur, yani kötü değil **ölçülmemiştir** ve ikisini karıştırmak yanlış botu
durdurur.

### Sürücü hataları — 2026-08-26 gecesi

Backtest kuyruğunu yürüten yardımcı betikte üç hata yaptım. Hiçbiri veriyi
bozmadı ama kuyruğu saatlerce boşa beklettiler; kaydı burada dursun.

**1. Jeton tazelenmiyordu.** İlk sürücü tek bir erişim jetonuyla koşuyu
bekliyordu; jeton 30 dakikada doluyor, koşu ondan uzun sürüyor. `401 Oturum
süresi doldu` ile düştü. Çözüm: durum artık veritabanından okunuyor, uca
yalnızca koşu başlatmak için gidiliyor ve her seferinde taze giriş yapılıyor.

**2. İki sürücü aynı anda çalışıyordu.** Birini durdurduğumu sanmışım;
durdurmamışım. İkisi de aynı kuyruğa koşu göndermeye çalıştı ve birbirlerine
`409` verdirdiler.

**3. Zaman aşımı tavanı çok kısaydı.** 80 dakikaya ayarlamıştım; 120 günlük bir
koşu **üç maliyet senaryosunu ayrı ayrı simüle ettiği için** 90 dakikayı
aşabiliyor. Sürücü pes etti, koşu devam etti — yani sürücü koşuyu "başarısız"
sandı ama backtest sağ salim sürüyordu. Tavan 3 saate çıkarıldı.

**Ders:** yardımcı betikler de ölçülmeden doğru sayılmıyor. Üçü de "çalışıyor
görünüp sessizce beklemek" biçiminde bozuldu — en pahalı bozulma türü.

### Backtest penceresi küçültüldü — ve bunun sebebi bir bulgu

120 günlük koşu **4 saat 25 dakikada bitmedi** ve durduruldu. Bitmemiş bir
koşunun değeri sıfırdır. Hızlandırma denemesi sırasında iki şey öğrenildi:

**1. Formasyon motoru tek başına darboğaz değil.** 10 günlük koşu formasyonlar
kapalıyken 285 saniye sürdü; sabit maliyet (100 sembol × 5 zaman dilimi veri
yükleme + gösterge ön hesabı) büyük pay alıyor. Formasyonlar süreyi kabaca üçe
katlıyor ama tek suçlu değiller.

**2. Formasyonlar kapalıyken karşılaştırma geçersiz.** Aynı 10 günde formasyonlar
kapalı koşu **2 işlem** üretti; canlıda aynı sürede botlar 27–37 işlem yapıyor.
Yani formasyonların puana katkısı *büyüklük olarak* küçük olsa da, puanlar 80
eşiğinin hemen altında kümelendiği için **kapıyı geçmeyi fiilen onlar
belirliyor.** "Katkı küçük, kapatıp hızlanalım" akıl yürütmesi bu yüzden yanlış.

**Sonuç: pencere 9 güne indirildi, formasyonlar açık bırakıldı.**

Bu aynı zamanda **daha dürüst** bir pencere. Havuz fotoğrafları 2026-08-15
02:08'de başlıyor; 120 günlük koşuların %90'ı yeniden kurulmuş evren kullanıyor
ve hayatta kalma yanlılığı taşıyor. 9 günlük pencere (16–25 Ağustos) tamamen
gerçek snapshot'ların içinde kalıyor.

Bedeli açık: örneklem küçük. Kazanan seçme kuralının 3. maddesi (en az 30 işlem)
bu pencerede muhtemelen sağlanamayacak — o zaman kural gereği backtest karar
vermez ve **canlı A/B** (bot 1 = G0, bot 7 = G1) belirleyici olur. Kuralı
sonuçları görmeden yazmanın işe yaradığı yer tam burası.

### Deneme 2 sonucu — G1, 9 gün, gerçek evren

Koşu #15 · 16–25 Ağustos · `approximate_universe = false` (gerçek
point-in-time havuz) · formasyonlar açık · 416 USDT.

| Senaryo | Getiri | İşlem | Kazanma | Azami düşüş | Beklenti |
|---|---|---|---|---|---|
| base | **+%10,222** | 7 | %57,1 | −%2,10 | +1,618R |
| 1.5x | +%9,831 | 7 | %57,1 | −%2,21 | +1,562R |
| 2x | +%9,441 | 7 | %57,1 | −%2,32 | +1,509R |

**Kazanan seçme kuralı uygulandı:**

1. Rastgele portföyü geçmeli → **✓** (rastgele −%0,829, strateji +%10,222)
2. 2x maliyette pozitif kalmalı → **✓** (+%9,441)
3. En az 30 işlem → **✗ yalnızca 7 işlem**

**Kural gereği G1 nitelenmiyor.** Sistem de aynı şeyi kendi ağzıyla söylüyor:

```
Yalnızca 7 işlem. Bu örneklemde hiçbir metrik güvenilir değildir.
Sharpe 15.33 > 3.0. Bu bir kutlama sebebi değil, hata şüphesidir.
```

Sharpe 15,33'ü kimse ciddiye almamalı: 9 gün ve 7 işlemle yıllıklandırılmış
Sharpe anlamsızdır. Motor bunu doğru işaretliyor.

### Asıl ayıltıcı sayı — kıyaslar

| | 9 günlük getiri |
|---|---|
| BTC al-tut | **+%22,826** |
| Eşit ağırlıklı likit-100 al-tut | **+%20,897** |
| **Strateji (G1)** | **+%10,222** |
| Devir-eşleştirilmiş rastgele portföy | −%0,829 |

Bu pencerede piyasa ~%21 yükselmiş; strateji onun **yarısını** almış.

İki okuma birbirini kesmiyor ve ikisi de doğru:

* **Seçim değer katıyor.** Aynı devir hızıyla rastgele seçmek −%0,83 veriyor,
  puanlamayla seçmek +%10,22. Aradaki 11 puan sıralamanın işidir.
* **Ama sepeti öylece tutmak daha iyiydi.** Yükselen bir piyasada seçici olmak,
  parayı kenarda bekletmek demek; 4 slot ve %80 maruziyet tavanıyla sürekli
  tam yatırımda olunmuyor.

Kıyas sepeti tam olarak bunu görünür kılmak için var ve görevini yaptı. Dokuz
gün hiçbir şey kanıtlamaz — ama "beş kat" hedefine giden yolda, seçiciliğin
maliyeti olan bu boşluk ölçülmeden geçilmemeli.

### Kontrol koşusu — G0, aynı pencere, aynı evren

Koşu #16 · aynı 9 gün · aynı gerçek havuz · aynı formasyon ayarı.

| | **G1** geniş stop | **G0** kontrol |
|---|---|---|
| Getiri (base) | **+%10,222** | +%4,045 |
| Getiri (1.5x) | **+%9,831** | +%3,458 |
| Getiri (2x) | **+%9,441** | +%2,875 |
| İşlem | 7 | 10 |
| Kazanma | %57,1 | %50,0 |
| Azami düşüş | **−%2,10** | −%2,61 |
| İşlem başına beklenti | **+1,618R** | +0,413R |
| Komisyon | 1,99 | 3,19 |

G1 her boyutta önde: 2,5 kat getiri, daha az işlem, daha yüksek kazanma oranı,
daha sığ düşüş, dört kat beklenti, daha az komisyon.

**Beklentiye göre:** deneme 2'de sonuçtan önce şunu yazmıştım — *"işlem sayısı
düşer, işlem başına getiri artar. Toplam getirinin artması kesin değil; geniş
stop kaybedeni de büyütür."* İlk ikisi tuttu (10 → 7 işlem, 0,41 → 1,62R).
Üçüncüsünde yanıldım: toplam getiri de arttı. Yani geniş stop, kaybedenleri
büyütmekten daha çok kazananları yaşattı.

**Ama karar hâlâ verilmedi.** 7 ve 10 işlem; ikisi de kural 3'ün altında ve
sistem ikisini de işaretliyor:

```
G1: Yalnızca 7 işlem.  Sharpe 15.33 > 3.0 — hata şüphesidir.
G0: Yalnızca 10 işlem. Sharpe  8.95 > 3.0 — hata şüphesidir.
```

Bu karşılaştırmanın değeri **yönünde**, büyüklüğünde değil. Ve yön, gözlem
seviyesindeki bağımsız ölçümle aynı yeri gösteriyor: kenar 72 saatte olgunlaşıyor
(n=709 bar, t=2,74), stoplar medyan 4,7 saatte tetikleniyordu. Bağımsız iki
kanıt aynı yönü gösterdiğinde, her biri tek başına olduğundan fazlasını söyler
— ama ikisi birlikte de "kanıtlandı" demek değildir.

**Karar:** backtest karar veremedi (kural 3). Bot #7 G1 ile çalışmaya devam
ediyor; belirleyici olan **canlı A/B** — bot 1 (G0) ile bot 7 (G1) aynı havuzu
aynı barlarda görüyor. 30 gün / 30 işlem dolduğunda kural yeniden uygulanacak.

**Her iki hipotez de kıyas sepetinin altında.** Aynı pencerede eşit ağırlıklı
al-tut +%20,897, BTC al-tut +%22,826. Seçicilik rastgeleye karşı değer katıyor
(rastgele −%0,829) ama yükselen piyasada sepeti tutmaya karşı katmıyor. Bu, beş
kat hedefine giden yolun en pahalı sorusu ve kayıtta durması gerekiyor.

---

## Deneme 3 — risk bütçesi açıldı · 2026-08-26

Sahip haklı olarak "gram ilerlemiyor" dedi. Sekiz saatte sıfır işlem, sayı
416'da duruyordu. Sebebi arandı ve bulundu.

### Bot durmuyordu, gaza basmıyordu

Boyutlandırma zinciri: `notional = risk / stop_mesafesi`, ardından
`× vol_scalar × tier × regime`, ardından tavanlar.

Ölçüldü — botlar stratejide yazan %2 riski **almıyorlar**:

| Bot | Ort. pozisyon | Stop mesafesi | Gerçekte riske edilen | Hedef |
|---|---|---|---|---|
| 1 | 704 USDT (%14) | %2,54 | 13,91 USDT (**%0,278**) | %2 |
| 2 | 994 USDT (%20) | %2,87 | 19,83 USDT (%0,397) | %2 |
| 3 | 722 USDT (%14) | %3,86 | 23,72 USDT (%0,474) | %2 |

Sebep tasarım: `vol_target = 0,60` yani strateji %60 yıllık portföy oynaklığı
hedefliyor. Alt-coinlerin gerçekleşen oynaklığı %120–200 olduğu için oran
tabana yapışıyor, üstüne kapıya yakın puanlarda `tier = 0,75` biniyor. Motorun
kendi olay kaydı da bunu yazıyor: `risk %0.8`.

Yani "+%8,73 getiri" rakamı, stratejinin öngördüğü riskin **yedide biriyle**
elde edilmişti.

### Aritmetik

| Hedef | Gereken günlük | Pozisyon çarpanı | Bot 1'in düşüşü ölçeklenirse |
|---|---|---|---|
| 1 ay | %5,51 | 4,6× | ~−%9,3 → **−%8 devre kesicisini aşar** |
| 2 ay | %2,72 | 2,3× | ~−%4,7 |
| 3 ay | %1,80 | 1,5× | ~−%3,0 |
| 5,5 ay | %1,20 | mevcut | −%2,0 (gözlenen) |

Bir ayda beş kat bir ayar meselesi değil, risk bütçesi meselesi: 4,6 katta
strateji kendi devre kesicisini tetikler ve girişleri kendi kapatır.

**Sahibin kararı: 2,3 kat → ~2 ay.**

### Kadranı yanlış önermiştim

Seçeneği "`vol_target` 0,60 → 1,40" diye sunmuştum. Sonra `VOL_SCALAR_MIN,
VOL_SCALAR_MAX = 0.5, 1.5` kelepçesini gördüm: oran zaten tabana yapışık
olduğu için `vol_target`'ı yükseltmek coin'e göre 1,4–2,3 arası değişen bir
çarpan verir, temiz 2,3 vermez. Üstelik oynaklık ayrımını da bozar.

`risk_pct` doğrusal ve kelepçesiz. Seçilen **büyüklük** aynen uygulandı, kadran
değişti: `risk_pct 0,020 → 0,046` (tam 2,3×). Stratejinin kendi doğrulayıcısı
`(0, 0.05]` diyor; 0,046 tavanın %92'si. **Bundan sonrası için kadran yok.**

### Uygulama

| | |
|---|---|
| Sürüm | #67 (G2) = G1 + `risk_pct 0,046` |
| Bot | #8 · MEYDAN OKUMA · 20k₺→100k₺ · 416 USDT · 1h |
| Emekli | #7 → ARŞİV (hiç işlem yapmadı, sürümü değiştirilemiyor) |

`BotUpdate` yalnızca ad ve sermaye değiştirmeye izin veriyor; strateji sürümü
değiştirilemediği için yeni bot kuruldu ve eskisi arşive alındı — sayfa botu
adından tanıdığı için aynı önekten iki tane olmamalı.

### Beklenti (sonuçtan önce)

Günlük bileşik oran %1,20'den ~%2,7'ye çıkar; azami düşüş −%2'den −%5
civarına derinleşir ve −%8 günlük devre kesicisinin altında kalır. **Ana risk:**
ölçüm penceresi (19–26 Ağustos) sepetin %21 yükseldiği bir dönemdi; yatay ya da
düşen piyasada aynı çarpan kaybı da aynı oranda büyütür ve bu senaryo hiç test
edilmedi.

**Dokunulmayanlar:** kapı 80, slot sayısı 4, `breakeven_r × stop_atr = 2 ATR`,
ağırlıklar. Yalnızca tek bir sayı değişti.

---

## Deneme 4 — kapı ağırlık kümesine çevrildi · 2026-08-26 akşam

Sahip haklıydı: bot hâlâ işlemiyordu. Risk kadranını açmak (deneme 3) hiçbir
şey değiştirmedi çünkü **sorun risk değildi.**

### Bot sinyal görmüyordu

Son 24 saat, 1 saatlik dilim:

| Ağırlık kümesi | Gözlem | Kapıyı geçen | En yüksek puan |
|---|---|---|---|
| Trend ağırlıklı (bot 3,4,5) | 1.966 | 6 | 83,7 |
| **Varsayılan (bot 1, 2, 8)** | 1.982 | **0** | **79,8** |

Varsayılan ağırlıklarla puan 24 saatte 80'e bir kez bile ulaşmamış.

Sebep motorun kendi belgesinde yazılı ama **yanlış eksende**: *"Puan mutlak bir
ölçek değil, o bardaki havuz içi yüzdelik sıraların ağırlıklı ortalamasıdır."*
Belge bunu **zaman dilimi** için söylüyor (15m için 77,3). Aynı şey **ağırlık
kümesi** için de geçerli ve kimse çevirmemiş.

Beş aileye dengeli dağılmış ağırlık ortalamayı ortaya çeker ve dağılımı
sıkıştırır; 45'i tek aileye yığmak uçları uzatır. Aynı "80" iki kümede farklı
seçicilik demek.

Belgedeki çapa (1h'te barların %0,709'u) ölçüldü:

| Ağırlık kümesi | Eşdeğer kapı |
|---|---|
| Trend ağırlıklı | **79,74** ≈ 80 ✓ |
| **Varsayılan** | **75,20** |

Yani belgedeki 80, trend ağırlıklı ölçekte kalibre edilmiş.

### Kapıyı indirmek kenarı öldürmüyor — ortaya çıkarıyor

Çıkarımla geçilmedi, gözlem verisinde doğrudan ölçüldü (piyasa-nötr, 72h):

| Ağırlık kümesi | Kapı | n | Getiri | t |
|---|---|---|---|---|
| Trend ağırlıklı | 80 | 135 | +%0,180 | **0,15** |
| **Varsayılan** | **75,2** | **2.194** | **+%0,763** | **3,27** |

Kademeler de kapının üstündeki dağılıma yeniden çapalandı (75,2 / 76,76 /
78,18). Kapıyı çevirip kademeleri 80'de bırakmak, 18 Ağustos'ta trailing
merdivenini öldüren hatanın aynısı olurdu.

### Deneme 3'ün risk artışı geri alındı

`risk_pct 0,046` ile ilk sinyal geldiğinde giriş **reddedildi**:

```
BTCUSDT giriş reddedildi: kısıtlar boyutu hedefin %17'ine düşürdü
(en az %25 gerekiyor) — slot boş bırakıldı
```

Motor haklıydı, konfigürasyon tutarsızdı. **Spot hesapta kaldıraç yok:**
%4,6 risk, %2,6'lık stopla özsermayenin **%133'ü** büyüklüğünde pozisyon
demek. `max_position_pct` %30'a kırpıyor, kırpılmış boyut hedefin %23'ü
kalıyor ve `min_fill_ratio` reddediyor.

Yani seçilen "2,3 kat" `risk_pct`'ten **gelemez**; tavan bağlıyor.

**Gerçek kaynak maruziyet.** Botlar ~%20 maruziyette çalışıyordu, tavan %80 —
çünkü slotlar boştu, çünkü sinyal yoktu. Kapı düzelince günde 10,7 sinyal var.
Slotlar dolunca %20 → %80, yani **4 kat**; istenen 2,3 katın fazlası ve işlem
başına risk hiç artmadan, dolayısıyla düşüş de orantısız büyümeden.

`risk_pct` 0,02'ye geri alındı.

### Sonuç: ilk işlem açıldı

```
BTCUSDT  qty 0,0016 @ 78.181,24 · stop 75.646,15 · risk %0,9 · R 6,77
puan 75,91 · pozisyon 125,10 USDT = özsermayenin %30,1'i
```

Pozisyon tam `max_position_pct` tavanında — boyut artık kırpılıp reddedilmiyor,
sonuna kadar kullanılıyor. Maruziyet %0 → %30,1. Nakit 290,77.

### Arşivdeki ölü botlar

| Bot | Ayar | Neden işlemedi |
|---|---|---|
| #7 | risk %2, kapı 80 | sinyal yok |
| #8 | risk %4,6, kapı 80 | sinyal yok |
| #9 | risk %4,6, kapı 75,2 | sinyal var, boyut tavana takıldı |
| **#10** | **risk %2, kapı 75,2** | **çalışıyor** |

Üç deneme, üç farklı duvar. Her biri kayıtta duruyor çünkü hangi duvarın nerede
olduğunu bilmek, doğru ayarı bilmek kadar değerli.

### Sahibin botlarına dair bulgu (değiştirilmedi)

Bot 1 ve bot 2 de aynı sakatlıkta: varsayılan ağırlık + kapı 80. Son 7 günde
6'şar işlem yapabilmişler. Aynı çeviri onlara da uygulanırsa canlanırlar — ama
onlar kontrol grubu, dokunulmadı.

---

## Yol üstünde düzeltilenler

Meydan okuma boyunca sistemde bulunan ve onarılan kusurlar. Hiçbiri strateji
ayarı değil; hepsi altyapı.

### 1. Panelin "Yeni strateji" düğmesi hiç çalışmamış — 2026-08-26

`StrategyCreate.definition` zorunluydu, panel yalnızca `{name}` gönderiyordu →
her seferinde `422`. Ekranda "varsayılan ayarlarla oluşturulur" yazdığı hâlde
oluşturulmuyordu.

Düzeltme **API tarafında**: `definition` isteğe bağlı oldu, verilmezse motorun
`StrategyDefinition()` varsayılanı kullanılıyor. Panele varsayılan gömmek iş
mantığını frontend'e sızdırmak olurdu — varsayılan motorun bilgisidir.

### 2. `make ci` kırmızıydı — 2026-08-26

16 dosya biçimsizdi ve bir alembic göçünde sıralanmamış import vardı. Projenin
kendi biçimleyicisiyle (`ruff format`) düzeltildi; davranış değişmedi,
486 test biçimlemeden önce ve sonra geçti.

### 3. `UniverseTimeline.at()` her bar için tüm snapshot arşivini tarıyordu

Backtest motorunun sıcak yolunda: her bar için snapshot listesi baştan
taranıyor **ve eşleşen her snapshot'ın sembol listesi yeniden kuruluyordu** —
yalnızca sonuncusu kullanıldığı hâlde. 2.880 barlık bir koşuda 221 snapshot ile
yüz milyonlarca gereksiz sözlük okuması demek, ve snapshot arşivi her gün
büyüyor.

İkili aramaya (`bisect_right`) çevrildi, sembol listeleri kurulumda bir kez
çıkarılıyor. Sınır davranışını kilitleyen iki test eklendi (beş snapshot ile
tam damga / ara / sonrası / öncesi, ve sırasız girdi).

### 4. `BacktestEngine._slice` ölü koddu

29 satır, hiçbir yerden çağrılmıyordu; sıcak yol `_cuts` +
`build_bundle_precomputed` kullanıyor. Kaldırıldı.

**Kalan darboğaz (düzeltilmedi):** 120 günlük bir koşu ~35 dakika sürüyor.
Sebep formasyon/S-R motorlarının pencere tabanlı olması — her bar her sembol
için yeniden hesaplanıyorlar. Bu bilinçli bir tasarım (`run_scenario` içindeki
yorumda yazılı) ve dokunmadım; ama meydan okumanın iterasyon hızını bu
belirliyor. Gerekirse `with_patterns: false` ile koşmak hipotez
karşılaştırmasını çok hızlandırır — formasyonların puana katkısı zaten
bilinçli olarak küçük.

---

## 30 günlük sayaç — 2026-08-26

Sahibin verdiği süre bugün başladı: 26 Ağustos → 25 Eylül 2026. Panel artık
kalan günü, hedefe yetişmek için **gereken günlük bileşik oranı** ve
**gerçekleşen oranı** yan yana gösteriyor (`/meydan-okuma`). Tek başına
"ne kadar kaldı" sayacı işe yaramaz; yetişip yetişmediğimizi söyleyen şey
bu iki oranın karşılaştırmasıdır.

### G5 → G6: slot sayısı 3'ten 2'ye

**G5 neydi:** kapı 75.2 · 3 slot · pozisyon tavanı %32 · maruziyet tavanı %95.
Bot #11 bu ayarla BTCUSDT açtı — 133,60 USDT, sermayenin %32,1'i. Yani
`max_position_pct` tam olarak bağladı, boyut artık `min_fill_ratio` altına
kırpılmıyor. Üç denemeden sonra ilk kez giriş zinciri baştan sona çalıştı.

Ama 3 slotun yalnızca biri doldu. Sebebini varsaymak yerine ölçtüm.

**Ölçüm 1 — aday yoğunluğu.** Bot #11'in ağırlık seti (`5a21a501e5…`) için son
240 barda, kapıyı geçen sembol sayısı:

| kapı | bar başına ort. aday | hiç adayı olmayan bar |
|---|---|---|
| 75.2 | 1,16 | %37,1 |
| 74   | 1,62 | — |
| 73   | 2,10 | %17,5 |
| 72   | 2,69 | — |
| 71   | 3,40 | %5,8 |

3 slotu doldurmak için kapı ~71 olmalıydı.

**Ölçüm 2 — kapı düşerse kenar ne oluyor.** 24 saatlik ileri getiri, her bar
için havuz ortalaması çıkarılarak (piyasa-nötr; bu olmadan ölçülen şey
seçicilik değil o günkü piyasa yönüdür):

| kapı | n | ort. nötr getiri | t |
|---|---|---|---|
| 70   | 8049 | −%0,049 | −0,71 |
| 71   | 6705 | −%0,005 | −0,06 |
| 72   | 5474 | +%0,058 | 0,65 |
| 73   | 4410 | +%0,131 | 1,29 |
| 74   | 3522 | +%0,189 | 1,64 |
| **75,2** | **2617** | **+%0,377** | **2,64** |
| 76   | 2148 | +%0,449 | 2,78 |
| 77   | 1644 | +%0,475 | 2,42 |

Kenar tamamen 75'in üstünde toplanmış. 71'de sıfır. **Boş slotu doldurmak için
kapıdan taviz verilmez** — bu, "slotlar dolmuyorsa kapıyı indir" refleksinin
ölçümle reddedilmesidir.

**Ölçüm 3 — kapıyı geçenler arasında sıra.** Geriye tek yol kalıyordu:
az sayıda iyi sinyale daha çok sermaye. Ama kaç tanesine?

| sıra | n | ort. nötr getiri | t |
|---|---|---|---|
| 1 | 1260 | +%0,506 | 2,33 |
| 2 | 775  | +%0,647 | 2,43 |
| 3 | 379  | +%0,089 | 0,25 |
| 4 | 146  | −%0,895 | −2,41 |
| 5 | 42   | −%1,181 | −1,40 |

İlk iki isim kenarı taşıyor ve ikisi birbirinden ayrılmıyor (0,506 ile 0,647,
örneklem hatası içinde). Üçüncü gürültü, dördüncü **istatistiksel olarak
anlamlı biçimde zararlı**. Bir uyarı: 4. sıra yalnızca kapıyı 4+ sembolün
geçtiği barlarda vardır, yani farklı bir piyasa durumudur — negatiflik saf
sıra etkisi olmayabilir. Yine de yön açık.

**Yapılan (sürüm #71, G6):** slot 3 → **2**, pozisyon tavanı %32 → **%48**.
2 × %48 = %96 ≈ maruziyet tavanı %95: iki isim bulunduğunda sermaye tam
çalışır. Kapı 75,2'de kaldı.

Bu, belgedeki daha kaba ölçümle de tutarlı (2 slot +%18,5 · 3 slot +%11,9 ·
4 slot +%9,5 · 6 slot +%6,3) ama artık sebebi biliniyor: az slot iyi olduğu
için değil, **3. ve 4. isimler kenarı taşımadığı için**.

### Kontrol grubunun ağırlık seti ters sinyal üretiyor

Bot #1 ve #2'nin kullandığı trend-ağırlıklı set (`374c6e6253…`) aynı pencerede
aynı yöntemle ölçüldüğünde **her kapıda negatif**, ve kapı yükseldikçe
kötüleşiyor:

| kapı | n | ort. nötr getiri | t |
|---|---|---|---|
| 70   | 1202 | −%0,479 | −2,07 |
| 73   | 775  | −%0,541 | −1,65 |
| 75,2 | 510  | −%1,265 | −2,98 |
| 77   | 359  | −%2,051 | −3,79 |

Monoton kötüleşme, rastgeleliğe benzemiyor: bu set yüksek puan verdiği isimde
sistematik olarak yanılıyor. Örneklem varsayılan sete göre küçük (510'a karşı
2617) ve tek bir pencere — ama t=−3,79 zayıf bir işaret değil.

**Değiştirmedim.** Bu botlar sahibin kontrol grubu; onları "düzeltmek"
karşılaştırmayı yok eder. Bulguyu buraya yazmak, gizlice iyileştirmekten daha
değerli.

### Ucun kendisindeki sessiz hata

Bot #11'in sürümünü `PATCH /bots/11` ile değiştirmeye çalıştım. Uç **200
döndü** ve hiçbir şey değişmedi: `BotUpdate` yalnızca `name` ve `capital`
tanıyordu, Pydantic fazlalığı sessizce atıyordu. Bu, defterdeki dört sürücü
hatasıyla aynı sınıf — *sessiz başarısızlığın başarı olarak okunması*.

İki düzeltme:
- `BotUpdate.model_config = {"extra": "forbid"}` — tanınmayan alan artık 422.
- `strategy_version_id` gerçekten düzenlenebilir alan oldu (yalnızca duran bot,
  yalnızca dondurulmuş sürüm). Yeni bot açmak da aynı sonucu verirdi ama
  özsermaye eğrisini böler; 30 günlük bir deneyde ölçüm sürekliliği daha değerli.

Üç test eklendi: sürüm değişir, taslak sürüm 409 ile reddedilir, tanınmayan
alan 422 ile reddedilir. Toplam 491 test geçiyor.

**Ayrıca:** `docker compose up -d api` yanlış hamleydi — API bu makinede
Docker'da değil, `sarnic-api.service` olarak host'ta çalışıyor. Komut boşta bir
konteyner yaratıp redis'i yeniden başlattı; marketdata bağlantılarını kaybedip
saniyeler içinde kendi kendine toparladı (`ws_connected`). Konteyner kaldırıldı.
Servisler systemd altında: `systemctl --user restart sarnic-api.service`.

### İlk bar raporu — 2026-08-26 18:00 UTC

Bar 17:00 kapandı ve puanlandı. **Yeni pozisyon açılmadı, ve bu doğru davranış.**

| sembol | puan | kapı 75,2 |
|---|---|---|
| BTCUSDT | 77,64 | geçti — zaten elde |
| MSTRBUSDT | 74,38 | geçemedi |
| ONTUSDT | 74,25 | geçemedi |
| FFUSDT | 73,10 | geçemedi |

Kapıyı geçen tek isim zaten taşınan pozisyon. İkinci slot boş kaldı çünkü aday
yoktu — bot zorlamadı. Ölçülen dağılımla tutarlı (bar başına 1,16 aday, barların
%37'sinde hiç yok). Tek bar hiçbir şeyi doğrulamaz ya da çürütmez.

Özsermaye 17:00'de 416,16 USDT (16:00'da 415,39). Maruziyet %32,2.

**Not — G6 taşınan pozisyonu değiştirmez.** Elde tutulan BTCUSDT girişte %32 ile
boyutlandı; `max_position_pct` yalnızca giriş anında uygulanır, açık pozisyon
sonradan büyütülmez. G6'nın %48'i yalnızca yeni girişlerde geçerli olacak.

### Olay veriyolu redis kesintisinden dönmüyordu

Barı beklerken çıktı: 18:00 barında `scores.updated` ve
`score.threshold_crossed` yayınlanamadı, ve o bar için **hiç bildirim
yazılmadı**. Sebebi `EventBus.connect()` istemciyi bir kez kurup sonsuza dek
saklaması. Redis yeniden başlayınca `xadd` patlıyor, hata yutuluyor, ve aynı
ölü istemci bir daha hiç yenilenmiyor — süreç kalıcı olarak sessizleşiyor.

Bunun kötü tarafı görünmezliği: puanlar veritabanına yazılmaya devam ediyor,
botlar pozisyon yönetiyor, panel açılıyor. Sistem dışarıdan tamamen sağlıklı
görünürken bildirim üretmiyor. Veri okuma yolu (`read_last_bars` → `hgetall`)
redis-py'ın yeniden bağlanmasıyla kendini toparlamıştı; yayın yolu toparlamadı
ve fark bu yüzden gözden kaçtı.

Düzeltme: yayın başarısız olursa istemci atılır ve bir kez daha denenir. İkinci
deneme de başarısızsa sessizce vazgeçilir — olay veriyolu kritik yolda değildir,
redis tamamen kapalıyken bot işlem yapmaya devam edebilmelidir; yayın hatası
istisna fırlatsaydı karar döngüsü çöker ve pozisyonlar yönetimsiz kalırdı.
İki test eklendi (yeniden bağlanma, ve tamamen kapalıyken sessiz vazgeçme).
Toplam 493 test.

**Bunu ben kırdım.** `docker compose up -d api` redis'i yeniden başlattı. Ama
hata hazırdı ve er geç redis'in yeniden başladığı ilk anda kendini gösterecekti;
sebebi ben olduğum için bulunması iyi oldu.

---

## 1. gün durumu — 2026-08-27 05:30 UTC

Bot #11 iki pozisyon taşıyor, özsermaye **418,93 USDT** (başlangıç 416, +%0,70).
Henüz kapanmış işlem yok, yani ölçülebilir bir sonuç da yok.

Aynı pencerede (26 Ağu 17:00 → 27 Ağu 04:00) tüm botlar:

| bot | değişim | işlem |
|---|---|---|
| 3 · trend ağırlık (1h) | +%2,50 | 1 |
| **11 · MEYDAN OKUMA** | **+%0,67** | 0 |
| 5 · 30 dakika | +%0,64 | 0 |
| 4 · 15 dakika | +%0,52 | 2 |
| 1 · taban (1h) | +%0,13 | 0 |
| 2 · seçici (1h) | +%0,10 | 0 |
| 6 · 4 saat | −%0,07 | 0 |

Havuz eşit ağırlık **+%1,47**, BTC **+%0,43**.

Bot #11 kontrol botlarının beşini geçti ama havuzun altında kaldı — ve bu
beklenen: %42 yatırımlı bir portföy havuzun betasının %42'sini alır
(0,42 × %1,47 ≈ %0,62; gerçekleşen %0,67). Yani 12 saatte seçicilikten gelen
katkı ölçülebilir değil. **Bir gün hiçbir şey söylemez.**

### Neden maruziyet %95 değil %42,6

İki pozisyonun neden küçük kaldığını tahmin etmek yerine kendi sayılarını
çıkardım:

| pozisyon | stop | riskten çıkan boyut | gerçekleşen | bağlayan |
|---|---|---|---|---|
| BTCUSDT | %3,35 | 248,11 | 133,60 | G5'in %32 tavanı (girişte yürürlükteydi) |
| KITEUSDT | %10,16 | 81,87 | 41,77 | `vol_scalar` 0,50 — alt sınır |

BTCUSDT G6'dan önce girdi ve `max_position_pct` girişte uygulanır; açık pozisyon
sonradan büyütülmez. Yani G6'nın %48'i bu pozisyonda hiç görünmeyecek.

### Kendi hipotezimi çürüttüm: `vol_scalar` çift sayım değil

İlk okumam şuydu: KITE'ın stopu zaten ortancanın 2,5 katı (%10,16'ya karşı
%4,10), `risk/stop` onu bir kez küçültmüş; `vol_scalar` aynı sebeple ikinci kez
yarıya indiriyor — volatilite çift sayılıyor, kaldırılmalı.

Kaldırmadan önce ölçtüm. Kapıyı geçen isimler, gerçekleşen volatiliteye göre
dört dilim:

| dilim | saatlik vol | nötr 24s getiri | t |
|---|---|---|---|
| Q1 (en düşük) | %0,348 | +%0,366 | **3,54** |
| Q2 | %0,572 | −%0,015 | −0,12 |
| Q3 | %0,857 | +%0,244 | 1,10 |
| Q4 (en yüksek) | %1,671 | +%0,889 | 1,78 |

Yüksek volatiliteli isimler ortalama getiri olarak **daha iyi**. Ama Q1'in
standart sapması %2,65, Q4'ünki %12,8 — 4,8 katı oynaklığa karşı 2,4 katı
getiri. Riske göre düzeltince Q1 açık ara kazanıyor ve Q4'ün üstünlüğü
anlamlılık sınırının altında kalıyor. `vol_scalar`'ın yüksek volatiliteliyi
yarıya indirmesi veriyle desteklenen bir kısıt. **Dokunulmadı.**

Bunun sonucu şu: **maruziyet %95'e çıkmayacak ve çıkmamalı.** Boyutlandırma
motoru güvenilmez sinyale büyük bahis oynamayı reddediyor. Maruziyeti zorla
yukarı çekmek, verinin desteklediği bir risk kontrolünü ezmek olurdu.

### Ölçüm aletindeki iki hata (sistemde değil, bende)

1. **Gözcü scripti yanlış alarm verdi.** `tr -d ' '` zaman damgasındaki boşluğu
   sildi (`2026-08-2617:00:00+00`), psql boş döndürdü, script bunu "yeni bar
   yok" diye okudu ve "65 dakikada gelmedi" dedi. Bar gelmişti.

2. **Volatilite sorgusunda referans yanlıştı.** Piyasa ortalamasını tüm havuz
   yerine yalnızca kapıyı geçenler üzerinden çıkarmıştım; ortalama mekanik
   olarak sıfıra iniyordu. Aynı kapı için bilinen değerle (+%0,377) karşılaştırıp
   yakaladım — sonuç +%0,371 çıkınca sorgunun düzeldiği doğrulandı.
   **Her ölçüm sorgusu bilinen bir değerle sağlamalanmalı.**

3. **`positions.realized_pnl` kapalı pozisyonun kârı değildir.** Yalnızca kısmi
   çıkış biriktiricisidir; tam kapanışta toplam `trades.pnl`'e yazılır. Bu alanı
   toplayan bir sorgu 161 işlemin 160'ında sıfır görür. Doğru kaynak `trades`.

### Hız

Hedef 2.080 USDT (100.000 ₺ / 48,08). Kalan 28,8 gün için gereken bileşik günlük
oran **%5,73**. Bot #11'in fiilî işlem süresi yarım gün ve gerçekleşen oran
%1,4/gün — ama bu yarım günün neredeyse tamamı betadır, seçicilik değil.
Daha önce ölçülen en iyi gözlem %1,20/gün idi. Aradaki fark kapanmadı.

---

## Referans değerim çürüktü — 2026-08-27

Bu bölüm, bu defterdeki daha önceki ölçümlerin çoğunu geçersiz kılıyor.

### Bulgu

`scores` tablosunda 19 Haziran – 14 Ağustos arası her gün **tam 86 sembol,
2064 satır** var. 15 Ağustos'tan itibaren sayı canlı dalgalanıyor (95, 97, 98,
91, 87, 82, 83, 86, 87, 92). `universe_snapshots` tablosunun en eski kaydı
**2026-08-15 02:08**.

Sebebi `scoring/backfill.py`'deki `pool_symbols`: yalnızca **en son**
snapshot'ı alıp (`order_by(id.desc()).limit(1)`) tüm geçmiş barlara
uyguluyordu. Canlı yol doğru davranıyor (`worker.py:232` →
`current_symbols(at=bar_time)`); ayrışan backfill'di.

Bu bozulmaz kural 2'nin (look-ahead yasağı) doğrudan ihlali. Bugünün havuzu,
geçmişte o havuzda olmayan sembolleri içerir — ve bir sembolün bugün havuzda
olmasının sebebi genellikle **o dönemde yükselmiş olmasıdır**. Geçmişe geri
yerleştirildiğinde ölçüme olmayan bir kenar bindirir.

### Bedeli

Aynı sorgu, aynı yöntem, iki pencere:

| pencere | kapı 75,2 | n | t |
|---|---|---|---|
| kirli (backfill evreni, 19 Haz – 14 Ağu) | +%0,413 | 2350 | 2,74 |
| **temiz (canlı evren, 15 Ağu sonrası)** | **+%0,025** | **276** | **0,06** |

Kenar yok. Temiz pencerede kapı 70 hatta negatif (−%0,480, t=−1,94).

**Bu defterdeki şu ölçümler geçersizdir:** kapı eğrisi (70→77), kapı çevirisi
75,2, sıra bazlı kenar (1./2./3./4. sıra), volatilite dilimleri, ve kontrol
grubunun ağırlık setinin "her kapıda negatif" olduğu bulgusu. Hepsi aynı kirli
zeminden geliyor. **G6 dahil tüm parametre kararlarım bu zemine dayanıyordu.**

### Bağımsız ikinci kanıt

Panelin kıyas grafiği düzeltildikten sonra (aşağıda) canlı defter aynı şeyi
söylüyor: 15–27 Ağustos penceresinde sermaye ağırlıklı bot bileşiği **106,4**,
havuzun eşit ağırlıklı al-tut sepeti **116,0**. Botlar sepetin **9,6 puan
altında**. Yani puanlama bu pencerede seçim yaparak değer üretmedi; ölçülen
"%1,2/gün" beta'ydı, alfa değil.

İki bağımsız yol — geçmiş puanların temiz penceresi ve canlı işlem defteri —
aynı sonuca varıyor.

### Yapılan

`pool_symbols` artık dönem boyunca havuza girmiş sembollerin **birleşimini**
döndürüyor (veri yüklemesi için), ve `backfill_scores` her barda havuzu
`UniverseTimeline` ile point-in-time çözüyor. Snapshot arşivi o döneme
uzanmıyorsa sonuç "YAKLAŞIK EVREN" diye işaretleniyor, sessizce sunulmuyor.

Dört test eklendi: sonradan giren sembol öncesinde görünmez, düşen sembol
geçmişte kalır, snapshot yoksa yaklaşık işaretlenir, ve döngü sabit sembol
listesi kullanmaz. 503 test geçiyor.

**Onarılamayan kısım:** `universe_snapshots` 15 Ağustos'tan geriye gitmiyor.
19 Haziran – 14 Ağustos puan geçmişi yeniden üretilemez ve ölçüm amacıyla
kullanılamaz. Bu, 3. bozulmaz kuralın ("havuz her yenilemede snapshot'lanır")
15 Ağustos'tan önce uygulanmamış olmasının bedeli. Bundan sonraki her ölçüm
sorgusu `bar_time >= '2026-08-15'` süzgeciyle çalışmalı.

### Panelin kıyas grafiği gerçeğin tersini gösteriyordu

Ana panel "Botlar" eğrisini `/portfolio/equity`'nin `total` alanından
çiziyordu. O alan botların **mutlak toplam özsermayesidir** ve yeni bot
eklendikçe sermaye enjeksiyonuyla basamaklanır: 15.000 → 33.653. Grafik her
seriyi ilk noktasına göre 100'e çektiği için bu seri **224,4**'e tırmanıyor,
kıyas **115,5**'te kalıyordu. Panel "piyasayı 109 puan geçtik" diyordu.

Gerçekte botların hepsi kıyasın altındaydı. Doğru veri aynı yanıtta zaten
normalize hâlde geliyordu (`benchmark.bots[]`) ve hiç okunmuyordu.

Düzeltildi: eğri artık sermaye ağırlıklı bileşik getiri, meydan okuma botu
ayrı seri olarak çiziliyor, ikisi de kıyasla aynı tabanda. Sayfanın kendi
kılavuzu "kıyası geçemiyorsanız seçim değer katmıyor" diyor; grafik artık o
soruyu doğru cevaplıyor.

### `trades.pnl` giriş komisyonunu düşmüyordu

Kapanışta komisyonun tamamı `trades.fees`'e yazılıyor ama kârdan yalnızca
çıkış tarafı düşülüyordu. 160 işlemde 144,64 USDT — raporlanan kârın %9,5'i.
Kanıt, açık pozisyonu olmayan bir botta mutabakatın kuruşuna tutması
(bot #4: özsermaye−sermaye = 319,70 = sum(pnl) − sum(entry_fees)).

Backtest motoru baştan beri doğru hesaplıyordu; ayrışma "backtest, paper ve
canlı aynı sonucu üretir" kuralının fiilî ihlaliydi. Hesap tek bir paylaşılan
fonksiyona alındı (`execution/accounting.py`) — kural artık sözleşmeyle değil
yapıyla korunuyor. Göç 160 geçmiş satırı düzeltti.

### Meydan okuma sayfası botun hızını 2,3 kat düşük gösteriyordu

Başlangıç anı elle `2026-08-26T00:00:00Z` yazılmıştı ama bot 17:18:52'de
fonlandı. Geçen süre 0,57 gün yerine 1,29 gün sayılıyor, gerçekleşen oran
%1,24 yerine %0,55 çıkıyordu. Aynı hata kalan günü kısaltıp gereken oranı da
şişiriyordu — iki hata da aynı yöne: bot olduğundan yavaş, hedef olduğundan
uzak. Artık botun kendi `created_at`'inden türetiliyor.

## G7 — 2026-08-27 16:20 · maruziyet açıldı (vol_target 0,6 → 1,05)

Gece koşan sekiz hipotezin SEKİZİ de eyleme dönük kısmıyla çürüdü
(ağırlık araması çoklu-karşılaştırmadan sağ çıkmadı; tutuş/dilim/rejim
önerileri look-ahead evrenine dayanıyordu). Temiz penceredeki kenar:
+%0,025/24s, t=0,06 — yani ölçülebilir kenar YOK. Bu yüzden puanlama ve
çıkış parametreleri donduruldu; onlara dokunan her değişiklik gürültü
kovalamak olurdu.

Tek gerçek büyüklük kaldıracı maruziyetti: tavan %95 iken fiili %40,3 —
vol_target=0,6, havuz medyan volatilitesi 1,05'in yanında her boyutu
~0,57 ile çarpıyor ve sembollerin %35'inde 0,5 tabanına yapışıyordu.
G7 = G6 + vol_target 1,05. Beklenen: maruziyet ~%75-90'a çıkar.

DÜRÜST KAYIT: bu, kanıtlanmış bir kenarı değil BETA'yı iki katına
çıkarır. Piyasa yükselirse hedefe yaklaşmayı hızlandırır, düşerse kaybı
aynı oranda büyütür. Sentezin hedef değerlendirmesi değişmedi: 29 günde
5 kat için günlük bileşik %5,68 gerekiyor; en iyimser senaryo (tam
maruziyet + Ağustos hızında piyasa) ~786 USDT = hedefin %38'i. Hedef
istatistiksel olarak ulaşılabilir değil; sistemin birincil çıktısı ölçüm
ve bu satırlar o ölçümün kaydı.

## G8 — 2026-08-27 21:10 · teyitli kaldıraç (3× tavan)

Sahibin talebi: "puanı yüksek bir şeye destek-direnç ve formasyonları
uygulayıp kaldıraçlı girebilsin." Aynen böyle kuruldu — üç teyit birden
yoksa kaldıraç yok, giriş spot sürer:
puan ≥ 88 (93'te 3×) · pattern_modifier > 0 · dirence ≥ 2 ATR yer.
Stop başlangıç marjının %80'ine sığmak zorunda; sığmazsa kademe düşer.
Borç saatlik %0,00208 tahakkuk eder ve komisyona yazılır. Brüt maruziyet
tavanı 1,5×.

DÜRÜST KAYIT: risk_pct değişmedi (işlem başına risk aynı). Kaldıraç dar
stoplu, tam teyitli girişte nakit tavanını kaldırır — kenar yaratmaz,
VARSA ödülünü, YOKSA cezasını büyütür. Backtest bu sürümü bilerek
reddeder; tek ölçü bu defterin kendisidir. Devre kesiciler aynı kaldı ve
kaldıraçla daha erken tetiklenir — bu bir hata değil, tasarım.

## KAPANIŞ → MARATON — 2026-09-01 01:15 (TR)

G-serisi meydan okuma (20.000 ₺ → 100.000 ₺) burada kapandı: son özsermaye
410,64 USDT (başlangıç 415,97'ye göre −%1,3; 3 kapanmış işlem). Hedef
değerlendirmesi baştan dürüsttü: istatistiksel olarak ulaşılamazdı ve
ulaşılamadı. Defterin değeri hedef değil ÖLÇÜMdü — look-ahead'li ölçüm
zemininin çürük çıkışı, sekiz hipotezin çürütülüşü, G1→G8 sürüm izi.

Yerine MARATON: sahibin kararıyla 9 botun TAMAMI 400 $ eşdeğerine
sıfırlandı (BIST 19.232 ₺ = 400 $ × dondurulmuş 48,08; kripto 400 USDT;
ABD 400 $) ve 30 gün boyunca sisteme HİÇ komut verilmeyecek. Bu bir yarış
olduğu kadar 9 kollu bir A/B'dir: taban / seçici / trend / 15m / 30m / 4h
/ G8-kaldıraç / BIST-1d / ABD-1d. Meta tek kaynakta (`settings.marathon`),
hakem /maraton sayfası. Eski işlem geçmişi silinmedi; maraton ölçümü
başlangıç damgasıyla süzülür.

## ÇIKIŞ TARAMASI ÖN-KAYDI — 2026-09-01 02:20 (TR), sonuçlar GÖRÜLMEDEN

Canlı defter (temiz pencere ≥15 Ağu, bot 1–6, 206 işlem, ort +0,49R):

| çıkış | n | ortR | tepeR | geri veriş |
|---|---|---|---|---|
| STOP | 69 | −1,13 | +0,31 | 1,44 |
| SCORE | 60 | +1,43 | +2,38 | 0,95 |
| TRAILING | 54 | +1,52 | +2,93 | 1,41 |
| BREAKEVEN | 17 | +0,04 | +1,44 | 1,40 |

İki sızıntı aynı yöne işaret ediyor: iz (trail) çok gevşek — trailing tepeden
1,41R geri veriyor; BE işlemleri +1,44R tepe görüp sıfıra dönüyor. Tarama:
kontrol (3,5) + trail 3,0 / 2,5 / 2,0 (doz-cevap ekseni) + be 0,7 + kombine
(trail 2,5 · be 0,7). Pencere 15–31 Ağu, aynı kod yolu, base maliyet.

**Karar kuralı (önceden bağlayıcı):** Bir varyant ancak ŞU ÜÇÜ BİRDEN
sağlarsa uygulanır: (1) beklenti_R kontrolden ≥ +0,05R iyi; (2) maks düşüş
kontrolün 1,2 katını aşmaz; (3) trail ekseninde doz-cevap tutarlı (3,5→2,0
boyunca zikzak yapmaz). Kazanan yalnız AYNI çıkış ailesini taşıyan bot
1–6'ya uygulanır; 11 (G8) ve 12/13 (1d) DOKUNULMAZ. Hiçbiri geçemezse
parametreler DONUK kalır ve bu da sonuçtur. Not: tarama tabanı kapı 75,2
kullanır (canlı 77–80) — istatistik zemini için; ölçülen boyut çıkıştır.

## KANIT TAZELEMESİ — 2026-09-01 02:45 (TR), maraton öncesi son bakış

1. **Kapı kanıtı değişmedi.** Temiz pencerede (15–31 Ağu, 1h) puan dilimine
   göre naif 24 saat ileri getiri: p<60 → +%0,88 · p60-75 → +%1,29 ·
   p75-80 → +%0,92 · **p80+ → −%0,16** (n=332, σ %10,6). Örtüşen pencereler
   ve gün kümelenmesi düzeltilmemiş naif bakış bile kapıda kenar
   göstermiyor; en uç dilim hafif ters. Sekiz çürütülmüş hipotezle tutarlı —
   kapı/ağırlık DONUK kalır, bu tablo eylem çağrısı DEĞİLDİR (aynı tuzak).
2. **TIME çıkışları gözlemi (eylemsiz).** 72 saat dolunca kapanan 3 işlem
   ortalama +3,53R ile kapandı (tepe +3,76R) — zaman tavanı kazananları
   biçiyor OLABİLİR ama n=3'le hiçbir şey söylenmez. Maraton verisi büyüsün;
   ölçüm sorusu olarak kayıtlı.
3. **STOP maliyeti.** Ortalama STOP −1,13R (teorik −1,0R): 0,13R kayma +
   boşluk gerçeği. `stop_fill_price` dürüstlüğüyle tutarlı; sızıntı değil,
   piyasa maliyeti.

## ÇIKIŞ TARAMASI SONUCU — 2026-09-03: DONUK KALIR

Altı varyant, 15–31 Ağu, 110 sembol, base maliyet (işlem/isabet/ortR/net/düşüş/pf):

| varyant | işlem | isabet | ortR | net | düşüş | pf |
|---|---|---|---|---|---|---|
| kontrol (3,5 · 1,0) | 26 | %42 | +0,79 | +%8,8 | %2,6 | 3,10 |
| trail 3,0 | 34 | %44 | +0,53 | +%5,4 | %3,4 | 1,95 |
| trail 2,5 | 28 | %46 | +0,55 | +%5,1 | %1,9 | 2,18 |
| trail 2,0 | 26 | %54 | +0,87 | +%6,6 | %1,9 | 3,23 |
| be 0,7 | 26 | %42 | +0,79 | +%8,8 | %2,6 | 3,10 |
| kombine | 36 | %47 | +0,46 | +%4,4 | %3,9 | 1,73 |

Ön-kayıtlı kural karar verdi: **hiçbir değişiklik uygulanmaz.** (1) Yalnız
trail 2,0 beklenti eşiğini geçti (+0,087R) ama (3) doz-cevap U-şekilli
(3,5→3,0→2,5→2,0: 0,79→0,53→0,55→0,87) — orta değerler iki uçtan kötü;
26-36 işlemlik örneklemde bu, gürültü imzasıdır. Kontrol net getiride
zaten birinci; be 0,7 kontrole BİREBİR eş çıktı (parametre bu pencerede
hiç devreye girmemiş). Canlı defterdeki geri-veriş sızıntısı gerçek ama
bu pencere/örneklemle hangi sıkılığın doğru olduğu ayırt edilemiyor.
Maraton 30 günlük veri üretsin; soru tekrar açılabilir. Donmuş kalmak
da bir ölçüm sonucudur.

## FABLE PROGRAMI ÖN-KAYDI — 2026-09-03 (sahibin kararı)

Üç hat: (A) arayüz sıfırdan, (B) strateji araştırması, (C) kaldıraç.
**Sahibin kararı:** maratondaki 9 bot 30 gün DOKUNULMAZ; B ve C'den çıkan her
şey 400 $'lık YENİ bot kolu olarak yarışa katılır. Eski ölçüm bozulmaz,
yeni kollar aynı tabloda ölçülür.

**Yeni kol kabul kuralı (önceden bağlayıcı):**
1. Aynı kod yolu (kural 1) — bir "araştırma sürümü" yazılmaz; yeni özellik
   look-ahead property testiyle gelir (kural 2).
2. Backtest temiz pencerede (≥15 Ağu) **in-sample VE kilitli %30 holdout**
   ayrı ayrı koşar; kabul için İKİSİNDE de beklenti_R ≥ kontrol + 0,05R ve
   maks düşüş ≤ kontrol × 1,2. Yalnız in-sample'da kazanan reddedilir.
3. Kontrol = mevcut "taban" tanımı (bot 1 ailesi); kaldıraç kolları için
   kontrol = aynı tanımın 1× hâli (kaldıracın KENDİ katkısı ölçülür).
4. Kaldıraç backtesti ancak backtest motoru marj + saatlik borç + bar-içi
   likidasyon modelini PaperAdapter ile BİREBİR taşıdığında geçerlidir;
   o güne dek kaldıraç kolları yalnız canlı paper defteriyle ölçülür.
5. Kabul edilen kol: 400 $ (BIST için 400 × 48,08), `rebased_at` = katılım
   anı, maraton tablosunda "katılım günü" etiketiyle görünür.
6. Reddedilen varyantlar da deftere yazılır — çürütme de sonuçtur.

## STRATEJİ TARAMASI ÖN-KAYDI — 2026-09-03 (Fable programı, B+C hatları)

Kontrol = bot 1 ("taban") tanımının DB'deki hâli. 25 varyant, hepsi
tanım-düzeyi yama (kod değişmez; kural 1). Pencere 15 Ağu→2 Eyl, kilitli
son %30 bar holdout; maliyet modeli artık paper ile birebir (10+5 bp).
Gruplar: kapı (70/75/85) · slot (2/6) · süre (120/240 sa) · aile ablasyonu
(5 aile tek tek 0) · eğilim (trend-ağır, momentum-ağır) · düzenleyici
(formasyon/mum/kalabalık kapalı) · boyut (vol_target 0,4/0,9; risk %2) ·
iz kontrolleri (trail kapalı; BE kapalı) · kaldıraç (G8 sıkı; gevşek 3×;
gevşek 2×).

Kabul: Fable programı kuralı (in-sample VE holdout ≥ kontrol + 0,05R,
düşüş ≤ 1,2×). 25 karşılaştırmada şansla ~1 "kazanan" beklenir — holdout
şartı bunun için var; tek pencerede kazanan HİÇBİR ŞEY yeter sayılmaz.
Ablasyon/eğilim grupları kabul için değil, ailelerin marjinal katkısını
ÖLÇMEK için (indikatör sorusunun dürüst cevabı). Kaldıraç varyantlarında
kontrol aynı tanımın 1× hâli.

**Düzeltme (2026-09-03, ilk 3 sonuç görüldükten sonra, dürüstçe):** "kapı 70"
ve "kapı 75" varyantları kontrolle birebir aynı çıktı — boyutlandırma
kademeleri 80'den başladığı için 80 altı puan kapıdan geçse de boyut sıfır
alıyor; iki varyant fiilen ölüydü (tasarım hatası, sonuç değil). İkisi
kademeleri kapıya kaydırılarak (70→[[70,.75],[80,1],[85,1.25]] ·
75→[[75,.75],[82,1],[88,1.25]]) 4. şeritte yeniden koşar; kabul kuralı
aynen. Ayrıca kontrol holdout'ta yalnız 3 işlem üretti: 17 günlük pencerede
%30 holdout ≈ 5 gün — kabul kuralının "holdout'ta da +0,05R" şartı bu
örneklemle pratikte sağlanamaz; bu tarama kabul için değil ÖLÇÜM için
okunacak, kol kabulü maratonun kendi 30 günlük verisiyle yapılacak.

## STRATEJİ TARAMASI SONUCU — 2026-09-03: HİÇBİR KOL KABUL EDİLMEDİ

28 varyant, kontrol = bot 1 tanımı, in-sample 317 bar / holdout 137 bar,
maliyet paper ile birebir. (n = işlem; beklenti R cinsinden; düşüş %)

| varyant | in n | in R | in düşüş | out n | out R | out düşüş |
|---|---|---|---|---|---|---|
| kontrol | 13 | +0,25 | 2,4 | 3 | −0,23 | 3,3 |
| kapı 85 | 4 | +0,60 | 2,4 | 0 | — | 1,2 |
| kapı 70 (kademe 70) | 57 | +0,47 | 4,9 | 9 | −0,80 | 6,4 |
| kapı 75 (kademe 75) | 33 | +0,68 | 5,8 | 21 | −0,31 | 6,4 |
| slot 2 | 9 | +0,60 | 2,1 | 3 | −0,23 | 3,3 |
| ablasyon trend=0 | 26 | +0,57 | 3,3 | 16 | **+0,06** | 2,9 |
| ablasyon momentum=0 | 13 | +1,49 | 2,5 | 6 | −0,37 | 3,1 |
| ablasyon flow=0 | 13 | +1,57 | 1,6 | 5 | −0,45 | 2,7 |
| ablasyon vol=0 | 32 | **−0,02** | **7,5** | 19 | −0,08 | 6,2 |
| ablasyon sr=0 | 19 | +1,32 | 3,7 | 9 | −0,07 | 4,4 |
| eğilim trend-ağır | 20 | +1,23 | 4,2 | 11 | −0,35 | 3,8 |
| eğilim momentum-ağır | 20 | +0,29 | 3,4 | 9 | −0,23 | 3,6 |
| formasyon kapalı | **2** | +0,05 | 1,5 | 0 | — | 0 |
| mum kapalı | 10 | +1,67 | 2,0 | 3 | −0,23 | 3,3 |
| trail kapalı | 13 | +0,24 | 2,5 | 3 | −0,34 | 3,5 |
| BE kapalı | 12 | +1,32 | 2,8 | 3 | −0,44 | 3,8 |
| vol_target 0,4 / 0,9 | 13 | +0,19 / +0,25 | 2,4 | 3 | −0,23 | 3,1 / 3,6 |
| kontrolle BİREBİR aynı | kapı 70/75 (eski), süre 120/240, slot 6, kalabalık kapalı, risk %2, kaldıraç ×3 | | | | | |

**Karar (ön-kayıtlı kural):** hiçbir varyant iki pencerede birden
kontrolü +0,05R geçip düşüş bekçisini (≤1,2×) sağlamadı. En yakını
`trend=0` (iki pencerede pozitif, n=26/16) — in-sample düşüşü kontrolün
1,38 katı, red. Yeni kol YOK. Kabul kararı maratonun 30 günlük verisine.

**Ölçümün söyledikleri (bunlar için koşuldu):**
1. **Vol ailesi hakkını veriyor.** Tek ablasyon ki her iki pencerede kötü ve
   düşüşü üçe katlıyor. Dokunulmaz.
2. **Formasyon düzenleyicisi fiilen kapının parçası.** Kapalıyken 317
   barda 2 giriş: +10'a kadar formasyon katkısı olmadan 80 kapısı
   neredeyse hiç geçilmiyor. "Puanı yüksek olana gir" pratikte "formasyonu
   teyitli olana gir" demek — bilinçli tasarım mıydı? OPEN-QUESTIONS.
3. **İz süren stop işe yarıyor** (kapalıyken holdout −0,34 vs −0,23);
   BE kapalı in-sample'da parlayıp holdout'ta çöküyor — 28 Ağustos
   taramasıyla tutarlı: iz/BE parametreleri DONUK.
4. **Kaldıraç bu pencerede HİÇ devreye girmedi.** Üç spec de kontrolle
   birebir: 13 girişin hiçbiri teyit üçlüsünü (formasyon>0 + ≥2 ATR
   headroom + puan) aynı anda sağlamadı. Kaldıracın katkısı ölçülemedi —
   "daha çok kazanç" sorusunun dürüst cevabı: önce üçlünün ne sıklıkla
   tetiklendiği canlıda sayılmalı (bot 11 defteri).
5. **13 işlemlik in-sample'da +1,5R'lik ablasyon parlamaları gürültüdür**
   (momentum/flow/sr/mum): üçü de holdout'ta negatif. Multiple-comparison
   tuzağı tam olarak beklendiği gibi göründü; holdout şartı işini yaptı.
6. **Bağlanmayan düğmeler:** süre, slot 6, kalabalık, risk %, vol_target
   bu pencerede sonucu değiştirmiyor — ölçmek yok saymaktan iyidir.

## G9 KOLU KATILDI — 2026-09-03 19:56 UTC (sahibin kararı)

Sahibin talimatı: maratonda en yüksek kâr oranını yakalayan botun kopyası
kaldıraçlı kol olsun. Ölçü: gerçekleşen maraton kârı + isabet → **bot 3
"trend ağırlıklı"** (4 işlem, %75 isabet, +6,28). Bot 14 = bot 3'ün
tanımının (sv 53) birebir kopyası + kaldıraç bloğu: tavan 3×, puan ≥80 →
2×, ≥88 → 3×, formasyon şart, dirence ≥2 ATR, stop-marj sığması 0,8,
saatlik borç 0,00208 %. 400 $, `rebased_at` = katılım anı, 1h. Kontrol =
bot 3'ün kendisi (aynı tanım 1×): kaldıracın KENDİ katkısı doğrudan
ölçülür. G8'in (bot 11) eşiği 88 hiç tetiklenmemişti; G9 eşiği kapıya (80)
indirir — her "kaldıraçsız (1×): sebep" kaydı üçlünün hangi ayağının
tıkadığını gösterecek. Not: bu kol ön-kayıtlı kabul kuralından geçmedi;
sahibin açık talimatıyla ölçüm amaçlı katıldı, tablo bunu "katılım günü"
ile ayırır.

## BOT OPTİMİZASYONU ARAŞTIRMASI — 2026-09-04 (sahibin isteği)

Canlı defter, temiz pencere (15 Ağu–3 Eyl), kripto 1h ailesi, 228 işlem.
Önce ölçüm, sonra hipotez; her hipotez ölçülebilir bir düğme ya da kol.

**Ölçümler**
1. *Girişteki puan:* 228 işlemin 221'i 80–85 bandında (ortR +0,46, isabet
   %38), 85+ yalnız 7 (ortR +0,56). Puan neredeyse hep kapının dibinde —
   kademe (0,75/1,0/1,25) fiilen hiç devreye girmiyor.
2. *Giriş saati (UTC):* 00–06 → **+1,20R** (n=49) · 06–12 → +0,08R (n=43)
   · 12–18 → +0,31R (n=72) · 18–24 → +0,33R (n=64). Gece (Asya seansı)
   girişleri diğerlerinin 3–4 katı. Gün kümelenmesiyle daralır ama fark
   büyük; sınanmayı hak ediyor.
3. *Çıkış profili:* STOP 8 saatte kapanıyor (mae −1,09: kayma stopu 1R'nin
   ötesine taşıyor); SCORE/TRAILING 14–19 saat, tepe +2,3/+2,9R;
   TIME (72 sa) yalnız 3 işlem ama +3,5R.
4. *Bırakılan kâr:* 22 işlem ≥1R tepe görüp (ort +1,51R) zararla kapandı
   (ort −0,21R). Toplam 228'in ~%10'u; kısmi kâr alma bu 22'de ~+0,5R
   kilitlerdi — kazananlarda (tepe +2,9R) bedeli de olurdu; ancak backtest
   söyler.
5. *Kaldıraç üçlüsü:* açılış olaylarında formasyon/headroom alanı yok →
   geriye dönük ölçülemez. G9 (bot 14) ileriye dönük ölçüyor: her 1× kararı
   sebebiyle loglanır.

**Hipotezler ve ne yapıldı**
- **H1 — giriş saati penceresi.** `entry.hours_utc` düğmesi eklendi (tek
  karar yolu: worker + backtest aynı fonksiyon; test + hash). Dört varyant
  backtest'te (E şeridi): 22–06, 00–06, 12–24, 06–12 kapalı. Sonuç
  aşağıya eklenecek; kabul kuralı aynen (iki pencere + düşüş bekçisi).
- **H2 — kısmi kâr alma (+1R'de %50 çık, kalanı iz sür).** Kod gerektirir
  (worker + backtest'te pozisyon bölme, `ExitReason.PARTIAL`). Önce H1
  sonucu, sonra bu; ölçüm 4'ün büyüklüğü (22/228) bunu sıraya koyuyor.
- **H3 — kaldıraç sondası.** G9 koşuyor; ilk sebepler: "dirence yer yok".
  Bir hafta veri toplansın, üçlünün tıkanan ayağı ona göre gevşetilsin
  (gevşetme de yeni kol olarak, bot 14'e dokunmadan).
- **Yapılmayacak:** kapıyı düşürmek (kademe/holdout kanıtı ters), aile
  ağırlığı oynatmak (28 varyant çürüttü), iz/BE parametreleri (iki tarama
  donuk dedi).

## KALDIRAÇ ARAŞTIRMASI — 2026-09-04 (sahibin isteği: "kaldıraçla para kazanmak")

**1. Bu sistemde kaldıraç ne yapar, ne yapmaz.** Kaldıraç kararı riski
ÇARPMAZ (tasarım kararı, OPEN-QUESTIONS §Kaldıraç): işlem başına risk
`risk_pct × özsermaye` sabittir; kaldıraç yalnız nakit ve tek-pozisyon
tavanını kaldırır. 400 $, 4 slot ve vol hedefiyle pozisyonlar ~%25'lik;
nakit tavanı nadiren bağlar → kaldıraç tetiklense bile sonuç neredeyse
aynı. 28 varyantlık taramada üç kaldıraç spec'inin kontrolle BİREBİR aynı
çıkmasının iki sebebi var: teyit üçlüsü hiç tutmadı VE tutsa da risk
değişmeyecekti. "Kaldıraçla daha çok kazanmak" bu mimaride "işlem başına
riski artırmak" demek — kaldıraç onun için gereken nakdi sağlar, kenarı
değil.

**2. Kenarın büyüklüğü (canlı, 230 işlem, temiz pencere):** işlem başına
+0,46R, sapma 2,79R. Kelly kesri ≈ ort/var = 0,46/7,8 ≈ %5,9; yarı-Kelly
≈ %3. Bugünkü risk %1–2. Filo genelinde en kötü gün −11,5R (6 bot
toplamı; bot başına ~−2 ila −4R) → %3 riskte bot başına en kötü gün ≈
−%6–12, %5'te −%10–20. Maraton dört gündür −21 $: kenar var ama ince ve
gürültülü; bu kenarı 3× büyütmek düşüşü de 3× büyütür.

**3. Ne ölçülüyor (G şeridi, backtest):** risk %3 (1×) · lev 2× trio'suz ·
risk %3 + lev 2× · risk %5 + lev 3× · lev 2× yalnız headroom ≥1 ATR.
Kontrol = bot 1 tanımı. Kabul kuralı aynen (R bazlı beklenti + düşüş).
Not: R bazlı metrikler risk %'sini görmez; bu grupta NET getiri ve düşüş
birlikte okunacak.

**4. E ve F şeritleri (ara):** saat penceresi girişleri boğuyor (in n=7–8,
holdout n=1–2) — kanıt yok, H1 park. Kısmi kâr alma (F): 1R %50 in +0,63R
(kontrol +0,25), holdout −0,01 (kontrol −0,23), düşüş kontrolden düşük →
ön-kayıtlı kuralı GEÇİYOR (n=14/3 uyarısıyla). Canlı yürütme worker'da
yok; kol olabilmesi için önce worker'a dilim satışı + `partial_done`
sütunu (migration) gerekir. Sıradaki iş bu.

**5. Yapısal seçenekler (kod gerektirir, sırayla):**
- **Kısa taraf (long/short kesitsel momentum):** puanlama zaten sıralıyor;
  alt desili açığa satmak momentum sisteminin ders kitabı hâlidir ve
  kenarı yalnız çarpmaz, yeni kenar ekler. Vadeli/perp adaptörü, kısa
  pozisyon muhasebesi, fonlama oranı modeli gerekir — en büyük iş, en
  büyük potansiyel.
- **Fonlama oranı verisi** (perp): hem kısa tarafın maliyeti hem kalabalık
  sinyali (crowding düzenleyicisine gerçek girdi).
- **Gap/likidasyon dürüstlüğü** kaldıraçlı kollarda zaten var; kısa tarafta
  likidasyon yukarıdan gelir — model simetrik olmalı.

**Dürüst özet:** kaldıraç bir kazanç kaynağı değil, kazanç (ve kayıp)
çarpanıdır. Bu sistemde çarpılacak kenar ince (+0,46R) ve dört günlük
maraton örneklemi negatif. Ölçülebilir yol: (a) F'nin geçen varyantını
canlıya taşımak, (b) G'nin net-getiri/düşüş tablosuna göre risk %3 + 2×
kolu ("G10") açmak, (c) kısa tarafı yol haritasına almak.

## DENEY KOLLARI — 2026-09-04 (sahibin anlayışı: kağıtta cüretkâr ol, kaybedeni ele)

Hepsi bot 3 (sv 53) kopyası, 400 $, katılım damgalı, `config.deney=true`;
kesiciler her kolda açık ("kaybederken kontrollü"):
- **bot 15 · yarı-Kelly (G10):** risk %3, 2× trio'suz; günlük kesici −%6.
- **bot 16 · tam-Kelly (G11):** risk %5, 3× trio'suz; günlük −%8, haftalık
  −%15, düşüş −%25, 4 ardışık zarar.
- **bot 17 · uzun tutma (T1):** max_hold 168 sa (TIME çıkışları +3,5R
  gözlemi).
- **bot 18 · kısmi kâr (P1):** +1R'de %50 sat — F şeridinde ön-kayıtlı
  kuralı geçen tek varyant; canlı yürütme bugün worker'a girdi
  (migration 0009).
Eleme kuralı: bir kol 14 günde kontrolünün (bot 3) altında VE mutlak
zararda ise durdurulur ve arşive gider; kalanlar maraton tablosunda
yarışır. Kaynak kollara dokunulmaz.

**E ve F şeridi sonuçları (2026-09-04):**
- *E — saat penceresi:* dört pencere de girişleri boğdu (in n=7–12, holdout
  n=1–2); holdout'ta hepsi negatif. Canlı defterdeki 00–06 UTC farkı
  backtest'te yeniden üretilemedi (çok az işlem). H1 PARK; düğme duruyor,
  maraton verisi büyüyünce yeniden bakılır.
- *F — kısmi kâr alma:* üç varyant da in-sample'da kontrolü geçti (+0,63 /
  +0,65 / +0,70R vs +0,25) ve holdout'ta daha az kaybetti (−0,01 / −0,01 /
  −0,08 vs −0,23); düşüş kontrolden düşük. "1R %50" ön-kayıtlı kuralı geçen
  ilk varyant — bot 18 (P1) olarak canlıda. Örneklem küçük (14/3); kararı
  maraton verecek.
- **bot 19 · vol-ağırlıklı (V1):** ağırlıklar trend 15 / momentum 10 / flow
  10 / vol 60 / sr 5 — araştırma verisinde tek pozitif IC taşıyan aile vol
  (SISTEM-ANALIZI §2). Kapı 80 korundu; seçicilik canlıda ölçülecek.
- **bot 20 · ortalamaya dönüş (M1):** trend −15 / momentum −15 / flow 20 /
  vol 40 / sr 10 — 24 saat ufkunda trend ve momentum anlamlı NEGATİF IC
  (t −8,6 / −10,7); ters çevrilmiş ağırlıklar. Kural gereği toplam > 0.
  Puan ölçeği farklı → kapı seçiciliği farklı; eleme kuralı aynen.

**G şeridi (kaldıraç/risk) ve F'nin dördüncüsü — 2026-09-04:**
| varyant | in n | in R | in net | in düşüş | out n | out R | out net | out düşüş |
|---|---|---|---|---|---|---|---|---|
| kontrol | 13 | +0,25 | +3,6% | 2,4% | 3 | −0,23 | −0,9% | 3,3% |
| risk %3 (1×) | 10 | +0,54 | +5,0% | 1,8% | 2 | −0,34 | −1,5% | 3,8% |
| lev 2× trio'suz | 9 | +0,60 | +4,8% | 2,3% | 3 | −0,23 | −0,8% | 4,0% |
| risk %3 + 2× | 7 | +0,76 | +5,9% | 1,8% | 2 | −0,34 | −1,3% | 4,7% |
| risk %5 + 3× | 9 | +0,31 | +4,7% | 2,8% | 2 | −0,34 | −1,8% | 4,2% |
| 2× yalnız headroom | 9 | +0,60 | +5,8% | 2,3% | 3 | −0,23 | −0,9% | 3,3% |
| **kısmi 1R %50 + iz 2,5** | 15 | +0,65 | +4,5% | 1,7% | 3 | **+0,10** | −0,1% | 2,8% |

Okuma: kaldıraç/risk varyantları R'yi iyileştirmiyor, in-sample net'i biraz
büyütüp holdout'ta daha çok kaybediyor, düşüşü 2× büyütüyor — "çarpan,
kenar değil" aritmetiği aynen çıktı (holdout n=2-3, kanıt değil; G10/G11
kağıtta ölçüyor). Kaldıraç işlem SETİNİ de değiştiriyor (13→9): büyük
pozisyon nakdi kilitleyip sonraki girişleri düşürüyor. Kısmi kâr + iz 2,5
holdout'ta pozitif tek varyant (+0,10R) ve iki pencerede kuralı geçiyor →
**bot 21 (P2)** olarak katıldı. Kısmi kâr ailesi (P1, P2) şimdilik
taramanın tek tutarlı kazananı.

## AGRESİF KOLLAR — 2026-09-04 (sahibin talimatı: "paper'da korumacı olma, yüksek kâr")

Yeni düğme `sizing.leverage.scale_risk`: kaldıraç riski de çarpar (işlem
başına risk = risk_pct × kaldıraç). Kesiciler açık ama gevşek (günlük −%15,
haftalık −%30, düşüş −%60/70, 8 ardışık zarar); likidasyon modeli aynen.
Kaybetmeye hazır olunduğu açıkça söylendi; eleme kuralı aynen (14 gün).
- **bot 22 · A1:** bot 3 kopyası, risk %3 × 3× = işlem başına **%9**, 6 slot.
- **bot 23 · A2:** bot 5 (30 dk) kopyası, risk %4 × 5× = **%20**, 6 slot,
  düşüş kesicisi −%70. En agresif kol; stop-marj sığması 0,8 → stop girişin
  %16'sından uzaksa kaldıraç kendiliğinden düşer.
- **bot 24 · A3:** V1 (vol-ağırlıklı) + risk %3 × 3×.
- **bot 25 · A4:** kapı 75, 6 slot, kademeler 75'ten, risk %3, 2×/3×.
Beklenti dürüstçe: kenar +0,46R/işlemse A1'de işlem başına ≈ +%4 beklenen
getiri ile ≈ %25 sapma; en kötü gün −%20…−%40 mümkün. Kâr da kayıp da
görünür olacak; tablo iki haftada konuşur.

**Düzeltme (aynı gece):** A1–A4 ilk barda kısıtlara takıldı — risk çarpanı
hedef boyutu büyütünce %25 doluluk kuralı ve maruziyet/küme tavanları her
girişi reddetti (tam SISTEM-ANALIZI §3.15). Tanımlar v2: `min_fill_ratio`
0, brüt maruziyet tavanı kaldıraç × 0,8 (2,4 / 4,0), küme tavanı 1,5 / 2,5;
A4'te kaldıraç eşiği kapıya (75) çekildi. Katılım damgası ve sermaye aynı.
Ayrıca kod düzeltmesi: `decide_leverage` "direnç bulunamadı" (None) değerini
eşiksiz spec'te bile ret sayıyordu; artık `min_headroom_atr = 0` S/R teyidini
kapatır (maraton spec'leri 2,0 ATR ile aynı davranır). Supervisor 05:36Z'de
yeniden başladı; ilk kaldıraçlı girişler 06:00 barından itibaren beklenir.

## Kısa yön (önce sat, sonra kapat) — 2026-09-04

Sahibin "kaldıraçtan yüksek kâr, korumacı olma" isteğinin ikinci yarısı:
düşüşten kazanç. Uygulama `docs/KISA-YON-PLANI.md`: tek `direction` çarpanı
(+1 uzun, −1 kısa) enum → muhasebe → çıkış → boşluk dolumu → S/R stopu →
boyut → kaldıraç → puanlama → tanım → portföy → paper → backtest → worker →
API → panel zincirinden geçirildi. Uzun-only tanımlar için aritmetik bugünkü
hâliyle birebir: `tests/test_altin_uzun.py` (iki altın fixture + tanım hash'i
+ puanlama config_hash'i) bunu tutar; 9 maraton kolu dokunulmadı.

**Kısa puan hipotezi:** yönlü aileler (trend, momentum, flow, sr) ters
çevrilir (100 − p), `vol` olduğu gibi kalır, düzelticiler işaret değiştirir.
Faz 0a'da trend/momentum IC'si uzun için negatifti (≈ −0,03); tersinin kısa
için pozitif olması beklenir ama **ölçülmedi** — bu bir hipotezdir, kabul
ölçüsü kısa-only backtest + kalibrasyon.

**Model:** kısa açılış SATIŞ emri (bid'ler tüketilir), gelir nakde girer,
defterde negatif miktar; kapatma ALIŞ emri. Borç: satılan varlığın TAM
notional'ı saatlik oranla (1× kısa bile borçludur). Likidasyon girişin
üstünde `giriş × (1 + 0,9/L)`; stop direnç + k×ATR, yalnız aşağı iner.
Aynı sembolde iki yön yok (hedge yok).

**Yeni kollar (400 $, deney/agresif/kisa):** S1 "Kısa · 3× risk çarpanı"
(SHORT) ve S2 "İki yön · 3× risk çarpanı" (BOTH) — A1'in tanımı, yalnız
`entry.direction` farklı. Eleme kuralı aynı: 14 gün kontrolün altında ve
eksi → arşiv.

**Kuyruğa eklendi:** kısa puan kalibrasyonu (hedef −fwd_return); coin bazlı
borç oranı; boyutlandırma nakit tavanının komisyon payı (A3'te "yetersiz
marj" retleri: `serbest_nakit × lev` komisyonsuz, adaptör komisyon ekleyince
marj yetmiyor).

**Olay (2026-09-04 13:01–14:2x UTC, bot 5 "Havuz Momentum · 30 dakika"):**
MSTRBUSDT girişinde stop (138,92) dolumun (136,87) ÜSTÜNDE kaldı: bundle 12:30
barı yerine 12:00 kapanışını (142,51) taşıyordu, stop ondan hesaplandı, emir
ise gerçek defterden doldu. 1R ≈ 0 → MFE/MAE sonsuz → `NUMERIC(14,8)` taşması
→ gözetim ve karar döngüsü ~75 dakika boyunca her turda çöktü, 12:30 sonrası
bar işlenmedi. Üç katmanlı düzeltme: (1) karar barı taze olmayan sembol artık
kriptoda da atlanır (seanslı pazardaki kural genelleştirildi), (2) dolum stopu
geçerse stop dolumdan planlanan mesafeye çapalanır ve WARN yazılır, (3) MFE/MAE
±9 999 ile sınırlı. Pozisyon 304 elle onarıldı (stop 133,28 = dolum − 3,587);
olay bot_events'e yazıldı. Bu, maraton koluna dokunan bir hata düzeltmesidir;
strateji tanımı değişmedi.

**İlk short (15:00Z, 2026-09-04):** S1 ve S2 ROBOUSDT'yi 0,011331'den
3× kaldıraçla sattı; stop 0,011988 (girişin ÜSTÜNDE), notional ≈ 358 $,
risk %4,9. Satış geliri nakde girdi (S1 nakit 400 → 758,41), özsermaye
girişte 399,64 (nakit − ödünç varlık değeri; fark komisyon). Emir kaydı
MARKET SELL dolu; bekleyen stop emri (uzunda da) adaptör belleğinde, tabloya
yazılmıyor — eskiden beri böyle. Küçük pürüz: açılış mesajındaki "R" kısa
için ters okunuyor (rr_geometry uzun geometrisi) — gösterim, karar değil.

**Olay 2 (2026-09-04 12:30Z, bot 4 "Havuz Momentum · 15 dakika") — yarış:**
Gözetim döngüsü 12:30:25'te ADA ve DASH'i kapatıp nakdi 307'ye yazdı; karar
döngüsü botu 12:30:07'de (nakit 140) okumuş, pozisyonları daha sonra kapanmış
bulmuş, özsermayeyi 214 sanmış → "günlük zarar %44,6", haftalık %46, drawdown
%46,5 → kill switch (ZEC kapandı) → kendi eski nakdini üstüne yazdı. ADA+DASH
satış geliri 166,96 $ buharlaştı, bot hayalet zararla STOPPED. Kanıt:
`bot_events.created_at` = işlem başlangıcı (iki ayrı transaction), emir
`filled_at` damgaları, 12:15 özsermaye noktası (214,31 = 140,52 + yalnız ZEC).
Onarım: nakit +166,96 (381,27), 12:15 noktası düzeltildi, halt/blok
temizlendi, bot yeniden PAPER_RUNNING (16:35Z). Kod: bar kararı ve gözetim
turu artık tek `asyncio.Lock` ile sırayla koşar. Denetim: emir tabanlı
yeniden hesap (400 + Σsatış − Σalış, komisyon dâhil) 23 botun hepsinde
kuruşuna kadar tutuyor; bot 5'teki +18 $ görünümü re-base öncesi açılıp
sonra kapanan pozisyonun artığıydı, gerçek fark yok. Bu bir hata düzeltmesi;
bot 4'ün stratejisi değişmedi, zarar sayılmayan hayalet stop geri alındı.

## Kâr teşhisi ve H şeridi — 2026-09-04 akşamı

Belge: `docs/KAR-TESHISI-2026-09-04.md`. Özet: maliyet, dolum, rejim ve stop
genişliği temize çıktı; kayıp giriş seçiminde — bileşik puanın canlı IC'si ≈ 0,
yalnız `vol` öngörülü (24s t +10,8), momentum negatif (t −3,1); kapı 80–82
girişleri −52 $, 06–12 UTC girişleri −51 $; LINK 11 kolda −52 $ (filo tek bahis).

**Ön-kayıt — H şeridi (75 gün, 20 Haz → 2 Eyl, holdout son %30, 114 sembol):**
H1 kontrol / vol 60 / vol 75·momentum 0 / momentum 0; H2 gece 18–05 / kapı 82 /
kapı 85 / gece+kapı 82; H3 gece+vol 60 / gece+vol 60+kapı 82 / vol 100 / vol 60+kapı
82; H4 KISA kontrol / KISA vol 60 / İKİ YÖN vol 60 / KISA gece. Kabul kuralı aynı:
in-sample VE holdout beklenti ≥ kontrol + 0,05R, düşüş ≤ 1,2×; kabul edilen
varyant maraton bitene kadar yalnız YENİ kol olur. Bellek (7 GB) yüzünden aynı
anda 2 şerit; sonuçlar `scratchpad/tarama_H*.out`, deftere işlenecek.

**Yeni kollar (400 $, deney, 19:53Z):** N1 gece penceresi 18–05 (bot 28), N2
kapı 85 · 3 slot (bot 29), N3 gece + vol 60 + kapı 82 (bot 30). Hepsi bot 1'in
tanımından türedi; 14 gün eleme kuralına tabi.

## Sistem felci ve kurtarma — 2026-09-04 20:00–20:30Z

Kullanıcının "botları tek tek kontrol edelim, bug hunt yapalım" talimatıyla yapılan
incelemede sistemin **kendi kendini felç ettiği** ortaya çıktı. Üç bulgu:

**1. Nabız eşiği bar karar süresinden kısaydı (kök sebep).** Ölçüldü (162 bar):
karar süresi p50 157 sn, p90 270 sn. Supervisor eşiği 35 sn. Yani supervisor
worker'ı **tam karar verirken** öldürüyor; worker yeniden doğup aynı barı baştan
hesaplıyor, yük artıyor, daha çok worker gecikiyordu. 24 saatte **1697 yeniden
başlatma** (saatte 600'e varan tırmanış). Bar kararları yarıda kesildiği için
girişler ve çıkışlar da eksik kalıyordu — yani ölçtüğümüz −0,083R beklenti
bozuk bir sistemin çıktısı. Eşik 360 sn'ye çıkarıldı, 180 sn soğuma eklendi.
Sonuç: restart 0, bar süresi **157 sn → 53 sn**, load 21 → 5,5.

**2. Kripto tazelik kontrolü geri alındı.** Aynı gün eklenen "karar barı taze
olmayan sembolü atla" kuralı kriptoda hiçbir sembolü taze saymadı; 19:00 barı
veride 114 sembolle dururken 1h kollarının hepsi 18:00'de dondu (bir saatlik
karar kaybı). Seanslı pazarda kural yerinde; kriptonun bayat-bar riski
`stop_anchored_to_fill` ile kapalı.

**3. Nakit tavanı komisyonu saymıyordu.** `SizingEngine` tavanı tam
`serbest_nakit × kaldıraç` veriyor, `PaperAdapter` marj kuralına komisyonu da
ekliyordu; tavana dayanan her emir "yetersiz marj" ile reddediliyordu. A3 kolu
(filonun en kârlısı) 24 saatte **22 giriş** kaybetmiş. `NAKIT_EMNIYET_PAYI`
(0,995) eklendi.

**4. Bütçe tükendiğinde gürültü.** Maruziyet tavanı dolunca sistem her aday için
sizing çağırıp ayrı ret satırı yazıyordu: M1 kolu 24 saatte 420 satır. Üçüncü
bütçe reddinden sonra döngü tek özetle biter (adaya özgü retler sayılmaz).

**Karar süresi 157 sn → 16,5 sn (2026-09-04 21:07Z sonrası, 28 bar).** İki adımda:
(1) bar başına özellik önbelleği (`features/onbellek.py`) — indikatör/S-R/formasyon
hesabı strateji ayarından bağımsız, 20 kol aynı işi yapıyordu; (2) **izdiham
kilidi** — önbellek tek başına işe yaramadı, çünkü 20 kol aynı saniyede uyanıp
hepsi önbelleği boş buluyordu (ölçüm: 21:00 barında hepsi 160–177 sn'de aynı anda
bitirdi). Artık kilidi alan hesaplar, diğerleri bekleyip paylaşır; kilit sahibi
yetişmezse kalanı kendileri hesaplar (fail-open). Ölçülen aralık 8,9–21,4 sn,
sistem yükü 21 → 1,7.

Bunun kâr tarafındaki karşılığı: emir artık bar kapanışından ~16 saniye sonra
veriliyor, 157 saniye sonra değil. Teşhiste (§1) "sorun değil" diye geçilen
4 bps ortalama dolum sapmasının (p90 34 bps) büyük kısmı bu gecikmeydi.

## Sekiz boyutlu mantık denetimi — 2026-09-04 gecesi

Ultracode workflow: 8 boyut paralel tarandı (karar zinciri, para akışı, risk mantığı,
zaman/bar, veri hattı, tanım tutarlılığı, canlı davranış, üst mantık), **64 ham bulgu**
çıktı. Doğrulama aşaması kullanım limitine takıldığı için yalnız biri iki lensten
geçebildi; kalanları elle önceliklendirip doğruluyorum. Ham liste workflow journal'ında.

**Hemen doğrulanan ve kapatılanlar:**

1. **Özellik önbelleği BIST kolunu dondurmuştu (benim regresyonum).** Sağlayıcı gün
   sonunu geç bastığında kol henüz gelmemiş barı hesaplıyor, elinde önceki barın
   çerçevesi kalıyor ve o çerçeve önbelleğe yazılıyordu. Bar sonradan gelse bile herkes
   bayat kaydı okuyor, seanslı pazarın tazelik denetimi sonsuza kadar başarısız oluyordu:
   04.09 BIST barı 56 sembolle veritabanındayken bot 12 "hiçbiri puanlanamadı" deyip
   03.09'da dondu, üstelik 1d TTL'i üç gün. `paketle()` artık karar barını doğruluyor;
   eşleşmeyen bundle önbelleğe hiç girmiyor (sürüm 2, eski anahtarlar silindi).

2. **Sistem ölçülen tek kenarını boyutlandırmada eliyor** (KAR-TESHISI §9). 926 giriş
   kararı: açılanların sakinlik yüzdeliği 36,0, reddedilenlerin 64,9 (t = −9,20,
   p < 0,0001). `min_fill_ratio` kapısında ölenlerin sakinliği 82,0. Dar stop büyük
   notional üretiyor, notional tavanları kesiyor, %25 doluluk kuralı reddediyor.
   Ön-kayıt: **K1** (yalnız `min_fill_ratio` 0) ve **K2** (min_fill_ratio 0 + vol 60)
   kolları kuruldu; 14 gün, aynı eleme kuralı. Kabul ölçüsü: kontrol koluna göre
   beklenti ≥ +0,05R ve düşüş ≤ 1,2×.

3. **M1 kolu durduruldu — bozuk ölçüm üretiyordu.** Negatif aile ağırlıkları
   (`trend -15`, `momentum -15`) `family_weights` içinde işaret korunarak 100'e
   ölçekleniyor; taban puan [0,100] dışına çıkıp clamp'leniyor. 2229 puanın 144'ü tam
   100,00; bir barda altı sembol eşitlenince seçim (-puan, sembol) sıralamasıyla
   **alfabetik** sıraya düştü ve rotasyon imkânsız hâle geldi (100'ü devirmek 115 ister).
   Kolun 1 günlük çıktısı geçersiz. Negatif ağırlık artık `validate()` içinde reddediliyor;
   ters yön istenirse yol yüzdeliği çevirmektir (kısa yönde zaten öyle yapılıyor).

**Sıradaki doğrulama kuyruğu** (ham bulgulardan, önem sırası): filo özsermaye eğrisinin
TL ile USD'yi toplaması; `trade_stats`'ın re-base filtresiz karne üretmesi (bot 1 için
+483 $ görünüyor, maraton gerçeği +0,95 $); girişlerin yarısını açan formasyon
düzelticisinin hiç IC ölçümü olmaması; kapı sayısının kollar arasında 70 kat farklı
seçicilik üretmesi; rotasyonun 377 bin puan satırında hiç tetiklenmemesi; kalabalık
cezasının işlem yapılan hiçbir sembolde devreye girmemesi.

### H1 şeridi sonucu (75 gün, 20 Haz → 2 Eyl, 121 sembol, holdout son %30)

| Varyant | in n | in beklenti | in net | out n | out beklenti | out net |
|---|---|---|---|---|---|---|
| kontrol | 98 | −0,0830R | −7,90% | 31 | +0,0272R | −0,46% |
| vol 60 (V1 ağırlıkları) | 149 | −0,1106R | −12,43% | 54 | **+0,4287R** | **+11,39%** |
| vol 75 · momentum 0 | 15 | −0,7723R | −6,90% | 71 | +0,1140R | +3,53% |
| momentum 0 | 90 | −0,0784R | −7,97% | 30 | **+0,5522R** | **+8,32%** |

**Karar: üçü de RET.** Kabul kuralı in-sample VE holdout'ta kontrol + 0,05R istiyor;
üçü de holdout'ta kontrolü çok aşıyor (+0,40R ve +0,52R) ama in-sample'da geçemiyor.
Kural kuraldır, kabul yok.

İki not, ikisi de kayda değer:
1. **Kontrol in-sample beklentisi −0,0830R; canlı defterin 69 işlemdeki beklentisi
   −0,083R.** Backtest canlıyı birebir yansıtıyor — motorun doğruluğu için güçlü kanıt.
2. Ayrışma yönü **tersine overfit**: varyantlar eskide kötü, yenide iyi. Bu, kenarın
   rejime bağlı olduğu okumasıyla tutarlı (§6: sakinlik IC'si aşağı barlarda +0,167,
   yukarı barlarda +0,088). İki dönem farklı rejimler; tek bir sabit ağırlık vektörü
   ikisini birden kazanamıyor. Sıradaki soru sabit ağırlık değil, **rejime duyarlı
   ağırlık** olmalı — ama bu yeni bir düğme, ön-kayıtla ölçülmeli.

## Postgres bağlantı tavanı tükenmişti — 2026-09-05

"Eksik kaldı mı" kontrolünde ortaya çıktı. Tam test paketinde 32 veritabanı testi
"PostgreSQL çalışmıyor" diye atlanıyordu; Postgres çalışıyordu. Sunucuya doğrudan
sorulduğunda cevap net: **"sorry, too many clients already"**. Ölçüm: 5432'ye
**300 açık TCP bağlantısı**, sunucu tavanı 100.

Sebep yapısal: `db_pool_size=10` + `db_max_overflow=20` **süreç başınadır** ve filo
34 sürece çıkmıştı (29 worker + API + supervisor + marketdata + equitydata +
notifier). Teorik tavan 34 × 30 = 1020. Üç sonucu vardı: (1) 32 DB testi sessizce
atlanıyor, "582 geçti" yanıltıcı; (2) yeni worker bağlanamayabiliyor; (3) bağlantı
isteyen her yol (panel dâhil) hata riski taşıyor.

Düzeltme: worker havuzu süreç başına 2+2, API systemd drop-in ile 8+8. Bir worker
tek asyncio döngüsünde sıralı iş yapar. **Sonuç: 300 → 27 bağlantı** (29 worker
koşarken). Test: süreç başına 6'dan fazla bağlantı isteyen ayar kırmızı yanar.

Doğrulandı: düzeltme sonrası tam paket **615 geçti, 0 atlandı** (öncesi 582 geçti,
32 atlandı). "582 test geçiyor" raporu yanıltıcıydı; kapsam boşluğu kırmızı testten
tehlikeli, çünkü yeşil görünüyor.

Bu, günün dördüncü sessiz arızası. Ortak yanları: sistem çalışıyor görünürken bir
katman kapalıydı — nabız eşiği worker'ları öldürüyordu, önbellek BIST kolunu
donduruyordu, boyutlandırma ölçülen tek kenarı eliyordu, bağlantı tavanı testleri
atlatıyordu. Hiçbiri gürültü çıkarmadı; hepsi ölçümle bulundu.

## Bozulmaz kural 2 fiilen ihlal ediliyormuş — 2026-09-05

Denetimin zaten rapor üretemeyen iki boyutu ayrı ajanlarla yeniden koşturuldu.
Zaman/bar boyutu sistemin **temel kuralının ihlal edildiğini** buldu.

**Kök sebep tek satır:** `data/binance.py::parse_kline_row` koşulsuz
`is_closed=True` yazıyordu. REST uç noktası oluşmakta olan mumu da döndürür;
`close_time` alanı zaten okunuyor ve atılıyordu. WS yolu bunu baştan doğru
yapıyor (`is_closed=bool(k["x"])`). `store.upsert_klines`'daki "kapanmamış bar
yazılmaz" savunması bu yüzden **ölüydü**.

**Ölçülen etki.** Denetim anında havuzdaki 121 sembolün 7'sinde bugünün
oluşmakta olan 1d/4h barı karara giriyordu; aynı bundle kapanmamış bar
atılarak yeniden hesaplandığında `trend_4h` hatası **%26**'ya varıyor.
Puanlama kesitsel olduğu için 7 sembolün bozulması 121 sembolün sırasını
kaydırır. Daha ağırı **kalıcılaşma**: sembol izlenen kümeden düşünce kısmi bar
geçmişte donuyor. Çapraz denetim (4h ↔ 4×1h, 152.844 pencere) **131 sembolde
230 bozuk 4h barı** buldu; iki toplu olay (08-27 ve 08-31) güncel havuzun
95 ve 93 sembolünü etkiliyor. En kötüsü CHIPUSDT 08-27: kapanış %15,1 sapmış,
hacmin yalnız %6,2'si kaydedilmiş — pencerenin ilk birkaç dakikası.

**Yapılanlar.** (1) Kök sebep düzeltildi ve test edildi. (2) Bozuk veri
temizlendi: 11 açık bar + 213 kısmi 4h + 8 kısmi 1d silindi; boşluk denetimi
bunları artık doğru kodla yeniden çekecek. (3) `test_lookahead.py`'ye YAZMA
yolu testi eklendi — denetimin gösterdiği gibi mevcut 30 test yalnız saf
fonksiyonları kapsıyordu ve `is_closed` bayrağını hiç sınamıyordu.

**Aynı denetimin ikinci bulgusu (düzeltildi):** re-base tasfiyesi karneye
giriyordu. Damga tasfiye emirlerinden 0,22 saniye önce yazıldığı için çıkışa
bakan süzgeç eski dönemin zararını yeni kola yazıyordu: bot 5 karnesi
+7,16 $ görünüyordu, maraton gerçeği **+25,43 $**. Ölçüt artık pozisyonun
açılış zamanı.

Bu, günün beşinci ve altıncı sessiz arızası. Hepsinin ortak yanı aynı:
sistem çalışıyor görünüyordu, hiçbiri hata vermiyordu, hepsi ölçümle bulundu.

## Ölçüm araçlarının kendisi bozukmuş — 2026-09-05

Denetimin doğrulanmamış bulgularından ikisi elle sınandı; ikisi de **ölçüm
altyapısını** vuruyordu, yani bugüne kadarki kararların dayanağını.

**1. Backtest ardışık-zarar kesicisi sonsuz kilit yapıyordu.** Blok konduğunda
`_streak(trades)` tüm geçmişi sayıyor; blok bitince yeni işlem üretilemediği
için sayaç düşmüyor ve blok yeniden konuyor. Bir koşuda 1260 barın 943'ü (%75)
ölü, özsermaye eğrisi tam sabit, `flags` boş — rapor bunu hiç söylemiyordu.
Getiri, Sharpe, CAGR ve max-DD o ölü eğri üzerinden hesaplanıyordu. Canlı yol
bunu baştan doğru yapıyordu (`consecutive_losses(since=entries_blocked_until)`:
çekilmiş ceza seriyi affeder); backtest'te af yoktu — **bozulmaz kural 1
ihlali**. Düzeltildi ve testlendi. **H şeridi tarama sonuçları bu hatayla
üretildiği için geçersiz sayıldı; tarama düzeltilmiş motorla yeniden başlatıldı.**

**2. Kalibrasyon beş ayrı puan ölçeğini tek havuzda karıştırıyordu.**
`backfill_observations` yalnız `timeframe` süzüyor, `/calibration` yalnız
`bar_time`. Ölçüldü (4 saatlik ufuk): havuz Spearman +0,026 iken kollar tek tek
+0,006 / +0,015 / +0,045 / +0,043 ve **kısa kol −0,031**; üst desilin %59'u tek
bir kolun puanıydı. Kısa puanda yüksek değer tanım gereği DÜŞÜŞ beklentisidir
ama hedef uzun ileri getiridir. Panelin "dürüstlük organı" yanlış okutuyordu.
`/calibration` artık tek `config_hash` üzerinden hesaplıyor.

**Not — kendi ölçümlerim etkilenmedi:** §6/§7/§9'daki IC ve seçim ölçümlerinde
`config_hash` baştan süzülmüştü (ana ayar seçilerek). Etkilenen, panelin
gösterdiği kalibrasyon ve H şeridi backtest sıralamasıydı.
