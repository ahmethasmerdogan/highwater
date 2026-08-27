/**
 * Sayı ve tarih biçimleme — bozulmaz kural 6.
 *
 * Her sayı monospace ve `tabular-nums` görünür; bu dosya **değerin metnini**
 * standartlaştırır. Türkçe yerel ayar: binlik ayırıcı nokta, ondalık virgül.
 *
 * Burada yalnızca biçimleme vardır. Kod → Türkçe karşılık çevirileri
 * `humanize.ts`'te, kavram açıklamaları `glossary.ts`'te durur; üçü
 * karıştırılmaz.
 */

const LOCALE = "tr-TR";

/** Sayı yok / hesaplanamadı. Ekranda boşluk bırakmak yerine bunu basıyoruz. */
export const EMPTY = "—";

export function num(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return EMPTY;
  return value.toLocaleString(LOCALE, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/**
 * Fiyat — büyüklüğe göre anlamlı basamak.
 *
 * 68.421,50 ile 0,00001234 aynı kuralla basılır: sabit iki hane, ucuz
 * coinlerde fiyatı tamamen sıfıra yuvarlardı.
 */
export function price(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return EMPTY;
  const abs = Math.abs(value);
  const digits = abs >= 1000 ? 2 : abs >= 1 ? 4 : abs >= 0.01 ? 6 : 8;
  return num(value, digits);
}

export function money(value: number | null | undefined, digits = 2): string {
  return num(value, digits);
}

/**
 * Yüzde iminin önüne işaret koyar: `-%0,15`, `%-0,15` değil.
 *
 * Türkçede yüzde imi sayının önüne yazılır ve işaret onun da önüne geçer.
 * `num()` işareti sayıya yapıştırdığı için burada ayrılıp başa alınır.
 */
function percent(formatted: string, artiIsareti: boolean): string {
  const eksi = formatted.startsWith("-");
  return `${eksi ? "-" : artiIsareti ? "+" : ""}%${eksi ? formatted.slice(1) : formatted}`;
}

/** Oranı yüzdeye çevirir: 0,0154 → %1,54 · -0,0015 → -%0,15 */
export function pct(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return EMPTY;
  return percent(num(value * 100, digits), false);
}

/** Zaten yüzde olarak gelen değer için: 1,54 → %1,54 */
export function pctRaw(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return EMPTY;
  return percent(num(value, digits), false);
}

export function pctSigned(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return EMPTY;
  return percent(num(value * 100, digits), value > 0);
}

export function signed(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return EMPTY;
  return `${value > 0 ? "+" : ""}${num(value, digits)}`;
}

/** Büyük sayılar: 1.234.567 → 1,23 M */
export function compact(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return EMPTY;
  const abs = Math.abs(value);
  if (abs >= 1e9) return `${num(value / 1e9, 2)} Mr`;
  if (abs >= 1e6) return `${num(value / 1e6, 2)} M`;
  if (abs >= 1e3) return `${num(value / 1e3, 1)} B`;
  return num(value, 0);
}

/** Baz puan — küçük maliyetler için. */
export function bps(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return EMPTY;
  return `${num(value, digits)} bps`;
}

/** R cinsinden sonuç: +2,31R */
export function rMultiple(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return EMPTY;
  return `${value > 0 ? "+" : ""}${num(value, digits)}R`;
}

/* ------------------------------------------------------------------ */
/*  Yön                                                                */
/*                                                                     */
/*  Yeşil/kırmızı YALNIZCA yön içindir (renk disiplini). Bu iki yardımcı */
/*  dışında bileşenlerde elle yön rengi yazılmaz.                       */
/* ------------------------------------------------------------------ */

export type Direction = "up" | "down" | "flat";

export function direction(value: number | null | undefined): Direction {
  if (value === null || value === undefined || !Number.isFinite(value) || value === 0) {
    return "flat";
  }
  return value > 0 ? "up" : "down";
}

export function directionClass(value: number | null | undefined): string {
  const d = direction(value);
  if (d === "flat") return "text-ink-3";
  return d === "up" ? "text-up" : "text-down";
}

/* ------------------------------------------------------------------ */
/*  Tarih ve süre                                                      */
/* ------------------------------------------------------------------ */

export function dateTime(iso: string | null | undefined): string {
  if (!iso) return EMPTY;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return EMPTY;
  return d.toLocaleString(LOCALE, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function dateOnly(iso: string | null | undefined): string {
  if (!iso) return EMPTY;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return EMPTY;
  return d.toLocaleDateString(LOCALE, { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function time(iso: string | null | undefined): string {
  if (!iso) return EMPTY;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return EMPTY;
  return d.toLocaleTimeString(LOCALE, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/** "3 dk önce" — canlılık göstergelerinde. */
export function relative(iso: string | null | undefined): string {
  if (!iso) return EMPTY;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return EMPTY;

  const diff = Date.now() - t;
  const future = diff < 0;
  const minutes = Math.round(Math.abs(diff) / 60000);

  const text =
    minutes < 1
      ? "az önce"
      : minutes < 60
        ? `${minutes} dk`
        : minutes < 1440
          ? `${Math.round(minutes / 60)} sa`
          : `${Math.round(minutes / 1440)} gün`;

  if (minutes < 1) return text;
  return future ? `${text} sonra` : `${text} önce`;
}

/** Saat cinsinden süreyi okunur hâle getirir. */
export function duration(hours: number | null | undefined): string {
  if (hours === null || hours === undefined || !Number.isFinite(hours)) return EMPTY;
  if (hours < 1) return `${Math.round(hours * 60)} dk`;
  if (hours < 48) return `${num(hours, 1)} sa`;
  return `${num(hours / 24, 1)} gün`;
}

/* ------------------------------------------------------------------ */
/*  Puan aileleri                                                      */
/* ------------------------------------------------------------------ */

export const FAMILY_LABELS: Record<string, string> = {
  trend: "Trend",
  momentum: "Momentum",
  flow: "Akış",
  vol: "Volatilite",
  sr: "Destek/Direnç",
};

/** Aile → sözlük terimi; Puan Kartı açıklamalarını buradan çeker. */
export const FAMILY_TERMS: Record<string, string> = {
  trend: "aile_trend",
  momentum: "aile_momentum",
  flow: "aile_flow",
  vol: "aile_vol",
  sr: "aile_sr",
};

/**
 * Puan Kartı yığılmış çubuğunun aile renkleri.
 *
 * Yeşil ve kırmızı bilinçli olarak yok: o iki renk yön için rezerve.
 * Beş ton birbirinden ayırt edilebilir ve ikisi de temada okunur.
 */
export const FAMILY_COLORS: Record<string, string> = {
  trend: "var(--series-1)",
  momentum: "var(--series-2)",
  flow: "var(--series-3)",
  vol: "var(--series-4)",
  sr: "var(--series-5)",
};

/** Sembolün baz varlığı: "SOLUSDT" → "SOL" */
export function baseAsset(symbol: string): string {
  return symbol.replace(/(USDT|BUSD|USDC|TRY|BTC|ETH)$/i, "") || symbol;
}
