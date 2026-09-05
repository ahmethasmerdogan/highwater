"use client";

/**
 * Strateji kurgu atölyesi — sembol sayfasının içinde, kapalı gelir.
 *
 * Kaydetmek mevcut sürümü değiştirmez, **yeni bir sürüm doğurur.** Çalışan
 * botlar etkilenmez; yeni sürümü kullanmaları için bota geçirilmesi gerekir.
 */

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type Strategy } from "@/lib/api";
import { toast } from "@/lib/toast";
import { STRATEGY_GROUPS, readPath, writePath, type FieldSpec } from "@/lib/strategy-fields";
import { Button, Empty, FormField, NumText, Select, TextInput, Toggle } from "@/design";

export function Atolye() {
  const qc = useQueryClient();
  const [strategyId, setStrategyId] = useState<number | null>(null);
  const [draft, setDraft] = useState<Record<string, unknown> | null>(null);

  const strategies = useQuery({
    queryKey: ["strategies"],
    queryFn: () => api.get<Strategy[]>("/strategies"),
  });

  const strategy = strategies.data?.find((entry) => entry.id === strategyId) ?? strategies.data?.[0] ?? null;
  /* En yüksek sürüm numarası taban alınır. */
  const latest = strategy ? [...strategy.versions].sort((a, b) => b.version - a.version)[0] : null;

  useEffect(() => {
    if (latest && draft === null) setDraft(structuredClone(latest.definition));
  }, [latest, draft]);

  const save = useMutation({
    mutationFn: () => api.post(`/strategies/${strategy!.id}/versions`, { definition: draft }),
    onSuccess: () => {
      toast.success("Yeni sürüm oluşturuldu", "Çalışan botlar etkilenmedi. Kullanmak için botu bu sürüme geçirin.");
      void qc.invalidateQueries({ queryKey: ["strategies"] });
      setDraft(null);
    },
    onError: (error: Error) => toast.error("Kaydedilemedi", error.message),
  });

  if (!strategy || !latest || !draft) {
    return <Empty title="Düzenlenecek strateji yok" hint="Önce Stratejiler sayfasından bir strateji oluşturun." />;
  }

  return (
    <div className="flex flex-col gap-4 pt-1">
      <div className="flex flex-wrap items-center gap-2">
        {(strategies.data?.length ?? 0) > 1 && (
          <Select
            value={strategy.id}
            onChange={(event) => {
              setStrategyId(Number(event.target.value));
              setDraft(null);
            }}
            className="w-[200px]"
          >
            {strategies.data!.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.name}
              </option>
            ))}
          </Select>
        )}
        <span style={{ fontSize: "var(--sn-t-caption)", color: "var(--sn-ink-2)" }}>
          <strong style={{ color: "var(--sn-ink)", fontWeight: 550 }}>{strategy.name}</strong> · sürüm{" "}
          <NumText text={String(latest.version)} size="sm" /> taban; kaydedince sürüm{" "}
          <NumText text={String(latest.version + 1)} size="sm" /> oluşur.
        </span>
        <Button
          size="sm"
          variant="primary"
          className="ml-auto"
          disabled={save.isPending}
          onClick={() => save.mutate()}
        >
          {save.isPending ? "Kaydediliyor…" : "Yeni sürüm olarak kaydet"}
        </Button>
      </div>

      {STRATEGY_GROUPS.filter((group) => group.key !== "temel").map((group) => (
        <div key={group.key}>
          <h3 className="font-semibold" style={{ fontSize: "var(--sn-t-body)", color: "var(--sn-ink)" }}>
            {group.title}
          </h3>
          <p className="mt-0.5 mb-2" style={{ fontSize: "var(--sn-t-caption)", color: "var(--sn-ink-2)", lineHeight: 1.5 }}>
            {group.description}
          </p>
          <div className="grid gap-3 md:grid-cols-2">
            {group.fields.map((field) => (
              <EditableField
                key={field.path}
                field={field}
                value={readPath(draft, field.path)}
                onChange={(next) =>
                  setDraft((current) => (current ? writePath({ ...current }, field.path, next) : current))
                }
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function EditableField({
  field,
  value,
  onChange,
}: {
  field: FieldSpec;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const desc = (text: string) => (
    <p className="mt-1.5" style={{ fontSize: "var(--sn-t-caption)", color: "var(--sn-ink-2)", lineHeight: 1.5 }}>
      {text}
    </p>
  );

  return (
    /* Kutu değil hairline satır: sayfa (Sheet) zaten bir yüzeydir. */
    <div className="border-b border-line py-3">
      {field.kind === "tiers" ? (
        /* Kademe listesi bu formda düzenlenmez: sayı kutusuna zorlamak
           [[80,0.75]] yapısını bozardı. Görünür ama salt okunur. */
        <>
          <FormField label={field.label}>
            <span className="sn-num" style={{ fontSize: "var(--sn-t-body)", color: "var(--sn-ink)" }}>
              {Array.isArray(value)
                ? (value as [number, number][]).map(([esik, carpan]) => `${esik}→×${carpan}`).join(" · ")
                : "—"}
            </span>
          </FormField>
          {desc(`${field.description} Bu listeyi düzenlemek için strateji tanımını JSON olarak kaydedin.`)}
        </>
      ) : field.kind === "boolean" ? (
        <Toggle checked={Boolean(value)} onChange={onChange} label={field.label} hint={field.description} />
      ) : (
        <>
          <FormField label={field.label}>
            <span className="flex items-center gap-1.5">
              {field.kind === "text" ? (
                <TextInput value={String(value ?? "")} onChange={(event) => onChange(event.target.value)} />
              ) : (
                <>
                  <TextInput
                    type="number"
                    numeric
                    value={typeof value === "number" ? value : ""}
                    min={field.min}
                    max={field.max}
                    step={field.step ?? (field.kind === "integer" ? 1 : 0.01)}
                    onChange={(event) => onChange(event.target.value === "" ? null : Number(event.target.value))}
                  />
                  {field.unit && (
                    <span className="shrink-0" style={{ fontSize: "var(--sn-t-micro)", color: "var(--sn-ink-3)" }}>
                      {field.unit}
                    </span>
                  )}
                </>
              )}
            </span>
          </FormField>
          {desc(field.description)}
        </>
      )}

      {field.warning && (
        <p
          className="mt-1 pl-2"
          style={{ borderLeft: "2px solid var(--sn-warn)", fontSize: "var(--sn-t-caption)", color: "var(--sn-ink-3)", lineHeight: 1.5 }}
        >
          {field.warning}
        </p>
      )}
    </div>
  );
}
