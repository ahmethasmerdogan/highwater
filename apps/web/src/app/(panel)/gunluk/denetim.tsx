"use client";

/**
 * Günlük › Denetim kaydı — kim, ne zaman, neyi değiştirdi, hangi IP'den.
 * Yalnızca yöneticiye açıktır; kapı `page.tsx`'te.
 */

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, type AuditEntry } from "@/lib/api";
import { payloadSummary, readableCode } from "@/lib/humanize";
import { dateTime } from "@/lib/format";
import { GuideSection } from "@/shell/page";
import { Async, InfoDot, NumText, Panel } from "@/design";
import { DataGrid } from "@/grid/data-grid";
import type { GridColumn } from "@/grid/types";

export const DENETIM_SUMMARY =
  "Her yönetimsel işlemin kaydı: kim, ne zaman, neyi değiştirdi ve hangi IP'den.";

export function DenetimGuide() {
  return (
    <GuideSection title="Ne gösteriyor">
      <p>
        Bot başlatma, ayar değişikliği, kullanıcı yönetimi gibi her yönetimsel eylem buraya düşer.
        Kayıt silinmez; bir değişikliğin kim tarafından yapıldığı sonradan hep bulunabilir.
      </p>
    </GuideSection>
  );
}

export default function DenetimTab() {
  const query = useQuery({
    queryKey: ["audit"],
    queryFn: () => api.get<AuditEntry[]>("/audit", { limit: 500 }),
    refetchInterval: 60_000,
  });

  const columns = useMemo<GridColumn<AuditEntry>[]>(
    () => [
      {
        id: "created_at",
        header: "Zaman",
        width: 162,
        pin: true,
        value: (row) => new Date(row.created_at).getTime(),
        cell: (row) => <NumText text={dateTime(row.created_at)} size="sm" />,
      },
      {
        id: "user_id",
        header: "Kullanıcı",
        width: 104,
        num: true,
        value: (row) => row.user_id,
        cell: (row) => <NumText text={row.user_id === null ? "sistem" : `#${row.user_id}`} size="sm" />,
      },
      {
        id: "action",
        header: "Eylem",
        width: 200,
        value: (row) => row.action,
        search: (row) => `${row.action} ${row.target} ${row.ip}`,
        cell: (row) => (
          <span style={{ fontSize: "var(--sn-t-caption)", color: "var(--sn-ink)" }}>
            {readableCode(row.action)}
          </span>
        ),
      },
      {
        id: "target",
        header: "Hedef",
        width: 158,
        value: (row) => row.target,
        cell: (row) => (
          <span className="sn-num" style={{ fontSize: "var(--sn-t-caption)", color: "var(--sn-ink-2)" }}>
            {row.target || "—"}
          </span>
        ),
      },
      {
        id: "payload",
        header: "Ayrıntı",
        width: 360,
        cell: (row) => (
          <span className="truncate" style={{ fontSize: "var(--sn-t-caption)", color: "var(--sn-ink-2)" }}>
            {payloadSummary(row.payload, 4)}
          </span>
        ),
      },
      {
        id: "ip",
        header: "IP",
        width: 136,
        hidden: true,
        value: (row) => row.ip,
        cell: (row) => (
          <span className="sn-num" style={{ fontSize: "var(--sn-t-micro)", color: "var(--sn-ink-3)" }}>
            {row.ip || "—"}
          </span>
        ),
      },
    ],
    [],
  );

  return (
    <Panel
      padded={false}
      title={
        <span className="flex items-center gap-1.5">
          Denetim kaydı
          <InfoDot id="denetim_kaydi" />
        </span>
      }
      description="Her yönetimsel işlem burada tutulur: kim, ne zaman, neyi değiştirdi ve hangi IP'den."
    >
      <Async
        query={query}
        empty={{ title: "Denetim kaydı boş", hint: "Henüz kaydedilmiş bir yönetimsel işlem yok." }}
      >
        {(rows) => (
          <DataGrid
            rows={rows}
            columns={columns}
            rowKey={(row) => String(row.id)}
            storageKey="loglar-denetim"
            searchPlaceholder="Eylem, hedef ya da IP ara…"
            defaultSort={[{ id: "created_at", desc: true }]}
            density="compact"
            maxHeight={600}
          />
        )}
      </Async>
    </Panel>
  );
}
