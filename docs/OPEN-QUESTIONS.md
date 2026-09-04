# SARNIÇ — Açık sorular

> Bozulmaz kural 7: **Sessiz varsayım yok.** Spec'te olmayan bir karar gerekiyorsa
> uydurulmaz — sorulur veya buraya yazılıp devam edilir.
>
> Bu dosya inşaat sırasında verilen ve **spec'te karşılığı olmayan** kararların
> kaydıdır. Her madde: ne soruldu, şimdilik ne yapıldı, doğru cevap nereden gelir.

---

## 1. `atr_pct` "rejimi" hangi yönde puanlanmalı?

**Spec:** §5.2, Volatilite/Yapı ailesi → "ATR% rejimi".

**Belirsizlik:** "Rejim" kelimesi yönü söylemiyor. Yüksek ATR% iyi mi (hareket var),
kötü mü (gürültü ve slipaj) yoksa orta bant mı tercih edilmeli?

**Şimdilik:** `higher_is_better=False` — düşük gerçekleşmiş volatilite daha yüksek
yüzdelik alıyor. Gerekçe: boyutlandırma zaten `vol_scalar` ile volatiliteyi
normalize ediyor (§6.2 adım 3); aynı sinyali puanda bir kez daha ödüllendirmek
çift sayım olurdu. Ayrıca yüksek ATR% doğrudan daha yüksek kayma demektir.

**Doğru cevap nereden gelir:** Kalibrasyon sayfası `vol` ailesinin IC'sini ayrı
gösteriyor. IC sürekli negatifse yön ters çevrilir; sıfır civarındaysa ailenin
ağırlığı sorgulanır.

**Dosya:** `sarnic/scoring/registry.py`

---

## 2. Formasyon motorunda kernel simetrik mi, nedensel mi?

**Spec:** §4.3, "Lo–Mamaysky–Wang çizgisinde: fiyat serisi kernel regresyonla
yumuşatılır (bandwidth çapraz doğrulamayla seçilir)".

**Belirsizlik:** LMW'nin orijinal yöntemi **simetrik** kernel kullanır — `t`
barının yumuşatılmış değeri `t+1`'i görür. Bu, bozulmaz kural 2'yi doğrudan
çiğner.

**Karar:** Kernel **tek yanlı (nedensel)** yapıldı. Bant genişliği de klasik
çapraz doğrulamayla değil, **bir-adım-ileri tahmin hatasıyla** seçiliyor —
bu ölçüt geçmişte kalır.

**Sonucu:** Formasyonlar LMW makalesindekinden daha geç ve daha az tespit edilir.
Bu bilinçli bir maliyettir: geç ama dürüst.

**Dosya:** `sarnic/features/patterns.py` · test: `tests/test_lookahead.py`

---

## 3. Backtest'te bar içi stop nasıl tetiklenir?

**Spec:** §7 stop kuralını tanımlıyor ama backtest'te barın hangi fiyatından
dolduğunu söylemiyor.

**Karar:** Barın `low` değeri stop'un altına indiyse stop **o barda** tetiklenmiş
sayılır. Dolum fiyatı stop seviyesidir; barın açılışı stop'tan daha kötüyse
(gap) açılış kullanılır.

**Gerekçe:** Yalnızca kapanışa bakmak backtest'i sistematik olarak iyimser
gösterir — gün içinde stop'a değip toparlanan barlar kâr gibi görünürdü.

**Dosya:** `sarnic/backtest/engine.py::_check_intrabar_stops`

---

## 4. Kaldıraçlı token tespiti nasıl yapılır?

**Spec:** §3.2 filtre 2 → "`UP/DOWN/BULL/BEAR/3L/3S` içeren semboller elenir".

**Belirsizlik:** Düz "içeriyorsa ele" kuralı `JUP` (Jupiter), `SUPER`, `BEARCOIN`
gibi meşru varlıkları da eler.

**Karar:** Son ek eşleşmesi + taban varlığın en az 2 karakter kalması koşulu.
`BTCUP` → elenir; `JUP` → elenmez.

**Doğru cevap nereden gelir:** Binance `exchangeInfo` yanıtında kaldıraçlı
tokenlar için ayrı bir izin/etiket alanı varsa ona geçilmelidir. v1'de bu alan
güvenilir bulunmadığı için isim tabanlı kural kullanılıyor.

**Dosya:** `sarnic/universe/filters.py` · test: `tests/test_universe.py`

---

## 5. Eşik karşılaştırmaları tam eşitlikte tetiklenmeli mi?

**Belirsizlik:** −%8 haftalık zarar limiti, `9200/10000 − 1` kayan noktada
`−0.07999999999999996` çıkıyor ve `<= −0.08` karşılaştırması **kaçırıyor**.

**Karar:** Devre kesici karşılaştırmalarına `1e-9` tolerans eklendi. Tam −%8
zarar eşiği tetikler.

**Dosya:** `sarnic/risk/engine.py::breached`

---

## 6. Backtest maliyeti — 100 sembol × 2 yıl pratik mi?

**Ölçüm:** Olay güdümlü motor, 6 sembol × 256 barlık bir pencerede bar başına
~94 ms harcıyor. Bunun neredeyse tamamı S/R motorunun her barda yeniden
hesaplanmasından geliyor (pivot + hacim profili + seviye güç puanı).

**Yapılan iyileştirmeler:** Göstergeler bir kez hesaplanıp satır satır okunuyor
(nedensellikleri sayesinde bu birebir eşdeğer — `tests/test_lookahead.py`
kanıtlıyor). Pivot tespiti, hacim profili ve seviye puanlaması vektörleştirildi.
Toplam kazanç yaklaşık 4 kat.

**Kalan sorun:** 100 sembol × 2 yıl (≈17.500 bar) tek makinede hâlâ saatler
sürer. Vektörel kısayol **yasak** (§11), dolayısıyla çözüm paralelleştirme veya
S/R'yi daha seyrek yeniden hesaplamaktır — ikincisi semantiği değiştirir.

**Doğru cevap nereden gelir:** Faz 9'da gerçek veriyle ölçülüp karar verilmeli.
Şimdilik kısa aralıklar ve az sembolle çalışılıyor.

---

## 7. Spec'te olup v1'de bilinçli olarak yapılmayanlar

Bunlar açık soru değil, **kapsam kararı**dır; `CHANGELOG.md`'de de kayıtlıdır:

- `BinanceSpotAdapter` — arayüz tanımlı, uygulama Faz 11'e ertelendi.
- Terminal sayfasında `dockview` ile sürükle-bırak panel yerleşimi — sabit üç
  sütunlu düzen yapıldı; yerleşim kaydetme yok.
- Kullanıcı başına Binance API anahtarı — v1'de tek anahtar, paper mod.
- Görsel regresyon testleri (Faz 8 kabul kriteri) — Playwright kurulumu yok.

---

## 8. Sunucu ve dağıtım soruları (CHANGELOG'dan devralındı)

Hâlâ cevapsız:

- Sunucu özellikleri (OS / RAM / CPU) — backtest paralelliği buna bağlı.
- Panel dışarı açılacak mı? Açılacaksa Caddy + Let's Encrypt + fail2ban gerekir.
- Kaç kullanıcı olacak? Sohbet ve bildirim hedefleme kuralları buna göre sadeleşebilir.
- Discord sunucusunda kanal yapısı — şimdilik `#islemler`, `#havuz`, `#alarm`,
  `#sistem` varsayıldı.

---

## 9. Canlı çalıştırmada ortaya çıkan kararlar (2026-08-15)

Sistem gerçek Binance verisiyle çalıştırıldığında spec'te karşılığı olmayan
altı durum çıktı. Hepsi burada kayıtlı.

### 9.1 `!ticker@arr` akışı veri göndermiyor

**Gözlem:** WebSocket bağlantısı kuruluyor, hiç mesaj gelmiyor. `kline` ve
`depth20` akışları aynı bağlantı üzerinden sorunsuz çalışıyor. 1 MB boyut
sınırı denendi — sorun o değil; akış tamamen sessiz.

**Karar:** 90 saniye sessizlikte REST `/ticker/24hr` yedeğine düşülüyor
(dakikada bir, ağırlık 80 = bütçenin %1,3'ü). Yedeğe düşüş **loglanıyor**;
sessizce REST'e kaymak veri yolunu belirsizleştirirdi.

**Açık:** Akışın neden sessiz olduğu bilinmiyor — bölgesel bir kısıt mı, uç
noktanın kullanımdan kalkması mı? `MASTER-SPEC` §2.1 bu akışı öngörüyor.

### 9.2 Spread örneklemesi derinlik akışına bağlıydı

**Sorun:** `@depth20` akışı sessizce ölünce spread örneklemesi de durdu ve
havuz hiç kurulamadı. 40 sembol × 100 ms = saniyede yüzlerce mesaj; kırılgan.

**Karar:** Spread'in birincil kaynağı REST `bookTicker` oldu (tek çağrı,
ağırlık 4, tüm evren). Redis'te taze defter varsa o tercih edilir. Derinlik
akışı yalnızca emir dolumu için kullanılıyor — asıl işi bu.

### 9.3 Örnekleme aralığı 6 → 5 dakika

**Sorun:** 6 dakikalık aralıkta 10 örnek tam 54 dakika sürüyor ve 1 saatlik
sayım penceresinde yalnızca 6 dakika pay bırakıyordu. Servisin her yeniden
başlaması sayacı sıfırladığı için havuz bir türlü kurulamadı.

**Karar:** 5 dakika. 10 örnek 45 dakikada tamamlanıyor, örnekler yine saate
yayılıyor (§3.2 filtre 7'nin amacı korunuyor).

### 9.4 Boş havuz "yapıldı" sayılıyordu

**Sorun:** Süpervizör boş bir havuz snapshot'ı yazdıktan sonra `is_due` tatmin
oluyor ve ertesi güne kadar yeniden denemiyordu. Sistem bir gün boyunca boş
kalırdı.

**Karar:** Boş havuz geçerli bir son durum değildir — 3 dakikada bir yeniden
denenir. Ayrıca havuz hedefin (100) altında kaldığı sürece, **boyut büyümeye
devam ettiği müddetçe** yenilenir; iki denemede aynı kalırsa durur.

### 9.5 Atlanan bar tüketiliyordu

**Sorun:** `_maybe_run_bar` barı işlemeden önce `_last_bar`'ı ilerletiyordu.
Geçici bir aksaklık (havuz henüz yok) bir saatlik kararı sessizce atlatırdı.

**Karar:** Bar yalnızca gerçekten işlendiyse tüketilir; `run_bar` artık
`bool` döndürüyor.

### 9.6 Arka plan görevleri sessizce ölüyordu

**Sorun:** `asyncio` görev istisnasını kimse `await` etmediği için yutuyordu.
`MarketDataService` "çalışıyor" görünürken kline ve derinlik akışları ölmüştü;
kimse fark etmedi.

**Karar:** 30 saniyede bir çalışan bir görev gözcüsü eklendi — ölen görevi
loglar, olay yayınlar ve yeniden başlatır.

**Not:** Aynı sınıf hata bot worker'larında da olabilir; oradaki koruma
süpervizörün heartbeat denetimi. Bu asimetri bilinçli ama gözden geçirilmeli.

### 9.7 Görev listesi kopya üretiyordu (30 saat sonra bulundu)

**Gözlem:** `restart_streams()` yeni kline/depth görevlerini listeye **ekliyor**,
eskisini bırakıyordu. Gözcü de bitmiş eski kaydı "öldü" sanıp her turda yenisini
açıyordu. Sonuç: her yeniden başlatmada bir Binance WebSocket bağlantısı daha —
30 saatte 5 yerine 35 soket.

**Karar:** Görevler artık isim anahtarlı bir sözlükte tutuluyor
(`dict[str, asyncio.Task]`); aynı isimden ikinci görev oluşamaz.
Ayrıca sembol listesi boşken görevler `return` etmek yerine **bekliyor** —
`return` etmek gözcüye ölüm gibi görünüyordu.

### 9.8 Kalibrasyon üç gün boş kalıyordu

**Sorun:** Gözlem yazımı en uzun ufkun (72 saat) dolmasını bekliyordu; oysa
4 saatlik ufuk çoktan ölçülebilir durumdaydı. Dürüstlük sayfası sistem
kurulduktan sonra üç gün boş görünüyordu.

**Karar:** En kısa ufuk dolduğunda gözlem yazılır, uzun ufuklar doldukça
güncellenir (upsert zaten vardı). Dolmamış ufuk `NULL` kalır ve kalibrasyon
sorgusu `NULL` satırları dışarıda bırakır — yarım veri riski yok.

### 9.9 "Yeterli değil" mesajı kendini çürütüyordu

**Sorun:** *"En az 500 puanlama ve 30 gün gerekiyor — şu an 1526"* yazıyordu.
1526 zaten 500'ün üstünde; eksik olan süreydi. Dürüstlük sayfasında bulanık
mesaj kabul edilemez.

**Karar:** Hangi koşulun eksik olduğu ayrı ayrı yazılıyor; `span_days` hem
API'de hem panelde gösteriliyor.

### 9.10 Spread örnekleri sınırsız birikiyordu

**Sorun:** Havuz yalnızca son 1 saati kullanıyor ama tüm örnekler saklanıyordu —
günde ~56 bin satır.

**Karar:** 7 günlük saklama, 6 saatte bir temizlik. Bir hafta denetim izi için
yeterli, sorgu için fazlasıyla.

### 9.11 Canlı akış hiç çalışmamıştı — iki ayrı kusur

Kullanıcı *"admin panelini bozdun"* dedi. Sayfalar ve 21 REST ucunun tamamı
`200` dönüyordu; kırık olan **canlı akıştı**. Üst çubuk kalıcı olarak
"canlı veri kesildi · yeniden bağlanılıyor" gösteriyor, sayfalar ise
`react-query` periyodik sorgusuyla dolu göründüğü için sorun uzun süre
sayfa hatası gibi okunmuyordu. Kök nedeni iki bağımsız kusur:

**(a) `Client` hashlenemiyordu.** `@dataclass` varsayılan `__eq__` üretir, bu da
`__hash__`'i `None` yapar. Hub istemcileri `set` içinde tuttuğu için
`clients.add(client)` her bağlantıda `TypeError: unhashable type` fırlatıyor,
WebSocket kabul edilir edilmez kapanıyordu. `ws.py` yazıldığı günden beri
**hiç** çalışmamıştı. Düzeltme: `@dataclass(eq=False)` — her bağlantı ayrı bir
nesnedir, kimlik temelli hash doğru davranıştır.

**(b) `xread` bloğu soket zaman aşımıyla yarışıyordu.** `redis-py` 8,
`socket_timeout` varsayılanını 5 saniye yaptı; `listen()` ise `block=5000`
kullanıyordu. İki süre birebir çakışınca okuma her turda zaman aşımına düşüyor,
bağlantı kopup yeniden kuruluyordu — saniyede bir `event_read_failed`. Hata
yakalanıp `continue` edildiği için sistem "çalışıyor" görünüyordu.

Düzeltme: dinleme **kendi** bağlantısını açar ve soket zaman aşımını blok
süresinin 10 saniye üstünde tutar. Ayrıca `$` imleci başlangıçta somut bir
akış kimliğine çözülür: kopma anında `$` "şimdi"ye kayıyor ve aradaki olaylar
sessizce kayboluyordu.

**Ders (asıl mesele).** Her iki kusur da yakalanmış istisnaların arkasına
saklanmıştı. Uçların `200` dönmesi sistemin çalıştığını göstermez; **bağlantı
kurulumunun ve olay tesliminin kendisi** test edilmeliydi. `tests/test_ws.py`
ve `tests/test_events.py` bu boşluğu kapatıyor — ilki `Client`'ın
hashlenebilirliğini, ikincisi blok penceresinden uzun bir sessizlikten sonra
olayın hâlâ teslim edildiğini doğruluyor.

### 9.12 Terminal sayfası her açılışta hata yağmuruna dönüyordu

**Sorun:** Kullanıcı *"terminal sayfasına girince hata veriyor, 21 tane hata"*
dedi. `/symbols/{sembol}/patterns` **her sembol ve her zaman diliminde** 500
dönüyordu:

```
PydanticSerializationError: Unable to serialize unknown type: <class 'numpy.bool'>
```

`confirm_with_volume` içinde `volume[idx] >= eşik` bir `numpy.bool_` üretiyor
ve `and` onu olduğu gibi döndürüyordu. `numpy.bool_`, `bool`'un alt sınıfı
**değildir**. Uç `-> dict` döndürdüğü için Pydantic'in şema zorlaması devreye
girmiyor, tip olduğu gibi serileştiriciye gidiyordu — şemalı bir uçta aynı
değer sessizce `bool`'a çevrilirdi.

**Karar:** Üretim noktalarını tek tek kovalamak yerine **serileştirme sınırında**
kesildi: `PatternMatch.as_dict()` artık saf Python tipleri döndürüyor
(`int` / `float` / `bool`). Aynı sınıftaki her alan aynı korumayı alıyor,
gelecekte eklenen numpy kaynaklı alanlar için de geçerli.

**Ders:** Sayfa taramasında bu uç görünmüyordu çünkü tarama yalnızca
parametresiz uçlara bakıyordu; `{sembol}` içeren uçlar hiç denenmemişti.
Artık test 90 sembol × 4 uç × 4 zaman dilimi geziyor ve
`tests/test_indicators.py` yükü özyinelemeli olarak numpy sızıntısına karşı
denetliyor.

### 9.13 Saatlik veri kalitesi denetimi hiç çalışmıyordu

**Sorun:** `/data-quality` boş dönüyordu ve panelin sayfası kalıcı olarak
boştu. Spec §2.3 denetimi "her backfill **ve her saatlik döngü sonrası**"
istiyor; kod yalnızca backfill yolunda çağırıyordu. İlk dolgudan sonra hiçbir
bar denetlenmemişti.

Boş bir sayfa "sorun yok" ile "hiç bakılmadı"yı aynı gösterir — bu, dürüstlük
kuralının doğrudan ihlali.

**Karar:** Denetim `MarketDataService` içinde saat başı + 2 dakika çalışıyor.
Gecikme kasıtlı: tam saat başında kapanan bar henüz yazılmamış olur ve denetim
her turda sahte bir boşluk raporlar. Boşluk onarımı REST istediği için denetim
piyasa verisi servisinde durur (kural 5); gözcünün dirilttiği görevler
arasında, sessizce ölemez.

İlk koşu: 45 sembol, **37 bulgu**. Yani sayfa boş değildi — hiç bakılmamıştı.

### 9.14 `/scores` iki puanlama konfigürasyonunu karıştırıyordu

**Sorun:** Kullanıcı React uyarısı bildirdi: *"Encountered two children with the
same key, `JTOUSDT`"*. Anahtar çakışması semptomdu; hastalık daha derindi.

Aynı anda üç bot çalışıyor ama **iki** ayrı puanlama konfigürasyonu üretiyorlar
(`taban` ve `seçici` yalnızca giriş eşiğinde ayrıştığı için aynı puanları yazar;
`trend ağırlıklı` farklı ağırlıklara sahip). `/scores` her ikisini tek listede
döndürüyordu:

- 45 sembol var, uç **90 satır** dönüyordu — her sembol iki kez, iki farklı puanla
- Puanlar sayfası "90 sembol" yazıyordu; havuzda 45 var
- `score.desc()` iki konfigürasyonu iç içe diziyordu — sıralama artık sıralama değil
- `/scores/{sembol}` hangi konfigürasyonu döndüreceğini belirlemiyordu; tabloda
  tıklanan puan ile puan kartındaki sayı tutmayabilirdi
- `/scores/{sembol}/history` grafiği her bar için iki nokta çizip zikzak yapıyordu

**Karar (kullanıcıya soruldu — bu, benim uyduracağım bir tercih değildi):**
panele **strateji seçici** eklendi. Her an tek bir konfigürasyonun sıralaması
görünür; varsayılan bot sırasına göre ilkidir (`taban`). Reddedilen alternatifler:
yan yana karşılaştırma sütunları (konfigürasyon sayısı arttıkça tablo taşar) ve
seçici olmadan tek konfigürasyon (çalışan bir botun puanları panelde hiç görünmez).

**Uygulama:** Yeni uç `/scores/configs`, konfigürasyonları **botun tanımından
hash'i yeniden hesaplayarak** etiketler — `scores` tablosunda `bot_id` yoktur,
çünkü aynı konfigürasyonu birden çok bot paylaşabilir. Aynı hash'i üreten botlar
tek girdide birleşir ("taban · seçici"). Bir bota bağlanamayan konfigürasyon
gizlenmez, "bilinmeyen yapılandırma" olarak listelenir — veri oradadır.

`/scores`, `/scores/{sembol}` ve `/scores/{sembol}/history` artık `config_hash`
kabul ediyor; verilmezse aynı deterministik varsayılana düşüyorlar, böylece üç
uç birbiriyle **tutarlı** kalıyor.

**Yan bulgu:** `api.get` yalnızca `undefined` ve `""` süzüyordu, `null` değil.
Seçim yüklenmeden gönderilen `config_hash=null` sunucuya `"null"` dizesi olarak
gidip hiçbir kaydın eşleşmediği bir filtre kuruyordu. Süzgeç düzeltildi.

**Ders:** React'in anahtar uyarısı bir görsel kusur değil, veri modeli
uyuşmazlığının habercisiydi. "Aynı anahtar iki kez" demek, listenin sandığımız
şey olmadığı anlamına gelir.

### 9.15 Özsermaye eğrisi olmayan bir kârı gösteriyordu

**Sorun:** Panelin ana grafiği 15.000'den **45.000'e** fırlayıp geri düşüyordu.
`2026-08-15 12:00` anında her bot **3'er** özsermaye noktası yazmış — toplam 9
satır, toplam 44.989. Kaynak: `equity_points` tablosunda `(bot_id, at)`
benzersizlik kısıtı yoktu ve bot yeniden başladığında aynı bar tekrar
işleniyordu.

Ölçümün temeli olan grafik, olmayan bir kâr gösteriyordu. Bu, projenin
"panel dürüstçe göstermek zorundadır" kuralının en doğrudan ihlali.

**Karar (üç katman):**
1. `uq_equity_point` kısıtı + `record_equity` artık **upsert** yapıyor —
   kaynak kesildi (`0002_equity_point_benzersiz`).
2. Migrasyon mevcut kopyaları temizledi; her `(bot_id, at)` için en son yazılan
   satır tutuldu.
3. Toplam eğri **sunucuda** `combine_curves` ile hesaplanıyor. Panel "aynı
   zaman damgasını topla" yapıyordu; botların noktaları hizalanmadığında bu
   portföyü olduğundan **düşük** gösterirdi. Doğrusu ileri doldurmadır.

### 9.16 Panelde hiçbir yazı tipi yüklü değildi

**Sorun:** `globals.css` `Inter` ve `IBM Plex Mono` isimlerini yazıyordu ama
ikisi de sistemde kurulu değildi ve CDN'den de çekilmiyordu. Panel jenerik
sistem fontlarıyla çiziliyor, rakamlar `tabular-nums` almıyordu — yani
**bozulmaz kural 6 fiilen ihlal ediliyordu.**

CDN yasağı doğruydu (panel çevrimdışı çalışmalı) ama "fontu hiç yüklememek"
şeklinde uygulanmıştı.

**Karar:** Font dosyaları repoya alındı (`apps/web/src/fonts/`) ve
`next/font/local` ile derlemeye gömüldü. Çevrimdışı çalışır, CDN'e bağlanmaz.
`latin-ext` alt kümesi **zorunlu**: `ğ ş ı İ Ğ Ş` Latin-1'de yoktur ve onsuz
Türkçe arayüzün yarısı yedek fonta düşer.

### 9.17 "Object is disposed" — efekt temizleme sırası

**Sorun:** Terminal ve İndikatörler sayfaları her açılışta konsola
`Object is disposed` yazıyordu. React temizleyicileri **tanımlanma sırasına**
göre çalıştırır: önce grafiği yok eden efekt (`chart.remove()`), sonra fiyat
çizgilerini kaldıran efekt (`series.removePriceLine(...)`) — ikincisi çoktan
yok edilmiş bir seriye dokunuyordu. `reactStrictMode` açık olduğu için her
mount çift çalışıyor ve hata **her seferinde** tetikleniyordu.

**Karar:** Grafik yalnızca bir kez kurulur (yükseklik `applyOptions` ile
güncellenir); `generation` sayacı grafik yeniden kurulduğunda veri ve çizgi
efektlerini tetikler (eskiden yeni grafik boş kalırdı); çizgi temizleyicisi
dokunacağı serinin hâlâ güncel seri olduğunu doğrular.

### 9.18 Olay veriyolu rutin gürültüyle doluyordu

**Sorun:** Her kapanan bar için ayrı olay yayınlanıyordu: 45 sembol × 2 zaman
dilimi = çeyrek saatte 90 olay. Son 500 olayın **484'ü** buydu. Pozisyon
açılışı, puan eşiği ve risk olayları bu gürültüde kayboluyor, 50.000'lik akış
tamponu birkaç saatte doluyordu.

**Karar:** Bar kapanışları toplu yayınlanıyor ("1h bar kapandı — 45 sembol").
Sembol düzeyindeki ayrıntı `journal`'da kalır; olay veriyolu insanın bakacağı
şeyler içindir. Panel ayrıca rutin logları kendi tarafında da süzüyor.

### 9.19 API uçlarının test altyapısı yoktu

**Sorun:** §9.11, §9.12, §9.14 ve kalibrasyonun eksik gövdesi — dördü de bir uç
testiyle yakalanabilirdi. Hepsi canlı sistemde, kullanıcı şikâyet ettiğinde
ortaya çıktı.

**Karar:** `tests/conftest.py` içinde httpx + ASGITransport tabanlı bir koşum
takımı. **Ayrı bir veritabanı** kullanır (`sarnic_test`): canlı sistem
çalışırken testin onun verisine dokunması kabul edilemez. 21 uç testi yazıldı;
hepsi geçmiş kusurları geriye dönük kilitliyor.

Bu sırada bir tasarım tutarsızlığı da çıktı: `/system/status` bağımlılık yerine
`get_sessionmaker()` doğrudan çağırıyordu — ucu FastAPI'nin yaşam döngüsünün
dışına çıkarıyor ve test edilemez kılıyordu. `SessionDep`/`RedisDep`'e çevrildi.

### 9.20 TickSizeFilter, spread filtresinden 6 kat sıkı — eşik doğru mu?

**Bulgu (karar değil).** Havuz hedefin yarısında duruyor (44/100) ve huninin en
büyük kesimi filtre 8:

| # | filtre | kalan | elenen |
|---|---|---|---|
| 7 | SpreadFilter | 170 | 72 |
| **8** | **TickSizeFilter** | **87** | **83 (%49)** |
| 9 | VolatilityFilter | 44 | 43 (%49) |

Filtre **spec'e tam uygun** çalışıyor (`tickSize / price ≤ %T`, T = 0,05) —
kod hatası yok. Elenenler eşiğin hemen üstünde: ADAUSDT %0,0564,
ACEUSDT %0,0736, ALICEUSDT %0,0820.

**Soru şu:** iki filtre aynı birimde ama farklı sıkılıkta. Spread eşiği
%0,30; tick eşiği %0,05 — altı kat sıkı. Oysa tick oranı, ulaşılabilecek
**en dar spread'in alt sınırıdır**: bir sembolün spread'i bir tick'ten küçük
olamaz. Tick oranı %0,056 olan bir sembolün spread'i en iyi ihtimalle %0,056
olur ki bu, %0,30'luk spread eşiğinin çok altındadır.

Yani filtre 8, filtre 7'nin zaten yakaladığı riski çok daha sıkı bir eşikle
ikinci kez uyguluyor gibi görünüyor. Ölçülen gerçek spread bunu destekliyor:
havuzda medyan 3,05 bps (%0,0305) — yani mevcut havuz zaten tick'e yakın
çalışıyor.

**Değiştirilmedi.** Eşik değiştirmek bir parametre kararıdır ve ROADMAP
"sonuç olumsuz çıktığında parametre değiştirip tekrar denemeyin" diyor.
Ayrıca havuzu büyütmek işlem sayısını artırır ve kıyas ölçütünü daha hızlı
anlamlı hâle getirir — bu bir avantaj gibi görünse de, filtreyi gevşetmenin
gerekçesi "daha çok işlem istiyorum" **olmamalı**.

**Karar kullanıcıya ait.** Üç seçenek:
1. Olduğu gibi bırak — havuz küçük ama en likit uçta kalır.
2. T'yi spread eşiğiyle tutarlı bir orana çek (ör. %0,10) ve havuzun nasıl
   büyüdüğünü ölç.
3. Filtre 8'i kaldır, riski tamamen filtre 7'ye (gerçek ölçülen spread)
   bırak — tick zaten spread'in içinde görünür.

Her üç durumda da `config_hash` değişir ve yeni bir havuz snapshot'ı doğar;
eski havuzla kıyas kesintiye uğrar.

### 9.21 HashUI entegrasyonu — çözülen çatışmalar

HashUI (`~/Masaüstü/Projects/hash-ui`) elde edildi ve panele alındı. Kayda
değer üç çatışma vardı; üçü de köprüyle çözüldü, hiçbiri "olduğu gibi kabul"
edilmedi.

**1. Marka rengi.** HashUI'ın varsayılan markası zümrüt yeşili. SARNIÇ'ta
yeşil **yalnızca yön** bildirir (DESIGN §2). Yeşil bir "Kaydet" düğmesini göz
"kazanç" sanar. `ui/presets/sarnic.css` `--brand`'i kehribara bağlıyor.

**2. Token adı çakışması.** İki sistem de `--surface` adını kullanıyor. Yükleme
sırası gereği HashUI'ınki bizimkini eziyordu. SARNIÇ tarafındaki kart yüzeyi
`--panel` adını aldı; yüzey rampasının geri kalanında HashUI'ın adları
(`--canvas` `--elev` `--inset`) benimsendi — iki isim seti yerine bir tane.

**3. Tema mekanizması.** Panel `:root[data-theme="light"]`, HashUI `.dark`
sınıfı. Yan yana yaşasalardı bileşenlerin yarısı temayı görmezdi. `.dark`
seçildi (HashUI'ın beklediği), varsayılan koyu kaldı.

**Ayrıca:** HashUI Vite/SPA için yazılmış ve `ThemeProvider` ilk render'da
`localStorage`/`document` okuyor; Next.js sunucuda render edince çöküyor.
Dosyaya iki satırlık koruma eklendi ve **dosya içinde işaretlendi** — paket
güncellenirse aynı iki nokta yeniden uygulanmalı. Bu, satıcı kodunu
değiştirmenin bilinen bedeli; alternatifi (sarmalayıcıyla geciktirme) ilk
boyamada tema atlaması üretiyordu.

**Denetçi iki kez yanlış alarm verdi ve iki kez sıkılaştırıldı:** üretim
derlemesinin `_rsc` önceden getirmeleri iptal olunca (§ önceki giriş), ve
servis yeniden başlarken koşunca 34 sahte sorun raporlandı. Denetçi artık
sunucunun hazır olmasını bekliyor. Yanlış alarm veren bir araç, görmezden
gelinmeyi öğretir.

---

## 10. Elektrik kesintisi kurtarması (2026-08-16 22:00 UTC)

Kesinti 21:37 UTC'de oldu; makine geri geldiğinde **hiçbir servis ayağa
kalkmamıştı** (docker `disabled`, systemd unit dosyaları diskte yok). Yığın elle
kaldırıldı ve bu sırada üç ayrı kusur ortaya çıktı. Üçü de yalnızca **yeniden
başlatmada** görünüyor: normal işleyişte hiçbiri belirti vermiyor, bu yüzden
sistem 15 Ağustos'tan beri sessizce bu hâldeydi.

### 10.1 Girdi yokken boş havuz snapshot'ı yazılıyordu

Süpervizör açılışta havuzu yeniledi; piyasa verisi servisi Redis'e ilk ticker'ı
**2 saniye sonra** yazdı. Aday listesi boştu, zincir boş döndü ve motor bunu
geçerli bir sonuç sayıp snapshot yazdı: canlı havuz **65 → 0**, snapshot #23
"havuz boştu" diyor.

Ticker önbelleğinin boş olması bir **piyasa gözlemi değildir**, bir veri
kesintisidir. Böyle bir anı snapshot'lamak, bozulmaz kural 3'ün korumaya
çalıştığı point-in-time kaydı tam da bozar: gelecekteki bir backtest o saatte
havuzun gerçekten boş olduğunu okuyacaktı.

**Düzeltme:** `UniverseEngine.refresh` aday listesi boşsa `UniverseInputUnavailable`
yükseltiyor ve **snapshot yazmadan** iptal ediyor. Süpervizör bunu bir kusur
değil sıralama sorunu olarak logluyor ve bir sonraki turda yeniden deniyor;
API 503, CLI çıkış kodu 1 döndürüyor.

**Kayıt düzeltmesi — kullanıcı kararı, 2026-08-16.** Snapshot **#23 silindi**
(`taken_at = 21:55:19.070898+00`, 0 sembol, 65 çıkan). Gerekçe: girdi yokken
yazıldığı için havuzun o an boş olduğunu **yanlış** söylüyordu; o pencereyi
kullanacak bir backtest yanıltılırdı. #24 ve #25 **duruyor** — onlar zincirin
gerçekten her adayı elediği anlar ve huni raporu nedeni (SpreadFilter) kaydediyor;
yanlış değiller, sadece sistemin çalışmadığı bir aralığı gösteriyorlar.
Snapshot numaraları artık 22 → 24 diye atlıyor; bu satır o boşluğun açıklamasıdır.

**Açık kalan:** Zincir gerçekten her adayı elediğinde (şu an SpreadFilter'ın
yaptığı gibi) snapshot **yazılıyor** — bu doğru, çünkü huni raporu nedeni
kaydediyor. Ama boş havuz sürerken her 3 dakikada bir aynı boş snapshot yazılır.
Bu tur 3 tane yazıldı (#23 girdisiz, #24–25 zincir kaynaklı). Gürültüyü
bastırmak gerekirse tercih **sorulmalı**: aynı `config_hash` ile ardışık boş
snapshot'ları tek satıra indirmek kaydı sadeleştirir ama "ne zaman denendi"
bilgisini siler.

### 10.2 Boş havuz yeniden denenmiyordu

Süpervizörün yeniden deneme kapısı `improving = size != last_size` idi. Boş
havuzda bu hep `False` üretir (0 ile 0 arasında ilerleme görünmez), dolayısıyla
havuz bir kez boşaldıktan sonra **planlı yenilemeye kadar** (≈02 saat sonra)
hiç denenmiyordu. Kodun kendi docstring'i "boş bir havuz geçerli bir son durum
değildir" diyordu; kapı bunu uygulamıyordu.

**Düzeltme:** `size == 0` her turda yeniden denemeyi tetikliyor. Canlıda
doğrulandı: 22:03:56'da 56 sembollük snapshot yazıldı — eski kodla o an hiç
deneme yapılmayacaktı.

**Ama kapı hâlâ erken pes ediyor — ölçüldü, düzeltilmedi.** Havuz 22:05'te 40'a
çıktı ve **bir saat boyunca orada dondu**: `improving` üç dakikalık bir pencerede
"ilerleme yok" gördü ve durdu. Oysa bağlayıcı kısıt spread örneklerinin
olgunlaşmasıydı ve o **~60 dakikalık** bir süreçtir. 23:05'te elle yenileme
havuzu tek seferde **40 → 57**'ye çıkardı (SpreadFilter 40 yerine 167 bıraktı).

Kapının ölçtüğü şey (üç dakikada çıktı boyutu) ile beklediği şey (bir saatte
girdi olgunlaşması) aynı zaman ölçeğinde değil. Docstring'in niyeti — "ilerleme
oldukça yeniden deneriz" — doğru; uygulaması niyeti taşımıyor.

**Neden hemen düzeltilmedi:** üç seçenek de bir **politika** kararı içeriyor ve
uydurulmadı (bozulmaz kural 7):
1. Boş olmayan ama hedefin altındaki havuzda daha uzun süre denemek (kaç tur?).
2. Sonuç değişmediğinde snapshot **yazmamak** — spam biter, kapıya gerek kalmaz,
   ama bozulmaz kural 3'ün lafzıyla ("her yenilemede snapshot yazılır") çelişir.
3. Kapıyı çıktı yerine **girdiye** bağlamak (yeterli örneği olan sembol sayısı).
   En doğrusu ama en çok kod.

Hedef `top_n = 100` ve gerçekleşen havuz tarihsel olarak ~65 olduğu için
"hedefin altında" pratikte **her zaman** doğrudur; bu yüzden 1. seçenek tek
başına sürekli yenileme demektir.

### 10.3 Açık pozisyonlar kapatılamıyordu — iki ayrı sebep

Bu, turun en ciddi bulgusu. **Stop tetiklense bile çıkış emri dolamıyordu.**

**(a) Emir defteri açılmıyordu.** Derinlik akışı havuzun ilk 40 sembolüyle
sınırlı (`symbols[:40]`) ve liste havuz sırasından kesiliyordu. `set_book_symbols`
docstring'i "**açık pozisyon** ve aday coinler için" diyor — niyet baştan
doğruydu, ama çağıran taraf açık pozisyonları hiç geçirmiyordu. CRCLBUSDT ve
MUBUSDT pozisyonları defter alamadı; her çıkış "emir defteri yok" ile reddedildi.

**(b) Paper adaptörünün pozisyon defteri kurtarılmıyordu.** Adaptör süreçle
birlikte ölür. Bakiye `bot.cash`'ten geri yükleniyordu, `_positions` sözlüğü
**yüklenmiyordu**. Defter boş olduğu için her satış "yetersiz pozisyon" ile
reddediliyordu. Faz 5 kabul kriteri "süreç `kill -9` ile öldürülüp yeniden
başlatıldığında açık pozisyonlar DB'den doğru şekilde kurtarılır" diyordu;
süpervizör bot satırlarını kurtarıyordu ama **yürütme katmanı kurtarılmıyordu**,
yani kriter yarım sağlanıyormuş.

**Düzeltme:** (a) izlenen ve defteri açılan sembol kümesine açık pozisyonlar her
zaman dahil ediliyor, defter listesinde **önceliği** onlar alıyor; (b)
`PaperAdapter.restore_positions()` eklendi ve worker adaptörü kurarken defteri
DB'den dolduruyor.

**Doğrulandı:** düzeltmeden sonra 22:05:30'da BOMEUSDT, CRCLBUSDT ve MUBUSDT
çıkışları dolduğu gibi doldu (`paper_filled`, kayma 5,8–9,1 bps).

**Bedeli ödendi:** bu pozisyonların çıkışları kesinti penceresi boyunca
gecikti ve **gecikmiş fiyattan** doldu. Kayıtlarda bu işlemler normal çıkış gibi
görünür; öyle değildirler.


## Uzun-yönlü spot, düşen havuzda nasıl "+" olur? — 2026-08-19

> **Düzeltme — 2026-08-19 akşamı.** Bu sorunun dayandığı "havuz yıllık −%28 getirdi" ifadesi
> **yanlıştı.** O rakam, üst üste binen 24 saatlik ileri getirilerin aritmetik ortalamasının
> 365 ile çarpılmasıyla çıkmıştı; bir portföyün getirisi değil. Eşit ağırlıklı, her bar
> yeniden dengelenen gerçek havuz portföyü aynı 60 günde **−%0,45** (yıllık −%2,7) yaptı.
> Yani piyasa düşmedi, yatay kaldı. Aşağıdaki "yön riski" çerçevesi bu yüzden fazla
> karamsardı ve soru büyük ölçüde **kapandı** — bkz. sonraki bölüm.

Ölçüldü (60 gün, 103 sembol, 125.021 puan): puanlamanın **seçim becerisi var** — puanı ≥ 80
olanlar 72 saatte havuzu ortalama 1,8 puan geçiyor, t=+3,6, örneğin iki yarısında da pozitif.

Denenen ve reddedilen: havuz genişliğine dayalı rejim filtresi (nakde çekilme). Her
sıkılaştırma sonucu kötüleştirdi — puanlama zayıf piyasada daha iyi çalışıyor, filtre kenarın
olduğu barları eliyor.

Kalan seçenekler — hiçbiri ayar değil, tasarım kararı; **sorulmadan seçilmeyecek**:

1. **Kenarı büyütmek.** Kapıyı yükseltmek işlem başına getiriyi artırıyor (82'de +%1,10,
   85'te +%1,53) ama günde 2 girişe düşürüyor ve defter boş kalıyor. Sermayenin çoğu nakitte
   bekler; bu da bir karardır.
2. **Yön riskini taşımak.** Havuza karşı nötrleşmek (short ya da vadeli) — spec kapsamı dışı,
   "canlı para yok" kuralıyla ve `Bu proje ne DEĞİL` bölümüyle çelişir.
3. **Mutlak değil göreli başarıyı hedef almak.** Sistemin çıktısını "havuza göre fark" olarak
   ölçmek ve paneli buna göre kurmak. Ölçüm zaten bunu destekliyor; beklenti değişir, kod değil.
4. ~~**Karar birimini değiştirmek.**~~ **Ölçüldü ve reddedildi — 2026-08-19.** 4 saatlik karar
   barlı bir bot kuruldu (bot 6, durdurulmuş) ve 90 günlük puanı geriye dolduruldu (539 bar,
   42.642 puan). Aynı kurallarla, aynı tutma süresiyle (saat cinsinden eşit):

       dilim  kapı  giriş  gün başına  işlem başı   ilk yarı   son yarı      t   toplam
       1h       80    623        10,4     +0,698%    +1,970%    -0,562%  +2,95    +435%
       4h       80    279         3,1     +0,544%    +1,228%    -0,135%  +1,32    +152%
       1h       82    339         5,7     +1,146%    +2,859%    -0,556%  +3,46    +389%
       4h       82    146         1,6     +0,570%    +1,782%    -0,641%  +1,13     +83%

   Hipotez "1 saatlik bar ufka gereğinden sık dokunuyor, ücret yiyor" idi; veri desteklemiyor.
   Fazla fırsatın getirisi fazla dokunuşun ücretini fazlasıyla karşılıyor ve istatistiksel güç
   de 1 saatte daha yüksek. 4 saatin tek üstünlüğü kötü rejimde daha az kaybetmesi
   (−%0,14 / −%0,56) ama toplamda üçte bir kazanıyor. **Karar barı 1 saat kalıyor.**

Cevap verilene kadar sistem 3. seçeneğe göre raporlanıyor: kalibrasyon artık kapı kenarını
havuza göre ve t-istatistiğiyle gösteriyor.


## Cevap: sistem zaten artıda — 2026-08-19 (akşam)

Yukarıdaki soru yanlış bir kıyasa dayanıyordu. Uçtan uca portföy simülasyonu yapıldı: 60 gün,
1460 bar, kapı 80, en fazla N pozisyon eşit ağırlık, %80 maruziyet tavanı, gerçek çıkış
kuralları (2 ATR stop, başabaş 1,0R, trailing 3,5 ATR, puan < 60, 72 saat) ve ölçülen gerçek
ücret (gidiş-dönüş %0,20).

    slot   toplam    yıllık   ilk yarı   son yarı  maks düşüş  işlem
      2   +18,49%   +180,7%    +15,47%     +2,62%     -15,2%    103
      3   +11,87%    +97,8%     +9,25%     +2,39%     -11,9%    128
      4    +9,47%    +73,4%     +8,85%     +0,57%     -10,1%    138
      5    +7,70%    +57,0%     +8,53%     -0,76%      -9,2%    144
      6    +6,29%    +45,0%     +7,14%     -0,79%      -7,9%    144
    havuz  -0,45%     -2,7%     -2,05%     +1,63%     -11,9%      —

Slot sayısı 5→4'e indirildi (bot 2 "seçici" 3'te). Tepe noktası seçilmedi; eğilim monoton ve
mekanizması açık — az slot yalnızca en yüksek puanlıyı almaktır ve kenar puanla artıyor.

**Kalan gerçek soru** artık "nasıl artıya geçeriz" değil, **"bu kenar ne kadar dayanıklı"**:
ikinci yarı birinci yarının dörtte biri kadar. 60 gün tek rejimdir. Cevap ancak canlı kayıtla
gelir; altı bot farklı ayarlarla çalışıyor ve `strategy_version_id` sayesinde her işlem hangi
sürümden geldiğini artık taşıyor.


## Çok-pazar kararları — 2026-08-27

Sahip "BIST + ABD aktif olsun" dedi; spec'te olmayan şu kararlar verildi
(kural 7 gereği burada kayıtlı; her biri geri alınabilir):

1. **Sembol ad-alanı borsa ekiyle:** `THYAO.IS`, `AAPL.US`; kripto eksiz.
   `ohlcv` birincil anahtarı değişmedi (787 MB hypertable göçü ertelendi).
   Gerçek `market` kolonu yalnızca `universe_snapshots`'a eklendi (0007).
2. **Hisse karar birimi 1 gün.** 1 saatlik hisse verisi için meşru ve
   ücretsiz kaynak yok: AlgoLab kapandı (31.12.2025), TradingView ToS'u
   algoritmik kullanımı yasaklıyor, Yahoo bu IP'den ABD dışına 429.
   1h şart olursa tek yol lisanslı sağlayıcıya (Matriks vb.) abonelik.
3. **Veri kaynakları:** BIST = İş Yatırım günlük seri (HGDG_* düzeltilmiş;
   ham HG_* de var, v1'de düzeltilmiş saklanıyor). ABD = Yahoo chart API
   (kişisel kullanım; seri bölünme-düzeltilmiş; delist geçmişi YOK —
   hayatta kalma yanlılığı yapısal, ölçüm raporlarında damgalanmalı).
4. **Düzeltilmiş seri saklamanın bedeli:** geçmiş bir sermaye işleminde
   sağlayıcı seriyi geriye dönük değiştirir ve `upsert` eski barların
   üstüne yazar — o dönemki `scores` satırları eski fiyat sürümüyle
   yaşamaya devam eder. Doğru mimari (ham seri + `corporate_actions`
   tablosu + okuma anında `as_of` çarpanı) backlog'da.
5. **BIST açılış fiyatı yok:** İş Yatırım open vermez. `open` = gün içi
   min/max aralığına kırpılmış AOF (ağırlıklı ortalama) yazılıyor.
6. **Başlangıç evrenleri elle seçildi** (BIST 60 / ABD 80 likit isim) ve
   bugünden geriye bakar — geçmiş ölçüm İÇİN KULLANILAMAZ. Dürüst evren
   bugünden itibaren `universe_snapshots` ile birikiyor (kriptoda ölçüm
   zeminini çürüten hatanın hisse tekrarına baştan kapı kapatıldı).
   Hisse havuz hunisi v1'de yalnız ciro sıralaması; spread/yaş/oynaklık
   filtreleri yok.
7. **Sentetik emir defteri:** hisselerde derinlik verisi yok; paper motoru
   kapanış ± yarım spread (BIST 15 bp / ABD 5 bp) tek kademeli defterle
   çalışıyor. ~~Boşluk dolumu farkı~~ KAPANDI (2026-08-27 akşam): ortak
   `execution/gapfill.py::stop_fill_price` yazıldı; hisse botları bar
   kapanışında stopu barın kendisinden denetliyor (`low ≤ stop` →
   `min(stop, open)`), backtest aynı fonksiyonu çağırıyor — kural 1
   yapıyla korunuyor.
8. **Gece boşluğu ATR'ye giriyor** (bar bazlı hesap değişmedi) ve
   `max_hold_hours` duvar saati sayıyor — hisse stratejilerinde 336 saat
   (~10 seans) verildi.
9. **Bot para birimi örtük:** BIST botunun `capital`'i TRY, ABD'ninki USD.
   Motor tek para birimi varsayar; pazarlar arası toplam sermaye raporu
   bu yüzden yalnız pazar içi anlamlıdır. Panel bazı yerlerde "USD" yazar
   — kozmetik, backlog'da.


## Kaldıraç kapsama girdi — 2026-08-27 (sahibin kararı)

CLAUDE.md'nin "kaldıraç kapsam dışı" satırı bu kararla eskidi. Paper
motorunda simüle edilir; canlı para hâlâ yok. Kararlar:

1. **Risk sabit**: kaldıraç risk_pct'i ÇARPMAZ; yalnız nakit ve
   tek-pozisyon tavanını kaldırır (`sizing/leverage.py` başlığı).
2. **Teyit üçlüsü şart**: puan ≥ eşik + boğa formasyonu + dirence ≥ N ATR
   yer. Üçünden biri yoksa giriş SPOT devam eder ve sebep loglanır.
3. **Stop marja sığmalı** (varsayılan pay 0,8): sığmazsa kaldıraç düşer.
   Böylece likidasyon ancak stopu da atlayan boşlukta mümkün — o da
   `stop_fill_price` ile açılıştan dolar, kayıp dürüstçe kaydedilir.
4. **Borç görünür**: marj kuralı nakdi tam notional kadar düşürür; nakit
   eksiye iner = borç. Borç maliyeti saatlik tahakkuk eder (varsayılan
   günlük ~%0,05) ve kapanışta komisyona eklenir.
5. **Backtest v1 kaldıracı AÇIKÇA reddeder** — sessizce 1× koşup canlıyla
   karşılaştırılamaz rapor üretmek kural 1'i kırardı. Backtest'e marj +
   borç + bar-içi likidasyon modeli gelene dek kaldıraçlı stratejinin
   ölçüsü yalnız canlı paper defteridir.
6. Bot 11 G8: 3× tavan, kademeler [[88→2×],[93→3×]], brüt maruziyet
   tavanı 1,5. Kısa (short) hâlâ kapsam dışı.


## Sermaye re-base akışı resmi değil — 2026-09-01

Maraton sıfırlaması dış betikle yapıldı ve iki tasarım boşluğu bıraktı:

1. **Durdurulan botun pozisyonu öksüz kalır**: stop/kill yalnız durum yazar,
   açık pozisyonu kapatmak worker'ın işidir — worker ölünce kimse kapatmaz
   (bot 10'un 5 gün süren BTC pozisyonunda yaşandı, elle kapatıldı).
2. **Sermaye tabanı değişikliğinin resmi kapısı yok**: reset WEEKLY_LOSS'u
   tetikledi çünkü risk çapaları eski tabana bakıyordu. Mekanizma artık var
   (`config.rebased_at` + `load_snapshot` klempi, testli) ama bunu yazan
   resmi bir admin ucu yok; betik `settings.marathon` + `rebased_at` +
   taze EquityPoint üçünü elle yazdı.

Karar gerekiyor: `POST /admin/bots/{id}/rebase` gibi tek bir uç (audit_log +
pozisyon kapatma + rebased_at + taze özsermaye noktası tek işlemde) mi, yoksa
re-base'in bu kadar nadir kalması mı? Maraton boyunca dokunulmayacak;
maraton sonrası karara bağlanmalı.


## Tarama bulgularından iki karar sorusu — 2026-09-03

1. **Formasyon düzenleyicisi fiilen kapının parçası.** Taramada formasyon
   kapalıyken 317 barda yalnız 2 giriş oldu: +10'a kadar formasyon katkısı
   olmadan 80 kapısı neredeyse geçilmiyor. Tasarım "beş ailenin puanı"
   diyor ama pratik "formasyonu teyitli olan" demek. Bilinçli mi? Öyleyse
   kapı belgesine yazılmalı; değilse formasyonu kapıdan ayırıp ayrı bir
   filtre yapmak ölçülebilir bir hipotez (maraton sonrası).
2. **Kaldıraç hiç devreye girmiyor.** Bot 11 (G8) maraton dahil 7 işlemin
   hiçbirinde kaldıraç kullanmadı; 6 red kaydının hepsi "puan < eşik 88"
   (puanlar 75–77). Backtestte üç spec de (88 / 80 / 80-2×) kontrolle
   birebir aynı: 13 girişin hiçbiri teyit üçlüsünü aynı anda sağlamadı.
   Kaldıracın katkısı ölçülemiyor çünkü hiç tetiklenmiyor. Seçenek:
   ölçüm amaçlı bir "G9 sonda kolu" (400 $, min_score 80, üçlü aynen) —
   her red sebebini loglar, birkaç günde üçlünün hangi ayağının
   tıkadığını gösterir. Kabul kuralı gereği bunu ben eklemem; sahibin
   kararı ("G9 ekle" derse aynı akşam koşar).
   **Karar (2026-09-03):** sahibi G9'u istedi; bot 14 olarak katıldı — kaynak
   bot 3, eşik 80, kontrol bot 3'ün kendisi. İlk barda ilk sebep kaydı geldi:
   "dirence yer yok (1,4 ATR < 2,0)".

## Kısa yön (2026-09-04)

- **Kısa puan kalibrasyonu.** `scoring/observations.py` yalnız uzun hedefle
  (fwd_return) çalışır; kısa için hedef `−fwd_return` olmalı. Kısa puanın
  öngörü gücü ölçülmeden S1/S2 sonuçları yalnız defter kaydıdır.
- **Coin bazlı borç oranı.** Tek `hourly_rate` (günlük %0,05) kullanılıyor;
  Binance marj oranları coin bazında ve kısa tarafta çoğu kez daha yüksek.
- **Nakit tavanı komisyon payı.** `SizingEngine` `serbest_nakit × lev`
  tavanını komisyonsuz hesaplar; `PaperAdapter` marj kuralına komisyonu
  ekler → tavan bağlayınca emir "yetersiz marj/bakiye" ile reddedilir.
  Düzeltme 1× uzun davranışını da değiştireceği için maraton sonrası.

## Bug hunt kalıntıları (2026-09-04, karar bekliyor)

Ölçüldü ve doğrulandı ama spec kararı gerektirdiği için kapatılmadı:

- **Bekleyen stop emirleri iptal edilmiyor.** Her girişte adaptöre bir
  `STOP_LOSS_LIMIT` bırakılıyor, pozisyon kapanınca iptal edilmiyor;
  `_open_orders` süreç ömrü boyunca büyüyor ve `get_open_orders()` yanlış
  söylüyor. Bellek etkisi ihmal edilebilir. Asıl soru: paper'ın "borsada
  bekleyen stop" özelliği tamamen dekoratif mi olsun (stopları worker
  yönetiyor), yoksa gerçekten simüle mi edilsin?
- **`PaperAdapter.check_stop_triggers` ölü ve tek yönlü.**
  `getattr(order, "_stop_price", None)` hiçbir yerde set edilmiyor → her
  zaman boş liste. Ayrıca `price <= stop_price` yalnız uzun için doğru.
  Çağıranı yok. Silinsin mi, canlandırılsın mı?
- **DELIST çıkış yolu ölü.** `ExitReason.DELIST` yalnız `MarketView.delisted`
  ile tetikleniyor; o bayrak hiçbir yerde `True` yapılmıyor,
  `PaperAdapter.halt_symbol` ve `UniverseEngine.mark_delisted` hiç
  çağrılmıyor. Delist tespiti nereden gelecek?
- **Kill switch yetim bırakabiliyor.** `_close_all` sırasında reddedilen ya da
  kısmi dolan çıkış pozisyonu açık bırakıyor; `bot.state` o anda `STOPPED`
  olduğu için worker onu bir daha yönetmiyor. Kapanamayan pozisyon ne olsun?
- **Rotasyon kurbanı boşa gidebiliyor.** Kurban kapatıldıktan sonra sizing
  yeni girişi reddederse slot boş kalıyor (backtest'te de aynı — tutarlı ama
  bilinçli bir karar değil).
- **Okunmamış bildirim saklama süresi yok.** Günde ~600 bildirim üretiliyor,
  hiç okunmuyor; temizlik yalnız okunmuşları siliyor. Süre koymak ürün kararı.
