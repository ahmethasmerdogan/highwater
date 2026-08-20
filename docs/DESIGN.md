# SARNIÇ — Tasarım Şartnamesi

> **Öncelik kuralı:** HashUI kazanır. Bu belge HashUI'yi değiştirmez; yalnızca onun üstüne
> **Terminal katmanı** ekler. Bir çakışma olursa HashUI token'ı geçerlidir.
> HashUI dosyaları projeye `design/hashui/` altına konur ve Claude Code önce onu okur.

---

## 1. Ürünün karakteri

Bu bir "fintech dashboard" değil. Bir **ölçüm aleti**. Kullanıcı buraya heyecanlanmak için değil,
*ne olduğunu görmek* için geliyor. Tasarımın işi güven vermek değil, **okunaklı olmak**.

Üç ilke:

1. **Sayı kutsaldır.** Her rakam monospace, `tabular-nums`, sağa hizalı. Hizalanmayan bir sütun hatadır.
2. **Her sayının bir gerekçesi vardır.** Puan görünüyorsa, neyden oluştuğu bir tık uzakta olmalı.
   Açıklanamayan hiçbir sayı ekranda durmaz.
3. **Kötü haber saklanmaz.** Zarar, drawdown, başarısız kalibrasyon — hepsi kazanç kadar görünür
   yerde. Boş durum bir davettir, hata bir yönlendirmedir; ikisi de özür dilemez.

**İmza bileşeni:** *Puan Kartı*. Bir coinin 0–100 puanı, beş aile katkısına bölünmüş yatay yığılmış
bir çubuk; yanında S/R geometrisini gösteren minyatür bir fiyat merdiveni. Tek bakışta "puan kaç"
değil, **"puan neyden oluşuyor"** görülür. Sistemin tüm felsefesi bu bileşende.

---

## 2. Terminal katmanı — token'lar

Terminal sayfası ve TUI, Bloomberg'in klasik kehribar-siyah kimliğini taşır. Bu nostalji değil
işlevdir: koyu zeminde kehribar, uzun süreli veri okumada en düşük göz yorgunluğunu veren
kombinasyonlardan biridir ve renk kanalını kâr/zarar için serbest bırakır.

```css
/* design/terminal.css — yalnızca .terminal-scope içinde geçerli */
.terminal-scope {
  /* Zemin — saf siyah değil, mavi-yeşile çalan derin bir gri */
  --t-void:      #07090B;
  --t-panel:     #0D1114;
  --t-panel-2:   #12181C;
  --t-rule:      #1A2126;

  /* Veri rengi — P3 fosfor kehribarı (miras, keyfi değil) */
  --t-amber:     #FFB000;
  --t-amber-dim: #A67200;

  /* İkincil veri */
  --t-cyan:      #4EC9E0;

  /* Yön */
  --t-up:        #26D07C;
  --t-down:      #FF4D4D;
  --t-warn:      #FF8A3D;

  /* Metin */
  --t-text:      #C9D3D9;
  --t-muted:     #6B7A82;

  --t-radius:    2px;      /* neredeyse kare — veri ızgarası, kart değil */
  --t-row:       22px;     /* satır yüksekliği; yoğunluk bilinçli */
}
```

**Renk disiplini:** Kehribar = veri. Cyan = ikincil/referans. Yeşil-kırmızı **yalnızca** yön için.
Turuncu yalnızca uyarı. Marka rengi olarak yeşil veya kırmızı kullanılmaz — o iki renk rezervedir.

**Tipografi:**
- Veri: `IBM Plex Mono` — 12px/`--t-row`, `font-variant-numeric: tabular-nums`
- Arayüz kromu (başlık, menü, buton): HashUI'nin kendi ailesi
- Bu ikilik bilinçlidir: mono gördüğün her yerde **veri** vardır, orantılı gördüğün her yerde **komut**.

**Yoğunluk:** Terminal sayfasında padding cömert değildir. 22px satır, 8px hücre içi yatay boşluk.
Ekranda az veri göstermek burada bir tasarım hatasıdır.

---

## 3. Panel kabuğu

```
┌────────┬──────────────────────────────────────────────────────────────┐
│        │  ⌘K komut  ·  havuz ⬤100  ·  bot ⬤3  ·  ⚠ 0  ·  🔔 2  ·  ME │
│  yan   ├──────────────────────────────────────────────────────────────┤
│  menü  │                                                              │
│        │                        içerik                                │
│        │                                                              │
└────────┴──────────────────────────────────────────────────────────────┘
```

**Üst çubuk her sayfada dört sistem sinyalini taşır** — havuz boyutu, çalışan bot sayısı, aktif
alarm sayısı, okunmamış bildirim. Bunlar dekorasyon değil: kullanıcı hangi sayfada olursa olsun
sistemin canlı olup olmadığını bilmek zorunda.

**Bağlantı göstergesi:** WebSocket kopunca üst çubuk kehribar bir şeride döner ve
"canlı veri kesildi · yeniden bağlanılıyor" yazar. Sessizce eski veriyi göstermek yasaktır.

**⌘K komut paleti:** sembol ara, sayfaya git, botu durdur, backtest başlat, kill switch.

**Yan menü grupları:**
`İzleme` (Panel · Terminal · Havuz · Puanlar · Kalibrasyon) ·
`İşlem` (Botlar · Pozisyonlar · Stratejiler · Backtest · İndikatörler) ·
`Ekip` (Sohbet · Bildirimler) ·
`Yönetim` (Kullanıcılar · Entegrasyonlar · Loglar · Ayarlar)

---

## 4. Terminal sayfası

`dockview-react` ile çok panelli çalışma alanı: sekmeler, sürükle-bırak, bölme, kayan panel,
ayrı pencereye çıkarma (çoklu monitör). Yerleşimler kullanıcı başına kaydedilir.

Üç hazır şablon: **Tarama Odaklı** · **Grafik Odaklı** · **Filo İzleme**.

**Komut satırı** üstte, her zaman odaklanabilir (`/` veya `⌘K`). Sözdizimi `SEMBOL KOMUT ARG`:

| Komut | İş |
|---|---|
| `SOLUSDT G 1h` | Grafik aç |
| `SOLUSDT SC` | Puan Kartı |
| `SOLUSDT SR` | S/R seviyeleri paneli |
| `SCAN 80` | Puanı ≥80 olanları listele |
| `POOL` | Havuz + filtre hunisi |
| `POS` / `ORD` | Pozisyonlar / emirler |
| `BT SOLUSDT` | Hızlı backtest |
| `KILL` | Kill switch (onay ister) |

Klavye öncelikli: `←/→` sembol geçişi, `1–5` zaman dilimi, `.` son komutu tekrarla.

**Panel tipleri:** Grafik (Lightweight Charts + S/R çizgileri + formasyon işaretleri + giriş/stop
seviyeleri) · Puan tablosu · Puan Kartı · Havuz · Pozisyonlar · Emirler · Log akışı · Kalibrasyon
mini-grafiği.

---

## 5. Puan Kartı (imza bileşen)

```
┌──────────────────────────────────────────────────────────┐
│  SOLUSDT                                    87.4  ▲ 2.1  │
│  ────────────────────────────────────────────────────    │
│  ████████████ ██████████ ████████ █████ ███  ▏+4.0       │
│  trend 26.1   mom 21.8   akış 17.2 vol   sr   formasyon  │
│                                    11.0  8.3             │
│                                                          │
│  başlıca sebepler                    S/R geometrisi      │
│  · 4h trend uyumlu          +8.2     ┌─ 182.10  direnç   │
│  · taker alım oranı %62     +6.1     │      ● 172.10     │
│  · boğa bayrağı (hacim ✓)   +4.0     └─ 168.40  destek   │
│                                        R/R  2.31         │
└──────────────────────────────────────────────────────────┘
```

- Yığılmış çubuk beş aileyi **gerçek oranlarında** gösterir; formasyon değiştiricisi çubuğun
  sonunda ayrı bir parça olarak durur (pozitifse kehribar, negatifse kırmızı).
- "Başlıca sebepler" `rationale.top_drivers`'tan gelir — en fazla üç madde.
- Fiyat merdiveni gerçek ölçekli: destek ve direnç arası mesafe görsel olarak doğru.
- Karta tıklamak puanın 7 günlük geçmiş grafiğini açar.

Bu bileşen Terminal sayfasında, Puanlar sayfasında ve pozisyon detayında **aynı** görünür.
Tek bir bileşen, üç yerde.

---

## 6. Kalibrasyon sayfası

Sistemin dürüstlük organı. Üç görsel:

1. **Desil grafiği** — puan desili (x) → ortalama 24s ileri getiri (y), güven aralığıyla.
   Monoton artıyorsa puanlama çalışıyor. Düzse çalışmıyor ve sayfa bunu büyük puntoyla yazar.
2. **IC zaman serisi** — aile bazında bilgi katsayısı, 30 günlük kayan pencere. Bir ailenin IC'si
   uzun süre sıfır civarındaysa ağırlığı sorgulanır.
3. **Paper vs backtest izleme hatası** — canlı özsermaye eğrisi, backtest güven bandının üstüne
   çizilir. Bant dışına çıkma modelin çürüdüğünün ilk işaretidir.

Boş durum metni: *"Henüz yeterli gözlem yok. En az 30 gün ve 500 puanlama gerekiyor —
şu an 112."* Belirsiz değil, sayı verir.

---

## 7. Yazı dili

- Türkçe, cümle düzeni, süs yok. Sistem terimleri değil kullanıcı terimleri:
  "bildirim kuralları", "webhook yapılandırması" değil.
- Butonlar ne yaptığını söyler: **Botu durdur**, *Gönder* değil. Aynı eylem akış boyunca aynı adı taşır:
  "Durdur" butonuna basınca gelen bildirim "Durduruldu" der.
- Hatalar özür dilemez, ne olduğunu ve ne yapılacağını söyler:
  *"Binance ağırlık limiti aşıldı, 42 saniye sonra tekrar denenecek. Yeni emir gönderilmiyor."*
- Risk uyarıları yumuşatılmaz. Kill switch butonunun altında: *"Tüm botlar durur, açık emirler
  iptal edilir. Geri alınamaz."*

---

## 8. Kalite tabanı

- Mobilde okunabilir (Terminal sayfası hariç — o masaüstü içindir ve mobilde uyarı gösterir).
- Klavye odağı her zaman görünür.
- `prefers-reduced-motion` desteklenir; hareket zaten minimumdur (bu üründe animasyon dikkat
  dağıtır — tek istisna: değişen sayının kısa bir kehribar parlaması, 150 ms).
- Koyu mod varsayılandır. Açık mod HashUI'den gelir; Terminal katmanı açık modda da koyu kalır
  (bilinçli — veri ızgarası bağlam değiştirmez).

---

## 9. TUI görsel dili

Aynı token'ların terminal karşılığı. Textual CSS'i `--t-*` paletinin ANSI/truecolor eşleniğini kullanır.

Açılış banner'ı (Claude Code'un logo alanına karşılık gelen bölüm):

```
   ▄▄▄  ▄▄▄  ▄▄▄  ▄▄  ▖ ▄▄▄  ▄▄▄
   ▚▄   ▙▄▟  ▚▄▘  ▛▚ ▌  ▐    ▚▄
   ▄▄▛  ▛ ▜  ▛ ▚  ▌ ▚▌  ▟▄▖  ▄▄▛     paper · v0.1.0
   ────────────────────────────────────────────────
```

Banner altında tek satır durum: mod · bakiye · günlük P/L · açık pozisyon · havuz boyutu ·
bağlantı göstergesi (`⬤` yeşil canlı / kehribar yeniden bağlanıyor / kırmızı kopuk).

Log satır formatı — sabit genişlikli, hizalı:
```
HH:MM:SS  SEVİYE  mesaj
```
Seviye renkleri: `INFO` gri · `SCORE` kehribar · `ENTRY` yeşil · `EXIT` cyan · `RISK` turuncu ·
`ERROR` kırmızı · `CRITICAL` kırmızı zemin + beyaz metin.
