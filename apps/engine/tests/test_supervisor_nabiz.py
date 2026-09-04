"""Nabız eşiği bar karar süresinden uzun olmalı (2026-09-04 restart fırtınası)."""

from datetime import timedelta

from sarnic.bots.supervisor import HEARTBEAT_TIMEOUT, RESTART_COOLDOWN


def test_nabiz_esigi_bar_karar_suresinden_uzun():
    """Ölçülen p90 270 sn; eşik bunun üstünde olmazsa supervisor her bar
    kararında worker'ı öldürür ve sistem kendini felç eder."""
    assert timedelta(seconds=300) <= HEARTBEAT_TIMEOUT


def test_soguma_yeni_dogani_korur():
    """Yeni doğan worker import + ilk bar hesabı boyunca nabızsız görünür."""
    assert timedelta(seconds=120) <= RESTART_COOLDOWN < HEARTBEAT_TIMEOUT
