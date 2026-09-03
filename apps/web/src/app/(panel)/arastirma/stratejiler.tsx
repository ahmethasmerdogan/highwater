"use client";

/**
 * Araştırma › Stratejiler — kural kümeleri ve sürümleri (DESIGN-V3 §4.6).
 *
 * Bir strateji doğrudan düzenlenmez: her değişiklik yeni bir sürüm doğurur,
 * eskisi silinmez. Sürümler tek defter tablosunda; ayrıntı sağdan açılır.
 * Seçili sürüm URL'de yaşar (`?strateji=<id>&surum=<id>`).
 */

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Field as UiField, Reveal, StatusPill, Table, TBody, Td, Th, THead, Tr } from "uicean";
import { api, type Strategy, type StrategyVersion } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { toast } from "@/lib/toast";
import { STRATEGY_GROUPS, readPath, type FieldSpec } from "@/lib/strategy-fields";
import { dateTime, num } from "@/lib/format";
import { GuideSection } from "@/shell/page";
import { Async, Button, Drawer, DrawerSection, KeyValue, Modal, NumText, Panel, TextInput } from "@/design";

export const STRATEJILER_SUMMARY =
  "Puan ağırlıkları, giriş eşikleri, boyutlandırma ve çıkış kurallarından oluşan kural kümeleri.";

export function StratejilerGuide() {
  return (
    <>
      <GuideSection title="Ne gösteriyor">
        <p>
          Bir strateji botun nasıl karar vereceğini belirleyen tüm ayarları taşır: aile
          ağırlıkları, giriş eşiği, pozisyon boyutu ve çıkış kuralları.
        </p>
      </GuideSection>
      <GuideSection title="Nasıl okunur">
        <p>
          <strong>Strateji doğrudan düzenlenmez.</strong> Her değişiklik yeni bir sürüm doğurur;
          bot belirli bir sürümü çalıştırır. <strong>Dondurulmuş</strong> sürüm bir daha
          değişmez — geçmişe dönük testlerin kanıtı budur.
        </p>
      </GuideSection>
      <GuideSection title="Ne yapabilirim">
        <p>
          Satıra tıklayınca tüm alanlar açıklamalarıyla açılır. Kurgu değişikliği İndikatörler
          sayfasındaki atölyeden yapılır; kaydedince yeni sürüm doğar.
        </p>
      </GuideSection>
    </>
  );
}

export default function StratejilerTab({
  strategyId,
  versionId,
  onSelect,
}: {
  strategyId: number | null;
  versionId: number | null;
  /** Çekmeceyi açar (`strateji`, `surum`) ya da kapatır (`null`, `null`). */
  onSelect: (strategyId: number | null, versionId: number | null) => void;
}) {
  const { can } = useAuth();
  const [createOpen, setCreateOpen] = useState(false);

  const query = useQuery({
    queryKey: ["strategies"],
    queryFn: () => api.get<Strategy[]>("/strategies"),
  });

  /* Seçim URL'den türetilir; sürüm verilmemişse en yenisi açılır. */
  const strategy = (query.data ?? []).find((entry) => entry.id === strategyId) ?? null;
  const version =
    strategy === null
      ? null
      : (strategy.versions.find((entry) => entry.id === versionId) ??
        [...strategy.versions].sort((a, b) => b.version - a.version)[0] ??
        null);

  const rows = useMemo(
    () =>
      (query.data ?? []).flatMap((entry) =>
        [...entry.versions]
          .sort((a, b) => b.version - a.version)
          .map((item, index) => ({ strategy: entry, version: item, first: index === 0, count: entry.versions.length })),
      ),
    [query.data],
  );

  const createButton = can("TRADER") ? (
    <Button size="sm" variant="primary" onClick={() => setCreateOpen(true)}>Yeni strateji</Button>
  ) : undefined;

  return (
    <>
      <Reveal>
        <Panel title="Sürümler" description="Her satır bir sürüm; en yenisi üstte." padded={false} actions={createButton}>
          <Async
            query={query}
            empty={{
              title: "Henüz strateji yok",
              hint: "Bot kurabilmek için önce bir strateji ve en az bir sürüm gerekir.",
              action: createButton,
            }}
          >
            {() => (
              <Table minWidth={720}>
                <THead>
                  <tr>
                    <Th>Strateji</Th>
                    <Th align="right">Sürüm</Th>
                    <Th>Durum</Th>
                    <Th>Parmak izi</Th>
                    <Th align="right">Oluşturuldu</Th>
                  </tr>
                </THead>
                <TBody>
                  {rows.map(({ strategy: s, version: v, first, count }) => (
                    <Tr key={v.id} selected={v.id === version?.id} onClick={() => onSelect(s.id, v.id)}>
                      <Td className={first ? "font-medium text-ink" : "text-ink-3"}>
                        {first ? s.name : <span className="pl-3">↳ {s.name}</span>}
                        {first && count > 1 && <span className="ml-2 text-[12px] font-normal text-ink-3"><NumText text={num(count, 0)} size="xs" /> sürüm</span>}
                      </Td>
                      <Td align="right"><NumText text={`v${v.version}`} size="sm" /></Td>
                      <Td><StatusPill tone={v.frozen ? "blue" : "gray"} size="sm">{v.frozen ? "dondurulmuş" : "düzenlenebilir"}</StatusPill></Td>
                      <Td><NumText text={v.definition_hash.slice(0, 12)} size="xs" /></Td>
                      <Td align="right"><NumText text={dateTime(v.created_at)} size="sm" /></Td>
                    </Tr>
                  ))}
                  {rows.length === 0 && (
                    <Tr><Td colSpan={5} className="py-8 text-center text-ink-3">Sürüm yok — sürüm oluşturulana kadar strateji bir bota bağlanamaz.</Td></Tr>
                  )}
                </TBody>
              </Table>
            )}
          </Async>
        </Panel>
      </Reveal>

      {strategy && version && (
        <VersionDrawer strategy={strategy} version={version} onClose={() => onSelect(null, null)} />
      )}

      <CreateStrategyModal open={createOpen} onClose={() => setCreateOpen(false)} />
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Sürüm detayı                                                       */
/* ------------------------------------------------------------------ */

function VersionDrawer({
  strategy,
  version,
  onClose,
}: {
  strategy: Strategy;
  version: StrategyVersion;
  onClose: () => void;
}) {
  const { can } = useAuth();
  const qc = useQueryClient();
  const [showRaw, setShowRaw] = useState(false);

  const freeze = useMutation({
    mutationFn: () => api.post(`/strategies/versions/${version.id}/freeze`),
    onSuccess: () => {
      toast.success("Sürüm donduruldu", "Bu sürüm artık değiştirilemez.");
      void qc.invalidateQueries({ queryKey: ["strategies"] });
      onClose();
    },
    onError: (error: Error) => toast.error("Dondurulamadı", error.message),
  });

  return (
    <Drawer
      open
      onClose={onClose}
      title={`${strategy.name} · sürüm ${version.version}`}
      subtitle={dateTime(version.created_at)}
      width={720}
      badge={<StatusPill tone={version.frozen ? "blue" : "gray"} size="sm">{version.frozen ? "dondurulmuş" : "düzenlenebilir"}</StatusPill>}
      footer={
        <>
          <Button size="sm" variant="quiet" className="mr-auto" onClick={() => setShowRaw((value) => !value)}>
            {showRaw ? "Açıklamalı görünüm" : "Ham tanımı göster"}
          </Button>
          {can("TRADER") && !version.frozen && (
            <Button size="sm" variant="neutral" disabled={freeze.isPending} onClick={() => freeze.mutate()}>
              Sürümü dondur
            </Button>
          )}
        </>
      }
    >
      {showRaw ? (
        <pre className="sn-scroll sn-num overflow-x-auto rounded-xl border border-line bg-inset p-3.5 text-[12px] leading-[1.55] text-ink-2">
          {JSON.stringify(version.definition, null, 2)}
        </pre>
      ) : (
        <>
          <p className="mb-4 text-[12.5px] leading-[1.55] text-ink-3">
            {version.frozen
              ? "Bu sürüm dondurulmuş; değerleri bir daha değişmez."
              : "Bu sürüm henüz dondurulmamış; bir bota bağlanmadan önce dondurmanız önerilir."}
          </p>

          {STRATEGY_GROUPS.map((group) => (
            <DrawerSection key={group.key} title={group.title} hint={group.description}>
              <div className="rounded-xl border border-line">
                {group.fields.map((field, index) => (
                  <FieldRow key={field.path} field={field} value={readPath(version.definition, field.path)} first={index === 0} />
                ))}
              </div>
            </DrawerSection>
          ))}

          <DrawerSection title="Künye">
            <KeyValue
              rows={[
                { label: "Tanım parmak izi", value: <NumText text={version.definition_hash} size="xs" /> },
                { label: "Oluşturulma", value: <NumText text={dateTime(version.created_at)} size="sm" /> },
              ]}
            />
          </DrawerSection>
        </>
      )}
    </Drawer>
  );
}

function FieldRow({ field, value, first }: { field: FieldSpec; value: unknown; first: boolean }) {
  const display =
    value === null || value === undefined
      ? "—"
      : field.kind === "tiers" && Array.isArray(value)
        ? /* [[80,0.75],[85,1]] → "80→×0,75 · 85→×1" */
          (value as [number, number][]).map(([esik, carpan]) => `${num(esik, 1)}→×${num(carpan, 2)}`).join(" · ")
        : typeof value === "boolean"
          ? value ? "Açık" : "Kapalı"
          : typeof value === "number"
            ? field.kind === "percent" ? `%${num(value * 100, 2)}` : num(value, Number.isInteger(value) ? 0 : 3)
            : String(value);

  return (
    <div className={first ? "px-3.5 py-2.5" : "border-t border-line px-3.5 py-2.5"}>
      <div className="flex items-baseline justify-between gap-4">
        <span className="text-[12.5px] font-medium text-ink">{field.label}</span>
        <span className="inline-flex items-baseline gap-1">
          <NumText text={display} size="md" />
          {field.unit && <span className="text-[10.5px] text-ink-3">{field.unit}</span>}
        </span>
      </div>
      <p className="mt-0.5 text-[12px] leading-[1.5] text-ink-2">{field.description}</p>
      {field.warning && (
        <p className="mt-1 border-l-2 pl-2 text-[12px] leading-[1.5] text-ink-3" style={{ borderColor: "var(--sn-warn)" }}>
          {field.warning}
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function CreateStrategyModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState("");

  const create = useMutation({
    mutationFn: () => api.post<Strategy>("/strategies", { name: name.trim() }),
    onSuccess: () => {
      toast.success("Strateji oluşturuldu", "Varsayılan ayarlarla ilk sürüm hazır.");
      void qc.invalidateQueries({ queryKey: ["strategies"] });
      onClose();
    },
    onError: (error: Error) => toast.error("Oluşturulamadı", error.message),
  });

  return (
    <Modal
      open={open}
      onOpenChange={(next) => !next && onClose()}
      title="Yeni strateji"
      description="Varsayılan ayarlarla oluşturulur; ilk sürüm hazır gelir. Her değişiklik yeni bir sürüm doğurur."
      footer={
        <>
          <Button variant="quiet" onClick={onClose}>Vazgeç</Button>
          <Button variant="primary" disabled={!name.trim() || create.isPending} onClick={() => create.mutate()}>
            {create.isPending ? "Oluşturuluyor…" : "Oluştur"}
          </Button>
        </>
      }
    >
      <UiField label="Ad">
        {(p) => <TextInput {...p} value={name} onChange={(event) => setName(event.target.value)} autoFocus placeholder="Örn. Temel kurgu" />}
      </UiField>
    </Modal>
  );
}
