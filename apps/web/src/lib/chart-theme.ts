/**
 * Grafik paleti — DESIGN §2.
 *
 * `lightweight-charts` canvas'a çizer ve CSS değişkeni okuyamaz; renkler
 * JavaScript'ten verilmek zorunda. Tek kaynak burasıdır ki grafik ile tablo
 * aynı kırmızıyı kullansın.
 *
 * Renk disiplini: kehribar = veri · cyan = ikincil · yeşil/kırmızı YALNIZCA
 * yön · turuncu yalnızca uyarı.
 */
export const CHART_COLORS = {
  background: "#07090b",
  grid: "#101619",
  rule: "#1a2126",
  amber: "#ffb000",
  amberDim: "#a67200",
  cyan: "#4ec9e0",
  up: "#26d07c",
  down: "#ff4d4d",
  downDim: "#8b3a3a",
  warn: "#ff8a3d",
  text: "#c9d3d9",
  muted: "#6b7a82",
  /** Hacim çubukları — mumların okunmasını engellemeyecek kadar soluk. */
  upFaint: "#26d07c33",
  downFaint: "#ff4d4d33",
} as const;
