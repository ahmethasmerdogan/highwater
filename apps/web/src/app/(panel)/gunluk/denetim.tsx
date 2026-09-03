"use client";

/**
 * Günlük › Denetim kaydı (DESIGN-V3 §4.7) — defter tablosu.
 * Kim, ne zaman, neyi değiştirdi, hangi IP'den. Yalnızca yöneticiye; kapı `page.tsx`'te.
 */

import { useQuery } from "@tanstack/react-query";
import { api, type AuditEntry } from "@/lib/api";
import { payloadSummary, readableCode } from "@/lib/humanize";
import { dateTime } from "@/lib/format";
import { GuideSection } from "@/shell/page";
import { Async, InfoDot, NumText, Panel } from "@/design";
import { DataGrid } from "@/grid/data-grid";
import type { GridColumn } from "@/grid/types";

export const DENETIM_SUMMARY = "Her yönetimsel işlemin kaydı: kim, ne zaman, neyi değiştirdi ve hangi IP'den.";

export function DenetimGuide() {
  return (
    <GuideSection title="Ne gösteriyor">
      <p>Bot başlatma, ayar değişikliği, kullanıcı yönetimi gibi her yönetimsel eylem buraya düşer. Kayıt silinmez.</p>
    </GuideSection>
  );
}

const DENETIM_COLUMNS: GridColumn<AuditEntry>[] = [
  { id: "created_at", header: "Zaman", width: 150, pin: true, value: (r) => new Date(r.created_at).getTime(), cell: (r) => <NumText text={dateTime(r.created_at)} size="sm" /> },
  { id: "user_id", header: "Kullanıcı", width: 90, num: true, value: (r) => r.user_id, search: (r) => (r.user_id === null ? "sistem" : `#${r.user_id}`), cell: (r) => <NumText text={r.user_id === null ? "sistem" : `#${r.user_id}`} size="sm" /> },
  { id: "action", header: "Eylem", width: 180, value: (r) => readableCode(r.action), search: (r) => `${readableCode(r.action)} ${r.action}`, cell: (r) => <span className="text-ink">{readableCode(r.action)}</span> },
  { id: "target", header: "Hedef", width: 140, value: (r) => r.target, cell: (r) => <NumText text={r.target || "—"} size="sm" /> },
  { id: "payload", header: "Ayrıntı", width: 360, value: (r) => payloadSummary(r.payload, 4), cell: (r) => <span className="block max-w-[360px] truncate text-[12px]">{payloadSummary(r.payload, 4)}</span> },
  { id: "ip", header: "IP", width: 130, value: (r) => r.ip, cell: (r) => <NumText text={r.ip || "—"} size="xs" /> },
];

export default function DenetimTab() {
  const query = useQuery({
    queryKey: ["audit"],
    queryFn: () => api.get<AuditEntry[]>("/audit", { limit: 500 }),
    refetchInterval: 60_000,
  });

  return (
    <Panel
      padded={false}
      title={<span className="inline-flex items-center gap-1.5">Denetim kaydı <InfoDot id="denetim_kaydi" /></span>}
      description="En yeni işlem üstte."
    >
      <Async query={query} empty={{ title: "Denetim kaydı boş", hint: "Henüz kaydedilmiş bir yönetimsel işlem yok." }}>
        {(rows) => (
          <DataGrid
            rows={rows}
            columns={DENETIM_COLUMNS}
            rowKey={(r) => String(r.id)}
            storageKey="gunluk-denetim"
            searchPlaceholder="Eylem, hedef ya da IP…"
            density="compact"
            defaultSort={[{ id: "created_at", desc: true }]}
            maxHeight={600}
            emptyTitle="Aramaya uyan kayıt yok"
          />
        )}
      </Async>
    </Panel>
  );
}
