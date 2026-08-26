import type { ReactNode } from "react";

/**
 * Sütun tanımı.
 *
 * TanStack'in `ColumnDef`'i doğrudan kullanılmıyor: sayfaların yazdığı şey
 * görsel bir sözleşme olmalı ("bu bir sayı sütunu", "başlığı açıklama
 * taşır"), tablo motorunun iç tipi değil. Motor değişirse sayfalar
 * değişmez.
 */
export interface GridColumn<T> {
  /** Benzersiz anahtar — sıralama, görünürlük ve sabitleme bunu kullanır. */
  id: string;
  header: string;
  /** Başlığa (i) koyar. Sütunun ne olduğu adından anlaşılmıyorsa zorunludur. */
  hint?: ReactNode;
  /** Hücre içeriği. */
  cell: (row: T) => ReactNode;
  /**
   * Sıralama ve filtreleme için ham değer. Yoksa sütun sıralanamaz —
   * görsel bir hücreyi metin olarak sıralamak yanlış sonuç verir.
   */
  value?: (row: T) => number | string | null | undefined;
  /** Sayı sütunu: sağa hizalı, monospace, `tabular-nums` (bozulmaz kural 6). */
  num?: boolean;
  /** Başlangıç genişliği (px). Kullanıcı sürükleyerek değiştirebilir. */
  width?: number;
  minWidth?: number;
  /** Sola sabitlenir — yatay kaydırmada yerinde kalır. */
  pin?: boolean;
  /** Varsayılan gizli; sütun seçicisinden açılır. */
  hidden?: boolean;
  /** Alt toplam satırında gösterilecek değer. */
  footer?: (rows: T[]) => ReactNode;
  /** Aramanın tarayacağı metin (verilmezse `value` kullanılır). */
  search?: (row: T) => string;
}

export type Density = "compact" | "default" | "relaxed";

export const ROW_HEIGHT: Record<Density, number> = {
  compact: 28,
  default: 34,
  relaxed: 42,
};
