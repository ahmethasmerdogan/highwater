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
import { Button, StatusPill, cx } from "@/ui";
import { api, type Notification } from "@/lib/api";
import { toast } from "@/lib/toast";
import {
  CATEGORY_LABEL,
  SEVERITY_LABEL,
  humanizeNotification,
  payloadFields,
  type Severity,
} from "@/lib/humanize";
import { Page, Section, Async, Empty } from "@/components/common/page";
import { Explain, Field, RichText } from "@/components/common/explain";
import { Drawer, DrawerSection } from "@/components/data/drawer";
import { dateTime, relative } from "@/lib/format";

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
    onError: (e: Error) => toast.error("İşaretlenemedi", e.message),
  });

  // `useMemo` bağımlılığı olarak kullanılıyor; her çizimde yeni dizi
  // üretmemesi için sabitleniyor.
  const all = useMemo(() => query.data ?? [], [query.data]);
  const unreadCount = all.filter((n) => !n.read_at).length;
  const rows = useMemo(
    () => (filter === "okunmamis" ? all.filter((n) => !n.read_at) : all),
    [all, filter],
  );

  const open = (n: Notification) => {
    setSelected(n);
    if (!n.read_at) markRead.mutate(n.id);
  };

  return (
    <Page
      title="Bildirimler"
      description="Sistemin size söylediği her şey — makine diliyle değil, ne yapmanız gerektiğiyle birlikte."
      intro={{
        storageKey: "bildirimler",
        what: "Bot bir pozisyon açtığında ya da kapattığında, bir devre kesici tetiklendiğinde, havuz güncellendiğinde ya da veri akışı bozulduğunda buraya bir bildirim düşer.",
        how: "Her bildirimin başlığı **ne olduğunu** söyler. Tıklayınca **ne anlama geldiği**, ilgili değerler ve gerekiyorsa **ne yapmanız gerektiği** açılır. Ham teknik döküm gösterilmez; değerler etiketli alanlar hâlinde durur.\n\nSoldaki renkli işaret önem düzeyidir. Kırmızı ve turuncu olanlar müdahale gerektirebilir.",
        action: "Okunmamışları süzüp yalnızca yenilere bakabilirsiniz. Aynı olayın Discord'a da gitmesini isterseniz **Entegrasyonlar** sayfasından kanal eşlemesi yapın.",
        terms: ["devre_kesici", "cikis_sebebi", "havuz", "kagit_uzeri"],
      }}
      actions={
        unreadCount > 0 && (
          <Button
            size="sm"
            variant="outline"
            shape="rect"
            disabled={markAll.isPending}
            onClick={() => markAll.mutate()}
          >
            Tümünü okundu işaretle
          </Button>
        )
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        <FilterButton active={filter === "hepsi"} onClick={() => setFilter("hepsi")}>
          Hepsi <span className="num opacity-60">{all.length}</span>
        </FilterButton>
        <FilterButton active={filter === "okunmamis"} onClick={() => setFilter("okunmamis")}>
          Okunmamış <span className="num opacity-60">{unreadCount}</span>
        </FilterButton>
      </div>

      <Section padded={false}>
        <Async
          query={query}
          empty={{
            title: "Bildirim yok",
            description:
              "Sistem çalışmaya başladığında pozisyon açılışları, devre kesiciler ve havuz güncellemeleri burada görünecek.",
          }}
        >
          {() =>
            rows.length === 0 ? (
              <Empty
                title="Okunmamış bildirim yok"
                description="Hepsini okumuşsunuz. Tümünü görmek için süzgeci değiştirin."
                className="m-4 border-0"
              />
            ) : (
              <ul className="divide-y divide-line">
                {rows.map((n) => {
                  const h = humanizeNotification(n);
                  const unread = !n.read_at;
                  return (
                    <li key={n.id}>
                      <button
                        type="button"
                        onClick={() => open(n)}
                        className={cx(
                          "flex w-full gap-3 px-5 py-3 text-left transition-colors hover:bg-inset",
                          unread && "bg-brand-soft/30",
                        )}
                      >
                        <span
                          aria-hidden
                          className={cx(
                            "mt-1.5 size-2 shrink-0 rounded-full",
                            h.severity === "error"
                              ? "bg-down"
                              : h.severity === "warn"
                                ? "bg-warn"
                                : h.severity === "success"
                                  ? "bg-up"
                                  : "bg-ink-3",
                          )}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-2">
                            <span
                              className={cx(
                                "text-[13.5px] text-ink",
                                unread && "font-medium",
                              )}
                            >
                              {h.title}
                            </span>
                            <span className="text-[11px] text-ink-3">
                              {CATEGORY_LABEL[h.category]}
                            </span>
                            {unread && (
                              <span className="rounded bg-brand-soft px-1.5 text-[10px] font-medium text-brand">
                                yeni
                              </span>
                            )}
                          </span>
                          <span className="mt-0.5 block line-clamp-2 text-[12.5px] leading-snug text-ink-2">
                            {n.body || h.detail || "—"}
                          </span>
                        </span>
                        <span className="shrink-0 text-right text-[11.5px] whitespace-nowrap text-ink-3">
                          {relative(n.created_at)}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )
          }
        </Async>
      </Section>

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

  const h = humanizeNotification(notification);
  const fields = payloadFields(notification.payload);

  return (
    <Drawer
      open
      onClose={onClose}
      title={h.title}
      subtitle={`${dateTime(notification.created_at)} · ${relative(notification.created_at)}`}
      badge={<SeverityPill severity={h.severity} />}
    >
      <DrawerSection title="Ne oldu">
        <div className="rounded-lg border border-line bg-elev px-3.5 py-3">
          <RichText text={notification.body || h.detail || "—"} className="text-[13px]" />
        </div>
      </DrawerSection>

      {h.detail && notification.body && h.detail !== notification.body && (
        <DrawerSection title="Ne anlama geliyor">
          <RichText text={h.detail} className="text-[13px]" />
        </DrawerSection>
      )}

      {h.action && (
        <DrawerSection title="Ne yapmalı">
          <p className="border-l-2 border-brand pl-3 text-[13px] leading-relaxed text-ink-2">
            {h.action}
          </p>
        </DrawerSection>
      )}

      {fields.length > 0 && (
        <DrawerSection
          title="İlgili değerler"
          description="Bildirimle birlikte kaydedilen bilgiler."
        >
          <div className="divide-y divide-line rounded-lg border border-line px-3.5">
            {fields.map((f) => (
              <Field
                key={f.key}
                label={f.label}
                term={f.term}
                value={<span className="font-mono text-[12.5px]">{f.value}</span>}
              />
            ))}
          </div>
        </DrawerSection>
      )}

      {h.term && (
        <DrawerSection title="İlgili kavram">
          <div className="rounded-lg border border-line bg-elev px-3.5 py-3">
            <Explain id={h.term} />
          </div>
        </DrawerSection>
      )}

      <DrawerSection title="Künye">
        <div className="divide-y divide-line rounded-lg border border-line px-3.5">
          <Field
            label="Olay kodu"
            hint="Motorun kullandığı makine kodu. Bir kaydı geliştiriciyle konuşurken bunu verin."
            value={<span className="font-mono text-[12px]">{notification.kind}</span>}
          />
          <Field label="Kategori" value={CATEGORY_LABEL[h.category]} />
          <Field label="Önem" value={SEVERITY_LABEL[h.severity]} />
          <Field
            label="Okunma"
            value={notification.read_at ? dateTime(notification.read_at) : "Okunmadı"}
          />
        </div>
      </DrawerSection>
    </Drawer>
  );
}

function SeverityPill({ severity }: { severity: Severity }) {
  const tone =
    severity === "error"
      ? "red"
      : severity === "warn"
        ? "orange"
        : severity === "success"
          ? "green"
          : "gray";
  return (
    <StatusPill size="sm" tone={tone}>
      {SEVERITY_LABEL[severity]}
    </StatusPill>
  );
}

function FilterButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12.5px] transition-colors",
        active
          ? "border-brand bg-brand-soft font-medium text-brand"
          : "border-line text-ink-2 hover:border-line-strong hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}
