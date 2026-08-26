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
import { api } from "@/lib/api";
import { toast } from "@/lib/toast";
import { SETTING_GROUPS, type SettingFieldSpec } from "@/lib/settings-fields";
import { num } from "@/lib/format";
import { Page, GuideSection } from "@/shell/page";
import { Alert, Async, Button, InfoDot, NumText, Panel, Tag, Term, TextInput } from "@/design";
import { cx } from "@/design/cx";

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
      summary="Motorun okuduğu parametreler. Değişiklik bir sonraki döngüde geçerli olur."
      guide={
        <>
          <GuideSection title="Ne gösteriyor">
            <p>
              Havuzun nasıl kurulacağını belirleyen filtre eşikleri. Her alanın yanında ne işe
              yaradığı ve yanlış ayarlanırsa ne olacağı yazılıdır.
            </p>
          </GuideSection>
          <GuideSection title="Nasıl okunur">
            <p>
              Her alanda üç değer vardır: <strong>varsayılan</strong> (sistemin kendi değeri),{" "}
              <strong>kayıtlı</strong> (sizin yazdığınız) ve <strong>yürürlükteki</strong> (motorun
              şu an kullandığı). Kayıtlı bir değer varsa varsayılanı ezer.
            </p>
            <p>
              Bir grup <strong>salt okunur</strong> işaretliyse motor onu okumuyor demektir —
              değiştirmek hiçbir şeyi değiştirmez, bu yüzden düzenlemeye kapalıdır.
            </p>
          </GuideSection>
          <GuideSection title="Ne yapabilirim">
            <p>
              Bir eşiği değiştirdikten sonra Havuz sayfasındaki filtre hunisine bakın:
              değişikliğin kaç adayı etkilediğini orada görürsünüz. Havuz beklenenden küçük
              çıkarsa hangi filtrenin fazla agresif olduğu huni raporundan anlaşılır.
            </p>
            <p>Risk sınırları burada değil, strateji tanımında durur.</p>
          </GuideSection>
        </>
      }
    >
      <Alert tone="warn" title="Dikkat">
        Havuz filtreleri sistemin en sessiz ama en etkili düğmeleridir: bir eşiği yanlış kısmak
        havuzu belirgin biçimde küçültür ve bunu <Term id="huni">huni raporuna</Term> bakılmadıkça
        kimse fark etmez. Değişiklik yeni bir <Term id="config_hash" /> üretir; eski havuz
        fotoğraflarıyla karıştırılmaz.
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
    </Page>
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
      toast.success(
        "Ayarlar kaydedildi",
        "Motor önbelleği düşürüldü; değişiklik bir sonraki döngüde geçerli.",
      );
      setDirty(false);
      void qc.invalidateQueries({ queryKey: ["settings"] });
    },
    onError: (error: Error) => toast.error("Kaydedilemedi", error.message),
  });

  /* Motorun okumadığı gruplar salt okunur gösterilir. */
  if (!group.editable) {
    return (
      <Panel
        title={spec?.title ?? group.key}
        description="Bu kayıt veritabanında duruyor ama motor onu okumuyor."
        actions={<Tag tone="neutral">motor okumuyor</Tag>}
      >
        <p
          className="mb-3"
          style={{ fontSize: "var(--sn-t-caption)", color: "var(--sn-ink-2)", lineHeight: 1.55 }}
        >
          Buradaki değerleri değiştirmek sistemin davranışını değiştirmez. Düzenlenebilir gibi
          göstermek, hiçbir şey yapmayan bir düğme sunmak olurdu.
        </p>
        <div className="rounded-[var(--sn-r-sm)]" style={{ border: "1px solid var(--sn-border)" }}>
          {Object.entries(group.effective).map(([key, value], index) => (
            <div
              key={key}
              className="flex items-baseline justify-between gap-4 px-3.5 py-2"
              style={index > 0 ? { borderTop: "1px solid var(--sn-hairline)" } : undefined}
            >
              <span style={{ fontSize: "var(--sn-t-caption)", color: "var(--sn-ink-2)" }}>{key}</span>
              <NumText text={String(value)} size="sm" />
            </div>
          ))}
        </div>
      </Panel>
    );
  }

  /* Sözlükte tanımlı alanlar önce, tanımsızlar sonra — sıra kararlı olsun. */
  const known = spec?.fields ?? [];
  const knownKeys = new Set(known.map((field) => field.key));
  const extraKeys = Object.keys(group.effective).filter((key) => !knownKeys.has(key));

  return (
    <Panel
      title={spec?.title ?? group.key}
      description={spec?.description}
      actions={
        <Button
          size="sm"
          variant="primary"
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
            onChange={(next) => {
              setDraft((current) => ({ ...current, [field.key]: next }));
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
            onChange={(next) => {
              setDraft((current) => ({ ...current, [key]: next }));
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

  return (
    <div
      className="rounded-[var(--sn-r-sm)] px-3 py-2.5"
      style={{
        border: `1px solid ${changed ? "var(--sn-brand-line)" : "var(--sn-border)"}`,
      }}
    >
      <label className="block">
        <span className="flex items-center gap-1.5">
          <span
            className="font-medium"
            style={{ fontSize: "var(--sn-t-caption)", color: "var(--sn-ink)" }}
          >
            {field.label}
          </span>
          {changed && <Tag tone="brand">değiştirildi</Tag>}
        </span>

        <span className={cx("mt-1 flex items-center gap-1.5")}>
          {field.kind === "text" ? (
            <TextInput value={String(value ?? "")} onChange={(event) => onChange(event.target.value)} />
          ) : (
            <>
              <TextInput
                type="number"
                numeric
                value={typeof value === "number" ? value : ""}
                step={field.step ?? (field.kind === "integer" ? 1 : 0.01)}
                onChange={(event) =>
                  onChange(event.target.value === "" ? null : Number(event.target.value))
                }
              />
              {field.unit && (
                <span
                  className="shrink-0"
                  style={{ fontSize: "var(--sn-t-micro)", color: "var(--sn-ink-3)" }}
                >
                  {field.unit}
                </span>
              )}
            </>
          )}
        </span>
      </label>

      <p
        className="mt-1.5"
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

      <p
        className="mt-1.5 flex items-center gap-1"
        style={{ fontSize: "var(--sn-t-micro)", color: "var(--sn-ink-3)" }}
      >
        Varsayılan:{" "}
        <span className="sn-num">
          {typeof defaultValue === "number"
            ? /* Tam sayıyı "60,0000" diye basmak gürültü; ondalık yalnızca
                 gerçekten ondalıklı değerlerde gösterilir. */
              num(defaultValue, Number.isInteger(defaultValue) ? 0 : 4)
            : String(defaultValue ?? "—")}
        </span>
        <InfoDot text="Sistemin kendi değeri. Kayıtlı bir değer yazmazsanız motor bunu kullanır." />
      </p>
    </div>
  );
}
