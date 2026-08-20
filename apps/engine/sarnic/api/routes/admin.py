"""Yönetim uçları: kullanıcılar, entegrasyonlar, loglar, ayarlar, kill switch.

Her yönetimsel eylem `audit_log`'a yazılır (kim, ne zaman, ne yaptı, hangi IP).
Kill switch ayrıca **2FA yeniden doğrulaması** ister.
"""

from __future__ import annotations

from dataclasses import asdict
from datetime import UTC, datetime

from fastapi import APIRouter, HTTPException, Request, status
from sqlalchemy import select

from sarnic.api.deps import (
    BusDep,
    CurrentUser,
    RequireAdmin,
    SessionDep,
    write_audit,
)
from sarnic.api.schemas import (
    DiscordConfigIn,
    DiscordConfigOut,
    KillSwitchRequest,
    SettingIn,
    UserCreate,
    UserOut,
    UserUpdate,
)
from sarnic.core import settings_store
from sarnic.core.enums import BotState, EventKind
from sarnic.core.security import generate_totp_secret, hash_password, mask_secret, verify_totp
from sarnic.db.models import AuditLog, Bot, BotEvent, DataQualityReport, Session, Setting, User
from sarnic.notify.discord import CHANNEL_MAP, DiscordConfig, DiscordNotifier
from sarnic.notify.service import load_discord_config, save_discord_config
from sarnic.universe.filters import UniverseConfig

router = APIRouter(tags=["admin"])

CHANNELS = sorted(set(CHANNEL_MAP.values()))


# --------------------------------------------------------------------------- #
#  Kullanıcılar — açık kayıt yok, yalnızca ADMIN daveti (§17)
# --------------------------------------------------------------------------- #
@router.get("/users", response_model=list[UserOut])
async def list_users(session: SessionDep, admin: RequireAdmin) -> list[UserOut]:
    rows = (await session.execute(select(User).order_by(User.id))).scalars()
    return [UserOut.model_validate(u) for u in rows]


@router.post("/users", response_model=UserOut, status_code=status.HTTP_201_CREATED)
async def create_user(
    payload: UserCreate, request: Request, session: SessionDep, admin: RequireAdmin
) -> UserOut:
    email = payload.email.lower()
    exists = (await session.execute(select(User).where(User.email == email))).scalar_one_or_none()
    if exists is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Bu e-posta zaten kayıtlı.")

    user = User(
        email=email,
        password_hash=hash_password(payload.password),
        role=payload.role,
        display_name=payload.display_name or email.split("@")[0],
        totp_secret=generate_totp_secret(),
        totp_enabled=False,
    )
    session.add(user)
    await session.flush()
    await write_audit(session, request, admin.id, "user.create", target=email)
    await session.commit()
    return UserOut.model_validate(user)


@router.patch("/users/{user_id}", response_model=UserOut)
async def update_user(
    user_id: int,
    payload: UserUpdate,
    request: Request,
    session: SessionDep,
    admin: RequireAdmin,
) -> UserOut:
    user = (await session.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Kullanıcı bulunamadı.")
    if user.id == admin.id and payload.is_active is False:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Kendi hesabınızı pasife alamazsınız.")

    if payload.role is not None:
        user.role = payload.role
    if payload.display_name is not None:
        user.display_name = payload.display_name
    if payload.is_active is not None:
        user.is_active = payload.is_active
    if payload.password:
        user.password_hash = hash_password(payload.password)

    await write_audit(
        session,
        request,
        admin.id,
        "user.update",
        target=user.email,
        payload=payload.model_dump(exclude_none=True, exclude={"password"}),
    )
    await session.commit()
    return UserOut.model_validate(user)


@router.post("/users/{user_id}/reset-2fa", response_model=UserOut)
async def reset_2fa(
    user_id: int, request: Request, session: SessionDep, admin: RequireAdmin
) -> UserOut:
    user = (await session.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Kullanıcı bulunamadı.")
    user.totp_secret = generate_totp_secret()
    user.totp_enabled = False
    await write_audit(session, request, admin.id, "user.reset_2fa", target=user.email)
    await session.commit()
    return UserOut.model_validate(user)


@router.post("/users/{user_id}/revoke-sessions", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_sessions(
    user_id: int, request: Request, session: SessionDep, admin: RequireAdmin
) -> None:
    rows = (await session.execute(select(Session).where(Session.user_id == user_id))).scalars()
    now = datetime.now(UTC)
    for row in rows:
        row.revoked_at = now
    await write_audit(session, request, admin.id, "user.revoke_sessions", target=str(user_id))
    await session.commit()


# --------------------------------------------------------------------------- #
#  Entegrasyonlar
# --------------------------------------------------------------------------- #
@router.get("/integrations/discord", response_model=DiscordConfigOut)
async def get_discord(session: SessionDep, admin: RequireAdmin) -> DiscordConfigOut:
    config = await load_discord_config(session)
    return DiscordConfigOut(
        enabled=config.enabled,
        webhooks={k: mask_secret(v) for k, v in config.webhooks.items()},
        channels=CHANNELS,
    )


@router.put("/integrations/discord", response_model=DiscordConfigOut)
async def put_discord(
    payload: DiscordConfigIn, request: Request, session: SessionDep, admin: RequireAdmin
) -> DiscordConfigOut:
    existing = await load_discord_config(session)
    # Maskeli değer geri gönderilirse mevcut URL korunur.
    webhooks = dict(existing.webhooks)
    for channel, url in payload.webhooks.items():
        if not url:
            webhooks.pop(channel, None)
        elif "•" not in url:
            webhooks[channel] = url

    config = DiscordConfig(enabled=payload.enabled, webhooks=webhooks)
    await save_discord_config(session, config, admin.id)
    await write_audit(
        session,
        request,
        admin.id,
        "integration.discord_update",
        payload={"enabled": config.enabled, "channels": sorted(webhooks)},
    )
    await session.commit()
    return DiscordConfigOut(
        enabled=config.enabled,
        webhooks={k: mask_secret(v) for k, v in config.webhooks.items()},
        channels=CHANNELS,
    )


@router.post("/integrations/discord/test")
async def test_discord(
    channel: str, request: Request, session: SessionDep, admin: RequireAdmin
) -> dict:
    config = await load_discord_config(session)
    notifier = DiscordNotifier(config)
    try:
        ok = await notifier.send_test(channel)
    finally:
        await notifier.close()
    await write_audit(session, request, admin.id, "integration.discord_test", target=channel)
    await session.commit()
    return {
        "sent": ok,
        "message": (
            f"#{channel} kanalına test mesajı gönderildi."
            if ok
            else f"#{channel} için webhook tanımlı değil veya gönderim başarısız."
        ),
    }


# --------------------------------------------------------------------------- #
#  Ayarlar
# --------------------------------------------------------------------------- #
#
#  Motorun **gerçekten okuduğu** ayar grupları.
#
#  Bir grubun burada olması, o gruba yazılan değerin bir sonraki döngüde
#  davranışı değiştireceği anlamına gelir (`core.settings_store`). Burada
#  olmayan bir grup panelde salt okunur gösterilir — düzenlenebilir gibi
#  göstermek, hiçbir şey yapmayan bir düğme sunmak olurdu.
#
#  Risk limitleri bilerek **yok**: onların yeri strateji tanımıdır
#  (`definition.risk` → `RiskLimits`). İkinci bir yerden ezilebilmeleri, bir
#  botun hangi limitle çalıştığını belirsiz hâle getirirdi (bozulmaz kural 1).
LIVE_SETTING_GROUPS: dict[str, dict] = {
    "universe": asdict(UniverseConfig()),
}


@router.get("/settings")
async def get_settings(session: SessionDep, admin: RequireAdmin) -> dict:
    """Ayar grupları: varsayılan, kayıtlı ve yürürlükteki değerler.

    Üçünü birden döndürmek gerekiyor; panel "bu değeri ben mi değiştirdim,
    yoksa sistemin varsayılanı mı?" sorusunu ancak böyle cevaplayabilir.
    """
    rows = (await session.execute(select(Setting))).scalars().all()
    stored = {r.key: r.value for r in rows}

    groups = []
    for key, defaults in LIVE_SETTING_GROUPS.items():
        saved = stored.get(key) if isinstance(stored.get(key), dict) else {}
        groups.append(
            {
                "key": key,
                "editable": True,
                "defaults": defaults,
                "stored": saved,
                "effective": {**defaults, **(saved or {})},
            }
        )

    for key, value in stored.items():
        if key in LIVE_SETTING_GROUPS:
            continue
        groups.append(
            {
                "key": key,
                "editable": False,
                "defaults": {},
                "stored": value if isinstance(value, dict) else {"değer": value},
                "effective": value if isinstance(value, dict) else {"değer": value},
            }
        )

    return {"groups": groups}


@router.put("/settings/{key}")
async def put_setting(
    key: str, payload: SettingIn, request: Request, session: SessionDep, admin: RequireAdmin
) -> dict:
    if key in LIVE_SETTING_GROUPS:
        unknown = sorted(set(payload.value) - set(LIVE_SETTING_GROUPS[key]))
        if unknown:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY,
                f"Bu grupta tanınmayan alan(lar): {', '.join(unknown)}",
            )

    row = (await session.execute(select(Setting).where(Setting.key == key))).scalar_one_or_none()
    if row is None:
        row = Setting(key=key, value=payload.value)
        session.add(row)
    else:
        row.value = payload.value
    row.updated_by = admin.id
    row.updated_at = datetime.now(UTC)
    await write_audit(
        session, request, admin.id, "settings.update", target=key, payload=payload.value
    )
    await session.commit()

    # Motor ayarları TTL'li önbellekten okur; yazıldığı anda düşürülür ki
    # kullanıcı değişikliğin etkisini beklemek zorunda kalmasın.
    settings_store.invalidate()
    return {key: payload.value}


# --------------------------------------------------------------------------- #
#  Loglar
# --------------------------------------------------------------------------- #
@router.get("/logs")
async def logs(
    session: SessionDep, admin: RequireAdmin, level: str | None = None, limit: int = 200
) -> list[dict]:
    stmt = select(BotEvent).order_by(BotEvent.created_at.desc()).limit(min(limit, 1000))
    if level:
        stmt = stmt.where(BotEvent.level == level.upper())
    rows = (await session.execute(stmt)).scalars()
    return [
        {
            "id": r.id,
            "bot_id": r.bot_id,
            "kind": r.kind,
            "level": r.level,
            "payload": r.payload,
            "created_at": r.created_at.isoformat(),
        }
        for r in rows
    ]


@router.get("/audit")
async def audit(session: SessionDep, admin: RequireAdmin, limit: int = 200) -> list[dict]:
    rows = (
        await session.execute(
            select(AuditLog).order_by(AuditLog.created_at.desc()).limit(min(limit, 1000))
        )
    ).scalars()
    return [
        {
            "id": r.id,
            "user_id": r.user_id,
            "action": r.action,
            "target": r.target,
            "payload": r.payload,
            "ip": r.ip,
            "created_at": r.created_at.isoformat(),
        }
        for r in rows
    ]


@router.get("/data-quality")
async def data_quality(
    session: SessionDep,
    user: CurrentUser,
    limit: int = 200,
    unresolved_only: bool = False,
) -> list[dict]:
    """Veri kalitesi bulguları.

    `unresolved_only`, panelin sağlık kutusu içindir: boşluklar otomatik
    onarılıyor ve sonraki temiz denetim onları kapatıyor. Kapanmışları güncel
    sorunmuş gibi listelemek, "sistemde 37 boşluk var" izlenimi veriyordu —
    oysa hepsi saatler önce onarılmıştı.
    """
    stmt = select(DataQualityReport)
    if unresolved_only:
        stmt = stmt.where(DataQualityReport.resolved.is_(False))
    rows = (
        await session.execute(
            stmt.order_by(DataQualityReport.created_at.desc()).limit(min(limit, 1000))
        )
    ).scalars()
    return [
        {
            "id": r.id,
            "kind": r.kind,
            "symbol": r.symbol,
            "timeframe": r.timeframe,
            "severity": r.severity,
            "resolved": r.resolved,
            "detail": r.detail,
            "created_at": r.created_at.isoformat(),
        }
        for r in rows
    ]


# --------------------------------------------------------------------------- #
#  Kill switch — §8
# --------------------------------------------------------------------------- #
@router.post("/system/kill-switch")
async def kill_switch(
    payload: KillSwitchRequest,
    request: Request,
    session: SessionDep,
    bus: BusDep,
    admin: RequireAdmin,
) -> dict:
    """Tüm botlar durur, açık emirler iptal edilir. Geri alınamaz."""
    if not payload.confirm:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Onay gerekiyor. Tüm botlar durur, açık emirler iptal edilir. Geri alınamaz.",
        )
    if not admin.totp_secret or not verify_totp(admin.totp_secret, payload.code):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Doğrulama kodu hatalı.")

    bots = (await session.execute(select(Bot).where(Bot.state != BotState.STOPPED))).scalars().all()
    for bot in bots:
        bot.state = BotState.STOPPED
        bot.halt_reason = "KILL_SWITCH"
        session.add(
            BotEvent(
                bot_id=bot.id,
                kind="system.kill_switch",
                level="CRITICAL",
                payload={"by": admin.email},
            )
        )

    await bus.emit(
        EventKind.RISK_CIRCUIT_BREAKER,
        level="CRITICAL",
        breaker="KILL_SWITCH",
        message=(
            f"KILL SWITCH — {admin.email} tarafından basıldı. "
            f"{len(bots)} bot durduruldu, açık emirler iptal ediliyor."
        ),
    )
    await write_audit(session, request, admin.id, "system.kill_switch", payload={"bots": len(bots)})
    await session.commit()
    return {"stopped_bots": len(bots), "message": f"{len(bots)} bot durduruldu."}
