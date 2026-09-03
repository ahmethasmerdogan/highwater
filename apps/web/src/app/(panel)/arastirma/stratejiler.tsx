"use client";

/**
 * Araştırma › Stratejiler — kural kümeleri ve sürümleri.
 *
 * Bir strateji doğrudan düzenlenmez: her değişiklik **yeni bir sürüm**
 * doğurur ve eskisi silinmez. Geçmişe dönük testlerin dayanağı budur.
 *
 * Seçili sürüm URL'de yaşar (`?strateji=<id>&surum=<id>`): sayfa
 * yenilenince ya da bağlantı paylaşılınca aynı çekmece açılır.
 */

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type Strategy, type StrategyVersion } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { toast } from "@/lib/toast";
import { STRATEGY_GROUPS, readPath, type FieldSpec } from "@/lib/strategy-fields";
import { dateTime, num, relative } from "@/lib/format";
import { Reveal } from "uicean";
import { GuideSection } from "@/shell/page";
import {
  Async,
  Button,
  Drawer,
  DrawerSection,
  Empty,
  Explain,
  FormField,
  Modal,
  Panel,
  Tag,
  TextInput,
} from "@/design";

export const STRATEJILER_SUMMARY =
  "Puan ağırlıkları, giriş eşikleri, boyutlandırma ve çıkış kurallarından oluşan kural kümeleri.";

export function StratejilerGuide() {
  return (
    <>
      <GuideSection title="Ne gösteriyor">
        <p>
          Bir strateji, botun nasıl karar vereceğini belirleyen tüm ayarları taşır: hangi ailenin
          puana ne kadar katkı vereceği, hangi puandan itibaren giriş yapılacağı, pozisyonun ne
          kadar büyük olacağı ve ne zaman çıkılacağı.
        </p>
      </GuideSection>
      <GuideSection title="Nasıl okunur">
        <p>
          <strong>Strateji doğrudan düzenlenmez.</strong> Bir ayarı değiştirdiğinizde yeni bir sürüm
          doğar ve eski sürüm olduğu gibi kalır. Bot her zaman belirli bir sürümü çalıştırır; yeni
          sürüme geçmesi için botu o sürüme almanız gerekir.
        </p>
        <p>
          <strong>Dondurulmuş</strong> bir sürüm bir daha değiştirilemez. Geçmişe dönük testlerin
          dayanağı budur: donuk sürüm, sonucun hangi kurallarla üretildiğinin kanıtıdır.
        </p>
      </GuideSection>
      <GuideSection title="Ne yapabilirim">
        <p>
          Bir sürüme tıklayınca tüm alanları açıklamalarıyla birlikte görürsünüz. Kurgu değişikliği
          yapmak için İndikatörler sayfasındaki strateji atölyesini kullanın; oradan kaydettiğinizde
          yeni sürüm doğar.
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

  const createButton = can("TRADER") ? (
    <Button size="sm" variant="primary" onClick={() => setCreateOpen(true)}>
      Yeni strateji
    </Button>
  ) : undefined;

  return (
    <>
      {createButton && <div className="flex justify-end">{createButton}</div>}

      <Async
        query={query}
        empty={{
          title: "Henüz strateji yok",
          hint: "Bot kurabilmek için önce bir strateji ve en az bir sürüm gerekir. Yeni strateji varsayılan ayarlarla oluşturulur.",
          action: createButton,
        }}
      >
        {(list) => (
          <div className="flex flex-col gap-4">
            {list.map((entry, index) => (
              <Reveal key={entry.id} delay={index * 70}>
                <Panel
                  title={entry.name}
                  description={`${entry.versions.length} sürüm · ${relative(entry.created_at)} oluşturuldu`}
                  padded={false}
                >
                  {entry.versions.length === 0 ? (
                    <Empty
                      title="Bu stratejinin sürümü yok"
                      hint="Sürüm oluşturulana kadar bu strateji bir bota bağlanamaz."
                    />
                  ) : (
                    <ul>
                      {[...entry.versions]
                        .sort((a, b) => b.version - a.version)
                        .map((item) => (
                          <li key={item.id} style={{ borderTop: "1px solid var(--sn-hairline)" }}>
                            <button
                              type="button"
                              onClick={() => onSelect(entry.id, item.id)}
                              className="sn-focus flex w-full items-center gap-3 px-4 py-3 text-left transition-[background-color,transform] duration-[var(--sn-dur-1)] hover:translate-x-0.5 hover:bg-[var(--sn-sunken)]"
                            >
                              <span
                                className="sn-num font-medium"
                                style={{ fontSize: "var(--sn-t-body)", color: "var(--sn-ink)" }}
                              >
                                Sürüm {item.version}
                              </span>
                              <Tag tone={item.frozen ? "brand" : "neutral"}>
                                {item.frozen ? "dondurulmuş" : "düzenlenebilir"}
                              </Tag>
                              <span
                                className="sn-num"
                                style={{ fontSize: "var(--sn-t-micro)", color: "var(--sn-ink-3)" }}
                              >
                                {item.definition_hash.slice(0, 12)}
                              </span>
                              <span
                                className="sn-num ml-auto"
                                style={{ fontSize: "var(--sn-t-caption)", color: "var(--sn-ink-3)" }}
                              >
                                {dateTime(item.created_at)}
                              </span>
                            </button>
                          </li>
                        ))}
                    </ul>
                  )}
                </Panel>
              </Reveal>
            ))}
          </div>
        )}
      </Async>

      <Panel title="Sürümleme neden böyle">
        <div className="grid gap-4 md:grid-cols-2">
          <Explain id="strateji_surum" />
          <Explain id="backtest" />
        </div>
      </Panel>

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
      badge={
        <Tag tone={version.frozen ? "brand" : "neutral"}>
          {version.frozen ? "dondurulmuş" : "düzenlenebilir"}
        </Tag>
      }
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
        <pre
          className="sn-scroll sn-num overflow-x-auto rounded-[var(--sn-r-sm)] p-3.5"
          style={{
            background: "var(--sn-sunken)",
            border: "1px solid var(--sn-hairline)",
            fontSize: "var(--sn-t-caption)",
            color: "var(--sn-ink-2)",
            lineHeight: 1.55,
          }}
        >
          {JSON.stringify(version.definition, null, 2)}
        </pre>
      ) : (
        <>
          <p
            className="mb-4 rounded-[var(--sn-r-sm)] px-3.5 py-2.5"
            style={{
              background: "var(--sn-raised)",
              border: "1px solid var(--sn-hairline)",
              fontSize: "var(--sn-t-caption)",
              color: "var(--sn-ink-2)",
              lineHeight: 1.55,
            }}
          >
            Her alanın ne işe yaradığı ve yanlış ayarlanırsa ne olacağı yazılıdır. Bu sürüm{" "}
            {version.frozen
              ? "dondurulmuş — değerleri bir daha değişmez."
              : "henüz dondurulmamış; bir bota bağlanmadan önce dondurmanız önerilir."}
          </p>

          {STRATEGY_GROUPS.map((group) => (
            <DrawerSection key={group.key} title={group.title} hint={group.description}>
              <div className="rounded-[var(--sn-r-sm)]" style={{ border: "1px solid var(--sn-border)" }}>
                {group.fields.map((field, index) => (
                  <FieldRow
                    key={field.path}
                    field={field}
                    value={readPath(version.definition, field.path)}
                    first={index === 0}
                  />
                ))}
              </div>
            </DrawerSection>
          ))}

          <DrawerSection title="Künye">
            <div
              className="rounded-[var(--sn-r-sm)] px-3.5 py-2.5"
              style={{ border: "1px solid var(--sn-border)", fontSize: "var(--sn-t-caption)" }}
            >
              <div className="flex justify-between gap-3 py-1">
                <span style={{ color: "var(--sn-ink-2)" }}>Tanım parmak izi</span>
                <span className="sn-num" style={{ fontSize: "var(--sn-t-micro)" }}>
                  {version.definition_hash}
                </span>
              </div>
              <div className="flex justify-between gap-3 py-1">
                <span style={{ color: "var(--sn-ink-2)" }}>Oluşturulma</span>
                <span className="sn-num">{dateTime(version.created_at)}</span>
              </div>
            </div>
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
        ? /* [[80,0.75],[85,1]] → "80→×0,75 · 85→×1" — String(value) bunu
             "80,0.75,85,1" diye basıyordu. */
          (value as [number, number][])
            .map(([esik, carpan]) => `${num(esik, 1)}→×${num(carpan, 2)}`)
            .join(" · ")
        : typeof value === "boolean"
          ? value
            ? "Açık"
            : "Kapalı"
          : typeof value === "number"
            ? field.kind === "percent"
              ? `%${num(value * 100, 2)}`
              : num(value, Number.isInteger(value) ? 0 : 3)
            : String(value);

  return (
    <div
      className="px-3.5 py-2.5"
      style={first ? undefined : { borderTop: "1px solid var(--sn-hairline)" }}
    >
      <div className="flex items-baseline justify-between gap-4">
        <span
          className="font-medium"
          style={{ fontSize: "var(--sn-t-caption)", color: "var(--sn-ink)" }}
        >
          {field.label}
        </span>
        <span className="sn-num" style={{ fontSize: "var(--sn-t-body)", color: "var(--sn-ink)" }}>
          {display}
          {field.unit && (
            <span className="ml-1" style={{ fontSize: "var(--sn-t-micro)", color: "var(--sn-ink-3)" }}>
              {field.unit}
            </span>
          )}
        </span>
      </div>
      <p
        className="mt-0.5"
        style={{ fontSize: "var(--sn-t-caption)", color: "var(--sn-ink-2)", lineHeight: 1.5 }}
      >
        {field.description}
      </p>
      {field.warning && (
        <p
          className="mt-1 pl-2"
          style={{
            borderLeft: "2px solid var(--sn-warn)",
            fontSize: "var(--sn-t-caption)",
            color: "var(--sn-ink-3)",
            lineHeight: 1.5,
          }}
        >
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
      description="Strateji varsayılan ayarlarla oluşturulur ve ilk sürümü hazır gelir. Ayarları İndikatörler sayfasındaki atölyeden değiştirebilirsiniz; her değişiklik yeni bir sürüm doğurur."
      footer={
        <>
          <Button variant="quiet" onClick={onClose}>
            Vazgeç
          </Button>
          <Button
            variant="primary"
            disabled={!name.trim() || create.isPending}
            onClick={() => create.mutate()}
          >
            {create.isPending ? "Oluşturuluyor…" : "Oluştur"}
          </Button>
        </>
      }
    >
      <FormField label="Ad">
        <TextInput
          value={name}
          onChange={(event) => setName(event.target.value)}
          autoFocus
          placeholder="Örn. Temel kurgu"
        />
      </FormField>
    </Modal>
  );
}
