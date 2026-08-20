"""API şemaları. Panel ve TUI bu sözleşmeye bakar."""

from __future__ import annotations

import re
from datetime import datetime
from typing import Annotated, Any

from pydantic import AfterValidator, BaseModel, Field

from sarnic.core.enums import BotState, Role

# Pydantic'in `EmailStr`'i `.local`, `.internal`, `.lan` gibi **özel kullanım**
# alan adlarını reddeder. Bu panel varsayılan olarak yalnızca yerel ağa açıktır
# ve kurumsal iç alan adları (mDNS'te `.local`) burada tamamen meşrudur —
# nitekim varsayılan yönetici hesabı `admin@sarnic.local` ile oluşuyor ve
# `EmailStr` ile giriş yapamıyordu.
#
# Bu yüzden biçim doğrulaması yapan, teslim edilebilirlik iddiasında bulunmayan
# kendi tipimizi kullanıyoruz. Adres ayrıca küçük harfe normalize edilir;
# kimlik doğrulama kodu bunu varsayıyor.
_EMAIL_PATTERN = re.compile(r"^[^@\s]+@[^@\s.]+(\.[^@\s.]+)+$")


def _normalise_email(value: str) -> str:
    cleaned = value.strip().lower()
    if not _EMAIL_PATTERN.match(cleaned):
        raise ValueError("geçerli bir e-posta adresi değil")
    if len(cleaned) > 255:
        raise ValueError("e-posta adresi çok uzun")
    return cleaned


Email = Annotated[str, AfterValidator(_normalise_email)]


# --------------------------------------------------------------------------- #
#  Auth
# --------------------------------------------------------------------------- #
class LoginRequest(BaseModel):
    email: Email
    password: str


class LoginResponse(BaseModel):
    """2FA zorunlu olduğu için giriş iki adımlıdır."""

    requires_2fa: bool
    challenge_token: str | None = None
    access_token: str | None = None
    refresh_token: str | None = None
    # 2FA hiç kurulmamışsa kurulum verisi döner.
    totp_setup: TotpSetup | None = None


class TotpSetup(BaseModel):
    secret: str
    provisioning_uri: str


class TwoFactorRequest(BaseModel):
    challenge_token: str
    code: str = Field(min_length=6, max_length=8)


class TokenPair(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class RefreshRequest(BaseModel):
    refresh_token: str


class UserOut(BaseModel):
    id: int
    email: str
    role: Role
    display_name: str
    totp_enabled: bool
    is_active: bool
    created_at: datetime
    last_login_at: datetime | None = None

    model_config = {"from_attributes": True}


class UserCreate(BaseModel):
    email: Email
    password: str = Field(min_length=10)
    role: Role = Role.VIEWER
    display_name: str = ""


class UserUpdate(BaseModel):
    role: Role | None = None
    display_name: str | None = None
    is_active: bool | None = None
    password: str | None = Field(default=None, min_length=10)


# --------------------------------------------------------------------------- #
#  Havuz
# --------------------------------------------------------------------------- #
class UniverseSymbol(BaseModel):
    symbol: str
    rank: int
    quote_volume: float
    price: float | None = None
    spread_pct: float | None = None
    age_days: float | None = None
    volatility_ann_pct: float | None = None
    range_3d_pct: float | None = None
    protected: bool = False


class FunnelStepOut(BaseModel):
    index: int
    name: str
    kept: int
    dropped: int
    examples: list[str] = []


class SnapshotOut(BaseModel):
    id: int
    taken_at: datetime
    reason: str
    config_hash: str
    size: int
    added: list[str]
    removed: list[str]


class SnapshotDetail(SnapshotOut):
    symbols: list[UniverseSymbol]
    funnel: list[FunnelStepOut]


# --------------------------------------------------------------------------- #
#  Puanlar
# --------------------------------------------------------------------------- #
class ScoreOut(BaseModel):
    symbol: str
    bar_time: datetime
    score: float
    families: dict[str, float]
    modifiers: dict[str, float]
    config_hash: str


class ScoreDetail(ScoreOut):
    rationale: dict[str, Any]


# --------------------------------------------------------------------------- #
#  Botlar
# --------------------------------------------------------------------------- #
class BotOut(BaseModel):
    id: int
    name: str
    owner_id: int | None
    strategy_version_id: int
    mode: str
    state: BotState
    timeframe: str
    capital: float
    cash: float
    equity: float | None = None
    open_positions: int = 0
    last_heartbeat_at: datetime | None = None
    halt_reason: str | None = None
    created_at: datetime


class BotCreate(BaseModel):
    name: str = Field(min_length=1, max_length=128)
    strategy_version_id: int
    capital: float = Field(default=5000.0, gt=0)
    timeframe: str = "1h"


class BotUpdate(BaseModel):
    name: str | None = None
    capital: float | None = Field(default=None, gt=0)


class BotEventOut(BaseModel):
    id: int
    kind: str
    level: str
    payload: dict[str, Any]
    created_at: datetime

    model_config = {"from_attributes": True}


# --------------------------------------------------------------------------- #
#  Pozisyon / işlem
# --------------------------------------------------------------------------- #
class PositionOut(BaseModel):
    id: int
    bot_id: int
    symbol: str
    qty: float
    entry_price: float
    entry_time: datetime
    stop: float
    initial_stop: float
    score_at_entry: float
    breakeven_locked: bool
    status: str
    last_price: float | None = None
    unrealized_pnl: float | None = None
    unrealized_pct: float | None = None
    rationale_id: int | None = None


class TradeOut(BaseModel):
    id: int
    bot_id: int
    symbol: str
    exit_price: float
    exit_time: datetime
    exit_reason: str
    pnl: float
    pnl_r: float
    fees: float
    slippage_bps: float
    mfe: float
    mae: float
    hold_hours: float


class OrderOut(BaseModel):
    id: int
    bot_id: int
    symbol: str
    type: str
    side: str
    qty: float
    filled_qty: float
    avg_fill_price: float | None
    status: str
    reject_reason: str | None
    fees: float
    slippage_bps: float
    created_at: datetime
    filled_at: datetime | None


# --------------------------------------------------------------------------- #
#  Strateji / backtest
# --------------------------------------------------------------------------- #
class StrategyOut(BaseModel):
    id: int
    name: str
    owner_id: int | None
    created_at: datetime
    versions: list[StrategyVersionOut] = []


class StrategyVersionOut(BaseModel):
    id: int
    strategy_id: int
    version: int
    definition: dict[str, Any]
    definition_hash: str
    frozen: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class StrategyCreate(BaseModel):
    name: str = Field(min_length=1, max_length=128)
    definition: dict[str, Any]


class StrategyVersionCreate(BaseModel):
    definition: dict[str, Any]


class BacktestCreate(BaseModel):
    strategy_version_id: int
    start: datetime
    end: datetime
    initial_equity: float = 5000.0
    symbols: list[str] = []
    use_holdout: bool = False
    with_patterns: bool = True


class BacktestOut(BaseModel):
    id: int
    strategy_version_id: int
    status: str
    error: str | None
    approximate_universe: bool
    params: dict[str, Any]
    started_at: datetime | None
    finished_at: datetime | None
    created_at: datetime


# --------------------------------------------------------------------------- #
#  Sohbet / bildirim / ayarlar
# --------------------------------------------------------------------------- #
class ChatRoomOut(BaseModel):
    id: int
    name: str
    kind: str
    members: list[int] = []
    unread: int = 0
    created_at: datetime


class ChatRoomCreate(BaseModel):
    name: str = Field(min_length=1, max_length=128)
    kind: str = "group"
    member_ids: list[int] = []


class ChatMessageOut(BaseModel):
    id: int
    room_id: int
    user_id: int | None
    body: str
    created_at: datetime
    edited_at: datetime | None = None

    model_config = {"from_attributes": True}


class ChatMessageCreate(BaseModel):
    body: str = Field(min_length=1, max_length=4000)


class NotificationOut(BaseModel):
    id: int
    kind: str
    level: str
    title: str
    body: str
    payload: dict[str, Any]
    read_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}


class DiscordConfigIn(BaseModel):
    enabled: bool = False
    webhooks: dict[str, str] = {}


class DiscordConfigOut(BaseModel):
    enabled: bool
    webhooks: dict[str, str]  # maskeli
    channels: list[str]


class SettingIn(BaseModel):
    value: dict[str, Any]


class KillSwitchRequest(BaseModel):
    code: str = Field(min_length=6, max_length=8, description="TOTP kodu — zorunlu")
    confirm: bool = False


class BlacklistIn(BaseModel):
    symbol: str
    reason: str = ""


StrategyOut.model_rebuild()
LoginResponse.model_rebuild()
