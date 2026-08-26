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
