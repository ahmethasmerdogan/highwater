"use client";

/**
 * Günlük › Veri kalitesi (DESIGN-V3 §4.7) — defter tablosu.
 * Eksik mumlar ve aykırı değerler; boşluklar otomatik yeniden çekilir.
 */

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { StatusPill, Toggle as PressToggle } from "uicean";
import { api, type DataQualityEntry } from "@/lib/api";
import { payloadFields, payloadSummary, readableCode } from "@/lib/humanize";
import { dateTime, num } from "@/lib/format";
import { GuideSection } from "@/shell/page";
import { Async, Drawer, DrawerSection, Field, InfoDot, NumText, Panel, RichText, Term } from "@/design";
import { DataGrid } from "@/grid/data-grid";
import type { GridColumn } from "@/grid/types";

export const KALITE_SUMMARY = "Piyasa verisindeki eksik mumlar ve alışılmadık hareketler; boşluklar otomatik yeniden çekilir.";

export function KaliteGuide() {
  return (
    <GuideSection title="Nasıl okunur">
      <p>
        Veri denetimi olması gereken mumları sayar; eksikleri <strong>boşluk</strong>, alışılmadık hareketleri{" "}
        <strong>aykırı değer</strong> olarak kaydeder. Boşluklar yeniden çekilince kapanır; aykırı değerler kapanmaz —
        çoğu zaman küçük hacimli bir coinin gerçek hareketidir.
      </p>
    </GuideSection>
  );
}

const kindLabel = (kind: string) => (kind === "gap" ? "Veri boşluğu" : kind === "outlier" ? "Aykırı değer" : readableCode(kind));

const KALITE_COLUMNS: GridColumn<DataQualityEntry>[] = [
  { id: "created_at", header: "Bulunma", width: 150, pin: true, value: (r) => new Date(r.created_at).getTime(), cell: (r) => <NumText text={dateTime(r.created_at)} size="sm" /> },
  { id: "kind", header: "Tür", width: 140, value: (r) => kindLabel(r.kind), search: (r) => `${kindLabel(r.kind)} ${r.kind}`, cell: (r) => <span className="text-ink"><QualityKind kind={r.kind} /></span> },
  { id: "symbol", header: "Sembol", width: 120, value: (r) => r.symbol, cell: (r) => <NumText text={r.symbol || "—"} size="sm" /> },
  { id: "timeframe", header: "Bar", width: 70, hint: "Bulgunun tespit edildiği mum çözünürlüğü.", value: (r) => r.timeframe, cell: (r) => <NumText text={r.timeframe} size="sm" /> },
  {
    id: "severity",
    header: "Önem",
    width: 90,
    value: (r) => (r.severity === "ERROR" ? "Hata" : "Uyarı"),
    cell: (r) => <StatusPill tone={r.severity === "ERROR" ? "red" : "amber"} size="sm">{r.severity === "ERROR" ? "Hata" : "Uyarı"}</StatusPill>,
  },
  {
    id: "resolved",
    header: "Durum",
    width: 90,
    value: (r) => (r.resolved ? "Kapandı" : "Açık"),
    cell: (r) => <StatusPill tone={r.resolved ? "green" : "gray"} size="sm">{r.resolved ? "Kapandı" : "Açık"}</StatusPill>,
  },
  { id: "detail", header: "Ayrıntı", width: 360, value: (r) => payloadSummary(r.detail, 3), cell: (r) => <span className="block max-w-[360px] truncate text-[12px]">{payloadSummary(r.detail, 3)}</span> },
];

export default function KaliteTab() {
  const [onlyOpen, setOnlyOpen] = useState(true);
  const [selected, setSelected] = useState<DataQualityEntry | null>(null);

  const query = useQuery({
    queryKey: ["data-quality"],
    queryFn: () => api.get<DataQualityEntry[]>("/data-quality", { limit: 500 }),
    refetchInterval: 60_000,
  });

  const rows = useMemo(() => (query.data ?? []).filter((row) => (onlyOpen ? !row.resolved : true)), [query.data, onlyOpen]);

  const openCount = (query.data ?? []).filter((row) => !row.resolved).length;

  return (
    <>
      <Panel
        padded={false}
        title={<span className="inline-flex items-center gap-1.5">Veri kalitesi <InfoDot id="veri_tazeligi" /></span>}
        description={
          openCount === 0 ? (
            "Açık bulgu yok — izlenen tüm zaman dilimleri güncel görünüyor."
          ) : (
            <><NumText text={num(openCount, 0)} size="sm" /> açık bulgu. Çoğu <Term id="aykiri_deger" /> olabilir; kendiliğinden kapanmaz.</>
          )
        }
        actions={<PressToggle size="sm" pressed={onlyOpen} onChange={setOnlyOpen}>Yalnızca açık</PressToggle>}
      >
        <Async query={query} empty={{ title: "Kalite bulgusu yok", hint: "Veri akışında eksik mum ya da aykırı değer tespit edilmedi." }}>
          {() => (
            <DataGrid
              rows={rows}
              columns={KALITE_COLUMNS}
              rowKey={(r) => String(r.id)}
              storageKey="gunluk-kalite"
              searchPlaceholder="Sembol ya da tür…"
              density="compact"
              defaultSort={[{ id: "created_at", desc: true }]}
              onRowClick={setSelected}
              maxHeight={600}
              emptyTitle="Bulgu yok"
              emptyHint="Süzgece uyan kayıt yok. Kapananları görmek için süzgeci kaldırın."
            />
          )}
        </Async>
      </Panel>

      {selected && (
        <Drawer
          open
          onClose={() => setSelected(null)}
          title={`${selected.symbol || "Sistem"} · ${selected.timeframe}`}
          subtitle={dateTime(selected.created_at)}
          badge={<StatusPill tone={selected.resolved ? "green" : "gray"} size="sm">{selected.resolved ? "Kapandı" : "Açık"}</StatusPill>}
        >
          <DrawerSection title="Ne bulundu">
            <QualityExplanation entry={selected} />
          </DrawerSection>
          <DrawerSection title="Ayrıntılar">
            <div className="flex flex-col">
              {payloadFields(selected.detail).map((field) => (
                <Field key={field.key} label={field.label} term={field.term} value={<span className="sn-num">{field.value}</span>} />
              ))}
            </div>
          </DrawerSection>
        </Drawer>
      )}
    </>
  );
}

function QualityKind({ kind }: { kind: string }) {
  const label = kind === "gap" ? "Veri boşluğu" : kind === "outlier" ? "Aykırı değer" : readableCode(kind);
  const term = kind === "gap" ? "bosluk" : kind === "outlier" ? "aykiri_deger" : undefined;
  return (
    <span className="inline-flex items-center gap-1">
      {label}
      {term && <InfoDot id={term} />}
    </span>
  );
}

function QualityExplanation({ entry }: { entry: DataQualityEntry }) {
  const text =
    entry.kind === "gap"
      ? "Olması gereken bazı mumlar veri akışında yok. Sistem bunları borsadan yeniden çekmeyi dener; başarılı olursa kayıt kapanır.\n\nBoşluk sürekli tekrarlıyorsa o sembolün akışında gerçek bir sorun vardır."
      : entry.kind === "outlier"
        ? "Bu mumda alışılmadık büyüklükte bir fiyat hareketi var. **Çoğu zaman bu bir veri hatası değildir** — küçük hacimli coinlerde tek günde yüzde yüzü aşan hareketler gerçekten olur.\n\nBu tür kayıtlar kendiliğinden kapanmaz."
        : "Veri denetimi bu kaydı üretti.";
  return <RichText text={text} className="block text-[13px]" />;
}
