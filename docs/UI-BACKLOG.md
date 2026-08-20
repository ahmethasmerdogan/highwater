# Arayüz iş listesi — kullanıcı talebi, 2026-08-16

> Referans: `/tmp/troya/DESIGN_SYSTEM.md` (troya-suite reposu), `docs/DESIGN.md`.
> **Durum: tamamlandı (2026-08-16), ardından GEÇERSİZ (2026-08-17).**
>
> Bu listedeki işler yapıldı, ama panelin tamamı 2026-08-17'de kullanıcı
> talebiyle **sıfırdan yeniden yazıldı** — bu belgede adı geçen dosyaların
> çoğu artık yok. Belge tarihsel kayıt olarak duruyor: hangi hataların
> bulunduğunu ve neden düzeltildiğini anlatıyor, ama **güncel arayüzü
> tarif etmiyor.** Güncel durum için `CHANGELOG.md` → "[Arayüz] Panel
> sıfırdan yeniden yazıldı".

## A. Görsel düzeltmeler
1. ✅ Butonlar bir kademe küçüldü ve **köşeli** oldu (`shape="rect"`, 10–12px) —
   `components/ui/button.tsx`.
2. ✅ Font yumuşatma: `-webkit-font-smoothing`, `-moz-osx-font-smoothing`,
   `text-rendering`, `kern`/`liga`. Monospace hücreler ligatürden muaf tutuldu
   (rakam genişliği bozulmasın).
3. ✅ Menü hover/focus yeniden tasarlandı: kehribar dolgu kalktı, seçili öğe sol
   kehribar ray + kehribar ikonla işaretleniyor; hover'da ray %40 opaklıkta beliriyor.
4. ✅ Kart dolgusu 16 → 24px (tüm panel sayfaları).
5. ✅ `<Amount>` iki tonlu sayı bağlandı. Ayrıca `<AmountText>` eklendi: zaten
   biçimlenmiş metni (`money`, `pctSigned`, `%`, `bps`) son virgülden ikiye ayırır,
   böylece biçimleyici kuralları ikinci kez yazılmıyor. Panel KPI'ları, canlı şerit,
   tüm tablo sayı sütunları ve detay panelleri iki tonlu.
   **Yan bulgu:** `.amount-*` kuralları katmansızdı ve Tailwind `utilities`
   katmanını yeniyordu — `text-up`/`text-down` yön renkleri hiç görünmüyordu.
   `@layer base`'e alındı.
6. ✅ Üst menü tooltip'i düzeltildi. Sebep: balon yukarı açılıyordu, üst çubuk
   ekranın en üstünde olduğu için `overflow-hidden` kabuk tarafından kırpılıyordu.
   `Tooltip`'e `side` eklendi; üst çubukta `side="bottom"`.

## B. DataTable — Troya tarzı ✅
`components/data-table.tsx`: sıralama (3 durumlu), arama, ayrık değer filtresi,
sütun seçici (`localStorage`'da kalıcı), sayfalama, satır tıklama.
Uygulandı: **Havuz · Puanlar · Botlar · Pozisyonlar · Stratejiler**.
Kısa listeler için eski tablo `SimpleTable` adıyla duruyor.

## C. Detay ekranları ✅
`components/detail-drawer.tsx` — sağdan açılan çekmece (modal değil: liste
kaybolmasın).
- **Havuz** → coin ölçütleri + Puan Kartı + yüzdelikler
- **Puanlar** → Puan Kartı, yüzdelikler, 7 günlük puan çizgisi, künye
- **Botlar** → üç sekme: nasıl çalışıyor · loglar · işlemler
- **Pozisyonlar** → açık pozisyon (R hesabı, stop, güncel puan) ve kapanan işlem
  (MFE/MAE, maliyet payı)
- **Stratejiler** → tanımın her alanı, açıklaması ve uyarısıyla; ham JSON'a geçiş
- **Bildirimler / Kullanıcılar** → aynı desen

## D. İşlevsellik ✅
- **Backtest** `FAILED` **kök nedeni bulundu ve düzeltildi:** panelin
  `<input type="date">` değeri saat dilimsiz bir damgaya çözülüyor, OHLCV
  çerçevesinin UTC farkındalı `open_time` sütunuyla karşılaştırılamıyordu
  (`Invalid comparison between dtype=datetime64[us, UTC] and datetime`).
  `BacktestParams.__post_init__` saat dilimsiz tarihi UTC kabul ediyor; 3 regresyon
  testi eklendi. Ayrıca panel `equity` gönderiyordu, API `initial_equity` bekliyordu —
  sermaye alanı hiç işe yaramıyormuş.
  Sayfa "fabrika"ya çevrildi: strateji/sürüm seçici, coin seçimi, kilitli
  out-of-sample ve formasyon anahtarları, kıyas eğrileri aynı grafikte, kırmızı
  bayraklar, işlem defteri, hata mesajı görünür.
- **İndikatörler**: sembol listesi puan yoksa havuzdan besleniyor (sayfanın "boş"
  görünme sebebi buydu). **Strateji kurgu atölyesi** eklendi: ağırlıklar, eşikler ve
  çıkış kuralları açıklamalarıyla düzenleniyor, kaydedince yeni sürüm doğuyor.
- **Kalibrasyon**: pencere seçici (90 g / 180 g / 1 yıl / 2 yıl), desil tablosu
  (gözlem, güven aralığı, "gürültüden ayrılıyor mu"), **aile IC zaman serisi** —
  veri uçtan zaten geliyordu ama hiç çizilmiyordu.
- **Ayarlar**: **motor artık `settings` tablosunu okuyor.** `core/settings_store.py`
  (30 sn TTL, yazınca düşen önbellek); `UniverseEngine.refresh` her yenilemede havuz
  filtre eşiklerini DB'den alıyor. Sayfa düzenlenebilir; her eşiğin ne yaptığı ve
  yanlış ayarlanırsa ne olacağı yazılı. Motorun okumadığı gruplar "motor okumuyor"
  rozetiyle salt okunur.
- **Bildirimler**: tıklanabilir detay — ne oldu / ne anlama geliyor / ne yapmalı,
  ham JSON yerine okunabilir alanlar. `read-all` yanlış fiille (POST) çağrılıyordu,
  düzeltildi. Loglar ve denetim kaydındaki JSON dökümleri de okunabilir hâle geldi.
- **Kullanıcılar**: düzenleme çekmecesi (görünen ad, yetki, parola sıfırlama).
- **Entegrasyonlar**: üç ayrı hata düzeltildi — kanal anahtarları motorunkilerle
  (`islemler`, `havuz`, `alarm`, `sistem`) uyuşmuyordu, kaydetme `webhooks` yerine
  `channels` gönderdiği için **hiçbir webhook kaydolmuyordu**, test ucu zorunlu
  `channel` parametresi istediği için test düğmesi hep 422 alıyordu.
- **Bot detay sayfası**: metrik yanıtı `{stats, equity_curve}` iken sözlük sanılıyor
  ve tüm kutular "—" gösteriyordu; olay kayıtları `at`/`detail` okuyordu ama alanlar
  `created_at`/`payload`.
- **Diyaloglar**: `Modal` zeminsizdi (her çağıran kendi kartını sarmalıymış, hiçbiri
  sarmıyordu) — yüzey bileşene taşındı.

## E. Ayrı terminal penceresi ✅
`scripts/open-terminal.sh [tui|log|shell]` — emülatörü kendisi seçiyor
(`SARNIC_TERMINAL` ile ezilebilir), grafik oturum yoksa komutu bulunduğu terminalde
çalıştırıyor. `make terminal`, `make terminal-log`, `make terminal-autostart`.
Pencere bir istemcidir; kapatmak işlemleri durdurmaz (bozulmaz kural 4).

## Dokunulmaz
Motor, botlar, testler. Yapılan motor değişiklikleri yalnızca üç yerde ve hepsi
bir hatanın ya da eksik kablonun karşılığı: backtest saat dilimi, `settings_store`,
`/settings` ucunun yanıt gövdesi. **388 test geçiyor** (379 + 9 yeni).
