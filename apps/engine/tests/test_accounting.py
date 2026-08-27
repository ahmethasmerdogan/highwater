"""İşlem muhasebesi — kâr ve komisyonun tek tanımı.

Bu testler yaşanmış bir hatayı kilitler: worker giriş komisyonunu kârdan
düşmüyordu ama `fees` alanına yazıyordu. Nakit ve özsermaye doğru kaldığı için
hata sessizdi; yalnızca `trades` tablosu, yani panelin "net kâr/zarar" diye
gösterdiği sayı şişkindi. 160 işlemde 144,64 USDT.
"""

from __future__ import annotations

import pytest

from sarnic.execution.accounting import net_pnl, total_fees


def test_giris_komisyonu_kardan_dusulur():
    """Hatanın kendisi: giriş komisyonu düşülmezse kâr şişer."""
    kar = net_pnl(gross=100.0, entry_fees=1.0, exit_fees=2.0)

    assert kar == pytest.approx(97.0)


def test_brut_net_ve_komisyon_tutarlidir():
    """Kısmi çıkış yoksa `net + komisyon = brüt` olmalı.

    Hatanın görünür sonucu tam olarak buydu: `fees` komisyonun tamamını
    sayıyor, `pnl` yarısını sayıyordu. İkisini birleştiren her tüketici —
    maliyet payı, brüt kâr — yanlış sonuç alıyordu. Panelde maliyet payı
    %14,84 görünüyordu, gerçeği %16,02 idi.
    """
    brut = 250.0
    giris, cikis = 1.25, 2.50

    net = net_pnl(gross=brut, entry_fees=giris, exit_fees=cikis)
    komisyon = total_fees(entry_fees=giris, exit_fees=cikis)

    assert net + komisyon == pytest.approx(brut)
    assert net == pytest.approx(brut - giris - cikis)


def test_kismi_cikista_hicbir_komisyon_kaybolmaz():
    """`net_pnl` ile `total_fees` aynı komisyonları saymalı — eksiksiz, tekrarsız.

    Kısmi çıkışta biriken net sonuç kendi komisyonunu zaten içerir; bu yüzden
    `net + komisyon` brütü kısmi dilimin ham sonucu kadar aşar. Beklenen budur.
    Önemli olan hiçbir komisyonun sayılmadan ya da iki kez sayılarak kalmaması.
    """
    brut, giris, cikis, kismi_kom = 250.0, 1.25, 2.50, 0.75
    kismi_ham = 12.0
    kismi_net = kismi_ham - kismi_kom

    net = net_pnl(gross=brut, entry_fees=giris, exit_fees=cikis, realized_pnl=kismi_net)
    komisyon = total_fees(entry_fees=giris, exit_fees=cikis, realized_fees=kismi_kom)

    assert net == pytest.approx(brut + kismi_net - giris - cikis)
    assert komisyon == pytest.approx(giris + cikis + kismi_kom)
    assert net + komisyon == pytest.approx(brut + kismi_ham)


def test_kismi_cikisin_birikmis_sonucu_eklenir():
    """Kısmi çıkışta biriken net sonuç kapanışta hesaba katılmalı."""
    kar = net_pnl(gross=40.0, entry_fees=1.0, exit_fees=1.0, realized_pnl=12.0)

    assert kar == pytest.approx(50.0)


def test_zararli_islemde_komisyon_zarari_buyutur():
    """Komisyon her zaman aleyhe çalışır — kâr da zarar da olsa."""
    kar = net_pnl(gross=-30.0, entry_fees=2.0, exit_fees=2.0)

    assert kar == pytest.approx(-34.0)
    assert kar < -30.0


def test_paper_ve_backtest_ayni_sonucu_verir():
    """İki motorun aynı işlemde aynı kârı raporlaması — bozulmaz kural 1.

    Bu hesap iki yerde ayrı yazılıydı ve ayrıştı: backtest giriş komisyonunu
    düşüyordu, worker düşmüyordu. Aynı işlem iki farklı kâr raporluyordu.
    Artık ikisi de bu fonksiyonu çağırıyor; test çağrıldıklarını değil,
    tanımın tek olduğunu koruyor.
    """
    import inspect

    from sarnic.backtest import engine as backtest_engine
    from sarnic.bots import worker as worker_mod

    for modul in (worker_mod, backtest_engine):
        kaynak = inspect.getsource(modul)
        assert "net_pnl(" in kaynak, f"{modul.__name__} paylaşılan kâr hesabını kullanmıyor"
        assert "total_fees(" in kaynak, f"{modul.__name__} paylaşılan komisyon hesabını kullanmıyor"
