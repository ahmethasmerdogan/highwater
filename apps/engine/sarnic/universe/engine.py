"""UniverseEngine — MASTER-SPEC §3.

Bozulmaz kural 3: **her yenilemede `universe_snapshots` yazılır.** Snapshot
yazılmadan havuz değişikliği geçerli sayılmaz; gelecekteki her dürüst backtest
buna dayanır (§3.4 — survivorship bias tek panzehri).
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

import numpy as np
import pandas as pd
import redis.asyncio as aioredis
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from sarnic.core.clock import utcnow
from sarnic.core.enums import EventKind, PositionStatus
from sarnic.core.events import EventBus, get_event_bus
from sarnic.core.logging import get_logger
from sarnic.core.observability import UNIVERSE_SIZE
from sarnic.core.settings_store import load_group
from sarnic.data.marketdata import read_tickers
from sarnic.data.store import load_frames
from sarnic.db.models import Blacklist, Position, SpreadSample, SymbolInfo, UniverseSnapshot
from sarnic.universe.filters import (
    Candidate,
    FunnelStep,
    UniverseConfig,
    apply_hysteresis,
    run_chain,
)

log = get_logger(__name__)

# Yıllıklandırma: 1 gün = 1 bar, 365 gün.
ANNUALIZATION_DAYS = 365


class UniverseInputUnavailable(RuntimeError):
    """Piyasa verisi okunamadığı için havuz yenilenemedi.

    Ticker önbelleği boşken zincirin girdisi de boştur ve sonuç kaçınılmaz olarak
    boş bir havuz olur. Bu bir **piyasa gözlemi değil, bir veri kesintisidir**:
    snapshot yazmak canlı havuzu siler ve o ana ait point-in-time kaydı yalanlar
    (bozulmaz kural 3). Yenileme yazmadan iptal edilir, çağıran yeniden dener.
    """


@dataclass(slots=True)
class UniverseResult:
    symbols: list[str]
    candidates: list[Candidate]
    funnel: list[dict]
    added: list[str]
    removed: list[str]
    config_hash: str
    taken_at: datetime
    reason: str
    snapshot_id: int | None = None


def annualized_volatility(closes: pd.Series, window: int = 14) -> float | None:
    """14 günlük yıllıklandırılmış volatilite, yüzde olarak (§3.2 filtre 9)."""
    if len(closes) < window + 1:
        return None
    rets = np.log(closes / closes.shift(1)).dropna().tail(window)
    if len(rets) < window or rets.std() == 0:
        return None
    value = float(rets.std(ddof=1) * math.sqrt(ANNUALIZATION_DAYS) * 100)
    return value if math.isfinite(value) else None


def range_stability_pct(df: pd.DataFrame, days: int = 3) -> float | None:
    """3 günlük (high−low)/low, yüzde (§3.2 filtre 10)."""
    if len(df) < days:
        return None
    tail = df.tail(days)
    high = float(tail["high"].max())
    low = float(tail["low"].min())
    if low <= 0:
        return None
    return (high - low) / low * 100


class UniverseEngine:
    def __init__(
        self,
        config: UniverseConfig | None = None,
        bus: EventBus | None = None,
    ) -> None:
        # `base_config` kodun varsayılanıdır; `config` her yenilemede DB'deki
        # ayarlarla tazelenir. İkisini ayırmak şart: aynı nesne üzerine üst üste
        # merge etmek, kaldırılan bir ayarın kalıcı olarak yapışmasına yol açardı.
        self.base_config = config or UniverseConfig()
        self.config = self.base_config
        self.bus = bus or get_event_bus()
        #: Ölçüm filtresinden düşen mevcut üyeler için tur sayacı.
        #:
        #: Havuz sınırında gezinen bir sembol her yenilemede taraf değiştirip
        #: yeni bir snapshot üretiyordu — BABYUSDT 25 dakikada beş kez, günde
        #: 31–68 snapshot. Sayaç süreçle yaşar; yeniden başlatmada sıfırlanır
        #: ve en kötü ihtimalle bir fazladan salınım olur.
        self._soft_misses: dict[str, int] = {}

    # ------------------------------------------------------------------ #
    async def build_candidates(
        self,
        session: AsyncSession,
        redis: aioredis.Redis,
        *,
        as_of: datetime | None = None,
    ) -> list[Candidate]:
        """Canlı ticker + DB metadata + OHLCV'den aday listesi kurar."""
        now = as_of or utcnow()
        tickers = await read_tickers(redis)
        if not tickers:
            log.warning("universe_no_tickers")
            return []

        infos = {row.symbol: row for row in (await session.execute(select(SymbolInfo))).scalars()}

        # Spread ortalamaları — son 1 saatin örnekleri (§3.2 filtre 7).
        since = now - timedelta(hours=1)
        spread_rows = (
            await session.execute(
                select(
                    SpreadSample.symbol,
                    func.avg(SpreadSample.spread_pct),
                    func.count(SpreadSample.id),
                )
                .where(SpreadSample.sampled_at >= since)
                .group_by(SpreadSample.symbol)
            )
        ).all()
        spreads = {s: (float(avg), int(n)) for s, avg, n in spread_rows}

        # Ön eleme: hacme göre ilk N×2 sembol için OHLCV yükle (100 sembol için
        # tüm borsanın günlük verisini çekmek gereksiz).
        prelim = sorted(
            (
                (sym, float(t["quote_volume"]))
                for sym, t in tickers.items()
                if sym.endswith(self.config.quote_asset)
            ),
            key=lambda x: -x[1],
        )[: self.config.volume_prefilter_n * 2]
        prelim_symbols = [s for s, _ in prelim]

        frames = await load_frames(session, prelim_symbols, "1d", end=now, limit=40)

        candidates: list[Candidate] = []
        for symbol in prelim_symbols:
            t = tickers[symbol]
            info = infos.get(symbol)
            df = frames.get(symbol, pd.DataFrame())

            age_days = 9999.0
            if info is not None and info.listed_at is not None:
                age_days = (now - info.listed_at).total_seconds() / 86400
            elif not df.empty:
                age_days = (now - df["open_time"].iloc[0].to_pydatetime()).total_seconds() / 86400

            vol = annualized_volatility(df["close"]) if not df.empty else None
            rng = range_stability_pct(df) if not df.empty else None
            spread, samples = spreads.get(symbol, (None, 0))

            candidates.append(
                Candidate(
                    symbol=symbol,
                    base_asset=info.base_asset if info else symbol[: -len(self.config.quote_asset)],
                    quote_asset=info.quote_asset if info else self.config.quote_asset,
                    status=info.status if info else "TRADING",
                    is_spot_allowed=info.is_spot_allowed if info else True,
                    price=float(t["last_price"]),
                    quote_volume=float(t["quote_volume"]),
                    age_days=age_days,
                    spread_pct=spread,
                    spread_samples=samples,
                    tick_size=float(info.tick_size) if info else 0.0,
                    volatility_ann_pct=vol,
                    range_3d_pct=rng,
                    delist_announced=bool(
                        info is not None and info.delist_at is not None and info.delist_at <= now
                    ),
                )
            )
        return candidates

    # ------------------------------------------------------------------ #
    async def refresh(
        self,
        session: AsyncSession,
        redis: aioredis.Redis,
        *,
        reason: str = "scheduled",
        as_of: datetime | None = None,
        publish: bool = True,
        skip_if_unchanged: bool = False,
    ) -> UniverseResult:
        """Havuzu yeniler ve **snapshot'ı yazar**. Snapshot yazılmazsa yenileme geçersizdir.

        `skip_if_unchanged` yalnızca **otomatik yeniden deneme** yolunda kullanılır:
        havuz hedefin altındayken girdiler olgunlaşana kadar sık sık denenir ve
        sonuç çoğu turda bir öncekiyle birebir aynı çıkar. Aynı listeyi tekrar
        yazmak kaydı büyütür, bilgi eklemez. Planlı ve elle yenilemeler bu bayrağı
        **kullanmaz** — onlar her zaman yazar (bozulmaz kural 3).
        """
        now = as_of or utcnow()

        # Panelden değiştirilen filtre eşikleri burada devreye girer. Yenilemenin
        # başında bir kez okunur: koşu ortasında eşik değişirse huni raporu ile
        # sonuç birbirini tutmazdı.
        overrides = await load_group(session, "universe")
        self.config = self.base_config.merged(overrides)
        if overrides:
            log.info("universe_config_overridden", keys=sorted(overrides))

        blacklist = {row for row in (await session.execute(select(Blacklist.symbol))).scalars()}
        last = await self.latest_snapshot(session)
        previous = {s["symbol"] for s in last.symbols} if last else set()
        protected = {
            row
            for row in (
                await session.execute(
                    select(Position.symbol).where(Position.status == PositionStatus.OPEN)
                )
            ).scalars()
        }

        candidates = await self.build_candidates(session, redis, as_of=now)
        if not candidates:
            raise UniverseInputUnavailable(
                "Ticker önbelleği boş — piyasa verisi servisi henüz veri yazmadı. "
                "Havuz yenilenmedi, snapshot yazılmadı."
            )
        result = run_chain(candidates, self.config, blacklist)
        final = apply_hysteresis(
            result.selected,
            result.ranked,
            previous,
            self.config,
            protected,
            funnel=result.funnel,
            soft_misses=self._soft_misses,
        )

        symbols = [c.symbol for c in final]
        current = set(symbols)
        added = sorted(current - previous)
        removed = sorted(previous - current)

        # Huninin son adımı "kaldı N" derken metrik N+15 diyordu: histerezis,
        # koruma ve yer tutucular zincir DIŞINDA ekleniyor ve panel bu farkı
        # açıklayamıyordu. Fark sıfır değilse huniye açık bir adım yaz.
        korunan = len(final) - len(result.selected)
        if korunan != 0 and result.funnel:
            son = result.funnel[-1]
            result.funnel.append(
                FunnelStep(
                    index=son.index + 1,
                    name="KorumaVeHisterezis",
                    kept=len(final),
                    dropped=-korunan,
                )
            )

        if (
            skip_if_unchanged
            and last is not None
            and not added
            and not removed
            and last.config_hash == self.config.hash()
        ):
            log.info("universe_unchanged", reason=reason, size=len(symbols))
            return UniverseResult(
                symbols=symbols,
                candidates=final,
                funnel=[s.as_dict() for s in result.funnel],
                added=[],
                removed=[],
                config_hash=self.config.hash(),
                taken_at=now,
                reason=reason,
                snapshot_id=None,
            )

        snapshot = UniverseSnapshot(
            taken_at=now,
            reason=reason,
            config_hash=self.config.hash(),
            symbols=[
                {
                    "symbol": c.symbol,
                    "rank": c.rank,
                    "quote_volume": c.quote_volume,
                    "price": c.price,
                    "spread_pct": c.spread_pct,
                    "age_days": round(c.age_days, 2),
                    "volatility_ann_pct": c.volatility_ann_pct,
                    "range_3d_pct": c.range_3d_pct,
                    "protected": c.symbol in protected,
                    "placeholder": c.placeholder,
                }
                for c in final
            ],
            funnel=[step.as_dict() for step in result.funnel],
            added=added,
            removed=removed,
        )
        session.add(snapshot)
        await session.flush()  # snapshot.id lazım

        UNIVERSE_SIZE.set(len(symbols))
        log.info(
            "universe_refreshed",
            reason=reason,
            size=len(symbols),
            added=len(added),
            removed=len(removed),
            config_hash=self.config.hash(),
        )

        if publish:
            await self.bus.emit(
                EventKind.POOL_UPDATED,
                reason=reason,
                size=len(symbols),
                added=added,
                removed=removed,
                snapshot_id=snapshot.id,
            )

        return UniverseResult(
            symbols=symbols,
            candidates=final,
            funnel=[s.as_dict() for s in result.funnel],
            added=added,
            removed=removed,
            config_hash=self.config.hash(),
            taken_at=now,
            reason=reason,
            snapshot_id=snapshot.id,
        )

    # ------------------------------------------------------------------ #
    async def latest_snapshot(
        self, session: AsyncSession, *, at: datetime | None = None
    ) -> UniverseSnapshot | None:
        """Point-in-time okuma — backtest motorunun havuz kaynağı (§11)."""
        stmt = select(UniverseSnapshot).order_by(UniverseSnapshot.taken_at.desc()).limit(1)
        if at is not None:
            stmt = (
                select(UniverseSnapshot)
                .where(UniverseSnapshot.taken_at <= at)
                .order_by(UniverseSnapshot.taken_at.desc())
                .limit(1)
            )
        return (await session.execute(stmt)).scalar_one_or_none()

    async def current_symbols(
        self, session: AsyncSession, *, at: datetime | None = None
    ) -> list[str]:
        snap = await self.latest_snapshot(session, at=at)
        if snap is None:
            return []
        return [s["symbol"] for s in snap.symbols]

    async def is_due(self, session: AsyncSession, *, now: datetime | None = None) -> bool:
        """Planlı yenileme: her gün 00:05 UTC (§3.3)."""
        now = now or utcnow()
        snap = await self.latest_snapshot(session)
        if snap is None:
            return True
        scheduled = now.replace(hour=0, minute=5, second=0, microsecond=0)
        if now < scheduled:
            scheduled -= timedelta(days=1)
        return snap.taken_at < scheduled

    async def mark_delisted(
        self, session: AsyncSession, symbol: str, delist_at: datetime | None = None
    ) -> None:
        """Delist duyurusu → acil yenileme tetikler."""
        from sqlalchemy import update

        await session.execute(
            update(SymbolInfo)
            .where(SymbolInfo.symbol == symbol)
            .values(delist_at=delist_at or datetime.now(UTC))
        )
