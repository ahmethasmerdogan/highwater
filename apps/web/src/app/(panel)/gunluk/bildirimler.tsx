"use client";

/**
 * Günlük › Bildirimler.
 *
 * Kural: **ham JSON gösterilmez.** Motor bildirimleri bir yük nesnesiyle
 * yazar; burası o nesneyi etiketli alanlara çevirir ve her bildirimin
 * altına üç soruyu cevaplar — ne oldu, ne anlama geliyor, ne yapmalıyım.
 */

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type Notification } from "@/lib/api";
import { toast } from "@/lib/toast";
import {
  CATEGORY_LABEL,
  SEVERITY_LABEL,
  humanizeNotification,
  payloadFields,
  type Severity,
} from "@/lib/humanize";
import { dateOnly, dateTime, relative } from "@/lib/format";
import { GuideSection } from "@/shell/page";
import {
  Async,
  Button,
  Drawer,
  DrawerSection,
  Empty,
  Explain,
  Field,
  Panel,
  RichText,
  Segmented,
  Tag,
  type Tone,
} from "@/design";
import { cx } from "@/design/cx";
import { ICheck, IInfo, IWarning, IZap, Reveal } from "uicean";

export const BILDIRIMLER_SUMMARY =
  "Sistemin size söylediği her şey — makine diliyle değil, ne yapmanız gerektiğiyle birlikte.";

export function BildirimlerGuide() {
  return (
    <>
      <GuideSection title="Ne gösteriyor">
        <p>
          Bot bir pozisyon açtığında ya da kapattığında, bir devre kesici tetiklendiğinde, havuz
          güncellendiğinde ya da veri akışı bozulduğunda buraya bir bildirim düşer.
        </p>
      </GuideSection>
      <GuideSection title="Nasıl okunur">
        <p>
          Her bildirimin başlığı <strong>ne olduğunu</strong> söyler. Tıklayınca{" "}
          <strong>ne anlama geldiği</strong>, ilgili değerler ve gerekiyorsa{" "}
          <strong>ne yapmanız gerektiği</strong> açılır. Ham teknik döküm gösterilmez; değerler
          etiketli alanlar hâlinde durur.
        </p>
        <p>
          Soldaki renkli işaret önem düzeyidir. Kırmızı ve turuncu olanlar müdahale gerektirebilir.
        </p>
      </GuideSection>
      <GuideSection title="Ne yapabilirim">
        <p>
          Okunmamışları süzüp yalnızca yenilere bakabilirsiniz. Aynı olayın Discord&apos;a da
          gitmesini isterseniz Entegrasyonlar sayfasından kanal eşlemesi yapın.
        </p>
      </GuideSection>
    </>
  );
}

const SEVERITY_TONE: Record<Severity, Tone> = {
  error: "down",
  warn: "warn",
  success: "up",
  info: "neutral",
};

export default function BildirimlerTab() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<"hepsi" | "okunmamis">("hepsi");
  const [severite, setSeverite] = useState<Severity | "hepsi">("hepsi");
  const [selected, setSelected] = useState<Notification | null>(null);
  /* Okundu işaretlenen satır listeden POF diye kaybolmaz: önce yumuşakça
     kapanır (0fr), sonra veri tazelenir. */
  const [leaving, setLeaving] = useState<Set<number>>(new Set());

  const query = useQuery({
    queryKey: ["notifications"],
    queryFn: () => api.get<Notification[]>("/notifications", { limit: 200 }),
    refetchInterval: 30_000,
  });

  const markRead = useMutation({
    mutationFn: (id: number) => api.patch(`/notifications/${id}/read`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["notifications"] });
      void qc.invalidateQueries({ queryKey: ["unread-count"] });
    },
  });

  const markAll = useMutation({
    mutationFn: () => api.patch("/notifications/read-all"),
    onSuccess: () => {
      toast.success("Tüm bildirimler okundu olarak işaretlendi");
      void qc.invalidateQueries({ queryKey: ["notifications"] });
      void qc.invalidateQueries({ queryKey: ["unread-count"] });
    },
    onError: (error: Error) => toast.error("İşaretlenemedi", error.message),
  });

  const all = useMemo(() => query.data ?? [], [query.data]);
  const unreadCount = all.filter((item) => !item.read_at).length;
  const rows = useMemo(() => {
    let out = filter === "okunmamis" ? all.filter((item) => !item.read_at) : all;
    if (severite !== "hepsi") {
      out = out.filter((item) => humanizeNotification(item).severity === severite);
    }
    return out;
  }, [all, filter, severite]);

  /* Gün başlıkları: Bugün / Dün / tarih. Akış zaten yeniden eskiye. */
  const gunlu = useMemo(() => {
    const bugun = new Date();
    const dun = new Date(bugun.getTime() - 86_400_000);
    const ayni = (a: Date, b: Date) =>
      a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate();
    const gruplar: { baslik: string; items: Notification[] }[] = [];
    for (const item of rows) {
      const d = new Date(item.created_at);
      const baslik = ayni(d, bugun) ? "Bugün" : ayni(d, dun) ? "Dün" : dateOnly(item.created_at);
      const son = gruplar[gruplar.length - 1];
      if (son && son.baslik === baslik) son.items.push(item);
      else gruplar.push({ baslik, items: [item] });
    }
    return gruplar;
  }, [rows]);

  const open = (item: Notification) => {
    setSelected(item);
    if (!item.read_at) {
      if (filter === "okunmamis") {
        setLeaving((prev) => new Set(prev).add(item.id));
        window.setTimeout(() => markRead.mutate(item.id), 240);
      } else {
        markRead.mutate(item.id);
      }
    }
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Segmented
          value={filter}
          onChange={setFilter}
          options={[
            { value: "hepsi", label: "Hepsi", count: all.length },
            { value: "okunmamis", label: "Okunmamış", count: unreadCount },
          ]}
        />
        <Segmented
          value={severite}
          onChange={setSeverite}
          size="sm"
          options={[
            { value: "hepsi", label: "Tüm düzeyler" },
            { value: "error", label: SEVERITY_LABEL.error },
            { value: "warn", label: SEVERITY_LABEL.warn },
            { value: "success", label: SEVERITY_LABEL.success },
            { value: "info", label: SEVERITY_LABEL.info },
          ]}
        />
        {unreadCount > 0 && (
          <Button
            size="sm"
            variant="neutral"
            className="ml-auto"
            disabled={markAll.isPending}
            onClick={() => markAll.mutate()}
          >
            Tümünü okundu işaretle
          </Button>
        )}
      </div>

      <Panel padded={false}>
        <Async
          query={query}
          empty={{
            title: "Bildirim yok",
            hint: "Sistem çalışmaya başladığında pozisyon açılışları, devre kesiciler ve havuz güncellemeleri burada görünecek.",
          }}
        >
          {() =>
            rows.length === 0 ? (
              <Empty
                title="Okunmamış bildirim yok"
                hint="Hepsini okumuşsunuz. Tümünü görmek için süzgeci değiştirin."
              />
            ) : (
              <div>
                {gunlu.map((grup) => (
                  <Reveal key={grup.baslik}>
                    <div
                      className="sticky top-0 z-10 px-4 py-1.5"
                      style={{
                        background: "var(--sn-raised)",
                        borderTop: "1px solid var(--sn-hairline)",
                        borderBottom: "1px solid var(--sn-hairline)",
                        fontSize: "var(--sn-t-label)",
                        fontWeight: 600,
                        letterSpacing: "0.04em",
                        textTransform: "uppercase",
                        color: "var(--sn-ink-3)",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {grup.baslik}
                    </div>
                    <ul>
                      {grup.items.map((item) => (
                        <NotificationRow
                          key={item.id}
                          item={item}
                          leaving={leaving.has(item.id)}
                          onOpen={() => open(item)}
                        />
                      ))}
                    </ul>
                  </Reveal>
                ))}
              </div>
            )
          }
        </Async>
      </Panel>

      <NotificationDrawer notification={selected} onClose={() => setSelected(null)} />
    </>
  );
}

/* ------------------------------------------------------------------ */

function NotificationRow({
  item,
  leaving,
  onOpen,
}: {
  item: Notification;
  leaving: boolean;
  onOpen: () => void;
}) {
  const human = humanizeNotification(item);
  const unread = !item.read_at;
  const tone = SEVERITY_TONE[human.severity];
  const renk =
    tone === "down"
      ? "var(--sn-down)"
      : tone === "warn"
        ? "var(--sn-warn)"
        : tone === "up"
          ? "var(--sn-up)"
          : "var(--sn-info)";
  const zemin =
    tone === "down"
      ? "var(--sn-down-bg)"
      : tone === "warn"
        ? "var(--sn-warn-bg)"
        : tone === "up"
          ? "var(--sn-up-bg)"
          : "var(--sn-sunken)";
  const Ikon =
    human.severity === "error"
      ? IZap
      : human.severity === "warn"
        ? IWarning
        : human.severity === "success"
          ? ICheck
          : IInfo;

  return (
    <li
      className="grid transition-[grid-template-rows,opacity] duration-[var(--sn-dur-3)] ease-[var(--sn-ease)]"
      style={{
        gridTemplateRows: leaving ? "0fr" : "1fr",
        opacity: leaving ? 0 : 1,
        borderTop: "1px solid var(--sn-hairline)",
      }}
    >
      <div className="overflow-hidden">
        <button
          type="button"
          onClick={onOpen}
          className={cx(
            "sn-focus relative flex w-full items-start gap-3 px-4 py-3 text-left",
            "transition-colors duration-[var(--sn-dur-1)] hover:bg-[var(--sn-sunken)]",
          )}
        >
          {/* Okunmamış rayı: sol kenarda 2px amber. */}
          {unread && (
            <span
              aria-hidden
              className="absolute top-2 bottom-2 left-0 w-[2px] rounded-r"
              style={{ background: "var(--sn-brand-solid)" }}
            />
          )}
          <span
            aria-hidden
            className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--sn-r-sm)]"
            style={{ background: zemin, color: renk }}
          >
            <Ikon size={15} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-2">
              <span
                style={{
                  fontSize: "var(--sn-t-body)",
                  color: "var(--sn-ink)",
                  fontWeight: unread ? 550 : 400,
                }}
              >
                {human.title}
              </span>
              <span style={{ fontSize: "var(--sn-t-micro)", color: "var(--sn-ink-3)" }}>
                {CATEGORY_LABEL[human.category]}
              </span>
            </span>
            <span
              className="mt-0.5 line-clamp-2 block"
              style={{ fontSize: "var(--sn-t-caption)", color: "var(--sn-ink-2)", lineHeight: 1.45 }}
            >
              {item.body || human.detail || "—"}
            </span>
          </span>
          <span
            className="shrink-0 text-right whitespace-nowrap"
            style={{
              fontSize: "var(--sn-t-caption)",
              color: "var(--sn-ink-3)",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {relative(item.created_at)}
          </span>
        </button>
      </div>
    </li>
  );
}

/* ------------------------------------------------------------------ */

function NotificationDrawer({
  notification,
  onClose,
}: {
  notification: Notification | null;
  onClose: () => void;
}) {
  if (!notification) return null;

  const human = humanizeNotification(notification);
  const fields = payloadFields(notification.payload);

  return (
    <Drawer
      open
      onClose={onClose}
      title={human.title}
      badge={<Tag tone={SEVERITY_TONE[human.severity]}>{SEVERITY_LABEL[human.severity]}</Tag>}
      subtitle={`${dateTime(notification.created_at)} · ${relative(notification.created_at)}`}
    >
      <DrawerSection title="Ne oldu">
        <div
          className="rounded-[var(--sn-r-sm)] px-3.5 py-3"
          style={{ background: "var(--sn-raised)", border: "1px solid var(--sn-hairline)" }}
        >
          <RichText
            text={notification.body || human.detail || "—"}
            className="block text-[length:var(--sn-t-body)]"
          />
        </div>
      </DrawerSection>

      {human.detail && notification.body && human.detail !== notification.body && (
        <DrawerSection title="Ne anlama geliyor">
          <RichText text={human.detail} className="block text-[length:var(--sn-t-body)]" />
        </DrawerSection>
      )}

      {human.action && (
        <DrawerSection title="Ne yapmalı">
          <p
            className="pl-3"
            style={{
              borderLeft: "2px solid var(--sn-brand-solid)",
              fontSize: "var(--sn-t-body)",
              color: "var(--sn-ink-2)",
              lineHeight: 1.55,
            }}
          >
            {human.action}
          </p>
        </DrawerSection>
      )}

      {fields.length > 0 && (
        <DrawerSection title="İlgili değerler" hint="Bildirimle birlikte kaydedilen bilgiler.">
          <div className="flex flex-col">
            {fields.map((field) => (
              <Field
                key={field.key}
                label={field.label}
                term={field.term}
                value={<span className="sn-num">{field.value}</span>}
              />
            ))}
          </div>
        </DrawerSection>
      )}

      {human.term && (
        <DrawerSection title="İlgili kavram">
          <Explain id={human.term} />
        </DrawerSection>
      )}

      <DrawerSection title="Künye">
        <div className="flex flex-col">
          <Field
            label="Olay kodu"
            hint="Motorun kullandığı makine kodu. Bir kaydı geliştiriciyle konuşurken bunu verin."
            value={<span className="sn-num">{notification.kind}</span>}
          />
          <Field label="Kategori" value={CATEGORY_LABEL[human.category]} />
          <Field label="Önem" value={SEVERITY_LABEL[human.severity]} />
          <Field
            label="Okunma"
            value={
              notification.read_at ? (
                <span className="sn-num">{dateTime(notification.read_at)}</span>
              ) : (
                "Okunmadı"
              )
            }
          />
        </div>
      </DrawerSection>
    </Drawer>
  );
}
