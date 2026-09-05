"""Strateji tanımı — MASTER-SPEC §12.

Strateji = versiyonlanmış bir JSON belgesi. Bir versiyon **paper'a/canlıya
alındıktan sonra değiştirilemez** (`frozen`); yeni versiyon oluşur. Böylece her
işlemin hangi tam konfigürasyonla açıldığı bilinir.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import asdict, dataclass, field
from typing import Any

from sarnic.core.enums import TIMEFRAME_MINUTES
from sarnic.risk.engine import RiskLimits
from sarnic.scoring.registry import DEFAULT_FAMILY_WEIGHTS
from sarnic.sizing.engine import SizingParams


class StrategyValidationError(ValueError):
    pass


@dataclass(slots=True)
class UniverseSpec:
    preset: str = "default"
    #: Havuzun pazarı: CRYPTO | BIST | US. Karar saati, havuz snapshot'ı ve
    #: yıllıklandırma bu alandan türetilir (core/markets.py).
    market: str = "CRYPTO"
    overrides: dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class ScoringSpec:
    weights: dict[str, float] = field(default_factory=lambda: dict(DEFAULT_FAMILY_WEIGHTS))
    modifiers: dict[str, bool] = field(
        default_factory=lambda: {"pattern": True, "candle": True, "crowding": True}
    )


@dataclass(slots=True)
class EntrySpec:
    """Giriş kapısı.

    80 spec §5.3'ün değeri ve **ölçüm de orayı gösteriyor**. 60 gün / 88 sembol
    / geriye doldurulmuş puanlarla, çıkış kuralları sabit tutulup yalnızca kapı
    gezdirildiğinde işlem başına net getiri (ücret dahil):

        kapı 70 : +0,008%   ilk yarı +0,236%  son yarı −0,218%   ← kararsız
        kapı 74 : +0,443%   ilk yarı +0,800%  son yarı +0,086%
        kapı 78 : +1,033%   ilk yarı +0,946%  son yarı +1,120%
        kapı 80 : +1,699%   ilk yarı +1,828%  son yarı +1,570%   t=+4,26
        kapı 82 : +2,584%   ilk yarı +2,679%  son yarı +2,490%

    Kapıyı düşürmek işlem sayısını artırır ama kenarı yok eder: 74'te örneğin
    iki yarısı birbirini tutmuyor, 78'den itibaren tutuyor. 82 daha yüksek
    ortalama verir, ancak günde 2,8 girişle defter boş kalır.

    **Bu sayı zaman dilimine bağlıdır.** Puan mutlak bir ölçek değil, o bardaki
    havuz içi yüzdelik sıraların ağırlıklı ortalamasıdır; kısa barlarda
    özelliklerin kesitsel dağılımı daralır ve aynı seçicilik daha düşük bir
    puana denk gelir. 14 günlük ölçüm — kapı 80'i geçen bar oranı ve %0,709'a
    (1 saatlik karşılığa) denk gelen kapı:

        15m: %0,21 → 77,3      1h: %0,71 → 80,0
        30m: %1,01 → 81,5      4h: %1,28 → 80,7

    15 dakikalık botta 80 kullanılınca 99'uncu yüzdelik 76,1, tepe 81,9 ve
    günde 1,4 sinyal kaldı — bot fiilen dondu. Ölçülen bulgu "kenar dağılımın
    uç kuyruğunda" olduğu için başka bir dilime doğru çeviri aynı **sayı**
    değil aynı **seçiciliktir**. Yeni bir karar dilimi eklerken bu hesap
    yapılmadan 80 kopyalanmamalı.
    """

    min_score: float = 80.0
    #: Girişe izin verilen UTC saatleri (0–23). None = her saat. Canlı defter
    #: (228 işlem, 15 Ağu–3 Eyl) 00–06 UTC girişlerinde +1,20R, 06–12'de
    #: +0,08R gösterdi — ölçülebilir bir hipotez; bu düğme onu backtest'te ve
    #: yeni bir kolda sınamak için var. Çıkışlar saatten bağımsızdır.
    hours_utc: list[int] | None = None
    #: Eşzamanlı pozisyon sayısı.
    #:
    #: Portföy simülasyonunda (60 gün, kapı 80, %80 maruziyet tavanı, gerçek
    #: ücret) slot sayısı **monoton** davranıyor — az slot daha yüksek getiri:
    #:     2 → +18,5%   3 → +11,9%   4 → +9,5%   5 → +7,7%   6 → +6,3%
    #: Mekanizma açık: az slot yalnızca en yüksek puanlıyı almaktır ve kenar
    #: puanla artıyor. 5 slot örneğin ikinci yarısında eksi (−%0,76); 4 ve 3
    #: iki yarıda da artı. 1–2 slot daha da kazandırıyor ama 66–103 işlemle
    #: tek işleme bağımlı hâle geliyor ve tek isim maruziyeti %40'a çıkıyor.
    #: 4'te tek isim %20 — `max_position_pct` tavanının (%30) altında marjla.
    max_positions: int = 4
    #: Yön: LONG (yalnız uzun — bugünkü davranış), SHORT (yalnız kısa), BOTH.
    #: Kısa puan aynı özelliklerden yönlü aileler ters çevrilerek üretilir
    #: (KISA-YON-PLANI §3); öngürü gücü henüz ölçülmemiş bir hipotezdir.
    direction: str = "LONG"

    def directions(self) -> tuple[int, ...]:
        """+1 uzun, −1 kısa; worker ve backtest yalnız bunu tüketir."""
        return {"LONG": (1,), "SHORT": (-1,), "BOTH": (1, -1)}.get(self.direction, (1,))


@dataclass(slots=True)
class ExitSpec:
    """Çıkış merdiveni.

    `breakeven_r` ile `stop_atr_multiple` **bağımsız değildir**: 1R = stop
    mesafesidir, yani başabaş kilidi fiyat `breakeven_r × stop_atr_multiple`
    kadar ATR yükseldiğinde devreye girer. Trailing de ancak başabaş
    kilitlendikten sonra çalıştığı için, bu çarpım büyüdüğünde kâr koruma
    merdiveninin **tamamı** sessizce ölü kalır.

    Bu tam olarak yaşandı (2026-08-18): stop 0.5→2.0 ATR genişletildi, tetik
    1.25 ATR'den 5.0 ATR'ye fırladı ve sistemin kârlı olan tek tarafı —
    19 trailing çıkışı, +213 — kapandı. Zararlar yerinde kaldı.

    Kural: çarpım ~2 ATR civarında tutulur. Değiştirirken ikisine birden bak.
    """

    breakeven_r: float = 1.0
    trail_atr: float = 2.5
    score_exit: float = 60.0
    max_hold_hours: int = 72
    stop_atr_multiple: float = 2.0
    #: Kısmi kâr alma: fiyat +partial_tp_r R'ye ulaşınca (bar kapanışında)
    #: pozisyonun partial_fraction'ı satılır, kalan iz sürmeye devam eder.
    #: 0 = kapalı. Ölçüm: 228 işlemin 22'si ≥1R tepe görüp zararla kapandı
    #: (H2, MEYDAN-OKUMA 2026-09-04). Worker ve backtest aynı kararı alır.
    partial_tp_r: float = 0.0
    partial_fraction: float = 0.5


@dataclass(slots=True)
class RotationSpec:
    enabled: bool = True
    min_score_gap: float = 10.0


@dataclass(slots=True)
class StrategyDefinition:
    name: str = "Havuz Momentum v1"
    version: int = 1
    timeframe: str = "1h"
    universe: UniverseSpec = field(default_factory=UniverseSpec)
    scoring: ScoringSpec = field(default_factory=ScoringSpec)
    entry: EntrySpec = field(default_factory=EntrySpec)
    sizing: dict[str, Any] = field(
        default_factory=lambda: {
            "risk_pct": 0.01,
            "tiers": [[80, 0.75], [85, 1.0], [92, 1.25]],
            "vol_target": 0.60,
        }
    )
    exit: ExitSpec = field(default_factory=ExitSpec)
    rotation: RotationSpec = field(default_factory=RotationSpec)
    risk: dict[str, Any] = field(default_factory=dict)

    # ------------------------------------------------------------------ #
    def to_dict(self) -> dict:
        data = asdict(self)
        # LONG ise anahtar yazılmaz: saklı tanımların JSON'u ve hash'i (9 maraton
        # kolu dâhil) değişmez. Eski JSON `from_dict` ile varsayılan LONG olur.
        if data["entry"].get("direction", "LONG") == "LONG":
            data["entry"].pop("direction", None)
        return data

    def hash(self) -> str:
        return hashlib.sha256(
            json.dumps(self.to_dict(), sort_keys=True, default=str).encode()
        ).hexdigest()[:32]

    def sizing_params(self) -> SizingParams:
        params = SizingParams.from_definition(self.sizing)
        params.max_positions = self.entry.max_positions
        return params

    def risk_limits(self) -> RiskLimits:
        return RiskLimits.from_definition(self.risk)

    # ------------------------------------------------------------------ #
    @classmethod
    def from_dict(cls, data: dict) -> StrategyDefinition:
        try:
            return cls(
                name=str(data.get("name", "Adsız strateji")),
                version=int(data.get("version", 1)),
                timeframe=str(data.get("timeframe", "1h")),
                universe=UniverseSpec(**(data.get("universe") or {})),
                scoring=ScoringSpec(
                    weights=dict(
                        (data.get("scoring") or {}).get("weights", DEFAULT_FAMILY_WEIGHTS)
                    ),
                    modifiers=dict(
                        (data.get("scoring") or {}).get(
                            "modifiers", {"pattern": True, "candle": True, "crowding": True}
                        )
                    ),
                ),
                entry=EntrySpec(**(data.get("entry") or {})),
                sizing=dict(data.get("sizing") or {}),
                exit=ExitSpec(**(data.get("exit") or {})),
                rotation=RotationSpec(**(data.get("rotation") or {})),
                risk=dict(data.get("risk") or {}),
            )
        except TypeError as exc:
            raise StrategyValidationError(f"Strateji tanımı geçersiz: {exc}") from exc

    def validate(self) -> list[str]:
        """Kabul edilemez tanımları listeler. Boş liste = geçerli."""
        errors: list[str] = []
        # Desteklenen dilimler tek yerden okunur; enum'a bir dilim eklenip
        # burası unutulduğunda strateji doğrulaması onu reddediyordu.
        if self.timeframe not in TIMEFRAME_MINUTES:
            errors.append(f"bilinmeyen zaman dilimi: {self.timeframe}")
        if self.exit.partial_tp_r < 0 or not 0 < self.exit.partial_fraction < 1:
            raise ValueError("exit.partial_tp_r ≥ 0 ve 0 < exit.partial_fraction < 1 olmalı")
        saatler = self.entry.hours_utc
        if saatler is not None and (not saatler or any(not 0 <= h <= 23 for h in saatler)):
            raise ValueError("entry.hours_utc: 0–23 arası saatlerden oluşan, boş olmayan liste")
        if not 0 <= self.entry.min_score <= 100:
            errors.append("entry.min_score 0–100 aralığında olmalı")
        if self.entry.direction not in ("LONG", "SHORT", "BOTH"):
            errors.append("entry.direction LONG, SHORT ya da BOTH olmalı")
        if self.entry.max_positions < 1:
            errors.append("entry.max_positions en az 1 olmalı")
        if self.exit.score_exit >= self.entry.min_score:
            errors.append("exit.score_exit, entry.min_score'dan küçük olmalı")
        if not 0 < float(self.sizing.get("risk_pct", 0.01)) <= 0.05:
            errors.append("sizing.risk_pct (0, 0.05] aralığında olmalı")
        if self.exit.max_hold_hours < 1:
            errors.append("exit.max_hold_hours en az 1 olmalı")
        if sum(self.scoring.weights.values()) <= 0:
            errors.append("scoring.weights toplamı pozitif olmalı")
        for key, value in self.scoring.weights.items():
            if key not in DEFAULT_FAMILY_WEIGHTS:
                errors.append(f"bilinmeyen puan ailesi: {key}")
            elif float(value) < 0:
                # Negatif ağırlık puan ölçeğini bozar: `family_weights` toplamı
                # 100'e ölçeklerken İŞARETİ korur, taban [0,100] dışına çıkar ve
                # `score_cross_section` clamp'i onu 100,00'de (ya da 0,00'da)
                # düzleştirir. Ölçüldü (bot 20, 2026-09-04): 2229 puanın 144'ü tam
                # 100,00; bir barda altı sembol eşitlenince seçim (-puan, sembol)
                # sıralamasıyla ALFABETİK sıraya düştü, rotasyon da imkânsız hâle
                # geldi (100'ü devirmek 115 puan istiyor). Ters yönlü bir aile
                # isteniyorsa yol yüzdeliği ters çevirmektir, ağırlığı değil.
                errors.append(
                    f"scoring.weights[{key}] negatif olamaz ({value}); "
                    "ters yön için yüzdelik çevirme kullanılmalı"
                )
        return errors

    def require_valid(self) -> StrategyDefinition:
        errors = self.validate()
        if errors:
            raise StrategyValidationError("; ".join(errors))
        return self


DEFAULT_STRATEGY = StrategyDefinition()


def entry_hour_allowed(entry: EntrySpec, moment) -> bool:
    """Bu bar kapanışında giriş saati serbest mi? Tek karar yolu: worker ve
    backtest aynı fonksiyonu çağırır (kural 1). `moment` UTC datetime."""
    if entry.hours_utc is None:
        return True
    return moment.hour in entry.hours_utc
