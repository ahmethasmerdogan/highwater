import type { ScoreConfig } from "@/lib/api";

export type Market = "CRYPTO" | "BIST" | "US";

/** Sembol ekinden pazar: THYAO.IS → BIST, AAPL.US → US, gerisi kripto. */
export function marketOf(symbol: string): Market {
  if (symbol.endsWith(".IS")) return "BIST";
  if (symbol.endsWith(".US")) return "US";
  return "CRYPTO";
}

/** Bir sıralamanın kimliği hash **ve** zaman dilimidir (aynı ağırlıklar
 *  farklı dilimlerde aynı hash'i üretir). */
export const keyOf = (config: ScoreConfig) => `${config.config_hash}:${config.timeframe}`;

export function sumModifiers(modifiers: Record<string, number> | undefined): number {
  return Object.values(modifiers ?? {}).reduce((sum, value) => sum + value, 0);
}

/**
 * Puanın rengi. Yeşil/kırmızı **kullanılmaz**: puan bir yön değil bir
 * sıralamadır. Yoğunluk marka ailesinde değişir.
 */
export function scoreColor(score: number): string {
  if (score >= 70) return "var(--sn-brand-solid)";
  if (score >= 50) return "var(--sn-border-strong)";
  return "var(--sn-border)";
}

/**
 * Seçenek etiketlerinin ORTAK önekini ayıklar (yalnızca ` · ` sınırında).
 * "Havuz Momentum · taban" ile "Havuz Momentum · seçici" → "taban" / "seçici".
 */
export function stripCommonPrefix(labels: string[]): (label: string) => string {
  if (labels.length < 2) return (label) => label;
  const parts = labels.map((label) => label.split(" · "));
  let shared = 0;
  while (
    shared < parts[0].length - 1 &&
    parts.every((part) => part.length > shared + 1 && part[shared] === parts[0][shared])
  ) {
    shared += 1;
  }
  if (shared === 0) return (label) => label;
  return (label) => label.split(" · ").slice(shared).join(" · ") || label;
}
