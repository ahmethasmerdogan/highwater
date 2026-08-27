"""Olay güdümlü backtest motoru — MASTER-SPEC §11.

**Aynı kod yolu.** `FeatureEngine`, `ScoringEngine`, `SizingEngine`, `RiskEngine`
ve çıkış kuralları birebir aynıdır; değişen yalnızca veri kaynağı (geçmiş) ve
saat (`VirtualClock`) ile emir yürütücüsüdür.

Bar-bar ilerler. **Vektörel kısayol yok** — look-ahead'ın en sık girdiği kapı odur.

Havuz `universe_snapshots` tablosundan point-in-time okunur. Snapshot birikmemiş
dönemler için arşiv verisinden yeniden kurulur ve rapor **"YAKLAŞIK EVREN"**
damgası taşır.
"""

from __future__ import annotations

import math
from bisect import bisect_right
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta

import numpy as np
import pandas as pd
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from sarnic.backtest.benchmarks import BenchmarkResult, build_benchmarks, strategy_percentile
from sarnic.backtest.metrics import Metrics, compute_metrics, red_flags, regime_split
from sarnic.core.clock import VirtualClock
from sarnic.core.enums import TIMEFRAME_MINUTES, ExitReason
from sarnic.core.logging import get_logger
from sarnic.data.store import load_frames
from sarnic.db.models import UniverseSnapshot
from sarnic.execution.accounting import net_pnl, total_fees
from sarnic.execution.exits import MarketView, PositionView, evaluate_exit, rotation_candidate
from sarnic.features.indicators import ema, realized_vol
from sarnic.features.pipeline import (
    BARS_NEEDED,
    build_bundle_precomputed,
    precompute_indicators,
    timeframes_for,
)
from sarnic.features.sr import stop_from_sr
from sarnic.risk.engine import RiskEngine, RiskState
from sarnic.scoring.engine import ScoringEngine
from sarnic.sizing.clusters import cluster_exposure, cluster_symbols, returns_matrix
from sarnic.sizing.engine import SizingEngine, SizingInput
from sarnic.strategy.definition import StrategyDefinition

log = get_logger(__name__)

# §11 maliyet senaryoları — üçü birden raporlanır.
COST_SCENARIOS: tuple[tuple[str, float], ...] = (("base", 1.0), ("1.5x", 1.5), ("2x", 2.0))

# Taban maliyet: taker %0.1 + 5 bps kayma = 15 bps tek yön.
BASE_COST_BPS = 15.0


@dataclass(slots=True)
class BacktestParams:
    start: datetime
    end: datetime
    initial_equity: float = 5000.0
    symbols: list[str] = field(default_factory=list)
    warmup_bars: int = 400
    with_patterns: bool = True
    # Verinin son %30'u kilitli out-of-sample (§11 doğrulama).
    holdout_fraction: float = 0.30
    use_holdout: bool = False

    def __post_init__(self) -> None:
        """Saat dilimsiz tarihleri UTC kabul eder.

        OHLCV çerçevesinin `open_time` sütunu **her zaman** UTC farkındadır
        (`store._coerce`). Panelden gelen `<input type="date">` değeri ise
        `2026-01-01` gibi saat dilimsiz bir damgaya çözülür; ikisini
        karşılaştırmak pandas'ta `Invalid comparison between
        dtype=datetime64[us, UTC] and datetime` hatası veriyor ve koşu daha ilk
        bar seçiminde `FAILED` oluyordu.

        Dönüşüm burada yapılır, çağıranların her birinde değil: motor tek
        giriş kapısıdır ve API, CLI, testler aynı kapıdan geçer.
        """
        if self.start.tzinfo is None:
            self.start = self.start.replace(tzinfo=UTC)
        if self.end.tzinfo is None:
            self.end = self.end.replace(tzinfo=UTC)


@dataclass(slots=True)
class SimPosition:
    symbol: str
    qty: float
    entry_price: float
    entry_time: datetime
    stop: float
    initial_stop: float
    score_at_entry: float
    breakeven_locked: bool = False
    mfe: float = 0.0
    mae: float = 0.0
    entry_fees: float = 0.0

    def view(self) -> PositionView:
        return PositionView(
            symbol=self.symbol,
            qty=self.qty,
            entry_price=self.entry_price,
            entry_time=self.entry_time,
            stop=self.stop,
            initial_stop=self.initial_stop,
            breakeven_locked=self.breakeven_locked,
        )


@dataclass(slots=True)
class ScenarioResult:
    cost_scenario: str
    metrics: Metrics
    equity_curve: list[tuple[datetime, float]]
    trades: list[dict]
    benchmarks: list[BenchmarkResult]
    flags: list[dict]
    random_percentile: float = float("nan")

    def as_dict(self) -> dict:
        return {
            "cost_scenario": self.cost_scenario,
            "metrics": self.metrics.as_dict(),
            "equity_curve": [[t.isoformat(), round(e, 6)] for t, e in self.equity_curve],
            "trades": self.trades,
            "benchmarks": [b.as_dict() for b in self.benchmarks],
            "flags": self.flags,
            "random_percentile": (
                None
                if not math.isfinite(self.random_percentile)
                else round(self.random_percentile, 2)
            ),
        }


@dataclass(slots=True)
class BacktestReport:
    definition_hash: str
    params: dict
    scenarios: list[ScenarioResult]
    approximate_universe: bool
    universe_note: str
    walk_forward: list[dict] = field(default_factory=list)

    def as_dict(self) -> dict:
        return {
            "definition_hash": self.definition_hash,
            "params": self.params,
            "approximate_universe": self.approximate_universe,
            "universe_note": self.universe_note,
            "scenarios": [s.as_dict() for s in self.scenarios],
            "walk_forward": self.walk_forward,
        }


# --------------------------------------------------------------------------- #
#  Point-in-time havuz
# --------------------------------------------------------------------------- #
class UniverseTimeline:
    """Snapshot'lardan point-in-time havuz. Yoksa yaklaşık evren kurar."""

    def __init__(self, snapshots: list[UniverseSnapshot], fallback: list[str]) -> None:
        ordered = sorted(snapshots, key=lambda s: s.taken_at)
        self.snapshots = ordered
        self.fallback = fallback
        self.approximate = not snapshots

        # Sembol listeleri **bir kez** çıkarılır ve zaman damgaları ikili
        # aramaya hazır ayrı bir diziye alınır. Eskiden `at()` her bar için
        # tüm snapshot'ları baştan tarıyor ve eşleşen HER snapshot'ın sembol
        # listesini yeniden kuruyordu — yalnızca sonuncusu kullanıldığı hâlde.
        # 2.880 barlık bir koşuda 221 snapshot ile bu, yüz milyonlarca gereksiz
        # sözlük okuması demekti ve snapshot arşivi her gün büyüyor.
        self._times = [s.taken_at for s in ordered]
        self._symbols = [[entry["symbol"] for entry in s.symbols] for s in ordered]

    def at(self, moment: datetime) -> list[str]:
        """`moment` anında geçerli havuz.

        Dönen liste **paylaşılır** (`fallback` gibi); çağıran değiştirmez.
        Motor yalnızca üzerinde dolaşıyor.
        """
        # `moment`'ten sonraki ilk snapshot'ın indeksi; bir öncesi geçerlidir.
        index = bisect_right(self._times, moment)
        if index == 0:
            self.approximate = True
            return self.fallback
        return self._symbols[index - 1]

    def note(self) -> str:
        if self.approximate:
            return (
                "YAKLAŞIK EVREN — bu dönem için `universe_snapshots` kaydı yok. "
                "Havuz arşiv verisinden yeniden kuruldu; hayatta kalma yanlılığı "
                "tamamen elenmiş değildir."
            )
        return "Havuz point-in-time snapshot'lardan okundu."


# --------------------------------------------------------------------------- #
class BacktestEngine:
    def __init__(self, definition: StrategyDefinition, params: BacktestParams) -> None:
        self.definition = definition.require_valid()
        self.params = params
        self.timeframe = definition.timeframe
        self.step = TIMEFRAME_MINUTES[self.timeframe]

    # ------------------------------------------------------------------ #
    async def load_data(
        self, session: AsyncSession, symbols: list[str]
    ) -> dict[str, dict[str, pd.DataFrame]]:
        """Tüm veriyi bir kez yükler; bar döngüsü bellekte dilimler."""
        warmup_start = self.params.start - timedelta(minutes=self.step * self.params.warmup_bars)
        out: dict[str, dict[str, pd.DataFrame]] = {s: {} for s in symbols}
        for tf in timeframes_for(self.timeframe):
            tf_start = self.params.start - timedelta(
                minutes=TIMEFRAME_MINUTES[tf] * BARS_NEEDED.get(tf, 400)
            )
            frames = await load_frames(
                session,
                symbols,
                tf,
                end=self.params.end,
                limit=200_000,
            )
            for symbol, df in frames.items():
                if df.empty:
                    out[symbol][tf] = df
                    continue
                mask = df["open_time"] >= min(tf_start, warmup_start)
                out[symbol][tf] = df.loc[mask].reset_index(drop=True)
        return out

    async def load_universe(self, session: AsyncSession, fallback: list[str]) -> UniverseTimeline:
        # Havuz pazar başınadır; BIST snapshot'ı kripto backtestine sızmamalı.
        market = getattr(self.params, "market", "CRYPTO")
        snapshots = (
            (
                await session.execute(
                    select(UniverseSnapshot)
                    .where(
                        UniverseSnapshot.taken_at <= self.params.end,
                        UniverseSnapshot.market == market,
                    )
                    .order_by(UniverseSnapshot.taken_at)
                )
            )
            .scalars()
            .all()
        )
        return UniverseTimeline(list(snapshots), fallback)

    # ------------------------------------------------------------------ #
    def bar_times(self, data: dict[str, dict[str, pd.DataFrame]]) -> list[datetime]:
        """Karar zaman diliminde, aralıktaki tüm bar zamanları (birleşim)."""
        stamps: set[pd.Timestamp] = set()
        for frames in data.values():
            df = frames.get(self.timeframe)
            if df is None or df.empty:
                continue
            mask = (df["open_time"] >= self.params.start) & (df["open_time"] <= self.params.end)
            stamps.update(df.loc[mask, "open_time"].tolist())
        return sorted(t.to_pydatetime() for t in stamps)

    def split_holdout(self, times: list[datetime]) -> tuple[list[datetime], list[datetime]]:
        """Verinin son %30'u kilitli out-of-sample."""
        if not times:
            return [], []
        cut = int(len(times) * (1 - self.params.holdout_fraction))
        return times[:cut], times[cut:]

    # ------------------------------------------------------------------ #
    def run_scenario(
        self,
        data: dict[str, dict[str, pd.DataFrame]],
        universe: UniverseTimeline,
        times: list[datetime],
        cost_multiplier: float,
        scenario_name: str,
    ) -> ScenarioResult:
        """Tek maliyet senaryosunda bar-bar simülasyon."""
        clock = VirtualClock(times[0] if times else datetime.now(UTC))
        scoring = ScoringEngine(
            weights=self.definition.scoring.weights,
            use_pattern=self.definition.scoring.modifiers.get("pattern", True),
            use_candle=self.definition.scoring.modifiers.get("candle", True),
            use_crowding=self.definition.scoring.modifiers.get("crowding", True),
        )
        sizing = SizingEngine(self.definition.sizing_params())
        risk = RiskEngine(self.definition.risk_limits())
        exit_spec = self.definition.exit
        cost_bps = BASE_COST_BPS * cost_multiplier

        cash = self.params.initial_equity
        positions: list[SimPosition] = []
        trades: list[dict] = []
        curve: list[tuple[datetime, float]] = []
        exposure_series: list[float] = []
        turnover = 0.0
        equity_peak = cash
        day_anchor: tuple[datetime, float] = (times[0] if times else datetime.now(UTC), cash)
        week_anchor: tuple[datetime, float] = day_anchor
        entries_blocked_until: datetime | None = None
        clusters = self._compute_clusters(data)
        btc_regime: dict[datetime, str] = {}

        # Göstergeler nedenseldir; bir kez hesaplanıp bar bar satır okunur.
        # S/R ve formasyon motorları pencere tabanlı olduğu için bar bar
        # yeniden hesaplanmaya devam eder.
        indicator_frames = {
            symbol: precompute_indicators(frames, symbol) for symbol, frames in data.items()
        }

        for bar in times:
            clock.set(bar)
            symbols = universe.at(bar)
            cuts = self._cuts(data, symbols, bar)
            if not cuts:
                continue

            bundles = [
                build_bundle_precomputed(
                    symbol,
                    data[symbol],
                    indicator_frames.get(symbol, {}),
                    symbol_cuts,
                    with_patterns=self.params.with_patterns,
                    decision_tf=self.timeframe,
                )
                for symbol, symbol_cuts in cuts.items()
            ]
            results = scoring.score_cross_section([b.features for b in bundles])
            scores = {r.symbol: r for r in results}

            prices: dict[str, float] = {}
            atrs: dict[str, float] = {}
            rvols: dict[str, float] = {}
            stops: dict[str, float] = {}
            adv: dict[str, float] = {}
            for b in bundles:
                h1 = b.indicators.get(self.timeframe)
                if h1 is None or not math.isfinite(h1.close):
                    continue
                prices[b.symbol] = h1.close
                atrs[b.symbol] = h1.atr if math.isfinite(h1.atr) else 0.0
                rvols[b.symbol] = h1.realized_vol if math.isfinite(h1.realized_vol) else 0.0
                if b.sr is not None:
                    stop = stop_from_sr(b.sr, exit_spec.stop_atr_multiple, entry=h1.close)
                    if stop is not None:
                        stops[b.symbol] = stop
                cut = cuts[b.symbol].get(self.timeframe, 0)
                df = data[b.symbol].get(self.timeframe)
                if df is not None and cut >= 24:
                    adv[b.symbol] = float(df["quote_volume"].iloc[cut - 24 : cut].mean())

            btc_below, btc_vol_high = self._btc_regime(data, bar)
            btc_regime[bar] = "ayı" if btc_below else "boğa"

            # --- 1) Bar içi stop kontrolü: low/high ile gerçekçi tetikleme ---
            positions, cash, closed = self._check_intrabar_stops(
                positions, data, cuts, bar, cash, cost_bps, trades
            )
            turnover += closed

            # --- 2) Bar kapanışında çıkış kuralları ---
            for position in list(positions):
                price = prices.get(position.symbol)
                if price is None:
                    continue
                score = scores.get(position.symbol)
                decision = evaluate_exit(
                    position.view(),
                    MarketView(
                        price=price,
                        atr=atrs.get(position.symbol, 0.0),
                        score=score.score if score else None,
                        bar_closed=True,
                    ),
                    exit_spec,
                    bar,
                )
                r = (price - position.entry_price) / max(
                    position.entry_price - position.initial_stop, 1e-12
                )
                position.mfe = max(position.mfe, r)
                position.mae = min(position.mae, r)

                if decision.stop_moved and decision.new_stop is not None:
                    position.stop = decision.new_stop
                    position.breakeven_locked = True
                elif decision.should_exit and decision.reason is not None:
                    cash += self._close(position, price, bar, decision.reason, cost_bps, trades)
                    turnover += position.qty * price
                    positions.remove(position)

            equity = cash + sum(p.qty * prices.get(p.symbol, p.entry_price) for p in positions)
            equity_peak = max(equity_peak, equity)
            day_anchor, week_anchor = self._roll_anchors(bar, equity, day_anchor, week_anchor)

            # --- 3) Risk kapısı ---
            state = RiskState(
                equity=equity,
                equity_start_of_day=day_anchor[1],
                equity_start_of_week=week_anchor[1],
                equity_peak=equity_peak,
                consecutive_losses=_streak(trades),
                entries_blocked_until=entries_blocked_until,
            )
            verdict = risk.evaluate(state, bar)
            for trip in verdict.trips:
                if trip.entries_blocked_until is not None:
                    entries_blocked_until = trip.entries_blocked_until
            if verdict.kill:
                for position in list(positions):
                    price = prices.get(position.symbol, position.entry_price)
                    cash += self._close(
                        position, price, bar, ExitReason.KILL_SWITCH, cost_bps, trades
                    )
                    turnover += position.qty * price
                positions.clear()

            # --- 4) Girişler ---
            if verdict.allow_entry:
                cash, added = self._consider_entries(
                    scores,
                    prices,
                    stops,
                    rvols,
                    adv,
                    positions,
                    cash,
                    equity,
                    sizing,
                    clusters,
                    bar,
                    cost_bps,
                    btc_below,
                    btc_vol_high,
                    trades,
                )
                turnover += added

            equity = cash + sum(p.qty * prices.get(p.symbol, p.entry_price) for p in positions)
            curve.append((bar, equity))
            exposure_series.append((equity - cash) / equity if equity > 0 else 0.0)

        metrics = compute_metrics(
            curve,
            trades,
            timeframe=self.timeframe,
            exposure_series=exposure_series,
            turnover_notional=turnover,
        )
        metrics.regime_breakdown = regime_split(curve, btc_regime, self.timeframe)

        close_series = {s: self._close_series(data, s) for s in universe.at(times[-1]) if times}
        close_series = {s: v for s, v in close_series.items() if v is not None and len(v)}
        btc_series = self._close_series(data, "BTCUSDT")

        rebalance_bars = max(1, int(self.definition.exit.max_hold_hours))
        benchmarks = build_benchmarks(
            prices=close_series,
            btc_prices=btc_series,
            times=times,
            initial=self.params.initial_equity,
            positions=self.definition.entry.max_positions,
            rebalance_bars=rebalance_bars,
            cost_bps=cost_bps,
            timeframe=self.timeframe,
        )
        random_bench = next(
            (b for b in benchmarks if b.name.startswith("Devir-eşleştirilmiş")), None
        )
        pct = float("nan")
        if random_bench and random_bench.detail and curve:
            finals = [
                random_bench.detail.get("final_p05", 0.0),
                random_bench.detail.get("final_p50", 0.0),
                random_bench.detail.get("final_p95", 0.0),
            ]
            pct = strategy_percentile(curve[-1][1], finals)

        return ScenarioResult(
            cost_scenario=scenario_name,
            metrics=metrics,
            equity_curve=curve,
            trades=trades,
            benchmarks=benchmarks,
            flags=red_flags(metrics),
            random_percentile=pct,
        )

    # ------------------------------------------------------------------ #
    def _cuts(
        self, data: dict[str, dict[str, pd.DataFrame]], symbols: list[str], bar: datetime
    ) -> dict[str, dict[str, int]]:
        """`bar` anında her zaman diliminde kaç bar kullanılabilir?

        `open_time <= bar` sayısıdır — look-ahead korumasının aynısı, dilim
        kopyalamadan. Karar zaman diliminde en az 220 bar yoksa sembol atlanır.
        """
        out: dict[str, dict[str, int]] = {}
        stamp = pd.Timestamp(bar)
        for symbol in symbols:
            frames = data.get(symbol)
            if not frames:
                continue
            cuts: dict[str, int] = {}
            for tf, df in frames.items():
                cuts[tf] = 0 if df.empty else int(df["open_time"].searchsorted(stamp, side="right"))
            if cuts.get(self.timeframe, 0) >= 220:
                out[symbol] = cuts
        return out

    def _check_intrabar_stops(
        self,
        positions: list[SimPosition],
        data: dict[str, dict[str, pd.DataFrame]],
        cuts: dict[str, dict[str, int]],
        bar: datetime,
        cash: float,
        cost_bps: float,
        trades: list[dict],
    ) -> tuple[list[SimPosition], float, float]:
        """Barın `low`'u stop'un altına indiyse stop **o barda** tetiklenmiştir.

        Kapanışa bakıp "stop tetiklenmedi" demek backtest'i sistematik olarak
        iyimser gösterir. Dolum fiyatı stop seviyesi kabul edilir (gap durumunda
        barın açılışı daha kötüyse o kullanılır).
        """
        turnover = 0.0
        for position in list(positions):
            frames = data.get(position.symbol)
            symbol_cuts = cuts.get(position.symbol)
            if not frames or not symbol_cuts:
                continue
            df = frames.get(self.timeframe)
            cut = symbol_cuts.get(self.timeframe, 0)
            if df is None or cut <= 0:
                continue
            row = df.iloc[cut - 1]
            if row["open_time"].to_pydatetime().timestamp() != bar.timestamp():
                continue
            if float(row["low"]) <= position.stop:
                fill = min(position.stop, float(row["open"]))
                cash += self._close(position, fill, bar, ExitReason.STOP, cost_bps, trades)
                turnover += position.qty * fill
                positions.remove(position)
        return positions, cash, turnover

    def _close(
        self,
        position: SimPosition,
        price: float,
        at: datetime,
        reason: ExitReason,
        cost_bps: float,
        trades: list[dict],
    ) -> float:
        """Pozisyonu kapatır, `trades` listesine yazar, nakde dönen tutarı verir."""
        gross = price * position.qty
        fee = gross * cost_bps / 10_000
        proceeds = gross - fee
        pnl = net_pnl(
            gross=(price - position.entry_price) * position.qty,
            entry_fees=position.entry_fees,
            exit_fees=fee,
        )
        risk_per_unit = max(position.entry_price - position.initial_stop, 1e-12)
        trades.append(
            {
                "symbol": position.symbol,
                "entry_time": position.entry_time.isoformat(),
                "exit_time": at.isoformat(),
                "entry_price": round(position.entry_price, 10),
                "exit_price": round(price, 10),
                "qty": round(position.qty, 10),
                "exit_reason": str(reason),
                "pnl": round(pnl, 8),
                "pnl_r": round((price - position.entry_price) / risk_per_unit, 6),
                "fees": round(total_fees(entry_fees=position.entry_fees, exit_fees=fee), 8),
                "slippage_bps": round(cost_bps, 4),
                "mfe": round(position.mfe, 6),
                "mae": round(position.mae, 6),
                "hold_hours": round((at - position.entry_time).total_seconds() / 3600, 4),
                "score_at_entry": round(position.score_at_entry, 2),
            }
        )
        return proceeds

    def _consider_entries(
        self,
        scores,
        prices,
        stops,
        rvols,
        adv,
        positions,
        cash,
        equity,
        sizing,
        clusters,
        bar,
        cost_bps,
        btc_below,
        btc_vol_high,
        trades,
    ) -> tuple[float, float]:
        held = {p.symbol for p in positions}
        candidates = [
            s
            for s in sorted(scores.values(), key=lambda x: -x.score)
            if s.score >= self.definition.entry.min_score and s.symbol not in held
        ]
        turnover = 0.0
        exposures = {p.symbol: p.qty * prices.get(p.symbol, p.entry_price) for p in positions}

        for candidate in candidates:
            if len(positions) >= self.definition.entry.max_positions:
                victim = rotation_candidate(
                    [(p.symbol, p.score_at_entry) for p in positions],
                    candidate.symbol,
                    candidate.score,
                    self.definition.rotation,
                    self.definition.entry.max_positions,
                )
                if victim is None:
                    break
                target = next((p for p in positions if p.symbol == victim), None)
                if target is not None:
                    price = prices.get(victim, target.entry_price)
                    cash += self._close(target, price, bar, ExitReason.ROTATION, cost_bps, trades)
                    turnover += target.qty * price
                    positions.remove(target)
                    exposures.pop(victim, None)

            entry = prices.get(candidate.symbol)
            stop = stops.get(candidate.symbol)
            if entry is None or stop is None:
                continue

            exposure = sum(exposures.values())
            decision = sizing.size(
                SizingInput(
                    symbol=candidate.symbol,
                    score=candidate.score,
                    entry=entry,
                    stop=stop,
                    equity=equity,
                    free_cash=cash,
                    current_exposure=exposure,
                    cluster_exposure=cluster_exposure(clusters, exposures, candidate.symbol),
                    realized_vol_20d=rvols.get(candidate.symbol, 0.0),
                    adv_1h=adv.get(candidate.symbol, 0.0),
                    open_positions=len(positions),
                    btc_below_ema200=btc_below,
                    btc_vol_above_p90=btc_vol_high,
                )
            )
            if not decision.accepted:
                continue

            fill = entry * (1 + cost_bps / 10_000)
            gross = fill * decision.qty
            fee = gross * cost_bps / 10_000
            if gross + fee > cash:
                continue
            cash -= gross + fee
            turnover += gross
            positions.append(
                SimPosition(
                    symbol=candidate.symbol,
                    qty=decision.qty,
                    entry_price=fill,
                    entry_time=bar,
                    stop=stop,
                    initial_stop=stop,
                    score_at_entry=candidate.score,
                    entry_fees=fee,
                )
            )
            exposures[candidate.symbol] = gross
        return cash, turnover

    # ------------------------------------------------------------------ #
    def _compute_clusters(self, data: dict[str, dict[str, pd.DataFrame]]) -> dict[str, int]:
        frames = {s: f.get("1d", pd.DataFrame()) for s, f in data.items()}
        frames = {s: df for s, df in frames.items() if not df.empty}
        if len(frames) < 2:
            return {}
        return cluster_symbols(returns_matrix(frames))

    def _btc_regime(
        self, data: dict[str, dict[str, pd.DataFrame]], bar: datetime
    ) -> tuple[bool, bool]:
        frames = data.get("BTCUSDT")
        if not frames:
            return False, False
        df = frames.get("1d")
        if df is None or df.empty:
            return False, False
        cut = df["open_time"].searchsorted(pd.Timestamp(bar), side="right")
        window = df.iloc[max(0, cut - 400) : cut]
        if len(window) < 210:
            return False, False
        close = window["close"].astype(float)
        ema200 = ema(close, 200).iloc[-1]
        below = bool(math.isfinite(ema200) and close.iloc[-1] < ema200)
        vol = realized_vol(close, period=30, bars_per_year=365).dropna()
        high = bool(len(vol) > 60 and vol.iloc[-1] > vol.quantile(0.90))
        return below, high

    def _close_series(
        self, data: dict[str, dict[str, pd.DataFrame]], symbol: str
    ) -> pd.Series | None:
        frames = data.get(symbol)
        if not frames:
            return None
        df = frames.get(self.timeframe)
        if df is None or df.empty:
            return None
        return df.set_index("open_time")["close"].astype(float)

    def _roll_anchors(self, bar, equity, day_anchor, week_anchor):
        if bar.date() != day_anchor[0].date():
            day_anchor = (bar, equity)
        if (bar - week_anchor[0]).days >= 7:
            week_anchor = (bar, equity)
        return day_anchor, week_anchor

    # ------------------------------------------------------------------ #
    async def run(self, session: AsyncSession) -> BacktestReport:
        symbols = self.params.symbols
        if not symbols:
            timeline_fallback = await self._fallback_symbols(session)
            symbols = timeline_fallback
        universe = await self.load_universe(session, symbols)
        data = await self.load_data(session, sorted(set(symbols) | {"BTCUSDT"}))

        all_times = self.bar_times(data)
        in_sample, holdout = self.split_holdout(all_times)
        times = holdout if self.params.use_holdout else in_sample
        if not times:
            raise ValueError("Bu aralıkta bar yok — önce veriyi doldurun.")

        log.info(
            "backtest_start",
            symbols=len(symbols),
            bars=len(times),
            holdout=self.params.use_holdout,
        )

        scenarios = [
            self.run_scenario(data, universe, times, mult, name) for name, mult in COST_SCENARIOS
        ]
        walk = self.walk_forward(data, universe, in_sample)

        return BacktestReport(
            definition_hash=self.definition.hash(),
            params={
                "start": self.params.start.isoformat(),
                "end": self.params.end.isoformat(),
                "initial_equity": self.params.initial_equity,
                "timeframe": self.timeframe,
                "symbols": len(symbols),
                "bars": len(times),
                "holdout_used": self.params.use_holdout,
                "holdout_bars_locked": len(holdout),
            },
            scenarios=scenarios,
            approximate_universe=universe.approximate,
            universe_note=universe.note(),
            walk_forward=walk,
        )

    def walk_forward(
        self,
        data: dict[str, dict[str, pd.DataFrame]],
        universe: UniverseTimeline,
        times: list[datetime],
        folds: int = 4,
    ) -> list[dict]:
        """Kayan pencere doğrulaması (§11).

        Her katman ayrı raporlanır: performans yalnızca bir dönemden geliyorsa
        toplam sayı bunu saklar, katmanlar saklamaz.
        """
        if len(times) < folds * 200:
            return []
        size = len(times) // folds
        out: list[dict] = []
        for i in range(folds):
            window = times[i * size : (i + 1) * size]
            if len(window) < 100:
                continue
            result = self.run_scenario(data, universe, window, 1.0, f"fold-{i + 1}")
            out.append(
                {
                    "fold": i + 1,
                    "start": window[0].isoformat(),
                    "end": window[-1].isoformat(),
                    "metrics": result.metrics.as_dict(),
                    "flags": result.flags,
                }
            )
        return out

    async def _fallback_symbols(self, session: AsyncSession) -> list[str]:
        snap = (
            await session.execute(
                select(UniverseSnapshot).order_by(UniverseSnapshot.taken_at.desc()).limit(1)
            )
        ).scalar_one_or_none()
        return [s["symbol"] for s in snap.symbols] if snap else []


def _streak(trades: list[dict]) -> int:
    streak = 0
    for t in reversed(trades):
        if t["pnl"] < 0:
            streak += 1
        else:
            break
    return streak


def summarize(report: BacktestReport) -> str:
    """Rapor başına insan okur bir cümle. Sonucu güzelleştirmez."""
    base = next((s for s in report.scenarios if s.cost_scenario == "base"), None)
    if base is None:
        return "Sonuç üretilemedi."
    m = base.metrics
    parts = [
        f"{m.trades} işlem",
        f"toplam getiri %{m.total_return * 100:.1f}",
        f"Sharpe {m.sharpe:.2f}" if math.isfinite(m.sharpe) else "Sharpe hesaplanamadı",
        f"maks DD %{abs(m.max_drawdown) * 100:.1f}",
    ]
    text = " · ".join(parts)
    if base.flags:
        text += " · ⚠ " + "; ".join(f["message"] for f in base.flags)
    if report.approximate_universe:
        text += " · YAKLAŞIK EVREN"
    return text


def _np_safe(x) -> float:
    return float(x) if isinstance(x, int | float | np.floating) else float("nan")
