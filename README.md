# SARNIÇ

Binance spot piyasasında çalışan, likidite filtresiyle 100 coinlik bir **havuz** kuran,
bu havuzdaki coinleri 0–100 arası **puanlayan**, en yüksek puanlılara risk-tabanlı
sermaye dağıtan bir **kağıt üstünde (paper) işlem sistemi** — artı bir terminal
arayüzü (TUI) ve çok kullanıcılı bir web paneli.

> **Canlı para yoktur.** Tüm emirler dahili paper motorundan geçer. Veriler gerçektir.
>
> Bu bir doğrulama projesidir. Birincil çıktısı kâr değil, **ölçüm**dür: puanlamanın
> öngörü gücü var mı, yok mu — panel bunu dürüstçe göstermek zorundadır.

Şartname: [`docs/MASTER-SPEC.md`](docs/MASTER-SPEC.md) ·
Yol haritası: [`docs/ROADMAP.md`](docs/ROADMAP.md) ·
Tasarım: [`docs/DESIGN.md`](docs/DESIGN.md) ·
Açık sorular: [`docs/OPEN-QUESTIONS.md`](docs/OPEN-QUESTIONS.md)

---

## ⚠ Bu makinede bilinen bir kısıt

Projenin bulunduğu yol Türkçe karakter içeriyor (`~/Masaüstü/…`) ve **Next.js bu
yolda çalışmıyor** — modül çözümlemesi `MODULE_NOT_FOUND` ile kırılıyor (hem
`next dev` hem `next build`, hem webpack hem Turbopack). Motor (Python) tarafı
etkilenmiyor.

İki çözümden biri gerekiyor:

1. **Projeyi ASCII bir yola taşıyın** — önerilen:
   ```bash
   mv ~/Masaüstü/Projects/Sarnic_Proje ~/Projects/Sarnic_Proje
   ```
2. **Paneli Docker'dan çalıştırın.** İmaj `/app` altında derlenir, sorun görülmez:
   ```bash
   docker compose --profile dev up web
   ```

Doğrulandı: aynı kaynak ASCII bir yola kopyalandığında 19 sayfanın tamamı sorunsuz
derleniyor.

---

## Hızlı başlangıç

### Gereksinimler

- Docker + Docker Compose (`sudo systemctl start docker`)
- Yerel geliştirme için: [`uv`](https://docs.astral.sh/uv/) ve Node.js 22

### Docker ile (önerilen)

```bash
cp .env.example .env          # sırları doldurun
docker compose --profile dev up
```

Bu, şunları ayağa kaldırır: PostgreSQL + TimescaleDB, Redis, migrasyonlar,
FastAPI (`:8000`) ve panel (`:3000`).

İlk açılışta `migrate` servisi bir yönetici hesabı üretir ve **parolayı bir kez**
loglara yazar:

```bash
docker compose logs migrate
```

Motor servislerini (piyasa verisi, süpervizör, bildirimci) de çalıştırmak için:

```bash
docker compose --profile engine up -d
```

### Yerel geliştirme

```bash
# Motor
cd apps/engine
uv sync --all-extras
uv run alembic upgrade head
uv run python -m sarnic.cli bootstrap
uv run python -m sarnic.cli api --reload

# Panel (ASCII bir yolda olmalı — yukarıdaki kısıta bakın)
cd apps/web
npm install
npm run dev
```

---

## Mimari

```
MarketDataService (tek çıkış noktası)  →  Redis + TimescaleDB
        ↓
UniverseEngine ──havuz──▶ FeatureEngine ──özellik──▶ ScoringEngine
                                                          ↓ puan
                                          RiskEngine ← SizingEngine
                                                          ↓
                                                  ExecutionAdapter
                                                   (Paper | Binance)
                                                          ↓
                        Redis Streams → FastAPI/WS · TUI · Discord · Postgres
                                            ↓
                                    Next.js paneli
```

### Bozulmaz kurallar ve nerede uygulandıkları

| # | Kural | Nerede |
|---|---|---|
| 1 | Tek karar yolu — backtest/paper/canlı aynı kodu çalıştırır | `backtest/engine.py` `ScoringEngine`/`SizingEngine`/`RiskEngine`'i **ithal eder**, kopyalamaz |
| 2 | Look-ahead yasak | `features/sr.py::detect_pivots` son `k` barı atlar · `patterns.py` nedensel kernel · `tests/test_lookahead.py` |
| 3 | Havuz her yenilemede snapshot'lanır | `universe/engine.py::refresh` snapshot yazmadan dönmez |
| 4 | TUI bot değildir | `tui/client.py` yalnızca FastAPI'ye konuşur; DB/Binance erişimi yok |
| 5 | Piyasa verisi tek yerden çekilir | Yalnızca `data/marketdata.py` `BinanceRest`/`BinanceWebSocket` kullanır |
| 6 | Her sayı monospace + `tabular-nums` | `globals.css` `.num` sınıfı · TUI'de `_num()` |
| 7 | Sessiz varsayım yok | `docs/OPEN-QUESTIONS.md` |

---

## Komutlar

```bash
cd apps/engine

uv run python -m sarnic.cli bootstrap          # ilk yönetici + varsayılan strateji
uv run python -m sarnic.cli api                # FastAPI
uv run python -m sarnic.cli marketdata         # piyasa verisi (tek örnek!)
uv run python -m sarnic.cli supervisor         # bot süpervizörü
uv run python -m sarnic.cli notifier           # bildirim + Discord köprüsü
uv run python -m sarnic.cli tui                # terminal arayüzü

uv run python -m sarnic.cli universe-refresh   # havuzu yenile + snapshot yaz
uv run python -m sarnic.cli backfill --days 400
uv run python -m sarnic.cli observations       # kalibrasyon besleyicisi
uv run python -m sarnic.cli backtest 1 --start 2025-01-01 --end 2026-01-01
```

---

## Testler

```bash
cd apps/engine
uv run pytest tests -q                 # 312 test
uv run pytest tests -q --cov=sarnic    # kapsam raporu
uv run ruff check sarnic tests
```

Test disiplini (CLAUDE.md):

- İş mantığı için pytest zorunlu — `scoring` %95, `sizing` %96, `risk` %98,
  `exits` %99, `indicators` %98 kapsam.
- Finansal hesaplamalarda **elle hesaplanmış** fixture'lar (`test_indicators.py`,
  `test_paper.py`, `test_sizing.py`).
- `hypothesis` property testleri: puan her zaman `[0,100]`, pozisyon boyutu hiçbir
  koşulda `%30`'u aşmaz, toplam maruziyet `%80`'i, küme `%50`'yi geçmez, stop her
  zaman girişin altında.
- **Look-ahead testleri** (`test_lookahead.py`): bir seriyi `t`'de kesip hesaplamak,
  tüm seriyle hesaplayıp `t`'yi okumakla birebir aynı sonucu vermek zorunda.

---

## Faz 0a — doğrulama deneyi

Sistemin kapı fazı. `research/` altında, uygulama kodundan bağımsız çalışır ama
puanlama motorunu **ithal eder** (bozulmaz kural 1).

```bash
cd apps/engine
uv run python ../../research/phase0a.py fetch --symbols 150 --days 730
uv run python ../../research/phase0a.py universe
uv run python ../../research/phase0a.py score
uv run python ../../research/phase0a.py report
```

Çıktı `research/PHASE-0A-REPORT.md`. Ayrıntı: [`research/README.md`](research/README.md).

**Sonuç olumsuzsa ağırlıkları değiştirip tekrar denemeyin** — bu, aynı veri
üzerinde arama yapmaktır. Her deneme `research/TRIAL-LEDGER.md`'ye yazılır.

---

## Güvenlik

- Binance API anahtarı: çekim yetkisi kapalı, IP whitelist açık, `.env`'de, repoya girmez.
- Panel: JWT + **zorunlu TOTP 2FA**. Roller: `ADMIN` / `TRADER` / `VIEWER`.
- Açık kayıt yok; kullanıcılar yalnızca `ADMIN` daveti ile oluşur.
- Her yönetimsel eylem `audit_log`'a yazılır (kim, ne zaman, ne, hangi IP).
- Discord webhook URL'leri DB'de **şifreli** (Fernet), panelde maskeli.
- Kill switch 2FA yeniden doğrulaması ister.
- Panel varsayılan olarak yalnızca yerel ağa açıktır.

---

## Gözlemlenebilirlik

```bash
make gozlem          # Prometheus (:9090) + Grafana (:3001)
make gozlem-kapat
```

Grafana açılışta hazır gelir: veri kaynağı ve **SARNIÇ — Sistem** panosu kod
olarak sağlanır (`docker/grafana/provisioning/`), elle kurulum gerekmez.
Giriş bilgileri `.env`'deki `GRAFANA_ADMIN_USER` / `GRAFANA_ADMIN_PASSWORD`.

### Ölçüler

| Ölçü | Ne söyler |
|---|---|
| `sarnic_events_total{kind,level}` | Tüm alan olayları — pozisyon, emir, devre kesici, bot durumu. Tek hook: `EventBus.publish` |
| `sarnic_decision_loop_errors_total{bot_id}` | Karar döngüsü istisnası. **Bu sıfırdan farklıysa bot bar atlıyor olabilir** |
| `sarnic_bars_written_total` | DB'ye yazılan kapanmış bar. Sıfıra düşmesi, veri akışının durduğunu `data.stale` olayından önce gösterir |
| `sarnic_ws_reconnects_total` | Binance akışının kararlılığı |
| `sarnic_universe_size` | Havuzdaki sembol sayısı (hedef 100) |
| `sarnic_event_publish_failures_total` | Redis erişilemiyor; olaylar sessizce düşüyor |
| `sarnic_http_requests_total`, `sarnic_http_request_seconds` | API trafiği ve gecikmesi |

Motor servisleri bu makinede systemd kullanıcı servisi olarak çalıştığı için
her biri kendi `/metrics` portunu açar: API `:8000`, marketdata `:9101`,
süpervizör `:9102`, bildirimci `:9103`, worker'lar `9110 + bot_id`.
UFW etkin olduğundan Prometheus ve Grafana **host ağında** koşar — güvenlik
duvarına Docker alt ağı için delik açmamak için (gerekçe: `compose.yml`).

Alarm kuralları `docker/prometheus/alarmlar.yml`'de. Hepsi, daha önce sessizce
olmuş ve elle log okunarak bulunmuş olaylardan türetildi.

### Sentry

`.env`'ye DSN yazın; boşsa tamamen kapalıdır:

```bash
SARNIC_SENTRY_DSN=https://...@....ingest.sentry.io/...
```

İstisnalar structlog zincirinden **yığın iziyle** gider. Bu önemsiz bir ayrıntı
değil: `structlog.processors.format_exc_info` `exc_info`'yu metne çevirdiği
için, Sentry'nin kendi logging entegrasyonuna bırakılsaydı olay giderdi ama
`exception` alanı boş kalırdı. Olay `component` (hangi servis) ve `log_event`
(hangi log olayı) etiketleriyle, `bot_id` gibi bağlam alanlarıyla birlikte
gönderilir. Testi: `tests/test_observability.py`.

---

## Yedek

Kalıcı durumun tamamı PostgreSQL'dedir; Redis'teki her şey yeniden üretilebilir.
Bu yüzden yalnızca PostgreSQL yedeklenir.

```bash
make yedek         # anlık yedek al
make yedek-prova   # son yedeği AYRI bir veritabanına geri yükleyip doğrula
```

Yedekler `~/.local/share/sarnic/yedek/` altında `pg_dump -Fc` biçiminde tutulur,
son 14 tanesi saklanır. İki systemd kullanıcı zamanlayıcısı işi otomatikleştirir:

| Zamanlayıcı | Ne zaman | Ne yapar |
|---|---|---|
| `sarnic-yedek.timer` | her gün 04:00 | yedek alır, eskileri budar |
| `sarnic-yedek-prova.timer` | pazar 05:00 | son yedeği `sarnic_prova` veritabanına geri yükler, satır sayılarını canlıyla karşılaştırır, sonra siler |

Prova canlı `sarnic` veritabanına dokunmaz. **Geri yüklenebildiği kanıtlanmamış
yedek, alınmamış yedektir** — Faz 11 canlıya geçiş kapısının maddelerinden biri
budur.

---

## Bu proje ne DEĞİL

- Yatırım tavsiyesi üreten bir hizmet değil. Kimseye satılmayacak, ücret alınmayacak.
- Yüksek frekanslı bir sistem değil. Karar birimi 1 saatlik mum kapanışıdır.
- Kâr garantisi olan bir şey değil.
