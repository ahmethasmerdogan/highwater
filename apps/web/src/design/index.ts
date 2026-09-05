/**
 * Tasarım sisteminin tek giriş noktası.
 *
 * Sayfalar dosya yolu değil, bu adı ithal eder: bir bileşen taşındığında
 * on beş sayfa değişmez. Grafik ve ızgara bilerek DIŞARIDA — ikisi de ağır
 * (recharts, lightweight-charts, TanStack) ve buradan ihraç edilirse her
 * sayfa hepsini paketine çeker.
 */

export { cx } from "./cx";
export * from "./icons";
export * from "./primitives";
export * from "./numeric";
export * from "./explain";
export * from "./state";
export * from "./pills";
export * from "./form";
export * from "./modal";
export * from "./drawer";
export * from "./viz";
export { FAMILIES, FAMILY_BY_ID, type Family } from "./series";
export { useAnimatedNumber, useChangeTint, useReducedMotion } from "./motion";
export { ThemeProvider, useTheme, type ThemeMode } from "./theme";
export { ToastProvider, useToast, type ToastInput } from "./toast";
