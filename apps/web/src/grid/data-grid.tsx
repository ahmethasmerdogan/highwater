"use client";

/**
 * Veri ızgarası — panelin iş atı.
 *
 * TanStack Table üstünde; görünüm tamamen bize ait, motordan yalnızca
 * sıralama/filtreleme/görünürlük mantığı alınır.
 *
 * Neler var ve neden:
 *
 * * **Çok sütunlu sıralama** (Shift+tık). "Önce puana, eşitlerde hacme"
 *   gibi sıralamalar tek sütunla kurulamaz.
 * * **Sütun sabitleme.** Sembol sütunu yatay kaydırmada kaybolursa satırın
 *   hangi coine ait olduğu bilinmez — ızgara okunamaz hâle gelir.
 * * **Sütun genişliği sürüklenebilir** ve seçimlerle birlikte saklanır.
 *   Kullanıcının kendi düzeni her açılışta sıfırlanmamalı.
 * * **Sanallaştırma** yalnızca eşiği aşan listelerde devreye girer. Küçük
 *   listede sanallaştırma kazanç değil, kayıt kaybıdır (Ctrl+F çalışmaz).
 * * **Yoğunluk** üç kademe: aynı ekrana 24 yerine 34 satır sığması, uzun
 *   listeleri okumanın tek yolu.
 *
 * Sayı sütunları `num` ile işaretlenir; hizalama ve monospace buradan
 * gelir, sayfalar tek tek uğraşmaz (bozulmaz kural 6).
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type ColumnSizingState,
  type SortingState,
  type VisibilityState,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { cx } from "@/design/cx";
import { Button, Empty, Input, Segmented, Tip } from "@/design/primitives";
import { ROW_HEIGHT, type Density, type GridColumn } from "./types";

/* Sanallaştırma bu satır sayısının üstünde açılır. */
const VIRTUALIZE_OVER = 150;

/* ------------------------------------------------------------------ */
/*  Saklanan düzen                                                     */
/* ------------------------------------------------------------------ */

interface Layout {
  hidden: VisibilityState;
  sizes: ColumnSizingState;
  density: Density;
}

function loadLayout(key: string | undefined, fallback: Layout): Layout {
  if (!key || typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(`sarnic.grid.${key}`);
    if (!raw) return fallback;
    const saved = JSON.parse(raw) as Partial<Layout>;
    return {
      hidden: saved.hidden ?? fallback.hidden,
      sizes: saved.sizes ?? fallback.sizes,
      density: saved.density ?? fallback.density,
    };
  } catch {
    return fallback;
  }
}

/* ------------------------------------------------------------------ */
/*  Izgara                                                             */
/* ------------------------------------------------------------------ */

export function DataGrid<T>({
  rows,
  columns,
  rowKey,
  onRowClick,
  storageKey,
  searchPlaceholder = "Ara…",
  searchable = true,
  toolbar,
  density: initialDensity = "compact",
  emptyTitle = "Kayıt yok",
  emptyHint,
  maxHeight = 640,
  defaultSort,
  /** Satırın vurgulanması gerekiyor mu (örn. açık pozisyon)? */
  rowAccent,
  rowFlash,
  footNote,
}: {
  rows: T[];
  columns: GridColumn<T>[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  storageKey?: string;
  searchPlaceholder?: string;
  searchable?: boolean;
  toolbar?: React.ReactNode;
  density?: Density;
  emptyTitle?: string;
  emptyHint?: React.ReactNode;
  maxHeight?: number;
  defaultSort?: { id: string; desc: boolean }[];
  rowAccent?: (row: T) => string | null;
  /** true dönen satır BİR KEZ amber vurguyla yanar — canlı akışa yeni
      düşen kaydı işaretlemek için (sn-flash). */
  rowFlash?: (row: T) => boolean;
  /** Izgaranın altındaki künye satırı — verinin nereden geldiği. */
  footNote?: React.ReactNode;
}) {
  const initial = useMemo<Layout>(
    () => ({
      hidden: Object.fromEntries(columns.filter((c) => c.hidden).map((c) => [c.id, false])),
      sizes: {},
      density: initialDensity,
    }),
    // Sütun listesi sayfa ömrü boyunca sabittir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const [layout, setLayout] = useState<Layout>(initial);
  const [sorting, setSorting] = useState<SortingState>(defaultSort ?? []);
  const [query, setQuery] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  /** Sağda görünmeyen sütun kaldı mı — kenar solmasını bu belirler. */
  const [saga, setSaga] = useState(false);

  /* Saklanan düzen ilk boyamadan SONRA yüklenir: sunucu ve istemci ilk
     karede aynı çıktıyı üretmezse React hydration uyuşmazlığı verir. */
  useEffect(() => {
    setLayout(loadLayout(storageKey, initial));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  useEffect(() => {
    if (!storageKey) return;
    try {
      window.localStorage.setItem(`sarnic.grid.${storageKey}`, JSON.stringify(layout));
    } catch {
      /* Kota dolu ya da özel mod — düzen kaybolur, ızgara çalışmaya devam eder. */
    }
  }, [storageKey, layout]);

  /* ---- Sütunları motora çevir ------------------------------------- */
  const defs = useMemo<ColumnDef<T>[]>(
    () =>
      columns.map((column) => ({
        id: column.id,
        header: column.header,
        accessorFn: (row: T) => column.value?.(row) ?? null,
        cell: ({ row }) => column.cell(row.original),
        enableSorting: column.value !== undefined,
        size: column.width ?? 120,
        minSize: column.minWidth ?? 56,
        sortUndefined: "last",
      })),
    [columns],
  );

  const byId = useMemo(() => new Map(columns.map((c) => [c.id, c])), [columns]);

  /* ---- Arama ------------------------------------------------------- */
  /* Motorun `globalFilter`'ı yerine önden süzülüyor: arama metni sütun
     `search`/`value`'larından kuruluyor ve hücrelerin ReactNode'larına
     hiç bakılmıyor. Bir hücrenin görsel içeriğini aramak, ekranda
     görünmeyen bir metinde eşleşme üretir. */
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("tr");
    if (!needle) return rows;
    return rows.filter((row) =>
      columns.some((column) => {
        const text = column.search?.(row) ?? column.value?.(row);
        return text !== null && text !== undefined && String(text).toLocaleLowerCase("tr").includes(needle);
      }),
    );
  }, [rows, query, columns]);

  const table = useReactTable({
    data: filtered,
    columns: defs,
    state: { sorting, columnVisibility: layout.hidden, columnSizing: layout.sizes },
    onSortingChange: setSorting,
    onColumnVisibilityChange: (updater) =>
      setLayout((l) => ({
        ...l,
        hidden: typeof updater === "function" ? updater(l.hidden) : updater,
      })),
    onColumnSizingChange: (updater) =>
      setLayout((l) => ({
        ...l,
        sizes: typeof updater === "function" ? updater(l.sizes) : updater,
      })),
    columnResizeMode: "onChange",
    enableMultiSort: true,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  const modelRows = table.getRowModel().rows;
  const rowHeight = ROW_HEIGHT[layout.density];

  /* ---- Sanallaştırma ---------------------------------------------- */
  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualize = modelRows.length > VIRTUALIZE_OVER;
  const virtualizer = useVirtualizer({
    count: modelRows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowHeight,
    overscan: 12,
    enabled: virtualize,
  });
  const virtualRows = virtualize ? virtualizer.getVirtualItems() : null;
  const padTop = virtualRows?.length ? virtualRows[0].start : 0;
  const padBottom = virtualRows?.length
    ? virtualizer.getTotalSize() - virtualRows[virtualRows.length - 1].end
    : 0;

  /**
   * Sabitlenmiş sütunların soldan konumu.
   *
   * Sabitleme **baştan kesintisiz bir blok** olmak zorundadır. Yalnızca
   * `pin` işaretli sütunları toplamak, aradaki sabitlenmemiş sütunun
   * genişliğini atlıyor ve sabitlenen sütunu onun üstüne bindiriyordu:
   * "#" sabit değilken "Sembol" sabitlenince Sembol `left: 0`'a yapışıp
   * sıra numarasını örtüyordu.
   *
   * Bu yüzden blok, `pin` işaretli SON sütuna kadar uzatılır — Sembol'ü
   * sabitlemek kendisinden önceki "#"i de sabitler, ki görsel olarak
   * istenen de budur.
   */
  const pinnedOffsets = useMemo(() => {
    const headers = table.getFlatHeaders();
    let last = -1;
    headers.forEach((header, index) => {
      if (byId.get(header.column.id)?.pin) last = index;
    });

    const offsets = new Map<string, number>();
    let running = 0;
    for (let index = 0; index <= last; index += 1) {
      offsets.set(headers[index].column.id, running);
      running += headers[index].getSize();
    }
    return offsets;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table, byId, layout.sizes, layout.hidden]);

  /** Sabit blokun SON sütunu — kayan içerikle arasına gölge o çizer. */
  const sonSabit = useMemo(() => {
    let id: string | null = null;
    for (const anahtar of pinnedOffsets.keys()) id = anahtar;
    return id;
  }, [pinnedOffsets]);

  /* Solmayı ilk çizimde de doğru göster: veri ya da sütun değişince ölç. */
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const olc = () => setSaga(el.scrollWidth - el.clientWidth - el.scrollLeft > 4);
    olc();
    const ro = new ResizeObserver(olc);
    ro.observe(el);
    return () => ro.disconnect();
  }, [rows, layout.hidden, layout.sizes]);

  const hasFooter = columns.some((c) => c.footer);

  return (
    <div className="flex flex-col">
      {/* ---- Araç çubuğu ------------------------------------------- */}
      <div className="flex flex-wrap items-center gap-2 px-3 py-2.5">
        {searchable && (
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={searchPlaceholder}
            icon={<SearchIcon />}
            className="w-[220px]"
          />
        )}
        {toolbar}
        <div className="ml-auto flex items-center gap-2">
          <span className="sn-num" style={{ fontSize: "var(--sn-t-caption)", color: "var(--sn-ink-3)" }}>
            {filtered.length}
            {filtered.length !== rows.length && ` / ${rows.length}`}
            <span className="sn-num-unit">kayıt</span>
          </span>
          <Segmented
            size="sm"
            value={layout.density}
            onChange={(density) => setLayout((l) => ({ ...l, density }))}
            options={[
              { value: "compact", label: "Sık" },
              { value: "default", label: "Orta" },
              { value: "relaxed", label: "Seyrek" },
            ]}
          />
          <div className="relative">
            <Button size="sm" variant="quiet" onClick={() => setPickerOpen((open) => !open)}>
              Sütunlar
            </Button>
            {pickerOpen && (
              <ColumnPicker
                columns={columns}
                table={table}
                onClose={() => setPickerOpen(false)}
                onReset={() => setLayout((l) => ({ ...l, sizes: {}, hidden: initial.hidden }))}
              />
            )}
          </div>
        </div>
      </div>

      {/* ---- Izgara ------------------------------------------------- */}
      {modelRows.length === 0 ? (
        <Empty title={emptyTitle} hint={emptyHint} />
      ) : (
        <div className="relative">
          {/* Sağ kenar solması: sütunlar kart kenarında ORTADAN KESİLİYORDU ve
              tablo bozuk görünüyordu. Solma "devamı var, kaydır" der; kaydırma
              sona gelince kaybolur. */}
          {saga && (
            <div
              aria-hidden
              className="pointer-events-none absolute top-0 right-0 bottom-0 z-30 w-10"
              style={{
                background:
                  "linear-gradient(to right, transparent, color-mix(in oklab, var(--sn-panel) 92%, transparent))",
              }}
            />
          )}
          <div
            ref={scrollRef}
            onScroll={(e) => {
              const el = e.currentTarget;
              setSaga(el.scrollWidth - el.clientWidth - el.scrollLeft > 4);
            }}
            className="sn-scroll overflow-auto"
            style={{ maxHeight }}
          >
          {/*
            Genişlik %100, taban ise sütunlar toplamı: dar tabloda ızgara
            konteyneri doldurur, geniş tabloda yatay kaydırma açılır.

            Artan yer sütunlara PAYLAŞTIRILMAZ, sondaki dolgu hücresine
            verilir. Paylaştırmak (`table-layout: fixed`) sütunların gerçek
            genişliğini `getSize()`'dan ayırır ve sabitlenmiş sütunların
            `left` hesabı kayar — sabitlenen sütun yanlış yere yapışır.
          */}
          <table
            style={{
              borderCollapse: "separate",
              borderSpacing: 0,
              width: "100%",
              minWidth: table.getTotalSize(),
            }}
          >
            <thead className="sticky top-0 z-20">
              {table.getHeaderGroups().map((group) => (
                <tr key={group.id}>
                  {group.headers.map((header) => {
                    const column = byId.get(header.column.id);
                    const sorted = header.column.getIsSorted();
                    const order = sorting.findIndex((s) => s.id === header.column.id);
                    const pinned = pinnedOffsets.get(header.column.id);
                    return (
                      <th
                        key={header.id}
                        className={cx(
                          "relative select-none px-3 whitespace-nowrap",
                          column?.num && "text-right",
                        )}
                        style={{
                          width: header.getSize(),
                          height: 34,
                          background: "var(--sn-sunken)",
                          borderBottom: "1px solid var(--sn-border-strong)",
                          textAlign: column?.num ? "right" : "left",
                          /* Başlık okunur olmalı: eski `sn-label` %60 gri +
                             büyük harf + 0,06em aralık idi ve "STOP MESAFESİ"
                             iki satıra sarıyordu. Artık normal yazım, koyu
                             mürekkep, sarmıyor. */
                          fontSize: "var(--sn-t-caption)",
                          fontWeight: 500,
                          letterSpacing: 0,
                          textTransform: "none",
                          color: "var(--sn-ink-2)",
                          ...(pinned !== undefined
                            ? {
                                position: "sticky",
                                left: pinned,
                                zIndex: 21,
                                boxShadow:
                                  sonSabit === header.column.id
                                    ? "8px 0 8px -8px rgb(0 0 0 / 0.18)"
                                    : undefined,
                              }
                            : null),
                        }}
                        aria-sort={
                          sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : undefined
                        }
                      >
                        {/* Gerçek <button>: span klavyeden sıralanamıyordu.
                            `all: unset` başlığın tipografisini birebir korur —
                            önceki sıfırlama (font-[inherit]) tarayıcının
                            disabled rengini ve buton metriklerini sızdırıyor,
                            başlık satırı "bozuk" görünüyordu. */}
                        <button
                          type="button"
                          disabled={!header.column.getCanSort()}
                          className="sn-focus"
                          style={{
                            all: "unset",
                            outline: "revert-layer",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 4,
                            font: "inherit",
                            color: "inherit",
                            letterSpacing: "inherit",
                            textTransform: "inherit",
                            cursor: header.column.getCanSort() ? "pointer" : "default",
                          }}
                          onClick={header.column.getToggleSortingHandler()}
                          title={
                            header.column.getCanSort()
                              ? "Sırala · Shift ile ikincil sıralama"
                              : undefined
                          }
                        >
                          {column?.hint ? (
                            <Tip content={column.hint}>
                              <span className="inline-flex items-center gap-1">
                                {header.column.columnDef.header as string}
                                <span
                                  aria-hidden
                                  style={{
                                    fontSize: 9,
                                    lineHeight: 1,
                                    color: "var(--sn-ink-4)",
                                    opacity: 0.55,
                                    border: "1px solid currentColor",
                                    borderRadius: "50%",
                                    width: 11,
                                    height: 11,
                                    display: "inline-flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                  }}
                                >
                                  i
                                </span>
                              </span>
                            </Tip>
                          ) : (
                            (header.column.columnDef.header as string)
                          )}
                          {/* Sıralanabilir sütun bunu SÖYLER: ok her zaman
                              durur, etkin sıralamada koyulaşır. Yalnız etkin
                              sütunda ok göstermek "hangi sütun sıralanır"
                              sorusunu deneme yanılmaya bırakıyordu. */}
                          {header.column.getCanSort() && (
                            <span
                              aria-hidden
                              className="inline-flex flex-col leading-none"
                              style={{
                                fontSize: 7,
                                marginLeft: 1,
                                color: sorted ? "var(--sn-brand)" : "var(--sn-ink-4)",
                              }}
                            >
                              <span style={{ opacity: sorted === "desc" ? 0.25 : 1 }}>▲</span>
                              <span style={{ opacity: sorted === "asc" ? 0.25 : 1 }}>▼</span>
                            </span>
                          )}
                          {sorted && sorting.length > 1 && (
                            <span
                              className="sn-num"
                              style={{ fontSize: 9, color: "var(--sn-brand)" }}
                            >
                              {order + 1}
                            </span>
                          )}
                        </button>
                        {header.column.getCanResize() && (
                          <span
                            onMouseDown={header.getResizeHandler()}
                            onTouchStart={header.getResizeHandler()}
                            className="absolute top-0 right-0 h-full w-[5px] cursor-col-resize"
                            style={{
                              background: header.column.getIsResizing() ? "var(--sn-brand-solid)" : "transparent",
                            }}
                          />
                        )}
                      </th>
                    );
                  })}
                  <Filler as="th" />
                </tr>
              ))}
            </thead>

            <tbody>
              {padTop > 0 && <tr style={{ height: padTop }} />}
              {(virtualRows ? virtualRows.map((v) => modelRows[v.index]) : modelRows).map((row) => {
                const accent = rowAccent?.(row.original) ?? null;
                const flash = rowFlash?.(row.original) ?? false;
                return (
                  <tr
                    key={rowKey(row.original)}
                    onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                    /* Klavye eşleniği: tıklanabilir satır Tab ile bulunur,
                       Enter/Space ile açılır. Odak halkası .sn-root'tan gelir. */
                    tabIndex={onRowClick ? 0 : undefined}
                    onKeyDown={
                      onRowClick
                        ? (event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              onRowClick(row.original);
                            }
                          }
                        : undefined
                    }
                    className={cx("group", onRowClick && "cursor-pointer", flash && "sn-flash")}
                  >
                    {row.getVisibleCells().map((cell, index) => {
                      const column = byId.get(cell.column.id);
                      const pinned = pinnedOffsets.get(cell.column.id);
                      return (
                        <td
                          key={cell.id}
                          className={cx(
                            "px-3 whitespace-nowrap transition-colors duration-[var(--sn-dur-1)]",
                            "group-hover:bg-[var(--sn-brand-bg)]",
                            /* Bozulmaz kural 6 sözleşmenin kendisinde: `num`
                               işaretli sütun sağa yaslanır VE tabular-nums
                               alır. Sayfaların ayrıca NumText sarması gerekmez. */
                            column?.num && "text-right sn-num",
                          )}
                          style={{
                            height: rowHeight,
                            color: "var(--sn-ink)",
                            fontSize:
                              layout.density === "compact" ? "var(--sn-t-caption)" : "var(--sn-t-body)",
                            borderBottom: "1px solid var(--sn-hairline)",
                            background: "var(--sn-panel)",
                            ...(index === 0 && accent
                              ? { boxShadow: `inset 2px 0 0 0 ${accent}` }
                              : null),
                            ...(pinned !== undefined
                              ? {
                                  position: "sticky",
                                  left: pinned,
                                  zIndex: 10,
                                  boxShadow: sonSabit === cell.column.id
                                    ? "8px 0 8px -8px rgb(0 0 0 / 0.18)"
                                    : undefined,
                                }
                              : null),
                          }}
                        >
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      );
                    })}
                    <Filler as="td" />
                  </tr>
                );
              })}
              {padBottom > 0 && <tr style={{ height: padBottom }} />}
            </tbody>

            {hasFooter && (
              <tfoot className="sticky bottom-0 z-20">
                <tr>
                  {table.getVisibleFlatColumns().map((tableColumn) => {
                    const column = byId.get(tableColumn.id);
                    return (
                      <td
                        key={tableColumn.id}
                        className={cx("px-3 font-medium whitespace-nowrap", column?.num && "text-right")}
                        style={{
                          height: 32,
                          background: "var(--sn-raised)",
                          borderTop: "1px solid var(--sn-border)",
                          fontSize: "var(--sn-t-caption)",
                          color: "var(--sn-ink-2)",
                        }}
                      >
                        {column?.footer?.(filtered)}
                      </td>
                    );
                  })}
                  <Filler as="td" variant="footer" />
                </tr>
              </tfoot>
            )}
            </table>
          </div>
        </div>
      )}

      {footNote && (
        <div
          className="px-3 py-2"
          style={{
            borderTop: "1px solid var(--sn-hairline)",
            fontSize: "var(--sn-t-caption)",
            color: "var(--sn-ink-3)",
          }}
        >
          {footNote}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Sütun seçici                                                       */
/* ------------------------------------------------------------------ */

function ColumnPicker<T>({
  columns,
  table,
  onClose,
  onReset,
}: {
  columns: GridColumn<T>[];
  table: ReturnType<typeof useReactTable<T>>;
  onClose: () => void;
  onReset: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDown = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) onClose();
    };
    /* Bir kare gecikme: seçiciyi AÇAN tıklama aynı anda kapatmasın. */
    const timer = window.setTimeout(() => document.addEventListener("mousedown", onDown), 0);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("mousedown", onDown);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="sn-fade-up absolute right-0 z-50 mt-1 w-[220px] rounded-[var(--sn-r-md)] p-1.5"
      style={{ background: "var(--sn-overlay)", boxShadow: "var(--sn-shadow-pop)" }}
    >
      <div className="sn-scroll max-h-[320px] overflow-y-auto">
        {columns.map((column) => {
          const tableColumn = table.getColumn(column.id);
          if (!tableColumn) return null;
          const visible = tableColumn.getIsVisible();
          return (
            <label
              key={column.id}
              className="flex cursor-pointer items-center gap-2 rounded-[var(--sn-r-xs)] px-2 py-1.5 hover:bg-[var(--sn-sunken)]"
              style={{ fontSize: "var(--sn-t-caption)", color: "var(--sn-ink-2)" }}
            >
              <input
                type="checkbox"
                checked={visible}
                onChange={tableColumn.getToggleVisibilityHandler()}
                className="accent-[var(--sn-brand-solid)]"
              />
              {column.header}
            </label>
          );
        })}
      </div>
      <div className="mt-1 pt-1" style={{ borderTop: "1px solid var(--sn-hairline)" }}>
        <Button size="sm" variant="quiet" className="w-full" onClick={onReset}>
          Düzeni sıfırla
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

/**
 * Sondaki dolgu hücresi.
 *
 * Sütunlar toplamı konteynerden darsa artan yeri bu soğurur. Zemini ve
 * çizgisi komşusuyla aynıdır; yoksa ızgara son sütunda bitiyormuş gibi
 * görünür ve sağda kesilmiş bir blok kalır.
 */
function Filler({
  as,
  variant = "body",
}: {
  as: "th" | "td";
  variant?: "body" | "footer";
}) {
  const Tag = as;
  return (
    <Tag
      aria-hidden
      style={{
        width: "auto",
        background:
          as === "th"
            ? "var(--sn-sunken)"
            : variant === "footer"
              ? "var(--sn-raised)"
              : "var(--sn-panel)",
        borderBottom: as === "td" && variant === "body" ? "1px solid var(--sn-hairline)" : undefined,
        borderTop: variant === "footer" ? "1px solid var(--sn-border)" : undefined,
        ...(as === "th" ? { borderBottom: "1px solid var(--sn-border)" } : null),
      }}
    />
  );
}

function SearchIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" strokeLinecap="round" />
    </svg>
  );
}

