"""Merkezi yapılandırma. Tüm ayarlar .env'den okunur; kodda sabit sır yoktur."""

from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(".env", "../../.env"), env_prefix="SARNIC_", extra="ignore"
    )

    # --- ortam ---
    env: Literal["dev", "prod", "test"] = "dev"
    debug: bool = True
    log_level: str = "INFO"
    log_json: bool = False

    # --- veritabanı ---
    database_url: str = "postgresql+asyncpg://sarnic:sarnic@localhost:5432/sarnic"
    db_pool_size: int = 10
    db_max_overflow: int = 20

    # --- redis ---
    redis_url: str = "redis://localhost:6379/0"

    # --- kimlik doğrulama ---
    jwt_secret: str = "change-me-in-production-this-is-not-a-secret"
    jwt_algorithm: str = "HS256"
    access_token_minutes: int = 30
    refresh_token_days: int = 14
    totp_issuer: str = "SARNIÇ"
    # Entegrasyon sırlarını (Discord webhook) şifrelemek için Fernet anahtarı.
    # Boşsa jwt_secret'ten türetilir — prod'da açıkça verilmelidir.
    secret_encryption_key: str = ""

    # --- Binance ---
    binance_rest_base: str = "https://api.binance.com"
    binance_ws_base: str = "wss://stream.binance.com:9443"
    binance_vision_base: str = "https://data.binance.vision"
    binance_api_key: str = ""
    binance_api_secret: str = ""
    # Ağırlık limitinin bu oranına gelince RateLimiter kendini yavaşlatır (§2.1).
    rate_limit_soft_ratio: float = 0.70
    rate_limit_weight_per_minute: int = 6000

    # --- market data ---
    # WS akışı bu süre boyunca sessizse STALE_DATA (§2.3).
    stale_data_seconds: int = 60
    decision_timeframe: str = "1h"
    # Piyasa geneli referansı: rejim çarpanının girdisi (§6.2 adım 5) ve
    # backtest kıyaslarından biri. Bir **işlem adayı değil**, bir ölçü aletidir —
    # havuza girip girmediğine bakılmaksızın izlenmek zorundadır. İzlenmediği
    # için 1h/4h/1d verisi 10 saat geride kalmıştı (`SYSTEM-REVIEW` §2).
    reference_symbol: str = "BTCUSDT"

    # --- paper motoru ---
    paper_initial_balance: float = 5000.0
    paper_taker_fee: float = 0.001
    paper_extra_slippage_bps: float = 5.0
    paper_latency_ms: int = 250
    # PRER: dolum fiyatı orta fiyattan bu kadar saparsa emir reddedilir (§9.1).
    paper_prer_max_deviation: float = 0.05

    # --- API ---
    api_host: str = "0.0.0.0"
    api_port: int = 8000
    cors_origins: list[str] = Field(default_factory=lambda: ["http://localhost:3000"])

    # --- TUI / istemci ---
    api_base_url: str = "http://localhost:8000"

    # --- saklama ---
    # `scores` sınırsız büyüyen tek tabloydu (satır başına ~2 KB, günde ~15 bin
    # satır). Kalibrasyon gözlemi olan puanlar bu süreden bağımsız olarak
    # korunur — bkz. `scoring/retention.py`. 0 = budama kapalı.
    scores_retention_days: int = 90

    # --- gözlemlenebilirlik ---
    # API'nin kendi /metrics ucu vardır (api_port). Arka plan servislerinin
    # HTTP sunucusu yoktur, bu yüzden her biri kendi portunda /metrics açar.
    # 0 = kapalı.
    metrics_port_marketdata: int = 9101
    metrics_port_supervisor: int = 9102
    metrics_port_notifier: int = 9103
    # Worker'lar süpervizörün alt süreçleridir; her birinin kendi kayıt defteri
    # vardır, dolayısıyla kendi portunu açmalıdır. Port = taban + bot_id, yani
    # 1 numaralı bot 9111'dedir. Sabit ve öngörülebilir olması Prometheus hedef
    # listesini elle yazılabilir kılar.
    metrics_port_worker_base: int = 9110
    # Boşsa Sentry tamamen kapalıdır. sentry.io veya kendi kurulumunuzun DSN'i.
    sentry_dsn: str = ""
    sentry_release: str = ""
    # İşlem izleme örnekleme oranı. 1 saatlik karar döngüsünde performans izi
    # bir şey anlatmaz; varsayılan kapalı — hata takibi için gerekmez.
    sentry_traces_sample_rate: float = 0.0

    # --- ilk yönetici (yalnızca boş DB'de seed edilir) ---
    bootstrap_admin_email: str = "admin@sarnic.local"
    bootstrap_admin_password: str = ""

    @property
    def sync_database_url(self) -> str:
        """Alembic senkron sürücü ister."""
        return self.database_url.replace("+asyncpg", "+psycopg2").replace(
            "postgresql+psycopg2", "postgresql"
        )


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
