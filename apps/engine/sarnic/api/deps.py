"""FastAPI bağımlılıkları — kimlik, rol, denetim kaydı."""

from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Annotated

import jwt
import redis.asyncio as aioredis
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from sarnic.config import settings
from sarnic.core.enums import Role
from sarnic.core.events import EventBus, get_event_bus
from sarnic.core.security import decode_token
from sarnic.db.models import AuditLog, User
from sarnic.db.session import get_session

bearer = HTTPBearer(auto_error=False)

_redis: aioredis.Redis | None = None


async def get_redis() -> aioredis.Redis:
    global _redis
    if _redis is None:
        _redis = aioredis.from_url(settings.redis_url, decode_responses=True)
    return _redis


async def close_redis() -> None:
    global _redis
    if _redis is not None:
        await _redis.aclose()
        _redis = None


def get_bus() -> EventBus:
    return get_event_bus()


SessionDep = Annotated[AsyncSession, Depends(get_session)]
RedisDep = Annotated[aioredis.Redis, Depends(get_redis)]
BusDep = Annotated[EventBus, Depends(get_bus)]


async def current_user(
    session: SessionDep,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)] = None,
) -> User:
    if credentials is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Oturum açmanız gerekiyor.")
    try:
        payload = decode_token(credentials.credentials, expected_type="access")
    except jwt.ExpiredSignatureError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Oturum süresi doldu.") from exc
    except jwt.InvalidTokenError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Geçersiz jeton.") from exc

    user = (
        await session.execute(select(User).where(User.id == int(payload["sub"])))
    ).scalar_one_or_none()
    if user is None or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Kullanıcı bulunamadı veya pasif.")
    return user


CurrentUser = Annotated[User, Depends(current_user)]


def require_role(*roles: Role):
    """Rol kapısı. `ADMIN` her zaman geçer."""

    async def dependency(user: CurrentUser) -> User:
        if user.role == Role.ADMIN or user.role in roles:
            return user
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            f"Bu işlem için {' veya '.join(roles)} yetkisi gerekiyor.",
        )

    return dependency


RequireTrader = Annotated[User, Depends(require_role(Role.TRADER))]
RequireAdmin = Annotated[User, Depends(require_role(Role.ADMIN))]


def client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else ""


async def write_audit(
    session: AsyncSession,
    request: Request,
    user_id: int | None,
    action: str,
    target: str = "",
    payload: dict | None = None,
) -> None:
    """Her yönetimsel eylem `audit_log`'a yazılır (kim, ne zaman, ne, hangi IP)."""
    session.add(
        AuditLog(
            user_id=user_id,
            action=action,
            target=target,
            payload=payload or {},
            ip=client_ip(request),
        )
    )


async def paginate(limit: int = 50, offset: int = 0) -> AsyncIterator[tuple[int, int]]:
    yield max(1, min(limit, 500)), max(0, offset)
