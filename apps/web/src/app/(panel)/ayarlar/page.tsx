"use client";

/**
 * Ayarlar — motorun okuduğu parametreler.
 *
 * İki sınıf ayar var ve panel ikisini **karıştırmaz**:
 *
 *  · Motorun gerçekten okuduğu gruplar → düzenlenebilir. Bir değeri
 *    değiştirmek bir sonraki döngüde davranışı değiştirir.
 *  · Diğer kayıtlar → salt okunur. Düzenlenebilir gibi göstermek, hiçbir şey
 *    yapmayan bir düğme sunmak olurdu.
 *
 * Risk sınırları burada **yoktur**; onların yeri strateji tanımıdır. İki
 * ayrı yerden ezilebilmeleri, bir botun hangi limitle çalıştığını belirsiz
 * hâle getirirdi.
 */

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, StatusPill, cx } from "@/ui";
import { api } from "@/lib/api";
import { toast } from "@/lib/toast";
import { Page, Section, Async } from "@/components/common/page";
import { InfoDot, Term } from "@/components/common/explain";
import { SETTING_GROUPS, type SettingFieldSpec } from "@/lib/settings-fields";
import { num } from "@/lib/format";

interface SettingGroup {
  key: string;
  editable: boolean;
  defaults: Record<string, unknown>;
  stored: Record<string, unknown>;
  effective: Record<string, unknown>;
}

export default function SettingsPage() {
  const query = useQuery({
    queryKey: ["settings"],
    queryFn: () => api.get<{ groups: SettingGroup[] }>("/settings"),
  });

  return (
    <Page
      title="Ayarlar"
      description="Motorun okuduğu parametreler. Değişiklik bir sonraki döngüde geçerli olur."
      intro={{
        storageKey: "ayarlar",
        what: "Havuzun nasıl kurulacağını belirleyen filtre eşikleri. Her alanın yanında ne işe yaradığı ve yanlış ayarlanırsa ne olacağı yazılıdır.",
        how: "Her alanda üç değer vardır: **varsayılan** (sistemin kendi değeri), **kayıtlı** (sizin yazdığınız) ve **yürürlükteki** (motorun şu an kullandığı). Kayıtlı bir değer varsa varsayılanı ezer.\n\nBir grup **salt okunur** işaretliyse motor onu okumuyor demektir — değiştirmek hiçbir şeyi değiştirmez, bu yüzden düzenlemeye kapalıdır.",
        action: "Bir eşiği değiştirdikten sonra **Havuz** sayfasındaki filtre hunisine bakın: değişikliğin kaç adayı etkilediğini orada görürsünüz. Havuz beklenenden küçük çıkarsa hangi filtrenin fazla agresif olduğu huni raporundan anlaşılır.\n\nRisk sınırları burada değil, **strateji tanımında** durur.",
        terms: ["havuz", "huni", "config_hash", "risk_pct"],
      }}
    >
      <div className="rounded-xl border border-warn/30 bg-warn-soft px-4 py-3 text-[12.5px] leading-relaxed text-ink-2">
        <strong className="font-medium text-ink">Dikkat.</strong> Havuz filtreleri sistemin en
        sessiz ama en etkili düğmeleridir: bir eşiği yanlış kısmak havuzu belirgin biçimde
        küçültür ve bunu <Term id="huni">huni raporuna</Term> bakılmadıkça kimse fark etmez.
        Değişiklik yeni bir <Term id="config_hash" /> üretir; eski havuz fotoğraflarıyla
        karıştırılmaz.
      </div>

      <Async query={query}>
        {(data) => (
          <>
            {data.groups.map((group) => (
              <SettingGroupCard key={group.key} group={group} />
            ))}
          </>
        )}
      </Async>
    </Page>
  );
}

/* ------------------------------------------------------------------ */

function SettingGroupCard({ group }: { group: SettingGroup }) {
  const qc = useQueryClient();
  const spec = SETTING_GROUPS.find((g) => g.key === group.key);
  const [draft, setDraft] = useState<Record<string, unknown>>(() => ({ ...group.effective }));
  const [dirty, setDirty] = useState(false);

  const save = useMutation({
    mutationFn: () => api.put(`/settings/${group.key}`, { value: draft }),
    onSuccess: () => {
      toast.success(
        "Ayarlar kaydedildi",
        "Motor önbelleği düşürüldü; değişiklik bir sonraki döngüde geçerli.",
      );
      setDirty(false);
      void qc.invalidateQueries({ queryKey: ["settings"] });
    },
    onError: (e: Error) => toast.error("Kaydedilemedi", e.message),
  });

  /* Motorun okumadığı gruplar salt okunur gösterilir. */
  if (!group.editable) {
    return (
      <Section
        title={spec?.title ?? group.key}
        description="Bu kayıt veritabanında duruyor ama motor onu okumuyor."
        actions={
          <StatusPill size="sm" tone="gray">
            motor okumuyor
          </StatusPill>
        }
      >
        <p className="mb-3 text-[12.5px] leading-relaxed text-ink-2">
          Buradaki değerleri değiştirmek sistemin davranışını değiştirmez. Düzenlenebilir gibi
          göstermek, hiçbir şey yapmayan bir düğme sunmak olurdu.
        </p>
        <div className="divide-y divide-line rounded-lg border border-line">
          {Object.entries(group.effective).map(([key, value]) => (
            <div key={key} className="flex items-baseline justify-between gap-4 px-3.5 py-2">
              <span className="text-[12.5px] text-ink-2">{key}</span>
              <span className="num text-[12.5px] text-ink">{String(value)}</span>
            </div>
          ))}
        </div>
      </Section>
    );
  }

  /* Sözlükte tanımlı alanlar önce, tanımsızlar sonra — sıra kararlı olsun. */
  const known = spec?.fields ?? [];
  const knownKeys = new Set(known.map((f) => f.key));
  const extraKeys = Object.keys(group.effective).filter((k) => !knownKeys.has(k));

  return (
    <Section
      title={spec?.title ?? group.key}
      description={spec?.description}
      actions={
        <Button
          size="sm"
          variant="amber"
          shape="rect"
          disabled={!dirty || save.isPending}
          onClick={() => save.mutate()}
        >
          {save.isPending ? "Kaydediliyor…" : "Kaydet"}
        </Button>
      }
    >
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {known.map((field) => (
          <SettingField
            key={field.key}
            field={field}
            value={draft[field.key]}
            defaultValue={group.defaults[field.key]}
            stored={field.key in group.stored}
            onChange={(v) => {
              setDraft((d) => ({ ...d, [field.key]: v }));
              setDirty(true);
            }}
          />
        ))}

        {extraKeys.map((key) => (
          <SettingField
            key={key}
            field={{
              key,
              label: key.replace(/_/g, " "),
              kind: typeof group.effective[key] === "number" ? "number" : "text",
              description: "Bu alanın açıklaması henüz yazılmamış.",
            }}
            value={draft[key]}
            defaultValue={group.defaults[key]}
            stored={key in group.stored}
            onChange={(v) => {
              setDraft((d) => ({ ...d, [key]: v }));
              setDirty(true);
            }}
          />
        ))}
      </div>
    </Section>
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
  onChange: (v: unknown) => void;
}) {
  const changed = stored && String(value) !== String(defaultValue);

  return (
    <div
      className={cx(
        "rounded-lg border px-3 py-2.5",
        changed ? "border-brand/40" : "border-line",
      )}
    >
      <label className="block">
        <span className="flex items-center gap-1.5">
          <span className="text-[12px] font-medium text-ink">{field.label}</span>
          {changed && (
            <span className="rounded bg-brand-soft px-1 text-[9.5px] font-medium text-brand">
              değiştirildi
            </span>
          )}
        </span>

        {field.kind === "text" ? (
          <input
            value={String(value ?? "")}
            onChange={(e) => onChange(e.target.value)}
            className="mt-1 h-8 w-full rounded-lg border border-line bg-inset px-2.5 text-[12.5px] text-ink focus:border-brand focus:outline-none"
          />
        ) : (
          <span className="mt-1 flex items-center gap-1.5">
            <input
              type="number"
              value={typeof value === "number" ? value : ""}
              step={field.step ?? (field.kind === "integer" ? 1 : 0.01)}
              onChange={(e) =>
                onChange(e.target.value === "" ? null : Number(e.target.value))
              }
              className="num h-8 w-full rounded-lg border border-line bg-inset px-2.5 text-[12.5px] text-ink focus:border-brand focus:outline-none"
            />
            {field.unit && <span className="text-[11px] text-ink-3">{field.unit}</span>}
          </span>
        )}
      </label>

      <p className="mt-1.5 text-[11.5px] leading-relaxed text-ink-2">{field.description}</p>

      {field.warning && (
        <p className="mt-1 border-l-2 border-warn pl-2 text-[11.5px] leading-relaxed text-ink-3">
          {field.warning}
        </p>
      )}

      <p className="mt-1.5 flex items-center gap-1 text-[11px] text-ink-3">
        Varsayılan:{" "}
        <span className="num">
          {typeof defaultValue === "number"
            ? // Tam sayıyı "60,0000" diye basmak gürültü; ondalık yalnızca
              // gerçekten ondalıklı değerlerde gösterilir.
              num(defaultValue, Number.isInteger(defaultValue) ? 0 : 4)
            : String(defaultValue ?? "—")}
        </span>
        <InfoDot
          text="Sistemin kendi değeri. Kayıtlı bir değer yazmazsanız motor bunu kullanır."
          align="start"
        />
      </p>
    </div>
  );
}
