"""Sohbet ve bildirim uçları — §17.

Sohbet: birebir + grup, dosya yok, sadece metin + kod bloğu.
"""

from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import and_, func, select, update

from sarnic.api.deps import BusDep, CurrentUser, SessionDep
from sarnic.api.schemas import (
    ChatMessageCreate,
    ChatMessageOut,
    ChatRoomCreate,
    ChatRoomOut,
    NotificationOut,
)
from sarnic.core.enums import EventKind
from sarnic.db.models import ChatMember, ChatMessage, ChatRoom, Notification

router = APIRouter(tags=["social"])


# --------------------------------------------------------------------------- #
#  Sohbet
# --------------------------------------------------------------------------- #
@router.get("/chat/rooms", response_model=list[ChatRoomOut])
async def rooms(session: SessionDep, user: CurrentUser) -> list[ChatRoomOut]:
    member_rows = (
        (await session.execute(select(ChatMember).where(ChatMember.user_id == user.id)))
        .scalars()
        .all()
    )
    room_ids = [m.room_id for m in member_rows]
    if not room_ids:
        return []

    room_rows = (
        (await session.execute(select(ChatRoom).where(ChatRoom.id.in_(room_ids)))).scalars().all()
    )
    all_members = (
        (await session.execute(select(ChatMember).where(ChatMember.room_id.in_(room_ids))))
        .scalars()
        .all()
    )

    last_read = {m.room_id: m.last_read_at for m in member_rows}
    out: list[ChatRoomOut] = []
    for room in room_rows:
        since = last_read.get(room.id)
        stmt = select(func.count(ChatMessage.id)).where(ChatMessage.room_id == room.id)
        if since is not None:
            stmt = stmt.where(ChatMessage.created_at > since)
        unread = int((await session.execute(stmt)).scalar_one())
        out.append(
            ChatRoomOut(
                id=room.id,
                name=room.name,
                kind=room.kind,
                members=[m.user_id for m in all_members if m.room_id == room.id],
                unread=unread,
                created_at=room.created_at,
            )
        )
    return out


@router.post("/chat/rooms", response_model=ChatRoomOut, status_code=status.HTTP_201_CREATED)
async def create_room(
    payload: ChatRoomCreate, session: SessionDep, user: CurrentUser
) -> ChatRoomOut:
    room = ChatRoom(name=payload.name, kind=payload.kind, created_by=user.id)
    session.add(room)
    await session.flush()

    members = {user.id, *payload.member_ids}
    for user_id in members:
        session.add(ChatMember(room_id=room.id, user_id=user_id))
    await session.commit()
    return ChatRoomOut(
        id=room.id,
        name=room.name,
        kind=room.kind,
        members=sorted(members),
        unread=0,
        created_at=room.created_at,
    )


@router.get("/chat/rooms/{room_id}/messages", response_model=list[ChatMessageOut])
async def messages(
    room_id: int, session: SessionDep, user: CurrentUser, limit: int = 100
) -> list[ChatMessageOut]:
    await _require_member(session, room_id, user.id)
    rows = (
        (
            await session.execute(
                select(ChatMessage)
                .where(ChatMessage.room_id == room_id)
                .order_by(ChatMessage.created_at.desc())
                .limit(min(limit, 500))
            )
        )
        .scalars()
        .all()
    )

    await session.execute(
        update(ChatMember)
        .where(and_(ChatMember.room_id == room_id, ChatMember.user_id == user.id))
        .values(last_read_at=datetime.now(UTC))
    )
    await session.commit()
    return [ChatMessageOut.model_validate(m) for m in reversed(rows)]


@router.post(
    "/chat/rooms/{room_id}/messages",
    response_model=ChatMessageOut,
    status_code=status.HTTP_201_CREATED,
)
async def post_message(
    room_id: int,
    payload: ChatMessageCreate,
    session: SessionDep,
    bus: BusDep,
    user: CurrentUser,
) -> ChatMessageOut:
    await _require_member(session, room_id, user.id)
    message = ChatMessage(room_id=room_id, user_id=user.id, body=payload.body)
    session.add(message)
    await session.commit()
    await bus.emit(
        EventKind.CHAT_MESSAGE,
        room_id=room_id,
        user_id=user.id,
        message_id=message.id,
        body=payload.body[:500],
    )
    return ChatMessageOut.model_validate(message)


# --------------------------------------------------------------------------- #
#  Bildirimler
# --------------------------------------------------------------------------- #
@router.get("/notifications", response_model=list[NotificationOut])
async def notifications(
    session: SessionDep, user: CurrentUser, unread_only: bool = False, limit: int = 100
) -> list[NotificationOut]:
    stmt = select(Notification).where(Notification.user_id == user.id)
    if unread_only:
        stmt = stmt.where(Notification.read_at.is_(None))
    rows = (
        await session.execute(stmt.order_by(Notification.created_at.desc()).limit(min(limit, 500)))
    ).scalars()
    return [NotificationOut.model_validate(n) for n in rows]


@router.get("/notifications/unread-count")
async def unread_count(session: SessionDep, user: CurrentUser) -> dict:
    count = int(
        (
            await session.execute(
                select(func.count(Notification.id)).where(
                    Notification.user_id == user.id, Notification.read_at.is_(None)
                )
            )
        ).scalar_one()
    )
    return {"unread": count}


@router.patch("/notifications/{notification_id}/read")
async def mark_read(notification_id: int, session: SessionDep, user: CurrentUser) -> dict:
    await session.execute(
        update(Notification)
        .where(Notification.id == notification_id, Notification.user_id == user.id)
        .values(read_at=datetime.now(UTC))
    )
    await session.commit()
    return {"id": notification_id, "read": True}


@router.patch("/notifications/read-all")
async def mark_all_read(session: SessionDep, user: CurrentUser) -> dict:
    await session.execute(
        update(Notification)
        .where(Notification.user_id == user.id, Notification.read_at.is_(None))
        .values(read_at=datetime.now(UTC))
    )
    await session.commit()
    return {"read": True}


async def _require_member(session, room_id: int, user_id: int) -> None:
    row = (
        await session.execute(
            select(ChatMember).where(ChatMember.room_id == room_id, ChatMember.user_id == user_id)
        )
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Bu odanın üyesi değilsiniz.")
