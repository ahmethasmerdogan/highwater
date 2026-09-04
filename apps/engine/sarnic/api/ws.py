"""WebSocket köprüsü — §15 `/ws`.

Kanallar: `scores`, `positions`, `logs`, `notifications`, `chat`, `bot_events`.

Redis Streams'ten okuyan **tek** bir görev vardır; bağlı istemcilere o dağıtır.
İstemci başına Redis bağlantısı açmak 20 sekmede Redis'i tüketirdi.

Bağlantı koparsa istemci yeniden bağlanır ve `history` ile son 200 olayı alır —
sessizce eski veri göstermek yasaktır (DESIGN §3).
"""

from __future__ import annotations

import asyncio
import contextlib
import json
from dataclasses import dataclass, field

import jwt
from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect
from starlette.websockets import WebSocketState

from sarnic.api.deps import get_redis
from sarnic.core.enums import EventKind
from sarnic.core.events import Event, EventBus, get_event_bus
from sarnic.core.logging import get_logger
from sarnic.core.security import WS_TICKET_SECONDS, decode_token

log = get_logger(__name__)
router = APIRouter()

# Olay → kanal eşlemesi.
CHANNELS: dict[str, str] = {
    str(EventKind.SCORES_UPDATED): "scores",
    str(EventKind.SCORE_THRESHOLD_CROSSED): "scores",
    str(EventKind.POOL_UPDATED): "scores",
    str(EventKind.POSITION_OPENED): "positions",
    str(EventKind.POSITION_CLOSED): "positions",
    str(EventKind.ORDER_SUBMITTED): "positions",
    str(EventKind.ORDER_REJECTED): "positions",
    str(EventKind.LOG): "logs",
    str(EventKind.RISK_CIRCUIT_BREAKER): "notifications",
    str(EventKind.DATA_STALE): "notifications",
    str(EventKind.API_BANNED): "notifications",
    str(EventKind.BACKTEST_FINISHED): "notifications",
    str(EventKind.CHAT_MESSAGE): "chat",
    str(EventKind.BOT_STATE_CHANGED): "bot_events",
    str(EventKind.BOT_HEARTBEAT): "bot_events",
}

ALL_CHANNELS = sorted(set(CHANNELS.values()))


def channel_of(event: Event) -> str:
    return CHANNELS.get(str(event.kind), "logs")


# `eq=False` **zorunlu**: varsayılan dataclass `__eq__` üretir ve bu da
# `__hash__`'i `None` yapar. Hub istemcileri bir `set` içinde tuttuğu için
# `clients.add(client)` her bağlantıda `TypeError: unhashable type` fırlatıyor,
# WebSocket açılır açılmaz kapanıyordu — canlı akış hiç çalışmadı, panel
# sürekli "yeniden bağlanılıyor" gösterdi. Her bağlantı zaten ayrı bir
# nesnedir; kimlik temelli hash doğru davranıştır.
@dataclass(eq=False)
class Client:
    websocket: WebSocket
    user_id: int
    channels: set[str] = field(default_factory=lambda: set(ALL_CHANNELS))
    queue: asyncio.Queue = field(default_factory=lambda: asyncio.Queue(maxsize=500))


class ConnectionHub:
    """Tek Redis okuyucu → çok istemci."""

    def __init__(self, bus: EventBus | None = None) -> None:
        self.bus = bus or get_event_bus()
        self.clients: set[Client] = set()
        self._reader: asyncio.Task | None = None
        self._stop = asyncio.Event()

    async def start(self) -> None:
        if self._reader is None or self._reader.done():
            self._reader = asyncio.create_task(self._read_loop(), name="ws-hub")

    async def stop(self) -> None:
        self._stop.set()
        if self._reader is not None:
            self._reader.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._reader
            self._reader = None
        await self.bus.close()

    async def _read_loop(self) -> None:
        # Okuyucu bir kez düşünce eskiden hiç kalkmıyordu: her istemci sessizce
        # hiçbir şey almıyordu (API yeniden başlayana dek). Düşerse 5 sn sonra
        # yeniden dinler; kapanış istenene dek.
        while not self._stop.is_set():
            try:
                async for _entry_id, event in self.bus.listen(last_id="$"):
                    if self._stop.is_set():
                        break
                    self.broadcast(event)
                return
            except asyncio.CancelledError:
                raise
            except Exception:
                log.exception("ws_hub_read_failed")
                await asyncio.sleep(5)

    def broadcast(self, event: Event) -> None:
        channel = channel_of(event)
        payload = {"channel": channel, "event": event.to_dict()}
        for client in list(self.clients):
            if channel not in client.channels:
                continue
            try:
                client.queue.put_nowait(payload)
            except asyncio.QueueFull:
                # Yavaş istemci tüm sistemi yavaşlatmaz; en eskiyi düşürür.
                with contextlib.suppress(asyncio.QueueEmpty):
                    client.queue.get_nowait()
                with contextlib.suppress(asyncio.QueueFull):
                    client.queue.put_nowait(payload)

    def register(self, client: Client) -> None:
        self.clients.add(client)

    def unregister(self, client: Client) -> None:
        self.clients.discard(client)


hub = ConnectionHub()


async def _consume_ticket(jti: str) -> bool:
    """Bileti harcar. `True` ilk kullanım demektir, `False` tekrar kullanım.

    Redis erişilemezse tekrar kullanım kontrolü yapılamaz; bağlantı yine de
    kabul edilir. Bilet zaten 30 saniyelik ve imzalıdır — gözlem katmanı
    çöktüğü için canlı akışı kesmek, kazandığından fazlasını kaybettirir.
    """
    try:
        redis = await get_redis()
        return bool(await redis.set(f"sarnic:ws:jti:{jti}", "1", nx=True, ex=WS_TICKET_SECONDS))
    except Exception as exc:
        log.warning("ws_ticket_replay_check_failed", error=str(exc))
        return True


@router.websocket("/ws")
async def websocket_endpoint(
    websocket: WebSocket,
    ticket: str = Query(default=""),
    channels: str = Query(default=""),
) -> None:
    """Kimlik **tek kullanımlık biletle** gelir, erişim jetonuyla değil.

    Tarayıcı WebSocket el sıkışmasında başlık gönderemez, dolayısıyla kimlik
    sorgu dizgesinden geçmek zorunda — ve sorgu dizgeleri loglara düşer.
    Ölçüldü: panel proxy'si hata verdiğinde `?token=eyJ...` satırın tamamıyla
    journal'a yazılıyordu, yani 30 dakikalık tam yetkili bir jeton düz metin
    olarak duruyordu. Bilet 30 saniye yaşar ve burada harcanır; `/auth/ws-ticket`
    ucundan normal `Authorization` başlığıyla alınır.
    """
    try:
        claims = decode_token(ticket, expected_type="ws")
    except jwt.InvalidTokenError:
        await websocket.close(code=4401, reason="Geçersiz veya süresi dolmuş bilet")
        return

    if not await _consume_ticket(str(claims.get("jti", ""))):
        await websocket.close(code=4401, reason="Bilet zaten kullanıldı")
        return

    await websocket.accept()
    selected = (
        {c.strip() for c in channels.split(",") if c.strip() in ALL_CHANNELS}
        if channels
        else set(ALL_CHANNELS)
    )
    client = Client(websocket=websocket, user_id=int(claims["sub"]), channels=selected)
    hub.register(client)
    await hub.start()

    sender = asyncio.create_task(_sender(client))

    # Gönderici ölürse soket açık kalıp panel sessizce bayatlıyordu (DESIGN §3

    # ihlali). Gönderici bitince soketi kapat — istemci 'yeniden bağlanıyor' der.

    sender.add_done_callback(
        lambda t: asyncio.ensure_future(_close_quietly(websocket)) if not t.cancelled() else None
    )
    try:
        # Yeni bağlanan istemci geçmişi alır — boş ekranla başlamaz.
        history = await hub.bus.history(count=200)
        await websocket.send_text(
            json.dumps(
                {
                    "channel": "history",
                    "events": [e.to_dict() for e in history if channel_of(e) in client.channels],
                },
                ensure_ascii=False,
            )
        )
        while True:
            raw = await websocket.receive_text()
            await _handle_client_message(client, raw)
    except WebSocketDisconnect:
        pass
    except Exception:
        log.info("ws_client_error", user_id=client.user_id)
    finally:
        sender.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await sender
        hub.unregister(client)
        if websocket.client_state is not WebSocketState.DISCONNECTED:
            with contextlib.suppress(Exception):
                await websocket.close()


async def _sender(client: Client) -> None:
    while True:
        payload = await client.queue.get()
        if client.websocket.client_state is not WebSocketState.CONNECTED:
            return
        await client.websocket.send_text(json.dumps(payload, ensure_ascii=False, default=str))


async def _handle_client_message(client: Client, raw: str) -> None:
    """İstemci yalnızca abonelik değiştirebilir ve ping atabilir."""
    try:
        msg = json.loads(raw)
    except json.JSONDecodeError:
        return
    action = msg.get("action")
    if action == "subscribe":
        wanted = {c for c in msg.get("channels", []) if c in ALL_CHANNELS}
        client.channels = wanted or set(ALL_CHANNELS)
    elif action == "ping":
        await client.websocket.send_text(json.dumps({"channel": "pong"}))


async def _close_quietly(websocket) -> None:
    if websocket.client_state is not WebSocketState.DISCONNECTED:
        with contextlib.suppress(Exception):
            await websocket.close()
