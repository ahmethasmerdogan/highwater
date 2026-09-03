# SARNIÇ — Değişiklik Günlüğü

Her faz sonunda bir giriş. Format sabit:

```
## [Faz N] Başlık — YYYY-AA-GG

**Yapıldı:** …
**Bilinçli olarak yapılmadı:** …
**Kabul kriteri:** ✅ / ❌ + nasıl doğrulandı
**Açık kalan:** …
```

"Bilinçli olarak yapılmadı" satırı zorunludur. Bir sonraki oturumda "bu neden yok?" sorusuna
cevap veren tek şey odur.

---

## [Arayüz] 2. nesil tasarım sistemi — taşıma tamamlandı — 2026-08-24

**Yapıldı:** Kalan 15 sayfa (+ giriş ekranı) yeni dile taşındı; **18 sayfanın hepsi** artık 2.
nesil sistemi kullanıyor. 1. nesil katman — `ui/` (HashUI türevi bileşen kitaplığı + `hashui.css`),
`components/` (common, data, shell, viz, terminal) ve `globals.css`'teki öneksiz token bloğu —
**tek seferde silindi: 8.239 satır.** Artık `@/ui` ya da `@/components` diye bir şey yok.

Taşıma sırasında tasarım sistemine eklenenler: sözlük katmanı (`Term`, `InfoDot`, `Explain`,
`RichText`, `Field`), durum katmanı (`Async`, `ErrorBox`, `Alert`, `LoadingRows`), rozetler
(`BotStatePill`, `ExitReasonPill`, `OrderStatusPill`, `RolePill`), form denetimleri
(`FormField`, `TextInput`, `TextArea`, `Select`, `Toggle`), `Modal` + `Confirm`, bildirim
sistemi (`ToastProvider`), tema sağlayıcısı, `Chip`, `Picker`, `TextMetric`, `SimpleTable`,
ve grafik ailesi (`AreaCurve`, `DecileChart`, `Sparkline`, `ChartLegend`, `PriceChart`,
`ScoreCard`).

`next.config.ts`'e eklenen `NEXT_DIST_DIR` sayesinde tüm iş boyunca panel **hiç düşmedi**:
önizleme derlemeleri ayrı dizine alındı, canlı `.next` yalnızca en sonda bir kez değişti.

Yol üstünde düzeltilenler: `SimpleTable` artık `<tr>` çocukları yerine sütun tanımı alıyor
(hizalama ve sayı disiplini tek yerden geliyordu ama her çağrı yerinde elle yazılıyordu);
`Explain`'in `showTitle` bayrağı kalktı — başlık her zaman var, çünkü başlıksız bir açıklama
kutusu neyin açıklaması olduğunu söylemiyordu; bot listesindeki satır içi eylem düğmeleri
zeminsizdi ve metin sütunundan ayırt edilemiyordu.

**Bilinçli olarak yapılmadı:**
- Yazı tipi seçici (HashUI'dan devralınan üç seçenek) geri getirilmedi. Tipografi ölçeği tek
  bir aileye göre ayarlandı; başka bir aileyle yeniden doğrulanmadan seçenek sunmak, ayarlanmış
  satır yüksekliklerini bozmak demekti.
- Terminal panelleri `DataGrid` değil `SimpleTable` kullanıyor. Bir terminal panelinde araç
  çubuğu, sütun seçici ve yoğunluk düğmeleri panelin yarısını yerdi.
- Mobil hâlâ ayrıca denenmedi; kabuk kayan menüye dönüyor ama sayfalar dar ekranda ölçülmedi.

**Kabul kriteri:** ✅ `tsc --noEmit` ve `eslint src` sıfır hata sıfır uyarı; üretim derlemesi
geçiyor; **18 sayfanın tamamı** gerçek tarayıcıda açıldı ve konsol hatasızdı; açık ve koyu tema
ayrı ayrı bakıldı. Bot tarafına yine dokunulmadı — yalnızca `sarnic-web` yeniden başlatıldı,
altı bot `PAPER_RUNNING` kaldı.

**Açık kalan:** Mobil doğrulama.

---

## [Arayüz] Panelin 2. nesil tasarım sistemi — 2026-08-24

**Yapıldı:** Panelin görsel dili sıfırdan yeniden kuruldu. Eski bileşenlerin üstüne yazılmadı;
yeni sistem kendi katmanı olarak eklendi ve sayfalar tek tek taşınıyor.

Taşınan disiplin (değişmedi): anlamsal renk kuralları — yeşil yalnız yukarı, kırmızı yalnız
aşağı, amber marka/seçili, turuncu uyarı, mavi nötr bilgi — renk körlüğü için doğrulanmış beş
renkli seri paleti ve sırası, ve bozulmaz kural 6 (`tabular-nums` monospace sayı).

Sıfırdan yazılan: token katmanı (`design/tokens.css`, `--sn-*` önekli; dört kademeli yüzey
rampası, adlandırılmış tipografi ölçeği, üç kademeli yoğunluk ızgarası, hareket token'ları),
bileşen kitaplığı (`design/`), kabuk (`shell/`: raya daraltılabilir yan menü, canlı durum
şeridine dönüşen üst çubuk, komut paleti), ve `@tanstack/react-table` üstünde yeni veri
ızgarası (`grid/`: çok sütunlu sıralama, sürüklenebilir sütun genişliği, sola sabitleme,
sütun görünürlüğü + düzen kalıcılığı, 150 satır üstünde sanallaştırma, alt toplam satırı).

**Sayılar artık sayarak değişiyor.** `design/motion.ts` içindeki `useAnimatedNumber`, değişen
değeri 480 ms'de hedefe taşır; ölçüldü, 60 ms örneklemede 8 kare kesintisiz ara değer üretiyor.
Tablo hücreleri saymaz — 400 hücrenin aynı anda sayması ızgarayı okunmaz kılardı — onun yerine
`useChangeTint` değişimi tek seferlik zemin rengiyle işaretler. İkisi de `prefers-reduced-motion`
altında anında oturur.

Taşınan sayfalar: **Panel, Puanlar, Pozisyonlar.** Her sayfanın tepesindeki açılır "Bu sayfa ne
işe yarar?" kutusu kaldırıldı; yerine her zaman görünen tek cümlelik özet + başlıktaki "Nasıl
okunur" düğmesi geldi. Bilgi kaybolmadı, veriyle yer değiştirmeyi bıraktı.

Yol üstünde düzeltilenler: üst çubuktaki avatara **tek tıkla oturum kapanıyordu** (artık menü);
ızgarada sabitlenen sütun, kendisinden önceki sabitlenmemiş sütunun üstüne biniyordu; kıyas
hükmü panelde iki kez yazılıyordu; eğri grafiğinin nokta araması O(n²) idi (Map'e alındı).

`next.config.ts`'e `NEXT_DIST_DIR` eklendi: arayüz üzerinde çalışırken önizleme derlemesi ayrı
bir dizine alınabiliyor, böylece ayakta duran panel yarı derlenmiş çıktıdan servis edilmiyor.

**Bilinçli olarak yapılmadı:**
- Kalan 15 sayfa henüz taşınmadı. Eski `ui/` + `components/` katmanı ve `globals.css`'teki eski
  token'lar bu yüzden duruyor; ikisi yan yana çalışıyor ve son sayfa da taşınınca eski katman
  tek seferde silinecek. Taşınmamış sayfalar yeni kabuğun içinde eski gövdeleriyle görünüyor.
- Palet değiştirilmedi. Renk körlüğü ve kontrast doğrulaması ölçülmüş bir çıktıydı; yeniden
  seçmek o doğrulamayı sıfırdan yapmayı gerektirirdi ve talep görsel dil yenilemesiydi.
- `ui/Motion.tsx` (411 satır, tamamı ölü kod — hiçbir yerden ithal edilmiyordu) silinmedi;
  eski katmanla birlikte gidecek.
- Sanallaştırma yalnızca 150 satır üstünde açılıyor. Küçük listede kazanç yok, kayıp var:
  tarayıcının kendi araması (Ctrl+F) çalışmaz hâle geliyor.

**Kabul kriteri:** ✅ `tsc --noEmit` ve `eslint` temiz; üretim derlemesi geçiyor; altı sayfa
gerçek tarayıcıda açıldı, konsol hatasız; açık ve koyu tema ayrı ayrı bakıldı; sayma
animasyonu DOM'dan ölçülerek doğrulandı. Bot tarafına dokunulmadı — yalnızca `sarnic-web`
yeniden başlatıldı, altı bot `PAPER_RUNNING` kaldı.

**Açık kalan:** Kalan 15 sayfanın taşınması. Bir de mobil: yeni kabuk mobilde kayan menüye
dönüyor ama sayfalar dar ekranda ayrıca denenmedi.

---

## [Ölçüm] Kalibrasyon besleyicisi hiç zamanlanmamıştı — 2026-08-21

**Yapıldı:** Sistemi denetlerken en pahalı sessiz bozulmayı buldum: `backfill_observations`
— kalibrasyonun ham verisini üreten fonksiyon — **hiçbir döngüye, timer'a veya cron'a bağlı
değildi.** Yalnızca `sarnic observations` elle çalıştırıldığında koşuyordu.

Sonuç ölçüldü: puanlar 21 Ağustos 02:00'ye kadar yazılmışken en yeni gözlem **18 Ağustos
13:00**'tü — 2 gün 9 saat gerilik ve büyüyordu. Kalibrasyon sayfası dolu görünüyor, yalnızca
son üç günü göstermiyordu. Sistemin varlık nedeni olan ölçüm, kimse fark etmeden durmuştu.

Süpervizöre saatlik `_observations_loop` eklendi (30 günlük geriye bakış, upsert olduğu için
uzun ufuklar doldukça satır güncellenir). İlk koşu **70.673 gözlem yazdı.**

**Ölçüm bunun sonucunda değişti — ve daha az iyimser.** Örneklem 46.236'dan **103.807**'ye
çıktı (59 güne yayılıyor). 72 saatlik ufukta:

| | eski (n=46.236) | yeni (n=103.807) |
|---|---|---|
| Spearman | +0,0226 | **+0,0095** |
| Kapı ≥80 farkı | +%3,96 | **+%1,26** |
| t | +3,29 | **+2,35** |
| bar | 176 | 469 |

Yani dün raporladığım "kapının üstü havuzu anlamlı biçimde geçiyor" bulgusu, iki kattan fazla
veriyle **zayıfladı**. Hâlâ pozitif ve marjinal olarak anlamlı, ama daha küçük ve daha yakın
sınırda. Küçük örneklemin daha güzel sayı vermesi beklenen bir şeydir; asıl ders, ölçümün
kendisinin ölçülmeden bırakılmaması gerektiğidir.

**İkinci düzeltme — ufuk sessizce uzuyordu.** `forward_returns` hedef barı `searchsorted` ile
buluyor ama **eşleşmeyi kontrol etmiyordu**: hedef bar veri boşluğu yüzünden yoksa bir
sonraki bar alınıyor, yani "24 saatlik getiri" sessizce 25, 30 ya da 50 saatlik oluyordu.
Ölçüldü: 60 günde 236.318 bar geçişinin 6'sı boşluklu (%0,003), yani bedeli birkaç gözlem.
Ufkun adı doğru olmalı; hedef bar tam eşleşmiyorsa artık `None` yazılıyor.

**Üçüncüsü — kapsam.** `scoring/observations.py` **%0 kapsamdaydı**. Sistemin birincil
çıktısının ham verisini üreten modül test edilmemişti. 13 test yazıldı: elle hesaplanmış
getiriler, referans barın doğruluğu, dolmamış ufuk, boşluk davranışı, sıfır fiyat, upsert
tekrarı, zaman dilimi karışmaması, döngünün kayıtlı olması.

**Bilinçli olarak yapılmadı:**
- `scoring/backfill.py` (%0) ve `backtest/runner.py` (%0) test edilmedi. İkisi de elle
  çalıştırılan tek seferlik araçlar; canlı yolda değiller. `observations.py` canlı yoldaydı,
  bu yüzden öncelik oydu.
- Ağırlıklara ve eşiklere dokunulmadı — kalibrasyon zayıfladı diye ayar değiştirmek, aynı
  veride arama yapmaktır.

**Kabul kriteri:** ✅ 486 test geçti (13'ü yeni), `ruff` temiz. Canlıda doğrulandı: döngü
çalıştı, gecikme 2 gün 9 saatten **2 dakikaya** indi, gözlem 54.569 → 115.791.

**Açık kalan:** Alertmanager yok; yedekler makine dışına kopyalanmıyor.

## [Güvenlik] WebSocket jetonu artık URL'de gitmiyor — 2026-08-21

**Yapıldı:** Canlı akış kimliği tek kullanımlık bilete geçirildi.

Sorun ölçülmüştü: panel proxy'si API'ye ulaşamadığında Next.js hata satırını tam URL'yle
yazıyor ve satır şöyle görünüyordu —

    Failed to proxy http://127.0.0.1:8000/ws?token=eyJhbGciOiJIUzI1NiI...

Yani **30 dakika geçerli, tam yetkili bir erişim jetonu düz metin olarak journal'a
düşüyordu.** Tarayıcı WebSocket el sıkışmasında `Authorization` başlığı gönderemez,
dolayısıyla kimliğin sorgu dizgesinden geçmesi zorunlu; sorun jetonun kendisini oraya
koymaktı. Panel Caddy ile dışarı açılırsa aynı şey ters vekilin erişim kayıtlarına da yazılır.

`POST /auth/ws-ticket` eklendi: normal `Authorization` başlığıyla çağrılır, `typ: "ws"`
tipinde **30 saniyelik** bir bilet döner. `/ws` artık yalnızca bileti kabul ediyor ve
bileti **harcıyor** — `jti` Redis'e `SET NX` ile yazılır, ikinci kullanım reddedilir.
Loga düşse bile ele geçiren kişinin elinde muhtemelen çoktan harcanmış, yarım dakikalık
bir anahtar kalır. Panel ve TUI her yeniden bağlanmada yeni bilet alır.

Redis erişilemezse tekrar kullanım kontrolü atlanır ve bağlantı kabul edilir: bilet zaten
imzalı ve 30 saniyelik, gözlem katmanı çöktüğü için canlı akışı kesmek kazandığından
fazlasını kaybettirir.

**Bilinçli olarak yapılmadı:**
- Eski `?token=` yolu **kaldırıldı**, geriye dönük kabul edilmiyor. Geçiş dönemi bırakmak
  açığı açık bırakmak olurdu. Bedeli: açık duran bir tarayıcı sekmesi eski paketi
  çalıştırdığı sürece canlı akışı "yeniden bağlanılıyor"da kalır; sayfayı yenilemek çözer.
- Bilet Redis'te yalnızca `jti` olarak tutuluyor; kullanıcı/oturum eşleşmesi eklenmedi.
  İmza zaten kullanıcıyı taşıyor.

**Kabul kriteri:** ✅ 473 test geçti (5'i yeni), `ruff` ve `tsc` temiz. Canlıda uçtan uca
doğrulandı: bilet ucu 200 ve kimliksiz 401; biletle bağlantı açıldı ve `history` çerçevesi
geldi; **aynı bilet ikinci kez reddedildi**; erişim jetonuyla bağlanma denemesi reddedildi.
`FakeRedis.set` artık `nx`'i gerçekten uyguluyor — eskiden hep `None` dönüyordu ve o hâliyle
tek kullanımlık olma iddiası test edilemezdi.

**Açık kalan:** Alertmanager yok; yedekler makine dışına kopyalanmıyor.

## [Bakım] Puan geçmişine saklama politikası — 2026-08-20 (gece)

**Yapıldı:** `scores` sınırsız büyüyen tek tabloydu — her bar × her sembol × her puanlama
konfigürasyonu için bir satır, satır başına ~2 KB (`rationale`/`families` jsonb'leri). Ölçüldü:
354.689 satır = **787 MB**, günde ~15 bin satır (~30 MB, ~1 GB/ay). Süpervizöre altı saatte bir
koşan bir budama döngüsü eklendi; süre `SARNIC_SCORES_RETENTION_DAYS` ile ayarlanır, varsayılan
90 gün, `0` kapatır.

**Asıl mesele budama değil, neyi budamadığı.** `score_observations.score_id` yabancı anahtarı
`ON DELETE CASCADE`. Yani "90 günden eski puanları sil" diye yazılmış düz bir sorgu, kalibrasyon
gözlemlerini de sessizce götürürdü — sistemin birincil çıktısını, puanlamanın öngörü gücü olup
olmadığının tek kanıtını. Bugün fark edilmezdi bile: 90 günü aşan 608 satırın **hiçbirinin**
gözlemi yok. Otuz gün sonra 19 Haziran'daki gözlemler sınırı geçecek ve kayıp sessizce başlayacaktı.

Budama bu yüzden gözlemi olan bir puana sınırı geçse de dokunmaz. Bedeli açık: gözlemli satırlar
(şu an %15) hiç silinmez, büyüme sıfırlanmaz, ~%15'e iner. Ölçümü korumak diskten önce gelir.

İlk koşu canlı sistemde çalıştı: **608 satır silindi**, gözlem sayısı 54.569'da değişmedi,
kalibrasyonun 46.236 gözlemi yerinde.

**Bilinçli olarak yapılmadı:**
- `VACUUM FULL` çalıştırılmadı; tablo hâlâ 787 MB. Budama dosyayı küçültmez, boşalan yeri yeni
  satırlar için kullanılabilir kılar. Diski geri almak tabloyu kilitler ve 787 MB için buna
  değmez.
- `score_observations`, `ohlcv` ve `bot_events`'e saklama konmadı. Gözlemler ve OHLCV kalıcı
  olmalı (backtest dürüstlüğü); `bot_events` küçük.
- Yabancı anahtar `CASCADE` olarak bırakıldı. `SET NULL` yapmak `score_id` birincil anahtar
  olduğu için mümkün değil; şemayı değiştirmek bu işin kapsamı dışında.

**Kabul kriteri:** ✅ 468 test geçti (5'i yeni), `ruff` temiz. Kritik test —
`test_gozlemli_puan_sinirin_otesinde_de_korunur` — 200 günlük iki puandan gözlemsiz olanı silip
gözlemli olanı ve gözlemini bırakıyor. Canlı koşu doğrulandı.

**Açık kalan:** Alertmanager hâlâ yok; yedekler makine dışına kopyalanmıyor. WebSocket jetonu
sorgu dizgesinde gittiği için proxy hatalarında journal'a düşüyor.

## [Bakım] Gözlem katmanının kendi kör noktaları — 2026-08-20 (gece)

Kurduğumuz gözlem katmanı ilk gerçek sınavını verdi ve **dört kusuru kendisi gösterdi.**

**1. Alarmın kendisi sahte alarm veriyordu.** `BarAkisiDurdu` kuralı
`increase(sarnic_bars_written_total[30m]) == 0` yazılmıştı. Ölçü her süreçte tanımlı olduğu
için — modül içe aktarıldığı anda kayıt defterine girer — on bir hedefin dokuzu onu sabit 0
yayınlıyor ve kural o dokuz seri için sürekli çalıyordu. Aynı hatanın bir kopyası panoda iki
panelde vardı. Kural artık modülün başında yazılı: **sayaçlarda `sum(...)`, göstergelerde
`max(...)`.**

**2. Ölçüm 19 hata yolundan yalnızca birini görüyordu.** PostgreSQL yeniden başlatıldığında
süpervizör `manage_loop_error` ve `heartbeat_failed` verdi; Prometheus hiçbir şey görmedi.
Kodda 19 ERROR seviyeli log çağrısı var (`worker_crashed`, `worker_restart_storm`,
`supervisor_reconcile_failed`, `backtest_failed`, …) ve sayacı olan tek yol
`decision_loop_error`'dı. Her yola elle sayaç koymak, yeni bir yol eklendiğinde unutulur;
log zinciri ise hepsinden geçer. `sarnic_log_errors_total{event,level}` structlog işlemcisine
takıldı, iki alarm kuralı (`HataLoglandi`, `BotCoktu`) ve bir pano paneli eklendi.

**3. PostgreSQL'in paylaşımlı belleği tükeniyordu — ve bu, veritabanının hiç
çözümlenmemesine yol açmıştı.** `VACUUM (ANALYZE) scores` şu hatayla düşüyordu:
`could not resize shared memory segment ... No space left on device`. Sebep Docker'ın
varsayılan 64 MB'lık `/dev/shm`'i. Sonuç sinsiydi: en büyük tablo (787 MB, 354.274 satır) hiç
çözümlenmemişti ve **planlayıcı satır sayısını 15.130 sanıyordu — 23 kat yanlış.** 356 tablonun
yalnızca 8'i `analyze` görmüştü. `shm_size: 1gb` eklendi, veritabanının tamamı çözümlendi
(356/356), `scores`'ta ölü satır 4.380 → 0.

**4. Repoda 183 MB webpack önbelleği vardı.** `apps/web/.next.root-owned-2026-08-17` — 17
Ağustos'taki Docker derleme kazasından kalan dizin. `.gitignore`'daki `.next/` bu ismi
yakalamıyor, dolayısıyla ilk işlemeye 97 dosya girmişti. Geçmiş yeniden yazıldı (uzak depo yok,
iki yerel işleme), dizin diskten silindi, `.gitignore`'a `.next.root-owned-*/` eklendi.
`.git` 43 MB → 912 KB.

**Bilinçli olarak yapılmadı:**
- **Strateji parametrelerine yine dokunulmadı.** Bot 6 (4 saat) hâlâ hiç giriş açmadı ve
  incelendi: yapılandırma doğru, fırsat çıkmamış. Giriş eşiği 80 ve kurulduğundan beri geçen
  8 barda en yüksek 4h puanı **79,8**. Eşik düşürülmedi.
- `scores` tablosuna saklama politikası konmadı. Günde ~15 bin satır, ~30 MB büyüyor
  (~1 GB/ay). Disk 87 GB boş, acil değil; ama kaç günlük puan geçmişi tutulacağı bir ürün
  kararıdır ve sorulmadan verilmez. Kalibrasyon ayrı tabloyu (`score_observations`) kullanır.
- WebSocket kimlik doğrulaması olduğu gibi bırakıldı. `?token=...` sorgu dizgesinde gittiği
  için panel proxy'si hata verdiğinde JWT düz metin olarak journal'a düşüyor. Kalıcı çözüm
  tek kullanımlık kısa ömürlü bir WS bileti; auth akışını değiştirir, sorulmadan yapılmadı.
- Alertmanager hâlâ yok: alarmlar `:9090/alerts`'te görünüyor, hiçbir yere bildirim gitmiyor.

**Kabul kriteri:** ✅ 463 test geçti, `ruff` temiz. 11/11 hedef `up`, 9 alarm kuralının
9'u sessiz, panonun 14 panelinin 14'ünde sorgu başarılı. Veritabanı yeniden başlatıldı ve beş
servis de kendiliğinden toparlandı.

**Açık kalan:** Veritabanı yeniden başlatması `manage_loop_error` üretti; bu yol artık ölçülüyor
ama bir yere bildirim gitmiyor (Alertmanager → Discord). Yedekler hâlâ makine dışına
kopyalanmıyor.

## [Faz 11] Prometheus + Grafana + Sentry — 2026-08-20 (akşam)

**Yapıldı:** `SYSTEM-REVIEW.md`'nin "en yüksek getirili parça" dediği iş: gözlemlenebilirlik.
O belgedeki cümle şuydu — *"Bu tur bulunan beş kusurun beşi de logları elle okuyarak bulundu.
Bir toplayıcı olsaydı `decision_loop_error` sayacı 22:05'te üç kez artıp gözle görülür bir
alarm üretirdi."*

**Ölçüler — tek hook, çok ölçü.** Alan olayları zaten tek bir yerden (`EventBus.publish`)
geçtiği için `sarnic_events_total{kind,level}` tek satırla pozisyonları, emirleri, devre
kesicileri ve bot durum değişimlerini kapsıyor. Her olay tipine ayrı sayaç serpiştirmek koda
yayılır ve biri eklenmeyi unutur. Yanına dört nokta daha: karar döngüsü istisnası (bot
bazında), yazılan bar, WS yeniden bağlanma, havuz boyutu, olay yayın hatası.

**Ölçüm portları.** Motor servisleri bu makinede systemd kullanıcı servisi olarak koşuyor ve
API dışında HTTP sunucuları yok; her biri kendi `/metrics` portunu açıyor (marketdata 9101,
süpervizör 9102, bildirimci 9103). Worker'lar süpervizörün alt süreçleri olduğu ve kendi kayıt
defterlerini tuttukları için port = `9110 + bot_id`. Prometheus hedef listesi elle yazıldı —
altı botluk bir sistem için keşif mekanizması kurmak fazla makine.

**Prometheus host ağında koşuyor.** İlk denemede hedefler `host.docker.internal` üzerinden
konuşuldu ve hepsi zaman aşımına uğradı: UFW etkin, köprü ağındaki konteyner host'un
portlarına ulaşamıyor. İki seçenek vardı — güvenlik duvarına Docker alt ağı için delik açmak
ya da bu iki konteyneri host ağına almak. İkincisi seçildi; güvenlik duruşu değişmiyor.
Grafana bu yüzden 3000'i panele bırakıp 3001'e taşındı.

**Alarmlar.** Yedi kural (`docker/prometheus/alarmlar.yml`), hepsi daha önce **sessizce** olmuş
olaylardan türetildi: servis düştü, karar döngüsü hatası, bar akışı durdu, olay yayınlanamadı,
devre kesici tetiklendi, havuz küçüldü, WS sürekli kopuyor.

**Sentry — ve yığın izi sorunu.** İlk kurulum "çalışıyor" görünüyordu: olay Sentry'ye gidiyordu.
Ama `exception` alanı **boştu**. Sebep: `structlog.processors.format_exc_info` `exc_info`'yu
tüketip metne çeviriyor, kayıt stdlib `logging`'e ulaştığında Sentry'nin logging entegrasyonunun
göreceği bir istisna kalmıyor — yani Sentry'nin var olma sebebi kayboluyor. İstisna artık
zincirde `format_exc_info`'dan **önce**, `component` ve `log_event` etiketleriyle ve `bot_id`
gibi bağlam alanlarıyla gönderiliyor. Sentry'nin kendi logging entegrasyonu olay üretmeyecek
biçimde kapatıldı (aksi hâlde her istisna iki kez raporlanırdı: biri izli, biri izsiz).
Sıranın bozulması sessiz bir bozulma olduğu için testi yazıldı.

**Bilinçli olarak yapılmadı:**
- **Alertmanager kurulmadı.** Kurallar Prometheus'ta değerlendiriliyor ve `:9090/alerts`'te
  görünüyor ama hiçbir yere bildirim göndermiyor. Discord köprüsü zaten var; alarmları oraya
  bağlamak ayrı bir iş ve hangi kanala gideceği belli değil.
- **Sentry kendi kurulumumuzda değil.** SDK herhangi bir DSN ile çalışır; self-hosted Sentry
  ~10 konteynerlik bir yığındır ve bu makinede işlem motorunun yanında durması orantısız.
- Panele (Next.js) Sentry eklenmedi — hatalar motorda oluyor, panel bir istemci.
- İzleme (tracing) kapalı: 1 saatlik karar döngüsünde performans izi bir şey anlatmaz.
- Grafana'ya iş göstergesi panosu (puan dağılımı, pozisyonlar, P&L) eklenmedi. Bunların yeri
  paneldir; Grafana **sistemin** sağlığını gösterir, stratejinin değil.

**Kabul kriteri:** ✅ 460 motor testi geçti, `ruff check` temiz. Prometheus'ta **11 hedefin
11'i `up`**, 7 alarm kuralı yüklü. Grafana `:3001` sağlıklı, veri kaynağı ve pano kod olarak
sağlanıyor. Sentry, sahte DSN ile uçtan uca doğrulandı: tek olay, `ValueError` tipi, yığın izi
dolu, `log_event=decision_loop_error`, `bot_id=42`.

**Açık kalan:** Alarmların gideceği bir yer yok (Alertmanager → Discord). `sarnic_universe_size`
yalnızca süpervizör tarafından yazılıyor; süpervizör yeniden başladığında ilk turda anlık
görüntüden okunuyor ama diğer süreçlerde 0 görünür — Prometheus'ta `max()` ile toplanmalı,
pano bunu yapıyor. Caddy + SSL ve `BinanceSpotAdapter` hâlâ Faz 11'de bekliyor.

## [Bakım] Kalibrasyon panelde eksik ölçüyordu; yedek hiç yoktu — 2026-08-20

**Yapıldı:** Üç boşluk kapatıldı; strateji parametrelerine dokunulmadı.

**1. Desil medyanı.** Kalibrasyon yalnızca **ortalama** ileri getiriyi raporluyordu. Canlı veride
en düşük desilin ortalaması +%0,52, medyanı −%0,34: birkaç piyango sıçraması dilimi kârlı
gösteriyor, tipik gözlem zarar ediyor. Yalnızca çubuğa bakan okuyucu "en düşük puanlılar en iyi
getiriyi verdi" sonucunu çıkarıyordu — sistemin dürüstlük organında kabul edilemez bir okuma.
`DecileBucket.median_return` eklendi, desil grafiğine kesik çizgi olarak bindirildi, tabloya
sütun olarak kondu. Aykırı değer sürüklemesini yakalayan test: `test_decile_medyan_ortalamadan_ayrisir`.

**2. Kapı ölçümü artık görünür.** `_gate_edge` — sistemin *fiilen işlem yaptığı* bölgenin havuza
göre farkı, bar bazında — arka uçta hesaplanıyor ama panelde yalnızca karar cümlesinin içinde
metin olarak geçiyordu; sayılar hiçbir yerde yoktu. Üstelik başlık yalnızca Spearman'a bakıyordu,
bu yüzden gövdede "kapının üstü havuzu anlamlı biçimde geçiyor" yazarken başlıkta "puanlama
öngörü gücü gösteremiyor" diyordu. Yeni bölüm dört sayıyı (kapının üstü, havuz, fark, t) açıkça
gösteriyor; başlık üç durumlu oldu. Bölümün altına, eşiğin seçildiği veriyle ölçüldüğü uyarısı
kondu — kenar "gerçek" değil, "henüz çürütülmemiş"tir.

**3. Yedek ve geri yükleme provası.** Sistemde hiç yedek yoktu (`SYSTEM-REVIEW.md`: "Yok").
`scripts/yedek-al.sh` (`pg_dump -Fc`, son 14 tane, yarım dosya geçerli sayılmaz) ve
`scripts/yedek-prova.sh` (son dökümü `sarnic_prova` veritabanına geri yükler, satır sayılarını
canlıyla karşılaştırır, siler) yazıldı; gecelik 04:00 ve haftalık pazar 05:00 systemd
zamanlayıcılarına bağlandı. **İlk prova geçti:** 1.594.173 satırlık `ohlcv` hypertable dâhil
tüm tablolar geri geldi. Faz 11 kapısındaki "yedekten geri yükleme provası" maddesi işaretlendi.

**Bilinçli olarak yapılmadı:**
- **Strateji, ağırlık ve eşiklere dokunulmadı.** 60 günlük paper penceresinin 6. günündeyiz;
  95 işlemlik gürültüye bakarak parametre oynatmak eğri uydurmaktır ve sayacı sıfırlar.
- Redis yedeklenmiyor — içindekilerin tamamı yeniden üretilebilir, kalıcı durum yalnızca
  PostgreSQL'de.
- Yedekler makine dışına kopyalanmıyor. Disk arızası hâlâ tek hata noktası; harici kopya
  (S3/rsync) kararı verilmedi.
- Bot 6 (4 saat) hiç giriş açmadı ama giriş kapısına dokunulmadı: bot yalnızca 9 bar görmüş,
  bu sürede giriş olmaması normal. Bir hafta daha boş kalırsa bakılacak.
- Prometheus/Grafana ve Sentry hâlâ kurulmadı — `SYSTEM-REVIEW.md`'nin "en yüksek getirili
  parça" dediği iş duruyor.

**Kabul kriteri:** ✅ 454 motor testi geçti (`pytest tests -q`), `ruff check` temiz,
`tsc --noEmit` temiz, panel üretim derlemesi başarılı ve `localhost:3000/giris` 200 dönüyor;
`yedek-prova.sh` 11 tablonun tamamında ✓ verdi.

**Açık kalan:** Kalibrasyonun asıl cevabı hâlâ zayıf — 46.236 gözlemde Spearman +0,014 (24s) /
+0,023 (72s), yani sıfıra çok yakın ama pozitif. Üst desiller medyanda "daha az kaybettiriyor";
72 saatte her desilin medyanı negatif. Kapının üstündeki kenar bunu telafi ediyor gibi görünse de
aynı veriyle ölçüldüğü için bağımsız kanıt değil. Bunu çözecek tek şey zaman: 60 günlük pencere
dolmadan hüküm verilmeyecek.

## [Ölçüm] Sistem artıda — ve önceki kıyasım yanlıştı — 2026-08-19 (akşam)

**Yapıldı:** Uçtan uca **portföy** simülasyonu kuruldu (60 gün, 1460 bar, kapı 80, eşit ağırlık,
%80 maruziyet tavanı, gerçek çıkış kuralları, ölçülen gerçek ücret). Şimdiye kadarki ölçümler
işlem başınaydı; portföy düzeyi hiç ölçülmemişti.

**Önce bir düzeltme.** Sabahki girişte "havuz yıllık −%28 getirdi, kenar bunu kapatmıyor" yazdım;
**yanlıştı.** O rakam üst üste binen 24 saatlik ileri getirilerin aritmetik ortalamasının 365 ile
çarpımıydı — bir portföyün getirisi değil. Eşit ağırlıklı, her bar yeniden dengelenen gerçek
havuz portföyü aynı 60 günde **−%0,45** (yıllık −%2,7) yaptı. Piyasa düşmedi, yatay kaldı.
"Yön riski kenarı yutuyor" çerçevesi bu yüzden fazla karamsardı.

Doğru ölçümle sonuç:

    slot   toplam    yıllık   ilk yarı   son yarı  maks düşüş  işlem
      3   +11,87%    +97,8%     +9,25%     +2,39%     -11,9%    128
      4    +9,47%    +73,4%     +8,85%     +0,57%     -10,1%    138
      5    +7,70%    +57,0%     +8,53%     -0,76%      -9,2%    144
    havuz  -0,45%     -2,7%     -2,05%     +1,63%     -11,9%      —

Eşzamanlı pozisyon sayısı **5→4** yapıldı (bot 2 "seçici" 3'te — kalan belirsizlik tahminle
değil canlı ölçümle kapansın). Eğilim monoton ve mekanizması açık: az slot yalnızca en yüksek
puanlıyı almaktır, kenar da puanla artıyor. 1–2 slot daha yüksek getiriyor ama 66–103 işlemle
tek işleme bağımlı hâle geliyor ve tek isim maruziyeti %40'a çıkıyor; 4'te %20 (`max_position_pct`
tavanı %30).

**Düzeltilen kusurlar:**
* *Kırıntı pozisyon.* Kısıtlar boyutu kırpıyordu ama **tabanı yoktu**: serbest nakit 20 $ kaldıysa
  20 $'lık pozisyon açılıyordu. Aynı sembolde, neredeyse aynı barda, botlara göre büyüklükler
  20 $ ile 1.514 $ arasında değişti — 75 kat. Kırıntı hiçbir şey kazandıramaz ama dört
  pozisyonluk defterde bir slotu 72 saate kadar işgal eder. Artık hedefin dörtte birinin altına
  düşen boyut **reddediliyor**, slot boş bırakılıyor.
* *Havuz sınırında salınım.* Histerezis yalnızca sıralama bandı için vardı; ölçüm filtresinden
  (oynaklık, spread, hacim) düşen üye anında atılıyordu. BABYUSDT 25 dakikada beş kez girip
  çıktı, günde 31–68 snapshot yazılıyordu ve her çıkış puanlamanın kesitini de değiştiriyordu.
  Artık ölçüm filtresinden düşen üye bir tur korunuyor; delist/kara liste gibi **sert** filtreler
  anında çıkarıyor. Düzeltmeden sonra 47 dakika boyunca tek snapshot yazılmadı.
* *Kısmi çıkışta sessiz muhasebe ayrışması.* `PaperAdapter` kısmi dolumu doğru raporluyordu ama
  işçi pozisyonu yine de kapatıyordu: DB'de kapalı, adaptörde kalan miktar duruyor, o miktar bir
  daha satılamıyor, nakit geri gelmiyor. Henüz hiç gerçekleşmemişti (153 dolan emrin hiçbiri
  kısmi değil) ama havuz ince defterli sembollerden oluşuyor ve hata sessiz. Pozisyon artık
  kalanla açık kalıyor; `positions.realized_pnl` / `realized_fees` eklendi (migrasyon 0005).
* *Boyutlandırma kademeleri kapıya çapalanmamıştı.* Kod varsayılanı (80/85/92) işlemlerin
  %87'sini en küçük kademeye koyuyor, en büyük kademe 60 günde altı kez görülüyordu. Ölçülen
  dağılıma göre 80/82/85 yapıldı; yön de veriyle uyumlu (80 → +%0,72, 82 → +%1,10, 85 → +%1,53).
* *Test veritabanı migrasyonları görmüyordu.* `create_all` mevcut tabloya sütun eklemez; modele
  yeni alan girince testler "column does not exist" ile, yani koddaki bir hatayı gösteriyormuş
  gibi düşüyordu (iki kez oldu). Artık önce `drop_all`.

**Bilinçli olarak yapılmadı:**
- *4 saatlik karar barı* ölçüldü ve **reddedildi** (bot 6, 90 gün, 42.642 puan): işlem başına
  +%0,54 / toplam +%152, 1 saatlik ise +%0,70 / +%435. Fazla fırsatın getirisi fazla dokunuşun
  ücretini fazlasıyla karşılıyor. Bot 6 durdurulmuş hâlde duruyor; ölçümün kaynağı o.
- *Rotasyon eşiği* ölçüldü ve **değiştirilmedi**: 3 puana indirilse bile 60 günde tek bir
  rotasyon oluyor ve o da zarar ediyor. Puan çıkışı (< 60) zayıflayanı zaten alıyor.
- *Maruziyet tavanı* %80'de bırakıldı. %100 her slot sayısında daha yüksek getiriyor ama düşüşü
  de büyütüyor; bu bir risk parametresi, ölçüm kararı değil.

**Kabul kriteri:** ✅ 445 test yeşil; `ruff` temiz; altı servis ayakta; panel 200; son 24 saatte
sıfır reddedilen emir; açık veri kalitesi bulgusu yalnızca tasarımı gereği kalıcı 47 aykırı değer.

**Açık kalan:** Kenarın **dayanıklılığı**. İkinci yarı birincinin dörtte biri kadar getiriyor ve
60 gün tek rejimdir. Bundan sonrası ayar değil kayıt işi: altı bot farklı ayarlarla çalışıyor,
her işlem artık `strategy_version_id` taşıyor. 15m/30m botların kendi kalibrasyonu için 30
dakikalık puan dolumu sürüyor.

---
## [Ölçüm] Kenar seçimde, kayıp piyasada — ve panel bunu söylemiyordu — 2026-08-19

**Yapıldı:** 60 günlük puan geçmişi tamamlandı (1451 bar, 103 sembol, 125.021 puan) ve önceki
gün alelacele okunan ölçümler **dengeli örnekte yeniden** yapıldı. Bir önceki girişteki
"kapı 80'de iki yarı birbirini doğruluyor" bulgusu **yanlış çıktı**: örnek o sırada dönemlere
eşit dağılmıyordu. Doğrusu şu — mutlak getiri her kapıda ilk 30 günde artı, son 30 günde eksi.

Doğru soru mutlak değil göreli olduğu için ayrıştırıldı: her girişin getirisi **aynı barda aynı
süre** tutulan havuz ortalamasıyla karşılaştırıldı. Sonuç net ve iki yarıda da aynı yönde:

    72 saat tutma, seçimin havuza göre farkı
    kapı 74 : +1,393 puan   (t=+6,5)   ilk yarı +1,76   son yarı +1,02
    kapı 78 : +2,073 puan   (t=+5,5)   ilk yarı +2,54   son yarı +1,65
    kapı 80 : +1,802 puan   (t=+3,6)   ilk yarı +2,70   son yarı +1,05

**Puanlamanın seçim becerisi var.** Mutlak kayıp seçimden değil, uzun-yönlü bir spot sistemin
düşen bir havuzda taşıdığı yön riskinden geliyor. Bu, tuning ile kapatılabilecek bir açık değil.

Denenip **ölçümle reddedilenler** (üçü de kodda gerekçesiyle duruyor):
* *Rejim filtresi* — "havuz zayıfken nakitte kal". Her sıkılaştırma sonucu kötüleştirdi
  (genişlik ≥%0 → +%0,70; ≥%35 → +%0,03; ≥%55 → −%0,74). Puanlama zayıf piyasada daha iyi
  çalışıyor; filtre tam da kenarın olduğu barları eliyor.
* *Geniş stop* — stopsuz tutma ölçümde en iyisiydi (+%1,30 / 2 ATR'de +%0,70), ama
  boyutlandırma stop girişin %8'inden uzaksa pozisyonu **reddediyor**. Kapak hesaba katılınca
  sıralama tersine döndü: 6 ATR girişlerin üçte birini, 8 ATR yarısını eliyor ve eleme
  **taraflı** — yüksek ATR'li semboller elenirken büyük kazançlar onlarla gidiyor. Kapak
  sabitken 2 ATR +%0,69, 6 ATR −%0,62. Stop 2,0'da bırakıldı; bu bağlantı artık testle kilitli.
* *Kesitsel kalabalıklaşma cezası* — bir önceki gün eklenip aynı gün geri alınmıştı; gerekçesi
  `crowding_penalty` içinde duruyor.

Uygulanan tek ayar: `score_exit` 55→60. 605 giriş üzerinde 55'te +%0,72, 60'ta +%0,82, 65'te
+%0,81, 70'te +%0,61; 60 ve 65 örneğin **iki yarısında da** 55'i geçiyor.

**Düzeltilen kusurlar:**
* *Kalibrasyon çalışan kenarı gizliyordu.* Spearman +0,014 ile "öngörü yok" yazıyordu, çünkü
  tüm dağılıma bakıyor — sistem ise yalnızca kapının üstünü alıyor. Rapora `gate_edge` eklendi:
  puanı ≥ 80 olanların havuza göre farkı, bar bazında, t-istatistiğiyle. Panel artık 72 saatte
  "+%3,96 (t=+3,3, anlamlı)" diyor. Dürüstlük organı çalışan bir kenarı da saklamamalı.
* *Saatlik sıralamalar panelden kaybolmuştu.* `/scores` ve `/scores/configs` "son bar"ı tüm
  zaman dilimleri arasından alıyordu; 15m barı 05:45'te, 1h barı 05:00'da olduğu için saatlik
  konfigürasyonlar hiç listelenmiyordu. Kullanıcı saatlik havuza baktığını sanarken 15 dakikalık
  puanları görüyordu. Sıralamanın kimliği artık `config_hash + timeframe`; panel de öyle.
* *21 ERROR veri kalitesi bulgusunun tamamı hayaletti.* Boşluklar onarılmıştı ama bulgular
  açık kalmıştı: kapatma yalnızca sembol denetlenirken çalışıyor, denetim de yalnızca izlenen
  sembollerde dönüyordu. Havuzdan çıkan sembolün bulgusu sonsuza dek donuyordu. `verify_open_gaps`
  eklendi — varsayım değil sayım: aralıktaki barlar varsa bulgu kapanır. 537 bulgu kapandı.
* *`/positions` Redis zaman aşımında 500 dönüyordu.* Canlı fiyat bu ucun süsü, iskeleti değil;
  çağıranların hepsi `last_price=None` durumunu zaten taşıyor. Artık boş dönüp uyarı yazıyor.
* *Ardışık zarar sayacı sürüm sınırını aşıyordu* — `trades.strategy_version_id` eklendi
  (migrasyon 0004) ve sayaç botun mevcut sürümüyle sınırlandı.
* *Kâr koruma merdiveni kapatılamıyordu* — `breakeven_r=0` "hemen kilitle" diye yorumlanıyor,
  yani kapatmak isteyenin eline en kötü sonucu veriyordu. Artık ≤0 "kapalı" demek.

**Bilinçli olarak yapılmadı:**
- Giriş kapısı 80'de bırakıldı. Toplam getiriyi maksimize eden yer orası (605 işlem × +%0,72),
  ama **kararlı olduğu kanıtlanmadı**: mutlak sonuç son 30 günde her kapıda eksi.
- Aile ağırlıklarına yine dokunulmadı.
- Stopsuz tutma ölçümde en iyi olsa da uygulanmadı; boyutlandırma stopa bağlı ve kuyruk açık kalır.

**Kabul kriteri:** ✅ 440 test yeşil; `ruff`, `tsc`, `eslint --max-warnings 0` temiz; panel
derleniyor ve 200 dönüyor; 40 API ucunun tamamı 200.

**Açık kalan:** Sistemin "+"ya geçmesi seçim becerisine değil, **havuzun yönüne** bağlı —
ölçülen kenar (72 saatte ~1,8 puan) düşen bir piyasanın kaybını kapatmıyor. Uzun-yönlü spot
kalınacaksa ya kenar büyütülmeli ya da yön riski taşınmalı; bu bir ayar sorusu değil, tasarım
sorusu ve `docs/OPEN-QUESTIONS.md`'ye yazıldı. 15m/30m botların kendi kalibrasyonu hâlâ yok.

---
## [Ölçüm] Kenar bulundu: kayıp girişte değil çıkıştaydı — 2026-08-18

**Yapıldı:** Sistem 60 gündür ekside olduğu için kök neden arandı. Önce ölçüm altyapısı
kuruldu: `score-backfill` 60 günlük geçmiş puanı **backtest motorunun kendi yollarıyla**
üretti (bozulmaz kural 1), `observations` ileri getirileri hesapladı — 88 sembol, ~50 bin
gözlem. Kalibrasyon ilk kez tek günlük değil iki aylık bir örnek üzerinde okundu.

Bulgular sırayla:

1. **Canlı işlemler brüt sıfır üretiyordu.** 54 işlem, ortalama pozisyon 755 $, ortalama
   ücret 1,51 $ (gidiş-dönüş %0,20), ortalama brüt hareket **−%0,0045**. Yani sistem tam
   olarak ücret kadar kaybediyordu.
2. **Ham sinyal taraması yanıltıcıydı.** Kesitsel IC'de oynaklık, hacim patlaması ve 24s
   getiri istikrarlı biçimde negatifti; her ölçüde en üst desil çöküyordu. Buradan "puanlama
   D10'u topluyor" sonucu çıkarıldı ve kesitsel bir kalabalıklaşma cezası yazıldı.
   **Ölçüm reddetti ve ceza geri alındı**: puan ≥ 80 kapısındaki fırsatların %38,6'sını eleyip
   ortalama ileri getiriyi +%1,53'ten +%1,02'ye düşürüyordu. Ayrım bulgunun kendisi: "çok
   koşmuş olmak" tek başına kötü, "çok koşmuş **ve** trend/akış/yapı olarak sağlam olmak" iyi.
   Puanlama bu ikisini ayırt edebiliyor, ham sıralama edemiyor.
3. **Giriş sinyali çalışıyor.** Aynı girişler stopsuz 72 saat tutulduğunda işlem başına
   **+%1,35** (kapı 74) ve **+%3,15** (kapı 80) — ücret dahil, t=+5,3 / +4,1.
4. **Kazancı çıkış merdiveni yiyordu.** Aynı girişlerde eski kural (0,5 ATR stop, 2,5R
   başabaş) yalnızca +%0,06 bırakıyordu; kenarın %95'i.
5. **Stop genişletmesi merdiveni sessizce kapatmıştı.** 1R = stop mesafesi olduğu için stop
   0,5→2,0 ATR yapılınca başabaş tetiği 1,25 ATR'den 5,0 ATR'ye fırladı ve trailing pratikte
   hiç devreye girmez oldu — sistemin kârlı olan tek tarafı (19 trailing çıkışı, +213) kapandı.
6. **Giriş kapısı kararsız bölgedeydi.** Kapı gezdirildiğinde 74'te örneğin iki yarısı
   birbirini tutmuyor (+%0,80 / +%0,09); 78'den itibaren tutuyor; 80'de +%1,83 / +%1,57,
   t=+4,26. Sistem 74'te (15m/30m botlar 68'de) çalışıyordu.

Uygulananlar: `breakeven_r` 2,5→1,0; `min_score` 74→80 (15m/30m: 68→80); `max_hold_hours`
168→72; `stop_atr_multiple` 2,0'da bırakıldı (ızgarada plato merkezi orası). `trades` tablosuna
`strategy_version_id` eklendi ve ardışık zarar sayacı sürümle sınırlandı — eski kuralın 9 kaybı
yeni kuralı ilk barında 6 saat duraklatmıştı. Her ayar, türetildiği ölçümle birlikte kodda
belgelendi; testler sabit sayı yerine ayarın kendisine bağlandı ki bir sonraki değişiklik
merdiveni yine sessizce kapatmasın.

**Bilinçli olarak yapılmadı:**
- Aile ağırlıkları **değiştirilmedi.** Aile IC'leri 15 günlük pencerelerde işaret değiştiriyor
  (trend −0,066 → +0,080 → +0,156); birleşik örnekte tutarlı görünmelerinin sebebi tek bir
  pencerenin örneğin üçte ikisini taşımasıydı. Dengeli örnek birikmeden ağırlığa dokunulmayacak.
- Stopsuz tutma ölçümde en iyisi (+%3,15) ama **uygulanmadı**; tek bir delist ya da −%60'lık
  gün hesabı siler. Ölçüm stopun bir maliyet olduğunu değil, sinyalin ufkuna göre fazla dar
  olduğunu söylüyor.
- Kapı 82 daha yüksek ortalama veriyor (+%2,58) ama günde 2,8 girişle 5 pozisyonluk defter
  boş kalır; 80'de günde 5,5 giriş var.
- 15m/30m botlarda 80 bir **dışarı taşımadır** — ölçüm 1 saatlik karar barında yapıldı.

**Kabul kriteri:** ✅ 430 test yeşil; `ruff` temiz. Ölçümler `scores` (60 gün, 1096 bar) ve
`score_observations` (54.569 satır) üzerinden yeniden üretilebilir. Ayarların ölçülen etkisi
işlem başına +%0,44 → +%1,70 (kapı 74→80, sabit çıkış kuralları).

**Açık kalan:** Kenar iki aylık **düşen** bir piyasada ölçüldü — havuzun eşit ağırlıklı getirisi
yıllık −%28. Yükselen bir rejimde aynı kapının aynı şeyi yapacağı doğrulanmadı. 15m/30m botların
kendi kalibrasyonu birikmedi. Aile ağırlıkları hâlâ başlangıç hipotezi.

---


## [Bakım] Zaman dilimi sızıntıları, strateji ayarı ve ölçülebilir kalibrasyon — 2026-08-18

### Beş kusur — dördü sessizdi

**1. 15m/30m botlar hiç işlem açamıyordu.** `_build_context` fiyat/stop/ATR
sözlüklerini `b.indicators.get("1h")` ile dolduruyordu. Hattı dilim-farkındalı
yaptıktan sonra 15m botta `indicators` anahtarları `("15m","4h","1d")` oldu, yani
`"1h"` yok: döngü `continue` ediyor ve **üç sözlük de boş kalıyordu**. Aday
bulunmasına rağmen tek giriş bile açılmıyordu.

**2. O kusuru gizleyen sessiz `continue`.** `_consider_entries` içinde stop ya da
fiyat yoksa aday hiçbir iz bırakmadan atlanıyordu. Artık sebebi yazıyor
(`giriş atlandı: stop hesaplanamadı`). Kusuru bulmanın bu kadar uzun sürmesinin
sebebi bu satırdı.

**3. 30m bot çöküyordu.** `_open_position` puan kaydını `(sembol, bar, ayar)`
üçlüsüyle arıyordu; oysa `scores` tablosunun kimliği **dörtlü** ve dilim de
dahil. Aynı puanlama ayarıyla çalışan 15m ve 30m botlar 16:00 gibi ortak bir
barda çakışıyor, sorgu iki satır döndürüyor ve `MultipleResultsFound` ile worker
düşüyordu.

**4. Volatilite yıllıklandırması 30m'de √2 kat yanlıştı.** `BARS_PER_YEAR`
sözlüğü elle yazılmıştı ve 30m eklendiğinde bayat kaldı; `.get(tf, 8760)`
sessizce 1h değerini döndürüyordu. Aynı kusur `backtest/metrics.py`'de de vardı
(Sharpe) ve `sr.py`'de günlük bar sayısında (hacim profili penceresi yarı yarıya
yanlış). Üçü de artık `TIMEFRAME_MINUTES`'ten **türetiliyor** — elle yazılmadığı
için yeni bir dilim eklendiğinde bayat kalamaz. Mevcut dilimlerin değerleri
birebir korundu.

**5. Açılış dolgusu yalnızca 2 dilimi kapsıyordu.** `--backfill-days` yolu
`("1h","1d")` sabitini kullanıyordu; servis 5 dilim akıtıyor. Artık servisin
kendi listesini okuyor.

### Strateji ayarı — canlı 50 işlemin söylediği

Ölçüm: brüt **+52,83**, komisyon **74,19**, net **−21,36**. İşlem başına brüt
kenar +1,06, komisyon 1,48 — kenar gerçek ama maliyetin altında. Çıkış dağılımı
sebebi gösterdi: 23 stop, toplam −310,54; ortalama kayıp 13,50, ortalama kazanç
11,23; kazananlar 19,6 saat, kaybedenler 9,9 saat tutuluyor.

Suçlu `stop_atr_multiple: 0.5` — yarım ATR normal fiyat gürültüsünün içinde
kalıyor. En büyük tek kazanç 48 saatlik tavana dayanıp kesilmişti.

| Parametre | Önce | Sonra | Gerekçe |
|---|---|---|---|
| `stop_atr_multiple` | 0,5 | **2,0** | gürültü stoplarını kes |
| `trail_atr` | 2,5 | **3,5** | kazananları yaşat |
| `breakeven_r` | 1,5 | **2,5** | erken öldürmeyi bırak |
| `max_hold_hours` | 48 | **168** | tavan en büyük kazancı kesmişti |
| `min_score` (1h) | 70 | **74** | daha az, daha iyi işlem |
| `min_score` (15m/30m) | 70 | **68** | hiç işlem açmamışlardı |
| `risk_pct` | %1 | **%2** | kullanıcı riski açıkça istedi |
| `rotation.min_score_gap` | 10 | **15** | devir maliyetini azalt |

**Risk limitleri de ölçeklendi.** `risk_pct` %2 iken tek tam kayıp −%2 demek;
günlük limit −%4 kalsaydı **iki kayıpta** bot günün kalanında bloke olurdu ve
agresiflik devre kesici tarafından sessizce boğulurdu. Yeni değerler: günlük
−%8, haftalık −%15, azami düşüş −%25, üst üste 8 zarar.

### Kalibrasyon ölçülebilir hâle getirildi

`scores` tablosu yalnızca canlı çalışmanın başladığı andan doluydu, yani
sistemin varlık nedeni olan soru **tek günlük** bir kesitle cevaplanıyordu
(n=1580, `span_days=0`). Tek günün kesitine bakıp ağırlık değiştirmek aynı
veride arama yapmaktır.

`sarnic score-backfill` eklendi: geçmiş barları yürüyüp puanları yazar, ardından
`sarnic observations` ileri getirileri hesaplar. Ayrı bir puanlama kodu yok —
`BacktestEngine`'in kendi veri yükleme, `cuts` ve bundle üretim yolları
kullanılıyor (bozulmaz kural 1), dolayısıyla üretilen puanlar canlı botun
ürettiğiyle aynı kodun çıktısı.

**İlk okuma (tek günlük, henüz karar değil):** sıra korelasyonu +0,138, üst−alt
dilim +%2,08 — pozitif ama monoton değil. Aile bazında öngücü: trend +0,109,
momentum +0,106, akış +0,057, **volatilite −0,062, s/r −0,071**. İki aile negatif
görünüyor; ağırlıkları 60 günlük gözlem birikince **ölçüye dayanarak**
değerlendirilecek, bugünkü kesitle değil.

### Diğer

API erişim kaydı kapatıldı (`SARNIC_ACCESS_LOG=1` ile açılır): log 2 dakikada
~770 satırdan 1'e indi. Backtest artık ayrı süreçte (önceki girişteki düzeltme)
ve altı varyantlık deney, canlı veri kararı vermeye yettiği için elle
durduruldu — bar başına ~94 ms maliyetle 2 aylık pencere saatler sürüyor.

**Bilinçli olarak yapılmadı:** aile ağırlıkları değiştirilmedi (gözlem birikimi
bekleniyor). 1d verisi havuzun 61/88'inde 300 bardan az — bunlar genç coinler,
doldurulacak veri yok.

**Kabul kriteri:** ✅ 425 test geçiyor · beş bot `PAPER_RUNNING` (1h×3, 15m, 30m)
· 15m ve 30m botlar gerçekten kendi barlarında puanlıyor ve pozisyon açıyor ·
30 dakikada sıfır uyarı, sıfır çökme.

---

## [Bakım] `!ticker@arr` kök nedeni bulundu — 2026-08-18

**Bulgu.** Binance `!ticker@arr` aboneliğini kabul ediyor, bağlantı kuruluyor
ve **tek bir mesaj bile göndermiyor.** Ölçüm: `stream.binance.com:9443`,
`stream.binance.com:443` ve `data-stream.binance.vision` uçlarının üçünde de 25
saniyede 0 mesaj. Aynı davranış `!bookTicker`'da da var — ikisi de en ağır
tüm-piyasa akışları.

Kontrol olarak aynı bağlantı biçimiyle denenen `btcusdt@ticker` (11 mesaj),
`btcusdt@miniTicker` (10) ve tüm piyasa `!miniTicker@arr` (11) sorunsuz
çalışıyor. Yani sorun ağda, portta, kodda ya da yükün ayrıştırılmasında değil:
Binance o iki akışı bu istemciye servis etmiyor.

**Çözüm.** Akış `!miniTicker@arr`'a çevrildi. Yükünde yüzde değişim alanı (`P`)
yoktur; açılış (`o`) ve kapanıştan (`c`) hesaplanıyor. Ayrıştırıcı iki yükü de
okuyor, yani `!ticker@arr` bir gün geri gelirse kod hazır.

**Periyodik REST tazelemesi korundu ve gerekçesi değişti.** `miniTicker` her
saniye yalnızca **o saniyede işlem gören** sembolleri gönderir, hepsini birden
değil. Hiç işlem görmeyen bir sembol aksi hâlde Redis'te hiç oluşmaz ve havuz
adaylarından sessizce düşerdi. Bu yüzden 15 dakikada bir tam anlık görüntü
alınıyor.

**Ölçülen kazanç.** REST `ticker/24hr` çağrısı dakikada birden 15 dakikada bire
indi: ağırlık tüketimi dakikada 80 → ~5 (günde 115.200 → 7.680). Yedek uyarısı
(`ticker_fallback_active`) artık hiç çıkmıyor.

**Doğrulama.** BTCUSDT fiyatı ve hesaplanan yüzde değişimi canlı sistemde 12
saniyelik aralıklarla güncelleniyor (64.136,39 → 64.142,96 → 64.188,00;
%1,28 → %1,35). 421 test geçiyor.

---

## [Bakım] Kesinti, karar dilimi ve sertleştirme — 2026-08-18

**Kesinti: panel açılmıyordu.** Kök neden bir backtest'ti. `create_backtest`
koşuyu `asyncio.create_task` ile **API'nin kendi olay döngüsünde** başlatıyordu;
motor CPU-bağımlı ve senkron olduğu için bir barı işlerken döngüye dönmüyor.
2853 bar × 83 sembolluk bir koşu API'yi 34 dakika boyunca %99,6 CPU'da tuttu,
her istek asılı kaldı ve kimse giriş yapamadı. Kodun kendi yorumu bunu "v1'de
tek makine, tek koşu" diye kabul ediyordu; bedeli servisin tamamen durması
olduğu için kabul edilemez.

Koşu artık ayrı bir işletim sistemi sürecinde (`sarnic backtest-run <id>`,
gövdesi `backtest/runner.py`). API yalnızca süreci başlatıp döner. Doğrulandı:
koşu sürerken 12/12 sağlık kontrolü başarılı, hiçbiri 2 sn'den yavaş değil.
Ayrıca aynı anda ikinci koşu 409 ile reddediliyor.

**Karar zaman dilimi artık gerçekten uygulanıyor.** Worker botun dilimine göre
uyanıyordu (`last_closed_bar(now, timeframe)`) ama özellik hattına dilimi
geçmiyordu: `DECISION_TF` modül sabitiydi ve hat her zaman 1h okuyordu. Panelde
15m seçilebiliyordu ama seçilen bot 15 dakikada bir uyanıp **aynı 1h barını**
yeniden puanlıyordu — yeni bilgi olmadan daha sık işlem.

`load_bundles`, `build_bundle*`, `build_features` ve backtest motoru artık
karar dilimini parametre alıyor. Göstergeler zaten dilim-farkındaydı
(`per_hour` haritası 24 saati 15m'de 96 bara çeviriyor), bu yüzden değişiklik
hattın kendisiyle sınırlı kaldı.

**Bağlam dilimleri (4h + 1d) bilinçli olarak sabit bırakıldı.** Onlar piyasa
rejimini anlatır ve bu, ne sıklıkla karar verdiğinle değişmez. Bağlamı karar
dilimine göre kaydırmak `trend_4h` özelliğinin adını yalancı yapardı: 15m botta
içinde 1h trendi taşıyan bir alan `trend_4h` diye anılırdı. Varsayılan 1h
olduğu için mevcut botların davranışı **birebir** korundu (test:
`test_default_behaviour_unchanged_for_1h`).

**30m dilimi eklendi** (enum, dakika haritası, gösterge dönüşümü, WS akışı).
Strateji doğrulaması artık dilim listesini elle tutmuyor, `TIMEFRAME_MINUTES`
üzerinden okuyor — enum'a eklenip doğrulamada unutulan dilim 422 veriyordu.

**Emir defteri havuzun tamamını kapsıyor.** Sınır 40'tı, havuz 82'ye çıkınca
yarısından fazlası defterden yoksun kaldı ve bot o sembollere giriş
denediğinde kağıt motoru `emir defteri yok` diyerek reddediyordu. Sınır 150'ye
çıkarıldı; trafiği dengelemek için derinlik akışı `@100ms` yerine `@1000ms`
oldu — karar birimi 15 dakika ve üzeri olan bir sistemde saniyede on kez
tazelenen bir defterin karşılığı yok. Sonuç: derinlik akışı 40 → 87 sembol,
trafik yine de eskisinin altında.

**Giriş deneme sınırlaması eklendi.** Panel internete açıldı ve parola + 2FA
tek savunma hattı; ikisinde de sınırsız deneme yapılabiliyordu. TOTP altı hane
ve doğrulama jetonu beş dakika yaşıyor, yani parolayı ele geçirmiş biri o
pencerede kaba kuvvet uygulayabilirdi. Süreç içi sayaç: pencere 5 dakika, 8
deneme; başarılı giriş sayacı sıfırlar.

**Veri.** Havuz için 15m ve 30m geçmişi dolduruldu (601.344 bar, 45 gün) ve 1h/4h
tamamlandı. 30m'in arşiv ile canlı akış arasındaki ~10 saatlik boşluğu REST
kuyruğuyla kapatıldı. Havuzun 87 sembolünün tamamı 15m ve 30m'de ≥400 bara sahip.

**İki yeni bot** kuruldu ve beşi birlikte çalışıyor: 1h × 3, 15m × 1, 30m × 1,
her biri 5.000 USD ile. Karar barının gerçekten uygulandığı ölçüldü — 15m botu
`09:15` barını, 1h botları `08:00` barını puanladı.

**Bilinçli olarak yapılmadı:** `!ticker@arr` akışının kök nedeni (§8.4) hâlâ
araştırılmadı; REST yedeği dakikada bir, ağırlık 80 ile çalışıyor. API erişim
kaydı (uvicorn) susturulmadı — panel dışarı açık olduğu için kimin ne çektiğini
görmek değerli, ama uygulamanın kendi olaylarını boğuyor.

**Kabul kriteri:** ✅ 418 test geçiyor · beş bot `PAPER_RUNNING` · üç dilimde de
puanlama üretiliyor · backtest koşarken API yanıt veriyor · panel genel adresten
açılıyor.

---

## [Bakım] §5b veri kapsamı ve §4b kayıt kopyaları — 2026-08-17

**§5b — havuzu sınırlayan şey likidite değil veri kapsamıydı.**

`SYSTEM-REVIEW` §5b "ayrı bir süreçten dolgu yapmak bozulmaz kural 5'i bozar"
diyordu. İnceleyince ayrım çıktı: arşiv (`data.binance.vision`) **statik bir
CDN'dir ve ağırlık bütçesine tabi değildir**; ağırlık harcayan tek adım
`backfill()`'in sonundaki REST kuyruğudur. `archive_only=True` o adımı atlar
ve dolgu **sıfır ağırlıkla** çalışır — yani ayrı süreçten güvenle sürülebilir.

İddia varsayım bırakılmadı: dolgu sürerken sürecin açık soketleri incelendi,
yalnızca CloudFront (65.9.9.x) ve Postgres vardı; `api.binance.com`
(108.157.48.78) ile tek bağlantı yoktu. `tests/test_backfill.py` bunu sözleşme
hâline getiriyor ve koruma kaldırıldığında kırmızıya döndüğü doğrulandı.

Aday kümesinin (hacme göre ilk `volume_prefilter_n × 2` = 500 sembol) 1d
geçmişi dolduruldu: 126.870 bar, 395/500 sembolde veri bulundu.

| | Önce | Sonra |
|---|---|---|
| 15+ günlük barı olan sembol | 158 | 336 |
| VolatilityFilter'ın elediği | 74 (%55) | 43 (%34) |
| AgeFilter'ın elediği | 17 | 30 |
| Havuz | 58 | 82–84 |
| Puanlanan sembol | 58 | 81 |

Yaş filtresinin daha çok elemesi de bir düzelmedir: listelenme tarihi boş olan
semboller `age_days = 9999` sayılıp yaş filtresinden geçiyor, sonra volatilite
filtresine takılıyordu. Yanlış filtre eliyormuş; artık her filtre kendi işini
yapıyor.

**1h/4h de dolduruldu (havuz için).** 1d dolunca havuza giren 23 sembolün
21'inde hiç 1h verisi yoktu ve puanlama 400 bar 1h istiyor — o semboller
havuzda ~17 gün ölü duracaktı. 394.174 bar yazıldı; havuzun 82'sinin 81'i artık
1h/4h olarak yeterli. 1d'si kısa kalan 15 sembolde doldurulacak veri **yok**:
bar sayıları yaşlarına birebir eşit (61 bar / 60 gün), o geçmiş var olmuyor.

**§4b — aynı açık bulgu iki kez yazılmıyor.**

Ölçüm: 250 aykırı değer satırı yalnızca 23 gerçek bulguyu temsil ediyordu; biri
40, biri 32 kez yazılmıştı. Migrasyon `0003_kalite_bulgusu_tekil`: bulgunun
değişmeyen kimliği (`fingerprint`) + **kısmi** benzersiz indeks (yalnızca
`resolved = false`). Kısmi olması gerekiyordu, çünkü kapanan bir boşluk yeniden
oluşursa bu yeni bir olaydır ve yazılmalıdır; aykırı değer ise hiç kapanmadığı
için sonsuza dek tekilleşir.

Kimlik tüm `detail` sözlüğü olamaz: kuyruk boşluğunun `end` ve `missing_bars`
alanları her denetimde ilerler, yani aynı durma her saat yeni bir kimlik
üretirdi — engellenmek istenen şeyin ta kendisi. Bu yüzden tür başına sabit
alan seçildi (`open_time`, `start`).

Sonuç: açık bulgu 450 → **94**, toplam 848 → 492. Denetim turu artık ~31 satır
yerine gerçekten yeni olan 2 satır yazıyor (canlıda doğrulandı, `duplicates=0`).

**Yan düzeltme — log gürültüsü.** `httpx` her isteği INFO'da logluyordu:
ölçüldüğünde marketdata journalinin **%55'i** `HTTP Request: GET …` satırıydı.
`configure_logging` artık HTTP istemci loggerlarını WARNING'e çekiyor
(`LOG_LEVEL=DEBUG` ile geri açılır). Yeniden başlatma sonrası 0 satır. Gürültü
kalkınca altından gerçek bir uyarı çıktı: `ticker_fallback_active`.

**Bilinçli olarak yapılmadı:** `!ticker@arr` akışının kök nedeni (§8.4)
araştırılmadı — REST yedeği dakikada bir, ağırlık 80 ile çalışmaya devam
ediyor. Derinlik akışının 40 sembol sınırı büyütülmedi (aşağıya bakın).

**Kabul kriteri:** ✅ 413 test geçiyor · migrasyon canlı veritabanında uygulandı
· saatlik denetim yeniden başlatma sonrası hatasız koştu · havuz büyümesi
puanlamaya yansıdı (81 sembol).

**Açık kalan — bu turun yarattığı:** derinlik akışı `_book_selection(limit=40)`
ile sınırlı, havuz ise 82. Havuzun yarısından fazlasında emir defteri yok ve
bot oraya giriş denerse `paper_rejected: emir defteri yok` alıyor (12 saatte 5
kez, 3 sembol). Havuz büyüdükçe artacak. İki seçenek: sınırı yükseltmek
(bant genişliği/CPU bedeli) ya da defter listesini hacim sırası yerine **puana**
göre seçmek — girişleri belirleyen ölçüt zaten puandır, dolayısıyla 40 sembol
doğru seçilirse yetebilir.

---

## [Arayüz] Panel sıfırdan yeniden yazıldı — 2026-08-17

**Yapıldı:** Kullanıcı talebiyle panelin tamamı **sıfırdan** kuruldu.
`src/app/(panel)/**` (18 sayfa), `src/components/**` ve `src/app/globals.css`
silinip yeniden yazıldı. `src/ui/` (HashUI kiti), `lib/api.ts`, `lib/ws.tsx`,
`lib/auth.tsx` korundu ve yeni token katmanıyla yeniden temalandırıldı.

**Görsel dil.** Binance'in veri yoğunluğu + OKX'in nötr yüzeyleri. **Açık ve
koyu tema artık eşit vatandaş**: varsayılan `dark` değil `system` oldu
(`ui/theme.tsx` ve `app/layout.tsx` birlikte). Her sayfa iki temada da
denendi.

**Üç yeni altyapı dosyası** — talebin merkezi burası:
- `lib/glossary.ts` — 70+ SARNIÇ kavramının açıklaması (havuz, puan aileleri,
  huni, kalibrasyon, R, devre kesiciler, kilitli dönem…). Sayfalar metni kendi
  içlerinde tutmuyor, hepsi buradan besleniyor.
- `lib/humanize.ts` — motorun makine kodlarını (`universe_input_unavailable`,
  `paper_rejected`) ve ham JSON yüklerini Türkçe cümleye çeviriyor. Karşılığı
  olmayan kod uydurulmuyor, okunur hâle getirilip olduğu gibi gösteriliyor.
- `components/common/explain.tsx` — dört seviye açıklama: satır içi terim,
  başlık yanındaki (i), kart içi paragraf ve her sayfanın başındaki
  "ne gösteriyor / nasıl okunur / ne yapabilirim" bloğu.

**Log sayfası** `Yönetim`den `İzleme`ye taşındı ve ana gözlem yüzeyi oldu.
Bot, puanlama ve havuz olayları tek akışta, kategori ve önem süzgeçleriyle,
okunur cümlelerle. Satıra tıklayınca ne olduğu / ne anlama geldiği / ne
yapılması gerektiği ve ham JSON yerine etiketli alanlar açılıyor.

**Bildirimler** aynı çeviriden geçiyor; `{"breaker": "STALE_DATA"}` yerine
"Devre kesici: Bayat veri" ve altında ne yapılacağı yazıyor.

**Yol boyunca bulunan dört gerçek kusur** (üçü sessizdi):
1. Eski log sayfası `/logs` yanıtından `at`, `symbol`, `message` okuyordu; uç
   bu alanları hiç döndürmüyor (`created_at`, `kind`, `payload` döndürüyor).
   Zaman ve mesaj sütunları boş basılıyordu — "loglar okunmuyor" şikâyetinin
   kökü buydu.
2. Panel `/portfolio/equity`'yi dizi sanıyordu; uç `{bots, total}` döndürüyor.
   Botların özsermaye eğrisi **sessizce çizilmiyordu**, grafikte yalnızca kıyas
   görünüyordu. `PortfolioEquity` tipi eklendi.
3. `/positions` parametresi `status` değil `status_filter`. Gönderilen değer
   yok sayılıyordu; varsayılan zaten "OPEN" olduğu için tesadüfen çalışıyordu.
4. Eğri grafiklerinin Y ekseni sıfırdan başlıyordu; 100 tabanına endekslenmiş
   bir özsermaye eğrisinde %1–2'lik gerçek hareket düz çizgiye dönüşüyordu.

**Grafik paleti ölçülerek seçildi, göz kararıyla değil.** Beş puan ailesinin
renkleri parlaklık bandı, kroma tabanı, renk körlüğü ayrımı ve zemin
kontrastı kontrollerinden açık ve koyu temada ayrı ayrı geçirildi. İlk aday
(`#8b5cf6` ↔ `#1f6fd0`) normal görüşte ΔE 14,2 ile sınırın altında kaldığı
için elendi. Yeşil ve kırmızı palete alınmadı — o iki renk yön için rezerve.

**Bilinçli olarak yapılmadı:** Motor tarafına dokunulmadı; bu tur yalnızca
arayüz. `SYSTEM-REVIEW` §3/§4/§4b/§5/§5b ve Faz 11'in ölçüm katmanı (Prometheus,
Sentry, yedek provası) açık bırakıldı. Playwright E2E paketi yazılmadı —
doğrulama bu turda elle sürülen tarayıcı oturumuyla yapıldı; Faz 7/8'in kabul
kriteri hâlâ kırmızı.

**Kabul kriteri:** ✅ `tsc --noEmit` temiz · `eslint --max-warnings 0` temiz ·
`next build` 21 rota derliyor · tüm sayfalar canlı sistemde açık ve koyu temada
gerçek veriyle açıldı, tarayıcı konsolu iki temada da hatasız.

**Açık kalan:** E2E ve görsel regresyon testleri; motor tarafındaki
`SYSTEM-REVIEW` maddeleri; Faz 11 gözlem katmanı.

---

## [Bakım] Donmuş zaman dilimleri onarıldı — 2026-08-17

**Yapıldı:** `SYSTEM-REVIEW` §2'nin A seçeneği kullanıcı kararıyla uygulandı:
`MarketDataService.timeframes` artık `["15m", "1h", "4h", "1d"]`. Kline akışı
244 → 248 akışa çıktı (62 sembol × 4 dilim); WS ağırlık tüketmediği için
bozulmaz kural 5 açısından bedel yok.

**Uygulama sırasında iki şey daha çıktı ve ikisi de düzeltmenin kendisi kadar
önemliydi.**

**1. Denetimi genişletmek tek başına yetmezdi.** `audit_frame` yalnızca
çerçevenin **içindeki** boşlukları görüyor: `find_gaps` ardışık iki barın
farkına bakıyor. Bir akış tamamen durduğunda çerçevede iç boşluk oluşmaz,
çerçeve sadece kısa kalır — denetim "temiz" der. 4h/1d denetime eklenseydi bile
donma görünmeyecekti. `find_trailing_gap` eklendi: son kayıtlı bar ile kapanmış
olması gereken son bar arasına bakıyor, tolerans `STALE_AFTER_BARS = 2` bar
(dilim başına ölçekleniyor: 1h'de 2 saat, 1d'de 2 gün). Kuyruk boşluğu **normal
bir boşluk olarak** raporlanıyor, dolayısıyla mevcut `repair_gaps` onu REST ile
dolduruyor. Bu, geçmiş boşluğu için ayrı bir backfill komutunu gereksiz kıldı —
onarım servisin **içinden** gidiyor, yani kural 5 korunuyor.

**2. Referans sembol hiç izlenmiyordu.** Tespiti gerçek veride denerken çıktı:
BTCUSDT'nin yalnızca 1d'si değil **1h'si de** 10 bar geride. Sebep, BTC'nin
havuzda olmaması — havuzun volatilite filtresi onu düzenli olarak eliyor, çünkü
BTC çoğu zaman alt volatilite eşiğinin altında kalır. Elenen sembol izlenmiyor,
izlenmeyen sembolün hiçbir dilimi akmıyor. Yani 4h/1d akışını açmak, bu
düzeltmenin **en önemli tüketicisini** kurtarmıyordu: rejim çarpanı (§6.2 adım
5) bir risk kontrolüdür ve üç günlük fiyatla karar veriyordu.

BTC bir işlem adayı değil, bir **ölçü aletidir**. `settings.reference_symbol`
eklendi ve izlenen kümeye açık pozisyonlarla aynı gerekçeyle katılıyor
(`_tracked_set`). `_btc_regime` sabit `"BTCUSDT"` yerine bu ayarı okuyor ve son
bar iki günden eskiyse `regime_reference_stale` uyarısı basıyor — hesap yine
yapılıyor ama artık sessiz değil.

**Bilinçli olarak yapılmadı:**

- **Ayrı bir `backfill` süreci çalıştırılmadı.** İkinci bir süreç Binance'e
  giderken kendi hız sınırlayıcısını taşır ve iki çıkış noktası doğar (bozulmaz
  kural 5). Kuyruk boşluğu artık saatlik denetimin işi; onarım tek merkezden
  gidiyor. Bedeli: boşluk hemen değil, bir sonraki denetimde kapanıyor.
- **Referans sembol derinlik akışına eklenmedi.** Rejim yalnızca kline istiyor;
  40 sembollük defter sınırından bir yer harcamanın karşılığı yok. Referans
  sembolde pozisyon açılırsa açık-pozisyon kuralı onu zaten ekliyor.
- **Önem eşiği (24 bar → ERROR) değiştirilmedi.** Bu eşik 1h için ayarlanmış;
  1d'de 24 bar 24 gün demek, yani üç günlük bir donma "WARN" kalıyor. Test
  içinde işaretlendi. Eşiği dilime göre ölçeklemek ayrı bir karar.
- **Continuous aggregate'ler yine devreye alınmadı** (`SYSTEM-REVIEW` §3). Artık
  1d/4h akıştan geldiği için ihtiyaç kalmadı; ama boş ve okunmayan üç görünüm
  şemada durmaya devam ediyor ve yanıltıcı.

**Kabul kriteri:** ✅ — nasıl doğrulandı:

- **248 kline akışı bağlandı**, izlenen sembol 62 (61 havuz + referans).
- **Tespit gerçek veride doğrulandı:** BTC/ETH/SOL için 1h'de 10 bar, 4h'de
  15 bar, 1d'de 2 bar kuyruk boşluğu raporlandı — düzeltmeden önce bu üç dilim
  "temiz" görünüyordu.
- **405 test yeşil** (398 + 7 yeni: 5 kuyruk boşluğu, 2 referans sembol).
  `ruff check` + `ruff format --check` temiz.
- Beş servis `active`, API `/health` ok, panel HTTP 200.

**Açık kalan:** Kuyruk boşluklarının REST ile gerçekten dolduğu, saat başı
denetiminde (`:02`) doğrulanacak. Puanlama en az bir tam gün taze 4h/1d ile
beslenmeden Faz 0a'nın sıradaki denemesine başlanmamalı — aksi hâlde deneme
yarısı bayat girdiyle hesaplanır.

---

## [Bakım] Sistem incelemesi — 2026-08-17

**Yapıldı:** Kesinti kurtarmasının ardından sistem 11 saat gözetimsiz çalıştı ve
o koşunun logları, canlı veritabanı ve ilgili kod yolları baştan sona tarandı.
Bulgular ölçümleriyle `docs/SYSTEM-REVIEW.md`'de. Bu tur **bir** kusur
düzeltildi; geri kalan maddeler bilinçli olarak **uygulanmadı** (aşağıya bakın).

**Bulunan ve düzeltilen kusur — risk devre kesicisi hiç çalışmamış.** Gece
loglarında üç `decision_loop_error` vardı, üç botta da aynı satır:
`_check_risk` hem `level=trip.level` geçiyor hem `**trip.as_dict()` açıyordu ve
`as_dict()` zaten `level` taşıyor → `TypeError`. Yani **bir kesici tetiklendiği
anda karar barı çöküyordu** ve kesicinin altındaki hiçbir satır çalışmıyordu:
giriş yasağı, `DEGRADED`'e geçiş, `STOPPED`, kill switch. Tetikleyen kesici
`STALE_DATA`'ydı — piyasa verisi servisi her yeniden başladığında heartbeat kısa
süre bayat kalıyor, yani bu nadir değil **rutin** bir yol. Faz 4 kabul kriteri
testlerde geçiyordu çünkü testler `RiskEngine`'i saf fonksiyon olarak sınıyordu;
kararı **uygulayan** katman sınanmamıştı. İki test eklendi, ikincisi
`_check_risk`'i gerçekten çağırıyor.

**En yüksek öncelikli bulgu (düzeltilmedi): 1d ve 4h verisi 15 Ağustos'tan beri
donmuş.** Son 26 saatte bu iki dilimde **tek bar gelmemiş**. Sebep,
`MarketDataService` yalnızca `["15m", "1h"]` akışını dinliyor; 1d/4h sadece tek
seferlik backfill ile yazılıyor. Etkisi üç yerde ve üçü de sessiz: havuzun
volatilite + aralık filtreleri (son hunide 130 adaydan 73'ünü eleyen filtre),
BTC rejim çarpanı (bir **risk kontrolü**, 3 gün gecikmeli 1d verisi okuyor) ve
puanlamanın `trend_4h` / `trend_1d` özellikleri. Görünmemesinin sebebi: saatlik
veri kalitesi denetimi yalnızca karar zaman dilimini denetliyor, yani panel
"0 bulgu" diyerek donmayı gizliyor.

**Bilinçli olarak yapılmadı:**

- ~~1d/4h akışı bağlanmadı.~~ **Kullanıcı kararıyla aynı gün uygulandı — aşağıya
  bakın.**
- **Continuous aggregate'ler ne devreye alındı ne düşürüldü.** Üçü de boş
  (0 satır), yenileme işi yok, hiçbir okuyucu kullanmıyor. Şemayı okuyan birine
  "1d aggregate'ten geliyor" izlenimi veriyor; vermiyor.
- **`top_n = 100` değiştirilmedi.** Gerçekleşen havuz 44–65 bandında; hedef
  ulaşılamaz olduğu için "havuz eksik" durumu kalıcı. Bu bir parametre kararıdır.
- **Havuzdan çıkmış sembollerin kalite bulguları kapatılmadı** (31 açık kayıt,
  19 sembol, hiçbiri güncel havuzda). Kapatmak mı "artık izlenmiyor" demek mi —
  ikisi farklı şey söyler, uydurulmadı.
- **Prometheus/Grafana/Sentry kurulmadı, Playwright testi yazılmadı.** Faz 11'in
  işi. Ama bu turun beş kusuru da **logları elle okuyarak** bulundu; bir toplayıcı
  olsaydı 22:05'teki üç `decision_loop_error` gözle görülür bir alarm üretirdi.
- **Faz 0a'nın eleyici hipotezi denenmedi.** Gerekçe teknik: §2'deki donmuş
  veri puanlamanın bir kısmını bozuk besliyor. O düzelmeden yapılacak deneme
  bayat girdiyle yapılmış olur ve deneme defterinde bir satır boşa gider.

**Kabul kriteri:** ✅ — nasıl doğrulandı:

- **11 saat, beş servis, `NRestarts = 0`.** Hiçbiri çökmedi. Postgres ve Redis
  11 saat `healthy`. RAM 3,7/7,7 GB, takas 0, disk 17/108 GB.
- Gece boyunca 13 işlem kapandı, 2.917 yeni bar yazıldı, 949 puanlama üretildi,
  00:05'te planlı havuz yenilemesi çalıştı.
- **Bu turun üç düzeltmesi canlıda doğrulandı:** yeniden deneme havuzu
  57 → 61'e çıkardı (eski kapıyla yarın 00:05'e kadar hiç denenmeyecekti);
  `universe_unchanged` logu değişiklik yokken snapshot yazılmadığını gösteriyor;
  risk düzeltmesinin testi, düzeltme geri alındığında kırmızıya dönüyor.
- **398 test yeşil**, `ruff check` + `ruff format --check` temiz.
- Loglar journald'da ve journald kalıcı — yeniden başlatmada kaybolmuyor.

**Açık kalan:** `docs/SYSTEM-REVIEW.md` sekiz başlık ve önerilen bir sıra
bırakıyor. Sıranın başı §2 (1d/4h verisi), çünkü hem bir risk kontrolünü hem
puanlamayı besliyor ve Faz 0a'nın sıradaki denemesi ona bağlı.

---

## [Bakım] Elektrik kesintisinden kurtarma — 2026-08-16

**Yapıldı:** Elektrik 21:37 UTC'de gitti. Makine geri geldiğinde **hiçbir şey
ayağa kalkmamıştı**: docker servisi `disabled`, systemd kullanıcı unit dosyaları
diskte yok (`~/.config/systemd/user` dizini bile yoktu) — oysa 15 Ağustos girişi
"tüm servisler systemd altında `Restart=always`" diyordu. Yığın elle kaldırıldı,
unit dosyaları yeniden yazıldı (`sarnic-{api,marketdata,supervisor,notifier,web}`,
hepsi deponun kendi `scripts/run-once.sh`'ini çağırıyor) ve docker açılışa
bağlandı (`systemctl enable docker`) ki bir dahaki kesintide veritabanı ve Redis
kendiliğinden gelsin.

**Veri kaybı yok:** 580.891 bar, 3.681 sembol, 22 havuz snapshot'ı, 13 açık
pozisyon yerinde. Kesintide yazılan hiçbir dosya bozulmamış (388 test aynen
geçiyor). Kayıp yalnızca `/tmp`'deki servis logları.

**Kurtarma sırasında üç kusur bulundu — üçü de yalnızca yeniden başlatmada
görünüyor**, yani sistem 15 Ağustos'tan beri sessizce bu hâldeymiş. Ayrıntı:
`docs/OPEN-QUESTIONS.md` §10.

1. **Boş havuz snapshot'ı** (§10.1). Süpervizör, piyasa verisi servisi Redis'e
   ilk ticker'ı yazmadan 2 saniye önce havuzu yeniledi; aday listesi boştu ve
   motor bunu geçerli bir sonuç sayıp yazdı — canlı havuz 65 → 0, ve o saate ait
   point-in-time kayıt "havuz boştu" demeye başladı. Ticker yokluğu bir piyasa
   gözlemi değil, bir veri kesintisidir. `refresh` artık `UniverseInputUnavailable`
   yükseltip **snapshot yazmadan** iptal ediyor.
2. **Boş havuz yeniden denenmiyordu** (§10.2). `improving = size != last_size`
   kapısı boş havuzda hep `False` üretiyordu; havuz bir kez boşalınca planlı
   yenilemeye kadar (≈2 saat) hiç denenmiyordu. Kodun kendi docstring'i "boş bir
   havuz geçerli bir son durum değildir" diyordu, kapı bunu uygulamıyordu.
3. **Açık pozisyonlar kapatılamıyordu** (§10.3) — turun en ciddi bulgusu.
   **Stop tetiklense bile çıkış emri dolamıyordu**, iki bağımsız sebeple:
   (a) derinlik akışı havuzun ilk 40 sembolüyle sınırlı ve liste havuz sırasından
   kesiliyor; açık pozisyonlar hiç dahil edilmiyordu — `set_book_symbols`'ün kendi
   docstring'i "açık pozisyon ve aday coinler" dediği hâlde çağıran taraf onları
   geçirmiyordu. (b) `PaperAdapter` bakiyeyi `bot.cash`'ten kurtarıyor ama
   `_positions` defterini kurtarmıyordu; defter boş olduğu için her satış
   "yetersiz pozisyon" ile reddediliyordu. Faz 5'in "`kill -9` sonrası açık
   pozisyonlar kurtarılır" kriteri yarım sağlanıyormuş: bot satırları
   kurtarılıyordu, yürütme katmanı kurtarılmıyordu.

**Bilinçli olarak yapılmadı:**

- **#24 ve #25 silinmedi.** Kullanıcı kararıyla yalnızca **#23 silindi** —
  girdi yokken yazıldığı için havuzun boş olduğunu yanlış söylüyordu. #24–25
  zincirin gerçekten her adayı elediği anlardır ve huni nedeni kaydediyor:
  yanlış değiller, sadece sistemin çalışmadığı bir aralığı gösteriyorlar.
  Silme işlemi `OPEN-QUESTIONS` §10.1'e yazıldı; snapshot numaralarındaki
  22 → 24 atlaması orada açıklanıyor.
- **Ardışık boş snapshot bastırması eklenmedi.** Havuz boşken her 3 dakikada bir
  aynı boş snapshot yazılır. Gürültü ile "ne zaman denendi" bilgisi arasında bir
  tercih var; uydurulmadı (bozulmaz kural 7).
- **Süpervizörün yeniden deneme kapısına test yazılmadı** — döngünün içinde satır
  içi bir koşul; test için döngüyü parçalamak gerekirdi. Canlıda doğrulandı.
- **Spread eşiği gevşetilmedi.** Havuz, örnekler olgunlaşana kadar (~1 saat)
  hedefin altında kalıyor. Eşiği düşürmek havuzu hızlı doldururdu ama likidite
  garantisini zayıflatırdı — bekleme tercih edildi.
- Panel, TUI ve motorun geri kalanına dokunulmadı.

**Kabul kriteri:** ✅ — nasıl doğrulandı:

- **Beş servis `active`**, API `/health` `{database: ok, redis: ok}`, panel
  HTTP 200, WebSocket akışı çalışıyor.
- **Çıkışlar gerçekten doluyor:** düzeltmeden sonra BOMEUSDT, CRCLBUSDT ve
  MUBUSDT satışları `paper_filled` ile kapandı (kayma 5,8–9,1 bps). Düzeltmeden
  önce aynı emirler "yetersiz pozisyon" ile reddediliyordu.
- **Havuz kendini toparladı:** 0 → 56 → 40 sembol; 22:03:56'daki yenileme eski
  kodla **hiç yapılmayacaktı**.
- **394 test** (388 + 6 yeni: 2 havuz snapshot koruması, 2 defter seçimi,
  2 adaptör kurtarma). `ruff check` ve `ruff format --check` temiz.
  Not: takım bir kez `test_costs_empty_without_trades` ile kırıldı — o koşu
  servisleri yeniden başlattığım ana denk geliyordu; sistem sakinken 394/394
  yeşil. İzole ve dosya bazında da geçiyor. Kararsız (flaky) sayılmalı.

**Açık kalan:**

1. Havuz hedefin altında (40/100); spread örnekleri biriktikçe büyüyecek,
   ~1 saat sonra kontrol edilmeli.
2. Kesinti penceresinde gecikmiş çıkışlar **gecikmiş fiyattan** doldu.
   Kayıtlarda normal çıkış gibi görünüyorlar; öyle değiller.
3. Bir önceki turun üç açık maddesi duruyor: Faz 0a'nın eleyici hipotezi, havuz
   eşikleri değişince huni kontrolü, Discord webhook'larının yeniden girilmesi.
4. **Depoda hâlâ tek bir commit yok.** Bu kesinti bir şey kaybettirmedi;
   bir sonrakinin kaybettirmemesi için bir sebep yok.

---

## [Arayüz] Kullanılabilirlik turu — 2026-08-16

**Yapıldı:** `docs/UI-BACKLOG.md`'deki beş başlık (A–E) baştan sona kapatıldı.
Görsel katman: butonlar küçültülüp köşelendi, font yumuşatma tamamlandı, menü
hover/focus dili yeniden kuruldu (kehribar artık yalnızca seçili öğenin rayı ve
ikonu — kehribar bu panelde **veri** rengidir), kart dolgusu 24px'e çıktı, iki
tonlu sayı tüm panele bağlandı. Tek bir `DataTable` yazıldı (sıralama, arama,
ayrık değer filtresi, kalıcı sütun seçici, sayfalama, satır tıklama) ve beş
sayfaya uygulandı; her satır sağdan açılan bir detay çekmecesine bağlandı.
Backtest sayfası bir forma değil bir **senaryo fabrikasına** çevrildi; İndikatörler
sayfasına strateji kurgu atölyesi eklendi (her alanın ne yaptığı ve yanlış
ayarlanırsa ne olacağı yanında yazılı); kalibrasyona pencere seçici, desil tablosu
ve aile IC zaman serisi geldi. Motor tarafında üç değişiklik yapıldı ve üçü de bir
hatanın karşılığı: `BacktestParams` saat dilimsiz tarihi UTC kabul ediyor,
`core/settings_store.py` eklendi ve `UniverseEngine.refresh` havuz eşiklerini artık
DB'den okuyor, `/settings` ucu varsayılan/kayıtlı/yürürlükteki üçlüsünü döndürüyor.
`scripts/open-terminal.sh` canlı akışı ayrı bir pencerede açıyor.

Yol boyunca bulunan ve düzeltilen sekiz gerçek hata: (1) backtest koşuları
`FAILED` oluyordu — panelin tarih kutusu saat dilimsiz damga üretiyor, OHLCV'nin
UTC farkındalı `open_time` sütunuyla karşılaştırılamıyordu; (2) panel `equity`
gönderiyor, API `initial_equity` bekliyordu, yani sermaye alanı hiç işe
yaramıyordu; (3) Entegrasyonlar sayfası `webhooks` yerine `channels` gönderdiği
için **hiçbir webhook kaydolmuyordu**; (4) aynı sayfanın kanal adları motorun
kullandıklarıyla (`islemler`, `havuz`, `alarm`, `sistem`) uyuşmuyordu; (5) Discord
test ucu zorunlu `channel` parametresi istiyor, düğme hep 422 alıyordu; (6) bot
detay sayfası `{stats, equity_curve}` yanıtını metrik sözlüğü sanıp bütün kutuları
"—" basıyor, olay kayıtlarında `at`/`detail` okuyordu ama alanlar
`created_at`/`payload`; (7) `read-all` POST ile çağrılıyordu, uç PATCH; (8)
`.amount-*` kuralları katmansız yazıldığı için Tailwind `utilities` katmanını
yeniyor ve `text-up`/`text-down` yön renklerini yutuyordu — kâr ile zarar aynı
mürekkeple basılıyordu. Ayrıca `Modal` zeminsizdi.

**Bilinçli olarak yapılmadı:**

- **Risk limitleri Ayarlar sayfasından düzenlenebilir yapılmadı.** Yerleri strateji
  tanımıdır (`definition.risk` → `RiskLimits`); ikinci bir yerden ezilebilmeleri bir
  botun hangi limitle çalıştığını belirsiz kılardı (bozulmaz kural 1). Sayfa bunu
  açıkça yazıyor ve İndikatörler → Strateji kur'a yönlendiriyor.
- Ayar grupları için migration ile şema tanımlanmadı; değer JSONB kalıyor ve şemayı
  tüketen dataclass biliyor. Yeni bir eşik eklemek migration gerektirmiyor.
- Otomatik açılış `.desktop` dosyası repoya kondu ama **kurulmadı**;
  `make terminal-autostart` ile kullanıcı kurar. Oturum davranışını sormadan
  değiştirmek doğru olmazdı.
- Playwright E2E ve görsel regresyon testleri hâlâ yok; yeni tablo ve çekmeceler
  elle doğrulandı, otomatik doğrulanmadı.
- `SimpleTable` kullanan sayfalar (Panel, Loglar, Kullanıcılar, bot detayı,
  İndikatörler) yeni `DataTable`'a geçirilmedi — kısa listelerde sıralama/sayfalama
  gereksiz ağırlık.
- Terminal sayfasındaki `dockview` yerleşim kaydetme, Faz 8'in kalan işi olarak
  duruyor.

**Kabul kriteri:** ✅ — nasıl doğrulandı:

- **388 pytest testi yeşil** (379 mevcut + 3 saat dilimi regresyonu + 6 ayar
  deposu testi). `ruff check` ve `ruff format --check`
  temiz.
- **Backtest hatası canlı veriyle doğrulandı:** API'nin izlediği yol birebir taklit
  edilip (saat dilimsiz `2026-07-20` → `2026-08-01`, 5 sembol, gerçek DB) koşu
  tamamlandı: 202 bar, 14 işlem, üç maliyet senaryosu ve kıyaslar üretildi. Aynı
  girdi düzeltmeden önce `FAILED` veriyordu.
- **Panel derleniyor:** `tsc --noEmit` temiz, `next build` 21 sayfa üretti,
  servis yeniden başlatıldı ve HTTP 200 dönüyor.
- Ayar deposu testleri: eksik grup boş sözlük döndürüyor, yazılan değer okunuyor,
  önbellek `invalidate()` ile düşüyor, bozuk kayıt varsayılanı bozmuyor, ayar
  değişikliği `config_hash`'i değiştiriyor (bozulmaz kural 3).

**Açık kalan:**

1. Faz 0a deneyi hâlâ çalıştırılmadı — "bu puanlama işe yarıyor mu?" sorusu
   cevapsız. Bu tur o soruyu **sormayı kolaylaştırdı** (kalibrasyon derinleşti,
   backtest çalışır hâle geldi) ama cevaplamadı.
2. Havuz filtre eşikleri artık panelden değiştirilebiliyor; ilk değişiklikten sonra
   huni raporunun kontrol edilmesi gerekiyor — bir eşiği kısmak havuzu sessizce
   küçültür.
3. Discord webhook'ları bugüne kadar hiç kaydolmamış olabilir (yukarıdaki 3. hata);
   Entegrasyonlar sayfasından yeniden girilmeleri gerekiyor.

---

## [Arayüz] HashUI'ya geçildi — 2026-08-16

**Yapıldı:** Panelin görsel dili HashUI'ya taşındı. `CLAUDE.md` stack tablosu
başından beri HashUI diyordu; kütüphane elde olmadığı için Tailwind + elle
yazılmış shadcn bileşenleriyle ilerlenmişti. Artık asıl karar uygulanıyor.

> **Düzeltme.** Bu girişin ilk hâli geçişi olduğundan geniş anlatıyordu. İlk
> turda yalnızca token boruları bağlanmıştı: fontlar hâlâ Inter/IBM Plex'ti
> (HashUI kuralı 4 Geist ister) ve HashUI'ın ~40 ayırt edici bileşeninden
> **hiçbiri** sayfalarda kullanılmıyordu. Kullanıcı haklı olarak "hiçbir yere
> elini sürmemişsin" dedi. Aşağıdaki liste ikinci turdan sonraki **gerçek**
> durumu anlatıyor.

**Yaklaşım — yeniden tasarım, yeniden yazım değil.** İş mantığı, veri akışı,
rotalar ve **tüm metinler** birebir korundu. `components/ui/*` modülleri
HashUI'ya **adaptör** hâline getirildi: sayfaların çağrı yüzeyi (`variant`,
`size`, `asChild`) değişmedi, altındaki görsel dil değişti. On yedi sayfayı
elle çevirmek yerine tek dikişten geçildi.

**Kritik karar — renk kimliği korundu.** HashUI'ın varsayılan markası zümrüt
yeşilidir. SARNIÇ'ta bu kabul edilemez: DESIGN §2 yeşil ve kırmızıyı
**yalnızca yön** için ayırır. Yeşili marka rengi yapmak, bir düğmenin "kazanç"
anlamına gelip gelmediğini belirsizleştirirdi — bir işlem panelinde ciddi bir
okuma hatası. `ui/presets/sarnic.css` köprüsü HashUI token'larını SARNIÇ
kimliğine bağlıyor (`--brand` → kehribar); ikinci bir tasarım dili doğmuyor.
HashUI'ın kendi `presets/thy.css` deseni bu yaklaşımı zaten öneriyor.

**Tema mekanizması birleştirildi.** Panel `:root[data-theme="light"]`,
HashUI `.dark` sınıfı kullanıyordu. İkisini yan yana yaşatmak bileşenlerin
yarısının temayı görmemesi demekti. Tek mekanizma `.dark`; varsayılan yine
koyu (DESIGN §8), `layout.tsx` içindeki script FOUC'u önlüyor. Açık mod da
doğrulandı.

**Yazı tipi Geist/Geist Mono oldu** (HashUI kuralı 4: "istisnasız"). İlk turda
kendi Inter/IBM Plex kurulumumuz korunmuştu — HashUI'ın en görünür imzası
buydu ve kaçırılmıştı. `@fontsource-variable/geist` paketleri derlemeye
gömülüyor, CDN'e bağlanılmıyor; `latin-ext` alt kümesi Türkçe karakterleri
kapsıyor. SARNIÇ'ın bozulmaz kuralı 6 ile çatışma yok, ikisi aynı şeyi
söylüyor.

**HashUI bileşen sözlüğü sayfalara girdi:** `SegmentedControl` (kalibrasyon
ufku, pozisyon sekmeleri), `Alert` (kalibrasyon kararı, kıyas uyarısı, kill
switch), `StatusPill`/`DotPill` (bot durumu, pozisyon durumu, IC işareti,
canlı göstergesi), `SignalBars` (puan gücü), `InsetPanel`, `Kbd`, `Tooltip`,
`IconButton`, `Modal`+`ModalClose` (kill switch).

**Bildirimler tek kaynağa indi.** `sonner` kaldırıldı; HashUI'ın
`ToastProvider`'ı kullanılıyor. `lib/toast.ts` köprüsü `sonner`'ın API
yüzeyini taklit ettiği için yirmi çağrı yeri değişmedi.

**Bilinçli olarak yapılmadı:**
- **`ThreeOrb` paketten çıkarıldı.** Dekoratif bir 3B küre için `three`
  (~3 MB) taşımak, DESIGN §2'nin "hareket: minimum" kuralıyla çelişiyor.
- **Sekmeler HashUI API'sine çevrilmedi.** HashUI dizi tabanlı bir API
  kullanıyor (`items` + `value`/`onChange`); Radix'in bileşik API'siyle yazılmış
  sayfaları çevirmek davranış riski taşıyordu. Radix davranışı korunup görünüm
  HashUI'ın `PillTabs`'ine uyarlandı.
- **`Modal` yerine mevcut `Dialog` korundu**, yalnızca HashUI yüzeyine
  uyarlandı — aynı gerekçe.
- **İkonlar `lucide-react`'te bırakıldı.** HashUI'ın ~70 ikonluk seti panelin
  ihtiyacını tam karşılamıyor; iki set arasında gidip gelmektense tek sette
  kalındı. Çizgi kalınlığı farkı (1,8 vs 2) gözle ayırt edilmiyor.
- **Terminal katmanı (`.terminal-scope`) dokunulmadı** — Bloomberg
  kehribar-siyah veri ızgarası açık modda bile koyu kalır (DESIGN §2). Köprü
  HashUI token'larını orada terminal paletine yeniden bağlıyor ki panelin geri
  kalanıyla aynı yüzeye dönüşmesin.
- HashUI'ın `theme.tsx` dosyasına **iki uyarlama** yapıldı ve dosya içinde
  işaretlendi: (1) tarayıcı API'leri `typeof window` ile korundu — HashUI
  Vite/SPA için yazılmış, Next.js sunucuda render edince çöküyordu;
  (2) varsayılan mod `system` yerine `dark`. Paket güncellenirse bu iki nokta
  yeniden uygulanmalı.

**Kabul kriteri:** ✅ 17 sayfa gerçek tarayıcıda **0 konsol hatası**, koyu ve
açık modda. `tsc` temiz, üretim derlemesi başarılı. Giriş akışı, canlı akış ve
grafikler çalışıyor. Motor tarafına **dokunulmadı** (379 test aynen geçerli).

**Açık kalan:** `PageHeader` bileşeni henüz her sayfada kullanılmıyor; bazı
sayfalar kendi başlık düzenini koruyor. Görsel olarak tutarlı ama tek ritim
için sonradan toplanabilir.

---

## [Bakım] Arayüz modernleştirildi, ölçüm katmanı eklendi — 2026-08-16

**Yapıldı:**

**1. Arayüzün en büyük sorunu bir tasarım tercihi değildi: hiçbir yazı tipi
yüklü değildi.** `Inter` ve `IBM Plex Mono` isimleri yazılıydı ama ikisi de
sistemde kurulu değildi; panel jenerik sistem fontlarıyla çiziliyor, rakamlar
`tabular-nums` almıyordu — **bozulmaz kural 6 fiilen ihlal ediliyordu**. Font
dosyaları repoya alındı ve `next/font/local` ile derlemeye gömüldü (§9.16).

**2. "Object is disposed" düzeltildi** (§9.17) — React efekt temizleme sırası;
StrictMode her mount'u çift çalıştırdığı için hata her açılışta tetikleniyordu.

**3. Özsermaye eğrisi olmayan bir kârı gösteriyordu** (§9.15). Grafik
15.000'den 45.000'e fırlıyordu: `equity_points` tablosunda `(bot_id, at)`
benzersizlik kısıtı yoktu ve yeniden başlayan bot aynı barı üç kez yazmıştı.
Kısıt + upsert + migrasyonla temizlik; toplam eğri artık sunucuda ileri
doldurmayla hesaplanıyor.

**4. Tasarım sistemi derinleştirildi.** Yüzey hiyerarşisi (`--surface*`),
semantik renk token'ları (bileşenler artık hex yazmıyor), `StatTile`,
`Skeleton`, `PageHeader`, `Sparkline`, `CardBar`; tabloda yapışkan başlık.
Pozisyon tablolarına **bot sütunu** eklendi — üç bot aynı sembolü açtığında
tablo veriyi tekrarlanmış gibi gösteriyordu.

**5. Olay akışı temizlendi** (§9.18). Son 500 olayın 484'ü "bar kapandı"
satırıydı; artık toplu yayınlanıyor.

**6. Kıyas ölçütü — panelin en önemli sorusu.** "Botlar +%0,29 getirdi" tek
başına hiçbir şey ifade etmez. Yeni `/portfolio/benchmark`, aynı havuzun eşit
ağırlıklı al-ve-tut sepetini aynı pencerede hesaplıyor (Faz 0a'nın 3. testinin
canlı hâli). Örneklem yetersizken sonuç **açıkça yetersiz ilan ediliyor** —
30 gün ve 30 işlem eşiği.

**7. Maliyet varsayımı ölçümle değiştirildi.** `TRIAL-LEDGER #4` "15 bps tek
yön varsayımı doğrulanmalı" diyordu. 44 sembolün 10.868 gerçek `bookTicker`
örneği: medyan spread 3,05 bps → yarı spread 1,52 bps → komisyonla birlikte
tek yön **11,52 bps**, gidiş-dönüş **23,05 bps**. Varsayım %23 fazla
kötümsermiş. 24 saatlik kenar bu düzeltmeyle işaret değiştiriyor
(−%0,04 → +%0,025).

**8. API test altyapısı** (§9.19) — httpx + ASGITransport, ayrı test
veritabanı, 21 uç testi. Bu sırada `/system/status`'un bağımlılık yerine
oturum fabrikasını doğrudan çağırdığı bulundu ve düzeltildi.

**9. Panel denetçisi** (`apps/web/scripts/audit-ui.mjs`) — her sayfayı gerçek
bir tarayıcıda açıp konsol hatalarını toplar. İlk koşuda kalibrasyon sayfasının
çöktüğünü buldu: uç gözlem yokken **eksik** gövde döndürüyor, panel
`rolling_spearman.filter(...)` çağırınca patlıyordu. Sistemin dürüstlük organı
olan sayfa hiç açılmıyormuş.

**Bilinçli olarak yapılmadı:**
- **Kilitli out-of-sample penceresine dokunulmadı.** Maliyet ölçümü bir
  *girdi* düzeltmesidir, hipotez denemesi değil; yeniden koşu yapılmadı.
- **Faz 0a kararı değiştirilmedi.** Maliyet düzeltmesi 24 saatlik kenarı
  pozitife çeviriyor ama portföy testi **maliyetsiz** koşuda da başarısızdı
  (top-5 0,709× vs sepet 0,749×). Maliyeti düzeltmek, kenarın yanlış uçta
  olduğu gerçeğini değiştirmez. Bunu "strateji artık kârlı" diye sunmak
  yanıltıcı olurdu.
- **Ağırlık araması yapılmadı**, parametre değiştirilmedi, eşik oynanmadı.
- **Dördüncü bot ("eleyici" hipotezi) tanımlanmadı.** Sıradaki en güçlü aday
  bu ama yeni bir strateji tanımlamak kullanıcının kararıdır.
- Kayma (`slippage`) için bağımsız ölçüm yapılmadı; kağıt motorun raporladığı
  değer kendi varsayımını içeriyor ve panel bunu açıkça söylüyor.
- Açık moda ayrı bir geçiş çalışması yapılmadı; token'lar tanımlı ama panel
  koyu modda tasarlandı ve orada doğrulandı.

**Kabul kriteri:** ✅ 17 sayfa gerçek tarayıcıda **0 konsol hatası** (öncesi:
her grafik sayfasında "Object is disposed", kalibrasyonda çökme). Lint + `tsc`
temiz. Takım 346 → **379 test**. Özsermaye eğrisi gerçek değeri gösteriyor
(15.053, sahte 45.000 sıçraması yok).

**Sonradan eklenen iyileştirmeler (aynı gün):**
- `/portfolio/benchmark` **1381 ms → 149 ms**. `load_frames` artık `start`
  sınırı kabul ediyor; uç 23 barlık pencere için 44 sembolün ~208 günlük
  verisini çekiyordu.
- **Onarılan veri kalitesi bulguları kapatılıyor.** `resolved` alanı modelde
  vardı ama hiçbir yer doldurmuyordu; panel saatler önce onarılmış 37 boşluğu
  güncel sorunmuş gibi listeliyordu. Temiz bir denetim artık eski boşlukları
  kapatıyor, panel yalnızca **açık** bulguları gösteriyor.
- Arka plan servislerini test edebilmek için `test_database` fixture'ı —
  küresel oturum fabrikasını test veritabanına yöneltir.

**Kullanıcı kararıyla yapılan iki değişiklik:**
- **`TickSizeFilter` eşiği %0,05 → %0,10.** Havuzun en büyük kesimi buradaydı
  (170 → 87). Filtre spec'e uygun çalışıyordu; sorun eşiğin spread eşiğinden
  (%0,30) altı kat sıkı olmasıydı — oysa tick oranı ulaşılabilecek en dar
  spread'in **alt sınırıdır**, yani aynı risk ikinci kez ve daha sert
  uygulanıyordu (§9.20). Havuz **44 → 65 sembol**. `MASTER-SPEC` §3.2 tablosu
  dipnotla güncellendi. İlişki `test_universe.py`'de kilitlendi: tick eşiği
  spread eşiğinden sıkı olamaz.
- **Panel üretim derlemesine geçti.** Otomatik doldurma artık `NODE_ENV`
  yerine açık bir bayrağa bağlı (`NEXT_PUBLIC_AUTOFILL`), bu yüzden `next dev`
  zorunluluğu kalktı. Bellek **1,6 GB → 346 MB**, sayfa yanıtı ~7 ms. Giriş
  akışı uçtan uca doğrulandı (alanlar doluyor, TOTP üretiliyor, panele
  giriliyor). Bayrak açıkken kimlik bilgileri derlemeye gömülür — panel
  dışarı açılırsa `.env.local`'dan kaldırılmalı; not dosyaya yazıldı.
- Panel denetçisi, üretim derlemesinin agresif `_rsc` önceden getirmesini
  yanlış alarm olarak raporluyordu; yalnızca **iptal edilmiş prefetch**
  susturuldu, gerçek başarısızlıklar hâlâ raporlanıyor.

**Açık kalan:** Kıyas kutusu şu an "örneklem yetersiz" diyor (1,0 gün, 6
işlem) ve 30 gün/30 işlem dolana kadar öyle diyecek. Faz 0a'nın sıradaki
hipotezi — puanı **seçici değil eleyici** kullanmak — hâlâ test edilmedi;
`research/TRIAL-LEDGER.md`'de bekliyor.

---

## [Bakım] Canlı akış onarıldı — 2026-08-16

**Yapıldı:** Panelin canlı akışı, `ws.py` yazıldığı günden beri **hiç
çalışmamıştı**; iki bağımsız kusur vardı ve ikisi de yakalanmış istisnaların
arkasına saklanmıştı (ayrıntı: `docs/OPEN-QUESTIONS.md` §9.11).

1. `Client` bir `@dataclass`'tı; üretilen `__eq__`, `__hash__`'i `None` yapıyor
   ve hub'ın `set`'ine eklenme her bağlantıda `TypeError` fırlatıyordu. WebSocket
   kabul edilir edilmez kapanıyordu. → `@dataclass(eq=False)`.
2. `redis-py` 8'in 5 saniyelik `socket_timeout` varsayılanı, `listen()`'in
   `block=5000` penceresiyle birebir yarışıyordu; okuma her turda kopuyor,
   log saniyede bir `event_read_failed` ile doluyordu. → Dinleme kendi
   bağlantısını açıyor, soket zaman aşımı blok süresinin 10 sn üstünde.
   Ayrıca `$` imleci başlangıçta somut akış kimliğine çözülüyor; kopma anında
   `$`'ın "şimdi"ye kayması aradaki olayları sessizce düşürüyordu.

Kusurlar `tests/test_ws.py` (16 test) ve `tests/test_events.py` (11 test) ile
kilitlendi. Takım 298 → 346 test.

**Terminal sayfası onarıldı.** `/symbols/{sembol}/patterns` her sembolde 500
dönüyordu: `confirm_with_volume` bir `numpy.bool_` üretiyor, uç `-> dict`
döndürdüğü için Pydantic'in şema zorlaması devreye girmiyor ve serileştirme
patlıyordu. Düzeltme serileştirme sınırında yapıldı — `PatternMatch.as_dict()`
artık saf Python tipleri döndürüyor (ayrıntı: §9.12). Doğrulama: 90 sembol ×
4 uç = 360 istek ve ilk 10 sembolde 4 zaman dilimi × 3 uç — hepsi 200.

Ayrıca **saatlik veri kalitesi denetimi eklendi.** Spec §2.3 denetimi "her
backfill *ve her saatlik döngü sonrası*" istiyor; yalnızca backfill'de
çalışıyordu, dolayısıyla ilk dolgudan sonra hiçbir bar denetlenmiyordu.
Panelin veri kalitesi sayfası kalıcı olarak boştu — ve boş bir sayfa
"sorun yok" ile "hiç bakılmadı"yı aynı gösteriyordu. Denetim, bar
kapanışından 2 dakika sonra `MarketDataService` içinde çalışıyor (boşluk
onarımı REST istediği için kural 5 gereği tek merkezden) ve gözcünün
dirilttiği görevler arasında.

**Panele strateji seçici eklendi.** `/scores` üç botun ürettiği **iki** ayrı
puanlama konfigürasyonunu tek listede karıştırıyordu: 45 sembol için 90 satır,
"90 sembol" yazan bir başlık, iki konfigürasyonu iç içe dizen bir "sıralama" ve
tabloyla tutmayan bir puan kartı. React'in `same key` uyarısı bunun semptomuydu.
Panel artık her an tek bir konfigürasyonun sıralamasını gösteriyor; yeni
`/scores/configs` ucu konfigürasyonları botun tanımından hash'i yeniden
hesaplayarak etiketliyor (ayrıntı: §9.14). Görünüm biçimi kullanıcıya soruldu —
uydurulmadı.

**Bilinçli olarak yapılmadı:**
- Konfigürasyonları **yan yana karşılaştıran** sütunlu görünüm yapılmadı;
  kullanıcı seçiciyi tercih etti. Konfigürasyon sayısı arttıkça tablo taşardı.
- API'ye test harness'ı (FastAPI `TestClient`) **eklenmedi**. Yeni uçların
  mantığı canlı sistemde gerçek veriyle doğrulandı; saf olarak test edilebilen
  varsayım (hangi tanım farkı puanlamayı değiştirir) `test_scoring.py`'ye
  yazıldı. Harness ayrı bir iştir ve bu düzeltmenin kapsamı değildi.
- Redis bağlantı ayarları merkezî bir fabrikaya taşınmadı. Yalnızca `listen()`
  bloklayan çağrı yaptığı için sorun oradaydı; `publish`/`history` için
  5 saniyelik zaman aşımı doğru davranıştır.
- WebSocket'e kalp atışı (heartbeat/ping) çerçevesi **eklenmedi**. İstemci
  `ping` gönderebiliyor ve `pong` alıyor; sunucu tarafı periyodik yoklama,
  ölçülmüş bir ihtiyaç doğmadan eklenmeyecek.
- Panelin "yeniden bağlanılıyor" uyarısı olduğu gibi bırakıldı — akış gerçekten
  koptuğunda görünmesi gereken doğru davranış budur.

**Kabul kriteri:** ✅ WebSocket bağlanıyor, 200 olaylık geçmişi teslim ediyor,
`ping`/`pong` dönüyor; iki serviste 60 saniyede `event_read_failed` sayısı
0 (öncesi: saniyede bir). 04:00 barında canlı akış uçtan uca doğrulandı:
46 sembol puanlandı, iki pozisyon +2,49R ve +2,47R ile kapandı, olaylar
WebSocket'ten anında geldi. Terminal sayfasının 360 isteği 200.
Strateji seçici: her konfigürasyon 45 satır · 45 benzersiz sembol · 0 tekrar,
puan kartı ile tablo birebir tutuyor. Lint + tsc temiz, 346 test geçiyor.

**Açık kalan:** Faz 0a kararı değişmedi — puanlama hipotezi doğrulanmadı.
Sıradaki hipotezler `research/TRIAL-LEDGER.md`'de; kilitli out-of-sample
penceresine hâlâ dokunulmadı.

---

## [Faz 0a] Doğrulama deneyi çalıştırıldı — sonuç HAYIR — 2026-08-15

**Yapıldı:** Kapı fazı nihayet çalıştırıldı. `data.binance.vision`'dan 228 sembol
× 2 yıl 1h kline indirildi, 684 günlük point-in-time evren kuruldu (delist
edilmişler dahil), 273.600 puanlama üretildi ve 4s/24s/72s ileri getirilerle
eşleştirildi. Verinin son %30'una **dokunulmadı**.

**Sonuç: HAYIR — dört testin dördü de başarısız.**

| # | Test | Sonuç |
|---|---|---|
| 1 | Desil monotonluğu | ❌ monoton değil |
| 2 | Spearman | ❌ ρ = −0,0058 · pencerelerin %30'u pozitif |
| 3 | Top-5 vs eşit ağırlıklı | ❌ 0,168× vs 0,178× |
| 4 | Top-5 vs rastgele | ❌ %56. yüzdelik — ayırt edilemez |

**Ama ölçüm boş çıkmadı.** Ayrıştırma üç şey gösterdi:

1. **Sinyal var, maliyetin altında.** Üst5−alt5 farkı 24 saatte +%0,2555
   (t=2,23); gidiş-dönüş maliyet %0,30. 72 saatte fark +%0,5991'e (t=3,31)
   çıkıyor ve maliyeti aşıyor — desiller de neredeyse monoton oluyor.
2. **Kenar yanlış uçta.** Fark, üst desilin iyi olmasından değil alt desilin
   çok kötü olmasından geliyor; desil 10 ile 8 arasında fark yok. Puan
   **kaybedeni** ayırt ediyor, kazananı değil. Long-only spot bunu paraya
   çeviremez (short kapsam dışı).
3. **Ağırlığın %55'i ters yönde.** trend (−0,028) ve momentum (−0,031) negatif
   IC üretiyor; tek pozitif aile `vol` (+0,058) — spec'te en az güvenilen ve
   `OPEN-QUESTIONS #1`'de yönü zaten sorgulanan aile.

**Bilinçli olarak yapılmadı:** **Ağırlık araması yapılmadı.** ROADMAP açıkça
yasaklıyor: aynı veri üzerinde arama uydurma üretir. İki deneme kaydedildi
(taban 24s · ufuk 72s) ve arama orada **durduruldu**; üçüncü deneme yanlış
keşif riskini kabul edilemez seviyeye çıkarırdı. Hipotez adayları
`research/TRIAL-LEDGER.md`'de test edilmeden listelendi.

**Ayrıca düzeltildi:** Faz 0a portföy simülasyonu 24 saatlik getiriyi 6 saatte
bir uyguluyordu — aynı hareketi dört kez sayıp maliyeti dört katına çıkarıyor,
portföyü sıfıra sürüklüyordu. Elde tutma süresi artık getirinin ufkuyla eşleşiyor.
Ayrıca `searchsorted` tz-aware/naive karşılaştırma hatası giderildi.

**Kabul kriteri:** ✅ Faz 0a'nın kabul kriteri "dört testin dördü de geçmeli"
idi; geçmedi ve rapor bunu saklamıyor. Fazın amacı bir soruyu cevaplamaktı —
cevaplandı. `research/PHASE-0A-REPORT.md`.

**Açık kalan:** ROADMAP'e göre sıradaki adım ağırlık değiştirmek değil,
**hipotez değiştirmek** ve kilitli pencereye dokunmadan yeniden test etmek.
En güçlü aday: puanı seçici değil **eleyici** kullanmak (alt desili elemek) —
ölçülen bulguyla doğrudan uyumlu tek long-only kullanım.

---

## [Canlı çalıştırma] Sistem gerçek veriyle ayağa kalktı — 2026-08-15

**Yapıldı:** Proje ASCII yola taşındı (Next.js Türkçe karakterli yolda çalışmıyor).
Docker yığını (TimescaleDB + Redis) kaldırıldı, migrasyonlar gerçek veritabanında
uygulandı — `ohlcv` hypertable ve 3 continuous aggregate doğrulandı. Gerçek
Binance verisi: 180 sembol × 1d, 149 sembol × 1h/4h, toplam ~540.000 bar.
Üç bot tanımlandı (taban · seçici · trend ağırlıklı) ve üçü de `PAPER_RUNNING`.
Tüm servisler systemd altında `Restart=always` ile çalışıyor; `enable-linger`
sayesinde oturum kapansa bile ayakta kalıyorlar. Panelin giriş formu geliştirme
modunda otomatik doldruluyor (TOTP dahil, tarayıcıda RFC 6238 ile üretiliyor).

**Canlı çalıştırmada bulunan ve düzeltilen hatalar** — hiçbiri testlerde
görünmezdi, hepsi gerçek veri gerektiriyordu:

1. `EmailStr` `.local` alan adını reddediyordu — sistemin kendi yönetici hesabı
   giriş yapamıyordu. Yerel ağ paneli için biçim doğrulayan kendi tipimiz yazıldı.
2. PostgreSQL 32.767 bağlı parametre sınırı — 3.681 sembollük `exchangeInfo`
   tek `INSERT`'e sığmıyordu. Üç toplu yazım da parçalandı.
3. `!ticker@arr` akışı hiç veri göndermiyor (kline/depth sorunsuz). 90 sn
   sessizlikte REST yedeğine düşülüyor; düşüş açıkça loglanıyor.
4. `@depth20` yükünde sembol alanı yok — tüm defterler tek boş anahtara
   yazılıyordu. Sembol `stream` adından çıkarılıyor.
5. Havuz başlatma açmazı: havuz boş → derinlik akışı yok → spread örneği yok →
   havuz sonsuza dek boş. Aday listesi hacim sıralamasından tohumlanıyor.
6. Spread örneklemesi kırılgan derinlik akışına bağlıydı; REST `bookTicker`
   birincil kaynak oldu (tek çağrı, ağırlık 4, tüm evren).
7. Örnekleme aralığı 6 → 5 dk: 10 örnek 1 saatlik pencereye 6 dk payla
   sığıyordu, her yeniden başlatma sayacı sıfırlıyordu.
8. Boş havuz "yapıldı" sayılıp ertesi güne erteleniyordu; artık boş veya eksik
   havuz, **büyüdüğü sürece** yeniden denenir.
9. Atlanan bar tüketiliyordu — `run_bar` artık işleyip işlemediğini döndürüyor.
10. Arka plan görevleri sessizce ölüyordu (`asyncio` istisnayı yutuyor). 30 sn'lik
    görev gözcüsü eklendi: ölen görevi loglar, olay yayınlar, yeniden başlatır.

**Bilinçli olarak yapılmadı:** `!ticker@arr` akışının neden sessiz olduğu
araştırılmadı — yedek yol çalıştığı için ertelendi. Bot worker'larına
`MarketDataService`'teki gibi görev gözcüsü eklenmedi; oradaki koruma
süpervizörün heartbeat denetimi (asimetri bilinçli, gözden geçirilmeli).
Faz 0a deneyi hâlâ **çalıştırılmadı**.

**Kabul kriteri:** ✅ uçtan uca doğrulandı — 3 bot 03:00 barında 15 sembolü
puanladı, gerekçeleriyle birlikte `scores` tablosuna yazıldı. Hiçbiri 80
eşiğini geçmediği için pozisyon açılmadı: mutlak kapı (§5.3) tasarlandığı gibi
çalışıyor. Nokta-anında havuz okuması da doğrulandı — 02:50'de kurulan havuz
02:00 barında kullanılmadı (look-ahead koruması).

**Açık kalan:** Havuz 48/100 sembolde; spread örnekleri biriktikçe büyüyor.
9 havuz sembolünde 1h verisi eksikti, tamamlandı. Faz 0a deneyi sıradaki iş.

---

## [Faz 0–10] Sistemin tamamı kuruldu — 2026-08-14

**Yapıldı:**

*Faz 0 — iskele.* Monorepo (`apps/engine` + `apps/web`), `uv` + npm, Docker Compose
(postgres/timescale, redis, migrate, api, marketdata, supervisor, notifier, web),
30 tablolu Alembic ilk migrasyonu + 3 continuous aggregate, FastAPI iskeleti,
Next.js iskeleti, JWT + **zorunlu TOTP 2FA**, `ADMIN`/`TRADER`/`VIEWER` rolleri,
GitHub Actions CI (ruff + pytest + alembic + tsc + next build).

*Faz 1 — veri katmanı.* Binance REST/WS adaptörü, merkezi `RateLimiter`
(%70 yumuşak eşik, 429 geri çekilme, **418'de otomatik retry yok**),
`MarketDataService` (bozulmaz kural 5: tek çıkış noktası), `data.binance.vision`
arşiv indiricisi, OHLCV deposu, dört kontrollü veri kalitesi denetçisi
(boşluk / aykırı değer / bayat / mantık).

*Faz 2 — havuz motoru.* 12 filtrelik saf zincir, huni raporu, histerezis
(100–120 bandı + açık pozisyon koruması), `universe_snapshots` yazımı, kara liste.

*Faz 3 — özellik ve puanlama.* İndikatör hattı (açıkça yazıldı ki her satırın
hangi barları kullandığı testte kanıtlanabilsin), S/R motoru (fraktal pivot +
ATR kümeleme + hacim profili + 4 bileşenli güç puanı), formasyon motoru
(11 şablon + mum formasyonları), kesitsel yüzdelik normalizasyon, aile ağırlıkları,
kalabalıklaşma cezası, **zorunlu gerekçe nesnesi**, kalibrasyon (desil / Spearman / IC).

*Faz 4 — boyutlandırma, risk, paper.* 6 adımlı boyutlandırma zinciri + 5 kısıt,
korelasyon kümeleri (hiyerarşik, `corr > 0.75`), 7 devre kesici, `PaperAdapter`
(gerçek emir defterinde seviye seviye dolum, kısmi dolum, kayma, komisyon,
250 ms gecikme, PRER reddi).

*Faz 5 — süpervizör.* İzole worker süreçleri, 10 sn heartbeat + 3 kaçırmada
yeniden başlatma, yeniden başlatma fırtınası koruması, DB'den durum kurtarma,
`structlog`, Redis Streams olay yayını.

*Faz 6 — TUI.* Textual uygulaması, kehribar-siyah palet, dört panel, renkli log,
klavye kısayolları, kill switch, yeniden bağlanma. Yalnızca FastAPI'ye konuşur.

*Faz 7–8 — panel.* 19 sayfa: Panel, Terminal, Havuz, Puanlar, Kalibrasyon, Botlar
(+ detay), Pozisyonlar, Stratejiler, Backtest, İndikatörler, Sohbet, Bildirimler,
Kullanıcılar, Entegrasyonlar, Loglar, Ayarlar, Giriş. ⌘K komut paleti, WebSocket
canlı akış, **Puan Kartı** imza bileşeni, TradingView Lightweight Charts ile
S/R ve formasyon çizimi.

*Faz 9 — backtest.* Olay güdümlü motor (vektörel kısayol yok), bar içi stop
tetikleme, 3 maliyet senaryosu, **üç zorunlu kıyas** (eşit ağırlıklı / BTC /
devir-eşleştirilmiş rastgele), walk-forward, kilitli %30 out-of-sample,
aşırı uydurma kırmızı bayrakları.

*Faz 10 — sohbet, bildirim, entegrasyon, yönetim.* Sohbet odaları, bildirim
gelen kutusu, Discord (kanal eşlemesi + 5 sn'lik toplu gönderim + `@here`),
kullanıcı yönetimi, audit log, kill switch.

*Faz 0a — araştırma iskelesi.* `research/phase0a.py`, dört testi çalıştırıp
`PHASE-0A-REPORT.md` üretiyor; puanlama motorunu **ithal ediyor**, kopyalamıyor.

**Bilinçli olarak yapılmadı:**

- **Faz 0a deneyinin kendisi çalıştırılmadı.** İskele hazır ama ~2 yıllık veri
  indirilmedi; dolayısıyla "bu puanlama işe yarıyor mu?" sorusu **hâlâ cevapsız**.
  Sıradaki iş budur.
- `BinanceSpotAdapter` — arayüz (`ExecutionAdapter`) tanımlı, uygulama Faz 11'e
  ertelendi. v1'de canlı emir yolu yok.
- Terminal sayfasında `dockview` ile sürükle-bırak panel yerleşimi ve yerleşim
  kaydetme — sabit üç sütunlu düzen yapıldı.
- Playwright E2E ve görsel regresyon testleri (Faz 7–8 kabul kriterlerinin bir kısmı).
- Faz 11 sertleştirmesi: Grafana panoları, Sentry, gecelik yedek provası, Caddy.
  Prometheus `/metrics` ucu var; toplayıcı kurulmadı.
- Kelly boyutlandırma — puan kalibre edilmiş olasılık değil.
- Çoklu zaman dilimi seçimi reddedildi (kazananın laneti). Zaman dilimi başına
  ayrı bot desteği veri modelinde var, ayrı süreç orkestrasyonu yok.
- Kullanıcı başına Binance anahtarı; vadeli/kaldıraç/short; Telegram/e-posta;
  BIST ve ABD borsaları.

**Kabul kriteri:** kısmen ✅ — nasıl doğrulandı:

- **312 pytest testi yeşil** (`uv run pytest tests -q`, 197 sn). Kapsam: scoring %95,
  sizing %96, risk %98, exits %99, indicators %98, patterns %91, sr %89, metrics %92.
- **Look-ahead testleri geçiyor**: kesme testi (indikatör değeri gelecekle değişmiyor),
  pivotlar son `k` barı kullanmıyor, kernel nedensel, önceden hesaplanmış gösterge
  satırı ile dilimlenmiş hesap birebir eşit.
- **Property testleri geçiyor**: puan her zaman `[0,100]`, aile katkıları toplamı
  taban puana eşit, pozisyon %30 / maruziyet %80 / küme %50 tavanları hiçbir
  koşulda aşılmıyor, stop her zaman girişin altında.
- **Elle hesaplanmış fixture'lar tutuyor**: emir defterinde 15 adet alımın ortalama
  dolum fiyatı, EMA/ATR/TR/OBV değerleri, boyutlandırma zincirinin her adımı.
- **Devre kesici senaryoları**: −%4 günlük zararda giriş reddediliyor, −%15'te
  kill switch tetikleniyor, tam eşik değerlerinde de tetikleniyor.
- **100 sembol < 2 sn'de puanlanıyor** (Faz 3 kabul kriteri).
- **Alembic**: `upgrade head` 31 tablo + 3 continuous aggregate üretiyor,
  `downgrade base` temiz geri alıyor (çevrimdışı SQL ile doğrulandı).
- **Panel derleniyor**: 19 sayfa, `tsc --noEmit` temiz, standalone çıktı HTTP 200
  döndürüyor.
- ❌ **Doğrulanamayanlar** — canlı bağımlılık gerektirdiği için: Docker Compose
  uçtan uca kalkışı (bu makinede `docker` daemon kapalı), 24 saatlik WS akışı,
  gerçek Binance verisiyle boşluk doldurma, kaos testi (worker'a exception enjeksiyonu),
  Playwright E2E.

**Açık kalan:**

1. **Faz 0a deneyi çalıştırılmalı.** Sonuç "hayır" derse geri kalan her şey
   farklı bir puanlama hipoteziyle yeniden kurulur — bu bir başarısızlık değil,
   projenin işi.
2. Bu makinede `docker` daemon kapalı (`sudo systemctl start docker` gerekiyor);
   uçtan uca kalkış doğrulanamadı.
3. **Next.js Türkçe karakterli yolda çalışmıyor** (`~/Masaüstü/…`). Proje ASCII
   bir yola taşınmalı veya panel Docker'dan çalıştırılmalı. Ayrıntı: `README.md`.
4. Backtest maliyeti: 6 sembol × 256 barda ~94 ms/bar. 100 sembol × 2 yıl tek
   makinede saatler sürer. Ayrıntı ve ölçümler: `docs/OPEN-QUESTIONS.md` #6.
5. Spec'te karşılığı olmayan 5 karar `docs/OPEN-QUESTIONS.md`'ye yazıldı
   (ATR% yönü, nedensel kernel, bar içi stop dolumu, kaldıraçlı token tespiti,
   eşik toleransı).
6. Sunucu özellikleri, panelin dışarı açılıp açılmayacağı, kullanıcı sayısı ve
   Discord kanal yapısı hâlâ netleşmedi.

---

## [Faz 0] Henüz başlanmadı — 2026-08-13

**Yapıldı:** Şartname seti yazıldı (`CLAUDE.md`, `MASTER-SPEC.md`, `ROADMAP.md`, `DESIGN.md`).

**Bilinçli olarak yapılmadı:**
- `BinanceSpotAdapter` spec'te tanımlı ama Faz 11'e ertelendi. v1'de canlı emir yolu **yok**.
- Kelly boyutlandırma spec dışı bırakıldı — puan kalibre edilmiş olasılık değil.
- Çoklu zaman dilimi seçimi (en yüksek puanlı zaman dilimini seçme) **reddedildi**; kazananın
  laneti üretiyor. Yerine tek karar zaman dilimi + MTF özellikleri konuldu. Zaman dilimi başına
  ayrı bot Faz 9'da gelecek.
- Kullanıcı başına API anahtarı ve şifreleme katmanı ertelendi — v1'de tek anahtar, paper mod.
- Vadeli işlemler, kaldıraç, short kapsam dışı.
- Telegram/e-posta bildirimi kapsam dışı; yalnızca Discord.
- BIST ve ABD borsaları kapsam dışı; kripto doğrulandıktan sonra ayrı adaptör olarak gelecek.

**Açık kalan:** Sunucu özellikleri (OS/RAM/CPU), panelin dışarı açılıp açılmayacağı, kullanıcı
sayısı ve Discord kanal yapısı — Faz 0 başlarken netleşecek.

## 2026-08-27 — Panel kuyruğu, çok pazar, kalibrasyon dürüstlüğü, Bloomberg TUI

Ultracode panel denetiminin 41 maddesinin tamamı uygulandı (üç commit):
hata durumları artık yalan söylemiyor, kural 6 sözleşmenin kendisinde
(num sütunu = sn-num), açık tema kontrastı WCAG'a çekildi, ölü kod silindi,
gerekçe/rozet/rotalar bağlandı, meydan okuma sayfası motor metriklerine
geçti ve hedef-yolu grafiği eklendi. Motor: /scores/by-id, benchmark
?since, /calibration Redis önbelleği, huniye açık koruma adımı.

Çok pazar: BIST (İş Yatırım, 56 sembol) ve ABD (Yahoo, 80 sembol) günlük
barla aktif — Market/TradingCalendar soyutlaması, pazar-farkında
yıllıklandırma ve bar hizalama, takvim-farkında veri kalitesi, pazar
başına havuz snapshot'ı, sentetik defterle paper. İki yeni bot (#12, #13)
çalışıyor; ilk kararları ilk snapshot SONRASI barda (28.08) — point-in-time
kuralı yeni pazarda da taviz vermiyor. Bilinçli yapılmayanlar
OPEN-QUESTIONS §Çok-pazar'da: ham seri + corporate_actions mimarisi,
hisse havuz filtreleri (yalnız ciro), 1h hisse verisi (meşru kaynak yok).

Kalibrasyon: gate_edge'e gün-kümelenmiş t eklendi; ham t bağımsızlık
varsayıp ~%70 şişkin ölçülüyordu. Panel hükmü artık kümelenmiş t ile.
Meydan okuma G7: sekiz hipotezin sekizi çürüdüğü için puanlama/çıkış
DONUK; tek ölçülebilir kaldıraç olan maruziyet açıldı (vol_target
0,6→1,05 = havuz medyanı). Bu beta'yı büyütür, kanıtlanmış kenar değil —
defterde açıkça yazılı.

TUI Bloomberg'e çıkarıldı: 596 satırlık iskelet → beş ekranlı terminal
(nöbet/sembol/filo/pozisyon/olay), web ile birebir komut dilbilgisi,
tr-TR sayılar, yerel saat, sunucu CRITICAL'ının ezilmemesi, API
düşünce — basan (sıfır uydurmayan) durum çubuğu. En kritik düzeltme:
`r` tuşu devre kesiciyle durmuş botu artık sebebini göstermeden
başlatamıyor. Panel hareket katmanı: takılı tint hatası, tek matchMedia
aboneliği (~700 dinleyici → 1), reduced-motion artık her şeyi kapsıyor
(1 ms — none değil), tint bütçesi, biçimleyici önbelleği.

Bilinçli yapılmadı: TUI'de meydan okuma ekranı (sabitlerin API'ye
taşınması kararı bekliyor), kalibrasyon ekranı (panel daha iyi anlatıyor),
hisse paper stop dolumu için ortak gapfill (temkinli fark belgelendi).

### Aynı gün, akşam — sağlamlaştırma ve performans

Kural 1'in son bilinen ayrışması kapandı: stop dolumu tek kaynakta
(`execution/gapfill.py`); hisse botları bar kapanışında `low ≤ stop`
denetimiyle `min(stop, open)`'dan dolar, backtest aynı fonksiyonu kullanır,
PaperAdapter boşluk dolumunda PRER'i bilerek atlar (sapma boşluğun
kendisidir). Açılış yarışı bitti: dört servis başlamadan önce Postgres'i
bekler (`wait_for_db`, 90 sn tavan) — marketdata'nın boot'taki
çök-yeniden-doğ turu ve traceback'i tarih oldu. Hisse verisi artımlı:
günlük tazeleme son 12 seans (79 bin satır/gün yeniden yazılıyordu),
pazartesi tam eşitleme sermaye işlemlerini yakalar. `/portfolio/metrics`
60 sn Redis önbelleğinde — meydan okuma + bot detayları + TUI filosu aynı
ağır hesabı dakikada onlarca kez koşturuyordu. Bilinçli yapılmadı:
puanlama/çıkış parametrelerine dokunulmadı (sekiz hipotezin sekizi çürük;
dondurma kararı geçerli).

## 2026-09-01 — Maraton hazırlığı: donma sigortası, menüde pazarlar, 400 $ sıfırlama

Hafta sonu internet kesintisi gerçek bir tatbikat oldu: sistem kesintileri
kendisi atlattı (29'unda işlemler, dönüşte 317 boşluk otomatik onarıldı,
süresi dolan pozisyonlar bağlantı gelince işlendi; net hasar −38,51 USDT +
skor sürekliliğinde delikler). Ama iki zayıflık görünür oldu ve maraton
öncesi kapatıldı: (1) olay döngüsü donarsa içerideki gözcü de donuyor —
artık her veri servisi dıştan bakan bir DEADMAN ipliği taşıyor: 15 dk
nabızsızlıkta süreç kendini öldürür, systemd (StartLimitIntervalSec=0 ile
asla pes etmeden) yeniden doğurur, açılış denetimi 2 dk içinde boşlukları
onarır; (2) equitydata'nın TTL tazelemesi bayat kripto fiyatlarını canlı
gibi tutuyordu — read_tickers 15 dk'dan eski kripto girdisini artık düşer
(hisse girdileri kapalı piyasada bilerek eski kalır).

Sıfırlamanın kendisi ikinci dersi verdi: reset'ten 2 dk sonra WEEKLY_LOSS
kesicisi 8 botu durdurdu — eski taban cinsinden hafta-başı özsermayeye göre
400 $ "−%87 haftalık kayıp" görünüyordu. Kök neden: sermaye tabanı dıştan
değişince risk çapaları eski tabanla kıyas yapıyordu. Düzeltme: re-base anı
botun üstünde (`config.rebased_at`), gün/hafta çapaları bu anın gerisine
bakmaz — çapa klempe takılırsa dürüst taban yeni sermayenin kendisidir
(`load_snapshot`, testli). 8 bot 17 dk sonra koşuya döndü; maraton fiilen
22:33 UTC'de tam kadro başladı.

MARATON (sahibin kararı): 9 botun tamamı 400 $ eşdeğerine sıfırlandı,
30 gün komutsuz koşu; meta settings.marathon'da, hakem /maraton sayfası
(gün yolu, tabanlanmış yarış eğrisi + havuz sepeti, sıralama). Menüye
Havuz · Kripto/BIST/ABD girdileri ve Maraton eklendi; Meydan Okuma
menüden çıktı (sayfası ve defteri duruyor). G-serisi challenge 410,64
USDT'de kapandı — değerlendirmesi MEYDAN-OKUMA.md'de.

Maraton gecesi üçüncü dersi de verdi: hisse botları HİÇ işlem yapamamıştı
ve sebep bir satırdı — equitydata ticker'a `quote_volume="0"` yazıyor,
boyutlandırmanın likidite tavanı (adv_1h × pay) sıfıra klempleniyor, tek iz
"kısıtlar sonrası boyut sıfır" kalıyordu. Ticker artık son seansın gerçek
cirosunu taşıyor (adv_1h = ciro/24, kripto ile aynı dönüşüm; testli).
Düzeltmeden dakikalar sonra bot 13 sistemin İLK hisse pozisyonlarını açtı:
ADP.US (R 2,63) ve MSFT.US (R 2,10), ikisi de %1,1 risk. Sahte WEEKLY_LOSS
tetiğinin bıraktığı 24 saatlik giriş blokajı da temizlendi — bot 5 CRVUSDT
ile maratonun ilk kripto pozisyonunu açtı. Maraton 3 açık pozisyonla,
9/9 bot koşarak gece yarısını geçti.

## 2026-09-03 — İlk komutsuz 48 saat: sistem ayakta, kesici mekaniği onarıldı

İlk 48 saatin karnesi: sıfır servis çökmesi, sıfır deadman, sıfır OOM;
20 maraton işlemi, 11 açık pozisyon; deadman/bellek-tavanı/linger zırhı
hiç devreye girmeden bekledi. Çıkış parametre taraması (6 varyant,
ön-kayıtlı kural) DONUK KALIR dedi — gerekçe MEYDAN-OKUMA'da.

Koşunun kendisi iki mekanik hatayı açığa çıkardı, ikisi de düzeltildi:
(1) blok veren kesiciler her karar barında yeniden tetiklenip blokajı ileri
kaydırıyordu — bot 4'ün 6 saatlik "duraklatması" sonsuz kilide dönmüştü;
artık blok sürerken kesici susar ve çekilen ceza seriyi affeder (blokajdan
sonraki işlemlerden sayılır). (2) İş Yatırım'ın damla damla yayını yüzünden
tek sembol gelmişken seans "tazelendi" işaretleniyordu — 2 Eylül BIST barı
19/57 sembolle terk edilmişti; bekçi artık worker'la aynı nisabı (%60, ≥10)
arar. Ayrıca rebase çapası re-base öncesi özsermaye noktalarını artık hangi
günden bakılırsa bakılsın süzer (not_before).
