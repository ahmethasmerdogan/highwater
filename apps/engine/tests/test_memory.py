from sarnic.core.memory import bellek_iade


def test_bellek_iade_sessiz_ve_tekrar_cagrilabilir():
    a = bellek_iade()
    b = bellek_iade()
    assert a in (0, 1) and b in (0, 1)
