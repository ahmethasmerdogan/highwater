"""Zorunlu kıyaslar — MASTER-SPEC §11.

Her raporda **üçü birden** görünür:
  1. Eşit ağırlıklı likit-100 al-tut
  2. BTC al-tut
  3. **Devir-eşleştirilmiş rastgele portföy** — aynı pozisyon sayısı, aynı yeniden
     dengeleme frekansı, ama coinler rastgele.

Üçüncüsü en önemlisidir ve çok az kişi yapar: "sıralama gerçekten değer katıyor
mu, yoksa getirinin kaynağı sadece devir ve yeniden dengelemenin mekanik etkisi
mi?" sorusunu izole eden tek testtir.
"""

from __future__ import annotations

import random
from dataclasses import dataclass, field
from datetime import datetime

import numpy as np
import pandas as pd

from sarnic.backtest.metrics import Metrics, compute_metrics

# Rastgele portföy tek koşuda değerlendirilmez — dağılım gerekir.
RANDOM_TRIALS = 50


@dataclass(slots=True)
class BenchmarkResult:
    name: str
    equity_curve: list[tuple[datetime, float]] = field(default_factory=list)
    metrics: Metrics | None = None
    detail: dict = field(default_factory=dict)

    def as_dict(self) -> dict:
        return {
            "name": self.name,
            "equity_curve": [[t.isoformat(), e] for t, e in self.equity_curve],
            "metrics": self.metrics.as_dict() if self.metrics else None,
            "detail": self.detail,
        }


def buy_and_hold(
    prices: dict[str, pd.Series], times: list[datetime], initial: float, cost_bps: float = 10.0
) -> list[tuple[datetime, float]]:
    """Eşit ağırlıklı al-tut. Giriş maliyeti bir kez uygulanır."""
    symbols = [s for s, p in prices.items() if len(p) and p.iloc[0] > 0]
    if not symbols:
        return []
    per_symbol = initial * (1 - cost_bps / 10_000) / len(symbols)
    qty = {s: per_symbol / float(prices[s].iloc[0]) for s in symbols}

    curve: list[tuple[datetime, float]] = []
    for t in times:
        value = 0.0
        for s in symbols:
            series = prices[s]
            idx = series.index.searchsorted(t, side="right") - 1
            if idx < 0:
                value += per_symbol
            else:
                value += qty[s] * float(series.iloc[idx])
        curve.append((t, value))
    return curve


def turnover_matched_random(
    prices: dict[str, pd.Series],
    times: list[datetime],
    *,
    initial: float,
    positions: int,
    rebalance_bars: int,
    cost_bps: float,
    trials: int = RANDOM_TRIALS,
    seed: int = 20260813,
) -> tuple[list[tuple[datetime, float]], dict]:
    """Devir-eşleştirilmiş rastgele portföy.

    Gerçek stratejiyle **aynı** pozisyon sayısı, **aynı** yeniden dengeleme
    frekansı ve **aynı** maliyet modeli; tek fark coinlerin rastgele seçilmesi.
    `trials` koşunun medyan eğrisi ve yüzdelik dağılımı döner.
    """
    symbols = [s for s, p in prices.items() if len(p) > 1]
    if not symbols or not times:
        return [], {}

    rng = random.Random(seed)
    all_curves: list[list[float]] = []

    for _ in range(trials):
        equity = initial
        curve: list[float] = []
        held: list[str] = []
        entry_prices: dict[str, float] = {}

        for i, t in enumerate(times):
            if i % rebalance_bars == 0:
                # Mevcut pozisyonları kapat (maliyetle), yenilerini aç.
                if held:
                    equity *= 1 - cost_bps / 10_000
                available = [s for s in symbols if _price_at(prices[s], t) > 0]
                if not available:
                    curve.append(equity)
                    continue
                held = rng.sample(available, min(positions, len(available)))
                entry_prices = {s: _price_at(prices[s], t) for s in held}
                equity *= 1 - cost_bps / 10_000
                curve.append(equity)
                continue

            if not held:
                curve.append(equity)
                continue

            # Eşit ağırlıklı sepetin bu bardaki değeri.
            growth = np.mean(
                [
                    _price_at(prices[s], t) / entry_prices[s]
                    for s in held
                    if entry_prices.get(s, 0) > 0
                ]
            )
            curve.append(equity * float(growth))

        all_curves.append(curve)

    matrix = np.array(all_curves, dtype=float)
    median = np.median(matrix, axis=0)
    curve_out = list(zip(times, [float(v) for v in median], strict=True))

    finals = matrix[:, -1]
    detail = {
        "trials": trials,
        "positions": positions,
        "rebalance_bars": rebalance_bars,
        "final_p05": float(np.percentile(finals, 5)),
        "final_p50": float(np.percentile(finals, 50)),
        "final_p95": float(np.percentile(finals, 95)),
    }
    return curve_out, detail


def _price_at(series: pd.Series, t: datetime) -> float:
    idx = series.index.searchsorted(t, side="right") - 1
    return float(series.iloc[idx]) if idx >= 0 else 0.0


def strategy_percentile(strategy_final: float, random_finals: list[float]) -> float:
    """Strateji rastgele dağılımın neresinde? %95'in üstü = sıralama değer katıyor."""
    if not random_finals:
        return float("nan")
    arr = np.array(random_finals, dtype=float)
    return float((arr < strategy_final).mean() * 100)


def build_benchmarks(
    *,
    prices: dict[str, pd.Series],
    btc_prices: pd.Series | None,
    times: list[datetime],
    initial: float,
    positions: int,
    rebalance_bars: int,
    cost_bps: float,
    timeframe: str,
) -> list[BenchmarkResult]:
    results: list[BenchmarkResult] = []

    eq_curve = buy_and_hold(prices, times, initial, cost_bps)
    results.append(
        BenchmarkResult(
            name="Eşit ağırlıklı likit-100 al-tut",
            equity_curve=eq_curve,
            metrics=compute_metrics(eq_curve, [], timeframe=timeframe),
        )
    )

    if btc_prices is not None and len(btc_prices):
        btc_curve = buy_and_hold({"BTCUSDT": btc_prices}, times, initial, cost_bps)
        results.append(
            BenchmarkResult(
                name="BTC al-tut",
                equity_curve=btc_curve,
                metrics=compute_metrics(btc_curve, [], timeframe=timeframe),
            )
        )

    rnd_curve, detail = turnover_matched_random(
        prices,
        times,
        initial=initial,
        positions=positions,
        rebalance_bars=rebalance_bars,
        cost_bps=cost_bps,
    )
    results.append(
        BenchmarkResult(
            name="Devir-eşleştirilmiş rastgele portföy",
            equity_curve=rnd_curve,
            metrics=compute_metrics(rnd_curve, [], timeframe=timeframe),
            detail=detail,
        )
    )
    return results
