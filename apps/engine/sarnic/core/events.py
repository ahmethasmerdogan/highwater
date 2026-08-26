"""Olay veriyolu — Redis Streams (MASTER-SPEC §14).

Tek yazma noktası: `EventBus.publish`. Tüketiciler: WebSocket köprüsü, Discord
bildirimcisi, bildirim yazıcısı. Redis erişilemezse yayın **sessizce düşer** —
olay veriyolunun çökmesi işlem motorunu durdurmamalıdır (loglanır).
"""

from __future__ import annotations

import asyncio
import json
from collections.abc import AsyncIterator
from dataclasses import asdict, dataclass, field
from datetime import datetime
from typing import Any

import redis.asyncio as aioredis

from sarnic.config import settings
from sarnic.core.clock import utcnow
from sarnic.core.enums import EventKind
from sarnic.core.logging import get_logger
from sarnic.core.observability import EVENT_PUBLISH_FAILURES, EVENTS

log = get_logger(__name__)

STREAM_KEY = "sarnic:events"
MAX_STREAM_LEN = 50_000

# Dinleme bağlantısının soket zaman aşımı, blok süresinin bu kadar üstünde olur.
LISTEN_TIMEOUT_MARGIN = 10.0
# Gerçek okuma hatasından sonra yeniden denemeden önce beklenen süre (saniye).
RETRY_DELAY = 1.0


def _json_default(o: Any) -> Any:
    if isinstance(o, datetime):
        return o.isoformat()
    if hasattr(o, "__float__"):
        return float(o)
    return str(o)


@dataclass(slots=True)
class Event:
    kind: EventKind | str
    payload: dict[str, Any] = field(default_factory=dict)
    level: str = "INFO"
    bot_id: int | None = None
    symbol: str | None = None
    at: datetime = field(default_factory=utcnow)

    def to_dict(self) -> dict[str, Any]:
        d = asdict(self)
        d["kind"] = str(self.kind)
        d["at"] = self.at.isoformat()
        return d

    def to_json(self) -> str:
        return json.dumps(self.to_dict(), default=_json_default, ensure_ascii=False)

    @classmethod
    def from_fields(cls, fields: dict[str, Any]) -> Event:
        raw = fields.get("data") or fields.get(b"data")
        if isinstance(raw, bytes):
            raw = raw.decode()
        d = json.loads(raw)
        return cls(
            kind=d["kind"],
            payload=d.get("payload", {}),
            level=d.get("level", "INFO"),
            bot_id=d.get("bot_id"),
            symbol=d.get("symbol"),
            at=datetime.fromisoformat(d["at"]),
        )


class EventBus:
    """Redis Streams sarmalayıcısı. Süreçler arası tek olay yolu."""

    def __init__(self, url: str | None = None) -> None:
        self._url = url or settings.redis_url
        self._redis: aioredis.Redis | None = None

    async def connect(self) -> aioredis.Redis:
        if self._redis is None:
            self._redis = aioredis.from_url(self._url, decode_responses=True)
        return self._redis

    async def close(self) -> None:
        if self._redis is not None:
            await self._redis.aclose()
            self._redis = None

    async def publish(self, event: Event) -> None:
        # Alan olaylarının tek yazma noktası, dolayısıyla ölçümün de tek hook'u:
        # pozisyonlar, emirler, devre kesiciler, bot durumları buradan geçer.
        EVENTS.labels(str(event.kind), event.level).inc()
        try:
            await self._xadd(event)
        except Exception:
            # Redis yeniden başladığında önbelleğe alınmış istemci kalıcı olarak
            # ölür: her yayın aynı bozuk bağlantıyı dener, hata yutulur ve
            # süreç bir daha hiç olay yayınlamaz. Bir kez bu yaşandı — puanlar
            # veritabanına yazılmaya devam etti ama hiçbir bildirim üretilmedi,
            # yani sistem dışarıdan sağlıklı görünürken sessizdi.
            #
            # İstemciyi atıp bir kez daha denemek bunu çözer; bağlantı havuzu
            # yeni bir soket kurar.
            await self.close()
            try:
                await self._xadd(event)
            except Exception as exc:
                EVENT_PUBLISH_FAILURES.inc()
                log.warning("event_publish_failed", kind=str(event.kind), error=str(exc))

    async def _xadd(self, event: Event) -> None:
        r = await self.connect()
        await r.xadd(
            STREAM_KEY,
            {"data": event.to_json()},
            maxlen=MAX_STREAM_LEN,
            approximate=True,
        )

    async def emit(self, kind: EventKind | str, **payload: Any) -> None:
        level = payload.pop("level", "INFO")
        bot_id = payload.pop("bot_id", None)
        symbol = payload.pop("symbol", None)
        await self.publish(
            Event(kind=kind, payload=payload, level=level, bot_id=bot_id, symbol=symbol)
        )

    @staticmethod
    async def _resolve_cursor(r: aioredis.Redis, last_id: str) -> str:
        """`$`'ı somut bir kimliğe çevirir.

        `$` "bu okumanın başladığı an" demektir. Bağlantı koptuğunda yeniden
        `$` ile okursak imleç ileri kayar ve kopukluk süresinde yayınlanan
        olaylar sessizce kaybolur. Somut kimlikle devam etmek bunu engeller.
        """
        if last_id != "$":
            return last_id
        try:
            entries = await r.xrevrange(STREAM_KEY, count=1)
        except Exception:
            return "$"
        return entries[0][0] if entries else "0-0"

    async def listen(
        self, last_id: str = "$", block_ms: int = 5000
    ) -> AsyncIterator[tuple[str, Event]]:
        """Akışı sonsuza kadar dinler. `last_id='$'` = yalnızca yeni olaylar.

        Dinleme **kendi** bağlantısını açar: `redis-py` 8'den itibaren
        `socket_timeout` varsayılanı 5 saniyedir ve `xread(block=5000)` bununla
        birebir yarışır — okuma her turda zaman aşımına düşer, bağlantı kopar,
        log saniyede bir `event_read_failed` ile dolar. Blok süresi soket zaman
        aşımının belirgin biçimde altında kalmalıdır.
        """
        r = aioredis.from_url(
            self._url,
            decode_responses=True,
            socket_timeout=block_ms / 1000 + LISTEN_TIMEOUT_MARGIN,
        )
        try:
            cursor = await self._resolve_cursor(r, last_id)
            while True:
                try:
                    resp = await r.xread({STREAM_KEY: cursor}, count=200, block=block_ms)
                except Exception as exc:
                    # Gerçek bir arıza: artık zaman aşımı beklenmiyor. Sıkı
                    # döngüyle Redis'i dövmemek için soluklan.
                    log.warning("event_read_failed", error=str(exc))
                    await asyncio.sleep(RETRY_DELAY)
                    continue
                if not resp:
                    continue
                for _stream, entries in resp:
                    for entry_id, fields in entries:
                        cursor = entry_id
                        try:
                            yield entry_id, Event.from_fields(fields)
                        except Exception as exc:
                            log.warning("event_decode_failed", error=str(exc))
        finally:
            await r.aclose()

    async def history(self, count: int = 200) -> list[Event]:
        """Yeni bağlanan istemciye geçmişi verir (TUI/panel açılışı)."""
        try:
            r = await self.connect()
            entries = await r.xrevrange(STREAM_KEY, count=count)
        except Exception as exc:
            log.warning("event_history_failed", error=str(exc))
            return []
        out: list[Event] = []
        for _id, fields in reversed(entries):
            try:
                out.append(Event.from_fields(fields))
            except Exception:
                continue
        return out


_bus: EventBus | None = None


def get_event_bus() -> EventBus:
    global _bus
    if _bus is None:
        _bus = EventBus()
    return _bus
