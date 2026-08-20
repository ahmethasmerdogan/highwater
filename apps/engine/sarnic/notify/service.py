"""Bildirim servisi — olay veriyolunu tüketir, üç yere dağıtır (§14).

Her olay:
  * `notifications` tablosuna yazılır (panel gelen kutusu)
  * Discord'a — kuralı varsa, 5 sn'lik pencerede toplanarak
  * WebSocket'e — API sürecindeki köprü tarafından (bu servis değil)
"""

from __future__ import annotations

import asyncio
import contextlib
import json

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from sarnic.core.enums import EventKind, Role
from sarnic.core.events import Event, EventBus, get_event_bus
from sarnic.core.logging import get_logger
from sarnic.core.security import decrypt_secret, encrypt_secret
from sarnic.db.models import Integration, Notification, User
from sarnic.db.session import session_scope
from sarnic.notify.discord import DiscordConfig, DiscordNotifier

log = get_logger(__name__)

# Panel gelen kutusuna yazılan olaylar. Gürültü (LOG, SCORES_UPDATED) yazılmaz.
PERSISTED: frozenset[str] = frozenset(
    {
        str(EventKind.POOL_UPDATED),
        str(EventKind.SCORE_THRESHOLD_CROSSED),
        str(EventKind.POSITION_OPENED),
        str(EventKind.POSITION_CLOSED),
        str(EventKind.ORDER_REJECTED),
        str(EventKind.RISK_CIRCUIT_BREAKER),
        str(EventKind.BOT_STATE_CHANGED),
        str(EventKind.DATA_STALE),
        str(EventKind.API_BANNED),
        str(EventKind.BACKTEST_FINISHED),
    }
)

TITLES: dict[str, str] = {
    str(EventKind.POOL_UPDATED): "Havuz güncellendi",
    str(EventKind.SCORE_THRESHOLD_CROSSED): "Puan eşiği aşıldı",
    str(EventKind.POSITION_OPENED): "Pozisyon açıldı",
    str(EventKind.POSITION_CLOSED): "Pozisyon kapandı",
    str(EventKind.ORDER_REJECTED): "Emir reddedildi",
    str(EventKind.RISK_CIRCUIT_BREAKER): "Devre kesici tetiklendi",
    str(EventKind.BOT_STATE_CHANGED): "Bot durumu değişti",
    str(EventKind.DATA_STALE): "Piyasa verisi bayat",
    str(EventKind.API_BANNED): "Binance IP yasağı",
    str(EventKind.BACKTEST_FINISHED): "Backtest bitti",
}


async def load_discord_config(session: AsyncSession) -> DiscordConfig:
    row = (
        await session.execute(select(Integration).where(Integration.kind == "discord"))
    ).scalar_one_or_none()
    if row is None or not row.enabled:
        return DiscordConfig()
    try:
        data = json.loads(decrypt_secret(row.config_encrypted))
    except Exception:
        log.warning("discord_config_decrypt_failed")
        return DiscordConfig()
    data["enabled"] = row.enabled
    return DiscordConfig.from_dict(data)


async def save_discord_config(
    session: AsyncSession, config: DiscordConfig, user_id: int | None
) -> None:
    payload = json.dumps({"webhooks": config.webhooks})
    row = (
        await session.execute(select(Integration).where(Integration.kind == "discord"))
    ).scalar_one_or_none()
    if row is None:
        row = Integration(kind="discord")
        session.add(row)
    row.config_encrypted = encrypt_secret(payload)
    row.enabled = config.enabled
    row.updated_by = user_id


async def target_users(session: AsyncSession, event: Event) -> list[int]:
    """Kimin gelen kutusuna düşecek?

    v1'de basit: alarm seviyesindekiler herkese, geri kalanı ADMIN + TRADER'a.
    """
    stmt = select(User.id, User.role).where(User.is_active.is_(True))
    rows = (await session.execute(stmt)).all()
    if event.level in ("CRITICAL", "ERROR"):
        return [uid for uid, _ in rows]
    return [uid for uid, role in rows if role in (Role.ADMIN, Role.TRADER)]


def summarize(event: Event) -> tuple[str, str]:
    """Olayı panelde okunacak bir cümleye çevirir.

    Ham JSON **son çare**dir, varsayılan değil. Kalan her JSON gövdesi bir
    eksiktir: kullanıcı `{"threshold": 80.0, "symbols": [...]}` okumak zorunda
    kalıyorsa bildirim işini yapmıyor demektir.
    """
    kind = str(event.kind)
    title = TITLES.get(kind, kind)
    body = event.payload.get("message", "")
    if body:
        return title, body

    if kind == str(EventKind.POOL_UPDATED):
        giren = event.payload.get("added", [])
        cikan = event.payload.get("removed", [])
        parcalar = [f"Havuzda {event.payload.get('size')} sembol var"]
        if giren:
            parcalar.append(f"yeni giren: {_liste(giren)}")
        if cikan:
            parcalar.append(f"çıkan: {_liste(cikan)}")
        return title, ", ".join(parcalar) + "."

    if kind == str(EventKind.SCORE_THRESHOLD_CROSSED):
        semboller = event.payload.get("symbols", [])
        esik = event.payload.get("threshold")
        adlar = ", ".join(
            f"{s.get('symbol')} ({float(s.get('score', 0)):.1f})" for s in semboller[:5]
        )
        kalan = len(semboller) - 5
        if kalan > 0:
            adlar += f" ve {kalan} tane daha"
        return title, (
            f"{adlar} giriş puanı {float(esik):.0f}'in üstüne çıktı. "
            "Bot uygun koşullarda bu sembollerde pozisyon açabilir."
        )

    if kind == str(EventKind.BACKTEST_FINISHED):
        return title, (
            f"Backtest #{event.payload.get('backtest_id', '?')} tamamlandı. "
            "Sonuçlar Stratejiler sayfasında."
        )

    # Buraya düşen her olay bir eksiktir; ham JSON yerine hiç değilse alanları
    # okunur biçimde diz.
    alanlar = ", ".join(
        f"{k}: {v}" for k, v in event.payload.items() if k not in ("bot_id", "snapshot_id")
    )
    return title, (alanlar or json.dumps(event.payload, ensure_ascii=False))[:400]


def _liste(semboller: list, en_fazla: int = 5) -> str:
    """Sembol listesini okunur biçimde kısaltır."""
    gosterilen = ", ".join(str(x) for x in semboller[:en_fazla])
    kalan = len(semboller) - en_fazla
    return f"{gosterilen} ve {kalan} tane daha" if kalan > 0 else gosterilen


class NotificationService:
    def __init__(self, bus: EventBus | None = None) -> None:
        self.bus = bus or get_event_bus()
        self.discord = DiscordNotifier()
        self._stop = asyncio.Event()
        self._config_loaded_at = 0.0

    async def refresh_config(self) -> None:
        async with session_scope() as session:
            self.discord.update_config(await load_discord_config(session))

    async def handle(self, event: Event) -> None:
        if str(event.kind) in PERSISTED:
            async with session_scope() as session:
                title, body = summarize(event)
                for user_id in await target_users(session, event):
                    session.add(
                        Notification(
                            user_id=user_id,
                            kind=str(event.kind),
                            level=event.level,
                            title=title,
                            body=body,
                            payload=event.payload,
                        )
                    )
        await self.discord.enqueue(event)

    async def run(self) -> None:
        from sarnic.core.logging import configure_logging

        configure_logging()
        await self.refresh_config()
        log.info("notifier_started", discord=self.discord.config.enabled)

        flusher = asyncio.create_task(self.discord.run(self._stop), name="discord-flush")
        reloader = asyncio.create_task(self._config_reloader(), name="config-reload")
        try:
            async for _entry_id, event in self.bus.listen(last_id="$"):
                if self._stop.is_set():
                    break
                try:
                    await self.handle(event)
                except Exception:
                    log.exception("notification_handle_failed", kind=str(event.kind))
        finally:
            self._stop.set()
            for t in (flusher, reloader):
                t.cancel()
                with contextlib.suppress(asyncio.CancelledError):
                    await t
            await self.discord.close()
            await self.bus.close()

    async def _config_reloader(self) -> None:
        """Panelden webhook değiştiğinde yeniden başlatmaya gerek olmasın."""
        while not self._stop.is_set():
            await asyncio.sleep(60)
            with contextlib.suppress(Exception):
                await self.refresh_config()

    def stop(self) -> None:
        self._stop.set()


async def run_notifier() -> None:
    await NotificationService().run()
