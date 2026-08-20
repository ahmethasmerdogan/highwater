# SARNIÇ — Claude Code ile başlangıç

## Kurulum

```bash
mkdir sarnic && cd sarnic
mkdir -p docs design
# Bu 5 dosyayı docs/ altına koy:
#   CLAUDE.md  →  ama bunu KÖK dizine koy (Claude Code otomatik okur)
#   MASTER-SPEC.md · ROADMAP.md · DESIGN.md · CHANGELOG.md  →  docs/
# HashUI klasörünü design/hashui/ altına kopyala
git init && git add -A && git commit -m "docs: şartname seti"
claude
```

`CLAUDE.md` kök dizinde olmalı — Claude Code onu her oturumda otomatik okur.

---

## Faz 0 için yapıştırılacak prompt

```
=== PROMPT BAŞLANGICI ===

Bu projeyi sıfırdan inşa edeceğiz. Önce şu dosyaları oku ve bana tek paragrafta ne
anladığını özetle:

  CLAUDE.md
  docs/MASTER-SPEC.md
  docs/ROADMAP.md
  docs/DESIGN.md
  design/hashui/   (klasördeki tasarım dosyaları)

Özetin sonunda, spec'te sana çelişkili veya eksik gelen ne varsa listele. Uydurma —
sor veya docs/OPEN-QUESTIONS.md'ye yaz.

Onayımı aldıktan SONRA Faz 0'ı uygula. Faz 0'ın kapsamı ROADMAP.md'de tanımlı;
dışına çıkma. Özellikle:

  - Faz 1'in veri katmanına dokunma
  - Puanlama, boyutlandırma, bot mantığı YAZMA — o fazlar sonra
  - Placeholder/mock sayfalar üretme; Faz 0 sadece iskele + auth

Çalışma biçimi:
  1. Önce kısa bir plan yaz (adım → nasıl doğrulanacak)
  2. Planı onaylamamı bekle
  3. Uygula
  4. Kabul kriterini gerçekten çalıştırarak doğrula, çıktıyı göster
  5. CHANGELOG.md'ye girişi yaz

Her adımda karpathy-guidelines'a uy: varsayımını söyle, en basit çözümü seç,
cerrahi değişiklik yap, doğrulanabilir kriter tanımla.

=== PROMPT SONU ===
```

---

## Faz 0a için ayrı prompt (kritik faz)

Faz 0a'yı **ayrı bir oturumda** ve `research/` klasöründe yap. Uygulama koduna karışmasın.

```
=== PROMPT BAŞLANGICI ===

docs/ROADMAP.md → "Faz 0a" bölümünü oku. Bu fazın amacı kod tabanı kurmak değil,
tek bir soruyu cevaplamak: bu puanlama ileri getiriyi öngörüyor mu?

Kurallar:
  - Sadece research/ klasöründe çalış. apps/ altına hiçbir şey yazma.
  - Polars + Parquet + tek bir notebook/script. FastAPI, Docker, DB yok.
  - Formasyon motorunu bu fazda YAZMA (en zayıf halka, deneyi bulandırır).
  - Point-in-time evren zorunlu: delist edilmiş sembolleri dahil et.
  - Kilitli out-of-sample penceresi: verinin son %30'una bu fazda HİÇ dokunma.
  - Kaç deneme yaptığını research/TRIAL-LEDGER.md'ye yaz. Her parametre
    değişikliği bir denemedir.

Çıktı: research/PHASE-0A-REPORT.md — ROADMAP'teki 4 testin grafikleri, 4 sayısı
ve tek cümlelik kararı.

Sonuç olumsuzsa bunu açıkça yaz. Ağırlıkları değiştirip tekrar deneme —
o, aynı veri üzerinde arama yapmaktır ve sonucu kaçınılmaz olarak uydurma yapar.

=== PROMPT SONU ===
```

---

## Sonraki fazlar için kalıp

```
docs/ROADMAP.md → "Faz N" bölümünü oku. Sadece o fazı uygula.
Önce plan yaz ve onayımı bekle. Sonra uygula. Kabul kriterini gerçekten
çalıştırarak doğrula. CHANGELOG.md'ye gir.
Önceki fazların kodunu "iyileştirme" — bozuk değilse dokunma.
```

---

## Oturum hijyeni

- **Faz başına bir oturum.** Bağlam şişince Claude spec'i unutmaya başlar.
- Uzun oturumlarda `CLAUDE.md`'yi tekrar okutmak ucuz ve etkilidir.
- Kod incelemesinde tek bir soruya odaklan: **"bu satır, t anında henüz bilinemeyecek bir veri
  kullanıyor mu?"** Look-ahead sana felsefi bir kavram olarak değil, masum bir `shift` hatası
  veya bugünün kapanışıyla bugün pozisyon açan bir satır olarak gelecek — ve backtest'i
  muhteşem gösterecek.
- Testleri Claude yazsın ama **testleri sen oku.** Kodun kendisinden çok testler sana sistemin
  ne yaptığını anlatır.
