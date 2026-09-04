"""Boşluk dolumu — stopun ALTINDA açılan barın dürüst dolum fiyatı.

Tek kaynak (bozulmaz kural 1): backtest motoru bu fonksiyonu baştan beri
fiilen uyguluyordu (`min(stop, open)`); canlı paper yolu ise stop tetiğini
o anki fiyattan dolduruyordu. Kripto 7/24 aktığı için fark görünmüyordu;
seanslı pazarda (BIST/ABD) gece ya da hafta sonu boşluğu bunu gerçek bir
ayrışmaya çevirir: aynı işlem iki motorda iki farklı fiyattan kapanırdı.

Kural: stop emri boşlukta "stop fiyatından" dolmaz — piyasa oraya hiç
uğramadı. Dolum, barın açılışı ile stopun kötü olanıdır:

* Bar stopun ALTINDA açıldıysa → açılış fiyatı (stoptan kötü; gerçek bu).
* Bar stopun üstünde açılıp gün içinde deldiyse → stop fiyatı.
"""

from __future__ import annotations


def stop_fill_price(stop: float, bar_open: float, direction: int = 1) -> float:
    """Stop tetiklenen barda dürüst dolum: uzun ``min(stop, open)``, kısa ``max``."""
    return min(stop, bar_open) if direction > 0 else max(stop, bar_open)


def adverse_extreme(low: float, high: float, direction: int = 1) -> float:
    """Barın pozisyon aleyhine ucu: uzun için `low`, kısa için `high`."""
    return low if direction > 0 else high


def stop_hit(stop: float, extreme: float, direction: int = 1) -> bool:
    """Uç stopun kötü tarafına geçti mi? Uzun `low ≤ stop`, kısa `high ≥ stop`."""
    return direction * (extreme - stop) <= 0
