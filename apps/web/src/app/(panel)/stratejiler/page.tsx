"use client";

/**
 * Stratejiler — kural kümeleri ve sürümleri.
 *
 * Bir strateji doğrudan düzenlenmez: her değişiklik **yeni bir sürüm**
 * doğurur ve eskisi silinmez. Bunun sebebi geçmişe dönük testlerin
 * dayanağını korumaktır — çalışan bir botun kurallarını sessizce değiştirmek,
 * o botun geçmiş sonuçlarını anlamsız kılardı.
 */

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Modal, StatusPill } from "@/ui";
import { api, type Strategy, type StrategyVersion } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { toast } from "@/lib/toast";
import { Page, Section, Async, Empty } from "@/components/common/page";
import { Explain } from "@/components/common/explain";
import { Drawer, DrawerSection } from "@/components/data/drawer";
import {
  STRATEGY_GROUPS,
  readPath,
  type FieldSpec,
} from "@/lib/strategy-fields";
import { dateTime, num, relative } from "@/lib/format";

export default function StrategiesPage() {
  const { can } = useAuth();
  const [selected, setSelected] = useState<{ strategy: Strategy; version: StrategyVersion } | null>(
    null,
  );
  const [createOpen, setCreateOpen] = useState(false);

  const query = useQuery({
    queryKey: ["strategies"],
    queryFn: () => api.get<Strategy[]>("/strategies"),
  });

  return (
    <Page
      title="Stratejiler"
      description="Puan ağırlıkları, giriş eşikleri, boyutlandırma ve çıkış kurallarından oluşan kural kümeleri."
      intro={{
        storageKey: "stratejiler",
        what: "Bir strateji, botun nasıl karar vereceğini belirleyen tüm ayarları taşır: hangi ailenin puana ne kadar katkı vereceği, hangi puandan itibaren giriş yapılacağı, pozisyonun ne kadar büyük olacağı ve ne zaman çıkılacağı.",
        how: "**Strateji doğrudan düzenlenmez.** Bir ayarı değiştirdiğinizde yeni bir sürüm doğar ve eski sürüm olduğu gibi kalır. Bot her zaman belirli bir sürümü çalıştırır; yeni sürüme geçmesi için botu o sürüme almanız gerekir.\n\n**Dondurulmuş** bir sürüm bir daha değiştirilemez. Geçmişe dönük testlerin dayanağı budur: donuk sürüm, sonucun hangi kurallarla üretildiğinin kanıtıdır.",
        action: "Bir sürüme tıklayınca tüm alanları açıklamalarıyla birlikte görürsünüz. Kurgu değişikliği yapmak için **İndikatörler** sayfasındaki strateji atölyesini kullanın; oradan kaydettiğinizde yeni sürüm doğar.",
        terms: ["strateji", "strateji_surum", "puan", "backtest"],
      }}
      actions={
        can("TRADER") && (
          <Button size="sm" variant="amber" shape="rect" onClick={() => setCreateOpen(true)}>
            Yeni strateji
          </Button>
        )
      }
    >
      <Async
        query={query}
        empty={{
          title: "Henüz strateji yok",
          description:
            "Bot kurabilmek için önce bir strateji ve en az bir sürüm gerekir. Yeni strateji varsayılan ayarlarla oluşturulur.",
          action: can("TRADER") ? (
            <Button size="sm" variant="amber" shape="rect" onClick={() => setCreateOpen(true)}>
              İlk stratejiyi oluştur
            </Button>
          ) : undefined,
        }}
      >
        {(list) => (
          <div className="space-y-4">
            {list.map((s) => (
              <Section
                key={s.id}
                title={s.name}
                description={`${s.versions.length} sürüm · ${relative(s.created_at)} oluşturuldu`}
                padded={false}
              >
                {s.versions.length === 0 ? (
                  <Empty
                    title="Bu stratejinin sürümü yok"
                    description="Sürüm oluşturulana kadar bu strateji bir bota bağlanamaz."
                    className="m-4 border-0"
                  />
                ) : (
                  <ul className="divide-y divide-line">
                    {[...s.versions]
                      .sort((a, b) => b.version - a.version)
                      .map((v) => (
                        <li key={v.id}>
                          <button
                            type="button"
                            onClick={() => setSelected({ strategy: s, version: v })}
                            className="flex w-full items-center gap-3 px-5 py-3 text-left hover:bg-inset"
                          >
                            <span className="num text-[13px] font-medium text-ink">
                              Sürüm {v.version}
                            </span>
                            {v.frozen ? (
                              <StatusPill size="sm" tone="amber">
                                dondurulmuş
                              </StatusPill>
                            ) : (
                              <StatusPill size="sm" tone="gray">
                                düzenlenebilir
                              </StatusPill>
                            )}
                            <span className="font-mono text-[11.5px] text-ink-3">
                              {v.definition_hash.slice(0, 12)}
                            </span>
                            <span className="ml-auto text-[12px] text-ink-3">
                              {dateTime(v.created_at)}
                            </span>
                          </button>
                        </li>
                      ))}
                  </ul>
                )}
              </Section>
            ))}
          </div>
        )}
      </Async>

      <Section title="Sürümleme neden böyle">
        <div className="grid gap-5 md:grid-cols-2">
          <Explain id="strateji_surum" showTitle={false} />
          <Explain id="backtest" showTitle />
        </div>
      </Section>

      {selected && (
        <VersionDrawer
          strategy={selected.strategy}
          version={selected.version}
          onClose={() => setSelected(null)}
        />
      )}

      {createOpen && <CreateStrategyModal onClose={() => setCreateOpen(false)} />}
    </Page>
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
    onError: (e: Error) => toast.error("Dondurulamadı", e.message),
  });

  return (
    <Drawer
      open
      onClose={onClose}
      title={`${strategy.name} · sürüm ${version.version}`}
      subtitle={dateTime(version.created_at)}
      width="max-w-2xl"
      badge={
        version.frozen ? (
          <StatusPill size="sm" tone="amber">
            dondurulmuş
          </StatusPill>
        ) : (
          <StatusPill size="sm" tone="gray">
            düzenlenebilir
          </StatusPill>
        )
      }
      footer={
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setShowRaw((v) => !v)}
            className="text-[12.5px] text-ink-3 hover:text-ink-2"
          >
            {showRaw ? "Açıklamalı görünüm" : "Ham tanımı göster"}
          </button>
          {can("TRADER") && !version.frozen && (
            <Button
              size="sm"
              variant="outline"
              shape="rect"
              disabled={freeze.isPending}
              onClick={() => freeze.mutate()}
            >
              Sürümü dondur
            </Button>
          )}
        </div>
      }
    >
      {showRaw ? (
        <pre className="thin-scroll overflow-x-auto rounded-lg border border-line bg-inset p-3.5 font-mono text-[11.5px] leading-relaxed text-ink-2">
          {JSON.stringify(version.definition, null, 2)}
        </pre>
      ) : (
        <>
          <p className="mb-4 rounded-lg border border-line bg-elev px-3.5 py-2.5 text-[12.5px] leading-relaxed text-ink-2">
            Her alanın ne işe yaradığı ve yanlış ayarlanırsa ne olacağı yazılıdır. Bu sürüm{" "}
            {version.frozen
              ? "dondurulmuş — değerleri bir daha değişmez."
              : "henüz dondurulmamış; bir bota bağlanmadan önce dondurmanız önerilir."}
          </p>

          {STRATEGY_GROUPS.map((group) => (
            <DrawerSection
              key={group.key}
              title={group.title}
              description={group.description}
            >
              <div className="divide-y divide-line rounded-lg border border-line">
                {group.fields.map((field) => (
                  <FieldRow
                    key={field.path}
                    field={field}
                    value={readPath(version.definition, field.path)}
                  />
                ))}
              </div>
            </DrawerSection>
          ))}

          <DrawerSection title="Künye">
            <div className="rounded-lg border border-line px-3.5 py-2.5 text-[12.5px]">
              <div className="flex justify-between gap-3 py-1">
                <span className="text-ink-2">Tanım parmak izi</span>
                <span className="font-mono text-[11.5px]">{version.definition_hash}</span>
              </div>
              <div className="flex justify-between gap-3 py-1">
                <span className="text-ink-2">Oluşturulma</span>
                <span>{dateTime(version.created_at)}</span>
              </div>
            </div>
          </DrawerSection>
        </>
      )}
    </Drawer>
  );
}

function FieldRow({ field, value }: { field: FieldSpec; value: unknown }) {
  const display =
    value === null || value === undefined
      ? "—"
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
    <div className="px-3.5 py-2.5">
      <div className="flex items-baseline justify-between gap-4">
        <span className="text-[12.5px] font-medium text-ink">{field.label}</span>
        <span className="num text-[13px] text-ink">
          {display}
          {field.unit && <span className="ml-1 text-[11px] text-ink-3">{field.unit}</span>}
        </span>
      </div>
      <p className="mt-0.5 text-[11.5px] leading-relaxed text-ink-2">{field.description}</p>
      {field.warning && (
        <p className="mt-1 border-l-2 border-warn pl-2 text-[11.5px] leading-relaxed text-ink-3">
          {field.warning}
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Yeni strateji                                                      */
/* ------------------------------------------------------------------ */

function CreateStrategyModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState("");

  const create = useMutation({
    mutationFn: () => api.post<Strategy>("/strategies", { name: name.trim() }),
    onSuccess: () => {
      toast.success("Strateji oluşturuldu", "Varsayılan ayarlarla ilk sürüm hazır.");
      void qc.invalidateQueries({ queryKey: ["strategies"] });
      onClose();
    },
    onError: (e: Error) => toast.error("Oluşturulamadı", e.message),
  });

  return (
    <Modal open onClose={onClose} label="Yeni strateji" width="max-w-md">
      <div className="p-5">
        <h2 className="text-[15px] font-semibold text-ink">Yeni strateji</h2>
        <p className="mt-1 text-[12.5px] leading-relaxed text-ink-2">
          Strateji varsayılan ayarlarla oluşturulur ve ilk sürümü hazır gelir. Ayarları
          İndikatörler sayfasındaki atölyeden değiştirebilirsiniz; her değişiklik yeni bir sürüm
          doğurur.
        </p>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) create.mutate();
          }}
          className="mt-4 space-y-3.5"
        >
          <label className="block">
            <span className="text-[12px] font-medium text-ink-2">Ad</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              placeholder="Örn. Temel kurgu"
              className="mt-1 h-9 w-full rounded-lg border border-line bg-inset px-2.5 text-[13px] text-ink placeholder:text-ink-3 focus:border-brand focus:outline-none"
            />
          </label>

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" size="sm" variant="ghost" shape="rect" onClick={onClose}>
              Vazgeç
            </Button>
            <Button
              type="submit"
              size="sm"
              variant="amber"
              shape="rect"
              disabled={!name.trim() || create.isPending}
            >
              {create.isPending ? "Oluşturuluyor…" : "Oluştur"}
            </Button>
          </div>
        </form>
      </div>
    </Modal>
  );
}
