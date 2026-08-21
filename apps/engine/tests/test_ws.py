"""WebSocket köprüsü testleri — §15 `/ws`.

Bu dosya, canlı akışın **hiç çalışmadan** haftalarca fark edilmemesinden sonra
yazıldı: `Client` bir dataclass'tı, varsayılan `__eq__` `__hash__`'i `None`
yapıyordu ve `hub.clients.add(client)` her bağlantıda `TypeError` fırlatıyordu.
Sayfalar react-query ile veri çektiği için dolu görünüyor, yalnızca üst çubuk
sürekli "yeniden bağlanılıyor" diyordu.

Ders: bağlantı kurulumunun kendisi test edilmeli, uçların 200 dönmesi yetmez.
"""

from __future__ import annotations

import asyncio

import pytest

from sarnic.api.ws import ALL_CHANNELS, Client, ConnectionHub, channel_of
from sarnic.core.enums import EventKind
from sarnic.core.events import Event


class FakeWebSocket:
    """Gönderilenleri toplayan sahte soket."""

    def __init__(self) -> None:
        self.sent: list[str] = []

    async def send_text(self, data: str) -> None:
        self.sent.append(data)


def make_client(**kwargs) -> Client:
    return Client(websocket=FakeWebSocket(), user_id=1, **kwargs)


# --------------------------------------------------------------------------- #
def test_client_is_hashable():
    """Hub istemcileri `set` içinde tutar; hashlenemeyen istemci bağlantıyı öldürür."""
    client = make_client()
    assert hash(client) is not None
    assert {client} == {client}


def test_two_clients_are_distinct():
    """Aynı alanlara sahip iki bağlantı **ayrı** istemcidir."""
    a, b = make_client(), make_client()
    assert a != b
    assert len({a, b}) == 2


def test_register_and_unregister():
    hub = ConnectionHub()
    client = make_client()

    hub.register(client)
    assert client in hub.clients

    hub.unregister(client)
    assert client not in hub.clients
    # İki kez çıkarmak hata vermemeli.
    hub.unregister(client)


def test_broadcast_reaches_subscribed_client():
    hub = ConnectionHub()
    client = make_client()
    hub.register(client)

    hub.broadcast(Event(kind=EventKind.POSITION_OPENED, payload={"symbol": "SOLUSDT"}))

    assert client.queue.qsize() == 1
    payload = client.queue.get_nowait()
    assert payload["channel"] == "positions"
    assert payload["event"]["payload"]["symbol"] == "SOLUSDT"


def test_broadcast_skips_unsubscribed_channel():
    hub = ConnectionHub()
    client = make_client(channels={"logs"})
    hub.register(client)

    hub.broadcast(Event(kind=EventKind.POSITION_OPENED, payload={}))
    assert client.queue.empty()

    hub.broadcast(Event(kind=EventKind.LOG, payload={"message": "x"}))
    assert client.queue.qsize() == 1


def test_slow_client_drops_oldest_not_newest():
    """Yavaş istemci tüm sistemi yavaşlatmaz; en eski olay düşer, en yeni kalır."""
    hub = ConnectionHub()
    client = make_client()
    client.queue = asyncio.Queue(maxsize=2)
    hub.register(client)

    for index in range(4):
        hub.broadcast(Event(kind=EventKind.LOG, payload={"n": index}))

    assert client.queue.qsize() == 2
    remaining = [client.queue.get_nowait()["event"]["payload"]["n"] for _ in range(2)]
    assert remaining[-1] == 3  # en yeni olay korunmuş


def test_broadcast_to_many_clients():
    hub = ConnectionHub()
    clients = [make_client() for _ in range(5)]
    for c in clients:
        hub.register(c)

    hub.broadcast(Event(kind=EventKind.SCORES_UPDATED, payload={}))
    assert all(c.queue.qsize() == 1 for c in clients)


@pytest.mark.parametrize(
    "kind,expected",
    [
        (EventKind.SCORES_UPDATED, "scores"),
        (EventKind.POSITION_OPENED, "positions"),
        (EventKind.POSITION_CLOSED, "positions"),
        (EventKind.RISK_CIRCUIT_BREAKER, "notifications"),
        (EventKind.CHAT_MESSAGE, "chat"),
        (EventKind.BOT_STATE_CHANGED, "bot_events"),
        (EventKind.LOG, "logs"),
    ],
)
def test_channel_routing(kind, expected):
    assert channel_of(Event(kind=kind)) == expected


def test_unknown_event_falls_back_to_logs():
    assert channel_of(Event(kind="bilinmeyen.olay")) == "logs"


def test_default_client_subscribes_to_all_channels():
    assert make_client().channels == set(ALL_CHANNELS)


async def test_ticker_cache_failure_does_not_break_the_reader():
    """Redis cevap vermezse fiyat okuması boş dönmeli, patlamamalı.

    Bu okuma `/positions` ve `/portfolio/live` içindedir. Redis 15 dakikada bir
    yapılan tam ticker tazelemesi sırasında meşgulken zaman aşımına uğruyor ve
    istek 500 ile düşüyordu: kullanıcı canlı fiyat gecikti diye **pozisyon
    listesini hiç göremiyordu**. Canlı fiyat bu uçların süsü, iskeleti değil.
    """
    from sarnic.data.marketdata import read_tickers

    class DusenRedis:
        async def hgetall(self, key):
            raise TimeoutError("redis yanıt vermedi")

    assert await read_tickers(DusenRedis()) == {}


async def test_ticker_cache_propagates_cancellation():
    """İptal edilen istek "veri yok" değildir; yutulursa asyncio bozulur."""
    import asyncio as _asyncio

    from sarnic.data.marketdata import read_tickers

    class IptalRedis:
        async def hgetall(self, key):
            raise _asyncio.CancelledError

    with pytest.raises(_asyncio.CancelledError):
        await read_tickers(IptalRedis())


# --------------------------------------------------------------------------- #
#  WebSocket bileti — jeton artık URL'ye konmuyor
# --------------------------------------------------------------------------- #
#
# Tarayıcı WS el sıkışmasında başlık gönderemez, kimlik sorgu dizgesinden
# geçmek zorunda ve sorgu dizgeleri loglara düşer. Ölçüldü: panel proxy'si hata
# verdiğinde `?token=eyJ...` satırın tamamıyla journal'a yazılıyordu — 30
# dakikalık, tam yetkili bir jeton düz metin olarak. Bilet 30 saniye yaşar ve
# bir kez kullanılır.


@pytest.mark.asyncio
async def test_bilet_ucu_kimlik_ister(api_client):
    yanit = await api_client.post("/auth/ws-ticket")
    assert yanit.status_code == 401


@pytest.mark.asyncio
async def test_bilet_ucu_ws_tipinde_jeton_verir(api_client, auth):
    from sarnic.core.security import WS_TICKET_SECONDS, decode_token

    yanit = await api_client.post("/auth/ws-ticket", headers=auth)
    assert yanit.status_code == 200
    govde = yanit.json()
    assert govde["expires_in"] == WS_TICKET_SECONDS

    talepler = decode_token(govde["ticket"], expected_type="ws")
    assert talepler["typ"] == "ws"
    # Ömrü gerçekten kısa: 30 dakikalık erişim jetonuyla karıştırılamaz.
    assert talepler["exp"] - talepler["iat"] == WS_TICKET_SECONDS


@pytest.mark.asyncio
async def test_erisim_jetonu_bilet_yerine_gecmez():
    """Eski akış sessizce çalışmaya devam etmemeli."""
    import jwt

    from sarnic.core.security import create_access_token, decode_token

    with pytest.raises(jwt.InvalidTokenError):
        decode_token(create_access_token(1, "ADMIN"), expected_type="ws")


@pytest.mark.asyncio
async def test_bilet_yalnizca_bir_kez_harcanir(monkeypatch):
    """Asıl güvence: loga düşen bir bilet ikinci kez işe yaramaz."""
    import sarnic.api.ws as ws_modulu
    from tests.conftest import FakeRedis

    sahte = FakeRedis()

    async def sahte_redis():
        return sahte

    monkeypatch.setattr(ws_modulu, "get_redis", sahte_redis)

    assert await ws_modulu._consume_ticket("jti-1") is True
    assert await ws_modulu._consume_ticket("jti-1") is False
    # Farklı bilet etkilenmez.
    assert await ws_modulu._consume_ticket("jti-2") is True


@pytest.mark.asyncio
async def test_redis_yoksa_baglanti_kesilmez(monkeypatch):
    """Gözlem katmanı çökünce canlı akış kesilmez — bilet zaten imzalı ve 30 saniyelik."""
    import sarnic.api.ws as ws_modulu

    async def patlayan():
        raise RuntimeError("redis yok")

    monkeypatch.setattr(ws_modulu, "get_redis", patlayan)
    assert await ws_modulu._consume_ticket("jti-3") is True
