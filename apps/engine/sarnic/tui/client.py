"""TUI'nin API istemcisi.

Bozulmaz kural 4: **TUI botun kendisi değildir.** Bot headless bir servistir;
TUI ona bağlanan bir istemcidir. Terminali kapatmak işlemleri durdurmaz.
Bu dosyada DB veya Binance erişimi yoktur — yalnızca FastAPI.
"""

from __future__ import annotations

import asyncio
import contextlib
import json
from collections.abc import AsyncIterator, Callable
from dataclasses import dataclass, field
from typing import Any

import httpx
import websockets


class AuthError(RuntimeError):
    pass


@dataclass
class ApiClient:
    base_url: str
    access_token: str = ""
    refresh_token: str = ""
    _client: httpx.AsyncClient | None = field(default=None, repr=False)

    async def client(self) -> httpx.AsyncClient:
        if self._client is None:
            self._client = httpx.AsyncClient(
                base_url=self.base_url.rstrip("/"), timeout=httpx.Timeout(20.0)
            )
        return self._client

    async def close(self) -> None:
        if self._client is not None:
            await self._client.aclose()
            self._client = None

    def _headers(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {self.access_token}"} if self.access_token else {}

    # ------------------------------------------------------------------ #
    async def login(self, email: str, password: str, code: str) -> None:
        client = await self.client()
        resp = await client.post("/auth/login", json={"email": email, "password": password})
        if resp.status_code != 200:
            raise AuthError(_detail(resp, "Giriş başarısız."))
        data = resp.json()

        challenge = data.get("challenge_token")
        if not challenge:
            raise AuthError("Sunucu doğrulama jetonu döndürmedi.")

        resp = await client.post("/auth/2fa", json={"challenge_token": challenge, "code": code})
        if resp.status_code != 200:
            raise AuthError(_detail(resp, "Doğrulama kodu kabul edilmedi."))
        tokens = resp.json()
        self.access_token = tokens["access_token"]
        self.refresh_token = tokens["refresh_token"]

    async def refresh(self) -> bool:
        if not self.refresh_token:
            return False
        client = await self.client()
        resp = await client.post("/auth/refresh", json={"refresh_token": self.refresh_token})
        if resp.status_code != 200:
            return False
        tokens = resp.json()
        self.access_token = tokens["access_token"]
        self.refresh_token = tokens["refresh_token"]
        return True

    async def get(self, path: str, **params: Any) -> Any:
        client = await self.client()
        resp = await client.get(path, params=params, headers=self._headers())
        if resp.status_code == 401 and await self.refresh():
            resp = await client.get(path, params=params, headers=self._headers())
        resp.raise_for_status()
        return resp.json()

    async def post(self, path: str, payload: dict | None = None) -> Any:
        client = await self.client()
        resp = await client.post(path, json=payload or {}, headers=self._headers())
        if resp.status_code == 401 and await self.refresh():
            resp = await client.post(path, json=payload or {}, headers=self._headers())
        resp.raise_for_status()
        return resp.json() if resp.content else {}

    # ------------------------------------------------------------------ #
    async def status(self) -> dict:
        return await self.get("/system/status")

    async def scores(self, limit: int = 12) -> list[dict]:
        return await self.get("/scores", limit=limit)

    async def positions(self) -> list[dict]:
        return await self.get("/positions")

    async def bots(self) -> list[dict]:
        return await self.get("/bots")

    async def portfolio(self) -> dict:
        return await self.get("/portfolio/metrics")

    async def kill_switch(self, code: str) -> dict:
        return await self.post("/system/kill-switch", {"code": code, "confirm": True})

    async def pause_bot(self, bot_id: int) -> dict:
        return await self.post(f"/bots/{bot_id}/pause")

    async def start_bot(self, bot_id: int) -> dict:
        return await self.post(f"/bots/{bot_id}/start")

    # ------------------------------------------------------------------ #
    async def ws_url(self) -> str:
        """Bağlantı adresi — her seferinde **yeni** bir bilet alınır.

        Erişim jetonu artık URL'ye konmaz: sorgu dizgeleri loglara düşer ve
        oradaki jeton 30 dakika boyunca tam yetkiliydi. Bilet 30 saniyelik ve
        tek kullanımlıktır, dolayısıyla her yeniden bağlanma yenisini ister.
        """
        bilet = (await self.post("/auth/ws-ticket"))["ticket"]
        base = self.base_url.replace("https://", "wss://").replace("http://", "ws://")
        return f"{base.rstrip('/')}/ws?ticket={bilet}"

    async def stream(self, on_state: Callable[[str], None] | None = None) -> AsyncIterator[dict]:
        """Olay akışı. Kopunca yeniden bağlanır; bot etkilenmez (§16)."""
        backoff = 1.0
        while True:
            try:
                async with websockets.connect(await self.ws_url(), ping_interval=20) as ws:
                    if on_state:
                        on_state("connected")
                    backoff = 1.0
                    async for raw in ws:
                        with contextlib.suppress(json.JSONDecodeError):
                            yield json.loads(raw)
            except asyncio.CancelledError:
                raise
            except Exception:
                if on_state:
                    on_state("reconnecting")
                await asyncio.sleep(backoff)
                backoff = min(backoff * 2, 30.0)
                await self.refresh()


def _detail(resp: httpx.Response, fallback: str) -> str:
    try:
        return resp.json().get("detail", fallback)
    except Exception:
        return fallback
