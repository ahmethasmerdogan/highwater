# KISA YÖN (önce sat, sonra kapat) — Uygulama Planı

> 2026-09-04. Analiz kuyruğundaki L maddesi. Kaldıraçlı kârın diğer yarısı:
> düşüşten kazanç. Yeni, isteğe bağlı bir yetenek; uzun-only botlar (9 maraton
> kolu dâhil) davranış olarak **bayt bayt** aynı kalır.

## 0. Tasarım ilkesi: tek çarpan, dallanma yok

Her pozisyona `direction: int` (+1 uzun, −1 kısa) eklenir ve **her fiyat farkı bu
çarpanla çarpılır**. Uzun için `d=+1` olduğunda tüm formüller bugünkü hâliyle
sayısal olarak birebir aynıdır; kısa dalları `if` ile değil işaretle üretilir.

| Kavram | Genel formül | d=+1 (bugün) |
|---|---|---|
| fiyat-puanı | `d × (çıkış − giriş) × qty` | `(çıkış − giriş) × qty` |
| risk/birim | `d × (giriş − ilk_stop)` (> 0 zorunlu) | `giriş − ilk_stop` |
| stop tetiği (kapanış) | `d × (fiyat − stop) ≤ 0` | `fiyat ≤ stop` |
| stop tetiği (bar içi) | uç = `low` (d>0) / `high` (d<0); `d × (uç − stop) ≤ 0` | `low ≤ stop` |
| trailing adayı | `fiyat − d × trail_atr × ATR`; monotonluk `d × (aday − stop) > 0` | `fiyat − k·ATR`, yalnız yukarı |
| likidasyon | `giriş × (1 − d × mf / L)` | `giriş × (1 − mf/L)` |
| nakit akışı (açılış) | `nakit −= d × notional + komisyon` | `nakit −= notional + komisyon` |
| nakit akışı (kapanış) | `nakit += d × notional − komisyon − borç` | `nakit += notional − komisyon − borç` |
| özsermaye | `nakit + Σ d × qty × fiyat` | `nakit + Σ qty × fiyat` |
| brüt maruziyet (tavanlar) | `Σ qty × fiyat` (işaretsiz) | aynı |

**Değişmezlik garantisi:** uzun-only tanımlar için `direction` her yerde +1;
kod yolu aynı, aritmetik aynı. Ek koruma: uzun bir backtest'in `trades` listesi
değişiklikten ÖNCE altın fixture olarak kaydedilir; sonrasında birebir eşitlik
testi vardır. Tanım hash'i de altın değerle sabitlenir.

## 1. Veri modeli

- `positions.side` zaten var (`BUY` varsayılan). `SELL` = kısa. Migration yok.
- `trades.side` (`String(8) NOT NULL DEFAULT 'BUY'`) — migration 0011.
- `OrderSide.direction` (+1/−1), `from_direction(d)`, `opposite`.

## 2. Strateji opt-in

- `EntrySpec.direction: "LONG" | "SHORT" | "BOTH"`; `directions()` → `(+1,)`, `(−1,)`, `(+1, −1)`.
- `to_dict()` LONG ise anahtarı **çıkarır** → saklı tanım JSON'u ve `hash()` değişmez.

## 3. Puanlama: kısa puan eşlemesi

- `score_cross_section(features, direction=+1)`; normalize bir kez, compose yön başına.
- Yönlü aileler (`trend, momentum, flow, sr`): `pct' = 100 − pct`. **`vol` ailesi olduğu gibi** —
  squeeze yönsüz bir yapı sinyalidir.
- Düzelticiler işaret değiştirir (ayı formasyonu artı); kalabalık cezası `−ret_24h` ile.
- `sr` asimetrik: `rr_geometry` tersi; `support_strength` yerine `resistance_strength`
  (v1'de NEUTRAL 50 kabul edilebilir, gerekçeye yazılır).
- `config_hash` payload'ına `direction: -1` **yalnız** kısa için girer → uzun hash aynı.

**Dürüstlük notu:** Faz 0a IC'leri — vol +0,058, trend −0,028, momentum −0,031,
flow −0,017. Yönlü ailelerin negatif IC'si "ters sıralamanın kısa için pozitif IC'si"
demektir ama büyüklük ≈0,03 ve holdout'ta tutmadı. Kısa puanın öngörü gücü
**bilinmiyor**; eşleme bir hipotezdir, kabul ölçüsü kısa-only backtest + kalibrasyon.

## 4. Saf modüller

- `accounting`: `price_points`, `risk_per_unit`, `weighted_r(direction=)`.
- `exits`: `PositionView.direction`; `initial_risk = d×(entry−stop)`; `r_multiple = d×(price−entry)/risk`;
  stop tetiği `d×(price−stop) ≤ 0`; trailing adayı `price − d×trail×atr`, monotonluk işaretli.
- `gapfill`: `stop_fill_price(stop, open, d)`, `adverse_extreme(low, high, d)`, `stop_hit`.
- `sr`: `stop_from_sr(..., direction)` kısa → `nearest_resistance + k×ATR`; direnç yoksa `None`.
- `sizing`: `SizingInput.direction`; ön koşul `d×(entry−stop) > 0`; `qty = risk / (d×(entry−stop))`.
- `leverage`: `decide_leverage(direction=)` formasyon teyidi `d×pattern > 0`; `liquidation_price(direction=)`;
  `borrow_cost` kısa için tam notional (varlık ödünç).
- Hypothesis testleri "stop girişin koruyucu tarafında" olarak iki yön parametrik.

## 5. Paper adaptörü: ödünç-varlık modeli

`submit()` tek genel blok: `opening = (side == BUY) == (d > 0)`; açılışta marj kuralı,
`free −= d×notional + fee`, `positions += d×qty`; kapanışta `d×held ≥ qty` şartı,
`positions −= d×qty`, `free += d×notional − fee`. `restore_positions` işaretli qty.

## 6. Backtest / 7. Worker / 8. API–UI

Plan dosyasının tam sürümü ajan çıktısındadır; özet: `SimPosition.direction`, kısa puan/stop/oda
hesabı, `_check_intrabar_stops` uç/likidasyon işaretli, `_close`/`_partial` `price_points`;
worker `OpenPosition.direction`, `BarContext.score_for/stop_for`, `_open_position(direction=)`,
kapatma emri ters yön; API `PositionOut.side`, `TradeOut.side`, `BotOut.direction`;
panelde `KISA` rozeti, işaretli kâr/zarar.

## 9. Testler (~350 satır)

Altın regresyon (önce), exits/sizing/leverage/accounting/paper/backtest/scoring/api kısa varyantları.

## 10. Sıra

1. Altın fixture + hash testi → 2. saf modüller → 3. scoring yönü → 4. definition + migration +
portfolio + paper → 5. backtest → 6. worker → 7. API/web → 8. CHANGELOG, OPEN-QUESTIONS.

Üretim ≈ 400 satır, test ≈ 350, web ≈ 45. Bilinçli olarak yapılmayan: aynı sembolde hedge,
kısa için ayrı sizing/exit bloğu, strateji formu seçim bileşeni (JSON düzenleyici yeter).
