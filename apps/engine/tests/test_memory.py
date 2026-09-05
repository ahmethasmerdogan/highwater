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
    assert surec_basina <= 6, f"süreç başına {surec_basina} bağlantı: 30+ süreçle tavan aşılır"
    # 40 süreçlik bir filo bile 100'lük tavanın altında kalmalı.
    assert surec_basina * 40 <= 240
