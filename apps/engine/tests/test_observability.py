"""Gözlemlenebilirlik testleri — Faz 11.

En önemli davranış: **Sentry'ye giden istisna yığın izini taşır.** structlog
`format_exc_info` ile `exc_info`'yu metne çevirdiği için, işlemci zincirdeki
yeri yanlış olursa olay gider ama `exception` alanı boş kalır — Sentry'nin var
olma sebebi de kaybolur. Bu sessiz bir bozulmadır, o yüzden testi vardır.
"""

from __future__ import annotations

import structlog

from sarnic.core.observability import (
    DECISION_ERRORS,
    EVENTS,
    sentry_structlog_processor,
)


def _sayac(metrik, **etiketler) -> float:
    return metrik.labels(**etiketler)._value.get()


# --------------------------------------------------------------------------- #
#  Ölçüler
# --------------------------------------------------------------------------- #
def test_olay_sayaci_etikete_gore_artar():
    once = _sayac(EVENTS, kind="position.opened", level="INFO")
    EVENTS.labels("position.opened", "INFO").inc()
    assert _sayac(EVENTS, kind="position.opened", level="INFO") == once + 1


def test_karar_dongusu_sayaci_bot_bazinda_ayrisir():
    DECISION_ERRORS.labels("7").inc()
    DECISION_ERRORS.labels("8").inc()
    DECISION_ERRORS.labels("8").inc()
    assert _sayac(DECISION_ERRORS, bot_id="7") == 1
    assert _sayac(DECISION_ERRORS, bot_id="8") == 2


# --------------------------------------------------------------------------- #
#  Sentry işlemcisi
# --------------------------------------------------------------------------- #
def test_sentry_kapaliyken_islemci_seffaftir():
    """DSN yoksa işlemci olayı olduğu gibi geçirir ve hiçbir şey göndermez."""
    olay = {"event": "bir_hata", "exc_info": True}
    assert sentry_structlog_processor(None, "error", olay) is olay


def test_sentry_istisnayi_yigin_iziyle_gonderir(monkeypatch):
    gonderilen: list = []

    class SahteScope:
        def __init__(self):
            self.tags, self.extras = {}, {}

        def set_tag(self, k, v):
            self.tags[k] = v

        def set_extra(self, k, v):
            self.extras[k] = v

        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

    kapsam = SahteScope()

    class SahteSentry:
        @staticmethod
        def get_client():
            return type("C", (), {"is_active": staticmethod(lambda: True)})()

        @staticmethod
        def new_scope():
            return kapsam

        @staticmethod
        def capture_exception(exc_info):
            gonderilen.append(exc_info)

    import sys

    monkeypatch.setitem(sys.modules, "sentry_sdk", SahteSentry)

    try:
        raise ValueError("kasıtlı")
    except ValueError:
        sentry_structlog_processor(
            None, "error", {"event": "decision_loop_error", "bot_id": 42, "exc_info": True}
        )

    assert len(gonderilen) == 1
    tur, deger, iz = gonderilen[0]
    # Asıl mesele: yığın izi **var**. `exc_info=True` çözülmemiş olsaydı burası boş kalırdı.
    assert tur is ValueError and iz is not None
    assert str(deger) == "kasıtlı"
    # Bağlam da gitmeli: hangi olay, hangi bot.
    assert kapsam.tags["log_event"] == "decision_loop_error"
    assert kapsam.extras["bot_id"] == 42


def test_istisnasiz_kayit_sentryye_gitmez(monkeypatch):
    """Sıradan INFO logları hata takibini doldurmamalı."""
    import sys

    class Patlayan:
        @staticmethod
        def get_client():
            raise AssertionError("istisnasız kayıt için Sentry'ye dokunulmamalı")

    monkeypatch.setitem(sys.modules, "sentry_sdk", Patlayan)
    olay = {"event": "universe_refreshed", "size": 96}
    assert sentry_structlog_processor(None, "info", olay) is olay


def test_islemci_zincirde_format_exc_info_oncesinde():
    """Sıra bozulursa Sentry yığın izi göremez; testi bu yüzden var."""
    from sarnic.core.logging import _sentry_processor, configure_logging

    configure_logging()
    zincir = structlog.get_config()["processors"]
    assert _sentry_processor in zincir
    assert zincir.index(_sentry_processor) < zincir.index(structlog.processors.format_exc_info)
