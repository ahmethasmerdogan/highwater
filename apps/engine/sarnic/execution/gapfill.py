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


def stop_fill_price(stop: float, bar_open: float) -> float:
    """Stop tetiklenen barda dürüst dolum: ``min(stop, open)``."""
    return min(stop, bar_open)
