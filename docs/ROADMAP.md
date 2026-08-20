# SARNIÇ — Yol Haritası

**Sıralama ilkesi:** doğrulama → veri → motor → dayanıklılık → arayüz → araştırma araçları → sertleştirme.

Her fazın **kabul kriteri** vardır. Kriter yeşil olmadan sonraki faza geçilmez.
Her faz sonunda `CHANGELOG.md`'ye tek paragraf: ne yapıldı, ne bilinçli olarak yapılmadı.

---

## Faz 0 — İskele

Monorepo, `uv` + `pnpm`, Docker Compose (postgres + timescale, redis, engine, web), Alembic ilk
migration, FastAPI iskeleti, Next.js iskeleti + HashUI kurulumu, kullanıcı tablosu, JWT + TOTP 2FA,
temel roller, GitHub Actions CI (lint + pytest + tsc).

**Kabul:** `docker compose --profile dev up` → panele 2FA ile giriş yapılabiliyor. CI yeşil.
`alembic upgrade head` temiz bir DB'de hatasız çalışıyor.

---

## Faz 0a — DOĞRULAMA DENEYİ ⚠️ (kapı fazı)

> Bu fazın amacı kod yazmak değil, **bir soruyu cevaplamak**: bu puanlama ileri getiriyi öngörüyor mu?
> Monorepo'ya, FastAPI'ye, panele ihtiyaç yok. `research/` klasöründe Polars + Parquet + tek notebook.

Yapılacaklar:
1. `data.binance.vision`'dan son 2 yılın 1h kline'ları (en az 150 sembol) indirilir.
2. Point-in-time havuz **geçmişe dönük yeniden kurulur** (her gün için o günkü hacim sıralaması,
   delist edilmiş semboller dahil).
3. `MASTER-SPEC` §5'teki puanlama saf fonksiyon olarak yazılır (indikatör + basit S/R; formasyon
   motoru bu fazda YOK — en zayıf halka, deneyi bulandırmasın).
4. Her bar için puan hesaplanır, 4s/24s/72s ileri getirilerle eşleştirilir.
5. Aşağıdaki dört çıktı üretilir.

**Kabul kriteri — dördü birden sağlanmalı:**

| # | Test | Geçme şartı |
|---|---|---|
| 1 | Puan desili → ortalama 24s ileri getiri | Monoton artan; üst desil ile alt desil arası fark istatistiksel anlamlı |
| 2 | Spearman rank korelasyonu (puan ↔ 24s getiri) | 90 günlük pencerelerin çoğunda pozitif |
| 3 | Top-5 portföy vs eşit ağırlıklı likit-100 | **Maliyet ve kayma sonrası** risk-ayarlı üstünlük |
| 4 | Top-5 portföy vs devir-eşleştirilmiş rastgele portföy | Rastgeleyi anlamlı biçimde geçmeli |

**Test 4 en önemlisidir.** Rastgele portföyü geçemiyorsa, sıralama değer katmıyor; getirinin kaynağı
sadece devir ve yeniden dengelemenin mekanik etkisidir.

**Çıktı:** `research/PHASE-0A-REPORT.md` — dört grafik, dört sayı, bir cümlelik karar.

**Eğer sonuç HAYIRSA:** durun. Ağırlıkları değiştirip tekrar denemeyin (bu, aynı veri üzerinde
arama yapmaktır — sonuç kaçınılmaz olarak uydurma olur). Bunun yerine hipotezi değiştirin
(farklı özellik ailesi, farklı zaman dilimi, farklı evren) ve **kilitli out-of-sample penceresine
dokunmadan** yeniden test edin. Kaç deneme yapıldığı `research/TRIAL-LEDGER.md`'ye yazılır.

---

## Faz 1 — Veri katmanı

Binance adaptörü (WS + REST), merkezi `RateLimiter`, `MarketDataService`, TimescaleDB hypertable
ve continuous aggregate'ler, arşivden geçmiş dolgu, veri kalitesi denetçisi.

**Kabul:** 100 sembolün 1h verisi WS'ten DB'ye kesintisiz akıyor. Kasıtlı 6 saatlik boşluk yaratılıp
servis yeniden başlatıldığında boşluk otomatik doluyor. 24 saatlik koşuda ağırlık kullanımı hiçbir
dakikada %70'i aşmıyor. Kalite raporu üretiliyor.

---

## Faz 2 — Havuz motoru

12 filtre, huni raporu, histerezis, snapshot tablosu, planlı + acil yenileme, kara liste.

**Kabul:** Havuz 100 sembol üretiyor ve `universe_snapshots` yazılıyor. Aynı `config_hash` ile aynı
veriden aynı havuz çıkıyor (determinizm testi). Huni raporu her filtrenin elediği sayıyı gösteriyor.
Bir sembol elle kara listeye alındığında bir sonraki yenilemede çıkıyor.

---

## Faz 3 — Özellik ve puanlama motorları

İndikatör hattı, S/R motoru, formasyon motoru, kesitsel normalizasyon, bileşik puan, gerekçe nesnesi,
`score_observations` yazımı.

**Kabul:** Elle hesaplanmış fixture'larda indikatör değerleri birebir tutuyor. `hypothesis` property
testleri yeşil: puan her zaman `[0,100]`, aile katkıları toplamı taban puanı veriyor, `k` bar
tamamlanmadan pivot üretilmiyor (look-ahead testi). 100 sembol < 2 sn'de puanlanıyor. Her puanın
gerekçesi eksiksiz.

---

## Faz 4 — Boyutlandırma, risk ve paper motoru

`SizingEngine` (6 adımlı zincir), korelasyon kümeleri, `RiskEngine` devre kesicileri, `PaperAdapter`
(emir defteri dolum modeli, kayma, komisyon, gecikme, PRER simülasyonu).

**Kabul:** Property testleri: hiçbir koşulda tek pozisyon %30'u, toplam maruziyet %80'i, küme
maruziyeti %50'yi aşmıyor; stop her zaman girişin altında. Devre kesici senaryo testleri: yapay
−%4 günlük zarar enjekte edilince yeni giriş reddediliyor, −%15'te kill switch tetikleniyor.
Paper motoru bilinen bir emir defterinde elle hesaplanmış dolum fiyatını birebir üretiyor.

---

## Faz 5 — Bot süpervizörü

İzole worker süreçleri, heartbeat, yaşam döngüsü durumları, güvenli/sert durdurma, DB'den durum
kurtarma, `structlog` yapılandırılmış loglama, Redis Streams olay yayını.

**Kabul:** Kaos testi — çalışan üç bottan birine exception enjekte edilir; diğer ikisi çalışmaya
devam eder, hatalı bot `ERROR` durumuna geçer ve bildirim gider. Süreç `kill -9` ile öldürülüp
yeniden başlatıldığında açık pozisyonlar DB'den doğru şekilde kurtarılır.

---

## Faz 6 — Terminal arayüzü (TUI)

Textual uygulaması, WebSocket istemcisi, dört panel, renkli log akışı, klavye kısayolları,
kill switch, yeniden bağlanma mantığı.

**Kabul:** SSH üzerinden açılıyor ve akıcı çalışıyor. Bağlantı kesilip yeniden kurulduğunda TUI
kendini toparlıyor **ve bot etkilenmiyor**. TUI kapatıldığında işlemler devam ediyor.

---

## Faz 7 — Panel çekirdeği

Auth akışı, kabuk (sidebar + topbar + ⌘K), Panel, Havuz, Puanlar, Botlar, Pozisyonlar sayfaları,
WebSocket ile canlı güncelleme, bildirim gelen kutusu.

**Kabul:** Playwright E2E: giriş → bot oluştur → başlat → puan tablosunda canlı güncelleme gör →
pozisyon aç → bildirimi al → botu durdur. Tüm sayısal hücreler `tabular-nums`.

---

## Faz 8 — Terminal sayfası ve grafikler

Çok panelli çalışma alanı (dockview), TradingView Lightweight Charts entegrasyonu, S/R seviyelerinin
ve formasyonların grafik üzerine çizimi, Puan Kartı bileşeni, komut satırı, yerleşim kaydetme.

**Kabul:** Bir sembolün grafiği, S/R seviyeleri ve tespit edilen formasyonlarla birlikte açılıyor.
Puan Kartı beş aile katkısını doğru oranlarda gösteriyor. Yerleşim kaydedilip geri yükleniyor.
Görsel regresyon testleri yeşil.

---

## Faz 9 — Backtest ve strateji atölyesi

Olay güdümlü backtest motoru, maliyet senaryoları, üç zorunlu kıyas, walk-forward, rapor sayfası,
strateji düzenleyici, versiyonlama, zaman dilimi başına ayrı bot desteği.

**Kabul:** Bilinen-sonuçlu senaryo fixture'ı (elle hesaplanmış 20 işlemlik mini backtest) birebir
tutuyor. Rastgele portföy kıyası her raporda görünüyor. `Sharpe > 3` üreten bir fixture'da kırmızı
bayrak basılıyor. Snapshot'sız dönemler "YAKLAŞIK EVREN" damgası taşıyor.

---

## Faz 10 — Sohbet, bildirim, entegrasyon, yönetim

Sohbet (birebir + grup), bildirim kuralları, Discord entegrasyonu (kanal eşlemesi, toplu gönderim,
test butonu), kullanıcı yönetimi, log sayfası, ayarlar, audit log.

**Kabul:** Havuz güncellemesinde 30 ayrı Discord mesajı değil **tek özet mesaj** gidiyor.
Devre kesici olayı `@here` ile geliyor. Her yönetimsel eylem audit log'da. Webhook URL'leri
DB'de şifreli, panelde maskeli.

---

## Faz 11 — Sertleştirme ve terfi kapısı

Prometheus metrikleri + Grafana ✅, Sentry ✅, gecelik yedek + geri yükleme provası ✅, Caddy + SSL (dışarı
açılacaksa), `BinanceSpotAdapter` (kapalı gelir), canlıya geçiş kapısı.

**Canlıya geçiş kapısı — hepsi sağlanmadan `BinanceSpotAdapter` açılmaz:**

- [ ] En az **60 gün** kesintisiz paper çalışma
- [ ] Paper sonuçları backtest güven bandının içinde (aşırı sapma = model çürümesi)
- [ ] Kalibrasyon sayfasında puan desili → getiri ilişkisi hâlâ pozitif
- [ ] Maksimum drawdown %15'in altında kaldı
- [ ] Devre kesicilerin her biri en az bir kez gerçek koşulda tetiklendi ve doğru davrandı
- [x] Yedekten geri yükleme provası başarılı — 20 Ağustos 2026, `scripts/yedek-prova.sh`; haftalık otomatik tekrar
- [ ] Mali müşavir görüşü alındı (vergi ve devir hızı)
- [ ] İlk canlı sermaye ≤ 1.000 USD, `risk_pct` yarıya indirilmiş

---

## Zaman tahmini (Claude Code ile, tam zamanlı olmayan çalışma)

| Faz | Tahmin |
|---|---|
| 0 + 0a | 2–3 hafta (0a'nın kendisi ~2 hafta) |
| 1–2 | 1,5 hafta |
| 3 | 2 hafta |
| 4–5 | 2 hafta |
| 6 | 4 gün |
| 7–8 | 3 hafta |
| 9 | 2 hafta |
| 10 | 1,5 hafta |
| 11 | 1 hafta + 60 gün paper bekleme |

Toplam inşaat ≈ 15–16 hafta; canlıya geçiş bunun üstüne 60 günlük paper penceresi.
