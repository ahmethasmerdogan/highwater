# Sistem analizi — 2026-09-04

> Altı alan, altı salt-okunur analiz; her bulgu dosya:satır kanıtlı. Etki ×
> güven sırasıyla. "Yapıldı" işaretli maddeler aynı gün kapatıldı; gerisi
> önceliklendirilmiş kuyruktur. Ölçülmüş gerçekler MEYDAN-OKUMA'daki
> defterle tutarlıdır.

## 0. Tek sayfada sonuç

1. **Puanlama tasarımı verinin söylediğinin tersini varsayıyor.** Araştırma
   verisinde (157 sembol × 683 gün) aile IC'leri (24 sa ileri, gün-kümeli t):
   vol **+0,115 (t +18,5)**, trend −0,049 (−8,6), momentum −0,054 (−10,7),
   flow −0,028 (−9,5), sr = sabit (5,0, sıfır varyans), bileşik puan −0,007
   (t −1,2). Üç aile "yüksek iyidir" kayıtlıyken anlamlı NEGATİF; tek sinyal
   taşıyan aile vol. Canlı kalibrasyonun "p80+ dilimi −%0,16" bulgusuyla
   tutarlı. → Cüretkâr kol adayları: vol-ağırlıklı; trend/momentum tersine
   ("ortalamaya dönüş"); kapı seçiciliğe göre eşleştirilmiş (§2.3).
2. **Araştırma 50 dk/varyant çünkü tanımdan bağımsız iş her varyantta
   yeniden yapılıyor.** Yüzdelik matrisine kadar zincirde hiçbir strateji
   parametresi yok → panel önbelleği (5–43 MB) ile varyant başına saniyeler.
3. **Operasyon: 2 GB tavan filoyu swap'a itti** (günde 9 nabız restart'ı);
   fırtına limiti nabız zaman aşımlarını da sayıp bütün filoyu ERROR'a
   düşürebilirdi; her yeniden doğuş son barı yeniden koşuyordu. **Yapıldı.**
4. **Veri katmanı: bayat ticker kesimi = tazeleme süresi** (periyodik boş
   önbellek), üç pazar için tek nabız, süresi dolmayan hisse ticker'ı, açık
   seansın kapanmış bar gibi yazılması, TTL'siz son-bar hash'i.
5. **Kaldıraç riski çarpmaz** (tasarım); "daha çok kazanç" = risk_pct.
   Kısa taraf gerçek ikinci kenar; dokunma noktaları §3.6.

## 1. Veri katmanı

| # | Bulgu | Kanıt | Düzeltme | Etki | Durum |
|---|---|---|---|---|---|
| 1 | Ticker bayatlık kesimi (900 s) = tam tazeleme süresi (900 s) → hiç işlem görmeyen sembol her döngüde 60 sn "yok"; havuz yenilemesi hayalet eklenen/çıkan yazar | marketdata.py:75,444,949 | tazeleme 300 s; kesim 2× | S | kuyruk |
| 2 | Tek küresel nabız üç pazarı kapılıyor: equitydata ölürse BIST/US bayat fiyatla işler, marketdata ölürse hisse botları gereksiz durur | marketdata.py:401, worker.py:511 | pazar başına `heartbeat:{market}` | S/M | kuyruk |
| 3 | Hisse ticker'ı ve `_last_close` hiç süresi dolmaz/temizlenmez; delist BIST adı son fiyatta "canlı" | marketdata.py:946, equities.py:452-596 | N seans yaşlı girdiyi düş; `at` ↔ son seans | S | kuyruk |
| 4 | Açık seans kapanmış bar olarak yazılıyor (`is_closed=True`); gün içi restart kısmi barı kalıcılaştırır | equities.py:236,298-337, store.py:59 | `day > last_closed_session` satırlarını düş | S | kuyruk |
| 5 | `KEY_LAST_BAR` TTL'siz ve yaş kontrolsüz; açık pozisyonları fiyatlıyor; sessiz kline soketi yeşil nabızla donuk fiyat bırakır | marketdata.py:552-555,962; worker.py:1179 | expire 3×bar, yaş süzgeci, akış başına canlılık | S/M | kuyruk |
| 6 | Hisse veri kalitesi kör: yalnız `find_gaps` + log; `/data-quality`'de hisse satırı yok | equities.py:683-701 | `audit_frame` + `persist_report` + aralık yeniden çekimi | M | kuyruk |
| 7 | `last_closed_session` 10 takvim günü geriye bakar; bayram+haftasonu 9 gün → `None` → `_due` kalıcı False | calendar.py:91,114; equities.py:412 | `date_to_session(direction="previous")` | S | kuyruk |
| 8 | Halted/delist kripto canlı gibi fiyatlanır (status yalnız girişte) | filters.py:151 | açık pozisyon fiyatlarken `status` kontrolü | S/M | kuyruk |
| 9 | Hisselerde tick/lot/min-notional yok → kesirli hisse dolumu | marketdata.py:158-197, sizing 281-287 | statik hisse SymbolInfo (BIST fiyat adımı, lot 1) | M | kuyruk |
| 10 | Fonlama/OI/likidasyon akışı yok — geriye doldurulamaz, toplamaya ŞİMDİ başlanmalı | — | `/fapi/v1/fundingRate`, `openInterestHist` | M/L | kuyruk |
| 11 | 20 kademe defter akıyor, yalnız en iyi alış/satış okunuyor | marketdata.py:572-580 | dengesizlik/mikro-fiyat/derinlik özelliği | M | kuyruk |
| 12 | Spread geçmişi yalnız evet/hayır filtresi; dolum modeline girmiyor | marketdata.py:585-627 | gerçekleşen spread → dolum maliyeti | S | kuyruk |
| 13 | Yahoo `events=div,split` istenmiyor; kurumsal olaylar kaydedilmiyor | equities.py:301-304 | olayları yakala (as-of için) | S | kuyruk |
| 14 | `taker_buy_ratio` hisselerde ölü (hep 0) — flow ailesinin 1/3'ü nötr | equities.py:234, registry.py:48 | pazar-farkındalı özellik seti | S | kuyruk |
| — | Test boşlukları: ratelimiter, binance retry, equities parse/_due/refresh, read_tickers matrisi | — | üç fikstür testi | S | kuyruk |

## 2. Özellikler ve puanlama

1. **Kalibrasyon ucu sızdırıyor:** `/calibration` gözlemleri config_hash/
   timeframe/pazar süzmeden alıyor (scores.py:339-350); iki puanlama ayarı
   canlıyken aynı sembol-bar iki puanla, aynı ileri getiriyle havuza giriyor;
   BIST ve kripto aynı "1h"e karışıyor. Havuzlanmış IC gerçek IC'yi ~%45
   söndürüp anlamlılığı şişiriyor (n=273k bağımsız sayılıyor). Düzeltme:
   sütun+filtre; bar-içi IC → günlük ortalama → günlük seri t (zaten
   `_gate_edge`'de var, calibration.py:350-358); desilleri bar içinde sırala.
   **S, ilk iş.**
2. **Araştırma harness'ına puan düzeyi ön-eleme:** 28 varyant 13-32 işlemle
   karar veriyor; aynı tanımlar binlerce bar üstünde top-k ileri getiri
   kenarıyla (gün-kümeli t) haftalar içinde karara bağlanır. **M, en yüksek
   kaldıraç.**
3. **Ağırlık varyantlarında kapıyı seçiciliğe eşle:** ağırlık değişince
   puan ÖLÇEĞİ değişir ama kapı 80 ve kademe 80 sabit; ablasyonlar farklı
   seçicilikle kıyaslandı (vol=0 n=32, trend=0 n=26 vs kontrol 13). Her
   varyantta `min_score`'u kontrolün giriş/bar oranına eşle. **S.**
4. **Vol-ağırlıklı test edilmedi** — IC'nin desteklediği tek yapı. Varyant:
   vol 50/70/100 (kapı eşlenmiş) + trend/momentum yarım. **S, kod yok.**
5. **Gereksiz eksenler:** ema_alignment↔price_over_ema200 ρ 0,93;
   bb_width↔atr_pct 0,75; trend↔momentum 0,75-0,84 → 13 özellik ≈ 5 eksen.
   `realized_vol` hesaplanıyor ama puanlanmıyor. **S ölçüm / M değişiklik.**
6. **sr ailesi sabit** (rr_geometry/support_strength NaN → nötr 50): 10
   ağırlık bilgi taşımıyor. Canlıda `rationale->percentiles->rr_geometry =
   50.0` sayımıyla doğrula. **S.**
7. **Formasyon düzenleyicisi kapının kendisi ve hiç kalibre edilmedi:**
   sabit güvenler (kama 0,6, üçgen 0,5 direction=0), `best` yönü yok sayar,
   hacim teyidi yanlış barı okuyor (patterns.py:104,300-311,398-405).
   `modifiers->pattern` her satırda var: IC/desil ve tür başına isabet bugün
   ölçülebilir. **S ölçüm, M düzeltme.**
8. **Kurmaya değer tek yeni özellik: 30 günlük zirveye yakınlık**
   (George–Hwang): IC24 +0,047 (t +2,7), IC72 +0,079 (t +3,6), vol ekseniyle
   ρ −0,29. Çürütülenler (kurulmayacak): vol-düzeltilmiş momentum,
   BTC-artık momentum, BTC beta, hacim-fiyat sapması, idiosinkratik vol
   (atr_pct'in kopyası). **M.**
9. **Backtest küme look-ahead'i:** `_compute_clusters(data)` bütün 1d
   geçmişten tek sefer (engine.py:344,817-823); canlı 90 günlük kayan.
   Kural 2 ihlali, test yok. **M, backtest.**
10. **İnce havuzda yüzdelik:** uçlar hep 0/100, `n−1` böleni → ölçek havuz
    boyutuna bağlı, kapı mutlak. `n_pool` kaydet, mid-rank/n. **S.**
11. `VOLUME_PROFILE_DAYS=30` (720 bar) hiç tutmadı — 400 bar sağlanıyor. **S.**
12. Test boşlukları: build_bundle ↔ precomputed SR/formasyon eşdeğerliği;
    havuz üyesi ekle/çıkar → yalnız sıra değişir; NaN→50; küme look-ahead;
    test_scoring kesitleri tam eşdoğrusal. **S.**

## 3. Havuz, boyut, risk, yürütme

| # | Bulgu | Kanıt | Düzeltme | Etki | Durum |
|---|---|---|---|---|---|
| 1 | `kill` ucu "pozisyonlar kapatılıyor" der, yalnız STOPPED yazar → öksüz pozisyon | bots.py:253-258 | kapat-sonra-durdur tek işlemde | S | kuyruk |
| 2 | Re-base `equity_peak`'i klemplemiyor → aşağı re-base ilk barda MAX_DRAWDOWN kill | portfolio.py:187, bots.py:150 | peak = max(capital, equity@rebase) | S | kuyruk |
| 3 | Kısmi kârlı işlemde canlı R son dilime bakıyordu | worker.py:828 | paylaşılan `weighted_r` | S | **yapıldı** |
| 4 | `check_stop_triggers` asla ateşlemez; STOP_LOSS_LIMIT emirleri iptal edilmez, hayalet birikir | paper.py:399-416, worker.py:1087 | sil ya da gerçek stop alanıyla uygula | S | kuyruk |
| 5 | Rotasyon kurbanı boyutlandırmadan ÖNCE kapatır; ret gelirse slot boş kalır | worker.py:903-921, engine.py:737-751 | önce boyutla, kabulde rotasyon | M | kuyruk (backtest) |
| 6 | Giriş/çıkış kayma asimetrisi (girişte vol ölçekli, çıkışta düz) | worker.py:696,1025; paper.py:321 | çıkışa da realized_vol; tek model | S | kuyruk |
| 7 | Backtest küme look-ahead (bkz. §2.9) | engine.py:344 | kayan 90 g | M | kuyruk |
| 8 | Backtest kısmi satışta dilimin giriş komisyonu düşülmüyordu | engine.py:635 | muhasebe değişmezi | S | **yapıldı** |
| 9 | Backtest `requires_manual_restart`'ı yok sayar (WEEKLY_LOSS sonrası sim devam eder) | engine.py:458-462 | aynı semantik | S | kuyruk |
| 10 | API hata oranı / 418 kesicileri canlıda erişilmez; DEGRADED tek yönlü | worker.py:512-534, risk 267 | tracker'ı bağla; kurtarma kenarı | M | kuyruk |
| 11 | `max_stop_pct` testi gerçek stop formülünü kullanmıyor; 8% tavan uzak-destek adlarına önyargılı bağlanıyor | test_sizing 351, sr.py:408 | önce `stop çok uzak` sayımı | S | ölçülecek |
| 12 | ADV yok = likidite limiti gibi görünüyor ("boyut sıfır") | worker.py:401, sizing 252 | açık "likidite verisi yok" reddi | S | kuyruk |
| 13 | `step_size`/`min_notional` hiç geçilmiyor → `round_to_step` ölü | sizing 281 | gerçek borsada anında ret kaynağı | S | kuyruk |
| 14 | Kripto stop'u kapanıştan örnekleniyor, backtest `low` ile → canlı fitilleri atlatıyor, backtest'ten iyi görünüyor | worker.py:287-296, 1179 | `low` (giriş sonrası sınırlı) + stop_fill_price | M | kuyruk (parite) |
| 15 | `min_fill_ratio` marjinal slotu yapısal olarak öldürür (4×%30 vs %80 tavan) | sizing 251,266-273 | kırıntı tabanı `max(min_notional, k×equity)` | M | kuyruk (backtest) |
| 16 | Rotasyon güncel adayı GİRİŞ anındaki puanla kıyaslar | portfolio.py:76 | güncel puan | S | kuyruk (backtest) |
| 17 | TIME çıkışı koşulsuz (n=3, +3,5R) | exits.py:105 | `r>x` ise atla ya da yalnız iz | S | bot 17 ölçüyor |
| 18 | Havuz filtre eşiklerinin çoğu ölçülmemiş; huni sayıları snapshot'ta var | filters.py | marjinal-verim sorgusu | S | ölçülecek |
| 19 | Sert filtreden düşen tutulan sembol snapshot'tan kaybolur → SCORE çıkışı erişilmez | filters.py:386-390 | korumalı yer tutucu | S | kuyruk |
| 20 | Küme tavanı yalnız kripto; BIST/US dört korele banka tutabilir | supervisor 366, clusters 90-126 | pazar sütunu | M | kuyruk |
| 21 | Hisse havuzunda histerezis/koruma yok | equities.py:607-660 | aynı sınıf boşluk | M | kuyruk |
| 22 | Varsayılan tanım emekli kademe (80/85/92) taşıyor; `validate` iki kuralı toplamak yerine fırlatıyor | definition.py:141,202 | eşle | S | kuyruk |
| 23 | Canlı delist atıl: `delisted` hiç set edilmiyor, `halt_symbol` çağrılmıyor | — | bağla | S | kuyruk |

### 3.6 Kısa taraf — dokunma noktaları
sizing (stop-üstü değişmezi, `qty=risk/(entry−stop)`, brüt/net maruziyet),
exits (`price<=stop` yönü, BE/iz, `min(stop,open)`→`max`), paper (negatif
envanter + borç, marj kuralı, likidasyon yukarıdan, destek-headroom),
backtest (`high>=stop`, marj), worker (`OrderSide.BUY` sabit; `Position.side`
var), puanlama (alt desil seçici; kapı/çıkış tek yönlü), havuz (perp
uygunluğu) + fonlama akışı. Sıra: veri (fonlama) → paper/backtest simetri
→ kısa kol.

## 4. Botlar, API, operasyon

| # | Bulgu | Kanıt | Düzeltme | Durum |
|---|---|---|---|---|
| 1 | 2 GB tavan 14 worker'ı swap'a itti; 9 nabız restart'ı aynı saniyede | bellek.conf | 5G + `OOMPolicy=continue` | **yapıldı** |
| 2 | Fırtına limiti nabız zaman aşımlarını sayıyor → filo toptan ERROR riski | supervisor 40,198 | yalnız hızlı çökme; 30 dk soğuma | **yapıldı** |
| 3 | `_last_bar` bellekte → her doğuşta bar yeniden koşuyor (günde ~50) | worker 113,216 | `bots.last_bar_at` | **yapıldı** |
| 4 | DEGRADED tek yönlü kapı; puanlamaz ama sağlıklı görünür | worker 210,534 | allow_entry=False ile koş, temizlenince dön | kuyruk |
| 5 | `/system/attention` 112k satırı her 20 sn yüklüyordu | main.py:338 | count + limit 1 | **yapıldı** |
| 6 | WS hub okuyucu bir kez düşünce hiç kalkmıyor | ws.py:81-83 | `done()` kontrolü | kuyruk (S) |
| 7 | Ölü `_sender` = sessizce bayat panel | ws.py:210 | done_callback → kapat | kuyruk (S) |
| 8 | Bildirimci restart'ta olay kaybeder (`$`, tüketici grubu yok) | notify 196, events 142 | XREADGROUP/ack | kuyruk (M) |
| 9 | Supervisor/notifier deadman yok | — | eklendi (supervisor) | **yapıldı** (notifier kuyruk) |
| 10 | `list_bots` N+1 (37 sorgu/15 sn) | bots.py:41-90 | group_by + selectinload | kuyruk (S) |
| 11 | `/portfolio/benchmark` önbelleksiz, O(bot×5000) | portfolio 166 | 60 s Redis | kuyruk (S) |
| 12 | Tanım süreç ömrü boyunca önbellekli | worker 130 | sv değişince yeniden oku | kuyruk (S) |
| 13 | Yalnız scores budanıyor; notifications 122k, bot_events 48k büyüyor | supervisor 380 | olay budama döngüsü | kuyruk (S) |
| 14 | `run-web.sh` her açılışta derliyor; OOM'da sonsuz derleme döngüsü | run-web.sh:33 | ayrı derleme adımı | kuyruk (S) |
| 15 | `ExecStartPre` migration ve docker sıralaması yok | units | `After=docker` + alembic | kuyruk (S) |
| 16 | Yedek tek diskte | yedek-al.sh | rsync dışarı | kuyruk (S) |
| 17 | CLI'da create-bot/clone/rebase/prune yok (hepsi elle betik) | cli.py | komutlar | kuyruk (M) |
| 18 | worker/supervisor uçtan uca testi yok | tests/ | "restart mid-bar yeniden açmaz" | kuyruk (M) |
| 19 | TUI hâlâ `/system/status` | tui/client 96 | attention | kuyruk (S) |
| 20 | uvicorn erişim logu WS bilet JWT'sini journal'a yazıyor | ws.py:151 | `--no-access-log` | kuyruk (S) |

## 5. Backtest ve araştırma araçları

1. **Panel önbelleği (XL):** yüzdelik matrisine kadar zincir tanımdan
   bağımsız; `(pazar, tf, aralık, snapshot'lar, kod-hash)` anahtarlı
   float32 panel (110 sym × 454 bar × 25 ≈ 5 MB; 90 g ≈ 43 MB), mmap;
   varyant × maliyet × kat = ağırlık·pct + portföy sim (saniyeler). Eşdeğerlik
   property testi ile. **M.**
2. **Holdout'u işlem sayısıyla boyutla; MDE'yi yaz;** walk-forward ölü kod
   (`folds*200`). **S.**
3. **Eşleştirilmiş kıyas + gün-kümeli bootstrap** (varyans 3–5× düşer);
   `expectancy_r` ve `avg_r` aynı sayı. **M.**
4. **Çoklu karşılaştırma:** BH-FDR + reality-check; aile boyutu defterde. **S.**
5. **Fidelite:** bar-içi yönetim (canlı 15 sn, backtest yalnız kapanış+low
   → iz/kısmi geç ateşler — F sonucuna karşı önyargı); MFE/MAE kapanıştan;
   dolum sabitleri iki yerde; hisselerde rejim uydurma ("boğa"); çapalar
   farklı. **M.**
6. **Hisse Sharpe 365/252 hatası (1,20×).** **S.**
7. **Araştırma CLI:** spec → ön-doğrulama (ölü varyant yakalar) → panel →
   süreç havuzu → `sweep_runs/sweep_variants` defteri + markdown. **M.**
8. Metrik boşlukları: maliyet payı, maruziyete göre getiri, saat/gün
   dilimleri, rejim başına işlem, MFE/MAE, yıllık devir. **S.**
9. Panel artımlı büyür; `backfill` aynı paneli kullansın. **S.**

## 6. Web paneli v3

1. Canlı olaylar sohbet dışında hiçbir sorguyu geçersiz kılmıyor → kanal→
   anahtar haritası + aralıkları 60–120 s'ye çek (~40 poll gider). **M.**
2. `ink3` açık temada 2,37:1 kontrast (tüm tablo başlıkları, altyazılar) →
   `--sn-ink-3` ≈ `#767268` (4,6:1). **S, en yüksek etki/emek.**
3. Blok başına tazelik rozeti (`Panel.stale`, `useFreshness`). **M.**
4. Portal katmanları odak halkası ve reduced-motion kapsamı dışında. **S.**
5. Köprü'de hata dalı yok. **S.** 6. `now` memo bağımlılığı her render'da
   grid'i yeniden kurar. **S.** 7. `useLive` bağlamı her karede churn. **M.**
8–10. Sparkline recharts'ı sürüklüyor; dockview CSS her rotada; `motion`
   tam runtime + Reveal içinde çift giriş, hover tabloyu kaydırıyor. **S.**
11. Sembol derin bağlantıları pazarı kaybediyor. **S.** 12. Nav'ın gizlediği
rotalar korumasız. **S.** 13. Denetim betiği eski rotaları test ediyor;
görsel regresyon yok. **M.** 14. Drawer'da odak tuzağı yok. **S.**
15. Aynı uç üç anahtarla çekiliyor. **M.** 16. DataGrid telefonda
kullanılamaz. **M.** 17. Sanallaştırma eşiği. **S.** 18. Para birimi tek
yerde uydurma (BIST'te "USDT"). **S/L.** 19. `-0,00` kırmızı; `B` birim
çakışması. **S.** 20. Saat dilimi etiketsiz; "bugün" UTC. **S.**
21. v3 sonrası ölü kod. **S.** 22. Terminal panelleri sayfaları farklı veri
sözleşmesiyle kopyalıyor. **M.** 23–24. Günlük admin notu; çevrimdışı
şerit `aria-live`. **S.**

## 7. Sıra (etki × güven ÷ emek)

**Bu hafta (S):** veri 1,4,5,7 · risk 1,2 · ops 6,7,10,11,13,20 · web 2,4,5,6,11,12,20
· puanlama 1 (kalibrasyon sızıntısı) · backtest 6 (Sharpe) · kuyruktaki
"ölçülecek"ler (sr sabit mi, formasyon IC, stop-uzak sayımı, huni verimi).
**Cüretkâr kollar (kod yok):** vol-ağırlıklı (kapı eşlenmiş) · trend/momentum
tersine · vol 100. **Sonraki (M):** panel önbelleği + araştırma CLI +
eşleştirilmiş kıyas · bar-içi fidelite · canlı olay→sorgu haritası · pazar
başına nabız · fonlama akışı toplama. **Büyük (L):** kısa taraf.
