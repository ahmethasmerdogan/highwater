"""Belleği işletim sistemine iade et — glibc arenaları pandas'tan sonra şişer.

Havuz yenileme, küme hesabı ve kalibrasyon geri-doldurma büyük DataFrame'ler
kurar; iş bitince Python nesneleri serbest kalır ama glibc `free()` ile aldığı
sayfaları çoğu kez tutar. 2026-09-04: supervisor süreci 5 dakikada 814 MB'a
çıktı, 26 worker'la birlikte 7 GB'lık makine swap'a düştü. `malloc_trim(0)`
boş arena sayfalarını çekirdeğe geri verir; Linux/glibc dışında sessizce
atlanır — çağıranın davranışı değişmez.
"""

from __future__ import annotations

import ctypes
import gc


def bellek_iade() -> int:
    """gc + malloc_trim. Dönüş: trim yapıldıysa 1, yapılamadıysa 0."""
    gc.collect()
    try:
        libc = ctypes.CDLL("libc.so.6")
        return int(libc.malloc_trim(0))
    except (OSError, AttributeError):
        return 0
