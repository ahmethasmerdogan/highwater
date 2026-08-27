"""SARNIÇ komut satırı.

sarnic bootstrap              ilk yöneticiyi ve varsayılan stratejiyi oluşturur
sarnic api                    FastAPI'yi çalıştırır
sarnic marketdata             MarketDataService (tek örnek çalışır)
sarnic supervisor             BotSupervisor
sarnic worker <bot_id>        tek bot worker'ı (süpervizör çağırır)
sarnic notifier               olay → bildirim/Discord köprüsü
sarnic tui                    terminal arayüzü
sarnic backfill               arşivden geçmiş veri doldurur
sarnic universe-refresh       havuzu yeniler ve snapshot yazar
sarnic observations           ileri getirileri hesaplar (kalibrasyon besleyicisi)
"""

from __future__ import annotations

import asyncio
import os
import secrets
from datetime import UTC, datetime, timedelta
from pathlib import Path

import typer
from sqlalchemy import func, select

from sarnic.config import settings
from sarnic.core.enums import Role
from sarnic.core.logging import configure_logging, get_logger
from sarnic.core.observability import init_sentry, start_metrics_server
from sarnic.core.security import generate_totp_secret, hash_password, totp_provisioning_uri
from sarnic.db.models import Strategy, StrategyVersion, User
from sarnic.db.session import session_scope
from sarnic.strategy.definition import DEFAULT_STRATEGY

app = typer.Typer(help="SARNIÇ — paper işlem sistemi", no_args_is_help=True)
log = get_logger(__name__)


# --------------------------------------------------------------------------- #
@app.command()
def bootstrap() -> None:
    """İlk yöneticiyi ve varsayılan stratejiyi oluşturur. Tekrar çalıştırmak güvenlidir."""
    configure_logging()
    asyncio.run(_bootstrap())


async def _bootstrap() -> None:
    async with session_scope() as session:
        count = int((await session.execute(select(func.count(User.id)))).scalar_one())
        if count == 0:
            password = settings.bootstrap_admin_password or secrets.token_urlsafe(16)
            secret = generate_totp_secret()
            user = User(
                email=settings.bootstrap_admin_email.lower(),
                password_hash=hash_password(password),
                role=Role.ADMIN,
                display_name="Yönetici",
                totp_secret=secret,
                totp_enabled=False,
            )
            session.add(user)
            typer.secho("\n  İlk yönetici oluşturuldu", fg=typer.colors.GREEN, bold=True)
            typer.echo(f"  e-posta : {user.email}")
            typer.echo(f"  parola  : {password}")
            typer.echo(f"  TOTP    : {secret}")
            typer.echo(f"  URI     : {totp_provisioning_uri(secret, user.email)}")
            typer.secho(
                "  Bu bilgiler bir daha gösterilmeyecek. Şimdi kaydedin.\n",
                fg=typer.colors.YELLOW,
            )
        else:
            typer.echo(f"{count} kullanıcı zaten var — yönetici oluşturulmadı.")

        strategies = int((await session.execute(select(func.count(Strategy.id)))).scalar_one())
        if strategies == 0:
            strategy = Strategy(name=DEFAULT_STRATEGY.name)
            session.add(strategy)
            await session.flush()
            session.add(
                StrategyVersion(
                    strategy_id=strategy.id,
                    version=1,
                    definition=DEFAULT_STRATEGY.to_dict(),
                    definition_hash=DEFAULT_STRATEGY.hash(),
                )
            )
            typer.echo(f"Varsayılan strateji oluşturuldu: {DEFAULT_STRATEGY.name} v1")


# --------------------------------------------------------------------------- #
@app.command()
def api(host: str = settings.api_host, port: int = settings.api_port, reload: bool = False) -> None:
    """FastAPI sunucusunu çalıştırır."""
    import uvicorn

    # Erişim kaydı kapalı: panel 10-20 saniyede bir yokluyor ve API logunun
    # %99'unu `INFO: GET /portfolio/live` satırları kaplıyordu — uygulamanın
    # kendi olayları (hata, denetim, backtest) arasında kayboluyordu. İstek
    # düzeyinde iz gerektiğinde `SARNIC_ACCESS_LOG=1` ile açılır.
    access = os.environ.get("SARNIC_ACCESS_LOG") == "1"
    uvicorn.run("sarnic.api.main:app", host=host, port=port, reload=reload, access_log=access)


@app.command()
def marketdata(
    backfill_days: int = typer.Option(0, help="Başlarken kaç günlük geçmişi doldursun"),
) -> None:
    """MarketDataService — piyasa verisinin **tek** çıkış noktası (bozulmaz kural 5)."""
    configure_logging()
    init_sentry("marketdata")
    start_metrics_server(settings.metrics_port_marketdata, "marketdata")
    asyncio.run(_marketdata(backfill_days))


async def _seed_symbols(service, count: int = 40) -> list[str]:
    """İlk kurulum için hacme göre ilk N USDT çifti.

    Yalnızca havuz hiç kurulmamışken kullanılır ve **karar vermez** — tek işi
    spread örneklemesinin başlayabilmesi için derinlik akışı açmaktır. Eleme
    kararlarını her zaman `UniverseEngine` verir.
    """
    from sarnic.universe.filters import STABLECOINS, is_leveraged_token

    tickers = await service.rest.ticker_24h()
    candidates = []
    for ticker in tickers:
        symbol = ticker.symbol
        if not symbol.endswith("USDT"):
            continue
        base = symbol[: -len("USDT")]
        if base in STABLECOINS or is_leveraged_token(base):
            continue
        candidates.append((float(ticker.quote_volume), symbol))
    candidates.sort(reverse=True)
    return [symbol for _, symbol in candidates[:count]]


async def _open_position_symbols(session) -> list[str]:
    """Açık pozisyonu olan semboller.

    Bunlar havuzdan düşmüş olsa bile izlenmek **zorundadır**: emir defteri
    gelmeyen bir sembolde çıkış emri dolamaz, yani stop tetiklense bile pozisyon
    açık kalır. `set_book_symbols` bunu zaten varsayıyordu ("açık pozisyon ve
    aday coinler") ama çağıran taraf hiç geçirmiyordu.
    """
    from sqlalchemy import select

    from sarnic.core.enums import PositionStatus
    from sarnic.db.models import Position

    rows = await session.execute(
        select(Position.symbol).where(Position.status == PositionStatus.OPEN)
    )
    return sorted(set(rows.scalars()))


def _book_selection(symbols: list[str], open_symbols: list[str], limit: int = 150) -> list[str]:
    """Derinlik akışı listesi: önce açık pozisyonlar, sonra havuz sırası.

    Sınır 40'tı ve havuz 82'ye çıkınca yarısından fazlası defterden yoksun
    kaldı: bot o sembollere giriş denediğinde kağıt motoru emri
    `emir defteri yok` diyerek reddediyordu (`paper_rejected`). Havuz büyüdükçe
    sessizce artan bir kayıptı.

    Sınır artık havuzu rahatça kapsıyor. Bedeli akış sayısıdır, ağırlık değil
    (WS ağırlık tüketmez); derinlik akışı 100ms yerine 1000ms'ye alındığı için
    trafik yine de eskisinin altında."""
    ordered = list(dict.fromkeys([*open_symbols, *symbols]))
    return ordered[:limit]


def _tracked_set(symbols: list[str], open_symbols: list[str]) -> list[str]:
    """İzlenecek semboller: havuz + açık pozisyonlar + piyasa referansı.

    Referans sembol (`settings.reference_symbol`) bir işlem adayı değil, rejim
    çarpanının ölçü aletidir. Havuzun volatilite filtresi onu düzenli olarak
    eliyor (BTC çoğu zaman havuzun alt volatilite eşiğinin altında) ve elenince
    hiçbir dilimi akmıyordu: 1h/4h/1d verisi 10 saat geride kalmıştı, yani rejim
    kontrolü eski fiyatla karar veriyordu (`SYSTEM-REVIEW` §2).
    """
    return sorted(set(symbols) | set(open_symbols) | {settings.reference_symbol})


@app.command()
def equitydata() -> None:
    """Hisse verisi servisi — BIST (İş Yatırım) + ABD (Yahoo), günlük bar.

    Kural 5'in hisse ayağı: hisse verisi de tek yerden çekilir. Kripto
    servisinden ayrı çalışır; Binance bütçesine dokunmaz.
    """
    configure_logging()
    init_sentry("equitydata")
    start_metrics_server(settings.metrics_port_equitydata, "equitydata")
    asyncio.run(_equitydata())


async def _equitydata() -> None:
    import redis.asyncio as aioredis

    from sarnic.db.session import wait_for_db

    await wait_for_db()

    from sarnic.data.equities import EquityDataService

    async def redis_factory():
        return aioredis.from_url(settings.redis_url, decode_responses=True)

    service = EquityDataService(redis_factory)
    try:
        await service.run()
    finally:
        service.stop()


async def _marketdata(backfill_days: int) -> None:
    import redis.asyncio as aioredis

    from sarnic.db.session import wait_for_db

    await wait_for_db()

    from sarnic.data.marketdata import MarketDataService
    from sarnic.universe.engine import UniverseEngine

    service = MarketDataService()
    redis = aioredis.from_url(settings.redis_url, decode_responses=True)

    async with session_scope() as session:
        symbols = await UniverseEngine().current_symbols(session)
        open_symbols = await _open_position_symbols(session)

    if symbols:
        service.set_tracked(_tracked_set(symbols, open_symbols))
        service.set_book_symbols(_book_selection(symbols, open_symbols))
    else:
        # Başlatma açmazı: havuz boşken derinlik akışı da boş olur, spread
        # örneği birikmez ve `SpreadFilter` her adayı eler — havuz sonsuza dek
        # boş kalır. İlk kurulumda aday listesini doğrudan hacim sıralamasından
        # tohumluyoruz ki spread örneklemesi başlayabilsin.
        seeds = await _seed_symbols(service)
        log.warning(
            "marketdata_bootstrap",
            message=(
                f"Havuz boş — spread örneklemesi için hacme göre ilk {len(seeds)} "
                "sembol geçici olarak izleniyor. İlk universe-refresh sonrası "
                "gerçek havuza geçilecek."
            ),
        )
        service.set_tracked(_tracked_set(seeds, open_symbols))
        service.set_book_symbols(_book_selection(seeds, open_symbols))
        symbols = seeds

    if backfill_days > 0 and symbols:
        # Servisin **kendi** dilim listesi kullanılır. Elle yazılmış ("1h","1d")
        # çifti, akıtılan dilim sayısı arttıkça geride kalıyordu: 15m/30m/4h
        # dolgusuz başlıyor ve o dilimlerin geçmişi yalnızca WS ile, yani
        # bundan sonrasıyla birikiyordu.
        for tf in service.timeframes:
            for symbol in symbols:
                await service.backfill(symbol, tf, days=backfill_days)

    await service.start()
    try:
        while True:
            await asyncio.sleep(3600)
            async with session_scope() as session:
                current = await UniverseEngine().current_symbols(session)
                open_symbols = await _open_position_symbols(session)
            wanted = _tracked_set(current, open_symbols)
            if set(wanted) != service.tracked_symbols:
                service.set_tracked(wanted)
                service.set_book_symbols(_book_selection(current, open_symbols))
                await service.restart_streams()
    except (KeyboardInterrupt, asyncio.CancelledError):
        pass
    finally:
        await service.stop()
        await redis.aclose()


@app.command()
def supervisor() -> None:
    """Bot süpervizörü — worker süreçlerini yönetir, havuzu yeniler."""
    from sarnic.bots.supervisor import run_supervisor

    init_sentry("supervisor")
    start_metrics_server(settings.metrics_port_supervisor, "supervisor")

    async def _run() -> None:
        from sarnic.db.session import wait_for_db

        await wait_for_db()
        await run_supervisor()

    asyncio.run(_run())


@app.command()
def worker(bot_id: int) -> None:
    """Tek bot worker'ı. Normalde doğrudan çağrılmaz; süpervizör çağırır."""
    from sarnic.bots.worker import run_worker

    init_sentry("worker")
    start_metrics_server(settings.metrics_port_worker_base + bot_id, f"worker-{bot_id}")
    asyncio.run(run_worker(bot_id))


@app.command()
def notifier() -> None:
    """Olay veriyolunu bildirimlere ve Discord'a bağlar."""
    from sarnic.notify.service import run_notifier

    init_sentry("notifier")
    start_metrics_server(settings.metrics_port_notifier, "notifier")

    async def _run() -> None:
        from sarnic.db.session import wait_for_db

        await wait_for_db()
        await run_notifier()

    asyncio.run(_run())


@app.command()
def tui(url: str = settings.api_base_url) -> None:
    """Terminal arayüzü. Bot değildir — ona bağlanan bir istemcidir (bozulmaz kural 4)."""
    from sarnic.tui.app import run_tui

    run_tui(url)


@app.command()
def konsol(url: str = settings.api_base_url) -> None:
    """Açılış konsolu — fastfetch tarzı durum kartı + canlı AL/SAT akışı.

    Sistem açılışında bir terminalde çalışır; kural 4 gereği istemcidir.
    """
    from sarnic.tui.konsol import run_konsol

    run_konsol(url)


# --------------------------------------------------------------------------- #
@app.command()
def backfill(
    days: int = typer.Option(400, help="Kaç günlük geçmiş"),
    timeframes: str = typer.Option("1h,1d", help="Virgülle ayrılmış zaman dilimleri"),
    symbols: str = typer.Option("", help="Boş bırakılırsa havuzdaki semboller"),
    candidates: bool = typer.Option(
        False,
        "--candidates",
        help="Havuz yerine **aday kümesini** doldur (hacme göre ilk N×2 sembol)",
    ),
    archive_only: bool = typer.Option(
        False,
        "--archive-only",
        help="REST adımını atla — sıfır ağırlık harcar, çalışan servisle çakışmaz",
    ),
    audit: bool = typer.Option(
        True, "--audit/--no-audit", help="Dolgudan sonra veri kalitesi denetimi çalışsın mı"
    ),
) -> None:
    """`data.binance.vision` arşivinden toplu geçmiş doldurma.

    `--candidates --archive-only --no-audit` üçlüsü, çalışan bir sistemde
    aday kümesinin geçmişini güvenle doldurmak için tasarlandı (SYSTEM-REVIEW
    §5b). Gerekçeler `_backfill` içinde yazılı.
    """
    configure_logging()
    asyncio.run(
        _backfill(
            days,
            [t.strip() for t in timeframes.split(",") if t.strip()],
            symbols,
            candidates=candidates,
            archive_only=archive_only,
            audit=audit,
        )
    )


async def _backfill(
    days: int,
    timeframes: list[str],
    symbols_arg: str,
    *,
    candidates: bool = False,
    archive_only: bool = False,
    audit: bool = True,
) -> None:
    """Sembol kümesini seçer ve toplu dolguyu sürer.

    **Aday kümesi neden havuzdan farklı.** Havuz filtrelerden geçmiş nihai
    listedir; aday kümesi ise filtrelerin *önündeki* havuzdur —
    `UniverseEngine.build_candidates` hacme göre ilk `volume_prefilter_n × 2`
    sembolü alır ve 1d çerçevelerini onlar için yükler. Volatilite filtresinin
    veri yokluğu yüzünden değil gerçekten volatiliteye göre elemesi isteniyorsa
    doldurulması gereken küme budur.

    **Sembol listesi Redis'ten okunur, borsadan değil.** Çalışan
    `MarketDataService` ticker'ları zaten Redis'e yazıyor; oradan okumak
    fazladan tek bir istek bile üretmez.
    """
    import redis.asyncio as aioredis

    from sarnic.data.marketdata import bulk_backfill, read_tickers
    from sarnic.universe.engine import UniverseEngine
    from sarnic.universe.filters import UniverseConfig

    if symbols_arg:
        symbols = [s.strip().upper() for s in symbols_arg.split(",") if s.strip()]
    elif candidates:
        cfg = UniverseConfig()
        redis = aioredis.from_url(settings.redis_url, decode_responses=True)
        try:
            tickers = await read_tickers(redis)
        finally:
            await redis.aclose()
        if not tickers:
            typer.secho(
                "Redis'te ticker yok. Piyasa verisi servisi çalışıyor mu?",
                fg=typer.colors.RED,
            )
            raise typer.Exit(1)
        ranked = sorted(
            (
                (sym, float(t["quote_volume"]))
                for sym, t in tickers.items()
                if sym.endswith(cfg.quote_asset)
            ),
            key=lambda x: -x[1],
        )[: cfg.volume_prefilter_n * 2]
        symbols = [s for s, _ in ranked]
    else:
        async with session_scope() as session:
            symbols = await UniverseEngine().current_symbols(session)

    if not symbols:
        typer.secho(
            "Sembol listesi boş. `--candidates` verin, `sarnic universe-refresh` "
            "çalıştırın ya da `--symbols` ile elle liste geçin.",
            fg=typer.colors.RED,
        )
        raise typer.Exit(1)

    typer.echo(
        f"{len(symbols)} sembol × {len(timeframes)} dilim · {days} gün"
        f"{' · yalnızca arşiv (sıfır ağırlık)' if archive_only else ''}"
        f"{'' if audit else ' · denetim kapalı'}"
    )

    def progress(done: int, total: int, label: str, written: int) -> None:
        # Her satır değil, her %2'de bir: 1000 satırlık çıktı okunmaz.
        if done == total or done % max(1, total // 50) == 0:
            typer.echo(f"  [{done:>4}/{total}] {label:<20} +{written} bar")

    stats = await bulk_backfill(
        symbols,
        timeframes,
        days=days,
        archive_only=archive_only,
        audit=audit,
        progress=progress,
    )
    total = sum(stats.values())
    filled = sum(1 for v in stats.values() if v > 0)
    typer.echo(
        f"Bitti: {total} bar yazıldı · {filled}/{len(stats)} sembol-dilim çiftinde veri bulundu."
    )


@app.command(name="universe-refresh")
def universe_refresh(reason: str = "manual") -> None:
    """Havuzu yeniler ve **snapshot yazar** (bozulmaz kural 3)."""
    configure_logging()
    asyncio.run(_universe_refresh(reason))


async def _universe_refresh(reason: str) -> None:
    import redis.asyncio as aioredis

    from sarnic.universe.engine import UniverseEngine, UniverseInputUnavailable

    redis = aioredis.from_url(settings.redis_url, decode_responses=True)
    try:
        try:
            async with session_scope() as session:
                result = await UniverseEngine().refresh(session, redis, reason=reason)
        except UniverseInputUnavailable as exc:
            typer.echo(f"Havuz yenilenmedi: {exc}")
            raise typer.Exit(code=1) from exc
        typer.echo(
            f"Havuz: {len(result.symbols)} sembol · giren {len(result.added)} · "
            f"çıkan {len(result.removed)} · snapshot #{result.snapshot_id}"
        )
        for step in result.funnel:
            typer.echo(
                f"  {step['index']:2}. {step['name']:24} kaldı {step['kept']:4}  "
                f"elendi {step['dropped']:4}"
            )
    finally:
        await redis.aclose()


@app.command(name="dev-credentials")
def dev_credentials(
    email: str = typer.Option("", help="Boş bırakılırsa ilk ADMIN kullanılır"),
    write_env: bool = typer.Option(True, help="apps/web/.env.local dosyasını yaz"),
) -> None:
    """Panelin giriş formunu otomatik dolduracak `.env.local` dosyasını üretir.

    **Yalnızca geliştirme içindir.** Yazılan dosya `.gitignore` kapsamındadır ve
    panel bu değerleri yalnızca `next dev` altında okur.
    """
    configure_logging()
    asyncio.run(_dev_credentials(email, write_env))


async def _dev_credentials(email: str, write_env: bool) -> None:
    import pyotp

    async with session_scope() as session:
        stmt = select(User).where(User.role == Role.ADMIN).order_by(User.id)
        if email:
            stmt = select(User).where(User.email == email.lower())
        user = (await session.execute(stmt)).scalars().first()

    if user is None:
        typer.secho("Yönetici bulunamadı. Önce `sarnic bootstrap` çalıştırın.", fg=typer.colors.RED)
        raise typer.Exit(1)

    password = settings.bootstrap_admin_password
    secret = user.totp_secret or ""

    typer.echo(f"\n  e-posta : {user.email}")
    typer.echo(f"  parola  : {password or '(.env içindeki SARNIC_BOOTSTRAP_ADMIN_PASSWORD boş)'}")
    typer.echo(f"  TOTP    : {secret}")
    if secret:
        typer.echo(f"  şu anki kod: {pyotp.TOTP(secret).now()}")

    if not write_env:
        return
    if not password:
        typer.secho(
            "\n.env.local yazılmadı: SARNIC_BOOTSTRAP_ADMIN_PASSWORD boş.",
            fg=typer.colors.YELLOW,
        )
        return

    # cli.py → sarnic → engine → apps ; kardeş klasör `web`.
    target = Path(__file__).resolve().parents[2] / "web" / ".env.local"
    target.write_text(
        "# Otomatik üretildi: `sarnic dev-credentials`\n"
        "# Yalnızca geliştirme. Panel bu değerleri `next dev` altında okur;\n"
        "# üretim derlemesinde otomatik doldurma kodu tamamen devre dışıdır.\n"
        f"NEXT_PUBLIC_DEV_EMAIL={user.email}\n"
        f"NEXT_PUBLIC_DEV_PASSWORD={password}\n"
        f"NEXT_PUBLIC_DEV_TOTP_SECRET={secret}\n",
        encoding="utf-8",
    )
    typer.secho(f"\n{target} yazıldı — paneli yeniden başlatın.", fg=typer.colors.GREEN)


@app.command()
def observations(days: int = 30) -> None:
    """Puanların ileri getirilerini hesaplar — kalibrasyon sayfasının besleyicisi (§5.5)."""
    configure_logging()
    asyncio.run(_observations(days))


async def _observations(days: int) -> None:
    from sarnic.scoring.observations import backfill_observations

    async with session_scope() as session:
        written = await backfill_observations(
            session, since=datetime.now(UTC) - timedelta(days=days)
        )
    typer.echo(f"{written} gözlem güncellendi.")


@app.command()
def backtest(
    strategy_version_id: int,
    start: str = typer.Option(..., help="ISO tarih, örn. 2025-01-01"),
    end: str = typer.Option(..., help="ISO tarih"),
    equity: float = 5000.0,
    holdout: bool = typer.Option(False, help="Kilitli out-of-sample penceresini kullan"),
) -> None:
    """Komut satırından backtest. Sonucu özetler."""
    configure_logging()
    asyncio.run(_backtest(strategy_version_id, start, end, equity, holdout))


async def _backtest(version_id: int, start: str, end: str, equity: float, holdout: bool) -> None:
    from sarnic.backtest.engine import BacktestEngine, BacktestParams, summarize

    async with session_scope() as session:
        version = (
            await session.execute(select(StrategyVersion).where(StrategyVersion.id == version_id))
        ).scalar_one()
        from sarnic.strategy.definition import StrategyDefinition

        definition = StrategyDefinition.from_dict(version.definition)
        engine = BacktestEngine(
            definition,
            BacktestParams(
                start=datetime.fromisoformat(start).replace(tzinfo=UTC),
                end=datetime.fromisoformat(end).replace(tzinfo=UTC),
                initial_equity=equity,
                use_holdout=holdout,
            ),
        )
        report = await engine.run(session)

    typer.echo(summarize(report))
    for scenario in report.scenarios:
        m = scenario.metrics
        typer.echo(
            f"  {scenario.cost_scenario:5} · işlem {m.trades:4} · getiri "
            f"%{m.total_return * 100:7.2f} · Sharpe {m.sharpe if m.sharpe == m.sharpe else 0:5.2f} "
            f"· maks DD %{abs(m.max_drawdown) * 100:5.2f}"
        )
    for bench in report.scenarios[0].benchmarks:
        if bench.metrics:
            typer.echo(f"  kıyas: {bench.name:38} getiri %{bench.metrics.total_return * 100:7.2f}")


# --------------------------------------------------------------------------- #
@app.command(name="backtest-run")
def backtest_run(backtest_id: int = typer.Argument(..., help="Koşulacak backtest kaydı")) -> None:
    """Kuyruğa alınmış bir backtest'i çalıştırır.

    API bu komutu **ayrı bir süreç olarak** başlatır. Backtest motoru
    CPU-bağımlı ve senkron olduğu için API'nin olay döngüsünde koşturulduğunda
    servisi tamamen kilitliyordu (bkz. `backtest/runner.py`).
    """
    configure_logging()
    from sarnic.backtest.runner import run_backtest_job

    asyncio.run(run_backtest_job(backtest_id))


# --------------------------------------------------------------------------- #
@app.command(name="score-backfill")
def score_backfill(
    days: int = typer.Option(60, help="Kaç günlük geçmiş için puan üretilsin"),
    bot_id: int = typer.Option(0, help="Hangi botun ayarları kullanılsın (0 = ilk bot)"),
) -> None:
    """Geçmiş puanları üretir — kalibrasyonu ölçülebilir kılar.

    `scores` tablosu yalnızca canlı çalışmanın başladığı andan itibaren dolu
    olduğu için kalibrasyon tek günlük bir kesitle konuşuyordu. Bu komut geçmiş
    barları yürüyüp puanları yazar; ardından `sarnic observations` ileri
    getirileri hesaplar ve ölçüm aylara yayılır.

    Ayrı bir puanlama kodu yoktur: `BacktestEngine`'in kendi yolları kullanılır
    (bozulmaz kural 1).
    """
    configure_logging()
    asyncio.run(_score_backfill(days, bot_id))


async def _score_backfill(days: int, bot_id: int) -> None:
    from sarnic.db.models import Bot
    from sarnic.scoring.backfill import backfill_scores, pool_symbols
    from sarnic.strategy.definition import StrategyDefinition

    async with session_scope() as session:
        stmt = select(Bot).where(Bot.id == bot_id) if bot_id else select(Bot).order_by(Bot.id)
        bot = (await session.execute(stmt)).scalars().first()
        if bot is None:
            typer.secho("Bot bulunamadı.", fg=typer.colors.RED)
            raise typer.Exit(1)
        version = (
            await session.execute(
                select(StrategyVersion).where(StrategyVersion.id == bot.strategy_version_id)
            )
        ).scalar_one()
        definition = StrategyDefinition.from_dict(version.definition)
        symbols = await pool_symbols(session, days=days)
        bot_name = bot.name

    if not symbols:
        typer.secho("Havuz boş — önce `sarnic universe-refresh`.", fg=typer.colors.RED)
        raise typer.Exit(1)

    typer.echo(f"{bot_name} ({definition.timeframe}) · {len(symbols)} sembol · {days} gün")

    def progress(done: int, total: int, written: int) -> None:
        typer.echo(f"  [{done:>5}/{total}] {written} puan satırı")

    async with session_scope() as session:
        total = await backfill_scores(session, definition, symbols, days=days, progress=progress)
    typer.echo(f"Bitti: {total} puan satırı. Şimdi: sarnic observations --days {days}")


if __name__ == "__main__":
    app()
