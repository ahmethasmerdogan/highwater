"use client";

/**
 * Günlük › Veri kalitesi — eksik mumlar ve aykırı değerler.
 */

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, type DataQualityEntry } from "@/lib/api";
import { payloadFields, payloadSummary, readableCode } from "@/lib/humanize";
import { dateTime } from "@/lib/format";
import { GuideSection } from "@/shell/page";
import {
  Async,
  Button,
  Drawer,
  DrawerSection,
  Empty,
  Field,
  InfoDot,
  NumText,
  Panel,
  RichText,
  Tag,
  Term,
} from "@/design";
import { DataGrid } from "@/grid/data-grid";
import type { GridColumn } from "@/grid/types";

export const KALITE_SUMMARY =
  "Piyasa verisindeki eksik mumlar ve alışılmadık hareketler; boşluklar otomatik yeniden çekilir.";

export function KaliteGuide() {
  return (
    <>
      <GuideSection title="Ne gösteriyor">
        <p>
          Veri denetimi her zaman diliminde olması gereken mumları sayar; eksik olanları{" "}
          <strong>boşluk</strong>, alışılmadık büyüklükteki hareketleri <strong>aykırı değer</strong>{" "}
          olarak kaydeder.
        </p>
      </GuideSection>
      <GuideSection title="Nasıl okunur">
        <p>
          Boşluklar yeniden çekilince kendiliğinden kapanır. Aykırı değerler kapanmaz: geçmişteki
          bir mumun özelliği sonradan düzelmez ve çoğu zaman bir veri hatası değil, küçük hacimli
          bir coinin gerçek hareketidir.
        </p>
      </GuideSection>
    </>
  );
}

export default function KaliteTab() {
  const [onlyOpen, setOnlyOpen] = useState(true);
  const [selected, setSelected] = useState<DataQualityEntry | null>(null);

  const query = useQuery({
    queryKey: ["data-quality"],
    queryFn: () => api.get<DataQualityEntry[]>("/data-quality", { limit: 500 }),
    refetchInterval: 60_000,
  });

  const rows = useMemo(
    () => (query.data ?? []).filter((row) => (onlyOpen ? !row.resolved : true)),
    [query.data, onlyOpen],
  );

  const columns = useMemo<GridColumn<DataQualityEntry>[]>(
    () => [
      {
        id: "created_at",
        header: "Bulunma zamanı",
        width: 162,
        pin: true,
        value: (row) => new Date(row.created_at).getTime(),
        cell: (row) => <NumText text={dateTime(row.created_at)} size="sm" />,
      },
      {
        id: "kind",
        header: "Tür",
        width: 140,
        value: (row) => row.kind,
        cell: (row) => <QualityKind kind={row.kind} />,
      },
      {
        id: "symbol",
        header: "Sembol",
        width: 122,
        value: (row) => row.symbol,
        search: (row) => `${row.symbol} ${row.kind} ${row.timeframe}`,
        cell: (row) => (
          <span className="sn-num" style={{ fontSize: "var(--sn-t-caption)" }}>
            {row.symbol || "—"}
          </span>
        ),
      },
      {
        id: "timeframe",
        header: "Zaman dilimi",
        width: 116,
        hint: "Bu bulgunun hangi mum çözünürlüğünde tespit edildiği.",
        value: (row) => row.timeframe,
        cell: (row) => (
          <span className="sn-num" style={{ fontSize: "var(--sn-t-caption)", color: "var(--sn-ink-2)" }}>
            {row.timeframe}
          </span>
        ),
      },
      {
        id: "severity",
        header: "Önem",
        width: 94,
        value: (row) => row.severity,
        cell: (row) => (
          <Tag tone={row.severity === "ERROR" ? "down" : "warn"}>
            {row.severity === "ERROR" ? "Hata" : "Uyarı"}
          </Tag>
        ),
      },
      {
        id: "resolved",
        header: "Durum",
        width: 104,
        value: (row) => (row.resolved ? 1 : 0),
        cell: (row) => (
          <Tag tone={row.resolved ? "up" : "neutral"}>{row.resolved ? "Kapandı" : "Açık"}</Tag>
        ),
      },
      {
        id: "detail",
        header: "Ayrıntı",
        width: 380,
        cell: (row) => (
          <span className="truncate" style={{ fontSize: "var(--sn-t-caption)", color: "var(--sn-ink-2)" }}>
            {payloadSummary(row.detail, 3)}
          </span>
        ),
      },
    ],
    [],
  );

  const openCount = (query.data ?? []).filter((row) => !row.resolved).length;

  return (
    <>
      <Panel
        padded={false}
        title={
          <span className="flex items-center gap-1.5">
            Veri kalitesi
            <InfoDot id="veri_tazeligi" />
          </span>
        }
        description="Piyasa verisindeki eksik mumlar ve alışılmadık hareketler. Boşluklar otomatik olarak yeniden çekilir."
        actions={
          <Button size="sm" variant={onlyOpen ? "neutral" : "quiet"} onClick={() => setOnlyOpen((value) => !value)}>
            {onlyOpen ? "Yalnızca açık" : "Hepsi"}
          </Button>
        }
      >
        <div
          className="px-4 py-2.5"
          style={{
            borderBottom: "1px solid var(--sn-hairline)",
            fontSize: "var(--sn-t-caption)",
            color: "var(--sn-ink-2)",
          }}
        >
          {openCount === 0 ? (
            "Açık bulgu yok — izlenen tüm zaman dilimleri güncel görünüyor."
          ) : (
            <>
              <strong style={{ color: "var(--sn-ink)", fontWeight: 550 }}>
                <NumText text={String(openCount)} size="sm" /> açık bulgu
              </strong>{" "}
              var. Bunların çoğu <Term id="aykiri_deger" /> olabilir: küçük hacimli coinlerde
              görülen büyük günlük hareketler veri hatası değil, gerçek piyasa hareketidir ve
              kendiliğinden kapanmaz.
            </>
          )}
        </div>

        <Async
          query={query}
          empty={{
            title: "Kalite bulgusu yok",
            hint: "Veri akışında eksik mum ya da aykırı değer tespit edilmedi.",
          }}
        >
          {() =>
            rows.length === 0 ? (
              <Empty
                title="Açık bulgu yok"
                hint="Tüm veri kalitesi bulguları kapanmış durumda. Kapananları görmek için süzgeci kaldırın."
              />
            ) : (
              <DataGrid
                rows={rows}
                columns={columns}
                rowKey={(row) => String(row.id)}
                onRowClick={setSelected}
                storageKey="loglar-kalite"
                searchPlaceholder="Sembol ya da tür ara…"
                defaultSort={[{ id: "created_at", desc: true }]}
                density="compact"
                maxHeight={600}
              />
            )
          }
        </Async>
      </Panel>

      {selected && (
        <Drawer
          open
          onClose={() => setSelected(null)}
          title={`${selected.symbol || "Sistem"} · ${selected.timeframe}`}
          subtitle={dateTime(selected.created_at)}
          badge={<Tag tone={selected.resolved ? "up" : "neutral"}>{selected.resolved ? "Kapandı" : "Açık"}</Tag>}
        >
          <DrawerSection title="Ne bulundu">
            <QualityExplanation entry={selected} />
          </DrawerSection>

          <DrawerSection title="Ayrıntılar">
            <div className="flex flex-col">
              {payloadFields(selected.detail).map((field) => (
                <Field
                  key={field.key}
                  label={field.label}
                  term={field.term}
                  value={<span className="sn-num">{field.value}</span>}
                />
              ))}
            </div>
          </DrawerSection>
        </Drawer>
      )}
    </>
  );
}

function QualityKind({ kind }: { kind: string }) {
  const label =
    kind === "gap" ? "Veri boşluğu" : kind === "outlier" ? "Aykırı değer" : readableCode(kind);
  const term = kind === "gap" ? "bosluk" : kind === "outlier" ? "aykiri_deger" : undefined;
  return (
    <span
      className="inline-flex items-center gap-1"
      style={{ fontSize: "var(--sn-t-caption)", color: "var(--sn-ink)" }}
    >
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
        ? "Bu mumda alışılmadık büyüklükte bir fiyat hareketi var. **Çoğu zaman bu bir veri hatası değildir** — küçük hacimli coinlerde tek günde yüzde yüzü aşan hareketler gerçekten olur.\n\nBu tür kayıtlar kendiliğinden kapanmaz: geçmişteki bir mumun özelliği sonradan düzelmez."
        : "Veri denetimi bu kaydı üretti.";

  return <RichText text={text} className="block text-[length:var(--sn-t-body)]" />;
}
