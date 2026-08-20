/* ------------------------------------------------------------------ */
/* HashUI — portable component bundle                                  */
/*                                                                     */
/* This folder is self-contained: it imports nothing outside itself     */
/* except `react` / `react-dom`. Copy it into any Tailwind v4 project,  */
/* import ./hashui.css after tailwind, and you're done.                 */
/*                                                                     */
/*   import { Button, StatusPill, Modal, useToast } from "@/ui";        */
/*                                                                     */
/* ------------------------------------------------------------------ */

/* primitives */
export * from "./Button";
export * from "./Badge";
export * from "./Avatar";
export * from "./Card";
export * from "./controls";
export * from "./Inputs";

/* navigation & data */
export * from "./Tabs";
export * from "./Progress";
export * from "./Timeline";
export * from "./CommitGraph";

/* feedback & overlays */
export * from "./Feedback";
export * from "./Overlay";

/* motion */
export * from "./Motion";
/*
 * `ThreeOrb` **çıkarıldı** (SARNIÇ uyarlaması).
 *
 * Dekoratif bir 3B küre için `three` (~3 MB) bağımlılığı taşımak, DESIGN §2'nin
 * "hareket: minimum" kuralıyla da çelişiyor: bu bir işlem paneli, vitrin değil.
 * HashUI güncellenirse dosya yeniden gelir; yine çıkarılmalı.
 */

/* theming — wrap your app in <ThemeProvider>, read with useTheme() */
export * from "./theme";

/* icon set (all hand-drawn SVG, tree-shakeable) */
export * from "./icons";

/* class-name helper */
export { cx } from "./cx";
