# Kâr marjı araştırması — kenardan kâra giden yol (2026-09-05)

> Soru: "Kâr marjını nasıl artırabiliriz?" Kod değiştirilmedi; yalnız ölçüm.
> Veri: 31.360 canlı puan satırı (353 bar, 138 sembol, 15 Ağu–5 Eyl), aynı
> dönemin OHLCV'si. Sıralama ölçütü olarak §7'de en iyi çıkan bileşim kullanıldı:
> `0,7 × (sakinlik + sıkışma)/2 + 0,3 × trend_1d`. Getiriler **piyasa-nötr**
> (kesit medyanı çıkarılmış) ve **medyan** üzerinden; kripto dağılımı çarpık
> olduğu için ortalama yanıltıcı.

## 1. Kısa cevap

Kenar var ve ölçülüyor. Sistem onu beş ayrı yerde birden kaybediyor. Beşi de
parametre meselesi, hiçbiri yeni bir sinyal gerektirmiyor:

| Kaldıraç noktası | Bugünkü ayar | Ölçülen en iyi | Kayıp |
|---|---|---|---|
| Tutma süresi | ~12 saat | 48–72 saat | maliyet bariyeri aşılamıyor |
| Pozisyon sayısı | 4 | 6–8 | tepe yoğunlaşması |
| Seçicilik | üst %0,2 | üst %5–10 | en tepe negatif |
| Stop mesafesi | ≈%4 | %6–8 | dar stop kenarı sıfırlıyor |
| Yön | yalnız uzun | iki yön | düşen piyasada kenar kullanılamıyor |

## 2. Kenar zamanla büyüyor; maliyet bariyeri 12 saatte aşılıyor

Top-4 seçim, piyasa-nötr medyan getiri (bps). Maliyet round-trip ≈30 bps
(10 bp komisyon + 5 bp kayma, giriş ve çıkış).

| Tutma | puan (bugünkü) | sakinlik | karma | karma − maliyet |
|---|---|---|---|---|
| 1 saat | 0,0 | 1,5 | 1,8 | **−28,2** |
| 4 saat | 2,7 | 9,0 | 10,6 | **−19,4** |
| 8 saat | 5,5 | 16,9 | 20,3 | −9,7 |
| 12 saat | 7,7 | 28,3 | 31,5 | +1,5 |
| 24 saat | 17,1 | 34,8 | 46,6 | +16,6 |
| 48 saat | 2,4 | 59,8 | 61,6 | +31,6 |
| **72 saat** | 35,0 | 145,0 | 134,3 | **+104,3** |

Sinyal 1–4 saatlik ufukta maliyeti karşılamıyor; 12 saatte başabaş, 48–72
saatte açık ara kârlı. Canlı defter bunu doğruluyor: 24–72 saat tutulan 12
işlem +1,01R ve %83 kazanma verirken, 2–6 saat tutulan 24 işlem −0,71R.
Bugünkü ortalama tutma 12,3 saat, yani tam bariyerin dibinde.

## 3. En tepe kötü; tatlı nokta üst %5–10

24 saatlik ufuk, karma sıralamada yüzdelik dilimler:

| Dilim | n | medyan | ortalama |
|---|---|---|---|
| üst %1 | 404 | +9,3 | **−54,4** |
| üst %5 | 1.722 | +49,0 | +49,9 |
| **üst %10** | 3.254 | **+51,0** | +62,1 |
| üst %25 | 7.919 | +38,8 | +63,9 |
| alt %25 | 7.488 | **−66,5** | −4,3 |

En uç %1 hem medyanda zayıf hem ortalamada negatif. Bugünkü kapı (min_score 80)
kesitin **%0,2'sini** geçiriyor, yani sistem tam da bu kötü bölgede çalışıyor.
"Kapıyı yükselt" sezgisi ölçümle çelişiyor; doğru hareket kapıyı **gevşetip**
üst %5–10 bandına yaymak.

## 4. Pozisyon sayısı: 4 az, 6–8 doğru

| top-N | medyan | ortalama |
|---|---|---|
| 1 | +3,6 | −70,2 |
| 2 | +26,5 | +6,0 |
| 4 (bugünkü) | +46,6 | +37,4 |
| **6** | **+51,3** | +55,3 |
| 8 | +50,0 | +58,5 |
| 20 | +41,4 | +64,4 |

Tek pozisyon felaket (ortalama −70): tek kötü seçim her şeyi yiyor. 6–8 arası
tepe. 20'ye kadar bozulma yavaş, yani derinlik cezası küçük — bu, §7'deki
"sakinlik sıralaması derin" bulgusuyla tutarlı.

## 5. Dar stop kenarı sıfırlıyor

Top-6 karma seçim, 48 saatlik pencere, farklı stop mesafeleri:

| Stop | medyan | ortalama | kayıpla kapanma |
|---|---|---|---|
| stopsuz | +42,3 | +225,8 | %45 |
| **%2** | **−200,0** | +139,6 | %64 |
| %4 (bugünküye yakın) | 0,0 | +187,2 | %50 |
| %6 | +28,4 | +207,9 | %47 |
| %8 | +37,5 | +217,6 | %46 |

Sakin sembol seçmenin bütün anlamı, gürültüyle stoplanmadan hareketi
beklemek. %2 stop medyanı −200 bps'e çeviriyor; bugünkü stop mesafesi medyanı
(1 saatlik kolda %3,99) tam sıfır noktasında. **Not:** bu, §3'teki "stop dar mı"
ölçümünü çürütmüyor, tamamlıyor. Orada mevcut işlemlerin MAE'sine bakılmıştı ve
"2 ATR görevini yapıyor" çıkmıştı; burada seçim kuralı değiştirildiğinde stopun
kenarı nasıl kestiği ölçülüyor. Sakin sembollerde ATR küçük olduğu için 2 ATR
mutlak olarak çok dar kalıyor.

## 6. Uzun-only olmak kenarın yarısını çöpe atıyor

Piyasa yönüne göre top-6 karma seçim, 24 saat:

| Rejim | bar | piyasa-nötr medyan | HAM medyan |
|---|---|---|---|
| yukarı | 152 | +0,8 | **+193,0** |
| aşağı | 200 | **+83,1** | −61,1 |

Okuma: yükselen piyasada seçim kuralı evrene göre hiçbir şey katmıyor ama
mutlak getiri yüksek (beta). Düşen piyasada seçim kuralı evreni açık ara
yeniyor (+83 bps) ama uzun-only olduğu için mutlak sonuç yine eksi. Yani
**gerçek seçim gücü düşen piyasada, ve orada kullanılamıyor.** Ölçüm penceresinde
barların %57'si düşen bar.

## 7. Kısa taraf ölçüldü: uzun taraftan güçlü

Karma sıralamanın **alt** ucundan 6 sembol (en oynak, en dağınık), 24 saat:

- Uzun alınsaydı: ham medyan **−133,2 bps**
- Kısa açılsaydı: ham medyan **+133,2 bps**, maliyet sonrası ≈ **+103 bps**

Alt uç, üst uçtan daha güçlü bir sinyal veriyor (üst uç +51 bps). Bu mantıklı:
"oynak ve dağınık" durumu tanımak, "sakin ve sıkışmış" durumu tanımaktan kolay.
S1/S2 kısa kolları bu hipotezi zaten canlıda sınıyor; ölçüm onları destekliyor.

## 8. Bileşik etki tahmini

Beş ayarın hepsi düzeltilirse, ölçülen sayılarla kaba bir üst sınır: 72 saat
tutma + üst %10 bandı + 6 pozisyon + %6–8 stop ile işlem başına ≈ +100 bps
piyasa-nötr medyan. Kaldıraç bunu doğrudan çarpar (3× ile ≈ +300 bps), ama
düşüşü de çarpar; kaldıraç ancak kenar sağlamlandıktan sonra anlamlı.

Bu bir tahmin, vaat değil. Üç ciddi çekince:

1. **Örneklem 21 gün.** Tek bir rejim dilimi; 353 bar. Holdout yok.
2. **Simülasyon idealize.** Likidite, kısmi dolum, korelasyon kümesi ve gerçek
   emir defteri yok; yalnız fiyat serisi.
3. **Kısa tarafın borç maliyeti** bu hesaba girmedi (1× kısada bile tam notional
   üzerinden faiz işliyor).

## 9. Öneri sırası — ucuzdan pahalıya

1. **Tutma süresini uzat, erken çıkışları kıs.** Puan çıkışı ve zaman çıkışı,
   kenar henüz olgunlaşmadan pozisyonu kapatıyor. En ucuz ve en büyük etki.
2. **Kapıyı gevşet, seçimi derinleştir.** Üst %0,2 yerine üst %5–10; slot 4 → 6.
3. **Stop mesafesini genişlet** (ATR katını artır ya da mutlak taban koy).
4. **İki yönü aç.** Kısa kollar zaten canlıda; ölçüm alt ucun daha güçlü
   olduğunu söylüyor.
5. **Kaldıraç en sona.** Kenar sağlamlanmadan kaldıraç yalnız kaybı büyütür —
   canlı defter bunu zaten gösterdi (A2, 5× kaldıraç, en zararlı kol).

Her madde ön-kayıtlı bir kolla sınanmalı: in-sample **ve** holdout'ta kontrol
+ 0,05R, düşüş ≤ 1,2×. Bugün kurulan K1/K2/D1 kolları 2. ve kısmen 3. maddeyi
zaten test ediyor.
