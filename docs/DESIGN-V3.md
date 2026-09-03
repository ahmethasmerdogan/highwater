# HIGHWATER arayüzü v3 — "Gözlemevi"

> Sıfırdan tasarım. Önce araştırma, sonra karar, sonra kod. Bu belge
> kodun önünde yazıldı; kod bu belgeye uyar, tersi değil.

## 1. Araştırma: bu sistem NEDİR ve arayüz kimin için

**Sistem:** kağıt üstünde, kesitsel puanlamayla işlem yapan bir makine.
Üç pazar (kripto 15m–4h, BIST 1d, ABD 1d), dokuz+ bot kolu, devre kesiciler,
backtest, kalibrasyon, 30 günlük maraton. **İnsan hiçbir şey alıp satmaz.**
Arayüzün işi *işletmek* değil *okumak*: sistemin ne yaptığını, neden
yaptığını ve ölçümün ne dediğini insana anlatmak. Karar birimi mum
kapanışıdır (15 dk–1 gün) — yanıp sönen, saniye sayan bir terminal değil,
sakin bir **gözlemevi**.

**Kim bakıyor:** sahibi — günde birkaç kez telefondan/dizüstünden bir
bakış ("yaşıyor mu, para nerede, benden bir şey istiyor mu"), haftada
birkaç kez masaüstünden derin okuma ("bu bot neden bunu yaptı, puanlama
öngörüyor mu, bu varyant kabul edilir mi"). Nadiren VIEWER rolünde
izleyiciler.

**Beş soru, beş ekran ailesi** (araştırmanın çıktısı budur):

| soru | ekran | okuma biçimi |
|---|---|---|
| Yaşıyor mu, bugün ne oldu? | Köprü | günlük gazete: manşet + bugünün hikâyesi |
| Yarış nerede? | Maraton | lig tablosu + yarış eğrisi |
| Piyasa ne diyor? | Piyasa | defter: sıralı liste + sembol dosyası |
| Makine ne yaptı, neden? | Botlar · Pozisyonlar · Günlük | kayıt defteri + gerekçe |
| Ölçüm ne diyor? | Araştırma | rapor: metrik kutuları + eğri + işlem defteri |

Terminal (Bloomberg kipi) ve Yönetim bu ailelerin dışında, kendi dilinde.

**Eski tasarımın araştırmayla çelişen yanları:** sol ray + 21 girdi (menü
sayfa listesiydi, niyet değil); amber-siyah "terminal" estetiği her sayfaya
yayılmıştı (sakin okuma yerine kokpit); üst şeritte altı mini sayı (hiçbiri
okunmuyordu); her sayfa "panel yığını" (tek etkileşim: kaydır); açık tema
ikinci sınıf; uicean yalnız bir sayfada. v2 yalnız mimariyi düzeltti,
görsel dili korudu — bu belge görsel dili de sıfırlıyor.

## 2. Görsel dil: uicean, tek temel

- **Temel:** `uicean` token'ları TEK kaynak: `canvas › surface › elev ›
  inset`, `line/line-strong`, `ink/ink2/ink3`, `brand/brand-ink/brand-soft`,
  tek `--radius`. Gölge YOK; derinlik yüzey kademesi + hairline. Eski
  `--sn-*` paleti silinir; `--sn-*` adları yalnız uicean token'larının
  takma adı olarak kalır (köprü tersine: sn → uicean).
- **Vurgu:** uicean `blue` ön ayarı ("calm, institutional"). Yeşil/kırmızı
  yalnız YÖN içindir (kâr/zarar, yukarı/aşağı); marka rengi asla yön
  anlamı taşımaz. Amber yalnız uyarı. Eski amber marka gider.
- **Açık ve koyu eşit vatandaş;** varsayılan sistem teması. Terminal
  sayfası tek istisna: kendi koyu Bloomberg kipi.
- **Tipografi:** Geist (metin), Geist Mono (SAYILAR, `tabular-nums`,
  kural 6). Büyük sayı 28–34px mono semibold; gövde 13px; tablo başlığı
  11,5px büyük harf `tracking 0.04em` ink3 (uicean `Th`). Metin asla mono.
- **Ölçek:** 4px ızgara; içerik 12 sütun, azami 1440px; boşluk cömert
  (uicean `py-2.5` satırlar, `rounded-2xl` kartlar). Yoğunluk okuma
  yoğunluğudur, terminal yoğunluğu değil.
- **Hareket:** bölümler `Reveal` ile bir kez belirir; manşet sayıları
  `NumberTicker`/spring ile sayar; satır hover; canlı nokta dışında hiçbir
  şey yanıp sönmez. `prefers-reduced-motion` saygılıdır.
- **Grafik:** hairline ızgara, ink3 eksen, bir vurgu + nötr seriler,
  alan dolgusu `brand-soft`; yön renkleri yalnız kâr/zarar serilerinde.
- **Puan 0–100:** çubuk değil **ölçek** (uicean `DottedMeter`/`RangeBar`);
  kapı çizgisi ölçeğin üstünde işaretlidir.

## 3. Yerleşim grameri

```
┌──────────────────────────────────────────────────────────────┐
│ HIGHWATER   Köprü Maraton Piyasa Botlar Pozisyonlar …   ⌘K ◐ │  ← manşet çubuğu (üst nav)
├──────────────────────────────────────────────────────────────┤
│ ● Kripto 12 dk  ● BIST seans ✓  ● ABD seans ✓ │ 9/9 kol │ Dikkat 1 │ 24.111 ▲16 │  ← şerit
├──────────────────────────────────────────────────────────────┤
│  Sayfa manşeti: başlık · tek cümle duruş · zaman damgası       │
│  ┌ LEDGER BLOĞU ───────┐ ┌ LEDGER BLOĞU ──────────────────┐   │
│  │ büyük harf etiket    │ │                                │   │
│  │ içerik               │ │                                │   │
│  └──────────────────────┘ └────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────┘
                                   ┌──── Sheet (sağ) ────┐  ← ayrıntı
```

- **Sol ray yok.** Gezinme üstte, dokuz niyet (`PillNav`); telefonda alt
  rıhtıma iner. Sayfa manşeti (masthead) her sayfada aynı: başlık, tek
  cümle duruş, "tazelendi" damgası.
- **Şerit** (ribbon) gezinmenin altında, her sayfada: üç akış nabzı
  (metinli: "Kripto · 12 dk önce"), filo, tıklanır DİKKAT sayacı,
  özsermaye + bugün. Kaynak `/system/attention` + `/portfolio/live`.
- **Ledger bloğu** tek bölüm birimi: büyük harf etiket + isteğe bağlı
  sağ eylem + içerik. Eski "Panel"in yerine; kart değil, defter sayfası.
- **Ayrıntı = Sheet.** Sembol, işlem, olay, bot gerekçesi sağdan açılır;
  liste kaybolmaz; URL'de (`?sembol=`, `?islem=`).
- **Komut = ⌘K.** Sayfa, sembol, bot; `g`+harf, `.` dikkat.

## 4. Ekranlar

1. **Köprü** — gazete. Manşet: "HIGHWATER · maratonun N. günü". "Bugün"
   bloğu: makine yazımı 3–5 cümle (kapanan işlemler ve toplamı, açılan
   pozisyonlar, dikkat kalemleri, akış durumu) — sayılar mono. Filo bloğu:
   **defter tablosu** (kol · pazar · bar · durum · getiri · açık · mini
   eğri), kart ızgarası değil. Yarış bloğu (katılım endeksli). Dikkat
   bloğu (liste, sunucudan aynen).
2. **Maraton** — lig: sıralama defteri + yarış eğrisi + haftalar
   `StageFlow`.
3. **Piyasa** — pazar `SegmentedControl`; havuz/puan `UnderlineTabs`;
   defter tablosu (puan `DottedMeter`); sembol `Sheet` (puan kartı, fiyat
   + S/R, formasyon, geçmiş); huni `Collapsible`.
4. **Botlar** — kol defteri (koşan / arşiv); bot sayfası: manşet + 4
   `StatTile` (mono) + `UnderlineTabs` (gidişat · işlemler · gerekçe);
   risk durumu `StatusPill`'ler.
5. **Pozisyonlar** — sekmeler URL'de; R ve stop mesafesi `RangeBar`.
6. **Araştırma** — rapor: koşu `OverviewTile`'lar + eğri + işlem defteri;
   strateji sürümleri; kalibrasyon.
7. **Günlük** — gün başlıklı akış; olay `Sheet`'i; bildirimler; kalite;
   denetim.
8. **Terminal** — Bloomberg kipi, dokunulmaz.
9. **Yönetim** — `Card` + `Field/Label` formları; hesap, kullanıcılar,
   entegrasyonlar, ayarlar.

## 5. Bileşen sözlüğü (uicean → HIGHWATER)

| ihtiyaç | uicean | HIGHWATER sarmalayıcı (`src/ui/`) |
|---|---|---|
| sayfa başı | — | `Masthead` |
| bölüm | `Card` | `Ledger` (etiket + eylem + içerik) |
| büyük sayı | `StatTile`/`OverviewTile` | `Figure` (mono, yön rengi, alt satır) |
| durum | `StatusPill`/`DotPill` | `State` (bot/akış/kesici eşlemesi) |
| ölçek | `DottedMeter`/`RangeBar` | `Score`, `Distance` |
| tablo | `DataTable` (hafif) / `DataGrid` (ağır, TanStack) | `Ledger.Table` |
| sekme | `UnderlineTabs` | URL'ye bağlı `Tabs` |
| ayrıntı | `Sheet` | `Detail` (URL'ye bağlı) |
| komut | `Command`/cmdk | `Palette` |
| hareket | `Reveal`, `NumberTicker` | — |

Sayı biçimleme `lib/format.ts`'te kalır (Türkçe yerel, mono).

## 6. Yapılmayacaklar

- Amber marka, siyah zemin (Terminal hariç), gölge, sol ray, panel
  yığını, mono metin, altı mini sayı, kutlama süsleri (kazanç kartı
  paylaşımı Pozisyonlar'da bir eylem olarak kalır; sayfayı işgal etmez).
