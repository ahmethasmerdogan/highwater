"""Ölçüm ve hata takibi — Prometheus + Sentry (Faz 11).

`SYSTEM-REVIEW.md`: *"Bu tur bulunan beş kusurun beşi de logları elle okuyarak
bulundu. Bir toplayıcı olsaydı `decision_loop_error` sayacı 22:05'te üç kez
artıp gözle görülür bir alarm üretirdi."* Bu modül o toplayıcıyı besler.

İki ilke:

1. **Tek hook, çok ölçü.** Alan olayları tek bir yerden (`EventBus.publish`)
   geçtiği için `sarnic_events_total` tek satırla pozisyonları, emirleri, devre
   kesicileri ve bot durum değişimlerini kapsar. Her olay tipi için ayrı sayaç
   serpiştirmek koda yayılır ve biri eklenmeyi unutur.
2. **Sorguda daima toplayın.** Buradaki her ölçü **her süreçte** tanımlıdır;
   modül içe aktarıldığı anda kayıt defterine girer. Yani `sarnic_bars_written_total`
   yalnızca marketdata tarafından artırılsa da on bir hedefin hepsi onu yayınlar,
   onu sıfır olarak. `increase(...) == 0` gibi bir kural toplamadan yazılırsa o
   sıfır serileri yüzünden sürekli alarm verir; `sarnic_universe_size` gibi bir
   gösterge toplamadan okunursa 0 görünür. Kural: sayaçlarda `sum(...)`,
   göstergelerde `max(...)`.
3. **Yoksa sessizce kapalı.** Sentry DSN verilmemişse `init_sentry` hiçbir şey
   yapmaz; ölçüm sunucusu portu meşgulse servis çökmez, uyarır. Gözlem katmanı
   işlem motorunu asla durdurmaz.
"""

from __future__ import annotations

import sys
from typing import Any

from prometheus_client import Counter, Gauge, start_http_server

from sarnic.config import settings
from sarnic.core.logging import get_logger

log = get_logger(__name__)

# --------------------------------------------------------------------------- #
#  Ölçüler
# --------------------------------------------------------------------------- #

#: Tüm alan olayları. `kind` EventKind değeridir (`position.opened`, `order.rejected`,
#: `risk.circuit_breaker`, `data.stale`, …), `level` olayın önem derecesi.
EVENTS = Counter("sarnic_events_total", "Yayınlanan alan olayları", ["kind", "level"])

#: ERROR ve üstü **her** log olayı, olay adına göre.
#:
#: Neden ayrı bir sayaç yerine tek hook: kodda 19 ERROR seviyeli log çağrısı
#: var (`worker_crashed`, `supervisor_reconcile_failed`, `manage_loop_error`,
#: `backtest_failed`, …) ve başlangıçta yalnızca birinin sayacı vardı. Ölçüldü:
#: veritabanı yeniden başlatıldığında süpervizör `manage_loop_error` ve
#: `heartbeat_failed` verdi, Prometheus hiçbir şey görmedi. Her hata yoluna elle
#: sayaç koymak, yeni bir hata yolu eklendiğinde unutulur; log zinciri ise
#: hepsinden geçer.
#:
#: Etiket kardinalitesi sınırlıdır: `event` adları koddaki sabit sözcüklerdir.
LOG_ERRORS = Counter("sarnic_log_errors_total", "ERROR ve üstü log olayları", ["event", "level"])

#: Karar döngüsü istisnaları. Bir bot bunu artırıyorsa o bot bar atlıyor demektir —
#: en yüksek öncelikli alarm adayı. `LOG_ERRORS` ile örtüşür ama bot etiketi
#: taşır: hangi botun sustuğunu ancak bu söyler.
DECISION_ERRORS = Counter(
    "sarnic_decision_loop_errors_total", "Karar döngüsü istisnaları", ["bot_id"]
)

#: DB'ye yazılan kapanmış bar sayısı. Sıfıra düşmesi, veri akışının durduğunu
#: `data.stale` olayından **önce** gösterir.
BARS_WRITTEN = Counter("sarnic_bars_written_total", "DB'ye yazılan kapanmış bar")

#: WebSocket yeniden bağlanmaları. Binance tarafında bir sorun varsa buradan görünür.
WS_RECONNECTS = Counter("sarnic_ws_reconnects_total", "WebSocket yeniden bağlanmaları")

#: Havuzdaki sembol sayısı. Hedefin (100) altına düşmesi likidite filtresinin
#: sıkılaştığını veya veri olgunlaşmadığını gösterir.
UNIVERSE_SIZE = Gauge("sarnic_universe_size", "Havuzdaki sembol sayısı")

#: Olay veriyoluna yayın başarısız oldu — Redis erişilemiyor demektir. Yayın
#: sessizce düşer (motor durmaz), ama sessizlik ölçülebilir olmalıdır.
EVENT_PUBLISH_FAILURES = Counter(
    "sarnic_event_publish_failures_total", "Olay yayınlanamadı (Redis)"
)


# --------------------------------------------------------------------------- #
#  Ölçüm sunucusu
# --------------------------------------------------------------------------- #


def start_metrics_server(port: int, component: str) -> None:
    """Arka plan servisleri için `/metrics` sunucusu.

    API'nin kendi `/metrics` ucu vardır; bu fonksiyon HTTP sunucusu olmayan
    servisler (marketdata, supervisor, notifier) içindir. `port` 0 ise kapalıdır.
    """
    if port <= 0:
        return
    try:
        start_http_server(port)
    except OSError as exc:
        # Port meşgulse servis çalışmaya devam eder; ölçüm kaybı, işlem kaybından
        # yeğdir. Aynı servisin iki kopyasının çalıştığının da işaretidir.
        log.warning("metrics_server_failed", component=component, port=port, error=str(exc))
        return
    log.info("metrics_server_started", component=component, port=port)


# --------------------------------------------------------------------------- #
#  Sentry
# --------------------------------------------------------------------------- #


def error_metrics_processor(logger: Any, method_name: str, event_dict: dict) -> dict:
    """ERROR ve üstü her log olayını sayar. structlog zincirine takılır."""
    seviye = str(event_dict.get("level") or method_name).lower()
    if seviye in ("error", "critical", "exception"):
        LOG_ERRORS.labels(str(event_dict.get("event", "?")), seviye).inc()
    return event_dict


def sentry_structlog_processor(logger: Any, method_name: str, event_dict: dict) -> dict:
    """structlog zincirinde istisnayı Sentry'ye **yığın iziyle** iletir.

    Neden gerekli: `structlog.processors.format_exc_info` `exc_info`'yu tüketip
    metne çevirir. Kayıt stdlib `logging`'e ulaştığında `record.exc_info`
    boştur, dolayısıyla Sentry'nin logging entegrasyonu olayı yakalar ama yığın
    izi olmadan — yani Sentry'nin var olma sebebi kaybolur. Ölçüldü: olay
    gidiyordu, `exception` alanı `None`'dı.

    Bu yüzden istisna, metne çevrilmeden **önce** buradan gönderilir.
    """
    exc_info = event_dict.get("exc_info")
    if not exc_info:
        return event_dict
    try:
        import sentry_sdk
    except ImportError:
        return event_dict
    if not sentry_sdk.get_client().is_active():
        return event_dict

    # `log.exception()` `exc_info=True` yazar; o hâlde güncel istisna kastedilir.
    if exc_info is True:
        exc_info = sys.exc_info()
    if not (isinstance(exc_info, tuple) and exc_info[0] is not None):
        return event_dict

    with sentry_sdk.new_scope() as scope:
        scope.set_tag("log_event", str(event_dict.get("event", "")))
        for anahtar, deger in event_dict.items():
            if anahtar not in ("exc_info", "event"):
                scope.set_extra(anahtar, deger)
        sentry_sdk.capture_exception(exc_info)
    return event_dict


def init_sentry(component: str) -> None:
    """DSN verilmişse Sentry'yi başlatır; verilmemişse hiçbir şey yapmaz.

    Yığın izli istisnalar `sentry_structlog_processor` üzerinden gider (bkz.
    oradaki not). Sentry'nin kendi logging entegrasyonu olay üretmeyecek
    biçimde ayarlanır — aksi hâlde her istisna iki kez raporlanırdı; bir kez
    yığın iziyle, bir kez izsiz.
    """
    dsn = settings.sentry_dsn.strip()
    if not dsn:
        return
    try:
        import sentry_sdk
    except ImportError:  # bağımlılık kurulmamışsa servis yine de kalkmalı
        log.warning("sentry_sdk_missing", component=component)
        return

    from sentry_sdk.integrations.logging import LoggingIntegration

    sentry_sdk.init(
        dsn=dsn,
        environment=settings.env,
        release=settings.sentry_release or None,
        traces_sample_rate=settings.sentry_traces_sample_rate,
        # Kişisel veri gönderme: kullanıcı e-postaları ve IP'ler Sentry'ye gitmez.
        send_default_pii=False,
        # `event_level=None`: stdlib logging olay üretmez, yalnızca iz bırakır
        # (breadcrumb). Olayları structlog işlemcisi gönderir.
        integrations=[LoggingIntegration(level=None, event_level=None)],
    )
    sentry_sdk.set_tag("component", component)
    log.info("sentry_initialized", component=component, environment=settings.env)
