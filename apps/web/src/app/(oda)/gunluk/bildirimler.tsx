"use client";

/**
 * Günlük › Bildirimler (DESIGN-V3 §4.7) — gün başlıklı defter.
 *
 * Kural: **ham JSON gösterilmez.** Her satır: saat · başlık · kategori ·
 * önem. Okundu eylemleri blok başlığında; ayrıntı sağdan açılır.
 */

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { SegmentedControl, StatusPill } from "uicean";
import { api, type Notification } from "@/lib/api";
import { toast } from "@/lib/toast";
import { CATEGORY_LABEL, SEVERITY_LABEL, humanizeNotification, payloadFields, type Severity } from "@/lib/humanize";
import { dateTime, relative, time } from "@/lib/format";
import { GuideSection } from "@/shell/page";
import { Async, Button, Drawer, DrawerSection, Empty, Explain, Field, NumText, Panel, RichText } from "@/design";
import { cx } from "@/design/cx";
import { gunlere, GunBasligi } from "./gun";

export const BILDIRIMLER_SUMMARY = "Sistemin size söylediği her şey — ne yapmanız gerektiğiyle birlikte.";

export function BildirimlerGuide() {
  return (
    <>
      <GuideSection title="Nasıl okunur">
        <p>
          Başlık <strong>ne olduğunu</strong> söyler; tıklayınca <strong>ne anlama geldiği</strong>, ilgili değerler ve
          gerekiyorsa <strong>ne yapmanız gerektiği</strong> açılır. Kırmızı ve turuncu olanlar müdahale gerektirebilir.
        </p>
      </GuideSection>
      <GuideSection title="Ne yapabilirim">
        <p>Okunmamışları süzüp yalnızca yenilere bakın. Aynı olayın Discord&apos;a da gitmesi için Entegrasyonlar&apos;dan kanal eşleyin.</p>
      </GuideSection>
    </>
  );
}

const SEVERITY_TONE: Record<Severity, "red" | "amber" | "green" | "gray"> = {
  error: "red",
  warn: "amber",
  success: "green",
  info: "gray",
};

export default function BildirimlerTab() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<"hepsi" | "okunmamis">("hepsi");
  const [severite, setSeverite] = useState<Severity | "hepsi">("hepsi");
  const [selected, setSelected] = useState<Notification | null>(null);
  /* Okundu işaretlenen satır POF diye kaybolmaz: önce kapanır, sonra veri tazelenir. */
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
    if (severite !== "hepsi") out = out.filter((item) => humanizeNotification(item).severity === severite);
    return out;
  }, [all, filter, severite]);

  const gunlu = useMemo(() => gunlere(rows, (item) => item.created_at), [rows]);

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
      <Panel
        padded={false}
        title="Bildirimler"
        description={unreadCount > 0 ? <><NumText text={String(unreadCount)} size="sm" /> okunmamış.</> : "Hepsi okundu."}
        actions={
          <>
            <SegmentedControl
              size="sm"
              value={filter}
              onChange={setFilter}
              options={[
                { value: "hepsi", label: <span className="inline-flex items-center gap-1.5">Hepsi <NumText text={String(all.length)} size="xs" /></span>, name: "Hepsi" },
                { value: "okunmamis", label: <span className="inline-flex items-center gap-1.5">Okunmamış <NumText text={String(unreadCount)} size="xs" /></span>, name: "Okunmamış" },
              ]}
            />
            <SegmentedControl
              size="sm"
              value={severite}
              onChange={setSeverite}
              options={[
                { value: "hepsi", label: "Tüm düzeyler" },
                { value: "error", label: SEVERITY_LABEL.error },
                { value: "warn", label: SEVERITY_LABEL.warn },
                { value: "success", label: SEVERITY_LABEL.success },
                { value: "info", label: SEVERITY_LABEL.info },
              ]}
            />
            {unreadCount > 0 && (
              <Button size="sm" variant="neutral" disabled={markAll.isPending} onClick={() => markAll.mutate()}>
                Tümünü okundu işaretle
              </Button>
            )}
          </>
        }
      >
        <Async
          query={query}
          empty={{ title: "Bildirim yok", hint: "Sistem çalışmaya başladığında pozisyonlar, devre kesiciler ve havuz güncellemeleri burada görünecek." }}
        >
          {() =>
            rows.length === 0 ? (
              <Empty title="Okunmamış bildirim yok" hint="Hepsini okumuşsunuz. Tümünü görmek için süzgeci değiştirin." />
            ) : (
              <div className="max-h-[680px] overflow-y-auto">
                {gunlu.map((grup) => (
                  <section key={grup.baslik}>
                    <GunBasligi count={grup.items.length}>{grup.baslik}</GunBasligi>
                    <ul>
                      {grup.items.map((item) => (
                        <NotificationRow key={item.id} item={item} leaving={leaving.has(item.id)} onOpen={() => open(item)} />
                      ))}
                    </ul>
                  </section>
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

function NotificationRow({ item, leaving, onOpen }: { item: Notification; leaving: boolean; onOpen: () => void }) {
  const human = humanizeNotification(item);
  const unread = !item.read_at;

  return (
    <li
      className="grid border-b border-line transition-[grid-template-rows,opacity] duration-300 last:border-0"
      style={{ gridTemplateRows: leaving ? "0fr" : "1fr", opacity: leaving ? 0 : 1 }}
    >
      <div className="overflow-hidden">
        <button
          type="button"
          onClick={onOpen}
          className="grid w-full grid-cols-[52px_minmax(0,1fr)_auto_auto] items-center gap-3 px-5 py-2.5 text-left hover:bg-inset/60"
        >
          <NumText text={time(item.created_at)} size="sm" />
          <span className="min-w-0">
            <span className={cx("flex items-center gap-2 text-[13px] text-ink", unread && "font-medium")}>
              {unread && <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-brand" />}
              <span className="truncate">{human.title}</span>
              <span className="shrink-0 text-[11px] text-ink-3">{CATEGORY_LABEL[human.category]}</span>
            </span>
            <span className="block truncate text-[12px] text-ink-3">{item.body || human.detail || "—"}</span>
          </span>
          <StatusPill tone={SEVERITY_TONE[human.severity]} size="sm">{SEVERITY_LABEL[human.severity]}</StatusPill>
          <span className="sn-num w-14 text-right text-[11px] text-ink-3">{relative(item.created_at)}</span>
        </button>
      </div>
    </li>
  );
}

/* ------------------------------------------------------------------ */

function NotificationDrawer({ notification, onClose }: { notification: Notification | null; onClose: () => void }) {
  if (!notification) return null;

  const human = humanizeNotification(notification);
  const fields = payloadFields(notification.payload);

  return (
    <Drawer
      open
      onClose={onClose}
      title={human.title}
      badge={<StatusPill tone={SEVERITY_TONE[human.severity]} size="sm">{SEVERITY_LABEL[human.severity]}</StatusPill>}
      subtitle={`${dateTime(notification.created_at)} · ${relative(notification.created_at)}`}
    >
      <DrawerSection title="Ne oldu">
        <div className="rounded-xl border border-line bg-elev px-3.5 py-3">
          <RichText text={notification.body || human.detail || "—"} className="block text-[13px]" />
        </div>
      </DrawerSection>

      {human.detail && notification.body && human.detail !== notification.body && (
        <DrawerSection title="Ne anlama geliyor">
          <RichText text={human.detail} className="block text-[13px]" />
        </DrawerSection>
      )}

      {human.action && (
        <DrawerSection title="Ne yapmalı">
          <p className="border-l-2 border-brand pl-3 text-[13px] leading-[1.55] text-ink-2">{human.action}</p>
        </DrawerSection>
      )}

      {fields.length > 0 && (
        <DrawerSection title="İlgili değerler" hint="Bildirimle birlikte kaydedilen bilgiler.">
          <div className="flex flex-col">
            {fields.map((field) => (
              <Field key={field.key} label={field.label} term={field.term} value={<span className="sn-num">{field.value}</span>} />
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
          <Field label="Olay kodu" hint="Motorun kullandığı makine kodu. Bir kaydı geliştiriciyle konuşurken bunu verin." value={<span className="sn-num">{notification.kind}</span>} />
          <Field label="Kategori" value={CATEGORY_LABEL[human.category]} />
          <Field label="Önem" value={SEVERITY_LABEL[human.severity]} />
          <Field label="Okunma" value={notification.read_at ? <span className="sn-num">{dateTime(notification.read_at)}</span> : "Okunmadı"} />
        </div>
      </DrawerSection>
    </Drawer>
  );
}
