"""Backtest metrikleri — MASTER-SPEC §11.

Aşırı uydurma uyarısı burada üretilir: `Sharpe > 3` veya `maks DD < %5` çıkarsa
rapor **kırmızı bayrak** basar. Bu değerler kutlama sebebi değil, hata şüphesidir.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field, fields
from datetime import datetime

import numpy as np

from sarnic.core.enums import TIMEFRAME_MINUTES

# §11 kırmızı bayrak eşikleri.
SHARPE_RED_FLAG = 3.0
MAX_DD_RED_FLAG = 0.05
TRADES_RED_FLAG = 20  # bu sayının altında hiçbir metrik güvenilir değil

# Yılda kaç bar — `TIMEFRAME_MINUTES`'ten **türetilir**, elle yazılmaz.
#
# Elle yazıldığı sürece yeni bir dilim eklendiğinde burası bayat kalıyordu:
# 30m eklendiğinde sözlükte yoktu ve `.get(tf, 8760)` sessizce 1h değerini
# döndürüyordu. Volatilite yıllıklandırması √2 kat yanlış hesaplanıyor, yani
# 30m botun volatilite özellikleri ve backtest Sharpe'ı bozuk çıkıyordu.
BARS_PER_YEAR = {
    tf: round(365 * 24 * 60 / minutes) for tf, minutes in TIMEFRAME_MINUTES.items()
}


@dataclass(slots=True)
class Metrics:
    start: datetime | None = None
    end: datetime | None = None
    initial_equity: float = 0.0
    final_equity: float = 0.0
    total_return: float = 0.0
    cagr: float = float("nan")
    sharpe: float = float("nan")
    sortino: float = float("nan")
    calmar: float = float("nan")
    max_drawdown: float = 0.0
    max_drawdown_days: float = 0.0
    volatility: float = float("nan")
    trades: int = 0
    win_rate: float = float("nan")
    profit_factor: float = float("nan")
    expectancy_r: float = float("nan")
    avg_r: float = float("nan")
    avg_win_r: float = float("nan")
    avg_loss_r: float = float("nan")
    turnover: float = 0.0
    exposure: float = 0.0
    total_fees: float = 0.0
    total_slippage_bps: float = 0.0
    exit_reasons: dict[str, int] = field(default_factory=dict)
    regime_breakdown: dict[str, dict] = field(default_factory=dict)

    def as_dict(self) -> dict:
        # `slots=True` dataclass'ta `__dict__` yoktur; alanları tanımdan okuruz.
        return {f.name: _clean(getattr(self, f.name)) for f in fields(self)}


def _clean(v):
    if isinstance(v, float):
        return None if not math.isfinite(v) else round(v, 8)
    if isinstance(v, datetime):
        return v.isoformat()
    if isinstance(v, dict):
        return {k: _clean(x) for k, x in v.items()}
    if isinstance(v, list | tuple):
        return [_clean(x) for x in v]
    return v


def drawdown_series(equity: np.ndarray) -> np.ndarray:
    peak = np.maximum.accumulate(equity)
    return equity / np.where(peak == 0, 1, peak) - 1.0


def max_drawdown(equity: np.ndarray) -> float:
    return float(drawdown_series(equity).min()) if len(equity) else 0.0


def max_drawdown_duration(times: list[datetime], equity: np.ndarray) -> float:
    """En uzun drawdown süresi (gün). Süre, derinlik kadar önemlidir."""
    if len(equity) < 2:
        return 0.0
    peak = equity[0]
    peak_time = times[0]
    longest = 0.0
    for t, e in zip(times, equity, strict=True):
        if e >= peak:
            longest = max(longest, (t - peak_time).total_seconds() / 86400)
            peak, peak_time = e, t
    longest = max(longest, (times[-1] - peak_time).total_seconds() / 86400)
    return float(longest)


def sharpe_ratio(returns: np.ndarray, periods_per_year: int) -> float:
    if len(returns) < 2:
        return float("nan")
    std = returns.std(ddof=1)
    if std == 0:
        return float("nan")
    return float(returns.mean() / std * math.sqrt(periods_per_year))


def sortino_ratio(returns: np.ndarray, periods_per_year: int) -> float:
    if len(returns) < 2:
        return float("nan")
    downside = returns[returns < 0]
    if len(downside) < 2:
        return float("nan")
    dd = downside.std(ddof=1)
    if dd == 0:
        return float("nan")
    return float(returns.mean() / dd * math.sqrt(periods_per_year))


# Bundan kısa bir pencereyi yıllıklandırmak anlamsızdır: 2 saatlik %1 getiri
# yıllığa çevrilince astronomik bir sayı üretir ve okuyucuyu yanıltır.
MIN_CAGR_DAYS = 30


def cagr(equity: np.ndarray, times: list[datetime]) -> float:
    if len(equity) < 2 or equity[0] <= 0 or equity[-1] <= 0:
        return float("nan")
    days = (times[-1] - times[0]).total_seconds() / 86400
    if days < MIN_CAGR_DAYS:
        return float("nan")
    return float((equity[-1] / equity[0]) ** (365.25 / days) - 1)


def compute_metrics(
    equity_curve: list[tuple[datetime, float]],
    trades: list[dict],
    *,
    timeframe: str = "1h",
    exposure_series: list[float] | None = None,
    turnover_notional: float = 0.0,
) -> Metrics:
    m = Metrics()
    if not equity_curve:
        return m

    times = [t for t, _ in equity_curve]
    equity = np.array([e for _, e in equity_curve], dtype=float)

    m.start, m.end = times[0], times[-1]
    m.initial_equity, m.final_equity = float(equity[0]), float(equity[-1])
    m.total_return = m.final_equity / m.initial_equity - 1 if m.initial_equity else 0.0

    rets = np.diff(equity) / np.where(equity[:-1] == 0, 1, equity[:-1])
    ppy = BARS_PER_YEAR.get(timeframe, 8760)
    m.sharpe = sharpe_ratio(rets, ppy)
    m.sortino = sortino_ratio(rets, ppy)
    m.volatility = float(rets.std(ddof=1) * math.sqrt(ppy)) if len(rets) > 1 else float("nan")
    m.max_drawdown = max_drawdown(equity)
    m.max_drawdown_days = max_drawdown_duration(times, equity)
    m.cagr = cagr(equity, times)
    m.calmar = (
        m.cagr / abs(m.max_drawdown)
        if m.max_drawdown < 0 and math.isfinite(m.cagr)
        else float("nan")
    )

    m.trades = len(trades)
    if trades:
        pnls = np.array([t["pnl"] for t in trades], dtype=float)
        rs = np.array([t["pnl_r"] for t in trades], dtype=float)
        wins, losses = pnls[pnls > 0], pnls[pnls < 0]
        m.win_rate = float(len(wins) / len(pnls))
        gross_loss = float(abs(losses.sum()))
        m.profit_factor = float(wins.sum() / gross_loss) if gross_loss > 0 else float("nan")
        m.expectancy_r = float(rs.mean())
        m.avg_r = float(rs.mean())
        m.avg_win_r = float(rs[rs > 0].mean()) if (rs > 0).any() else float("nan")
        m.avg_loss_r = float(rs[rs < 0].mean()) if (rs < 0).any() else float("nan")
        m.total_fees = float(sum(t.get("fees", 0.0) for t in trades))
        m.total_slippage_bps = float(np.mean([t.get("slippage_bps", 0.0) for t in trades]))
        for t in trades:
            reason = t.get("exit_reason", "?")
            m.exit_reasons[reason] = m.exit_reasons.get(reason, 0) + 1

    if exposure_series:
        m.exposure = float(np.mean([e for e in exposure_series if math.isfinite(e)]))
    if m.initial_equity > 0:
        m.turnover = turnover_notional / m.initial_equity

    return m


def red_flags(m: Metrics) -> list[dict]:
    """§11 — sonuç fazla güzelse rapor bunu söylemek zorundadır."""
    flags: list[dict] = []
    if math.isfinite(m.sharpe) and m.sharpe > SHARPE_RED_FLAG:
        flags.append(
            {
                "kind": "sharpe",
                "value": round(m.sharpe, 3),
                "message": (
                    f"Sharpe {m.sharpe:.2f} > {SHARPE_RED_FLAG}. Bu bir kutlama sebebi değil, "
                    "hata şüphesidir. Look-ahead, hayatta kalma yanlılığı veya maliyet "
                    "eksikliği aranmalı."
                ),
            }
        )
    if abs(m.max_drawdown) < MAX_DD_RED_FLAG and m.trades >= TRADES_RED_FLAG:
        flags.append(
            {
                "kind": "max_drawdown",
                "value": round(m.max_drawdown, 4),
                "message": (
                    f"Maksimum drawdown %{abs(m.max_drawdown) * 100:.1f} < "
                    f"%{MAX_DD_RED_FLAG * 100:.0f}. Gerçek bir kripto stratejisi için fazla "
                    "temiz; muhtemelen bir hata var."
                ),
            }
        )
    if m.trades < TRADES_RED_FLAG:
        flags.append(
            {
                "kind": "sample_size",
                "value": m.trades,
                "message": (
                    f"Yalnızca {m.trades} işlem. Bu örneklemde hiçbir metrik güvenilir değildir."
                ),
            }
        )
    return flags


def regime_split(
    equity_curve: list[tuple[datetime, float]],
    btc_regime: dict[datetime, str],
    timeframe: str = "1h",
) -> dict[str, dict]:
    """Rejim bazlı ayrıştırma — boğa/ayı piyasasında ayrı performans (§11)."""
    if not equity_curve or not btc_regime:
        return {}
    buckets: dict[str, list[float]] = {}
    prev_equity = equity_curve[0][1]
    for t, e in equity_curve[1:]:
        regime = btc_regime.get(t, "unknown")
        ret = (e / prev_equity - 1) if prev_equity else 0.0
        buckets.setdefault(regime, []).append(ret)
        prev_equity = e
    ppy = BARS_PER_YEAR.get(timeframe, 8760)
    return {
        regime: {
            "bars": len(rets),
            "total_return": float(np.prod([1 + r for r in rets]) - 1),
            "sharpe": _clean(sharpe_ratio(np.array(rets), ppy)),
        }
        for regime, rets in buckets.items()
    }
