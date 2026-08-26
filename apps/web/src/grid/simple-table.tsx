"use client";

/**
 * Küçük tablo.
 *
 * `DataGrid`'in yapmadığı iş: sıralama, filtre, sütun seçici ve
 * sanallaştırma olmadan on-onbeş satırı basmak. Bir kartın içinde duran
 * "son beş işlem" listesi için ızgaranın araç çubuğu bilgi değil gürültüdür.
 *
 * Ayrım kuralı: kullanıcının **sıralamak isteyeceği** bir liste ızgaraya,
 * yalnızca **okuyacağı** bir liste buraya gider.
 */

import type { ReactNode } from "react";
import { cx } from "@/design/cx";
import { InfoDot } from "@/design/explain";

export interface SimpleColumn<T> {
  header: string;
  hint?: string;
  term?: string;
  cell: (row: T) => ReactNode;
  /** Sayı sütunu: sağa hizalı (bozulmaz kural 6). */
  num?: boolean;
  width?: string;
}

export function SimpleTable<T>({
  rows,
  columns,
  rowKey,
  onRowClick,
  dense = false,
  className,
}: {
  rows: T[];
  columns: SimpleColumn<T>[];
  rowKey: (row: T) => string | number;
  onRowClick?: (row: T) => void;
  dense?: boolean;
  className?: string;
}) {
  return (
    <table className={cx("w-full", className)} style={{ borderCollapse: "separate", borderSpacing: 0 }}>
      <thead>
        <tr>
          {columns.map((column) => (
            <th
              key={column.header}
              className="sn-label px-3"
              style={{
                height: 30,
                width: column.width,
                textAlign: column.num ? "right" : "left",
                borderBottom: "1px solid var(--sn-hairline)",
                whiteSpace: "nowrap",
              }}
            >
              <span className={cx("inline-flex items-center gap-1", column.num && "flex-row-reverse")}>
                {column.header}
                {(column.hint || column.term) && <InfoDot id={column.term} text={column.hint} />}
              </span>
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr
            key={rowKey(row)}
            onClick={onRowClick ? () => onRowClick(row) : undefined}
            className={cx("group", onRowClick && "cursor-pointer")}
          >
            {columns.map((column) => (
              <td
                key={column.header}
                className="px-3 whitespace-nowrap transition-colors duration-[var(--sn-dur-1)] group-hover:bg-[var(--sn-sunken)]"
                style={{
                  height: dense ? 30 : 36,
                  textAlign: column.num ? "right" : "left",
                  borderBottom: "1px solid var(--sn-hairline)",
                  fontSize: dense ? "var(--sn-t-caption)" : "var(--sn-t-body)",
                  color: "var(--sn-ink)",
                }}
              >
                {column.cell(row)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
