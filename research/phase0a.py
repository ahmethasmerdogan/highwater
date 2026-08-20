"""Faz 0a — doğrulama deneyi.

> Bu fazın amacı kod yazmak değil, **bir soruyu cevaplamak**: bu puanlama
> ileri getiriyi öngörüyor mu?

Kurallar (ROADMAP Faz 0a):
  * Yalnızca `research/` altında çalışır; `apps/` altına hiçbir şey yazmaz.
  * Formasyon motoru **yok** — en zayıf halka, deneyi bulandırır.
  * Point-in-time evren zorunlu: delist edilmiş semboller dahil.
  * Verinin son %30'u **kilitli** out-of-sample; bu fazda dokunulmaz.
  * Her parametre değişikliği bir denemedir → `TRIAL-LEDGER.md`.

Puanlama motoru `apps/engine`'den **ithal edilir**, yeniden yazılmaz — bozulmaz
kural 1'in gereği. Deneyin doğruladığı şey, üretimde çalışacak olan koddur.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import math
import sys
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path

import numpy as np
import pandas as pd

RESEARCH_DIR = Path(__file__).resolve().parent
DATA_DIR = RESEARCH_DIR / "data"
ENGINE_DIR = RESEARCH_DIR.parent / "apps" / "engine"
sys.path.insert(0, str(ENGINE_DIR))

from sarnic.data.archive import ArchiveDownloader  # noqa: E402
from sarnic.features.indicators import compute_frame  # noqa: E402
from sarnic.scoring.calibration import build_report  # noqa: E402
from sarnic.scoring.engine import ScoringEngine, SymbolFeatures  # noqa: E402
from sarnic.scoring.registry import FEATURE_KEYS  # noqa: E402

# Kilitli out-of-sample penceresi.
HOLDOUT_FRACTION = 0.30

# Maliyet varsayımı: taker %0,1 + 5 bps kayma = 15 bps tek yön.
COST_BPS = 15.0

TOP_N = 5
REBALANCE_HOURS = 24


# --------------------------------------------------------------------------- #
#  1) Veri
# --------------------------------------------------------------------------- #
async def fetch(symbols: int, days: int) -> None:
    """Arşivden 1h ve 1d kline indirir, Parquet olarak saklar.

    Sembol listesi **bugünün** hacim sıralamasından değil, arşivde verisi olan
    tüm USDT çiftlerinden gelir — delist edilmişler dahil (survivorship bias).
    """
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    universe_file = DATA_DIR / "symbols.json"

    if universe_file.exists():
        chosen = json.loads(universe_file.read_text())
    else:
        import httpx

        resp = httpx.get("https://api.binance.com/api/v3/exchangeInfo", timeout=60)
        resp.raise_for_status()
        chosen = sorted(
            s["symbol"]
            for s in resp.json()["symbols"]
            if s["quoteAsset"] == "USDT" and s["status"] in ("TRADING", "BREAK", "HALT")
        )[: symbols * 2]
        universe_file.write_text(json.dumps(chosen, indent=1))

    end = datetime.now(UTC).date()
    start = end - timedelta(days=days)
    downloader = ArchiveDownloader(concurrency=8)

    try:
        for timeframe in ("1h", "1d"):
            out = DATA_DIR / timeframe
            out.mkdir(parents=True, exist_ok=True)
            for i, symbol in enumerate(chosen, start=1):
                target = out / f"{symbol}.parquet"
                if target.exists():
                    continue
                klines = await downloader.download(symbol, timeframe, start, end)
                if len(klines) < 400:
                    continue
                frame = pd.DataFrame([k.as_row() for k in klines])
                for column in frame.columns:
                    if column not in ("symbol", "timeframe", "open_time", "is_closed"):
                        frame[column] = frame[column].astype(float)
                frame.to_parquet(target)
                print(f"[{i}/{len(chosen)}] {symbol} {timeframe}: {len(frame)} bar")
    finally:
        await downloader.close()


def load_frames(timeframe: str) -> dict[str, pd.DataFrame]:
    directory = DATA_DIR / timeframe
    if not directory.exists():
        raise SystemExit(f"{directory} yok — önce `fetch` çalıştırın.")
    frames: dict[str, pd.DataFrame] = {}
    for path in sorted(directory.glob("*.parquet")):
        frame = pd.read_parquet(path)
        frame["open_time"] = pd.to_datetime(frame["open_time"], utc=True)
        frames[path.stem] = frame.sort_values("open_time").reset_index(drop=True)
    return frames


# --------------------------------------------------------------------------- #
#  2) Point-in-time evren
# --------------------------------------------------------------------------- #
def build_universe(top_n: int = 100, min_age_days: int = 60) -> pd.DataFrame:
    """Her gün için o günkü hacim sıralamasından ilk `top_n` sembol.

    Bugünün listesiyle geçmişi test etmek getiriyi yaklaşık **dört kat** şişirir;
    bu fonksiyon o hatanın panzehiridir.
    """
    daily = load_frames("1d")
    rows: list[dict] = []

    for symbol, frame in daily.items():
        listed = frame["open_time"].iloc[0]
        for _, bar in frame.iterrows():
            age = (bar["open_time"] - listed).days
            if age < min_age_days:
                continue
            rows.append(
                {
                    "date": bar["open_time"].normalize(),
                    "symbol": symbol,
                    "quote_volume": float(bar["quote_volume"]),
                }
            )

    table = pd.DataFrame(rows)
    if table.empty:
        raise SystemExit("Evren kurulamadı — yeterli veri yok.")

    table["rank"] = table.groupby("date")["quote_volume"].rank(ascending=False, method="first")
    universe = table[table["rank"] <= top_n].copy()

    out = DATA_DIR / "universe.parquet"
    universe.to_parquet(out)
    print(f"Point-in-time evren: {universe['date'].nunique()} gün · {out}")
    return universe


# --------------------------------------------------------------------------- #
#  3) Puanlama + ileri getiriler
# --------------------------------------------------------------------------- #
@dataclass(slots=True)
class ScoredBar:
    bar_time: datetime
    symbol: str
    score: float
    families: dict[str, float]
    fwd_4h: float
    fwd_24h: float
    fwd_72h: float


def score_all(step_hours: int = 6) -> pd.DataFrame:
    """Her `step_hours` barda bir kesitsel puanlama yapar.

    Formasyon motoru **kapalı** ve S/R yerine yalnızca indikatör tabanlı
    özellikler kullanılır: bu fazın sorusu "temel puanlama çalışıyor mu?"dur.
    """
    hourly = load_frames("1h")
    universe = pd.read_parquet(DATA_DIR / "universe.parquet")
    universe["date"] = pd.to_datetime(universe["date"], utc=True)
    by_date = universe.groupby("date")["symbol"].apply(list).to_dict()

    # Göstergeler bir kez hesaplanır — nedensel oldukları için satır okuma
    # kesip yeniden hesaplamayla birebir aynıdır.
    indicators = {
        symbol: compute_frame(frame, "1h") for symbol, frame in hourly.items() if len(frame) > 260
    }
    closes = {symbol: frame["close"].to_numpy(dtype=float) for symbol, frame in hourly.items()}
    # `searchsorted` tz-aware ile naive damgayı karşılaştıramaz; hepsini
    # UTC-naive `datetime64[ns]`'e indiriyoruz (değerler zaten UTC).
    times = {
        symbol: frame["open_time"].dt.tz_convert(None).to_numpy(dtype="datetime64[ns]")
        for symbol, frame in hourly.items()
    }

    engine = ScoringEngine(use_pattern=False, use_candle=False, use_crowding=True)

    all_times = sorted({t for frame in hourly.values() for t in frame["open_time"]})
    all_times = all_times[260::step_hours]

    records: list[ScoredBar] = []
    for bar in all_times:
        day = pd.Timestamp(bar).normalize()
        symbols = by_date.get(day)
        if not symbols:
            continue
        bar_naive = pd.Timestamp(bar).tz_localize(None).to_datetime64()

        features: list[SymbolFeatures] = []
        cuts: dict[str, int] = {}
        for symbol in symbols:
            frame = indicators.get(symbol)
            if frame is None:
                continue
            cut = int(np.searchsorted(times[symbol], bar_naive, side="right"))
            if cut < 260:
                continue
            cuts[symbol] = cut
            row = frame.iloc[cut - 1]
            raw = {key: float(row.get(key, np.nan)) for key in FEATURE_KEYS if key in frame.columns}
            # S/R ve formasyon bu fazda yok — nötr bırakılır.
            raw.setdefault("rr_geometry", float("nan"))
            raw.setdefault("support_strength", float("nan"))
            raw["ema_alignment"] = _alignment(row)
            raw["price_over_ema200"] = _over_ema200(row)
            raw["trend_4h"] = float("nan")
            raw["trend_1d"] = float("nan")
            raw["rsi_position"] = float(row.get("rsi", np.nan))

            features.append(
                SymbolFeatures(
                    symbol=symbol,
                    bar_time=pd.Timestamp(bar).to_pydatetime(),
                    raw=raw,
                    ret_24h=float(row.get("ret_24h", np.nan)),
                    usable=True,
                )
            )

        if len(features) < 20:
            continue

        for result in engine.score_cross_section(features):
            cut = cuts[result.symbol]
            series = closes[result.symbol]
            base = series[cut - 1]
            records.append(
                ScoredBar(
                    bar_time=pd.Timestamp(bar).to_pydatetime(),
                    symbol=result.symbol,
                    score=result.score,
                    families=result.families,
                    fwd_4h=_forward(series, cut - 1, 4, base),
                    fwd_24h=_forward(series, cut - 1, 24, base),
                    fwd_72h=_forward(series, cut - 1, 72, base),
                )
            )

    table = pd.DataFrame(
        [
            {
                "bar_time": r.bar_time,
                "symbol": r.symbol,
                "score": r.score,
                **{f"family_{k}": v for k, v in r.families.items()},
                "fwd_4h": r.fwd_4h,
                "fwd_24h": r.fwd_24h,
                "fwd_72h": r.fwd_72h,
            }
            for r in records
        ]
    )
    out = DATA_DIR / "scores.parquet"
    table.to_parquet(out)
    print(f"{len(table)} puanlama · {table['bar_time'].nunique()} bar → {out}")
    return table


def _forward(series: np.ndarray, index: int, hours: int, base: float) -> float:
    target = index + hours
    if target >= len(series) or base <= 0:
        return float("nan")
    return float(series[target] / base - 1.0)


def _alignment(row) -> float:
    ema20, ema50, ema200 = row.get("ema20"), row.get("ema50"), row.get("ema200")
    if not all(isinstance(v, int | float) and math.isfinite(v) for v in (ema20, ema50, ema200)):
        return float("nan")
    if ema50 == 0 or ema200 == 0:
        return float("nan")
    return (ema20 - ema50) / ema50 + (ema50 - ema200) / ema200


def _over_ema200(row) -> float:
    close, ema200 = row.get("close"), row.get("ema200")
    if not (isinstance(ema200, int | float) and math.isfinite(ema200)) or ema200 == 0:
        return float("nan")
    return close / ema200 - 1.0


# --------------------------------------------------------------------------- #
#  4) Dört test
# --------------------------------------------------------------------------- #
def split_in_sample(table: pd.DataFrame) -> pd.DataFrame:
    """Son %30 kilitli. Bu fonksiyon dışında hiçbir yerde tam tabloya bakılmaz."""
    cutoff = table["bar_time"].quantile(1 - HOLDOUT_FRACTION)
    return table[table["bar_time"] <= cutoff].copy()


def portfolio_curve(
    table: pd.DataFrame,
    selector,
    cost_bps: float = COST_BPS,
    step_hours: int = 6,
) -> pd.Series:
    """`selector(bar_frame) -> list[symbol]` ile portföy eğrisi kurar.

    **Elde tutma süresi getirinin ufkuyla eşleşmek zorundadır.** 24 saatlik
    ileri getiriyi 6 saatte bir uygulamak aynı hareketi dört kez sayar ve
    maliyeti dört katına çıkarır — ilk sürümde portföy bu yüzden sıfıra
    gidiyordu. Bu yüzden yalnızca `REBALANCE_HOURS`'ta bir pozisyon alınır.
    """
    every = max(1, REBALANCE_HOURS // max(step_hours, 1))
    equity = 1.0
    points: dict[datetime, float] = {}
    bars = sorted(table["bar_time"].unique())

    for i, bar in enumerate(bars):
        if i % every != 0:
            points[bar] = equity
            continue
        frame = table[table["bar_time"] == bar]
        if frame.empty:
            points[bar] = equity
            continue
        chosen = selector(frame)
        if not chosen:
            points[bar] = equity
            continue
        realised = frame[frame["symbol"].isin(chosen)]["fwd_24h"].dropna()
        if realised.empty:
            points[bar] = equity
            continue
        # Yeniden dengeleme maliyeti: giriş + çıkış.
        equity *= (1 + float(realised.mean())) * (1 - 2 * cost_bps / 10_000)
        points[bar] = equity
    return pd.Series(points).sort_index()


def random_curve(table: pd.DataFrame, trials: int = 200, seed: int = 20260813) -> pd.DataFrame:
    """Devir-eşleştirilmiş rastgele portföy — aynı sayıda coin, rastgele seçim."""
    rng = np.random.default_rng(seed)
    finals: list[float] = []
    for _ in range(trials):
        curve = portfolio_curve(
            table,
            lambda frame: list(
                rng.choice(frame["symbol"].to_numpy(), size=min(TOP_N, len(frame)), replace=False)
            ),
        )
        if len(curve):
            finals.append(float(curve.iloc[-1]))
    return pd.DataFrame({"final": finals})


def report() -> None:
    table = pd.read_parquet(DATA_DIR / "scores.parquet")
    table["bar_time"] = pd.to_datetime(table["bar_time"], utc=True)
    in_sample = split_in_sample(table)

    print(f"Toplam {len(table)} gözlem · in-sample {len(in_sample)} (son %30 kilitli)")

    clean = in_sample.dropna(subset=["score", "fwd_24h"])
    families = {
        column.removeprefix("family_"): clean[column].to_numpy(dtype=float)
        for column in clean.columns
        if column.startswith("family_")
    }

    calibration = build_report(
        horizon="24h",
        times=[t.to_pydatetime() for t in clean["bar_time"]],
        scores=clean["score"].to_numpy(dtype=float),
        returns=clean["fwd_24h"].to_numpy(dtype=float),
        family_values=families,
    )

    top5 = portfolio_curve(clean, lambda f: list(f.nlargest(TOP_N, "score")["symbol"]))
    equal = portfolio_curve(clean, lambda f: list(f["symbol"]))
    randoms = random_curve(clean)

    top5_final = float(top5.iloc[-1]) if len(top5) else float("nan")
    equal_final = float(equal.iloc[-1]) if len(equal) else float("nan")
    percentile = (
        float((randoms["final"] < top5_final).mean() * 100) if len(randoms) else float("nan")
    )

    test1 = calibration.monotonic and (calibration.top_minus_bottom_p or 1) < 0.05
    positive_windows = (
        sum(1 for _, v in calibration.rolling_spearman if v > 0)
        / max(len(calibration.rolling_spearman), 1)
    )
    test2 = positive_windows > 0.5
    test3 = top5_final > equal_final
    test4 = percentile > 95

    verdict = (
        "EVET — dört testin dördü de geçti."
        if all((test1, test2, test3, test4))
        else "HAYIR — dört testin hepsi geçmedi; bu puanlama hipotezi doğrulanmadı."
    )

    lines = [
        "# Faz 0a — Doğrulama raporu",
        "",
        f"**Üretim tarihi:** {datetime.now(UTC).date()}",
        f"**Gözlem:** {len(clean)} puanlama · {clean['bar_time'].nunique()} bar · "
        f"{clean['symbol'].nunique()} sembol",
        f"**Kilitli out-of-sample:** son %{HOLDOUT_FRACTION * 100:.0f} — bu raporda kullanılmadı",
        "",
        "## Karar",
        "",
        f"> **{verdict}**",
        "",
        "## Dört test",
        "",
        "| # | Test | Sonuç | Değer |",
        "|---|---|---|---|",
        f"| 1 | Desil monotonluğu + anlamlılık | {'✅' if test1 else '❌'} | "
        f"monoton={calibration.monotonic}, p={_fmt(calibration.top_minus_bottom_p)} |",
        f"| 2 | Spearman pencerelerinin çoğu pozitif | {'✅' if test2 else '❌'} | "
        f"%{positive_windows * 100:.0f} pozitif, genel ρ={_fmt(calibration.spearman)} |",
        f"| 3 | Top-{TOP_N} vs eşit ağırlıklı | {'✅' if test3 else '❌'} | "
        f"{top5_final:.3f}× vs {equal_final:.3f}× |",
        f"| 4 | Top-{TOP_N} vs rastgele portföy | {'✅' if test4 else '❌'} | "
        f"rastgele dağılımın %{percentile:.0f}. yüzdeliği |",
        "",
        "## Desil grafiği (puan → ortalama 24s ileri getiri)",
        "",
        "| desil | gözlem | ort. getiri | %95 GA |",
        "|---|---|---|---|",
    ]
    for bucket in calibration.deciles:
        lines.append(
            f"| {bucket.decile} | {bucket.count} | %{bucket.mean_return * 100:.4f} | "
            f"%{bucket.ci_low * 100:.4f} … %{bucket.ci_high * 100:.4f} |"
        )

    lines += [
        "",
        "## Aile bazında bilgi katsayısı (IC)",
        "",
        "| aile | IC |",
        "|---|---|",
    ]
    for family, ic in sorted(calibration.family_ic.items()):
        lines.append(f"| {family} | {_fmt(ic)} |")

    lines += [
        "",
        "## Yorum",
        "",
        calibration.verdict,
        "",
        f"Rastgele portföy dağılımı: p05={randoms['final'].quantile(0.05):.3f}× · "
        f"p50={randoms['final'].median():.3f}× · p95={randoms['final'].quantile(0.95):.3f}×",
        "",
        "**Test 4 en önemlisidir.** Rastgele portföyü geçemiyorsa sıralama değer "
        "katmıyor demektir; getirinin kaynağı sadece devir ve yeniden dengelemenin "
        "mekanik etkisidir.",
        "",
        "## Sonraki adım",
        "",
        (
            "Sonuç olumluysa Faz 1'e geçilir."
            if all((test1, test2, test3, test4))
            else (
                "Sonuç olumsuz. **Ağırlıkları değiştirip tekrar denemeyin** — bu, aynı "
                "veri üzerinde arama yapmaktır. Hipotezi değiştirin (farklı özellik "
                "ailesi, farklı zaman dilimi, farklı evren) ve kilitli pencereye "
                "dokunmadan yeniden test edin. Denemeyi `TRIAL-LEDGER.md`'ye yazın."
            )
        ),
        "",
    ]

    out = RESEARCH_DIR / "PHASE-0A-REPORT.md"
    out.write_text("\n".join(lines), encoding="utf-8")
    print("\n".join(lines[:24]))
    print(f"\nRapor yazıldı: {out}")


def _fmt(value: float | None) -> str:
    if value is None or not math.isfinite(value):
        return "—"
    return f"{value:.4f}"


# --------------------------------------------------------------------------- #
def main() -> None:
    parser = argparse.ArgumentParser(description="Faz 0a doğrulama deneyi")
    sub = parser.add_subparsers(dest="command", required=True)

    fetch_cmd = sub.add_parser("fetch", help="arşivden veri indir")
    fetch_cmd.add_argument("--symbols", type=int, default=150)
    fetch_cmd.add_argument("--days", type=int, default=730)

    universe_cmd = sub.add_parser("universe", help="point-in-time evreni kur")
    universe_cmd.add_argument("--top-n", type=int, default=100)

    score_cmd = sub.add_parser("score", help="puanla ve ileri getirileri eşleştir")
    score_cmd.add_argument("--step-hours", type=int, default=6)

    sub.add_parser("report", help="dört testi çalıştır ve raporu üret")

    args = parser.parse_args()
    if args.command == "fetch":
        asyncio.run(fetch(args.symbols, args.days))
    elif args.command == "universe":
        build_universe(args.top_n)
    elif args.command == "score":
        score_all(args.step_hours)
    elif args.command == "report":
        report()


if __name__ == "__main__":
    main()
