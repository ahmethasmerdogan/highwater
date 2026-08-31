"""Deadman — olay döngüsü donarsa süreci öldürüp systemd'ye yeniden doğurtur.

31 Ağustos gecesi yaşandı: internet kesilince marketdata'nın asyncio
döngüsü bütünüyle takıldı — 24 saat boyunca tek log satırı, tek nabız yok.
İçerideki görev gözcüsü (md-watchdog) işe yaramadı çünkü O DA aynı donmuş
döngünün içindeydi. Donmuş bir döngüyü içeriden kurtaramazsın.

Çare dışarıdan bakan bir İPLİK: döngü her turda `beat()` çağırır; iplik
monotonic saatle arayı ölçer. Eşik aşılırsa stderr'e yazar ve `os._exit`
ile ölür — systemd `Restart=always` ile yeniden başlatır, `wait_for_db`
ve açılış onarımı gerisini toparlar. 30 günlük komutsuz maratonun
sigortası budur: çökmek serbest, ASILI KALMAK yasak.
"""

from __future__ import annotations

import os
import sys
import threading
import time


class Deadman:
    def __init__(self, name: str, threshold_seconds: float = 900.0) -> None:
        self.name = name
        self.threshold = threshold_seconds
        self._last = time.monotonic()
        self._thread: threading.Thread | None = None

    def beat(self) -> None:
        """Döngü canlı — her başarılı turda çağrılır. Ucuz: tek atama."""
        self._last = time.monotonic()

    def gap(self) -> float:
        return time.monotonic() - self._last

    def overdue(self) -> bool:
        return self.gap() > self.threshold

    def start(self) -> None:
        if self._thread is not None:
            return

        def _watch() -> None:
            while True:
                time.sleep(60)
                if self.overdue():
                    print(
                        f"DEADMAN[{self.name}]: döngü {self.gap():.0f} sn'dir nabız "
                        f"vermiyor (eşik {self.threshold:.0f}) — süreç öldürülüyor, "
                        "systemd yeniden başlatacak.",
                        file=sys.stderr,
                        flush=True,
                    )
                    os._exit(70)

        self._thread = threading.Thread(target=_watch, name=f"deadman-{self.name}", daemon=True)
        self._thread.start()
