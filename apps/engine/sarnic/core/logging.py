"""structlog yapılandırması. Tüm modüller `get_logger(__name__)` kullanır."""

from __future__ import annotations

import logging
import sys

import structlog

from sarnic.config import settings

_configured = False


def configure_logging(json_output: bool | None = None, level: str | None = None) -> None:
    global _configured
    if _configured:
        return

    use_json = settings.log_json if json_output is None else json_output
    lvl = getattr(logging, (level or settings.log_level).upper(), logging.INFO)

    logging.basicConfig(format="%(message)s", stream=sys.stdout, level=lvl)

    # HTTP istemcileri her isteği INFO'da loglar. Ölçüldü: marketdata
    # journalinin **%55'i** `HTTP Request: GET …` satırıydı — bizim kendi
    # olaylarımızı bastıran bir gürültü. Hata ve uyarılar geçmeye devam eder;
    # istek düzeyinde iz gerekiyorsa `LOG_LEVEL=DEBUG` ile açılır.
    if lvl > logging.DEBUG:
        for noisy in ("httpx", "httpcore", "websockets.client", "websockets.protocol"):
            logging.getLogger(noisy).setLevel(logging.WARNING)

    processors: list = [
        structlog.contextvars.merge_contextvars,
        structlog.stdlib.add_log_level,
        structlog.stdlib.add_logger_name,
        structlog.processors.TimeStamper(fmt="iso", utc=True),
        structlog.processors.StackInfoRenderer(),
        # Sentry, istisna metne çevrilmeden önce görmelidir; `format_exc_info`
        # `exc_info`'yu tüketir ve sonrasında yığın izi kalmaz. Geç içe aktarım
        # döngüsel bağımlılığı önler (observability -> logging -> observability).
        _sentry_processor,
        structlog.processors.format_exc_info,
    ]
    processors.append(
        structlog.processors.JSONRenderer()
        if use_json
        else structlog.dev.ConsoleRenderer(colors=sys.stdout.isatty())
    )

    structlog.configure(
        processors=processors,
        wrapper_class=structlog.make_filtering_bound_logger(lvl),
        logger_factory=structlog.stdlib.LoggerFactory(),
        cache_logger_on_first_use=True,
    )
    _configured = True


def _sentry_processor(logger, method_name, event_dict):
    from sarnic.core.observability import sentry_structlog_processor

    return sentry_structlog_processor(logger, method_name, event_dict)


def get_logger(name: str) -> structlog.stdlib.BoundLogger:
    configure_logging()
    return structlog.get_logger(name)
