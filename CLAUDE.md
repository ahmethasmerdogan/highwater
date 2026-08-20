# SARNIÇ — Proje Anayasası

> Bu dosyayı her oturumun başında oku. Kısa tutuldu; detay `docs/MASTER-SPEC.md`'de.
> Proje adı bir yer tutucudur — değiştirmek istersen tüm dosyalarda `SARNIÇ` / `sarnic` ara-değiştir yeter.

## Ne inşa ediyoruz

Binance spot piyasasında çalışan, likidite filtresiyle 100 coinlik bir **havuz** kuran, bu havuzdaki
coinleri 0–100 arası **puanlayan**, en yüksek puanlılara risk-tabanlı sermaye dağıtan bir
**kağıt üstünde (paper) işlem sistemi** — artı bir terminal arayüzü (TUI) ve çok kullanıcılı bir web paneli.

Şu an **canlı para yok.** Tüm emirler dahili paper motorundan geçer. Veriler gerçektir.

## Bozulmaz kurallar

1. **Tek karar yolu.** Backtest, paper ve canlı **aynı** feature/scoring/sizing kodunu çalıştırır.
   Değişen tek şey `ExecutionAdapter`'dır. Bir modülün "backtest versiyonu" yazılmaz.
2. **Look-ahead yasaktır.** Bir bar kapanmadan o barın verisi karara giremez. Her yeni indikatör
   veya özellik için, `t` anında bilinmeyen veriyi kullanıp kullanmadığını test eden bir property
   testi yazılır.
3. **Havuz her yenilemede DB'ye snapshot'lanır.** (`universe_snapshots`) Bu olmadan dürüst backtest
   imkânsızdır. Snapshot yazılmadan havuz değişikliği commit edilmez.
4. **TUI botun kendisi değildir.** Bot headless bir servistir; TUI ona bağlanan bir istemcidir.
   Terminali kapatmak işlemleri durdurmaz.
5. **Piyasa verisi tek yerden çekilir.** Binance limitleri IP başınadır. Merkezi bir `MarketDataService`
   veriyi çeker ve Redis'e yazar; hiçbir bot doğrudan Binance'e market-data isteği atmaz.
6. **Her sayı monospace ve `tabular-nums`.** Arayüzde hizalanmayan rakam kabul edilmez.
7. **Sessiz varsayım yok.** Spec'te olmayan bir karar gerekiyorsa, uydurma — sor veya
   `docs/OPEN-QUESTIONS.md`'ye yaz ve devam et.

## Çalışma biçimi

- Faz faz ilerle. Her fazın `ROADMAP.md`'de bir **kabul kriteri** var. Kriter yeşil olmadan sonraki faza geçme.
- Her faz sonunda `CHANGELOG.md`'ye tek paragraf yaz: ne yapıldı, ne bilinçli olarak yapılmadı.
- Küçük tut. 200 satır yazdıysan ve 50 satırla olabiliyorsa, yeniden yaz.
- İstenmeyen özellik ekleme. "İleride lazım olur" diye soyutlama kurma.
- Mevcut kodu düzeltirken sadece görevin gerektirdiği satırlara dokun.

## Test disiplini

- İş mantığı (`scoring`, `sizing`, `risk`, `universe`) için pytest zorunlu; `%80+` kapsam hedefi.
- Finansal hesaplamalarda bilinen-sonuçlu fixture kullan (elle hesaplanmış küçük örnekler).
- `hypothesis` ile property testleri: puan her zaman `[0,100]`, ağırlıklar toplamı ≤ `max_exposure`,
  stop her zaman girişin altında, pozisyon boyutu hiçbir koşulda `max_position_pct`'i aşmaz.

## Stack (tartışmasız)

| Katman | Seçim |
|---|---|
| Motor + API | Python 3.12, FastAPI, asyncio, SQLAlchemy 2.x, Alembic, `uv` |
| Veri | PostgreSQL 16 + TimescaleDB (OHLCV hypertable) |
| Cache / olay veriyolu | Redis 7 (Streams + pub/sub) |
| TUI | Textual |
| Web | Next.js (App Router), TypeScript, Tailwind, **HashUI**, TradingView Lightweight Charts |
| Dağıtım | Docker Compose (dev + prod profilleri) |
| İndikatör | `pandas-ta-classic` (+ opsiyonel TA-Lib hızlandırma) |
| Bildirim | Discord webhook |

Frontend **yalnızca** FastAPI ile konuşur. Next.js'te iş mantığı, ORM veya DB bağlantısı yoktur.

## Klasör düzeni

```
sarnic/
├── docs/                    # MASTER-SPEC, ROADMAP, DESIGN, CHANGELOG
├── apps/
│   ├── engine/              # Python: bot, API, TUI
│   │   ├── sarnic/
│   │   │   ├── data/        # Binance adaptörü, OHLCV deposu, kalite denetimi
│   │   │   ├── universe/    # havuz kurucu + filtreler + snapshot
│   │   │   ├── features/    # indikatörler, S/R motoru, formasyon motoru
│   │   │   ├── scoring/     # normalizasyon, bileşik puan, kalibrasyon
│   │   │   ├── sizing/      # risk bütçesi, boyutlandırma, kısıtlar
│   │   │   ├── risk/        # devre kesiciler, kill switch
│   │   │   ├── execution/   # PaperAdapter, BinanceSpotAdapter
│   │   │   ├── bots/        # supervisor, worker, yaşam döngüsü
│   │   │   ├── backtest/    # olay güdümlü motor, maliyet modeli, raporlar
│   │   │   ├── strategy/    # strateji tanımı + versiyonlama
│   │   │   ├── notify/      # Discord
│   │   │   ├── api/         # FastAPI rotaları + WebSocket
│   │   │   └── tui/         # Textual uygulaması
│   │   └── tests/
│   └── web/                 # Next.js paneli
├── research/                # Faz 0a deneyi (notebook + Parquet)
├── docker/
└── compose.yml
```

## Güvenlik

- Binance API anahtarı: **çekim yetkisi kapalı**, IP whitelist açık, `.env`'de, repoya asla girmez.
- Panel: JWT + TOTP 2FA zorunlu. Roller: `ADMIN` / `TRADER` / `VIEWER`.
- Her yönetimsel eylem `audit_log`'a yazılır (kim, ne zaman, ne yaptı, hangi IP).
- Panel varsayılan olarak yalnızca yerel ağa açıktır. Dışarı açılırsa: Caddy + Let's Encrypt +
  fail2ban + IP whitelist.

## Bu proje ne DEĞİL

- Yatırım tavsiyesi üreten bir hizmet değil. Kimseye satılmayacak, ücret alınmayacak.
- Yüksek frekanslı bir sistem değil. Karar birimi 1 saatlik mum kapanışıdır.
- Kâr garantisi olan bir şey değil. Sistemin birincil çıktısı **ölçüm**dür: puanlamanın öngörü
  gücü var mı, yok mu — panel bunu dürüstçe göstermek zorundadır.
