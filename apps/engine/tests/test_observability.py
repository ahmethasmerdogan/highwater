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
    LOG_ERRORS,
    error_metrics_processor,
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


def test_hata_sayaci_olay_adina_gore_artar():
    """Her ERROR log'u sayılır — elle sayaç konmuş olanlar değil, hepsi.

    Koddaki 19 ERROR seviyeli çağrının başlangıçta yalnızca birinin sayacı
    vardı; veritabanı yeniden başlatıldığında `manage_loop_error` ve
    `heartbeat_failed` oldu ve Prometheus hiçbir şey görmedi.
    """
    once = _sayac(LOG_ERRORS, event="manage_loop_error", level="error")
    error_metrics_processor(None, "error", {"event": "manage_loop_error", "level": "error"})
    assert _sayac(LOG_ERRORS, event="manage_loop_error", level="error") == once + 1


def test_hata_sayaci_seviyeyi_method_name_den_de_okur():
    """`level` alanı henüz eklenmemişse çağrı adına bakılır."""
    once = _sayac(LOG_ERRORS, event="worker_crashed", level="exception")
    error_metrics_processor(None, "exception", {"event": "worker_crashed"})
    assert _sayac(LOG_ERRORS, event="worker_crashed", level="exception") == once + 1


def test_bilgi_loglari_hata_sayilmaz():
    olay = {"event": "universe_refreshed", "level": "info"}
    assert error_metrics_processor(None, "info", olay) is olay
    # Sayaç hiç oluşmamalı: etiket yaratmak bile yanıltıcı bir seri üretirdi.
    assert "universe_refreshed" not in str(LOG_ERRORS.collect()[0].samples)


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
    from sarnic.core.logging import _observability_processor, configure_logging

    configure_logging()
    zincir = structlog.get_config()["processors"]
    assert _observability_processor in zincir
    assert zincir.index(_observability_processor) < zincir.index(
        structlog.processors.format_exc_info
    )
