"""Backtest koşucusu — **ayrı bir süreçte** çalışır.

Neden ayrı süreç: backtest motoru CPU-bağımlı ve senkron çalışır; bir barı
işlerken olay döngüsüne dönmez. API sürecinin içinde `asyncio.create_task` ile
koşturulduğunda tüm olay döngüsünü kilitliyordu — 2853 bar × 83 sembolluk bir
koşu API'yi 34 dakika boyunca %100 CPU'da tuttu ve panel hiç açılmadı, kimse
giriş yapamadı. Kodun eski yorumu bunu "v1'de tek makine, tek koşu" diye kabul
ediyordu; bedeli servisin tamamen durması olduğu için kabul edilemez.

Bu modül `sarnic backtest-run <id>` komutunun gövdesidir. API yalnızca süreci
başlatır ve hemen döner; koşunun tüm yaşam döngüsü (durum güncellemeleri,
sonuç yazımı, olay yayını) burada, çocuk süreçte olur. Süreç çökerse API
etkilenmez; API yeniden başlarsa koşu etkilenmez.
"""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import select

from sarnic.backtest.engine import BacktestEngine, BacktestParams, summarize
from sarnic.core.enums import EventKind
from sarnic.core.events import get_event_bus
from sarnic.core.logging import get_logger
from sarnic.db.models import Backtest, BacktestResult, StrategyVersion
from sarnic.db.session import session_scope
from sarnic.strategy.definition import StrategyDefinition

log = get_logger(__name__)


async def run_backtest_job(backtest_id: int) -> None:
    """Koşuyu yürütür; sonucu DB'ye yazar ve `backtest.finished` yayınlar."""
    bus = get_event_bus()
    try:
        async with session_scope() as session:
            backtest = (
                await session.execute(select(Backtest).where(Backtest.id == backtest_id))
            ).scalar_one()
            backtest.status = "RUNNING"
            backtest.started_at = datetime.now(UTC)

            version = (
                await session.execute(
                    select(StrategyVersion).where(
                        StrategyVersion.id == backtest.strategy_version_id
                    )
                )
            ).scalar_one()
            params = backtest.params
            definition = StrategyDefinition.from_dict(version.definition)

        engine = BacktestEngine(
            definition,
            BacktestParams(
                start=datetime.fromisoformat(params["start"]),
                end=datetime.fromisoformat(params["end"]),
                initial_equity=float(params.get("initial_equity", 5000.0)),
                symbols=list(params.get("symbols") or []),
                use_holdout=bool(params.get("use_holdout", False)),
                with_patterns=bool(params.get("with_patterns", True)),
            ),
        )

        async with session_scope() as session:
            report = await engine.run(session)

        async with session_scope() as session:
            backtest = (
                await session.execute(select(Backtest).where(Backtest.id == backtest_id))
            ).scalar_one()
            backtest.status = "DONE"
            backtest.finished_at = datetime.now(UTC)
            backtest.approximate_universe = report.approximate_universe
            backtest.params = {
                **backtest.params,
                "universe_note": report.universe_note,
                "walk_forward": report.walk_forward,
            }
            for scenario in report.scenarios:
                data = scenario.as_dict()
                session.add(
                    BacktestResult(
                        backtest_id=backtest_id,
                        cost_scenario=scenario.cost_scenario,
                        metrics=data["metrics"],
                        equity_curve=data["equity_curve"],
                        trades=data["trades"],
                        benchmarks=data["benchmarks"],
                        flags=data["flags"],
                    )
                )

        await bus.emit(
            EventKind.BACKTEST_FINISHED,
            backtest_id=backtest_id,
            message=summarize(report),
            approximate_universe=report.approximate_universe,
        )
    except Exception as exc:
        log.exception("backtest_failed", backtest_id=backtest_id)
        async with session_scope() as session:
            backtest = (
                await session.execute(select(Backtest).where(Backtest.id == backtest_id))
            ).scalar_one()
            backtest.status = "FAILED"
            backtest.error = str(exc)[:2000]
            backtest.finished_at = datetime.now(UTC)
