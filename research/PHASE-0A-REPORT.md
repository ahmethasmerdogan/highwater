# Faz 0a — Doğrulama raporu

**Üretim tarihi:** 2026-08-15
**Gözlem:** 191584 puanlama · 1916 bar · 157 sembol
**Kilitli out-of-sample:** son %30 — bu raporda kullanılmadı

## Karar

> **HAYIR — dört testin hepsi geçmedi; bu puanlama hipotezi doğrulanmadı.**

## Dört test

| # | Test | Sonuç | Değer |
|---|---|---|---|
| 1 | Desil monotonluğu + anlamlılık | ❌ | monoton=False, p=0.0342 |
| 2 | Spearman pencerelerinin çoğu pozitif | ❌ | %30 pozitif, genel ρ=-0.0058 |
| 3 | Top-5 vs eşit ağırlıklı | ❌ | 0.168× vs 0.178× |
| 4 | Top-5 vs rastgele portföy | ❌ | rastgele dağılımın %56. yüzdeliği |

## Desil grafiği (puan → ortalama 24s ileri getiri)

| desil | gözlem | ort. getiri | %95 GA |
|---|---|---|---|
| 1 | 19158 | %-0.1643 | %-0.2746 … %-0.0540 |
| 2 | 19158 | %-0.0652 | %-0.1569 … %0.0264 |
| 3 | 19159 | %0.0820 | %-0.0104 … %0.1744 |
| 4 | 19158 | %-0.0337 | %-0.1187 … %0.0513 |
| 5 | 19159 | %-0.0483 | %-0.1416 … %0.0450 |
| 6 | 19158 | %-0.0978 | %-0.1862 … %-0.0094 |
| 7 | 19158 | %-0.1033 | %-0.1949 … %-0.0117 |
| 8 | 19159 | %-0.0253 | %-0.1161 … %0.0656 |
| 9 | 19158 | %-0.0311 | %-0.1284 … %0.0663 |
| 10 | 19159 | %0.0019 | %-0.1054 … %0.1091 |

## Aile bazında bilgi katsayısı (IC)

| aile | IC |
|---|---|
| flow | -0.0165 |
| momentum | -0.0309 |
| sr | — |
| trend | -0.0278 |
| vol | 0.0581 |

## Yorum

Puan ile ileri getiri arasında ölçülebilir ilişki yok. Desil grafiği düz; bu puanlama şu an öngörü üretmiyor.

Rastgele portföy dağılımı: p05=0.065× · p50=0.148× · p95=0.349×

**Test 4 en önemlisidir.** Rastgele portföyü geçemiyorsa sıralama değer katmıyor demektir; getirinin kaynağı sadece devir ve yeniden dengelemenin mekanik etkisidir.

## Sonraki adım

Sonuç olumsuz. **Ağırlıkları değiştirip tekrar denemeyin** — bu, aynı veri üzerinde arama yapmaktır. Hipotezi değiştirin (farklı özellik ailesi, farklı zaman dilimi, farklı evren) ve kilitli pencereye dokunmadan yeniden test edin. Denemeyi `TRIAL-LEDGER.md`'ye yazın.

---

## Ek ölçüm: sinyal mi yok, maliyet mi yiyor?

Portföy testleri "hayır" derken, sinyalin hiç olmadığı anlamına gelmiyor.
Ayrıştırma:

| senaryo | top-5 | eşit ağırlıklı |
|---|---|---|
| maliyetli (15 bps tek yön) | 0,168× | 0,178× |
| **maliyetsiz** | 0,709× | 0,749× |

Maliyet 478 günde sermayenin dörtte üçünü yiyor. Ama maliyetsiz koşuda bile
top-5, eşit ağırlıklı sepetin **altında** — yani sıralama portföy düzeyinde
değer katmıyor.

### Kenar ölçümü

> **2026-08-16 güncellemesi.** Maliyet varsayımı gerçek emir defteri verisiyle
> ölçüldü (`TRIAL-LEDGER.md` → Ölçüm 1): havuzda medyan spread 3,05 bps, yarı
> spread 1,52 bps, komisyon 10 bps → gidiş-dönüş **23,05 bps**. Rapor
> başlangıçta 30 bps varsayıyordu. Aşağıdaki tablo her iki değeri de gösterir.

| ufuk | üst5 − alt5 | t | varsayılan maliyet (%0,30) | **ölçülen maliyet (%0,2305)** |
|---|---|---|---|---|
| 24 saat | +%0,2555 | 2,23 | −%0,04 | **+%0,025** |
| 72 saat | +%0,5991 | **3,31** | +%0,30 | **+%0,369** |

24 saatlik kenar, doğru maliyetle işaret değiştiriyor. **Ama bu kararı
değiştirmiyor:** portföy testi maliyetsiz koşuda da başarısızdı (top-5 0,709×
vs sepet 0,749×). Maliyet sıfır olsa bile sıralama portföy düzeyinde değer
katmıyor. Maliyeti düzeltmek, kenarın yanlış uçta olduğu gerçeğine dokunmuyor.

72 saatlik ufukta desiller neredeyse monoton ve kenar istatistiksel olarak
anlamlı. **Ama** 72 saatlik portföy testi de başarısız: top-5 0,186× ·
sepet 0,259× · rastgele medyan 0,221×.

### Bulgunun özü

Kenar, üst desilin iyi olmasından değil **alt desilin çok kötü olmasından**
geliyor. Desil 10 ile desil 8 arasında anlamlı fark yok. Puan **kazananı değil,
kaybedeni** ayırt ediyor.

Long-only spot bir sistem bunu paraya çeviremez: elemek için kullanılabilir,
seçmek için değil. Short kapsam dışı (bkz. `CHANGELOG`).

Ayrıca ölçüm dönemi (478 gün) boyunca **her desil negatif** — tek yönlü bir
ayı piyasası. Sıralamanın boğa piyasasındaki davranışı bu veriyle bilinemez.

### Aile bazında IC — dikkat çeken

Puanın ağırlığının %55'i (trend 30 + momentum 25) 24 saatlik ufukta **negatif**
IC üretiyor. Tek pozitif aile `vol` (+0,058) — spec'te en az güvenilen ve
`docs/OPEN-QUESTIONS.md #1`'de yönü zaten sorgulanan aile.

Bu bir "ağırlıkları düzelt" daveti **değildir**. Aynı veride ağırlık aramak
uydurma üretir. `research/TRIAL-LEDGER.md`'deki hipotez adayları taze veriyle
veya kilitli pencerede tek seferlik test edilmelidir.
