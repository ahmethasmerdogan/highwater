# Sistem incelemesi — 2026-08-17

> Kullanıcı isteği: "sistemi nasıl daha iyi hale getirebiliriz araştır."
> Bu dosya **ölçüme dayanır**; her madde ya çalışan sistemden alınmış bir sayıyla
> ya da koddaki bir satırla gerekçelendirilmiştir. Hiçbir madde "iyi olurdu"
> temennisi değildir.
>
> Yöntem: 11 saatlik kesintisiz koşunun logları, canlı veritabanı sorguları ve
> ilgili kod yolları. Ölçüm anı: 2026-08-17 09:00 UTC.
> Öneriler **uygulanmadı** — biri hariç, o da bir kusurdu ve düzeltildi (§0).

---

## 0. Bu tur düzeltilenler (bilgi için)

| # | Ne | Nasıl bulundu |
|---|---|---|
| 1 | Girdi yokken boş havuz snapshot'ı yazılıyordu | Kesinti kurtarması, `OPEN-QUESTIONS` §10.1 |
| 2 | Boş/eksik havuz yeniden denenmiyordu | Aynı, §10.2 |
| 3 | Açık pozisyonlara emir defteri açılmıyordu | Aynı, §10.3(a) |
| 4 | Paper adaptörü pozisyon defterini kurtarmıyordu — **stop'lar dolamıyordu** | Aynı, §10.3(b) |
| 5 | **Risk devre kesicisi tetiklendiğinde karar barı çöküyordu** | Bu inceleme, §1 |

---

## 1. Risk devre kesicisi hiç çalışmamış *(düzeltildi)*

**Kanıt.** Gece loglarında üç `decision_loop_error`, üç botta da aynı:

```
File ".../bots/worker.py", line 402, in _check_risk
TypeError: BotWorker._emit() got multiple values for keyword argument 'level'
```

`_check_risk` hem `level=trip.level` geçiyor hem `**trip.as_dict()` açıyordu;
`as_dict()` zaten `level` taşıyor. Yani **bir kesici tetiklendiği anda** karar
barı istisna ile düşüyordu. Düşen bar şu satırları hiç çalıştırmıyordu:

- `bot.entries_blocked_until` atanması (giriş yasağı)
- `DEGRADED` durumuna geçiş
- `requires_manual_restart` → `STOPPED`
- `verdict.kill` → `_close_all` (**kill switch**)

Tetikleyici `STALE_DATA` kesicisiydi: piyasa verisi servisi her yeniden
başladığında heartbeat kısa süre bayat kalıyor, kesici tetikleniyor ve bar
çöküyordu. Yani bu, nadir değil **rutin** bir yol.

Faz 4 kabul kriteri "−%4 zararda giriş reddediliyor, −%15'te kill switch
tetikleniyor" diyor ve testlerde geçiyordu — ama testler `RiskEngine`'i saf
fonksiyon olarak sınıyordu. Kararı **uygulayan** katman sınanmamıştı.

**Düzeltme:** çift `level` kaldırıldı. `tests/test_risk.py`'ye iki test eklendi;
ikincisi `_check_risk`'i gerçekten çağırıyor ve düzeltme geri alındığında
kırmızıya dönüyor (doğrulandı).

**Alınacak ders (öneri):** her devre kesicinin *uygulama* yolunu sınayan bir test
gerekiyor, sadece karar veren fonksiyonu değil. Faz 11 kapısı "her kesici en az
bir kez gerçek koşulda tetiklendi ve **doğru davrandı**" diyor — bugüne kadar
tetiklenen tek kesici (STALE_DATA) doğru davranmadı.

---

## 2. 1d ve 4h verisi 2026-08-15'ten beri donmuş ⚠️ **en yüksek öncelik**

**Kanıt.**

| timeframe | sembol | en yeni bar | son 26 saatte gelen bar |
|---|---|---|---|
| 15m | 98 | 2026-08-17 08:45 | 6.158 |
| **1h** | 155 | 2026-08-17 08:00 | 1.840 |
| **1d** | 180 | **2026-08-15 00:00** | **0** |
| **4h** | 149 | **2026-08-15 00:00** | **0** |

BTCUSDT için: 1d son bar **2026-08-14**, 1h son bar 2026-08-16 22:00.

**Kök neden.** `MarketDataService.timeframes = ["15m", "1h"]` (`marketdata.py:122`).
WS yalnızca bu iki dilimin kline akışını dinliyor. 1d ve 4h satırları **yalnızca**
`backfill()` ile yazılıyor ve backfill tek seferlik: `cli.py` içinde
`--backfill-days` verilmedikçe çalışmıyor, systemd birimi de vermiyor. Dolayısıyla
1d/4h, 14–15 Ağustos'ta ne yazıldıysa o.

**Neden görünmüyor.** Saatlik veri kalitesi denetimi yalnızca
`settings.decision_timeframe` (1h) için çalışıyor (`marketdata.py:600`). 1d/4h
hiç denetlenmediği için "0 bulgu" raporu bu donmayı **gizliyor** — panelin veri
kalitesi sayfası temiz görünüyor.

**Etkisi üç yerde, üçü de sessiz:**

1. **Havuz filtreleri.** `build_candidates` volatilite (14 günlük yıllıklandırılmış)
   ve 3 günlük aralık kararlılığını `1d` çerçevesinden hesaplıyor
   (`engine.py:134` → `load_frames(..., "1d", limit=40)`). Bu iki filtre, iki gün
   önceki fiyatlarla eliyor. Son huni raporunda **VolatilityFilter 130 adaydan
   73'ünü** elemiş — bu karar bayat veriyle verildi.
2. **BTC rejim çarpanı** (§6.2 adım 5). `_btc_regime` 400 barlık **1d** çerçevesi
   okuyor; çerçeve ≥210 bar olduğu için hesap **yapılıyor**, ama 3 gün önceki
   kapanışla. "BTC EMA200'ün altında mı" sorusu üç günlük gecikmeyle
   cevaplanıyor. Bu bir risk kontrolüdür.
3. **Puanlama özellikleri.** `trend_4h` ve `trend_1d` (`scoring/engine.py:97`)
   trend ailesinin iki üyesi; aile ağırlığı 30. İkisi de her sembol için donmuş
   veriden geliyor.

**Seçenekler.**

| | Ne | Bedeli | Notlar |
|---|---|---|---|
| **A** | `timeframes`'e `"4h"` ve `"1d"` eklemek | Sembol başına +2 WS akışı (61 sembolde 122 akış). Binance tek bağlantıda 1024 akışa izin veriyor, sığar. | Tek satır. Mevcut tasarımla birebir tutarlı: 15m/1h nasıl geliyorsa öyle gelir. |
| **B** | Continuous aggregate'leri devreye almak | Migration + okuyucu değişikliği. | Mimari olarak en temiz (veri iki kez durmaz) ama §3'e bakın: bu görünümler şu an **boş ve okunmuyor**. |
| **C** | Bakım döngüsünde periyodik REST çekimi | Ağırlık tüketimi; 61 sembol × 2 dilim/saat. | WS varken gereksiz. |

**Öneri: A + denetimi genişletmek.** İki not:
- A yalnızca **bundan sonraki** barları getirir. 14 Ağustos'tan bugüne olan
  boşluk ayrıca doldurulmalı.
- Denetim `decision_timeframe` yerine "kullanılan tüm dilimler" üzerinde
  çalışmalı; yoksa bu donma bir daha sessizce tekrarlanır. Sessiz kalması,
  donmanın kendisinden daha kötü.

---

### 2b. UYGULANDI — 2026-08-17 09:20 · kullanıcı kararıyla A seçeneği

Uygulama sırasında iki şey daha çıktı; ikisi de düzeltmenin kendisi kadar önemli.

**(1) Denetimi genişletmek tek başına yetmezdi.** `audit_frame` yalnızca
çerçevenin **içindeki** boşlukları görüyordu (`find_gaps` = ardışık iki bar
arasındaki delta). Bir akış tamamen durduğunda çerçevede iç boşluk oluşmaz,
çerçeve sadece kısa kalır — ve denetim "temiz" der. Yani 4h/1d denetime
eklenseydi bile donma görünmeyecekti. `find_trailing_gap` eklendi: son kayıtlı
bar ile kapanmış olması gereken son bar arasına bakar, tolerans
`STALE_AFTER_BARS = 2` bar (dilim başına ölçekler: 1h'de 2 saat, 1d'de 2 gün).
Kuyruk boşluğu **normal bir boşluk olarak** raporlanıyor, böylece mevcut
`repair_gaps` onu REST ile dolduruyor ve temiz denetim kapatıyor — geçmiş
boşluğu için ayrı bir komut gerekmedi.

**(2) Referans sembol hiç izlenmiyordu.** Gerçek veride tespiti denerken çıktı:
BTCUSDT'nin yalnızca 1d'si değil **1h'si de** 10 bar geride. Sebep, BTC'nin
havuzda olmaması — havuzun volatilite filtresi onu düzenli olarak eliyor (BTC
çoğu zaman alt volatilite eşiğinin altında kalır) ve elenen sembol izlenmiyor.
Dolayısıyla 4h/1d akışını açmak, bu düzeltmenin **en önemli tüketicisini** —
rejim çarpanını — kurtarmıyordu.

BTC bir işlem adayı değil, bir **ölçü aletidir**; havuza girip girmediğinden
bağımsız izlenmelidir. `settings.reference_symbol` eklendi ve izlenen kümeye
açık pozisyonlarla aynı şekilde katılıyor. `_btc_regime` artık sabit sembol
yerine bu ayarı okuyor ve son bar iki günden eskiyse **uyarıyor** —
`regime_reference_stale`. Bu kontrol yokken hesap bayat veriyle yapılmaya devam
ediyordu ve kimse görmüyordu.

**Doğrulama.** İzlenen sembol 61 → 62, kline akışı 244 → **248** (62 × 4 dilim).
Tespit gerçek veride doğrulandı: BTC/ETH/SOL için 1h'de 10 bar, 4h'de 15 bar,
1d'de 2 bar kuyruk boşluğu raporlandı. Yedi yeni test.

**Hâlâ açık:** derinlik akışı 40 sembolle sınırlı ve referans sembol o listeye
girmiyor (girmesine gerek yok — rejim yalnızca kline istiyor). Ama bir gün
referans sembolde pozisyon açılırsa açık-pozisyon kuralı onu zaten eklerdi.

---

## 3. Continuous aggregate'ler ölü ağırlık

**Kanıt.** `ohlcv_1d`, `ohlcv_4h`, `ohlcv_1h` görünümleri ilk migration'dan beri
duruyor. Üçü de `materialized_only = true`, **satır sayısı 0**,
`timescaledb_information.jobs` içinde **yenileme işi yok**, ve hiçbir okuyucu
onları kullanmıyor — `load_frames` düz `ohlcv` tablosunu `timeframe` sütununa
göre sorguluyor.

Yani şemayı okuyan biri "1d verisi aggregate'ten geliyor" sanır; gelmiyor.
Ya devreye alınmalı (§2 seçenek B) ya da düşürülmeli. Şu hâli yanıltıcı.

---

## 4. Havuzdan çıkan sembolün kalite bulgusu asla kapanmıyor

**Kanıt.** 31 açık bulgu, 19 farklı sembol. Bu 19 sembolün **hiçbiri** güncel
havuzda değil. Saatlik denetim yalnızca izlenen sembolleri dolaşıyor
(`symbols = sorted(self.tracked_symbols)`), dolayısıyla `close_resolved_gaps`
onlar için hiç çağrılmıyor. Panelin veri kalitesi sayfası bu 31 kaydı sonsuza
kadar "açık sorun" olarak gösterecek.

Bu, 16 Ağustos'ta kapatılan hatanın (`resolved` alanını kimse doldurmuyordu)
kardeşi: alan artık doluyor, ama yalnızca izlenen semboller için.

**Öneri:** denetim turunun sonunda, izlenmeyen sembollerin açık bulguları da
değerlendirilmeli — ya kapatılmalı ya "artık izlenmiyor" olarak işaretlenmeli.
İkincisi daha dürüst: boşluk onarılmadı, sadece artık ilgilenmiyoruz.

---

## 4b. Aykırı değer bulguları her saat yeniden yazılıyor — ve bunu §2b büyüttü

**2026-08-17 12:10'da izleme turunda bulundu.** Açık bulgu sayısı 109 → 140'a
**çıktı** (düşmesi beklenirken). Sebep boşluk değil: 1d'deki 88 açık kaydın
84'ü **aykırı değer** — küçük hacimli coinlerde bir günde %65+ hareketler
(TLMUSDT +%77, REUSDT +%104). Bunlar gerçek piyasa hareketleridir, veri hatası
değil.

Sorun şu: `close_resolved_gaps` yalnızca `kind='gap'` kayıtlarını kapatıyor.
Aykırı değer kaydı hiç kapanmıyor ve her denetim aynı **tarihsel** barı yeniden
raporluyor. Ölçüldü — aynı (sembol, bar) çifti üç kez yazılmış:

```
ALLOUSDT       2026-06-06   3 kez
币安人生USDT   2026-04-14   3 kez
ESPUSDT        2026-02-24   3 kez
```

Üç kez = 10:02, 11:02, 12:02 denetimleri. Büyüme hızı ~31 kayıt/saat
(~744/gün). Tablo şu an 474 satır; 95'i aykırı değer.

**Bu kusur yeni değil, ama §2b onu dörde katladı.** Denetim daha önce yalnızca
karar dilimini (1h) tarıyordu; artık dört dilimi tarıyor, dolayısıyla aynı churn
dört kat hızlı birikiyor. Donmuş veriyi görünür kılmanın bedeli bu oldu ve
düzeltmenin parçası olarak sayılmalı.

**Zarar sınırlı** (günde ~30 KB, disk sorunu değil) **ama panel yanıltıcı:**
veri kalitesi sayfası 140 "açık sorun" gösteriyor; bunların çoğu aynı birkaç
tarihsel altcoin pompasının kopyası.

**Öneri (uygulanmadı).** Aynı `(symbol, timeframe, kind, bar)` için ikinci bir
satır yazmamak. Bu bir politika kararı değil — birebir aynı bulgunun ikinci
kopyası hiçbir bilgi eklemiyor. İki alternatif **yanlış** olurdu: (a) aykırı
değeri "çözüldü" saymak (tarihsel bir barın özelliği çözülmez), (b) aykırı değer
denetimini son N bara sınırlamak (o zaman geçmişteki bozuk tick hiç görünmez).

Neden şimdi yapılmadı: kalıcılık koduna dokunmak ve test yazmak gerekiyor,
izleme nöbetinin yetkisi bu değil. Aciliyeti de yok.

---

## 5. `top_n = 100` ulaşılamaz bir hedef

**Kanıt.** Havuz tarihsel olarak 44 → 65 arasında; şu an 61. Filtre zinciri
336 adaydan 61 çıkarıyor ve bunun en büyük kesimi SpreadFilter (%0,30 eşiği) ile
VolatilityFilter. `top_n=100` olduğu sürece `size < top_n` **her zaman** doğru,
yani süpervizör "havuz eksik" durumundan hiç çıkmaz.

Bu tur eklenen politika sayesinde bunun bedeli küçük: her 3 dakikada bir zincir
koşuyor (~2 sn) ve sonuç değişmediyse **hiçbir şey yazılmıyor**
(`universe_unchanged` logu canlıda doğrulandı). Ama "eksik" durumu artık bir
uyarı sinyali değil, sabit bir arka plan gürültüsü.

**Öneri (parametre kararı — kullanıcıya ait):** `top_n`'i gerçekleşen havuza
yaklaştırmak (~65) hedefi anlamlı kılar. Alternatif: `top_n`'i hedef olarak
bırakıp "eksik" eşiğini ayırmak (örn. hedefin %80'inin altındaysa uyar).
**Uyarı:** havuzu büyütmek için filtre gevşetmek bir cevap değil — bu tur
ölçülen medyan spread 3,05 bps ve eşik zaten oradan altı kat gevşek.

---

## 5b. Havuzu sınırlayan şey likidite değil, 1d verisinin kapsamı ⚠️

**2026-08-17 11:05'te, kuyruk boşluğu düzeltmesinin yan ürünü olarak bulundu.**
11:02 denetimi 1d'de 28 yeni bulgu yazdı ve onarım **0 bar** doldurdu. Bulguların
içeriği boşluk değil, `{"reason": "veri yok"}` — o semboller için 1d çerçevesi
**tamamen boş**.

Sayılar (TRADING durumundaki USDT çiftleri):

| 1d verisi | sembol |
|---|---|
| hiç yok | **325** |
| 15 bardan az (14 günlük volatilite hesaplanamaz) | 1 |
| 15+ bar | **158** |

Aynı andaki huni raporu:

```
 7. SpreadFilter          kaldı 165   elendi  69
 8. TickSizeFilter        kaldı 128   elendi  37
 9. VolatilityFilter      kaldı  58   elendi  70   ← zincirin en büyük kesimi
10. RangeStabilityFilter  kaldı  57   elendi   1
```

`annualized_volatility` 15 bardan az veriyle `None` döner ve `VolatilityFilter`
`None` gelen adayı eler. Yani spread ve tick filtrelerinden geçmiş 128 adayın
70'i, **piyasa özelliği yüzünden değil, günlük geçmişi hiç indirilmediği için**
eleniyor. Filtre kâğıt üzerinde "çok sakin / çok çılgın coinleri ele" diyor;
pratikte yaptığı iş "geçmişi olmayan coinleri ele".

Bunun iki sonucu var:

1. **Havuz 57'de, hedef 100** (`§5`). Sebep likidite değil, veri kapsamı. Havuza
   sonradan giren bir sembolün 1d/4h geçmişi hiçbir yerde doldurulmuyor: WS akışı
   yalnızca **bundan sonraki** barları getirir, backfill ise tek seferlikti ve
   14–15 Ağustos'ta o günün havuzu için koşmuştu.
2. **Havuz kompozisyonu, ölçülen bir kritere göre değil, indirme geçmişine göre
   belirleniyor.** Bu, dürüst backtest için tehlikeli: geçmişe dönük havuz
   yeniden kurulurken (Faz 0a'nın 2. adımı) bu asimetri yoktu, canlı sistemde
   var. Yani canlı havuz ile backtest havuzu **aynı kuralla** kurulmuyor.

**Öneri (uygulanmadı — kullanıcı kararı).** Aday kümesinin tamamı için (ön eleme
~250 sembol) 1d ve 4h geçmişini bir kez doldurmak. Ondan sonra `VolatilityFilter`
gerçekten volatiliteye göre elemeye başlar ve havuzun 100'e yaklaşıp
yaklaşmayacağı **ölçülebilir** hâle gelir. Neden şimdi yapılmadı:

- 250 sembol × 2 dilim'lik bir dolgu, ayrı bir süreçten Binance'e gider ve
  bozulmaz kural 5'in koruduğu şeyi (tek çıkış noktası, koordineli hız sınırı)
  geçici olarak bozar. Servisin içinden yapılması gerekir.
- Havuz kompozisyonunu değiştirir; yani **açık pozisyonları olan çalışan bir
  sistemin** karar girdisini değiştirmek demektir. Kullanıcı uyanıkken yapılmalı.
- Havuzu büyütmek işlem sayısını artırır ve kıyas ölçütünü hızlandırır — bu bir
  avantaj gibi görünse de, bir filtreyi fiilen devre dışı bırakmanın gerekçesi
  "daha çok işlem istiyorum" olmamalı. Doğru gerekçe: filtre şu an **tasarlandığı
  işi yapmıyor**.

---

## 6. Ölçüm ve gözlem katmanı eksik (Faz 11)

| Ne | Durum |
|---|---|
| `/metrics` ucu | **Var, HTTP 200** — ama hiçbir toplayıcı okumuyor |
| Prometheus / Grafana | Kurulmadı |
| Sentry | Kurulmadı |
| Playwright E2E | `package.json`'da bağımlılık var, **tek test yok** (`apps/web/tests` dizini bile yok) |
| Görsel regresyon | Yok |
| Gecelik yedek + geri yükleme provası | **Var** — `scripts/yedek-al.sh` (gecelik 04:00) + `scripts/yedek-prova.sh` (haftalık, pazar 05:00). İlk prova 20 Ağustos 2026'da geçti: 1.594.173 satırlık `ohlcv` dâhil tüm tablolar geri geldi |

Bu tur bulunan beş kusurun beşi de **logları elle okuyarak** bulundu. Bir
toplayıcı olsaydı `decision_loop_error` sayacı 22:05'te üç kez artıp gözle
görülür bir alarm üretirdi. Faz 11'in en yüksek getirili parçası bu.

**Bu turun ürettiği somut alarm adayları:** `decision_loop_error`,
`universe_input_unavailable`, `paper_rejected{reason}`, veri tazeliği
(dilim başına en yeni bar yaşı), `NRestarts`.

---

## 7. Dayanıklılık: ölçülen iyi haber

11 saatlik koşunun sonunda:

| Servis | Durum | Yeniden başlatma | Bellek |
|---|---|---|---|
| api | active | **0** | 206 MB |
| marketdata | active | **0** | 179 MB |
| supervisor (+3 worker) | active | **0** | 703 MB |
| notifier | active | **0** | 55 MB |
| web | active | **0** | 108 MB |

Postgres ve Redis 11 saat `healthy`. Toplam RAM kullanımı 3,7/7,7 GB, takas 0.
Veritabanı 204 MB (en büyük tablolar: `scores` 14 MB, `spread_samples` 12 MB).
Disk 17/108 GB. **Kaynak tarafında bir darboğaz yok.**

Loglar artık journald'da ve journald **kalıcı** (`/var/log/journal` mevcut,
36,5 MB) — eski `/tmp/sarnic-*.log` düzeninden farklı olarak yeniden başlatmada
kaybolmuyor.

---

## 8. Devralınan açık maddeler (bu inceleme kapatmadı)

1. **Faz 0a'nın eleyici hipotezi** hâlâ test edilmedi (`TRIAL-LEDGER` aday 1).
   Sistemin varlık nedeni olan soru — "bu puanlama işe yarıyor mu" — hâlâ
   cevapsız ve cevabı bu incelemedeki hiçbir madde değiştirmiyor.
   **Not:** §2'deki donmuş 1d/4h verisi, puanlamanın bir kısmını bozuk besliyor.
   Yeni bir hipotez denemesinden **önce** §2 düzeltilmeli; yoksa deneme bayat
   girdiyle yapılmış olur ve defterde bir deneme daha boşa harcanır.
2. **Discord webhook'ları** muhtemelen hiç kaydolmadı (16 Ağustos hatası).
   Bildirim gitmiyor olabilir; Entegrasyonlar sayfasından kontrol edilmeli.
3. **Depoda tek commit yok.** 11 saatlik koşu ve beş kusur düzeltmesi yalnızca
   çalışma ağacında duruyor.
4. ~~`!ticker@arr` akışı hâlâ sessiz~~ **Çözüldü, 2026-08-18.** Kök neden
   ölçüldü: Binance `!ticker@arr` aboneliğini kabul ediyor ama tek mesaj
   göndermiyor — 9443, 443 ve `data-stream.binance.vision` uçlarının
   üçünde de 25 saniyede 0 mesaj. Aynı davranış `!bookTicker`'da da var.
   Buna karşılık tek sembollü `btcusdt@ticker` ve tüm piyasa
   `!miniTicker@arr` sorunsuz çalışıyor, yani sorun ağda ya da kodda
   değil. Akış `!miniTicker@arr`'a çevrildi; yüzde değişim alanı orada
   olmadığı için açılış/kapanıştan hesaplanıyor. REST yedeği kaldırılmadı
   ama artık dakikada bir değil, yalnızca akış sustuğunda ve 15 dakikada
   bir tam anlık görüntü için çalışıyor (miniTicker yalnızca işlem gören
   sembolleri gönderdiği için tam tazeleme şart). Ağırlık tüketimi
   dakikada 80'den ~5'e düştü.
5. Backtest maliyeti ~94 ms/bar; 100 sembol × 2 yıl tek makinede saatler.
6. **Faz 11 kapısının 60 günlük kesintisiz paper penceresi fiilen başlamadı.**
   Bugünkü kesinti + boş havuz aralığı + bu tur bulunan beş kusur, o sayacı
   sıfırlıyor. Kapı "60 gün kesintisiz" diyorsa, sayaç düzeltmelerin
   yerleştiği andan itibaren işlemeli.

---

## Önerilen sıra

1. ~~**§2** — 1d/4h akışını bağla, boşluğu doldur, denetimi tüm dilimlere
   genişlet.~~ **Yapıldı, bkz. §2b.**
2. **§6** — Prometheus + Grafana + birkaç alarm. Bu tur beş kusuru elle bulduk.
3. **§4** ve **§3** — küçük, kayıt dürüstlüğünü artıran temizlikler.
4. **§5** — `top_n` kararı (kullanıcıya ait).
5. **§8.1** — Faz 0a'nın sıradaki hipotezi. Artık girdi temiz — **ama** puanlama
   en az bir tam gün taze 4h/1d ile beslendikten sonra başlanmalı; bugünkü
   veriyle yapılacak deneme yarısı bayat girdiyle hesaplanmış olur.

---

## Ek: "gece 200 dolar kazandı" — ölçüm

Rakam doğru; **anlamı** değil. Pencere: 2026-08-15 03:00 → 2026-08-17 08:00
(2 gün 5 saat), üç bot, her biri 5.000 USD ile başladı.

| | |
|---|---|
| Botların özsermayesi | 15.000 → **15.231** (**+%1,54**) |
| — gerçekleşen kâr | +105,45 (19 işlem, 11'i kazançlı, 20,32 komisyon) |
| — açık pozisyonların katkısı (gerçekleşmemiş) | +125,55 |
| **Aynı havuzun eşit ağırlıklı al-ve-tut sepeti** | **+%1,363** |
| Medyan coin | +%1,587 |
| BTC | **−%0,218** |

**Okunuşu:** altcoin sepeti bu pencerede ~%1,4 yükseldi, BTC hafif düştü.
Botlar %1,54 yaptı — yani **piyasa hareketini yakaladılar, onu geçmediler.**
0,18 puanlık fark 2 günde ve 19 işlemde gürültüdür; sistemin kendi eşiği
30 gün + 30 işlem, ve o eşik henüz dolmadı. Ayrıca kârın **yarısından fazlası
gerçekleşmemiş** — açık pozisyonlar kapanınca değişir.

Üstüne: bu pencere temiz bir ölçüm penceresi değil. İçinde elektrik kesintisi,
havuzun bir saat boş kaldığı aralık, çıkışların dolamadığı ve gecikmeli
dolduğu saatler var. **Bu sayı bir sonuç değil, bir işaret bile değil.**
Sistemin cevaplaması gereken soru hâlâ Faz 0a'nın sorusu.

---

## 9. 15m/30m botları yapısal olarak işlem açamıyor ⚠️ *(2026-08-18 15:20, izleme turunda bulundu)*

**Belirti.** 09:32'de kurulan bot 4 (15m) ve bot 5 (30m) altı saat boyunca her bar
87 sembol puanladı, heartbeat attı, panelde `PAPER_RUNNING` göründü — ve **tek bir
pozisyon açmadı**. Olay dökümlerinde yalnızca `scores.updated` var: bir giriş
denemesi, bir red, bir uyarı yok.

**Kök neden.** `load_bundles` göstergeleri botun kendi karar dilimiyle üretiyor
(`timeframes_for("15m") → ("15m","4h","1d")`), ama `_build_context` sabit `"1h"`
anahtarını okuyor:

```python
h1 = b.indicators.get("1h")                      # bot 4/5 için daima None
if h1 is None or not math.isfinite(h1.close):
    continue                                     # prices ve stops boş kalıyor
```

`prices` ve `stops` boş kaldığı için `_consider_entries` adayları buluyor ama
hepsi şu satırda düşüyor:

```python
if stop is None or entry is None:
    continue                                     # log yok, olay yok, sayaç yok
```

**İki kusur üst üste biniyor:** (1) sabit yazılmış `"1h"` — asıl hata;
(2) sessiz `continue` — altı saat fark edilmemesinin sebebi. Boyutlandırma reddi
olay yayınlıyor, bu yol yayınlamıyor.

**Ölçüm.** Son 6 saatte eşiği (70) geçen aday: 15m'de **118**, 30m'de **68**
(maks puan 81,9 ve 88,5). Redis'te beş dilimin de son-bar kaydı dolu, bar
derinliği bol (15m 3148, 30m 2523 bar/sembol) — veri eksikliği değil. Botlar 1–3
çalışıyor çünkü sabit `"1h"` onların dilimiyle çakışıyor.

**Önerilen düzeltme (uygulanmadı — kullanıcı onayı bekliyor).**
`b.indicators.get(definition.timeframe)` ve sessiz `continue`'ya bir olay.
Uygulanmama sebebi: nöbet yetkisi işletme müdahaleleriyle sınırlı ve `worker.py`
eşzamanlı olarak başka bir oturumda düzenleniyor.

**Daha geniş ders.** Zaman dilimi başına bot desteği veri modelinde var
(ROADMAP Faz 9) ama karar yolunda **sabit yazılmış bir dilim** kalmış. Yeni bir
dilim eklemek yetmiyor; karar yolundaki her `"1h"` sabitinin taranması gerekiyor.
