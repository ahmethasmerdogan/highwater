"use client";

/**
 * Bildirimler.
 *
 * Kural: **ham JSON gösterilmez.** Motor bildirimleri bir yük nesnesiyle
 * yazar; bu sayfa o nesneyi etiketli alanlara çevirir ve her bildirimin
 * altına üç soruyu cevaplar — ne oldu, ne anlama geliyor, ne yapmalıyım.
 *
 * Bir bildirim okunduğunda kullanıcı ne yapacağını biliyorsa iş görmüştür;
 * `{"breaker": "STALE_DATA", "level": "WARN"}` okuyorsa görmemiştir.
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
import { dateTime, relative } from "@/lib/format";
import { Page, GuideSection } from "@/shell/page";
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

const SEVERITY_TONE: Record<Severity, Tone> = {
  error: "down",
  warn: "warn",
  success: "up",
  info: "neutral",
};

export default function NotificationsPage() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<"hepsi" | "okunmamis">("hepsi");
  const [selected, setSelected] = useState<Notification | null>(null);

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
  const rows = useMemo(
    () => (filter === "okunmamis" ? all.filter((item) => !item.read_at) : all),
    [all, filter],
  );

  const open = (item: Notification) => {
    setSelected(item);
    if (!item.read_at) markRead.mutate(item.id);
  };

  return (
    <Page
      title="Bildirimler"
      summary="Sistemin size söylediği her şey — makine diliyle değil, ne yapmanız gerektiğiyle birlikte."
      actions={
        unreadCount > 0 ? (
          <Button
            size="sm"
            variant="neutral"
            disabled={markAll.isPending}
            onClick={() => markAll.mutate()}
          >
            Tümünü okundu işaretle
          </Button>
        ) : undefined
      }
      guide={
        <>
          <GuideSection title="Ne gösteriyor">
            <p>
              Bot bir pozisyon açtığında ya da kapattığında, bir devre kesici tetiklendiğinde,
              havuz güncellendiğinde ya da veri akışı bozulduğunda buraya bir bildirim düşer.
            </p>
          </GuideSection>
          <GuideSection title="Nasıl okunur">
            <p>
              Her bildirimin başlığı <strong>ne olduğunu</strong> söyler. Tıklayınca{" "}
              <strong>ne anlama geldiği</strong>, ilgili değerler ve gerekiyorsa{" "}
              <strong>ne yapmanız gerektiği</strong> açılır. Ham teknik döküm gösterilmez;
              değerler etiketli alanlar hâlinde durur.
            </p>
            <p>
              Soldaki renkli işaret önem düzeyidir. Kırmızı ve turuncu olanlar müdahale
              gerektirebilir.
            </p>
          </GuideSection>
          <GuideSection title="Ne yapabilirim">
            <p>
              Okunmamışları süzüp yalnızca yenilere bakabilirsiniz. Aynı olayın Discord&apos;a da
              gitmesini isterseniz Entegrasyonlar sayfasından kanal eşlemesi yapın.
            </p>
          </GuideSection>
        </>
      }
    >
      <Segmented
        value={filter}
        onChange={setFilter}
        options={[
          { value: "hepsi", label: "Hepsi", count: all.length },
          { value: "okunmamis", label: "Okunmamış", count: unreadCount },
        ]}
      />

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
              <ul>
                {rows.map((item) => {
                  const human = humanizeNotification(item);
                  const unread = !item.read_at;
                  const tone = SEVERITY_TONE[human.severity];
                  return (
                    <li key={item.id} style={{ borderTop: "1px solid var(--sn-hairline)" }}>
                      <button
                        type="button"
                        onClick={() => open(item)}
                        className={cx(
                          "sn-focus flex w-full gap-3 px-4 py-3 text-left",
                          "transition-colors duration-[var(--sn-dur-1)] hover:bg-[var(--sn-sunken)]",
                        )}
                        style={unread ? { background: "var(--sn-brand-bg)" } : undefined}
                      >
                        <span
                          aria-hidden
                          className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full"
                          style={{
                            background:
                              tone === "down"
                                ? "var(--sn-down)"
                                : tone === "warn"
                                  ? "var(--sn-warn)"
                                  : tone === "up"
                                    ? "var(--sn-up)"
                                    : "var(--sn-idle)",
                          }}
                        />
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
                            {unread && <Tag tone="brand">yeni</Tag>}
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
                          style={{ fontSize: "var(--sn-t-caption)", color: "var(--sn-ink-3)" }}
                        >
                          {relative(item.created_at)}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )
          }
        </Async>
      </Panel>

      <NotificationDrawer notification={selected} onClose={() => setSelected(null)} />
    </Page>
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
            value={notification.read_at ? dateTime(notification.read_at) : "Okunmadı"}
          />
        </div>
      </DrawerSection>
    </Drawer>
  );
}
