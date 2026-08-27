"""Veri kalitesi denetçisi — MASTER-SPEC §2.3.

Dört kontrol: boşluk, aykırı değer, bayat veri, mantık.
Sonuçlar `data_quality_reports` tablosuna yazılır ve panelde görünür.
"""

from __future__ import annotations

import json
import math
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta

import numpy as np
import pandas as pd
from sqlalchemy import text
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from sarnic.core.calendar import calendar_for
from sarnic.core.enums import TIMEFRAME_MINUTES
from sarnic.core.logging import get_logger
from sarnic.core.markets import market_of
from sarnic.db.models import DataQualityReport

log = get_logger(__name__)

# Tek barda bu eşiği aşan log-getiri insan onayına düşer (§2.3).
OUTLIER_LOG_RETURN = 0.5

# Son kapanmış bardan bu kadar bar geride kalmak "gecikme" değil "durma"dır.
# Bir barın yazılması saniyeler sürer; iki bar boyu sessizlik akışın kesildiğini
# gösterir. Dilim başına ölçekler: 1h için 2 saat, 1d için 2 gün.
STALE_AFTER_BARS = 2


@dataclass(slots=True)
class Gap:
    symbol: str
    timeframe: str
    start: datetime
    end: datetime
    missing_bars: int


@dataclass(slots=True)
class QualityFinding:
    kind: str  # gap | outlier | stale | sanity
    symbol: str
    timeframe: str
    severity: str
    detail: dict


@dataclass(slots=True)
class QualityReport:
    symbol: str
    timeframe: str
    expected_bars: int = 0
    actual_bars: int = 0
    gaps: list[Gap] = field(default_factory=list)
    findings: list[QualityFinding] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return not self.findings

    @property
    def completeness(self) -> float:
        if self.expected_bars <= 0:
            return 1.0
        return min(1.0, self.actual_bars / self.expected_bars)


def find_gaps(df: pd.DataFrame, symbol: str, timeframe: str) -> list[Gap]:
    """Ardışık `open_time` farkı bir bardan büyükse boşluk vardır.

    Seanslı pazarda (ekli sembol) adım aritmetiği hafta sonunu ~65 barlık
    ERROR sanır ve onarımcı olmayan barları sonsuza kadar kovalar. Orada
    boşluk KÜME farkıyla ölçülür: takvimin beklediği seans günleri − eldekiler.
    """
    if len(df) < 2:
        return []
    market = market_of(symbol)
    if market.code != "CRYPTO":
        return _find_session_gaps(df, symbol, timeframe, market)
    step = timedelta(minutes=TIMEFRAME_MINUTES[timeframe])
    times = pd.to_datetime(df["open_time"], utc=True).sort_values().reset_index(drop=True)
    deltas = times.diff().dropna()
    gaps: list[Gap] = []
    for idx, delta in deltas.items():
        if delta > step:
            missing = int(delta / step) - 1
            if missing > 0:
                gaps.append(
                    Gap(
                        symbol=symbol,
                        timeframe=timeframe,
                        start=times[idx - 1].to_pydatetime(),
                        end=times[idx].to_pydatetime(),
                        missing_bars=missing,
                    )
                )
    return gaps


def _find_session_gaps(
    df: pd.DataFrame, symbol: str, timeframe: str, market
) -> list[Gap]:
    """Takvim-farkında boşluk: yalnızca GERÇEK seans günleri sayılır."""
    if timeframe != "1d":
        return []  # v1: hisselerde yalnız 1d toplanır
    cal = calendar_for(market.calendar)
    times = pd.to_datetime(df["open_time"], utc=True).sort_values()
    have = {t.date() for t in times}
    start, end = times.min().to_pydatetime(), times.max().to_pydatetime()
    expected = getattr(cal, "_sessions", None)
    if expected is None:
        return []
    beklenen = {s.date() for s in cal._sessions(start, end)}
    eksik = sorted(beklenen - have)
    if not eksik:
        return []
    # Ardışık eksik günleri tek boşlukta topla.
    gaps: list[Gap] = []
    blok = [eksik[0]]
    for day in eksik[1:]:
        if (day - blok[-1]).days <= 3:  # hafta sonu köprüsü
            blok.append(day)
        else:
            gaps.append(_session_gap(symbol, timeframe, blok))
            blok = [day]
    gaps.append(_session_gap(symbol, timeframe, blok))
    return gaps


def _session_gap(symbol: str, timeframe: str, days: list) -> Gap:
    from datetime import datetime as _dt

    return Gap(
        symbol=symbol,
        timeframe=timeframe,
        start=_dt(days[0].year, days[0].month, days[0].day, tzinfo=UTC),
        end=_dt(days[-1].year, days[-1].month, days[-1].day, tzinfo=UTC),
        missing_bars=len(days),
    )


def find_trailing_gap(df: pd.DataFrame, symbol: str, timeframe: str, now: datetime) -> Gap | None:
    """Son kayıtlı bar ile kapanmış olması gereken son bar arasındaki boşluk.

    `find_gaps` yalnızca çerçevenin **içine** bakar: ardışık iki bar arasındaki
    delta. Akış tamamen durursa çerçevede iç boşluk oluşmaz — sadece kısa kalır —
    ve denetim "temiz" der. 1d ve 4h verisi iki gün boyunca tam böyle dondu ve
    panel "0 bulgu" gösterdi (`SYSTEM-REVIEW` §2). Bir dilimin **durduğunu**
    görmenin tek yolu sona bakmaktır.

    Tolerans `STALE_AFTER_BARS` bardır: bir barın yazılması saniyeler sürer,
    ama iki bar boyu gecikme artık gecikme değil durmadır.
    """
    if df.empty:
        return None
    step = timedelta(minutes=TIMEFRAME_MINUTES[timeframe])
    last = pd.to_datetime(df["open_time"], utc=True).max().to_pydatetime()
    market = market_of(symbol)
    if market.code != "CRYPTO":
        # Kapanmış son seansa göre: cumartesi "dün bar yok" bir arıza değildir.
        cal = calendar_for(market.calendar)
        expected_last = cal.last_closed_bar(now, timeframe)
        missing = cal.expected_bars(last, expected_last, timeframe) - 1
        if missing < STALE_AFTER_BARS:
            return None
        return Gap(
            symbol=symbol,
            timeframe=timeframe,
            start=last,
            end=expected_last + step,
            missing_bars=missing,
        )
    expected_last = now - step  # en son kapanmış olması gereken barın açılışı
    missing = int((expected_last - last) / step)
    if missing < STALE_AFTER_BARS:
        return None
    return Gap(
        symbol=symbol,
        timeframe=timeframe,
        start=last,
        end=expected_last + step,
        missing_bars=missing,
    )


def find_outliers(df: pd.DataFrame, threshold: float = OUTLIER_LOG_RETURN) -> list[dict]:
    """Tek barda |log getiri| > eşik → işaretle. Kötü tick mi, gerçek hareket mi?"""
    if len(df) < 2:
        return []
    close = pd.to_numeric(df["close"], errors="coerce").astype(float)
    with np.errstate(divide="ignore", invalid="ignore"):
        logret = np.log(close / close.shift(1))
    flagged = df.loc[logret.abs() > threshold]
    out: list[dict] = []
    for idx in flagged.index:
        value = float(logret.loc[idx])
        if not math.isfinite(value):
            continue
        out.append(
            {
                "open_time": pd.Timestamp(df.loc[idx, "open_time"]).isoformat(),
                "log_return": round(value, 6),
                "close": float(df.loc[idx, "close"]),
                "prev_close": float(close.shift(1).loc[idx]),
            }
        )
    return out


def find_sanity_violations(df: pd.DataFrame) -> list[dict]:
    """`low <= open,close <= high` ve `volume >= 0` her satırda."""
    if df.empty:
        return []
    o, h, low_, c, v = (
        pd.to_numeric(df[k], errors="coerce").astype(float)
        for k in ("open", "high", "low", "close", "volume")
    )
    bad = (
        (low_ > o)
        | (low_ > c)
        | (o > h)
        | (c > h)
        | (low_ > h)
        | (v < 0)
        | o.isna()
        | h.isna()
        | low_.isna()
        | c.isna()
    )
    return [
        {
            "open_time": pd.Timestamp(df.loc[i, "open_time"]).isoformat(),
            "open": float(o.loc[i]),
            "high": float(h.loc[i]),
            "low": float(low_.loc[i]),
            "close": float(c.loc[i]),
            "volume": float(v.loc[i]),
        }
        for i in df.index[bad]
    ]


def audit_frame(
    df: pd.DataFrame, symbol: str, timeframe: str, *, now: datetime | None = None
) -> QualityReport:
    """`now` verilirse çerçevenin **sonuna** da bakılır (bkz. `find_trailing_gap`).

    Verilmezse yalnızca iç tutarlılık denetlenir — saf ve deterministik kalır,
    bilinen-sonuçlu fixture testleri bu yolu kullanır.
    """
    report = QualityReport(symbol=symbol, timeframe=timeframe, actual_bars=len(df))

    if df.empty:
        report.findings.append(
            QualityFinding("gap", symbol, timeframe, "ERROR", {"reason": "veri yok"})
        )
        return report

    times = pd.to_datetime(df["open_time"], utc=True)
    market = market_of(symbol)
    if market.code != "CRYPTO":
        # Takvim aralığını bar süresine bölmek hissede completeness'i her
        # zaman ~%30 gösterirdi — hafta sonu "eksik" değildir.
        report.expected_bars = calendar_for(market.calendar).expected_bars(
            times.min().to_pydatetime(), times.max().to_pydatetime(), timeframe
        )
    else:
        span_minutes = (times.max() - times.min()).total_seconds() / 60
        report.expected_bars = int(span_minutes // TIMEFRAME_MINUTES[timeframe]) + 1

    report.gaps = find_gaps(df, symbol, timeframe)
    if now is not None:
        trailing = find_trailing_gap(df, symbol, timeframe, now)
        if trailing is not None:
            # Kuyruk boşluğu da bir boşluktur: aynı listeye girer, böylece
            # `repair_gaps` onu REST ile doldurur ve temiz denetim kapatır.
            report.gaps.append(trailing)
    for gap in report.gaps:
        report.findings.append(
            QualityFinding(
                "gap",
                symbol,
                timeframe,
                "WARN" if gap.missing_bars < 24 else "ERROR",
                {
                    "start": gap.start.isoformat(),
                    "end": gap.end.isoformat(),
                    "missing_bars": gap.missing_bars,
                },
            )
        )

    for outlier in find_outliers(df):
        report.findings.append(QualityFinding("outlier", symbol, timeframe, "WARN", outlier))

    for bad in find_sanity_violations(df):
        report.findings.append(QualityFinding("sanity", symbol, timeframe, "ERROR", bad))

    return report


def is_stale(last_message_at: datetime | None, now: datetime, threshold_s: int) -> bool:
    """WS akışı `threshold_s` saniyedir sessizse veri bayattır (§2.3)."""
    if last_message_at is None:
        return True
    return (now - last_message_at).total_seconds() > threshold_s


def finding_fingerprint(finding: QualityFinding) -> str:
    """Bulgunun **değişmeyen kimliği** (`SYSTEM-REVIEW` §4b).

    Tüm `detail` sözlüğünü kimlik saymak işe yaramaz: kuyruk boşluğunun `end`
    ve `missing_bars` alanları her denetimde ilerler, yani aynı durma her saat
    yeni bir kimlik üretirdi — tam da engellemeye çalıştığımız şey.

    Bu yüzden her tür için sabit kalan alan seçilir:

    * `outlier` / `sanity` → barın açılış zamanı. Tarihsel bir barın özelliği
      sonradan değişmez.
    * `gap` → verinin **kesildiği** an (`start`). Kuyruk boşluğunda bu, son
      kayıtlı bardır ve akış durduğu sürece sabit kalır; veri geldikçe boşluk
      gerçekten başka bir boşluğa dönüşür ve yeni kayıt hak eder.
    * çerçevenin tamamen boş olduğu durum → `veri-yok`.

    Metin olarak saklanır, hash'lenmez: `data_quality_reports` satırına bakan
    biri kimliğin neden o olduğunu doğrudan görebilmeli. Migrasyon aynı kuralı
    SQL'de tekrar ürettiği için de düz metin şart.
    """
    detail = finding.detail or {}
    if finding.kind in ("outlier", "sanity"):
        key = str(detail.get("open_time") or "")
    elif finding.kind == "gap":
        key = str(detail.get("start") or "veri-yok")
    else:
        key = ""
    # Bilinmeyen tür ya da beklenen alanın olmadığı hâl: sözlüğün kendisi
    # kimlik olur. Uydurmaktansa fazla ayrıntılı olmak yeğdir.
    return key or json.dumps(detail, sort_keys=True, default=str)


async def persist_report(session: AsyncSession, report: QualityReport) -> int:
    """Bulguları DB'ye yazar; **yeni** yazılan satır sayısını döndürür.

    Açık bir bulgunun ikinci kopyası yazılmaz. Kısmi benzersiz indeks yalnızca
    `resolved = false` satırlarda geçerli olduğu için:

    * aykırı değer hiç kapanmadığından bir kez yazılır ve bir daha yazılmaz;
    * kapanmış bir boşluk yeniden oluşursa yeni satır yazılır — o gerçekten
      yeni bir olaydır.

    Kopya kayıtların bedeli diskte değil, panelde ölçüldü: 250 aykırı değer
    satırı yalnızca 23 gerçek bulguyu temsil ediyordu ve veri kalitesi sayfası
    okunmaz hâldeydi.
    """
    if not report.findings:
        return 0

    now = datetime.now(UTC)
    rows = [
        {
            "kind": f.kind,
            "symbol": f.symbol,
            "timeframe": f.timeframe,
            "severity": f.severity,
            "detail": f.detail,
            "created_at": now,
            "fingerprint": finding_fingerprint(f),
        }
        for f in report.findings
    ]

    # Aynı denetim turu içinde de kopya olabilir (aynı bara iki bulgu); indeks
    # tur içi kopyayı da reddeder ama tek `INSERT` içinde iki özdeş satır
    # olması Postgres'te hata verir, bu yüzden önce burada tekilleştiriyoruz.
    seen: set[tuple[str, str, str, str]] = set()
    unique: list[dict] = []
    for row in rows:
        key = (row["symbol"], row["timeframe"], row["kind"], row["fingerprint"])
        if key in seen:
            continue
        seen.add(key)
        unique.append(row)

    statement = (
        pg_insert(DataQualityReport)
        .values(unique)
        .on_conflict_do_nothing(
            index_elements=["symbol", "timeframe", "kind", "fingerprint"],
            index_where=text("NOT resolved"),
        )
        .returning(DataQualityReport.id)
    )
    written = len((await session.execute(statement)).scalars().all())

    if written:
        log.info(
            "quality_findings",
            symbol=report.symbol,
            timeframe=report.timeframe,
            count=written,
            duplicates=len(unique) - written,
            completeness=round(report.completeness, 4),
        )
    return written
