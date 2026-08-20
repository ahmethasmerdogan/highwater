"use client";

/**
 * Veri tablosu — panelin iş atı.
 *
 * Binance/OKX tablo davranışı: yoğun satırlar, yapışkan başlık, sağa hizalı
 * sayı sütunları, satıra tıklayınca detay.
 *
 * **Sütun başlıkları açıklama taşır.** Bir sütunun adı ("Aralık kararlılığı",
 * "Sonuç (R)") tek başına anlaşılmıyorsa, başlığın yanındaki (i) işareti
 * sözlükten açıklamayı getirir. Bu bir süs değil: kullanıcı sayının ne
 * olduğunu bilmeden tabloyu okuyamaz.
 */

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Button,
  IChevronDown,
  IChevronUp,
  IFilter,
  ISearch,
  ISort,
  cx,
} from "@/ui";
import { InfoDot } from "@/components/common/explain";
import { Empty } from "@/components/common/page";

/* ------------------------------------------------------------------ */
/*  Tipler                                                             */
/* ------------------------------------------------------------------ */

export interface Column<T> {
  /** Benzersiz anahtar — sıralama ve sütun seçici bunu kullanır. */
  key: string;
  header: string;
  /** Başlığa (i) koyar; açıklama sözlükten gelir. */
  term?: string;
  /** Başlığa (i) koyar; açıklama burada yazılır (sayfaya özgü sütunlar). */
  hint?: string;
  cell: (row: T) => ReactNode;
  /** Sıralanabilir sütunlarda değeri döndürür. Yoksa sütun sıralanamaz. */
  sort?: (row: T) => number | string | null | undefined;
  /** Sayı sütunu: sağa hizalı, monospace, `tabular-nums`. */
  num?: boolean;
  /** Varsayılan olarak gizli — sütun seçiciden açılır. */
  defaultHidden?: boolean;
  width?: string;
}

type SortState = { key: string; dir: "asc" | "desc" } | null;

/* ------------------------------------------------------------------ */
/*  Tablo                                                              */
/* ------------------------------------------------------------------ */

export function DataTable<T>({
  rows,
  columns,
  rowKey,
  onRowClick,
  searchText,
  searchPlaceholder = "Ara…",
  defaultSort,
  pageSize = 50,
  dense = false,
  /** Sütun görünürlüğü tarayıcıda saklansın diye benzersiz anahtar. */
  storageKey,
  toolbar,
  emptyTitle = "Kayıt yok",
  emptyDescription,
  footNote,
}: {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string | number;
  onRowClick?: (row: T) => void;
  /** Aramanın tarayacağı metin. Verilmezse arama kutusu çıkmaz. */
  searchText?: (row: T) => string;
  searchPlaceholder?: string;
  defaultSort?: { key: string; dir: "asc" | "desc" };
  pageSize?: number;
  dense?: boolean;
  storageKey?: string;
  /** Arama kutusunun yanına ek süzgeçler. */
  toolbar?: ReactNode;
  emptyTitle?: string;
  emptyDescription?: string;
  /** Tablonun altındaki açıklama — kayıt sayısı, kapsam uyarısı vb. */
  footNote?: ReactNode;
}) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortState>(defaultSort ?? null);
  const [page, setPage] = useState(0);
  const [hidden, setHidden] = useState<string[]>(() =>
    columns.filter((c) => c.defaultHidden).map((c) => c.key),
  );
  const [pickerOpen, setPickerOpen] = useState(false);

  /* Sütun tercihi tarayıcıda saklanır — SSR'de okunamaz, etkide yüklenir. */
  useEffect(() => {
    if (!storageKey) return;
    try {
      const saved = localStorage.getItem(`sarnic.cols.${storageKey}`);
      if (saved) setHidden(JSON.parse(saved) as string[]);
    } catch {
      /* bozuk kayıt varsayılanı bozmasın */
    }
  }, [storageKey]);

  const toggleColumn = (key: string) => {
    setHidden((prev) => {
      const next = prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key];
      if (storageKey) {
        try {
          localStorage.setItem(`sarnic.cols.${storageKey}`, JSON.stringify(next));
        } catch {
          /* saklanamadıysa oturum boyunca geçerli kalır */
        }
      }
      return next;
    });
  };

  const visible = columns.filter((c) => !hidden.includes(c.key));

  /* --- süz + sırala ------------------------------------------------ */
  const processed = useMemo(() => {
    let out = rows;

    if (query && searchText) {
      const q = query.toLocaleLowerCase("tr");
      out = out.filter((r) => searchText(r).toLocaleLowerCase("tr").includes(q));
    }

    if (sort) {
      const col = columns.find((c) => c.key === sort.key);
      if (col?.sort) {
        const factor = sort.dir === "asc" ? 1 : -1;
        out = [...out].sort((a, b) => {
          const av = col.sort!(a);
          const bv = col.sort!(b);
          // Boş değerler her zaman sona gider; yönü değiştirince başa
          // sıçramaları sıralamayı okunmaz kılıyordu.
          if (av === null || av === undefined) return 1;
          if (bv === null || bv === undefined) return -1;
          if (typeof av === "number" && typeof bv === "number") return (av - bv) * factor;
          return String(av).localeCompare(String(bv), "tr") * factor;
        });
      }
    }

    return out;
  }, [rows, query, searchText, sort, columns]);

  /* Süzgeç değişince sayfa başa döner; yoksa boş sayfada kalınıyordu. */
  useEffect(() => setPage(0), [query, sort]);

  const pageCount = Math.max(1, Math.ceil(processed.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = processed.slice(safePage * pageSize, (safePage + 1) * pageSize);

  const cycleSort = (col: Column<T>) => {
    if (!col.sort) return;
    setSort((prev) => {
      if (!prev || prev.key !== col.key) return { key: col.key, dir: "desc" };
      if (prev.dir === "desc") return { key: col.key, dir: "asc" };
      return null; // üçüncü tıklama sıralamayı kaldırır
    });
  };

  const showToolbar = Boolean(searchText || toolbar || storageKey);

  return (
    <div className="flex flex-col">
      {showToolbar && (
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2.5">
          {searchText && (
            <label className="relative flex min-w-52 flex-1 items-center sm:max-w-72">
              <ISearch size={14} className="pointer-events-none absolute left-2.5 text-ink-3" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={searchPlaceholder}
                className="h-8 w-full rounded-lg border border-line bg-inset pr-2.5 pl-8 text-[13px] text-ink placeholder:text-ink-3 focus:border-brand focus:outline-none"
              />
            </label>
          )}

          {toolbar}

          <div className="ml-auto flex items-center gap-2">
            <span className="text-[12px] text-ink-3">
              {processed.length.toLocaleString("tr-TR")} kayıt
              {processed.length !== rows.length && ` (${rows.length.toLocaleString("tr-TR")} içinden)`}
            </span>

            {storageKey && (
              <div className="relative">
                <Button
                  size="sm"
                  variant="ghost"
                  shape="rect"
                  onClick={() => setPickerOpen((v) => !v)}
                  aria-expanded={pickerOpen}
                >
                  <IFilter size={13} />
                  Sütunlar
                </Button>
                {pickerOpen && (
                  <>
                    {/* Dışarı tıklayınca kapansın */}
                    <div
                      className="fixed inset-0 z-40"
                      onClick={() => setPickerOpen(false)}
                      aria-hidden
                    />
                    <div className="absolute right-0 z-50 mt-1 max-h-80 w-56 overflow-y-auto rounded-lg border border-line bg-surface p-1.5 shadow-pop">
                      {columns.map((c) => (
                        <label
                          key={c.key}
                          className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-[12.5px] text-ink hover:bg-inset"
                        >
                          <input
                            type="checkbox"
                            checked={!hidden.includes(c.key)}
                            onChange={() => toggleColumn(c.key)}
                            className="accent-[var(--brand)]"
                          />
                          {c.header}
                        </label>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {pageRows.length === 0 ? (
        <Empty
          title={query ? "Aramaya uyan kayıt yok" : emptyTitle}
          description={
            query
              ? `"${query}" için sonuç bulunamadı. Aramayı temizleyip yeniden deneyin.`
              : emptyDescription
          }
          className="m-4 border-0"
        />
      ) : (
        <div className="thin-scroll overflow-x-auto">
          <table className={cx("grid-table", dense && "is-dense")}>
            <thead>
              <tr>
                {visible.map((col) => {
                  const active = sort?.key === col.key;
                  return (
                    <th
                      key={col.key}
                      style={col.width ? { width: col.width } : undefined}
                      className={cx(col.num && "col-num", col.sort && "cursor-pointer select-none")}
                      onClick={() => cycleSort(col)}
                      aria-sort={active ? (sort!.dir === "asc" ? "ascending" : "descending") : undefined}
                    >
                      <span
                        className={cx(
                          "inline-flex items-center gap-1",
                          col.num && "flex-row-reverse",
                        )}
                      >
                        {col.header}
                        {(col.term || col.hint) && (
                          <InfoDot
                            id={col.term}
                            text={col.hint}
                            side="bottom"
                            align={col.num ? "end" : "start"}
                          />
                        )}
                        {col.sort && (
                          <span className={cx("text-ink-3", active && "text-brand")}>
                            {active ? (
                              sort!.dir === "asc" ? (
                                <IChevronUp size={12} />
                              ) : (
                                <IChevronDown size={12} />
                              )
                            ) : (
                              <ISort size={11} className="opacity-40" />
                            )}
                          </span>
                        )}
                      </span>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {pageRows.map((row) => (
                <tr
                  key={rowKey(row)}
                  data-clickable={onRowClick ? "true" : undefined}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  tabIndex={onRowClick ? 0 : undefined}
                  onKeyDown={
                    onRowClick
                      ? (e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            onRowClick(row);
                          }
                        }
                      : undefined
                  }
                >
                  {visible.map((col) => (
                    <td key={col.key} className={cx(col.num && "col-num")}>
                      {col.cell(row)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(pageCount > 1 || footNote) && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-4 py-2.5">
          <div className="text-[12px] text-ink-3">{footNote}</div>
          {pageCount > 1 && (
            <div className="ml-auto flex items-center gap-1.5">
              <Button
                size="sm"
                variant="ghost"
                shape="rect"
                disabled={safePage === 0}
                onClick={() => setPage(safePage - 1)}
              >
                Önceki
              </Button>
              <span className="num px-1 text-[12px] text-ink-2">
                {safePage + 1} / {pageCount}
              </span>
              <Button
                size="sm"
                variant="ghost"
                shape="rect"
                disabled={safePage >= pageCount - 1}
                onClick={() => setPage(safePage + 1)}
              >
                Sonraki
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Kısa listeler                                                      */
/* ------------------------------------------------------------------ */

/**
 * Süzgeçsiz, sayfalamasız sade tablo.
 *
 * On satırlık bir listeye arama kutusu koymak gürültüdür.
 */
export function SimpleTable({
  head,
  children,
  dense = false,
  className,
  maxHeight,
}: {
  head: ReactNode;
  children: ReactNode;
  dense?: boolean;
  className?: string;
  maxHeight?: string;
}) {
  return (
    <div
      className={cx("thin-scroll overflow-auto", className)}
      style={maxHeight ? { maxHeight } : undefined}
    >
      <table className={cx("grid-table", dense && "is-dense")}>
        <thead>
          <tr>{head}</tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
