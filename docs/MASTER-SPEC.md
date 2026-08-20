# SARNIÇ — Teknik Şartname v1.0

**Tarih:** 13 Ağustos 2026 · **Durum:** İnşaat öncesi · **Mod:** Paper (canlı para yok)

---

## 0. Bu belgenin okunma biçimi

Bu belge bir *katedral planı* değil, bir *iskele*dir. İçindeki her ağırlık, eşik ve parametre bir
**başlangıç hipotezidir**, keşfedilmiş bir gerçek değil. Faz 0a'nın işi bunların hangisinin
gerçekten değer kattığını ölçmektir.

Sistemin birincil çıktısı kâr değil, **kalibre edilmiş bir cevaptır**: "bu puanlama ileri getiriyi
öngörüyor mu?" Panel bu cevabı, hoşumuza gitmese bile göstermek zorundadır.

**Bilinen gerçekçilik zemini:** Kriptoda basit bir kesitsel sıralama sistemi için makul hedef,
maliyet ve kayma sonrasında eşit ağırlıklı likit-100 sepetini risk-ayarlı olarak geçmektir.
Yıllık üç haneli getiri beklentisi bu belgenin kapsamı dışındadır.

---

## 1. Sistem özeti

```
                      ┌──────────────────────────────────────────┐
                      │   MarketDataService  (tek çıkış noktası) │
                      │   Binance WS + REST → Redis + Timescale   │
                      └───────────────┬──────────────────────────┘
                                      │
        ┌─────────────────────────────┼─────────────────────────────┐
        │                             │                             │
┌───────▼────────┐          ┌─────────▼─────────┐         ┌─────────▼────────┐
│ UniverseEngine │          │  FeatureEngine    │         │   BotSupervisor  │
│ 24s'te bir     │─havuz──▶ │ indikatör + S/R   │──özellik▶│  worker'lar     │
│ + snapshot     │          │ + formasyon       │         │  (izole süreç)   │
└────────────────┘          └─────────┬─────────┘         └─────────┬────────┘
                                      │                             │
                            ┌─────────▼─────────┐         ┌─────────▼────────┐
                            │  ScoringEngine    │──puan──▶│  SizingEngine    │
                            │  0–100 + gerekçe  │         │  + RiskEngine    │
                            └───────────────────┘         └─────────┬────────┘
                                                                     │
                                                          ┌──────────▼─────────┐
                                                          │ ExecutionAdapter   │
                                                          │ Paper │ BinanceSpot│
                                                          └──────────┬─────────┘
                                                                     │
        ┌────────────────────────────────────────────────────────────┼──────────┐
        │                          Redis Streams (olay veriyolu)     │          │
┌───────▼──────┐        ┌──────────────┐        ┌──────────────┐   ┌─▼────────┐
│  FastAPI     │        │ Textual TUI  │        │   Discord    │   │ Postgres │
│  + WebSocket │        │  (istemci)   │        │   notifier   │   │  (kayıt) │
└───────┬──────┘        └──────────────┘        └──────────────┘   └──────────┘
        │
┌───────▼──────────────────┐
│  Next.js paneli (HashUI) │
└──────────────────────────┘
```

---

## 2. Veri katmanı

### 2.1 Binance adaptörü

**Market data (kimlik doğrulamasız):**
- `wss` akışları: `!ticker@arr` (tüm semboller 24s istatistik), `<symbol>@kline_1h`,
  `<symbol>@kline_15m`, `<symbol>@depth20@100ms` (yalnız açık pozisyon ve aday coinler için)
- REST yalnızca **geçmiş dolgu (backfill)** ve `exchangeInfo` için. `exchangeInfo` 6 saatte bir
  cache'lenir, dakikada bir çekilmez.
- Tarihsel veri: `data.binance.vision` arşivlerinden toplu indirme (REST ile 100 coin × 2 yıl
  çekmeye çalışmak IP yasağıyla biter).

**Hesap/emir (imzalı):** yalnızca `BinanceSpotAdapter` kullanır. Faz 1–9'da devre dışıdır.

**Limit yönetimi:** Merkezi bir `RateLimiter` tüm istekleri sıraya alır, `X-MBX-USED-WEIGHT-1m`
başlığını okur, %70 eşiğinde kendini yavaşlatır. `429` → üstel geri çekilme. `418` → tüm istekler
durur, `CRITICAL` alarm, insan müdahalesi beklenir. **418'de asla otomatik retry yok** — yasağı uzatır.

### 2.2 OHLCV deposu

TimescaleDB hypertable. Zaman dilimleri: `15m`, `1h`, `4h`, `1d`. `15m` ham saklanır;
üstü **continuous aggregate** ile türetilir (tutarlılık garantisi).

```sql
CREATE TABLE ohlcv (
  symbol        TEXT        NOT NULL,
  timeframe     TEXT        NOT NULL,
  open_time     TIMESTAMPTZ NOT NULL,
  open, high, low, close      NUMERIC(24,10) NOT NULL,
  volume                      NUMERIC(28,10) NOT NULL,
  quote_volume                NUMERIC(28,10) NOT NULL,
  trades                      INTEGER        NOT NULL,
  taker_buy_base              NUMERIC(28,10) NOT NULL,
  taker_buy_quote             NUMERIC(28,10) NOT NULL,
  is_closed                   BOOLEAN        NOT NULL DEFAULT TRUE,
  PRIMARY KEY (symbol, timeframe, open_time)
);
SELECT create_hypertable('ohlcv', 'open_time', chunk_time_interval => INTERVAL '7 days');
```

`taker_buy_base` alanı Binance kline'ında hazır gelir — "alım baskısı" özelliği bundan hesaplanır,
ekstra API çağrısı gerekmez.

### 2.3 Veri kalitesi denetçisi

Her backfill ve her saatlik döngü sonrası çalışır:
- **Boşluk (gap) tespiti:** beklenen bar sayısı vs gerçek. Boşluk varsa otomatik yeniden çekme.
- **Aykırı değer:** tek barda `|log return| > 0.5` → işaretle, insan onayına düşür (kötü tick mi,
  gerçek hareket mi?).
- **Bayat veri:** WS akışı 60 sn sessizse → `STALE_DATA` olayı → **yeni emir yasağı** (mevcut
  stop'lar çalışmaya devam eder).
- **Mantık kontrolü:** `low ≤ open,close ≤ high` ve `volume ≥ 0` her satırda.

Sonuçlar `data_quality_reports` tablosuna yazılır ve panelde görünür.

---

## 3. Havuz motoru (UniverseEngine)

### 3.1 Tasarım ilkesi

> Havuz bir **alfa filtresi değil, işlenebilirlik filtresidir.**
> Tek sorusu: "Bu coini spread ve slipaj beni öldürmeden alıp satabilir miyim?"
> "Yükseliyor mu?" sorusu ScoringEngine'in işidir.

Bu ayrım pazarlık konusu değildir. Havuza momentum filtresi eklemek, alım kararını iki ayrı yerde
vermek ve 24 saatlik yenilemeyi gizli bir yavaş stratejiye dönüştürmek demektir. Ayrıca literatür,
kriptoda son günün getirisi yüksek olan coinlerin — likit üst tabaka dışında — kısa vadede geri
dönme eğiliminde olduğunu gösteriyor; yani "son 24 saatte en çok yükselenler" filtresi tam olarak
yanlış coinleri seçer.

### 3.2 Filtre zinciri

Sırayla uygulanır. Her adım kaç coin elediğini loglar (panelde "havuz hunisi" olarak gösterilir).

| # | Filtre | Kural | Başlangıç değeri |
|---|---|---|---|
| 1 | `MarketFilter` | Binance Spot, `status = TRADING`, `SPOT` izni, quote = USDT | — |
| 2 | `LeveragedTokenFilter` | `UP/DOWN/BULL/BEAR/3L/3S` içeren semboller elenir | — |
| 3 | `StablecoinFilter` | Stable-stable çiftleri elenir (FDUSD/USDT vb.) | — |
| 4 | `BlacklistFilter` | Manuel kara liste (panelden yönetilir) | — |
| 5 | `QuoteVolumeFilter` | 24s `quoteVolume` azalan sırada ilk N aday | N = 250 |
| 6 | `AgeFilter` | Listelenme yaşı ≥ X gün | X = 60 |
| 7 | `SpreadFilter` | Ortalama spread ≤ %S (10 örnek, 1 saat boyunca) | S = 0,30 |
| 8 | `TickSizeFilter` | `tickSize / price` ≤ %T (1 tick devasa yüzde olmasın) | T = 0,10 ¹ |
| 9 | `VolatilityFilter` | 14 günlük yıllıklandırılmış vol ∈ [%V₁, %V₂] | 30 – 250 |

¹ T başlangıçta 0,05 idi; 2026-08-16'da 0,10'a çekildi. Tick oranı, ulaşılabilecek
en dar spread'in alt sınırıdır ve 0,05 eşiği spread eşiğinden (0,30) altı kat sıkı
kalıyordu — aynı riski ikinci kez uygulayıp havuzu yarıya indiriyordu (170 → 87).
Ayrıntı: `docs/OPEN-QUESTIONS.md` §9.20.
| 10 | `RangeStabilityFilter` | 3 günlük (high-low)/low ∈ [%R₁, %R₂] | 3 – 200 |
| 11 | `DelistFilter` | Duyurulmuş delist takvimi → anında çıkar | — |
| 12 | `TopNSelector` | Kalanlardan `quoteVolume`'a göre ilk 100 | 100 |

### 3.3 Yenileme ve snapshot

- **Planlı:** her gün 00:05 UTC.
- **Acil:** delist duyurusu, `STALE_DATA`, veya panelden manuel tetik.
- **Yumuşatma (histerezis):** Havuzdaki bir coin, sıralamada 100–120 bandına düşerse **çıkarılmaz**.
  Ancak 120'nin altına düşerse çıkar. Bu, sınırda gidip gelen coinlerin her gün girip çıkmasını
  önler. Açık pozisyonu olan coin, pozisyon kapanana kadar havuzda kalır (yeni giriş yapılmaz).

**Snapshot — bozulmaz kural:**

```sql
CREATE TABLE universe_snapshots (
  id            BIGSERIAL PRIMARY KEY,
  taken_at      TIMESTAMPTZ NOT NULL,
  reason        TEXT NOT NULL,           -- scheduled | delist | manual | stale
  config_hash   TEXT NOT NULL,           -- filtre parametrelerinin hash'i
  symbols       JSONB NOT NULL,          -- [{symbol, rank, quote_volume, spread, age_days, ...}]
  funnel        JSONB NOT NULL,          -- her filtrenin eledigi sayi
  added         JSONB NOT NULL,
  removed       JSONB NOT NULL
);
```

Bu tablo yazılmadan havuz değişikliği geçerli sayılmaz. Gelecekteki her dürüst backtest buna dayanır.

### 3.4 Neden bu kadar önemli

Survivorship bias kriptoda ölçülmüş bir felakettir: aylık yeniden dengelenen "en iyi 20 altcoin"
stratejisi bugünün listesiyle test edildiğinde ~%2.800, her ayın gerçek listesiyle test edildiğinde
~%680 getiri veriyor — yaklaşık **4 kat şişme**. Kurumsal araştırmalar tek başına bu etkinin
backtest getirilerini yıllık %17–22 şişirdiğini buluyor. Snapshot tablosu bunun tek panzehiridir.

---

## 4. Özellik motoru (FeatureEngine)

Karar zaman dilimi **1h**. 4h ve 1d ayrı sinyal değil, 1h puanının içinde birer özelliktir.

> **Neden tek zaman dilimi:** Birden çok zaman diliminin puanını hesaplayıp en yükseğini seçmek
> "kazananın laneti"dir — N gürültülü ölçümün maksimumu, gerçek değerin sistematik olarak üzerindedir.
> Seçilen şey en iyi coin değil, en şanslı ölçüm olur. Ayrıca 15m ve 4h sinyalleri farklı devir
> hızına ve maliyet profiline sahiptir; aynı puan ölçeğinde kıyaslanamazlar.
> Zaman dilimi başına *ayrı bot* çalıştırmak (Faz 9) bu soruyu dürüstçe cevaplamanın yoludur.

### 4.1 İndikatörler

`pandas-ta-classic` üzerinden. Kural: **birbirinin kopyası indikatör istiflenmez.** RSI + Stochastic +
CCI + Williams %R dört indikatör değil, aynı şeyin dört ölçümüdür.

Hesaplanan set (1h, 4h, 1d):
`EMA(20,50,200)`, `ADX(14)`, `RSI(14)`, `MACD(12,26,9)`, `ATR(14)`, `BBANDS(20,2)`,
`OBV`, `VWAP(gün)`, `realized_vol(20)`

### 4.2 Destek/Direnç motoru (`features/sr.py`)

Bu modülün çıktısı hem puanlamayı hem **stop seviyesini** besler. Algoritma:

1. **Pivot tespiti** — fraktal yöntem, `k = 5` (bir bar, solundaki ve sağındaki 5 barın hepsinden
   yüksek/alçaksa pivot). Son `k` bar **kullanılmaz** (henüz onaylanmadı → look-ahead koruması).
2. **Kümeleme** — pivotlar fiyat ekseninde birleştirilir: `|p₁ − p₂| < 0.5 × ATR(14)` ise aynı küme.
3. **Hacim profili** — son 30 günün hacmi 50 fiyat kovasına dağıtılır; POC ve Value Area
   (hacmin %70'i) hesaplanır. POC ayrı bir seviye olarak eklenir.
4. **Güç puanı (0–100)** her seviye için:
   ```
   strength = 40·norm(dokunuş_sayısı)
            + 25·norm(kümedeki_hacim)
            + 20·norm(yakınlık_zaman_ağırlığı)   # yeni dokunuşlar daha değerli
            + 15·norm(seviyeden_dönüş_büyüklüğü)
   ```
5. **Çıktı:** `nearest_support`, `nearest_resistance`, her biri için `strength`, mesafe (ATR cinsinden)
   ve `rr_geometry = (direnç − fiyat) / (fiyat − destek)`.

Seviyeler `sr_levels` tablosuna yazılır; panel grafikleri bunları çizer.

### 4.3 Formasyon motoru (`features/patterns.py`)

**Beklenti kalibrasyonu:** Akademik literatürde omuz-baş-omuz formasyonu tek başına kârlı bir
stratejiyi desteklemiyor; ancak formasyona koşullu risk-ayarlı fazla getiri yıllık %5–7 ölçülmüş.
Yani formasyon bir **tetikleyici değil, çarpandır.** Puana katkısı ±10 ile sınırlıdır.

Yöntem (Lo–Mamaysky–Wang çizgisinde):
1. Fiyat serisi kernel regresyonla yumuşatılır (bandwidth çapraz doğrulamayla seçilir).
2. Yumuşatılmış seride yerel ekstremumlar bulunur.
3. Ekstremum dizisi şablonlarla eşleştirilir.

Şablonlar: `double_bottom`, `double_top`, `head_shoulders`, `inverse_head_shoulders`,
`ascending_triangle`, `descending_triangle`, `symmetrical_triangle`, `bull_flag`, `bear_flag`,
`falling_wedge`, `rising_wedge`.

Her eşleşme için: `confidence (0-1)`, `direction (+1/-1)`, `neckline`, `hedef`, ve
**hacim onayı** (kırılım barında hacim, 20 barlık ortalamanın ≥ 1,5 katı mı?). Hacim onayı yoksa
`confidence` yarıya iner.

Ayrıca `pandas-ta-classic`'in 62 yerel mum formasyonu ayrı ve daha küçük bir alt-değiştirici olarak
kullanılır (±3 puan tavanı).

---

## 5. Puanlama motoru (ScoringEngine)

### 5.1 Normalizasyon

Her ham özellik, **o bardaki havuz içinde yüzdelik sırasına** çevrilir (0–100). Z-skor değil:
kriptoda kuyruklar kalın, tek bir uçuk değer z-skoru bozar; sıralama buna dayanıklıdır.

### 5.2 Aile ağırlıkları (başlangıç hipotezi)

| Aile | Ağırlık | İçerik |
|---|---|---|
| **Trend** | 30 | EMA20>50>200 dizilimi, fiyat/EMA200, ADX(14), **4h trend uyumu**, **1d trend uyumu** |
| **Momentum** | 25 | 24s / 72s / 168s getiri (**son 6 saat atlanır**), RSI(14) konumu, MACD histogram eğimi |
| **Akış** | 20 | `taker_buy_base / volume` oranı, RVOL (hacim / 20-bar ort.), OBV eğimi |
| **Volatilite/Yapı** | 15 | BB genişliği yüzdeliği (squeeze), ATR% rejimi |
| **S/R geometrisi** | 10 | Dirence uzaklık / desteğe uzaklık oranı, destek gücü |

**Toplam = 100.** Sonra:

```
score = clamp(base_score + pattern_modifier + candle_modifier + crowding_penalty, 0, 100)
```

- `pattern_modifier` ∈ [−10, +10]
- `candle_modifier` ∈ [−3, +3]
- `crowding_penalty`: 24s getiri > %25 ise **−15**, > %40 ise **−30**. (Parabolik/kalabalık
  hareketlere karşı koruma — kısa vadeli geri dönüş bulgusunun doğrudan karşılığı.)

**Son 6 saati atlama kuralı** momentum literatüründeki "skip recent" konvansiyonudur ve aynı geri
dönüş etkisine karşı korur.

### 5.3 Mutlak kapı + göreli sıralama

İkisi birlikte çalışır:
- **Göreli sıralama** hangi coinin seçileceğini belirler (havuz içi sıralama).
- **Mutlak kapı** hiç işlem yapılıp yapılmayacağını belirler: `score ≥ 80` yoksa pozisyon açılmaz.

Bu ikilik olmadan sistem ayı piyasasında bile sürekli dolu kalır.

### 5.4 Gerekçe (explainability) — zorunlu

Her puan, panelde ve TUI'de açılabilir bir **gerekçe nesnesi** ile birlikte saklanır:

```json
{
  "symbol": "SOLUSDT", "score": 87.4, "bar_time": "2026-08-13T14:00:00Z",
  "families": {"trend": 26.1, "momentum": 21.8, "flow": 17.2, "vol": 11.0, "sr": 8.3},
  "modifiers": {"pattern": +4.0, "candle": +1.0, "crowding": 0},
  "top_drivers": ["4h trend uyumlu (+8.2)", "taker alım oranı %62 (+6.1)", "boğa bayrağı (+4.0)"],
  "sr": {"support": 168.40, "resistance": 182.10, "rr_geometry": 2.31},
  "config_hash": "a3f9..."
}
```

"Neden alındı?" sorusunun cevabı bu nesnedir. Panel bunu bir **Puan Kartı** olarak çizer.

### 5.5 Kalibrasyon takibi — sistemin dürüstlük organı

Her puanlama, ileri getirileriyle birlikte `score_observations` tablosuna yazılır:
`(symbol, bar_time, score, families, fwd_return_4h, fwd_return_24h, fwd_return_72h)`

Panel `/kalibrasyon` sayfasında sürekli şunu gösterir:
- Puan desili → ortalama ileri getiri grafiği (monoton artıyor mu?)
- Spearman rank korelasyonu (puan ↔ ileri getiri), 30/90 günlük pencerelerde
- Aile bazında bilgi katsayısı (IC) — hangi aile gerçekten çalışıyor?

**Eğer bu grafik düz çıkarsa puanlama işe yaramıyor demektir ve panel bunu saklamaz.**

---

## 6. Boyutlandırma motoru (SizingEngine)

### 6.1 Neden puanla doğru orantılı dağıtım yapmıyoruz

Puanlar 85/82/81 gelirse orantısal ağırlıklar %34,3 / %33,1 / %32,6 olur — yani zaten eşit ağırlık.
Eşikten farkı alırsak (5/2/1) ağırlıklar %62/%25/%13 olur ve **eşiği 79 yapınca tamamen değişir.**
Gürültüye aşırı duyarlı, kırılgan bir kural. Ayrıca 100'lük puan kalibre edilmiş bir kazanma
olasılığı değildir; ham model skorları olasılık olarak kullanılamaz (Kelly bu yüzden Faz 11'e ertelendi).

Literatürde eşit ağırlıklı portföyü, sınırlı tahmin penceresi ve işlem maliyetleri altında yenmek
şaşırtıcı derecede zordur. Bu yüzden **taban eşit risk**, sapmaların her biri gerekçelidir.

### 6.2 Hesaplama zinciri

```python
# 1) Risk bütçesi
R = equity * risk_pct                       # risk_pct = 0.01

# 2) Stop'tan boyut  (S/R motoru stop'u verir)
stop  = sr.nearest_support - 0.5 * atr14
if (entry - stop) / entry > max_stop_pct:   # max_stop_pct = 0.08
    reject("stop çok uzak")
qty      = R / (entry - stop)
notional = qty * entry

# 3) Volatilite normalizasyonu  (eşit dolar ≠ eşit risk)
vol_scalar = clamp(target_vol / realized_vol_20d, 0.5, 1.5)   # target_vol = %60 yıllık

# 4) Puan kademesi  (lineer değil — gürültüye dayanıklı)
tier = 0.75 if 80 <= s < 85 else 1.00 if 85 <= s < 92 else 1.25

# 5) Rejim çarpanı
regime = 1.0
if btc_close < btc_ema200_1d:        regime *= 0.5
if btc_realized_vol_30d > pct90:     regime *= 0.7

notional *= vol_scalar * tier * regime

# 6) Kısıtlar (sırayla, hepsi zorunlu)
notional = min(notional, equity * 0.30)                    # tek pozisyon tavanı
notional = min(notional, free_cash)
notional = min(notional, equity * 0.80 - current_exposure) # toplam maruziyet tavanı
notional = min(notional, adv_1h * 0.02)                    # likidite tavanı: 1s hacmin %2'si
if cluster_exposure(symbol) + notional > equity * 0.50:
    reject("korelasyon kümesi limiti")
```

### 6.3 Korelasyon kümeleri

BTC + ETH + SOL aynı anda açıksa bu üç pozisyon değil, **bir bahistir**. Kriptoda düşüşte
korelasyonlar 1'e yaklaşır; çeşitlendirme tam ihtiyaç duyulduğu anda buharlaşır.

Kümeler 90 günlük getiri korelasyon matrisinden hiyerarşik kümeleme ile haftalık yeniden hesaplanır
(`corr > 0.75` → aynı küme). Küme başına maruziyet tavanı: özsermayenin %50'si.

### 6.4 Sabit parametreler (v1)

| Parametre | Değer |
|---|---|
| İşlem başı risk | %1 |
| Maksimum eşzamanlı pozisyon | 5 |
| Tek pozisyon tavanı | %30 |
| Toplam maruziyet tavanı | %80 |
| Küme maruziyet tavanı | %50 |
| Maksimum stop mesafesi | %8 |
| Hedef volatilite | %60 yıllık |

---

## 7. Çıkış kuralları

Beş çıkış yolu, öncelik sırasıyla değerlendirilir:

| # | Kural | Detay |
|---|---|---|
| 1 | **Stop** | `nearest_support − 0.5×ATR`. Borsada gerçek `STOP_LOSS_LIMIT` emri olarak durur (paper'da simüle edilir). |
| 2 | **Başabaş kilidi** | Fiyat +1.5R'ye ulaşınca stop girişe çekilir. |
| 3 | **Trailing** | Başabaş sonrası `2.5 × ATR(14)` takip eden stop. |
| 4 | **Puan çıkışı** | Bar kapanışında `score < 55` → kapat. |
| 5 | **Zaman çıkışı** | 48 saat dolduysa kapat (ölü pozisyonda sermaye tutma). |

**Rotasyon:** Portföy doluyken yeni bir aday çıkarsa — adayın puanı, mevcut en düşük puanlı
pozisyondan **en az 10 puan** yüksekse değiştirilir. Bu histerezis, sürekli girip çıkmayı
(ve devir maliyetini) önler.

Her çıkış `trades` tablosuna sebebiyle birlikte yazılır. Panel "çıkış sebebi dağılımı" grafiği
gösterir — sistemin nasıl para kaybettiğini anlamanın en hızlı yolu budur.

---

## 8. Risk motoru ve devre kesiciler

| Tetik | Eşik | Eylem |
|---|---|---|
| Günlük zarar | −%4 özsermaye | 24 saat yeni giriş yok; mevcut pozisyonlar yönetilmeye devam |
| Haftalık zarar | −%8 | Tüm girişler durur, **manuel yeniden başlatma** gerekir |
| Maksimum drawdown | −%15 | **Kill switch**: tüm botlar `STOPPED`, pozisyonlar kapatılır |
| Ardışık zarar | 5 işlem | İlgili bot 6 saat duraklatılır |
| Bayat veri | 60 sn | Yeni emir yasağı (stop'lar aktif kalır) |
| API hata oranı | 5 dk'da %20 | Bot `DEGRADED`, alarm |
| `418` IP yasağı | — | Tüm istekler durur, `CRITICAL` alarm, otomatik retry **yok** |

**Kill switch** panelde ve TUI'de tek tuş, onay diyaloğuyla. Basıldığında: tüm botlar durur, açık
emirler iptal edilir, karar `audit_log`'a yazılır, Discord'a bildirim gider.

---

## 9. Emir yürütme (ExecutionAdapter)

Tek arayüz, iki uygulama. Karar mantığı hangi adaptörün takılı olduğunu **bilmez**.

```python
class ExecutionAdapter(Protocol):
    async def submit(self, order: Order) -> OrderResult: ...
    async def cancel(self, order_id: str) -> None: ...
    async def get_balance(self) -> Balance: ...
    async def get_open_orders(self) -> list[Order]: ...
```

### 9.1 PaperAdapter (varsayılan, v1'de tek aktif adaptör)

Binance testnet **kullanılmaz** — testnet canlı borsayla senkron değil, emir defteri sentetik ve
dolumlar gerçekçi değil (büyük emirler fazla kolay doluyor). Bu, paper sonuçlarını sistematik olarak
iyimser gösterir; yani tam istemediğimiz şey.

Bunun yerine **gerçek piyasa verisiyle beslenen kendi motorumuz**:

- **Dolum modeli:** Market emri, gerçek `@depth20` akışından gelen emir defterinde yürütülür
  (seviye seviye tüketim). Kısmi dolum modellenir.
- **Ek kayma:** yapılandırılabilir baz puan (varsayılan 5 bps), volatiliteyle ölçeklenir.
- **Komisyon:** taker %0,1 (yapılandırılabilir).
- **Gecikme:** karar → emir arası 250 ms simüle edilir; o süredeki fiyat hareketi dolum fiyatına yansır.
- **PRER simülasyonu:** Binance 2026'da Spot Price Range Execution Rule uyguluyor — taker emirler
  dinamik likidite aralığının dışında kalırsa gerçekleşmiyor. Paper motoru bunu taklit eder:
  hesaplanan dolum fiyatı orta fiyattan %X'ten fazla saparsa emir **reddedilir**. Canlıya geçince
  aynı davranışla karşılaşacağız; şimdiden öğrenmek daha ucuz.
- **Delist:** havuzdaki bir coin delist edilirse o coine ayarlı botlar durdurulur (Binance'in canlı
  davranışıyla aynı).

Her paper botunun kendi sanal bakiyesi vardır. Başlangıç: 5.000 USDT.

### 9.2 BinanceSpotAdapter (Faz 11'de yazılır, kapalı gelir)

Yazıldığında bile varsayılan olarak devre dışıdır. Etkinleştirmek için: `.env` bayrağı + panelde
çift onay + 2FA yeniden doğrulama. `ROADMAP.md`'deki terfi kapısı geçilmeden açılmaz.

---

## 10. Bot yaşam döngüsü

Her bot ayrı bir **işlemde (process)** çalışır. Bir botun çökmesi diğerlerini etkilemez.

Durumlar: `DRAFT → PAPER_RUNNING → PAUSED → STOPPED → ERROR → DEGRADED`

- `BotSupervisor` worker'ları başlatır, 10 sn'de bir heartbeat bekler; 3 kaçırılan heartbeat → yeniden başlat.
- **Güvenli durdurma:** yeni giriş yok, mevcut pozisyonlar çıkış kurallarına göre yönetilmeye devam eder.
- **Sert durdurma (kill):** her şey iptal, pozisyonlar market ile kapatılır.
- Yeniden başlatmada durum DB'den kurtarılır — bellekte pozisyon tutulmaz.

Bot konfigürasyonu: `strategy_id` + `strategy_version` + `timeframe` + `capital` + risk parametreleri
+ havuz filtresi override'ı. Sahibi bir kullanıcıdır; `ADMIN` herkesin botunu durdurabilir.

---

## 11. Backtest motoru

**Aynı kod yolu.** `FeatureEngine`, `ScoringEngine`, `SizingEngine`, `RiskEngine` birebir aynı;
sadece veri kaynağı geçmişe ve saat sanal saate bağlanır.

- **Olay güdümlü**, bar-bar. Vektörel kısayol yok (look-ahead'ın en sık girdiği kapı).
- **Havuz:** `universe_snapshots` tablosundan point-in-time okunur. Snapshot birikmemiş geçmiş
  dönemler için arşiv kline'larından yeniden kurulur ve rapor **"YAKLAŞIK EVREN"** damgası taşır.
- **Maliyet senaryoları:** `base` / `1.5×` / `2×` — üçü birden raporlanır.
- **Zorunlu kıyaslar (üçü de her raporda):**
  1. Eşit ağırlıklı likit-100 al-tut
  2. BTC al-tut
  3. **Devir-eşleştirilmiş rastgele portföy** — aynı pozisyon sayısı, aynı yeniden dengeleme
     frekansı, ama coinler rastgele. Bu, "sıralama gerçekten değer katıyor mu, yoksa sadece devir
     ve yeniden dengelemenin mekanik etkisi mi?" sorusunu izole eder. Çok az kişi bu testi yapar.
- **Metrikler:** Sharpe, Sortino, Calmar, maks DD ve süresi, profit factor, expectancy, kazanma
  oranı, ortalama R, devir hızı, maruziyet, çıkış sebebi dağılımı, rejim bazlı ayrıştırma.
- **Doğrulama:** walk-forward (kayan pencere), verinin %30'u en baştan kilitli out-of-sample.
- **Aşırı uydurma uyarısı:** Sharpe > 3 veya maks DD < %5 çıkarsa rapor kırmızı bayrak basar.
  Bu değerler kutlama sebebi değil, hata şüphesidir.

---

## 12. Strateji tanımı

Strateji = versiyonlanmış bir JSON belgesi. Panelden düzenlenir, DB'de saklanır, hash'lenir.

```json
{
  "name": "Havuz Momentum v1",
  "version": 3,
  "timeframe": "1h",
  "universe": { "preset": "default", "overrides": { "top_n": 80 } },
  "scoring": {
    "weights": { "trend": 30, "momentum": 25, "flow": 20, "vol": 15, "sr": 10 },
    "modifiers": { "pattern": true, "candle": true, "crowding": true }
  },
  "entry": { "min_score": 80, "max_positions": 5 },
  "sizing": { "risk_pct": 0.01, "tiers": [[80,0.75],[85,1.0],[92,1.25]], "vol_target": 0.60 },
  "exit": { "breakeven_r": 1.5, "trail_atr": 2.5, "score_exit": 55, "max_hold_hours": 48 },
  "rotation": { "enabled": true, "min_score_gap": 10 }
}
```

Bir strateji versiyonu **canlıya/paper'a alındıktan sonra değiştirilemez** — yeni versiyon oluşur.
Böylece her işlem hangi tam konfigürasyonla açıldığı bilinir.

---

## 13. Veri modeli (özet)

```
users(id, email, password_hash, totp_secret, role, created_at, last_login_at)
sessions(id, user_id, token_hash, expires_at, ip, user_agent)
audit_log(id, user_id, action, target, payload, ip, created_at)

ohlcv(...)                      -- §2.2, hypertable
universe_snapshots(...)         -- §3.3
data_quality_reports(id, kind, symbol, timeframe, detail, created_at)

sr_levels(id, symbol, timeframe, price, kind, strength, touches, computed_at)
patterns(id, symbol, timeframe, kind, direction, confidence, neckline, target, volume_confirmed, detected_at)
scores(id, symbol, bar_time, score, families, modifiers, rationale, config_hash)
score_observations(score_id, fwd_return_4h, fwd_return_24h, fwd_return_72h)

strategies(id, name, owner_id, created_at)
strategy_versions(id, strategy_id, version, definition, definition_hash, created_at, frozen)

bots(id, name, owner_id, strategy_version_id, mode, state, capital, config, created_at)
bot_events(id, bot_id, kind, payload, created_at)

positions(id, bot_id, symbol, side, qty, entry_price, entry_time, stop, target,
          score_at_entry, rationale_id, status)
trades(id, position_id, exit_price, exit_time, exit_reason, pnl, pnl_r, fees, slippage_bps, mfe, mae)
orders(id, bot_id, symbol, type, side, qty, price, status, exchange_order_id, created_at, filled_at)

backtests(id, strategy_version_id, params, status, started_at, finished_at)
backtest_results(backtest_id, metrics, equity_curve, trades, benchmarks, cost_scenario)

notifications(id, user_id, kind, title, body, read_at, created_at)
chat_rooms(id, name, kind, created_by, created_at)
chat_members(room_id, user_id, joined_at, last_read_at)
chat_messages(id, room_id, user_id, body, created_at, edited_at)
integrations(id, kind, config_encrypted, enabled, updated_by, updated_at)
settings(key, value, updated_by, updated_at)
```

`positions.rationale_id` → `scores.id`: her pozisyonun "neden alındı" kaydı kalıcıdır.

---

## 14. Olay veriyolu ve bildirimler

Redis Streams. Her olay hem WebSocket'e (panel + TUI), hem `notifications` tablosuna, hem — kuralı
varsa — Discord'a gider.

| Olay | Discord | Panel | TUI |
|---|---|---|---|
| `pool.updated` (giren/çıkan coinler) | ✓ | ✓ | ✓ |
| `score.threshold_crossed` (≥80) | ✓ | ✓ | ✓ |
| `position.opened` / `closed` | ✓ | ✓ | ✓ |
| `risk.circuit_breaker` | ✓ **@here** | ✓ | ✓ |
| `bot.state_changed` | ✓ | ✓ | ✓ |
| `data.stale` / `api.banned` | ✓ **@here** | ✓ | ✓ |
| `backtest.finished` | — | ✓ | — |
| `chat.message` | — | ✓ | — |

**Discord:** tek sunucu, olay tipine göre ayrı kanal (`#islemler`, `#havuz`, `#alarm`, `#sistem`).
Webhook URL'leri Entegrasyonlar sayfasından girilir, DB'de şifreli saklanır. Rate limit farkındalığı:
olaylar 5 saniyelik pencerelerde toplanıp tek mesajda gönderilir (havuz güncellemesinde 30 ayrı
mesaj atmak yerine tek özet).

---

## 15. API yüzeyi (FastAPI)

```
POST   /auth/login · /auth/2fa · /auth/refresh · /auth/logout
GET    /me

GET    /universe/current · /universe/snapshots · /universe/snapshots/{id}
POST   /universe/refresh                     (ADMIN)
GET    /universe/funnel

GET    /scores?limit&min_score               # anlık sıralama
GET    /scores/{symbol}                      # gerekçe dahil
GET    /scores/{symbol}/history
GET    /calibration                          # desil grafiği, IC, Spearman

GET    /symbols/{symbol}/ohlcv?tf&from&to
GET    /symbols/{symbol}/sr
GET    /symbols/{symbol}/patterns

GET/POST/PATCH  /bots · /bots/{id}
POST   /bots/{id}/start · /pause · /stop · /kill
GET    /bots/{id}/events

GET    /positions · /trades · /orders
GET    /portfolio/equity · /portfolio/metrics

GET/POST  /strategies · /strategies/{id}/versions
POST   /backtests · GET /backtests/{id}

GET/POST  /chat/rooms · /chat/rooms/{id}/messages
GET/PATCH /notifications
GET/POST  /users                             (ADMIN)
GET/PUT   /settings · /integrations          (ADMIN)
GET    /logs · /audit                        (ADMIN)
POST   /system/kill-switch                   (ADMIN, 2FA)

WS     /ws   → kanallar: scores, positions, logs, notifications, chat, bot_events
```

---

## 16. Terminal arayüzü (TUI)

Textual ile. **Ayrı bir istemci süreci** — bot değil.

```
┌───────────────────────────────────────────────────────────────────────────────┐
│  ███ SARNIÇ ███   paper · 5.000 USDT · ↑%2,4 · 3/5 poz · havuz 100 · ⬤ CANLI  │
├──────────────────────────────┬────────────────────────────────────────────────┤
│  PUAN TABLOSU (ilk 12)       │  AÇIK POZİSYONLAR                              │
│  SOL   87.4 ▲  ██████████░   │  SOL  +2,4%  1.240$  stop 168.40  12s          │
│  AVAX  84.1 ▲  █████████░░   │  AVAX -0,8%    980$  stop  31.12   4s          │
│  ...                         │  LINK +5,1%  1.100$  stop  17.85  31s          │
├──────────────────────────────┴────────────────────────────────────────────────┤
│  CANLI LOG                                                                    │
│  14:00:03  INFO   bar close 1h → 100 sembol puanlandı (312 ms)               │
│  14:00:04  SCORE  SOLUSDT 87.4 (trend 26.1 · akış 17.2 · bayrak +4.0)        │
│  14:00:05  ENTRY  SOLUSDT qty 7.34 @ 172.10 · stop 168.40 · risk 1.0% · R 2.3│
│  14:00:05  RISK   maruziyet %46 → limit %80 ✓                                 │
├───────────────────────────────────────────────────────────────────────────────┤
│  [p] duraklat  [r] devam  [k] KILL  [f] filtre  [/] ara  [q] çık             │
└───────────────────────────────────────────────────────────────────────────────┘
```

- Veri kaynağı: FastAPI WebSocket (tek bağlantı). Bağlantı koparsa üstteki gösterge kırmızıya döner
  ve TUI **yeniden bağlanmaya çalışır** — bot çalışmaya devam eder.
- Log renk kodu: `INFO` gri · `SCORE` kehribar · `ENTRY` yeşil · `EXIT` mavi · `RISK` turuncu ·
  `ERROR` kırmızı · `CRITICAL` kırmızı zemin.
- SSH üzerinden çalışır (ev sunucusuna bağlanacağız).
- Kill switch TUI'den de basılabilir; onay ister.

---

## 17. Web paneli — sayfa envanteri

| Sayfa | İçerik | Rol |
|---|---|---|
| **Panel** (dashboard) | Özsermaye eğrisi, açık pozisyonlar, bugünkü olaylar, sistem sağlığı | Hepsi |
| **Terminal** | Bloomberg tarzı çok panelli çalışma alanı — bkz. `DESIGN.md` | TRADER+ |
| **Havuz** | 100 coin tablosu, filtre hunisi, giren/çıkan, snapshot geçmişi | Hepsi |
| **Puanlar** | Anlık sıralama, Puan Kartı, gerekçe, geçmiş | Hepsi |
| **Kalibrasyon** | Desil grafiği, IC, Spearman — sistemin dürüstlük sayfası | Hepsi |
| **Botlar** | Liste, başlat/duraklat/durdur/kill, olay geçmişi | TRADER+ |
| **Pozisyonlar & İşlemler** | Açık/kapalı, MFE/MAE, çıkış sebebi dağılımı | Hepsi |
| **Stratejiler** | Görsel düzenleyici, versiyonlar, tek tıkla backtest | TRADER+ |
| **Backtest** | Koşu kuyruğu, sonuç raporu, kıyaslar, maliyet senaryoları | TRADER+ |
| **İndikatörler** | Kütüphane, parametreler, tek sembolde önizleme | TRADER+ |
| **Sohbet** | Birebir + grup, dosya yok, sadece metin + kod bloğu | Hepsi |
| **Bildirimler** | Gelen kutusu, okundu/okunmadı, filtre | Hepsi |
| **Kullanıcılar** | Davet, rol, 2FA sıfırlama, oturum sonlandırma | ADMIN |
| **Entegrasyonlar** | Discord webhook'ları, kanal eşlemesi, test gönderimi | ADMIN |
| **Loglar** | Uygulama logları + audit log, arama, seviye filtresi | ADMIN |
| **Ayarlar** | Havuz filtreleri, risk limitleri, maliyet varsayımları, kill switch | ADMIN |

Açık kayıt yok. Kullanıcılar yalnızca `ADMIN` daveti ile oluşur. 2FA zorunlu.

---

## 18. Bilinen sınırlar ve dürüstlük notları

1. **Bu bir doğrulama projesidir.** Faz 0a "hayır" derse, geri kalan fazlar farklı bir puanlama
   hipoteziyle yeniden kurulur. Bu bir başarısızlık değil, projenin işi.
2. **Backtest yalanı ölçülmüştür.** Gerçek performansın backtest'in belirgin altında olmasını
   bekleyin. Sharpe > 3 çıkan bir sonuç, iyi bir strateji değil, muhtemelen bir hatadır.
3. **Kalabalıklaşma riski var.** "En güçlü altcoinler" ekranına binlerce kişi bakıyor. Sistem
   funding z-skoru ve açık pozisyon birikimini portföy seviyesinde raporlar; seçilen coinlerin
   toplam funding z-skoru aşırı pozitifse çıkışı binlerce kişiyle paylaşacağız demektir.
4. **Vergi ve devir hızı.** Türkiye'de kripto işlemlerine yönelik stopaj ve işlem vergisi
   düzenlemeleri gündemde; yüksek devirli bir sistemde bu tek başına yıllık birkaç puan eder.
   Canlıya geçmeden önce bir mali müşavire danışılmalı. (Bu belge hukuki veya mali tavsiye değildir.)
5. **Formasyon motoru en zayıf halkadır.** Literatür desteği en ince olan bileşen bu; ±10 puanla
   sınırlı tutulmasının sebebi budur. Kalibrasyon sayfası formasyonun IC'sini ayrı gösterir —
   sıfırsa ağırlığı sıfırlanır.
