"""Olay veriyolu testleri — §14 Redis Streams.

Bu dosya, `listen()` her 5 saniyede bir `event_read_failed` üretirken yazıldı:
`redis-py` 8 `socket_timeout` varsayılanını 5 saniye yaptı ve `xread(block=5000)`
bununla birebir yarıştı. Hata yakalanıp `continue` edildiği için sistem "çalışıyor"
görünüyordu; gerçekte dinleme bağlantısı saniyede bir kopup kuruluyordu.

Redis gerektiren testler, Redis yoksa atlanır — CI'da kırmızı yanıp söndürmez.
"""

from __future__ import annotations

import asyncio
import contextlib
from datetime import UTC, datetime

import pytest
import redis.asyncio as aioredis

from sarnic.core.enums import EventKind
from sarnic.core.events import (
    LISTEN_TIMEOUT_MARGIN,
    STREAM_KEY,
    Event,
    EventBus,
)

REDIS_URL = "redis://localhost:6379/15"  # 15 = test veritabanı, üretimden ayrı


# --------------------------------------------------------------------------- #
# Redis gerektirmeyen testler
# --------------------------------------------------------------------------- #
def test_event_roundtrip():
    event = Event(
        kind=EventKind.POSITION_OPENED,
        payload={"symbol": "BTCUSDT", "qty": 0.5},
        bot_id=3,
        symbol="BTCUSDT",
        at=datetime(2026, 8, 16, 12, 0, tzinfo=UTC),
    )
    restored = Event.from_fields({"data": event.to_json()})

    assert restored.kind == str(EventKind.POSITION_OPENED)
    assert restored.payload == {"symbol": "BTCUSDT", "qty": 0.5}
    assert restored.bot_id == 3
    assert restored.at == event.at


def test_json_handles_decimal_and_datetime():
    """`Decimal` fiyatlar ve `datetime` alanlar yayında patlamamalı."""
    from decimal import Decimal

    event = Event(kind=EventKind.LOG, payload={"price": Decimal("1.25"), "t": datetime.now(UTC)})
    assert '"price": 1.25' in event.to_json()


def test_listen_socket_timeout_exceeds_block_window():
    """Asıl regresyon: soket zaman aşımı blok süresinden **büyük** olmalı.

    Eşit olduğunda okuma her turda zaman aşımına düşer; bu, canlı akışın
    haftalarca sessizce kopuk kalmasının nedeniydi.
    """
    block_ms = 5000
    socket_timeout = block_ms / 1000 + LISTEN_TIMEOUT_MARGIN
    assert socket_timeout > block_ms / 1000
    assert socket_timeout - block_ms / 1000 >= 5, "pay çok dar — yarış geri gelir"


# --------------------------------------------------------------------------- #
# Redis gerektiren testler
# --------------------------------------------------------------------------- #
async def _redis_available() -> bool:
    client = aioredis.from_url(REDIS_URL, socket_connect_timeout=1)
    try:
        await client.ping()
        return True
    except Exception:
        return False
    finally:
        await client.aclose()


@pytest.fixture
async def bus():
    if not await _redis_available():
        pytest.skip("Redis çalışmıyor")
    client = aioredis.from_url(REDIS_URL, decode_responses=True)
    await client.delete(STREAM_KEY)
    bus = EventBus(url=REDIS_URL)
    try:
        yield bus
    finally:
        await bus.close()
        await client.delete(STREAM_KEY)
        await client.aclose()


async def _start_reader(bus: EventBus, count: int) -> tuple[list[Event], asyncio.Task]:
    """Dinlemeyi başlatır; `count` olay toplayınca görev kendiliğinden biter."""
    events: list[Event] = []

    async def reader() -> None:
        async for _entry_id, event in bus.listen(last_id="$"):
            events.append(event)
            if len(events) >= count:
                return

    task = asyncio.create_task(reader())
    # Dinleyicinin imleci çözmesi için kısa bir soluk — yayın öncesi hazır olmalı.
    await asyncio.sleep(0.5)
    return events, task


async def test_publish_then_listen_delivers(bus):
    events, task = await _start_reader(bus, 2)

    await bus.emit(EventKind.LOG, message="birinci")
    await bus.emit(EventKind.POSITION_OPENED, symbol="ETHUSDT")

    with contextlib.suppress(TimeoutError):
        await asyncio.wait_for(task, timeout=10)
    task.cancel()

    assert len(events) == 2
    assert events[0].payload["message"] == "birinci"
    assert events[1].symbol == "ETHUSDT"


async def test_listen_survives_longer_than_block_window(bus):
    """Blok penceresinden (5 sn) **uzun** sessizlikten sonra olay yine gelmeli.

    Eski kodda dinleme bu noktada çoktan kopmuş olurdu.
    """
    events, task = await _start_reader(bus, 1)

    await asyncio.sleep(7)  # bir tam blok penceresinden uzun sessizlik
    await bus.emit(EventKind.LOG, message="sessizlikten sonra")

    with contextlib.suppress(TimeoutError):
        await asyncio.wait_for(task, timeout=10)
    task.cancel()

    assert [e.payload["message"] for e in events] == ["sessizlikten sonra"]


async def test_history_returns_chronological_order(bus):
    for i in range(3):
        await bus.emit(EventKind.LOG, message=f"olay-{i}")

    history = await bus.history(count=10)
    assert [e.payload["message"] for e in history] == ["olay-0", "olay-1", "olay-2"]


async def test_history_caps_at_count(bus):
    for i in range(12):
        await bus.emit(EventKind.LOG, message=str(i))

    assert len(await bus.history(count=5)) == 5


async def test_resolve_cursor_on_empty_stream(bus):
    client = await bus.connect()
    assert await EventBus._resolve_cursor(client, "$") == "0-0"


async def test_resolve_cursor_returns_last_id(bus):
    await bus.emit(EventKind.LOG, message="x")
    client = await bus.connect()
    cursor = await EventBus._resolve_cursor(client, "$")

    assert cursor != "$" and cursor != "0-0"
    # Somut imleçle okuduğumuzda o olay **tekrar** gelmemeli.
    assert await client.xread({STREAM_KEY: cursor}, count=10, block=100) == []


async def test_resolve_cursor_passes_through_explicit_id(bus):
    client = await bus.connect()
    assert await EventBus._resolve_cursor(client, "123-4") == "123-4"


async def test_publish_failure_does_not_raise():
    """Redis erişilemezse yayın sessizce düşer — motor durmaz (§14)."""
    bus = EventBus(url="redis://localhost:1/0")
    await bus.emit(EventKind.LOG, message="kimse duymayacak")  # patlamamalı
    await bus.close()


# --------------------------------------------------------------------------- #
#  Havuz yeniden deneme aralığı
# --------------------------------------------------------------------------- #
def test_universe_retry_backoff_is_not_reset_by_boundary_oscillation():
    """Katlama ölçütü monoton olmalı.

    Havuz hedefe ulaşamıyorsa (üç gündür 86–88, hedef 100) yeniden deneme
    sonsuza kadar 3 dakikada bir dönüyordu ve her tur sınırdaki bir sembolü bir
    yana savurup snapshot yazıyordu. "Boyut değişti" ölçütü işe yaramaz: 87↔88
    salınımında her turda doğrudur ve katlama hiç devreye girmez.

    Burada döngünün karar mantığı doğrudan sınanır — asyncio uyku süresi değil,
    hangi koşulda sıfırlandığı.
    """
    from sarnic.bots.supervisor import UNIVERSE_RETRY_INTERVAL, UNIVERSE_RETRY_MAX_INTERVAL

    def sonraki(bekleme: int, boyut: int, en_iyi: int) -> tuple[int, int]:
        if boyut > en_iyi:
            return UNIVERSE_RETRY_INTERVAL, boyut
        return min(bekleme * 2, UNIVERSE_RETRY_MAX_INTERVAL), en_iyi

    bekleme, en_iyi = UNIVERSE_RETRY_INTERVAL, -1
    # Havuz gerçekten büyüyor: sık denemeye devam.
    for boyut in (40, 60, 86):
        bekleme, en_iyi = sonraki(bekleme, boyut, en_iyi)
        assert bekleme == UNIVERSE_RETRY_INTERVAL

    # Sınırda salınım: katlama devreye girmeli.
    for boyut in (87, 86, 87, 86, 87, 86):
        bekleme, en_iyi = sonraki(bekleme, boyut, en_iyi)
    assert bekleme > UNIVERSE_RETRY_INTERVAL * 8

    # Gerçek bir büyüme yine sıfırlar.
    bekleme, en_iyi = sonraki(bekleme, 90, en_iyi)
    assert bekleme == UNIVERSE_RETRY_INTERVAL


# --------------------------------------------------------------------------- #
#  "Eşik aşıldı" bir geçiştir
# --------------------------------------------------------------------------- #
def test_threshold_event_fires_only_on_the_crossing():
    """Bildirim durumu değil, **değişimi** raporlamalı.

    Kod eşiğin üstünde sembol *olup olmadığına* bakıyordu; kapıyı geçen bir
    sembol havuzda durduğu sürece her bar yeniden bildirim üretiyordu.
    Ölçüldü (2026-08-19): 24 saatte 588 bildirim, hiçbiri okunmamış. 15
    dakikalık bot tek başına günde 96 bar üretiyor. Bu hacim gelen kutusunu
    kullanılamaz hâle getirir ve gerçek olayları (pozisyon, devre kesici)
    gömer.

    Buradaki mantık işçinin kullandığıyla aynı küme farkıdır.
    """
    onceki: set[str] = set()

    def gecenler(simdiki: set[str]) -> set[str]:
        nonlocal onceki
        yeni = simdiki - onceki
        onceki = simdiki
        return yeni

    # İlk barda A ve B kapıyı geçiyor: ikisi de yeni.
    assert gecenler({"AUSDT", "BUSDT"}) == {"AUSDT", "BUSDT"}
    # İkinci barda ikisi de hâlâ üstte: **hiçbir bildirim yok**.
    assert gecenler({"AUSDT", "BUSDT"}) == set()
    # C katılıyor: yalnızca C bildirilir.
    assert gecenler({"AUSDT", "BUSDT", "CUSDT"}) == {"CUSDT"}
    # A düşüyor: düşüş bildirilmez, ama geri dönerse yeniden bildirilir.
    assert gecenler({"BUSDT", "CUSDT"}) == set()
    assert gecenler({"AUSDT", "BUSDT", "CUSDT"}) == {"AUSDT"}
