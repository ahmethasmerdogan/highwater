"use client";

/**
 * Tema — uicean'ın sağlayıcısına ince bir köprü (v3).
 *
 * Eski panelin kendi tema sağlayıcısı vardı; v3 uicean'ı tek temel yaptı.
 * `useTheme` uicean'dan gelir ve eski şekli kapsar ({mode, resolved,
 * setMode}) + vurgu/yazı tipi. Depolama anahtarı uicean'ınkidir
 * ("uicean-theme"); root layout'taki boyama-öncesi betik de aynı anahtarı
 * okur — ikisi ayrışırsa tema bir kare yanlış çizilir.
 */

export { ThemeProvider, useTheme, themeScript } from "uicean";
export type { ThemeMode } from "uicean";
