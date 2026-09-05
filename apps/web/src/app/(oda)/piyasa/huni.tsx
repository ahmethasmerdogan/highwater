"use client";

/**
 * Filtre hunisi, havuz devri ve kara liste — tablonun altında, kapalı
 * gelen bölüm. "Hangi semboller" sorusu tabloda, "neden bunlar" burada.
 */

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type SnapshotDetail, type SnapshotSummary } from "@/lib/api";
import { toast } from "@/lib/toast";
import { filterInfo } from "@/lib/universe-filters";
import { num, relative } from "@/lib/format";
import { Button, IClose, IconButton, InfoDot, NumText, TextInput } from "@/design";
import { CurveChart, type CurveSeries } from "@/design/chart";
import { DataGrid } from "@/grid/data-grid";
import type { GridColumn } from "@/grid/types";
import type { Market } from "./ortak";

export function Huni({ snap, market, canEdit }: { snap: SnapshotDetail; market: Market; canEdit: boolean }) {
  return (
    <div className="flex flex-col gap-6 pt-2">
      <Funnel snap={snap} />
      <Turnover market={market} />
      {canEdit && <Blacklist />}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Filtre hunisi                                                      */
/* ------------------------------------------------------------------ */

function Funnel({ snap }: { snap: SnapshotDetail }) {
  const steps = snap.funnel ?? [];
  if (steps.length === 0) return null;

  const start = (steps[0]?.kept ?? 0) + (steps[0]?.dropped ?? 0);
  /* En çok eleyen filtre işaretlenir: tasarlandığı işi mi yapıyor, eşiği mi kaçık? */
  const biggest = steps.reduce((best, step) => (step.dropped > (best?.dropped ?? -1) ? step : best), steps[0]);

  return (
    <section>
      <div className="sn-label mb-2 flex items-center gap-1.5">
        Filtre hunisi
        <InfoDot id="huni" />
      </div>
      <p className="mb-3" style={{ fontSize: "var(--sn-t-caption)", color: "var(--sn-ink-2)" }}>
        <NumText text={String(start)} size="sm" /> adayla başlandı, <NumText text={String(snap.size)} size="sm" />{" "}
        sembol havuza girdi. En çok eleyen adım{" "}
        <strong style={{ color: "var(--sn-ink)", fontWeight: 550 }}>{filterInfo(biggest.name).label}</strong> (
        <NumText text={String(biggest.dropped)} size="sm" /> aday).
      </p>

      <div className="flex flex-col gap-2">
        {steps.map((step) => {
          const info = filterInfo(step.name);
          const width = start > 0 ? (step.kept / start) * 100 : 0;
          const isBiggest = step.name === biggest.name && step.dropped > 0;
          return (
            <div key={`${step.index}-${step.name}`}>
              <div className="flex items-baseline gap-2" style={{ fontSize: "var(--sn-t-caption)" }}>
                <span className="sn-num w-6 shrink-0" style={{ color: "var(--sn-ink-3)" }}>
                  {step.index}.
                </span>
                <span className="flex min-w-0 items-center gap-1 truncate" style={{ color: "var(--sn-ink)" }}>
                  {info.label}
                  <InfoDot title={info.label} text={info.why ? `${info.what}\n\n${info.why}` : info.what} />
                </span>
                <span className="sn-num ml-auto shrink-0" style={{ color: "var(--sn-ink-2)" }}>
                  kaldı {step.kept}
                </span>
                <span
                  className="sn-num w-16 shrink-0 text-right"
                  style={{
                    color: step.dropped > 0 ? "var(--sn-down)" : step.dropped < 0 ? "var(--sn-up)" : "var(--sn-ink-3)",
                  }}
                >
                  {/* Negatif "elenen" = zincir dışından eklenen üyeler (histerezis + koruma). */}
                  {step.dropped > 0 ? `−${step.dropped}` : step.dropped < 0 ? `+${-step.dropped}` : "—"}
                </span>
              </div>
              <div className="mt-0.5 ml-8 h-1.5 overflow-hidden rounded-full" style={{ background: "var(--sn-sunken)" }}>
                <div
                  className="h-full rounded-full transition-[width] duration-[var(--sn-dur-3)] ease-[var(--sn-ease)]"
                  style={{
                    width: `${Math.max(0, Math.min(100, width))}%`,
                    background: isBiggest ? "var(--sn-warn)" : "var(--sn-brand-solid)",
                  }}
                />
              </div>
              {step.examples.length > 0 && (
                <p className="mt-0.5 ml-8" style={{ fontSize: "var(--sn-t-caption)", color: "var(--sn-ink-3)" }}>
                  Elenenlerden örnek: <span className="sn-num">{step.examples.slice(0, 5).join(", ")}</span>
                </p>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Havuz devri                                                        */
/* ------------------------------------------------------------------ */

/** Snapshot geçmişinden havuz boyutu ve giren/çıkan sayısı. Devir hızı bir
 *  sağlık ölçüsüdür: her turda onlarca sembol değişiyorsa filtreler
 *  gürültüyü ölçüyor demektir. */
function Turnover({ market }: { market: Market }) {
  const q = useQuery({
    queryKey: ["universe-snapshots", market],
    queryFn: () => api.get<SnapshotSummary[]>("/universe/snapshots", { limit: 100, market }),
    refetchInterval: 300_000,
  });
  const series = useMemo<CurveSeries[]>(() => {
    const rows = [...(q.data ?? [])].sort((a, b) => (a.taken_at < b.taken_at ? -1 : 1));
    if (rows.length < 2) return [];
    return [
      { label: "Havuz boyutu", color: "var(--sn-series-1)", points: rows.map((r) => ({ at: r.taken_at, value: r.size })) },
      {
        label: "Giren + çıkan",
        color: "var(--sn-series-2)",
        dashed: true,
        points: rows.map((r) => ({ at: r.taken_at, value: r.added.length + r.removed.length })),
      },
    ];
  }, [q.data]);

  if (q.isError || series.length === 0) return null;
  return (
    <section>
      <div className="sn-label mb-1">Havuz devri</div>
      <p className="mb-2" style={{ fontSize: "var(--sn-t-caption)", color: "var(--sn-ink-3)" }}>
        Her nokta bir snapshot. Kesikli çizgi sıfıra yakın seyrediyorsa havuz oturmuştur.
      </p>
      <CurveChart series={series} height={160} valueFormat={(v) => num(v, 0)} />
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Kara liste                                                         */
/* ------------------------------------------------------------------ */

interface BlacklistEntry {
  symbol: string;
  reason: string;
  created_at: string;
}

function Blacklist() {
  const qc = useQueryClient();
  const [symbol, setSymbol] = useState("");
  const [reason, setReason] = useState("");

  const list = useQuery({
    queryKey: ["blacklist"],
    queryFn: () => api.get<BlacklistEntry[]>("/universe/blacklist"),
  });

  const add = useMutation({
    mutationFn: () => api.post("/universe/blacklist", { symbol: symbol.toUpperCase(), reason }),
    onSuccess: () => {
      toast.success(`${symbol.toUpperCase()} kara listeye eklendi`);
      setSymbol("");
      setReason("");
      void qc.invalidateQueries({ queryKey: ["blacklist"] });
    },
    onError: (error: Error) => toast.error("Eklenemedi", error.message),
  });

  const remove = useMutation({
    mutationFn: (target: string) => api.delete(`/universe/blacklist/${target}`),
    onSuccess: () => {
      toast.success("Kara listeden çıkarıldı");
      void qc.invalidateQueries({ queryKey: ["blacklist"] });
    },
    onError: (error: Error) => toast.error("Çıkarılamadı", error.message),
  });

  const entries = list.data ?? [];

  /* Kaldır düğmesi satırın içinde: sütunlar mutasyona baktığı için bileşen ömründe kurulur. */
  const columns = useMemo<GridColumn<BlacklistEntry>[]>(
    () => [
      { id: "symbol", header: "Sembol", width: 130, pin: true, value: (row) => row.symbol, cell: (row) => <span className="sn-num text-ink">{row.symbol}</span> },
      { id: "reason", header: "Sebep", width: 320, value: (row) => row.reason, cell: (row) => <span className="text-ink-2">{row.reason || "sebep yazılmamış"}</span> },
      { id: "created_at", header: "Eklendi", width: 120, num: true, value: (row) => new Date(row.created_at).getTime(), cell: (row) => <span className="sn-num text-ink-3">{relative(row.created_at)}</span> },
      {
        id: "remove",
        header: "",
        width: 56,
        cell: (row) => (
          <IconButton size="sm" label={`${row.symbol} kara listeden çıkar`} onClick={() => remove.mutate(row.symbol)}>
            <IClose size={13} />
          </IconButton>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  return (
    <section>
      <div className="sn-label mb-1 flex items-center gap-1.5">
        Kara liste
        <InfoDot id="kara_liste" />
      </div>
      <p className="mb-3" style={{ fontSize: "var(--sn-t-caption)", color: "var(--sn-ink-3)" }}>
        Buradaki semboller filtrelerden geçse bile havuza alınmaz; değişiklik bir sonraki yenilemede geçerli olur.
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (symbol.trim()) add.mutate();
        }}
        className="mb-3 flex flex-wrap items-end gap-2"
      >
        <label className="flex flex-col gap-1">
          <span style={{ fontSize: "var(--sn-t-caption)", color: "var(--sn-ink-2)" }}>Sembol</span>
          <TextInput value={symbol} onChange={(e) => setSymbol(e.target.value)} placeholder="ÖRNUSDT" className="w-36 uppercase" />
        </label>
        <label className="flex min-w-48 flex-1 flex-col gap-1">
          <span style={{ fontSize: "var(--sn-t-caption)", color: "var(--sn-ink-2)" }}>Sebep</span>
          <TextInput value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Neden engellendiğini yazın." />
        </label>
        <Button type="submit" size="md" variant="neutral" disabled={!symbol.trim() || add.isPending}>
          Kara listeye ekle
        </Button>
      </form>

      <DataGrid
        rows={entries}
        columns={columns}
        rowKey={(row) => row.symbol}
        storageKey="piyasa-kara-liste"
        searchable={entries.length > 8}
        searchPlaceholder="Sembol ara…"
        density="compact"
        defaultSort={[{ id: "created_at", desc: true }]}
        maxHeight={320}
        emptyTitle="Kara liste boş"
      />
    </section>
  );
}
