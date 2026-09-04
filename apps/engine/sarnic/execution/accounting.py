"""İşlem muhasebesi — kâr ve komisyonun tek tanımı.

Bu iki satırlık hesap iki yerde ayrı ayrı yazılıydı: `bots/worker.py` (paper ve
canlı) ve `backtest/engine.py`. Ayrı yazıldıkları için ayrıştılar — worker
giriş komisyonunu düşmeyi atladı, backtest düştü. Sonuç, aynı işlemin iki
motorda iki farklı kâr raporlaması oldu ve bu "backtest, paper ve canlı aynı
sonucu üretir" kuralının fiilî ihlaliydi.

Hata sessizdi: nakit ve özsermaye doğru kalıyor, çünkü giriş komisyonu zaten
giriş anında nakitten düşülmüş. Yalnızca `trades` tablosu şişiyordu — yani
panelin "net kâr/zarar" diye gösterdiği sayı.

Kuralı sözleşmeye bırakmak yerine tek bir çağrı noktasına indirgemek, aynı
ayrışmanın tekrar olmasını yapısal olarak engeller.
"""

from __future__ import annotations


def net_pnl(
    *,
    gross: float,
    entry_fees: float,
    exit_fees: float,
    realized_pnl: float = 0.0,
) -> float:
    """İşlemin net kârı: fiyat farkı eksi komisyonun **tamamı**.

    `gross` fiyat hareketinden gelen ham sonuçtur `(çıkış − giriş) × miktar`.
    `realized_pnl` daha önceki kısmi çıkışlarda birikmiş net sonuçtur; kısmi
    çıkış yaşanmadıysa sıfırdır.

    Giriş komisyonu burada düşülür. Düşülmediğinde `net_pnl` ile
    `total_fees` birbiriyle çelişir — biri komisyonun tamamını sayar, diğeri
    yarısını — ve `brüt = net + komisyon` yapan her tüketici yanlış sonuç alır.
    """
    return realized_pnl + gross - exit_fees - entry_fees


def total_fees(*, entry_fees: float, exit_fees: float, realized_fees: float = 0.0) -> float:
    """İşlemin ömrü boyunca ödenen komisyonun tamamı.

    `realized_fees` kısmi çıkışlarda ödenmiş komisyondur. `net_pnl` ile aynı
    komisyon kümesini saymak zorundadır; ikisi ayrışırsa maliyet payı
    (`komisyon / brüt`) yanlış çıkar ve "strateji fazla mı işlem yapıyor"
    sorusu yanlış cevaplanır.
    """
    return entry_fees + realized_fees + exit_fees


def weighted_r(
    entry: float,
    exit_price: float,
    qty: float,
    risk_per_unit: float,
    realized_points: float = 0.0,
    entry_qty: float = 0.0,
) -> float:
    """R çarpanı, giriş miktarına göre ağırlıklı fiyat-puanı.

    Kısmi kâr alma yoksa (realized_points=0, entry_qty=qty) eski formülle
    birebir: (exit − entry)/risk. Worker ve backtest aynı fonksiyonu çağırır.
    """
    toplam = entry_qty if entry_qty > 0 else qty
    if toplam <= 0 or risk_per_unit <= 0:
        return 0.0
    return (realized_points + (exit_price - entry) * qty) / (risk_per_unit * toplam)
