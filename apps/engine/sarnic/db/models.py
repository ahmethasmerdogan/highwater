"""Veri modeli — MASTER-SPEC §13.

Tüm zaman damgaları TIMESTAMPTZ. Tüm parasal/fiyat alanları NUMERIC (float değil):
kayan noktalı toplama hatası bir muhasebe sisteminde kabul edilemez.
"""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    BigInteger,
    Boolean,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from sarnic.core.enums import (
    BotMode,
    BotState,
    OrderSide,
    OrderStatus,
    OrderType,
    PositionStatus,
    Role,
)
from sarnic.db.base import Base, TimestampTZ

PRICE = Numeric(24, 10)
QTY = Numeric(28, 10)
MONEY = Numeric(20, 8)


# --------------------------------------------------------------------------- #
#  Kullanıcılar, oturumlar, denetim
# --------------------------------------------------------------------------- #
class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(Text)
    totp_secret: Mapped[str | None] = mapped_column(Text, default=None)
    totp_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    role: Mapped[Role] = mapped_column(String(16), default=Role.VIEWER)
    display_name: Mapped[str] = mapped_column(String(64), default="")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(TimestampTZ, server_default=func.now())
    last_login_at: Mapped[datetime | None] = mapped_column(TimestampTZ, default=None)


class Session(Base):
    __tablename__ = "sessions"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    token_hash: Mapped[str] = mapped_column(String(128), unique=True, index=True)
    expires_at: Mapped[datetime] = mapped_column(TimestampTZ)
    revoked_at: Mapped[datetime | None] = mapped_column(TimestampTZ, default=None)
    ip: Mapped[str] = mapped_column(String(64), default="")
    user_agent: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(TimestampTZ, server_default=func.now())


class AuditLog(Base):
    __tablename__ = "audit_log"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    action: Mapped[str] = mapped_column(String(64), index=True)
    target: Mapped[str] = mapped_column(String(128), default="")
    payload: Mapped[dict] = mapped_column(JSONB, default=dict)
    ip: Mapped[str] = mapped_column(String(64), default="")
    created_at: Mapped[datetime] = mapped_column(TimestampTZ, server_default=func.now(), index=True)


# --------------------------------------------------------------------------- #
#  Piyasa verisi
# --------------------------------------------------------------------------- #
class OHLCV(Base):
    """TimescaleDB hypertable — MASTER-SPEC §2.2."""

    __tablename__ = "ohlcv"

    symbol: Mapped[str] = mapped_column(String(32), primary_key=True)
    timeframe: Mapped[str] = mapped_column(String(8), primary_key=True)
    open_time: Mapped[datetime] = mapped_column(TimestampTZ, primary_key=True)
    open: Mapped[Decimal] = mapped_column(PRICE)
    high: Mapped[Decimal] = mapped_column(PRICE)
    low: Mapped[Decimal] = mapped_column(PRICE)
    close: Mapped[Decimal] = mapped_column(PRICE)
    volume: Mapped[Decimal] = mapped_column(QTY)
    quote_volume: Mapped[Decimal] = mapped_column(QTY)
    trades: Mapped[int] = mapped_column(Integer, default=0)
    taker_buy_base: Mapped[Decimal] = mapped_column(QTY, default=0)
    taker_buy_quote: Mapped[Decimal] = mapped_column(QTY, default=0)
    is_closed: Mapped[bool] = mapped_column(Boolean, default=True)

    __table_args__ = (Index("ix_ohlcv_symbol_tf_time", "symbol", "timeframe", "open_time"),)


class SymbolInfo(Base):
    """`exchangeInfo` önbelleği — 6 saatte bir tazelenir (§2.1)."""

    __tablename__ = "symbol_info"

    symbol: Mapped[str] = mapped_column(String(32), primary_key=True)
    base_asset: Mapped[str] = mapped_column(String(16))
    quote_asset: Mapped[str] = mapped_column(String(16))
    status: Mapped[str] = mapped_column(String(24))
    is_spot_allowed: Mapped[bool] = mapped_column(Boolean, default=True)
    tick_size: Mapped[Decimal] = mapped_column(PRICE, default=0)
    step_size: Mapped[Decimal] = mapped_column(QTY, default=0)
    min_notional: Mapped[Decimal] = mapped_column(MONEY, default=0)
    listed_at: Mapped[datetime | None] = mapped_column(TimestampTZ, default=None)
    delist_at: Mapped[datetime | None] = mapped_column(TimestampTZ, default=None)
    updated_at: Mapped[datetime] = mapped_column(TimestampTZ, server_default=func.now())


class DataQualityReport(Base):
    __tablename__ = "data_quality_reports"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    kind: Mapped[str] = mapped_column(String(32), index=True)  # gap | outlier | stale | sanity
    symbol: Mapped[str] = mapped_column(String(32), default="", index=True)
    timeframe: Mapped[str] = mapped_column(String(8), default="")
    severity: Mapped[str] = mapped_column(String(16), default="WARN")
    resolved: Mapped[bool] = mapped_column(Boolean, default=False)
    detail: Mapped[dict] = mapped_column(JSONB, default=dict)
    created_at: Mapped[datetime] = mapped_column(TimestampTZ, server_default=func.now(), index=True)

    #: Bulgunun **değişmeyen kimliği** — aynı bulgunun ikinci kez yazılmasını
    #: engeller (`SYSTEM-REVIEW` §4b). Kısmi benzersiz indeks yalnızca açık
    #: kayıtlarda geçerlidir: kapanmış bir boşluk tekrar oluşursa bu yeni bir
    #: olaydır ve yazılmalıdır; aykırı değer ise hiç kapanmadığı için sonsuza
    #: dek tekilleşir. Üretim kuralı `data.quality.finding_fingerprint`.
    fingerprint: Mapped[str] = mapped_column(Text, default="", server_default="")

    __table_args__ = (
        Index(
            "uq_quality_open",
            "symbol",
            "timeframe",
            "kind",
            "fingerprint",
            unique=True,
            postgresql_where=text("NOT resolved"),
        ),
    )


# --------------------------------------------------------------------------- #
#  Havuz
# --------------------------------------------------------------------------- #
class UniverseSnapshot(Base):
    """Bozulmaz kural 3 — §3.3. Bu satır yazılmadan havuz değişikliği geçerli değildir."""

    __tablename__ = "universe_snapshots"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    taken_at: Mapped[datetime] = mapped_column(TimestampTZ, index=True)
    reason: Mapped[str] = mapped_column(String(24))  # scheduled | delist | manual | stale
    config_hash: Mapped[str] = mapped_column(String(64), index=True)
    symbols: Mapped[list] = mapped_column(JSONB)
    funnel: Mapped[list] = mapped_column(JSONB)
    added: Mapped[list] = mapped_column(JSONB, default=list)
    removed: Mapped[list] = mapped_column(JSONB, default=list)


class Blacklist(Base):
    __tablename__ = "blacklist"

    symbol: Mapped[str] = mapped_column(String(32), primary_key=True)
    reason: Mapped[str] = mapped_column(Text, default="")
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(TimestampTZ, server_default=func.now())


class SpreadSample(Base):
    """SpreadFilter için 1 saatlik pencerede toplanan spread örnekleri (§3.2 filtre 7)."""

    __tablename__ = "spread_samples"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    symbol: Mapped[str] = mapped_column(String(32), index=True)
    spread_pct: Mapped[Decimal] = mapped_column(Numeric(12, 8))
    sampled_at: Mapped[datetime] = mapped_column(TimestampTZ, index=True)


# --------------------------------------------------------------------------- #
#  Özellikler
# --------------------------------------------------------------------------- #
class SRLevel(Base):
    __tablename__ = "sr_levels"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    symbol: Mapped[str] = mapped_column(String(32), index=True)
    timeframe: Mapped[str] = mapped_column(String(8))
    price: Mapped[Decimal] = mapped_column(PRICE)
    kind: Mapped[str] = mapped_column(String(16))  # support | resistance | poc | value_area
    strength: Mapped[float] = mapped_column(Numeric(6, 2))
    touches: Mapped[int] = mapped_column(Integer, default=0)
    computed_at: Mapped[datetime] = mapped_column(TimestampTZ, index=True)

    __table_args__ = (Index("ix_sr_symbol_tf_time", "symbol", "timeframe", "computed_at"),)


class Pattern(Base):
    __tablename__ = "patterns"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    symbol: Mapped[str] = mapped_column(String(32), index=True)
    timeframe: Mapped[str] = mapped_column(String(8))
    kind: Mapped[str] = mapped_column(String(32))
    direction: Mapped[int] = mapped_column(Integer)
    confidence: Mapped[float] = mapped_column(Numeric(6, 4))
    neckline: Mapped[Decimal | None] = mapped_column(PRICE, default=None)
    target: Mapped[Decimal | None] = mapped_column(PRICE, default=None)
    volume_confirmed: Mapped[bool] = mapped_column(Boolean, default=False)
    detected_at: Mapped[datetime] = mapped_column(TimestampTZ, index=True)


# --------------------------------------------------------------------------- #
#  Puanlama
# --------------------------------------------------------------------------- #
class Score(Base):
    __tablename__ = "scores"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    symbol: Mapped[str] = mapped_column(String(32), index=True)
    bar_time: Mapped[datetime] = mapped_column(TimestampTZ, index=True)
    timeframe: Mapped[str] = mapped_column(String(8), default="1h")
    score: Mapped[float] = mapped_column(Numeric(6, 2))
    families: Mapped[dict] = mapped_column(JSONB)
    modifiers: Mapped[dict] = mapped_column(JSONB)
    rationale: Mapped[dict] = mapped_column(JSONB)
    config_hash: Mapped[str] = mapped_column(String(64), index=True)

    __table_args__ = (
        UniqueConstraint("symbol", "bar_time", "timeframe", "config_hash", name="uq_score_bar"),
        Index("ix_scores_bartime_score", "bar_time", "score"),
    )


class ScoreObservation(Base):
    """Kalibrasyon — sistemin dürüstlük organı (§5.5)."""

    __tablename__ = "score_observations"

    score_id: Mapped[int] = mapped_column(
        ForeignKey("scores.id", ondelete="CASCADE"), primary_key=True
    )
    symbol: Mapped[str] = mapped_column(String(32), index=True)
    bar_time: Mapped[datetime] = mapped_column(TimestampTZ, index=True)
    score: Mapped[float] = mapped_column(Numeric(6, 2))
    families: Mapped[dict] = mapped_column(JSONB, default=dict)
    fwd_return_4h: Mapped[float | None] = mapped_column(Numeric(14, 8), default=None)
    fwd_return_24h: Mapped[float | None] = mapped_column(Numeric(14, 8), default=None)
    fwd_return_72h: Mapped[float | None] = mapped_column(Numeric(14, 8), default=None)
    updated_at: Mapped[datetime] = mapped_column(TimestampTZ, server_default=func.now())


# --------------------------------------------------------------------------- #
#  Strateji
# --------------------------------------------------------------------------- #
class Strategy(Base):
    __tablename__ = "strategies"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(128))
    owner_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(TimestampTZ, server_default=func.now())

    versions: Mapped[list[StrategyVersion]] = relationship(
        back_populates="strategy", cascade="all, delete-orphan", lazy="selectin"
    )


class StrategyVersion(Base):
    __tablename__ = "strategy_versions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    strategy_id: Mapped[int] = mapped_column(
        ForeignKey("strategies.id", ondelete="CASCADE"), index=True
    )
    version: Mapped[int] = mapped_column(Integer)
    definition: Mapped[dict] = mapped_column(JSONB)
    definition_hash: Mapped[str] = mapped_column(String(64), index=True)
    frozen: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(TimestampTZ, server_default=func.now())

    strategy: Mapped[Strategy] = relationship(back_populates="versions")

    __table_args__ = (UniqueConstraint("strategy_id", "version", name="uq_strategy_version"),)


# --------------------------------------------------------------------------- #
#  Botlar
# --------------------------------------------------------------------------- #
class Bot(Base):
    __tablename__ = "bots"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(128))
    owner_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    strategy_version_id: Mapped[int] = mapped_column(
        ForeignKey("strategy_versions.id", ondelete="RESTRICT")
    )
    mode: Mapped[BotMode] = mapped_column(String(8), default=BotMode.PAPER)
    state: Mapped[BotState] = mapped_column(String(16), default=BotState.DRAFT, index=True)
    timeframe: Mapped[str] = mapped_column(String(8), default="1h")
    capital: Mapped[Decimal] = mapped_column(MONEY, default=Decimal("5000"))
    cash: Mapped[Decimal] = mapped_column(MONEY, default=Decimal("5000"))
    equity_peak: Mapped[Decimal] = mapped_column(MONEY, default=Decimal("5000"))
    config: Mapped[dict] = mapped_column(JSONB, default=dict)
    last_heartbeat_at: Mapped[datetime | None] = mapped_column(TimestampTZ, default=None)
    entries_blocked_until: Mapped[datetime | None] = mapped_column(TimestampTZ, default=None)
    halt_reason: Mapped[str | None] = mapped_column(String(64), default=None)
    created_at: Mapped[datetime] = mapped_column(TimestampTZ, server_default=func.now())

    strategy_version: Mapped[StrategyVersion] = relationship(lazy="selectin")


class BotEvent(Base):
    __tablename__ = "bot_events"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    bot_id: Mapped[int] = mapped_column(ForeignKey("bots.id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(String(48), index=True)
    level: Mapped[str] = mapped_column(String(16), default="INFO")
    payload: Mapped[dict] = mapped_column(JSONB, default=dict)
    created_at: Mapped[datetime] = mapped_column(TimestampTZ, server_default=func.now(), index=True)


class EquityPoint(Base):
    """Özsermaye eğrisi — panelin ana grafiği ve drawdown devre kesicisinin kaynağı."""

    __tablename__ = "equity_points"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    bot_id: Mapped[int] = mapped_column(ForeignKey("bots.id", ondelete="CASCADE"), index=True)
    at: Mapped[datetime] = mapped_column(TimestampTZ, index=True)
    equity: Mapped[Decimal] = mapped_column(MONEY)
    cash: Mapped[Decimal] = mapped_column(MONEY)
    exposure: Mapped[Decimal] = mapped_column(MONEY, default=0)
    open_positions: Mapped[int] = mapped_column(Integer, default=0)

    __table_args__ = (
        # Bir bot, bir an için **tek** özsermaye noktasına sahiptir. Kısıt
        # yokken bot yeniden başladığında aynı bar tekrar işleniyor ve nokta
        # ikinci, üçüncü kez yazılıyordu. Panel eğrileri topladığı için
        # 15.000'lik özsermaye o anda 45.000 görünüyordu — ölçümün temeli olan
        # grafik, olmayan bir kâr gösteriyordu.
        UniqueConstraint("bot_id", "at", name="uq_equity_point"),
    )


# --------------------------------------------------------------------------- #
#  İşlemler
# --------------------------------------------------------------------------- #
class Position(Base):
    __tablename__ = "positions"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    bot_id: Mapped[int] = mapped_column(ForeignKey("bots.id", ondelete="CASCADE"), index=True)
    symbol: Mapped[str] = mapped_column(String(32), index=True)
    side: Mapped[OrderSide] = mapped_column(String(8), default=OrderSide.BUY)
    qty: Mapped[Decimal] = mapped_column(QTY)
    entry_price: Mapped[Decimal] = mapped_column(PRICE)
    entry_time: Mapped[datetime] = mapped_column(TimestampTZ, index=True)
    stop: Mapped[Decimal] = mapped_column(PRICE)
    initial_stop: Mapped[Decimal] = mapped_column(PRICE)
    target: Mapped[Decimal | None] = mapped_column(PRICE, default=None)
    score_at_entry: Mapped[float] = mapped_column(Numeric(6, 2), default=0)
    rationale_id: Mapped[int | None] = mapped_column(
        ForeignKey("scores.id", ondelete="SET NULL"), default=None
    )
    breakeven_locked: Mapped[bool] = mapped_column(Boolean, default=False)
    mfe: Mapped[Decimal] = mapped_column(Numeric(14, 8), default=0)
    mae: Mapped[Decimal] = mapped_column(Numeric(14, 8), default=0)
    entry_fees: Mapped[Decimal] = mapped_column(MONEY, default=0)

    #: Kısmi çıkışlardan gerçekleşen net kâr/zarar ve ödenen çıkış komisyonu.
    #:
    #: Çıkış emri defteri tüketip **kısmi** dolabilir. Pozisyon o zaman
    #: kapanmaz; kalan miktarla açık kalır ve satılan dilimin sonucu burada
    #: birikir. Bu alanlar olmadan kapanış işlemi yalnızca son dilimi
    #: raporlar, daha öncesinde gerçekleşen kâr/zarar hiçbir yerde görünmez.
    realized_pnl: Mapped[Decimal] = mapped_column(MONEY, default=0, server_default="0")
    realized_fees: Mapped[Decimal] = mapped_column(MONEY, default=0, server_default="0")
    status: Mapped[PositionStatus] = mapped_column(
        String(12), default=PositionStatus.OPEN, index=True
    )


class Trade(Base):
    __tablename__ = "trades"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    position_id: Mapped[int] = mapped_column(
        ForeignKey("positions.id", ondelete="CASCADE"), index=True
    )
    bot_id: Mapped[int] = mapped_column(ForeignKey("bots.id", ondelete="CASCADE"), index=True)
    symbol: Mapped[str] = mapped_column(String(32), index=True)
    exit_price: Mapped[Decimal] = mapped_column(PRICE)
    exit_time: Mapped[datetime] = mapped_column(TimestampTZ, index=True)
    exit_reason: Mapped[str] = mapped_column(String(24), index=True)
    pnl: Mapped[Decimal] = mapped_column(MONEY)
    pnl_r: Mapped[float] = mapped_column(Numeric(12, 6), default=0)
    fees: Mapped[Decimal] = mapped_column(MONEY, default=0)
    slippage_bps: Mapped[float] = mapped_column(Numeric(12, 4), default=0)
    mfe: Mapped[Decimal] = mapped_column(Numeric(14, 8), default=0)
    mae: Mapped[Decimal] = mapped_column(Numeric(14, 8), default=0)
    hold_hours: Mapped[float] = mapped_column(Numeric(12, 4), default=0)

    #: İşlemi üreten strateji sürümü.
    #:
    #: Sürümlemenin amacı "her işlemin hangi tam konfigürasyonla açıldığının
    #: bilinmesi"dir; bu alan olmadan o bağ kopuktu. İki somut sonucu var:
    #: performans sürüm bazında ölçülebiliyor, ve ardışık zarar sayacı sürüm
    #: sınırında duruyor — aksi hâlde eski kuralların kayıpları yeni kuralı
    #: cezalandırıyordu (bot 3, 2026-08-18: dar stop ayarının 9 kaybı yüzünden
    #: yeni ayar daha ilk barda 6 saat duraklatıldı).
    strategy_version_id: Mapped[int | None] = mapped_column(
        ForeignKey("strategy_versions.id", ondelete="SET NULL"), nullable=True, index=True
    )


class Order(Base):
    __tablename__ = "orders"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    bot_id: Mapped[int] = mapped_column(ForeignKey("bots.id", ondelete="CASCADE"), index=True)
    position_id: Mapped[int | None] = mapped_column(
        ForeignKey("positions.id", ondelete="SET NULL"), default=None
    )
    symbol: Mapped[str] = mapped_column(String(32), index=True)
    type: Mapped[OrderType] = mapped_column(String(24))
    side: Mapped[OrderSide] = mapped_column(String(8))
    qty: Mapped[Decimal] = mapped_column(QTY)
    price: Mapped[Decimal | None] = mapped_column(PRICE, default=None)
    filled_qty: Mapped[Decimal] = mapped_column(QTY, default=0)
    avg_fill_price: Mapped[Decimal | None] = mapped_column(PRICE, default=None)
    status: Mapped[OrderStatus] = mapped_column(String(20), default=OrderStatus.NEW, index=True)
    reject_reason: Mapped[str | None] = mapped_column(Text, default=None)
    exchange_order_id: Mapped[str | None] = mapped_column(String(64), default=None)
    fees: Mapped[Decimal] = mapped_column(MONEY, default=0)
    slippage_bps: Mapped[float] = mapped_column(Numeric(12, 4), default=0)
    created_at: Mapped[datetime] = mapped_column(TimestampTZ, index=True)
    filled_at: Mapped[datetime | None] = mapped_column(TimestampTZ, default=None)


class CorrelationCluster(Base):
    """Haftalık hiyerarşik kümeleme çıktısı (§6.3)."""

    __tablename__ = "correlation_clusters"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    computed_at: Mapped[datetime] = mapped_column(TimestampTZ, index=True)
    threshold: Mapped[float] = mapped_column(Numeric(6, 4), default=0.75)
    assignments: Mapped[dict] = mapped_column(JSONB)  # {symbol: cluster_id}


# --------------------------------------------------------------------------- #
#  Backtest
# --------------------------------------------------------------------------- #
class Backtest(Base):
    __tablename__ = "backtests"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    strategy_version_id: Mapped[int] = mapped_column(
        ForeignKey("strategy_versions.id", ondelete="CASCADE")
    )
    owner_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    params: Mapped[dict] = mapped_column(JSONB, default=dict)
    status: Mapped[str] = mapped_column(String(16), default="QUEUED", index=True)
    error: Mapped[str | None] = mapped_column(Text, default=None)
    approximate_universe: Mapped[bool] = mapped_column(Boolean, default=False)
    started_at: Mapped[datetime | None] = mapped_column(TimestampTZ, default=None)
    finished_at: Mapped[datetime | None] = mapped_column(TimestampTZ, default=None)
    created_at: Mapped[datetime] = mapped_column(TimestampTZ, server_default=func.now())


class BacktestResult(Base):
    __tablename__ = "backtest_results"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    backtest_id: Mapped[int] = mapped_column(
        ForeignKey("backtests.id", ondelete="CASCADE"), index=True
    )
    cost_scenario: Mapped[str] = mapped_column(String(16))  # base | 1.5x | 2x
    metrics: Mapped[dict] = mapped_column(JSONB)
    equity_curve: Mapped[list] = mapped_column(JSONB)
    trades: Mapped[list] = mapped_column(JSONB)
    benchmarks: Mapped[dict] = mapped_column(JSONB)
    flags: Mapped[list] = mapped_column(JSONB, default=list)  # aşırı uydurma kırmızı bayrakları


# --------------------------------------------------------------------------- #
#  Bildirim, sohbet, ayarlar
# --------------------------------------------------------------------------- #
class Notification(Base):
    __tablename__ = "notifications"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    kind: Mapped[str] = mapped_column(String(48), index=True)
    level: Mapped[str] = mapped_column(String(16), default="INFO")
    title: Mapped[str] = mapped_column(String(200))
    body: Mapped[str] = mapped_column(Text, default="")
    payload: Mapped[dict] = mapped_column(JSONB, default=dict)
    read_at: Mapped[datetime | None] = mapped_column(TimestampTZ, default=None)
    created_at: Mapped[datetime] = mapped_column(TimestampTZ, server_default=func.now(), index=True)


class ChatRoom(Base):
    __tablename__ = "chat_rooms"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(128))
    kind: Mapped[str] = mapped_column(String(16), default="group")  # group | direct
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(TimestampTZ, server_default=func.now())


class ChatMember(Base):
    __tablename__ = "chat_members"

    room_id: Mapped[int] = mapped_column(
        ForeignKey("chat_rooms.id", ondelete="CASCADE"), primary_key=True
    )
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    joined_at: Mapped[datetime] = mapped_column(TimestampTZ, server_default=func.now())
    last_read_at: Mapped[datetime | None] = mapped_column(TimestampTZ, default=None)


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    room_id: Mapped[int] = mapped_column(
        ForeignKey("chat_rooms.id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    body: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(TimestampTZ, server_default=func.now(), index=True)
    edited_at: Mapped[datetime | None] = mapped_column(TimestampTZ, default=None)


class Integration(Base):
    __tablename__ = "integrations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    kind: Mapped[str] = mapped_column(String(32), unique=True)  # discord
    config_encrypted: Mapped[str] = mapped_column(Text, default="")
    enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    updated_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    updated_at: Mapped[datetime] = mapped_column(TimestampTZ, server_default=func.now())


class Setting(Base):
    __tablename__ = "settings"

    key: Mapped[str] = mapped_column(String(128), primary_key=True)
    value: Mapped[dict] = mapped_column(JSONB)
    updated_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    updated_at: Mapped[datetime] = mapped_column(TimestampTZ, server_default=func.now())
