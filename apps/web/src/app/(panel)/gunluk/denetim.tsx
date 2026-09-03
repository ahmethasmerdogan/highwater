"use client";

/**
 * Günlük › Denetim kaydı (DESIGN-V3 §4.7) — defter tablosu.
 * Kim, ne zaman, neyi değiştirdi, hangi IP'den. Yalnızca yöneticiye; kapı `page.tsx`'te.
 */

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { SearchField, Table, TBody, Td, Th, THead, Tr } from "uicean";
import { api, type AuditEntry } from "@/lib/api";
import { payloadSummary, readableCode } from "@/lib/humanize";
import { dateTime } from "@/lib/format";
import { GuideSection } from "@/shell/page";
import { Async, InfoDot, NumText, Panel } from "@/design";

export const DENETIM_SUMMARY = "Her yönetimsel işlemin kaydı: kim, ne zaman, neyi değiştirdi ve hangi IP'den.";

export function DenetimGuide() {
  return (
    <GuideSection title="Ne gösteriyor">
      <p>Bot başlatma, ayar değişikliği, kullanıcı yönetimi gibi her yönetimsel eylem buraya düşer. Kayıt silinmez.</p>
    </GuideSection>
  );
}

export default function DenetimTab() {
  const [search, setSearch] = useState("");

  const query = useQuery({
    queryKey: ["audit"],
    queryFn: () => api.get<AuditEntry[]>("/audit", { limit: 500 }),
    refetchInterval: 60_000,
  });

  const rows = useMemo(() => {
    const q = search.trim().toLocaleLowerCase("tr");
    return (query.data ?? [])
      .filter((row) => !q || `${row.action} ${row.target} ${row.ip}`.toLocaleLowerCase("tr").includes(q))
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [query.data, search]);

  return (
    <Panel
      padded={false}
      title={<span className="inline-flex items-center gap-1.5">Denetim kaydı <InfoDot id="denetim_kaydi" /></span>}
      description="En yeni işlem üstte."
      actions={<SearchField className="h-8 w-56" placeholder="Eylem, hedef ya da IP…" kbd={false} value={search} onChange={setSearch} />}
    >
      <Async query={query} empty={{ title: "Denetim kaydı boş", hint: "Henüz kaydedilmiş bir yönetimsel işlem yok." }}>
        {() => (
          <div className="max-h-[600px] overflow-y-auto">
            <Table minWidth={900}>
              <THead>
                <tr>
                  <Th>Zaman</Th>
                  <Th align="right">Kullanıcı</Th>
                  <Th>Eylem</Th>
                  <Th>Hedef</Th>
                  <Th>Ayrıntı</Th>
                  <Th>IP</Th>
                </tr>
              </THead>
              <TBody>
                {rows.map((row) => (
                  <Tr key={row.id}>
                    <Td><NumText text={dateTime(row.created_at)} size="sm" /></Td>
                    <Td align="right"><NumText text={row.user_id === null ? "sistem" : `#${row.user_id}`} size="sm" /></Td>
                    <Td className="text-ink">{readableCode(row.action)}</Td>
                    <Td><NumText text={row.target || "—"} size="sm" /></Td>
                    <Td className="max-w-[360px] truncate text-[12px]">{payloadSummary(row.payload, 4)}</Td>
                    <Td><NumText text={row.ip || "—"} size="xs" /></Td>
                  </Tr>
                ))}
                {rows.length === 0 && <Tr><Td colSpan={6} className="py-8 text-center text-ink-3">Aramaya uyan kayıt yok.</Td></Tr>}
              </TBody>
            </Table>
          </div>
        )}
      </Async>
    </Panel>
  );
}
