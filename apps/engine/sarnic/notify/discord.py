"""Discord bildirimcisi — MASTER-SPEC §14.

Tek sunucu, olay tipine göre ayrı kanal (`#islemler`, `#havuz`, `#alarm`, `#sistem`).
Webhook URL'leri Entegrasyonlar sayfasından girilir, **DB'de şifreli** saklanır.

Rate limit farkındalığı: olaylar 5 saniyelik pencerelerde toplanıp **tek mesajda**
gönderilir — havuz güncellemesinde 30 ayrı mesaj atmak yerine tek özet.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from datetime import datetime

import httpx

from sarnic.core.enums import EventKind
from sarnic.core.events import Event
from sarnic.core.logging import get_logger

log = get_logger(__name__)

BATCH_WINDOW_SECONDS = 5.0
MAX_MESSAGE_CHARS = 1900  # Discord limiti 2000; başlık için pay bırakıyoruz

# Olay → kanal eşlemesi (§14).
CHANNEL_MAP: dict[str, str] = {
    EventKind.POSITION_OPENED: "islemler",
    EventKind.POSITION_CLOSED: "islemler",
    EventKind.ORDER_REJECTED: "islemler",
    EventKind.POOL_UPDATED: "havuz",
    EventKind.SCORE_THRESHOLD_CROSSED: "havuz",
    EventKind.RISK_CIRCUIT_BREAKER: "alarm",
    EventKind.DATA_STALE: "alarm",
    EventKind.API_BANNED: "alarm",
    EventKind.BOT_STATE_CHANGED: "sistem",
    EventKind.BOT_HEARTBEAT: "sistem",
}

# `@here` gerektiren olaylar (§14 tablosu).
MENTION_EVERYONE: frozenset[str] = frozenset(
    {
        str(EventKind.RISK_CIRCUIT_BREAKER),
        str(EventKind.DATA_STALE),
        str(EventKind.API_BANNED),
    }
)

# Discord'a hiç gitmeyen olaylar.
SILENT: frozenset[str] = frozenset(
    {
        str(EventKind.BACKTEST_FINISHED),
        str(EventKind.CHAT_MESSAGE),
        str(EventKind.LOG),
        str(EventKind.SCORES_UPDATED),
        str(EventKind.ORDER_SUBMITTED),
    }
)


@dataclass(slots=True)
class DiscordConfig:
    enabled: bool = False
    webhooks: dict[str, str] = field(default_factory=dict)  # kanal → URL

    @classmethod
    def from_dict(cls, data: dict | None) -> DiscordConfig:
        if not data:
            return cls()
        return cls(
            enabled=bool(data.get("enabled", False)),
            webhooks={k: v for k, v in (data.get("webhooks") or {}).items() if v},
        )

    def url_for(self, channel: str) -> str | None:
        return self.webhooks.get(channel) or self.webhooks.get("sistem")


def channel_for(event: Event) -> str | None:
    kind = str(event.kind)
    if kind in SILENT:
        return None
    return CHANNEL_MAP.get(kind, "sistem")


def format_event(event: Event) -> str:
    """Tek satır. Kısa, sayı içeren, süssüz."""
    kind = str(event.kind)
    p = event.payload
    stamp = event.at.strftime("%H:%M:%S")

    if kind == str(EventKind.POSITION_OPENED):
        return f"`{stamp}` 🟢 **{p.get('symbol')}** giriş · {p.get('message', '')}"
    if kind == str(EventKind.POSITION_CLOSED):
        pnl = p.get("pnl", 0)
        icon = "🔵" if pnl >= 0 else "🔴"
        return f"`{stamp}` {icon} **{p.get('symbol')}** çıkış · {p.get('message', '')}"
    if kind == str(EventKind.POOL_UPDATED):
        added, removed = p.get("added", []), p.get("removed", [])
        parts = [f"havuz {p.get('size')} sembol"]
        if added:
            parts.append(f"giren ({len(added)}): {', '.join(added[:12])}")
        if removed:
            parts.append(f"çıkan ({len(removed)}): {', '.join(removed[:12])}")
        return f"`{stamp}` 🗂 " + " · ".join(parts)
    if kind == str(EventKind.SCORE_THRESHOLD_CROSSED):
        items = p.get("symbols", [])[:5]
        listed = ", ".join(f"{i['symbol']} {i['score']:.1f}" for i in items)
        return f"`{stamp}` ⭐ eşik aşıldı (≥{p.get('threshold')}): {listed}"
    if kind == str(EventKind.RISK_CIRCUIT_BREAKER):
        return f"`{stamp}` ⛔ **{p.get('breaker')}** — {p.get('message', '')}"
    if kind == str(EventKind.DATA_STALE):
        if p.get("recovered"):
            return f"`{stamp}` ✅ piyasa verisi geri geldi"
        return f"`{stamp}` ⚠️ {p.get('message', 'piyasa verisi bayat')}"
    if kind == str(EventKind.API_BANNED):
        return f"`{stamp}` 🚫 {p.get('message', 'Binance IP yasağı (418)')}"
    if kind == str(EventKind.BOT_STATE_CHANGED):
        return f"`{stamp}` 🤖 bot #{event.bot_id} → {p.get('state')} · {p.get('message', '')}"
    return f"`{stamp}` {kind} · {p.get('message', '')}"


def build_batch(events: list[Event]) -> str:
    """5 saniyelik pencerede toplanan olaylardan **tek** mesaj."""
    lines = [format_event(e) for e in events]
    mention = any(str(e.kind) in MENTION_EVERYONE for e in events)
    body = "\n".join(lines)
    if len(body) > MAX_MESSAGE_CHARS:
        kept: list[str] = []
        size = 0
        for line in lines:
            if size + len(line) > MAX_MESSAGE_CHARS - 60:
                kept.append(f"… ve {len(lines) - len(kept)} olay daha")
                break
            kept.append(line)
            size += len(line) + 1
        body = "\n".join(kept)
    return f"@here\n{body}" if mention else body


class DiscordNotifier:
    def __init__(self, config: DiscordConfig | None = None) -> None:
        self.config = config or DiscordConfig()
        self._client: httpx.AsyncClient | None = None
        self._buffers: dict[str, list[Event]] = {}
        self._lock = asyncio.Lock()

    async def _client_or_new(self) -> httpx.AsyncClient:
        if self._client is None:
            self._client = httpx.AsyncClient(timeout=httpx.Timeout(15.0))
        return self._client

    async def close(self) -> None:
        if self._client is not None:
            await self._client.aclose()
            self._client = None

    def update_config(self, config: DiscordConfig) -> None:
        self.config = config

    async def enqueue(self, event: Event) -> None:
        channel = channel_for(event)
        if channel is None or not self.config.enabled:
            return
        async with self._lock:
            self._buffers.setdefault(channel, []).append(event)

    async def flush(self) -> int:
        """Tamponu boşaltır; gönderilen mesaj sayısını döner."""
        async with self._lock:
            buffers = {k: v for k, v in self._buffers.items() if v}
            self._buffers = {}
        sent = 0
        for channel, events in buffers.items():
            url = self.config.url_for(channel)
            if not url:
                continue
            if await self.send(url, build_batch(events)):
                sent += 1
        return sent

    async def send(self, url: str, content: str) -> bool:
        """Tek POST. 429 gelirse `retry_after` kadar bekler ve bir kez tekrar dener."""
        client = await self._client_or_new()
        payload = {"content": content, "allowed_mentions": {"parse": ["everyone"]}}
        for attempt in range(2):
            try:
                resp = await client.post(url, json=payload)
            except httpx.HTTPError as exc:
                log.warning("discord_send_failed", error=str(exc))
                return False
            if resp.status_code in (200, 204):
                return True
            if resp.status_code == 429 and attempt == 0:
                retry_after = float(resp.headers.get("Retry-After", 2))
                log.info("discord_rate_limited", retry_after=retry_after)
                await asyncio.sleep(min(retry_after, 30))
                continue
            log.warning("discord_bad_status", status=resp.status_code, body=resp.text[:200])
            return False
        return False

    async def run(self, stop: asyncio.Event | None = None) -> None:
        """5 saniyelik pencerelerde tamponu boşaltan döngü."""
        stop = stop or asyncio.Event()
        while not stop.is_set():
            await asyncio.sleep(BATCH_WINDOW_SECONDS)
            try:
                await self.flush()
            except Exception:
                log.exception("discord_flush_failed")

    async def send_test(self, channel: str) -> bool:
        """Panelin "test gönderimi" butonu."""
        url = self.config.url_for(channel)
        if not url:
            return False
        now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        return await self.send(
            url, f"`{now}` ✅ SARNIÇ bağlantı testi — `#{channel}` kanalı çalışıyor."
        )
