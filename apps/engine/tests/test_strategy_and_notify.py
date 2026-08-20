"""Strateji tanımı (§12), Discord toplu gönderimi (§14) ve güvenlik testleri."""

from __future__ import annotations

from datetime import UTC, datetime

import pytest

from sarnic.core.enums import EventKind
from sarnic.core.events import Event
from sarnic.core.security import (
    decrypt_secret,
    encrypt_secret,
    generate_totp_secret,
    hash_password,
    mask_secret,
    verify_password,
    verify_totp,
)
from sarnic.notify.discord import (
    DiscordConfig,
    build_batch,
    channel_for,
    format_event,
)
from sarnic.strategy.definition import (
    DEFAULT_STRATEGY,
    StrategyDefinition,
    StrategyValidationError,
)

AT = datetime(2026, 8, 13, 14, 0, 5, tzinfo=UTC)


# --------------------------------------------------------------------------- #
#  Strateji tanımı
# --------------------------------------------------------------------------- #
def test_default_strategy_is_valid():
    assert DEFAULT_STRATEGY.validate() == []


def test_round_trip_through_dict():
    data = DEFAULT_STRATEGY.to_dict()
    restored = StrategyDefinition.from_dict(data)
    assert restored.to_dict() == data
    assert restored.hash() == DEFAULT_STRATEGY.hash()


def test_hash_changes_with_any_parameter():
    other = StrategyDefinition.from_dict(DEFAULT_STRATEGY.to_dict())
    other.entry.min_score = 75.0
    assert other.hash() != DEFAULT_STRATEGY.hash()


def test_validation_rejects_unknown_timeframe():
    definition = StrategyDefinition.from_dict({**DEFAULT_STRATEGY.to_dict(), "timeframe": "7m"})
    assert any("zaman dilimi" in e for e in definition.validate())


def test_validation_rejects_score_exit_above_entry():
    data = DEFAULT_STRATEGY.to_dict()
    data["exit"]["score_exit"] = 90.0
    assert any("score_exit" in e for e in StrategyDefinition.from_dict(data).validate())


def test_validation_rejects_absurd_risk():
    data = DEFAULT_STRATEGY.to_dict()
    data["sizing"]["risk_pct"] = 0.5
    assert any("risk_pct" in e for e in StrategyDefinition.from_dict(data).validate())


def test_validation_rejects_unknown_family():
    data = DEFAULT_STRATEGY.to_dict()
    data["scoring"]["weights"]["astroloji"] = 10
    assert any("puan ailesi" in e for e in StrategyDefinition.from_dict(data).validate())


def test_require_valid_raises():
    data = DEFAULT_STRATEGY.to_dict()
    data["entry"]["max_positions"] = 0
    with pytest.raises(StrategyValidationError):
        StrategyDefinition.from_dict(data).require_valid()


def test_sizing_params_inherit_max_positions():
    data = DEFAULT_STRATEGY.to_dict()
    data["entry"]["max_positions"] = 3
    params = StrategyDefinition.from_dict(data).sizing_params()
    assert params.max_positions == 3


def test_malformed_definition_raises_clean_error():
    with pytest.raises(StrategyValidationError):
        StrategyDefinition.from_dict({"entry": {"bilinmeyen_alan": 1}})


# --------------------------------------------------------------------------- #
#  Discord — §14
# --------------------------------------------------------------------------- #
def event(kind: EventKind, **payload) -> Event:
    level = payload.pop("level", "INFO")
    return Event(kind=kind, payload=payload, level=level, at=AT)


def test_channel_routing():
    assert channel_for(event(EventKind.POSITION_OPENED)) == "islemler"
    assert channel_for(event(EventKind.POOL_UPDATED)) == "havuz"
    assert channel_for(event(EventKind.RISK_CIRCUIT_BREAKER)) == "alarm"
    assert channel_for(event(EventKind.BOT_STATE_CHANGED)) == "sistem"


def test_noisy_events_are_silent():
    assert channel_for(event(EventKind.LOG)) is None
    assert channel_for(event(EventKind.SCORES_UPDATED)) is None
    assert channel_for(event(EventKind.CHAT_MESSAGE)) is None


def test_pool_update_becomes_single_message():
    """Faz 10 kabul: havuz güncellemesinde 30 ayrı mesaj değil **tek özet**."""
    added = [f"NEW{i}USDT" for i in range(15)]
    removed = [f"OLD{i}USDT" for i in range(15)]
    batch = build_batch([event(EventKind.POOL_UPDATED, size=100, added=added, removed=removed)])
    assert batch.count("\n") == 0
    assert "havuz 100 sembol" in batch
    assert "giren (15)" in batch
    assert "çıkan (15)" in batch


def test_multiple_events_batched_into_one_message():
    events = [
        event(EventKind.POSITION_OPENED, symbol="SOLUSDT", message="giriş"),
        event(EventKind.POSITION_CLOSED, symbol="AVAXUSDT", message="çıkış", pnl=12.0),
        event(EventKind.POSITION_OPENED, symbol="LINKUSDT", message="giriş"),
    ]
    batch = build_batch(events)
    assert batch.count("\n") == 2
    assert "SOLUSDT" in batch and "AVAXUSDT" in batch and "LINKUSDT" in batch


def test_circuit_breaker_mentions_here():
    batch = build_batch([event(EventKind.RISK_CIRCUIT_BREAKER, breaker="DAILY_LOSS", message="—")])
    assert batch.startswith("@here")


def test_stale_data_mentions_here():
    assert build_batch([event(EventKind.DATA_STALE, message="—")]).startswith("@here")


def test_normal_events_do_not_mention():
    batch = build_batch([event(EventKind.POSITION_OPENED, symbol="X", message="giriş")])
    assert not batch.startswith("@here")


def test_long_batch_is_truncated_with_count():
    events = [
        event(EventKind.POSITION_OPENED, symbol=f"C{i}USDT", message="x" * 60) for i in range(200)
    ]
    batch = build_batch(events)
    assert len(batch) <= 1960
    assert "olay daha" in batch


def test_pnl_icon_reflects_direction():
    win = format_event(event(EventKind.POSITION_CLOSED, symbol="X", pnl=10.0, message="m"))
    loss = format_event(event(EventKind.POSITION_CLOSED, symbol="X", pnl=-10.0, message="m"))
    assert "🔵" in win
    assert "🔴" in loss


def test_discord_config_round_trip():
    config = DiscordConfig.from_dict(
        {"enabled": True, "webhooks": {"alarm": "https://x", "sistem": "https://y"}}
    )
    assert config.enabled
    assert config.url_for("alarm") == "https://x"
    # Tanımsız kanal `sistem`e düşer.
    assert config.url_for("havuz") == "https://y"


def test_discord_config_drops_empty_urls():
    config = DiscordConfig.from_dict({"enabled": True, "webhooks": {"alarm": ""}})
    assert config.webhooks == {}


# --------------------------------------------------------------------------- #
#  Güvenlik
# --------------------------------------------------------------------------- #
def test_password_hash_round_trip():
    hashed = hash_password("çokGizliParola123!")
    assert hashed != "çokGizliParola123!"
    assert verify_password("çokGizliParola123!", hashed)
    assert not verify_password("yanlış", hashed)


def test_password_hashes_are_salted():
    assert hash_password("aynı") != hash_password("aynı")


def test_totp_verification():
    import pyotp

    secret = generate_totp_secret()
    code = pyotp.TOTP(secret).now()
    assert verify_totp(secret, code)
    assert not verify_totp(secret, "000000")
    assert not verify_totp("", code)


def test_secret_encryption_round_trip():
    """Webhook URL'leri DB'de şifreli saklanır (§14)."""
    url = "https://discord.com/api/webhooks/123/abcdefghijk"
    encrypted = encrypt_secret(url)
    assert url not in encrypted
    assert decrypt_secret(encrypted) == url


def test_mask_secret_hides_middle():
    masked = mask_secret("https://discord.com/api/webhooks/123456/secrettoken")
    assert "•" in masked
    assert "secrettoken" not in masked


def test_mask_empty_is_empty():
    assert mask_secret("") == ""


# --------------------------------------------------------------------------- #
#  Bildirim gövdesi: ham JSON son çaredir
# --------------------------------------------------------------------------- #
def test_threshold_notification_is_a_sentence_not_json():
    """Kullanıcı `{"threshold": 80.0, "symbols": [...]}` okumak zorunda kalmamalı.

    Panelde bulundu: puan eşiği bildirimleri ham JSON gövdesiyle yazılıyordu.
    Diğer türler (pozisyon açıldı/kapandı) düzgün cümle üretiyordu; bu tür
    varsayılan `json.dumps` dalına düşüyordu.
    """
    from sarnic.core.enums import EventKind
    from sarnic.core.events import Event
    from sarnic.notify.service import summarize

    _, body = summarize(
        Event(
            kind=str(EventKind.SCORE_THRESHOLD_CROSSED),
            level="INFO",
            payload={
                "threshold": 80.0,
                "symbols": [{"symbol": "LINKUSDT", "score": 83.31}],
                "bot_id": 1,
            },
        )
    )
    assert "{" not in body and "[" not in body
    assert "LINKUSDT" in body and "83.3" in body and "80" in body


def test_pool_notification_names_the_symbols_that_moved():
    """"3 giren" yeterli değil — hangileri girdi?"""
    from sarnic.core.enums import EventKind
    from sarnic.core.events import Event
    from sarnic.notify.service import summarize

    _, body = summarize(
        Event(
            kind=str(EventKind.POOL_UPDATED),
            level="INFO",
            payload={"size": 89, "added": ["BELUSDT"], "removed": ["2ZUSDT"], "snapshot_id": 9},
        )
    )
    assert "BELUSDT" in body and "2ZUSDT" in body and "89" in body
    assert "{" not in body


def test_unknown_event_still_avoids_raw_json():
    """Bilinmeyen tür bile en azından okunur alanlar dizmeli."""
    from sarnic.core.events import Event
    from sarnic.notify.service import summarize

    _, body = summarize(Event(kind="bir.sey", level="INFO", payload={"sembol": "XUSDT"}))
    assert body == "sembol: XUSDT"
