/**
 * Terminal komut satırı — DESIGN §4.
 *
 * Sözdizimi `SEMBOL KOMUT ARG`. Tablo şartnameden birebir:
 *
 * | `SOLUSDT G 1h` | Grafik aç           |
 * | `SOLUSDT SC`   | Puan Kartı          |
 * | `SOLUSDT SR`   | S/R seviyeleri      |
 * | `SCAN 80`      | Puanı ≥80 olanlar   |
 * | `POOL`         | Havuz + filtre hunisi |
 * | `POS` / `ORD`  | Pozisyonlar / emirler |
 * | `BT SOLUSDT`   | Hızlı backtest      |
 * | `KILL`         | Kill switch (onay ister) |
 *
 * Ayrıştırma **saf bir fonksiyondur**: girdi bir dize, çıktı bir eylem. Böylece
 * hem terminal komut satırı hem ⌘K paleti aynı dili konuşur ve test edilebilir.
 */

export type PanelKind =
  | "chart"
  | "scorecard"
  | "sr"
  | "scores"
  | "pool"
  | "positions"
  | "orders"
  | "logs"
  | "calibration";

export type Command =
  | { kind: "open"; panel: PanelKind; symbol?: string; timeframe?: string; title: string }
  | { kind: "scan"; threshold: number }
  | { kind: "kill" }
  | { kind: "backtest"; symbol: string }
  | { kind: "error"; message: string };

export const TIMEFRAMES = ["15m", "1h", "4h", "1d", "1w"] as const;

/** Tek kelimelik komutlar — sembol istemez. */
const GLOBAL: Record<string, Command> = {
  POOL: { kind: "open", panel: "pool", title: "Havuz" },
  POS: { kind: "open", panel: "positions", title: "Pozisyonlar" },
  ORD: { kind: "open", panel: "orders", title: "Emirler" },
  LOG: { kind: "open", panel: "logs", title: "Log akışı" },
  CAL: { kind: "open", panel: "calibration", title: "Kalibrasyon" },
  SCORES: { kind: "open", panel: "scores", title: "Puan tablosu" },
  KILL: { kind: "kill" },
};

/** Sembolle kullanılan komutlar. */
const PER_SYMBOL: Record<string, { panel: PanelKind; title: (s: string) => string }> = {
  G: { panel: "chart", title: (s) => `${s} · Grafik` },
  SC: { panel: "scorecard", title: (s) => `${s} · Puan Kartı` },
  SR: { panel: "sr", title: (s) => `${s} · S/R` },
};

const SYMBOL_PATTERN = /^[A-Z0-9]{2,20}$/;

export function parseCommand(raw: string): Command | null {
  const parts = raw.trim().toUpperCase().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return null;

  const [first, second, third] = parts;

  if (first in GLOBAL) return GLOBAL[first];

  if (first === "SCAN") {
    const threshold = Number(second ?? 80);
    if (!Number.isFinite(threshold)) {
      return { kind: "error", message: "SCAN bir sayı bekler. Örnek: SCAN 80" };
    }
    return { kind: "scan", threshold };
  }

  if (first === "BT") {
    if (!second || !SYMBOL_PATTERN.test(second)) {
      return { kind: "error", message: "BT bir sembol bekler. Örnek: BT SOLUSDT" };
    }
    return { kind: "backtest", symbol: second };
  }

  if (!SYMBOL_PATTERN.test(first)) {
    return { kind: "error", message: `"${first}" bir sembol ya da komut değil.` };
  }

  // Yalnızca sembol yazıldıysa grafiği aç — en sık istenen şey bu.
  const verb = second ?? "G";
  const spec = PER_SYMBOL[verb];
  if (!spec) {
    return {
      kind: "error",
      message: `"${verb}" bilinmeyen komut. G grafik, SC puan kartı, SR destek/direnç.`,
    };
  }

  const timeframe =
    spec.panel === "chart" &&
    third &&
    (TIMEFRAMES as readonly string[]).includes(third.toLowerCase())
      ? third.toLowerCase()
      : undefined;

  return {
    kind: "open",
    panel: spec.panel,
    symbol: first,
    timeframe,
    title: spec.title(first),
  };
}
