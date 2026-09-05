from sarnic.core.memory import bellek_iade


def test_bellek_iade_sessiz_ve_tekrar_cagrilabilir():
    a = bellek_iade()
    b = bellek_iade()
    assert a in (0, 1) and b in (0, 1)


def test_havuz_boyutu_filo_olceginde_guvenli():
    """Havuz SÜREÇ BAŞINADIR. 30+ süreçlik filoda süreç başına 30 bağlantı,
    Postgres'in 100'lük tavanını aşıyordu: 5432'ye 300 açık TCP, sunucu
    'too many clients', 32 DB testi sessizce atlanıyor ve yeni worker
    bağlanamıyordu (2026-09-05)."""
    from sarnic.config import settings

    surec_basina = settings.db_pool_size + settings.db_max_overflow
    assert surec_basina <= 8, f"süreç başına {surec_basina} bağlantı fazla"
    # 40 süreçlik bir filo, compose'daki 300'lük tavanın altında kalmalı.
    # (Tavan 2026-09-05'te 100'den 300'e çıkarıldı: 100'de 72 oturum Client
    # beklemesine düşüyor ve bar kararı 272 sn'ye çıkıyordu.)
    assert surec_basina * 40 <= 300
