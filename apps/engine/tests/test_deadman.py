"""Deadman — 30 günlük komutsuz koşunun donma sigortası.

`os._exit` yolu test edilmez (süreci öldürür); karar mantığı `overdue()`
olarak ayrıştırıldı ve burada ölçülür.
"""

from __future__ import annotations

import time

from sarnic.core.deadman import Deadman


def test_beat_nabzi_tazeler():
    d = Deadman("test", threshold_seconds=0.05)
    time.sleep(0.06)
    assert d.overdue(), "eşik aşıldı — gecikmiş saymalı"
    d.beat()
    assert not d.overdue(), "beat sonrası gecikme sıfırlanmalı"


def test_esik_altinda_gecikmis_sayilmaz():
    d = Deadman("test", threshold_seconds=60)
    assert not d.overdue()
    assert d.gap() < 1.0


def test_start_tek_iplik_kurar():
    d = Deadman("test", threshold_seconds=3600)
    d.start()
    ilk = d._thread
    d.start()  # ikinci çağrı yenisini kurmamalı
    assert d._thread is ilk
    assert ilk is not None and ilk.daemon, "iplik daemon olmalı — kapanışı bloklamasın"
