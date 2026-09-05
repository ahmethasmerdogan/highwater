# HIGHWATER arayüzü v4 — "Kontrol Odası"

> Üç bağımsız tasarım turunun sentezi (2026-09-05). Üçü de aynı teşhise vardı:
> panel bir işlem terminali gibi kurulmuştu, oysa sistem 30 kollu bir ölçüm
> deneyi. Üçü de aynı şeyleri silmeyi önerdi (Botlar, Pozisyonlar, Piyasa,
> Sohbet, Terminal, kutlama katmanı) ve aynı kavramı eklemeyi: **hipotez**.

## 1. Tez

**Bu panel 30 kollu bir ölçüm deneyinin kontrol odasıdır. Her ekranın birinci
işi sistemin şu anda doğru çalıştığını kanıtlamak, ikinci işi hangi hipotezin
ne kadar kanıt topladığını göstermek. Kâr üçüncü sıradadır ve künyesi olmadan
ekrana çıkmaz.**

Gerekçe ölçülmüş: 2026-09-04/05'te sekiz arıza bulundu, hiçbiri hata vermedi,
hiçbiri panelde görünmedi, hepsi elle ölçümle çıktı. Bu sistemin en pahalı
hatası çökmek değil, **sessizce yanlış çalışmak**.

Kullanıcı: tek kişi, sistemin sahibi, hem geliştirici hem yatırımcı, günde
birkaç kez birkaç dakika bakıyor, 30 gün komut vermiyor. Panel bir kumanda
değil, bir **denetçi**. Sorduğu soru: "bugün benden habersiz ne bozuldu?"

## 2. Beş bozulmaz arayüz kuralı

1. **Sessizlik bir durumdur.** Olmayan olay, olan olay kadar görünür olmalı.
   Bir sayacın artmayı bırakması ekranda yer kaplar.
2. **Her sayının künyesi vardır**: n, pencere, kesit (`config_hash` + dilim +
   yön), üretim zamanı. Künyesi olmayan sayı basılmaz.
3. **Payda gizlenmez.** "615 test geçti" değil, "615 geçti · 0 başarısız ·
   0 atlandı". Sekiz arızanın altısı payda gizlendiği için görünmezdi.
4. **Geçersizlik geriye işler.** Bir ölçüm sonradan geçersiz ilan edilebilir;
   ekranda üstü çizili durur ve sebebi yazılıdır.
5. **Yeşil yoktur.** Sağlıklı durum renksizdir. "Her şey yolunda" duygusu tam
   olarak sekiz arızanın verdiği sahte güvendir.

## 3. Bilgi mimarisi — beş ekran

Sistemin beş katmanı var; her katmana bir ekran: **veri → karar → ölçüm →
hipotez → para**. Ekranlar nesne türüne göre değil, **soruya göre** bölündü.

| # | Ekran | Cevapladığı tek soru |
|---|---|---|
| 0 | **Nöbet** `/` | Sistem şu an sağlam mı, dün geceden beri ne bozuldu? |
| 1 | **Zincir** `/zincir` | Karar nasıl alındı, aday nerede öldü, veri sağlam mı? |
| 2 | **Kanıt** `/kanit` | Puanlamanın öngörü gücü var mı, hangi kesitte, kaç satırla? |
| 3 | **Hipotez** `/hipotez` | Hangi soru soruluyor, kanıt ne durumda, karar ne zaman? |
| 4 | **Defter** `/defter` | Ne kazandık, hangi koşulda, kaç işlemle? |

Kalıcı katmanlar (sayfa değil): **künye şeridi** (üstte, her ekranda),
**kütük çekmecesi** (sağdan, `~`), **zincir çekmecesi** (her sayıdan açılır),
ayarlar (modal).

**Silinenler ve gerekçeleri.** Botlar: bot bir nesne değil, hipotezin
taşıyıcısı. Pozisyonlar: pozisyon bir kararın sonucu. Piyasa: havuz, karar
zincirinin ilk basamağı. Maraton: ayrı bir yarış değil, hipotez tahtasının bir
grubu. Günlük: kütük çekmecesi. Terminal: her paneli daha iyi yapan bir ekran
zaten var. Sohbet: tek kullanıcı. Kutlama katmanı (konfeti, kazanç kartı):
beklentisi −0,083R olan bir sistemin kullanıcısını tebrik etmesi yalandır.

v3'te 10 sayfa vardı ve her biri bir nesne türünü listeliyordu. Nesne başına
sayfa, sentezi kullanıcıya bırakır: "bot 12 donmuş" Botlar'da, "BIST barı geldi"
Piyasa'daydı; ikisini birleştirip "önbellek bozuk" sonucuna varmak arayüzün
değil insanın işiydi. Sekiz arızanın sekizi de bu boşlukta yaşadı.

## 4. Amiral bileşen: karar hunisi

`/zincir` ekranının merkezi. Her basamakta iki sayı yan yana durur: **kaç aday
öldü** ve **ölenlerin ölçülen kenar özelliği neydi**.

```
  havuz kesiti                121 sembol          ölen sakinlik   geçen sakinlik
  ├─ KAPI min_score ≥ 80      12  (−109)              49,2            88,6
  ├─ slot boş (max 4)          9  (−3)                88,1            88,8
  ├─ BOYUTLANDIRMA
  │    stop çok uzak          72 öldü                 10,7             —
  │    boyut sıfır (bütçe)   402 öldü                 62,5             —
  │    min_fill_ratio %25    293 öldü                 82,0             —   ◤◤
  └─ POZİSYON AÇILDI         112                       —              36,0
```

Huni tek başına "293 aday doluluk kapısında öldü" der — bu bilgi değildir,
sistem zaten öyle çalışıyor. Yanına "ölenlerin sakinlik yüzdeliği 82,0,
açılanların 36,0" konunca huni bir **teşhis aracı** olur ve §9'daki t = −9,20
bulgusu kalıcı bir organa dönüşür.

## 5. Hipotez kartı ve mekanizma ölçüsü

Ölçüldü (MEYDAN-OKUMA, 2026-09-05): 14 günlük "kontrol + 0,05R" kuralı bugünkü
hızda **149 yılda** karar verir. Kol defteri düşük güçlü bir kanaldır. Bu yüzden
her ön-kayıt **iki ölçü** taşır:

1. **Mekanizma ölçüsü** — yüksek güç, kesitsel, saatler. "Kol yapması gerekeni
   yaptı mı?" K1 için: açılan pozisyonların sakinlik yüzdeliği 36,0'dan ≥ 60'a
   çıktı mı? Örneklem günde yüzlerce karar; t = +5 mertebesinde cevap.
2. **Sonuç ölçüsü** — düşük güç, kol defteri, aylar. R beklentisi. Birikir,
   hüküm vermez, kalın yazılmaz, belirsizlik aralığıyla basılır.

Hüküm mekanizmadan okunur. Mekanizma ölçüsü tanımlanamayan kol (saf kaldıraç
kolları) **`GÜÇSÜZ`** damgası alır ve sonuçlanamayacağını baştan ilan eder.

Ön-kayıt kutuludur ve değişmezdir: hipotez cümlesi, kontrol kolu, tek fark,
mekanizma ölçüsü + hedef + gereken n, çürütme koşulları, karar tarihi, tanım
mührü (hash). Mühür kırılırsa kanıt geçersizdir.

## 6. Görsel dil

**Renk beş, hepsi anlam taşır.** Mürekkep (metin, sağlıklı sayı), ikincil
(etiket, künye), ölü (gri, üstü çizili), **kırmızı** (bozuk, kural ihlali,
negatif para), **amber** (şüpheli, bayat, kısmi), **çivit** (ölçülmüş kanıt:
IC, desil, kabul kararı). Yeşil yok.

Kâr renk kazanmaz, zarar kazanır. Asimetriktir ve öyle olmalı: renk bütçesi
kârdan alınıp güvene aktarıldı. Yön ayrıca işaretle kodlanır (renk körlüğü).

**Tipografi üç ses.** Muhakeme (hipotez, gerekçe, çürütme): serif, 14,5px —
kullanıcı bir bloğa bakınca okumadan önce "bu benim iddiam mı, makinenin ölçtüğü
sayı mı" bilir. Etiket: sans, 11px, büyük harf. Ölçüm: mono + `tabular-nums`,
12,5px (anayasa kuralı 6). **Metin asla mono değil.**

**İki ölçek.** Duvar (Nöbet): sayı 20–28px, uzaktan okunur. Masa (diğerleri):
12–14px, yoğun tablo. Üçüncü yoğunluk yok; DataGrid'in yoğunluk seçicisi kalkar.

**Hareket iki tane.** Durum geçişinde 120 ms renk, çekmecede 260 ms kayma.
Sayı sayaç animasyonu yok: okunan sayı değişmemeli, `tabular-nums`'ın varlık
sebebi budur.

**Açık tema varsayılan.** Koyu zeminde her şey biraz alarm gibi görünür; bu
tasarımda alarm nadir ve pahalı olmalı.

## 7. Güven katmanı

**Künye durumları:** taze (renksiz), bayat (amber "3 bar geride"), eksik
(payda görünür: `78/80`), şüpheli (amber noktalı alt çizgi — üretildiği dönemde
bir bayrak açıktı), geçersiz (üstü çizili + sebep).

**Üç sayaç sınıfı:** OLDU (mürekkep), OLMADI-BEKLENİYORDU (kırmızı, tepeye
çıkar), HİÇ OLMADI (gri `◼` ölü rozeti). Üçüncüsü doğrudan §10'dan: rotasyon
ömür boyu 1 kez, kalabalık cezası %0,44, korelasyon kümesi 0. Yapılandırılmış
ama hiç iş görmemiş bir kural koruma değil **yanılsamadır**.

**Bütçeler — payda göstermek.** Bar bütçesi (beklenen/işlenen), sembol bütçesi,
zaman bütçesi (**kesici payı** = supervisor eşiği ÷ ölçülen p90; 2026-09-04'te
35 ÷ 270 = 0,13×, kural ≥ 1,5×), bağlantı bütçesi, test bütçesi, kanıt bütçesi
(gereken n / eldeki n). Hiçbiri yeni ölçüm gerektirmiyor; hepsi zaten üretilen
sayıların paydasını göstermek.

**Kesit seçici zorunlu, "tümü" yok.** Her IC/kalibrasyon rakamı tek
`config_hash` + dilim + yön üzerinden. Bu, 8. arızayı (ölçek karışımı)
**imkânsız** kılar.

### Sekiz arızanın karnesi

| # | Arıza | v4'te |
|---|---|---|
| 1 | Supervisor karar sırasında öldürüyor | **kesici payı 0,13×** — tek satır, ilk bakış |
| 2 | 20 kol aynı hesabı yapıyor | bar bütçesi p50 + dolum sapmasının R karşılığı yan yana |
| 3 | Boyutlandırma kenarı eliyor | **karar hunisi** — amiral bileşen |
| 4 | Bağlantı tavanı, 32 test atlandı | kaynak bütçesi + test satırında ATLANDI payı |
| 5 | Kapanmamış mum yazıldı | `açık bar yazıldı (=0)` satırı + 4h↔1h çapraz denetim |
| 6 | Karne katılım öncesini sayıyor | açılan pozisyon ile karne işlem sayısı yan yana (kısmen) |
| 7 | Backtest kesici kilidi | rapor künyesinde **ölü bar oranı**; %5 üstü sonuçları çizer |
| 8 | Kalibrasyon ölçek karışımı | kesit seçici zorunlu — **yapısal olarak imkânsız** |

Dürüst not: 1, 3, 4, 5, 7 doğrudan yakalanır; 2 belirti düzeyinde; 6 göze
dayanır; 8 önlenir ama tespit edilmez. Önbelleğin BIST kolunu dondurması
olayında panel donmayı gösterir ama **sebebini söyleyemez** — kontrol odası bir
arızanın varlığını kanıtlar, kökünü değil. Kök sebep hâlâ elle bulunur; panelin
işi o ölçümün ne zaman yapılacağını söylemek.

## 8. Motordan istenenler

Durum 2026-09-05 akşamı itibarıyla işaretlendi.

1. ✅ **`entry_decisions` tablosu** — `SizingEngine.steps` ve `reject_reason`
   yapılandırılmış olarak (önceden serbest metin `bot_events`). Karar hunisi
   bunsuz kurulamazdı. Göç 0013; basamaklar `havuz · kapi · slot · veri ·
   boyut · acildi`. Bütçe erken çıkışında denenmeyen adaylar da sayılıyor —
   yoksa huni eksik sayardı.
2. ✅ **`bots.config` içinde birinci sınıf ön-kayıt alanları** — 21 deney kolu
   `on_kayit` aldı ve mühürlendi (`scripts/on_kayit_backfill.py`). Maraton
   kollarına dokunulmadı: onlar kontrol.
3. ❌ **`measurement_invalidations` tablosu** — geçersizlik geriye işlesin.
   Arayüz tarafı hazır (`Olcum`'un `gecersiz` alanı üstü çizili + sebepli
   basıyor); tablo ve uç henüz yok.
4. ❌ **Çapraz bar denetimi arka plan işi** (4h ↔ 4×1h). `is_closed` sayacı
   yapıldı ve Nöbet'te duruyor; çapraz denetim yok.
5. ✅ **`/calibration`'da `config_hash`** — varsayılan doluyor; panel tarafında
   kesit seçimi yapılmadan hiçbir rakam basılmıyor (8. arıza yapısal olarak
   imkânsız).
6. ✅ **`/kontrol/{nobet,huni,hipotez}`** — üç uç, 14 test.
7. ✅ **Kesit seçicisinin indeksi** (göç 0014) — seçici 9,86 sn'den 0,16 sn'ye
   indi. Zorunlu bir kapı, açılması 10 saniye süren bir kapı olamaz.

## 9. Bilinçli olarak yapılmayanlar

Kâr tahmini ve projeksiyon (sistemin çıktısı ölçüm, vaat değil). Canlı fiyat
şeridi (karar birimi 1 saatlik mum; saniyelik tik kaygı üretir ve 30 gün
komut vermeme sözünü zorlar). Bildirim zili (günde ~600 üretiliyor, hiç
okunmuyor; okunmamış sayısı bir sağlık ölçüsü değil). Filo liderlik tablosu
(ayırt etme gücü ±2,18R iken kâra göre sıralamak gürültüyü sıralamaktır).
Özelleştirilebilir düzen (sabit düzen = sabit göz alışkanlığı = eksikliğin fark
edilmesi). Mobil tam işlevsellik (yoğun tablo telefonda dürüstçe okunamaz).
Koyu tema (renk bütçesi ikiye bölünmemeli). Elle emir verme (30 gün müdahale
edilmeyecek bir sistemde bu düğmeler yalnızca deneyin bozulma yoludur).
