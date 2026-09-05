"use client";

/**
 * Yönetim › Ayarlar (DESIGN-V3 §4.9) — motorun okuduğu parametreler.
 *
 * Motorun gerçekten okuduğu gruplar düzenlenebilir; diğerleri salt okunur.
 * Risk sınırları burada YOKTUR; onların yeri strateji tanımıdır.
 */

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Field as UiField, StatusPill } from "uicean";
import { api } from "@/lib/api";
import { toast } from "@/lib/toast";
import { SETTING_GROUPS, type SettingFieldSpec } from "@/lib/settings-fields";
import { num } from "@/lib/format";
import { GuideSection } from "@/shell/page";
import { Alert, Async, Button, NumText, Panel, Term, TextInput } from "@/design";
import { DataGrid } from "@/grid/data-grid";
import type { GridColumn } from "@/grid/types";

interface SettingGroup {
  key: string;
  editable: boolean;
  defaults: Record<string, unknown>;
  stored: Record<string, unknown>;
  effective: Record<string, unknown>;
}

interface AyarRow {
  key: string;
  value: unknown;
}

/* Salt okunur defter: alan + değer. */
const AYAR_COLUMNS: GridColumn<AyarRow>[] = [
  { id: "key", header: "Alan", width: 240, pin: true, value: (r) => r.key, cell: (r) => r.key },
  { id: "value", header: "Değer", width: 200, num: true, value: (r) => (typeof r.value === "number" ? r.value : String(r.value)), cell: (r) => <NumText text={String(r.value)} size="sm" /> },
];

export const AYARLAR = {
  summary: "Motorun okuduğu parametreler. Değişiklik bir sonraki döngüde geçerli olur.",
  guide: (
    <>
      <GuideSection title="Nasıl okunur">
        <p>
          Her alanda üç değer vardır: <strong>varsayılan</strong>, <strong>kayıtlı</strong> (sizin yazdığınız) ve{" "}
          <strong>yürürlükteki</strong>. Kayıtlı değer varsayılanı ezer. <strong>Salt okunur</strong> grup motorun
          okumadığı kayıttır.
        </p>
      </GuideSection>
      <GuideSection title="Ne yapabilirim">
        <p>Bir eşiği değiştirdikten sonra Piyasa sayfasındaki huniye bakın: kaç adayı etkilediği orada görünür. Risk sınırları strateji tanımındadır.</p>
      </GuideSection>
    </>
  ),
};

export function AyarlarTab() {
  const query = useQuery({
    queryKey: ["settings"],
    queryFn: () => api.get<{ groups: SettingGroup[] }>("/settings"),
  });

  return (
    <>
      <Alert tone="warn" title="Dikkat">
        Havuz filtreleri sistemin en sessiz ama en etkili düğmeleridir: bir eşiği yanlış kısmak havuzu küçültür ve{" "}
        <Term id="huni">huni raporuna</Term> bakılmadıkça kimse fark etmez. Değişiklik yeni bir <Term id="config_hash" /> üretir.
      </Alert>

      <Async query={query}>
        {(data) => (
          <>
            {data.groups.map((group) => (
              <SettingGroupCard key={group.key} group={group} />
            ))}
          </>
        )}
      </Async>
    </>
  );
}

/* ------------------------------------------------------------------ */

function SettingGroupCard({ group }: { group: SettingGroup }) {
  const qc = useQueryClient();
  const spec = SETTING_GROUPS.find((entry) => entry.key === group.key);
  const [draft, setDraft] = useState<Record<string, unknown>>(() => ({ ...group.effective }));
  const [dirty, setDirty] = useState(false);

  const save = useMutation({
    mutationFn: () => api.put(`/settings/${group.key}`, { value: draft }),
    onSuccess: () => {
      toast.success("Ayarlar kaydedildi", "Motor önbelleği düşürüldü; değişiklik bir sonraki döngüde geçerli.");
      setDirty(false);
      void qc.invalidateQueries({ queryKey: ["settings"] });
    },
    onError: (error: Error) => toast.error("Kaydedilemedi", error.message),
  });

  /* Motorun okumadığı gruplar salt okunur defter. */
  if (!group.editable) {
    return (
      <Panel
        title={spec?.title ?? group.key}
        description="Bu kayıt veritabanında duruyor ama motor onu okumuyor; değiştirmek davranışı değiştirmez."
        padded={false}
        actions={<StatusPill tone="gray" size="sm">motor okumuyor</StatusPill>}
      >
        <DataGrid
          rows={Object.entries(group.effective).map(([key, value]) => ({ key, value }))}
          columns={AYAR_COLUMNS}
          rowKey={(r) => r.key}
          storageKey="yonetim-ayarlar"
          searchable={false}
          density="compact"
          defaultSort={[{ id: "key", desc: false }]}
          emptyTitle="Alan yok"
        />
      </Panel>
    );
  }

  /* Sözlükte tanımlı alanlar önce, tanımsızlar sonra — sıra kararlı olsun. */
  const known = spec?.fields ?? [];
  const knownKeys = new Set(known.map((field) => field.key));
  const extra: SettingFieldSpec[] = Object.keys(group.effective)
    .filter((key) => !knownKeys.has(key))
    .map((key) => ({
      key,
      label: key.replace(/_/g, " "),
      kind: typeof group.effective[key] === "number" ? "number" : "text",
      description: "Bu alanın açıklaması henüz yazılmamış.",
    }));

  return (
    <Panel
      title={spec?.title ?? group.key}
      description={spec?.description}
      actions={
        <Button size="sm" variant="primary" disabled={!dirty || save.isPending} onClick={() => save.mutate()}>
          {save.isPending ? "Kaydediliyor…" : "Kaydet"}
        </Button>
      }
    >
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {[...known, ...extra].map((field) => (
          <SettingField
            key={field.key}
            field={field}
            value={draft[field.key]}
            defaultValue={group.defaults[field.key]}
            stored={field.key in group.stored}
            onChange={(next) => {
              setDraft((current) => ({ ...current, [field.key]: next }));
              setDirty(true);
            }}
          />
        ))}
      </div>
    </Panel>
  );
}

/* ------------------------------------------------------------------ */

function SettingField({
  field,
  value,
  defaultValue,
  stored,
  onChange,
}: {
  field: SettingFieldSpec;
  value: unknown;
  defaultValue: unknown;
  /** Bu alan için kayıtlı bir değer var mı — yoksa varsayılan geçerli. */
  stored: boolean;
  onChange: (value: unknown) => void;
}) {
  const changed = stored && String(value) !== String(defaultValue);
  const varsayilan =
    typeof defaultValue === "number" ? num(defaultValue, Number.isInteger(defaultValue) ? 0 : 4) : String(defaultValue ?? "—");

  return (
    <UiField
      label={
        <span className="inline-flex items-center gap-2">
          {field.label}
          {changed && <StatusPill tone="blue" size="sm">değiştirildi</StatusPill>}
        </span>
      }
      hint={
        <>
          {field.description}
          {field.warning && <span className="mt-1 block border-l-2 pl-2 text-ink-3" style={{ borderColor: "var(--sn-warn)" }}>{field.warning}</span>}
          <span className="mt-1 block">Varsayılan <NumText text={varsayilan} size="xs" /></span>
        </>
      }
    >
      {(p) =>
        field.kind === "text" ? (
          <TextInput {...p} value={String(value ?? "")} onChange={(event) => onChange(event.target.value)} />
        ) : (
          <span className="flex items-center gap-1.5">
            <TextInput
              {...p}
              type="number"
              numeric
              value={typeof value === "number" ? value : ""}
              step={field.step ?? (field.kind === "integer" ? 1 : 0.01)}
              onChange={(event) => onChange(event.target.value === "" ? null : Number(event.target.value))}
            />
            {field.unit && <span className="shrink-0 text-[10.5px] text-ink-3">{field.unit}</span>}
          </span>
        )
      }
    </UiField>
  );
}
