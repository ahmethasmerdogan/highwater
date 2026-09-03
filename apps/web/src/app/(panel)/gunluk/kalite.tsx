"use client";

/**
 * Günlük › Veri kalitesi (DESIGN-V3 §4.7) — defter tablosu.
 * Eksik mumlar ve aykırı değerler; boşluklar otomatik yeniden çekilir.
 */

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { SearchField, StatusPill, Table, TBody, Td, Th, THead, Toggle as PressToggle, Tr } from "uicean";
import { api, type DataQualityEntry } from "@/lib/api";
import { payloadFields, payloadSummary, readableCode } from "@/lib/humanize";
import { dateTime, num } from "@/lib/format";
import { GuideSection } from "@/shell/page";
import { Async, Drawer, DrawerSection, Empty, Field, InfoDot, NumText, Panel, RichText, Term } from "@/design";

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

export default function KaliteTab() {
  const [onlyOpen, setOnlyOpen] = useState(true);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<DataQualityEntry | null>(null);

  const query = useQuery({
    queryKey: ["data-quality"],
    queryFn: () => api.get<DataQualityEntry[]>("/data-quality", { limit: 500 }),
    refetchInterval: 60_000,
  });

  const rows = useMemo(() => {
    const q = search.trim().toLocaleLowerCase("tr");
    return (query.data ?? [])
      .filter((row) => (onlyOpen ? !row.resolved : true))
      .filter((row) => !q || `${row.symbol} ${row.kind} ${row.timeframe}`.toLocaleLowerCase("tr").includes(q))
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [query.data, onlyOpen, search]);

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
        actions={
          <>
            <SearchField className="h-8 w-48" placeholder="Sembol ya da tür…" kbd={false} value={search} onChange={setSearch} />
            <PressToggle size="sm" pressed={onlyOpen} onChange={setOnlyOpen}>Yalnızca açık</PressToggle>
          </>
        }
      >
        <Async query={query} empty={{ title: "Kalite bulgusu yok", hint: "Veri akışında eksik mum ya da aykırı değer tespit edilmedi." }}>
          {() =>
            rows.length === 0 ? (
              <Empty title="Bulgu yok" hint="Süzgece uyan kayıt yok. Kapananları görmek için süzgeci kaldırın." />
            ) : (
              <div className="max-h-[600px] overflow-y-auto">
                <Table minWidth={820}>
                  <THead>
                    <tr>
                      <Th>Bulunma</Th>
                      <Th>Tür</Th>
                      <Th>Sembol</Th>
                      <Th><span className="inline-flex items-center gap-1">Bar <InfoDot text="Bulgunun tespit edildiği mum çözünürlüğü." /></span></Th>
                      <Th>Önem</Th>
                      <Th>Durum</Th>
                      <Th>Ayrıntı</Th>
                    </tr>
                  </THead>
                  <TBody>
                    {rows.map((row) => (
                      <Tr key={row.id} onClick={() => setSelected(row)}>
                        <Td><NumText text={dateTime(row.created_at)} size="sm" /></Td>
                        <Td className="text-ink"><QualityKind kind={row.kind} /></Td>
                        <Td><NumText text={row.symbol || "—"} size="sm" /></Td>
                        <Td><NumText text={row.timeframe} size="sm" /></Td>
                        <Td><StatusPill tone={row.severity === "ERROR" ? "red" : "amber"} size="sm">{row.severity === "ERROR" ? "Hata" : "Uyarı"}</StatusPill></Td>
                        <Td><StatusPill tone={row.resolved ? "green" : "gray"} size="sm">{row.resolved ? "Kapandı" : "Açık"}</StatusPill></Td>
                        <Td className="max-w-[360px] truncate text-[12px]">{payloadSummary(row.detail, 3)}</Td>
                      </Tr>
                    ))}
                  </TBody>
                </Table>
              </div>
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
