# Faz 0a — Deneme defteri

> Her parametre değişikliği bir **denemedir**. Deneme sayısı arttıkça tesadüfen
> "anlamlı" sonuç bulma olasılığı artar; rapor bunu dikkate almak zorundadır.
>
> Kural: sonuç olumsuz çıktığında **ağırlıkları değiştirip tekrar denemeyin**.
> Bu, aynı veri üzerinde arama yapmaktır ve sonucu kaçınılmaz olarak uydurma yapar.
> Bunun yerine **hipotezi** değiştirin ve kilitli out-of-sample penceresine
> dokunmadan yeniden test edin.

**Kullanılan veri:** 228 sembol × 2 yıl 1h kline (`data.binance.vision` arşivi),
point-in-time evren 684 gün. In-sample: 191.584 puanlama · 1.916 bar · 157 sembol
· 478 gün. **Son %30 kilitli, hiç dokunulmadı.**

---

### Deneme 1 — 2026-08-15

**Hipotez:** `MASTER-SPEC` §5.2'deki başlangıç ağırlıkları (trend 30 · momentum 25 ·
akış 20 · volatilite 15 · S/R 10) ile hesaplanan kesitsel puan, **24 saatlik**
ileri getiriyi öngörür.

**Değişiklik:** — (taban koşu, spec'teki hâliyle)

**Sonuç:** ❌ dört testin dördü de başarısız

| # | Test | Sonuç |
|---|---|---|
| 1 | Desil monotonluğu | ❌ monoton değil |
| 2 | Spearman | ❌ ρ = −0,0058 · pencerelerin yalnızca %30'u pozitif |
| 3 | Top-5 vs eşit ağırlıklı | ❌ 0,168× vs 0,178× |
| 4 | Top-5 vs rastgele | ❌ dağılımın %56. yüzdeliği (ayırt edilemez) |

**Aile bazında IC:** vol **+0,0581** · flow −0,0165 · trend −0,0278 ·
momentum −0,0309 · sr — (bu fazda S/R hesaplanmıyor)

**Not:** Puanın ağırlığının %55'i (trend + momentum) 24 saatlik ufukta **negatif**
IC üretiyor. Tek pozitif aile, spec'te en az güvenilen ve `OPEN-QUESTIONS #1`'de
yönü sorgulanan `vol`.

**Karar:** Ağırlık araması YAPILMADI. Hipotez değiştirildi → Deneme 2.

---

### Deneme 2 — 2026-08-15

**Hipotez:** Sinyal var ama işlem maliyetinin altında kalıyor. **Elde tutma
süresini 24s → 72s'ye çıkarmak** devir hızını düşürür ve kenarı maliyetin
üstüne taşır.

**Değişiklik:** Yalnızca zaman ufku. Ağırlıklara, özelliklere, eşiklere,
evrene **dokunulmadı**.

**Sonuç:** ❌ hipotez kısmen doğrulandı ama strateji yine kazanmıyor

| ufuk | üst5 − alt5 | t | gidiş-dönüş maliyet | net kenar |
|---|---|---|---|---|
| 24s | +%0,2555 | 2,23 | %0,30 | −%0,04 |
| 72s | +%0,5991 | **3,31** | %0,30 | **+%0,30** |

72 saatte desiller neredeyse monoton: −0,65 → −0,41 → −0,33 → −0,34 → −0,25 →
−0,22 → −0,15 → −0,12 → −0,13 → −0,15.

**Ama:** her desil negatif ve portföy testi yine başarısız —
top-5 **0,186×**, eşit ağırlıklı sepet **0,259×**, rastgele medyan **0,221×**
(top-5 rastgelenin %32. yüzdeliğinde).

**Neden:** Kenar, üst desilin iyi olmasından değil **alt desilin çok kötü
olmasından** geliyor. Desil 10 ile desil 8 arasında fark yok. Puan, kazananı
değil **kaybedeni** ayırt ediyor. Long-only spot bir sistem bunu paraya
çeviremez.

**Karar:** Arama burada **durduruldu**. İki deneme aynı in-sample veride
yapıldı; üçüncüsü yanlış keşif riskini kabul edilemez seviyeye çıkarır.

---

## Sıradaki hipotez adayları (henüz test EDİLMEDİ)

Bunlar Deneme 3+ olarak, tercihen **taze veriyle** veya kilitli pencerede
tek seferlik test edilmeli. Buraya yazılmaları test edildikleri anlamına gelmez.

1. **Seçici değil, eleyici kullanım.** Puan alt desili elemekte iyi. Havuzu
   "en yüksek 5"le değil, "alt %20 hariç eşit ağırlıklı" kurmak. Bu, ölçülen
   bulguyla doğrudan uyumlu tek long-only kullanım.
2. **`vol` ailesinin yönü.** Tek pozitif IC üreten aile. `OPEN-QUESTIONS #1`
   zaten yönünü sorguluyordu; ağırlığını artırmak yerine **önce yönünü**
   doğrulamak gerekir.
3. **Farklı evren.** 478 gün boyunca her desil negatif — dönem tek yönlü bir
   ayı piyasası. Boğa dönemi içeren bir pencere ayrı test edilmeli.
4. ~~**Maliyet gerçekliği.**~~ **ÖLÇÜLDÜ — 2026-08-16.** Aşağıya bakınız.

---

### Ölçüm 1 — 2026-08-16 · maliyet varsayımı doğrulandı (deneme değil)

**Bu bir hipotez denemesi değildir**; doğrulanmamış bir **girdinin** ölçülmesidir.
Kilitli pencereye dokunulmadı, hiçbir parametre değiştirilmedi.

Sistem 5 dakikada bir gerçek `bookTicker` örneği topluyor. Havuzdaki 44 sembolün
son 24 saatteki **10.868** örneği:

| ölçü | değer |
|---|---|
| ortalama spread | 3,64 bps |
| medyan spread | 3,05 bps |
| p90 spread | 7,94 bps |
| yarı spread (mid'den geçiş) | 1,52 bps |

Gerçekçi tek yön maliyet = komisyon (10 bps, Binance taker) + yarı spread
(1,52 bps) = **11,52 bps**. Gidiş-dönüş **23,05 bps**.

Faz 0a **30 bps** gidiş-dönüş varsayıyordu. Varsayım gerçekten yaklaşık
**%23 fazla kötümserdi.**

**Aritmetiğe etkisi:**

| ufuk | üst5 − alt5 | eski net (30 bps) | yeni net (23,05 bps) |
|---|---|---|---|
| 24s | +%0,2555 | −%0,04 | **+%0,025** |
| 72s | +%0,5991 | +%0,30 | **+%0,369** |

24 saatlik kenar işaret değiştiriyor: negatiften hafif pozitife.

**Ama bu bulguyu kurtarmıyor ve öyle sunulmamalı.** Faz 0a'nın portföy testi
**maliyetsiz** koşuda da başarısızdı: top-5 0,709×, eşit ağırlıklı sepet
0,749×. Maliyet sıfır olsa bile sıralama portföy düzeyinde değer katmıyordu.
Maliyeti düzeltmek, kenarın **yanlış uçta** olduğu gerçeğini değiştirmez
(desil 10 ≈ desil 8; kenar alt desilin kötülüğünden geliyor).

**Uyarı — kayma ile spread'i karıştırmayın.** Kağıt motorun raporladığı
"ortalama kayma 12,46 bps" bağımsız bir ölçüm **değildir**: kendi
`paper_extra_slippage_bps = 5` varsayımını içerir. Yukarıdaki spread ise
doğrudan Binance emir defterinden gelir ve varsayım içermez.

**Karar:** `research/PHASE-0A-REPORT.md` maliyet tablosu güncellendi. Yeniden
koşu yapılmadı — girdi düzeltmesi sonucu değiştirmiyor.

---

## Kilitli pencere kaydı

| Tarih | Kim | Neden kilitli pencereye bakıldı |
|---|---|---|
| — | — | **Henüz bakılmadı.** Verinin son %30'u temiz. |
