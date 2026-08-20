# Faz 0a — Doğrulama deneyi

> Bu klasörün amacı kod tabanı kurmak değil, **tek bir soruyu cevaplamak**:
> bu puanlama ileri getiriyi öngörüyor mu?

`apps/` altına hiçbir şey yazılmaz. FastAPI, Docker, DB yoktur — yalnızca
Parquet dosyaları ve saf fonksiyonlar.

## Kurallar (ROADMAP Faz 0a)

1. Formasyon motoru bu fazda **yoktur** — en zayıf halka, deneyi bulandırır.
2. Point-in-time evren zorunludur: delist edilmiş semboller dahil edilir.
3. Verinin son **%30'u kilitlidir**. Bu fazda o pencereye **hiç dokunulmaz**.
4. Her parametre değişikliği bir denemedir ve `TRIAL-LEDGER.md`'ye yazılır.

## Çalıştırma

```bash
cd apps/engine
# 1) Arşivden veri indir (150 sembol × 2 yıl, ~birkaç GB)
uv run python ../../research/phase0a.py fetch --symbols 150 --days 730

# 2) Point-in-time evreni kur
uv run python ../../research/phase0a.py universe

# 3) Puanla ve ileri getirilerle eşleştir
uv run python ../../research/phase0a.py score

# 4) Dört testi çalıştır ve raporu üret
uv run python ../../research/phase0a.py report
```

Çıktı: `research/PHASE-0A-REPORT.md` — dört grafik, dört sayı, tek cümlelik karar.

## Kabul kriteri — dördü birden sağlanmalı

| # | Test | Geçme şartı |
|---|---|---|
| 1 | Puan desili → ortalama 24s ileri getiri | Monoton artan; üst-alt desil farkı anlamlı |
| 2 | Spearman (puan ↔ 24s getiri) | 90 günlük pencerelerin çoğunda pozitif |
| 3 | Top-5 vs eşit ağırlıklı likit-100 | Maliyet ve kayma sonrası risk-ayarlı üstünlük |
| 4 | Top-5 vs devir-eşleştirilmiş rastgele | Rastgeleyi anlamlı biçimde geçmeli |

**Test 4 en önemlisidir.** Rastgele portföyü geçemiyorsa sıralama değer katmıyor
demektir; getirinin kaynağı sadece devir ve yeniden dengelemenin mekanik etkisidir.

## Sonuç olumsuzsa

Durun. **Ağırlıkları değiştirip tekrar denemeyin** — bu, aynı veri üzerinde arama
yapmaktır ve sonucu kaçınılmaz olarak uydurma yapar. Bunun yerine hipotezi
değiştirin (farklı özellik ailesi, farklı zaman dilimi, farklı evren) ve
**kilitli out-of-sample penceresine dokunmadan** yeniden test edin.

Kaç deneme yapıldığı `TRIAL-LEDGER.md`'de tutulur. Deneme sayısı arttıkça
tesadüfen "anlamlı" sonuç bulma olasılığı artar; rapor bunu dikkate almak zorundadır.
