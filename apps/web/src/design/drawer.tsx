"use client";

/**
 * Sağdan açılan detay çekmecesi.
 *
 * Satıra tıklayınca ayrıntı **aynı sayfada** açılır. Ayrı bir sayfaya
 * gitmek listedeki yeri kaybettirir: kullanıcı geri döndüğünde kaydırma
 * konumu, sıralama ve arama sıfırlanmış olur.
 *
 * Modal değil: arkadaki liste görünür ve kaydırılabilir kalır, böylece
 * iki satırı arka arkaya karşılaştırmak mümkün olur.
 */

import { useRef, useEffect, type ReactNode } from "react";
import { IClose } from "./icons";
import { IconButton } from "./primitives";

export function Drawer({
  open,
  onClose,
  title,
  subtitle,
  badge,
  children,
  footer,
  width = 460,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  /** Başlığın yanındaki rozet — önem düzeyi, durum vb. */
  badge?: ReactNode;
  children: ReactNode;
  /** Sabit alt şerit — kaydetme/vazgeçme gibi eylemler kaydırmayla kaybolmaz. */
  footer?: ReactNode;
  width?: number;
}) {
  /* Esc her yerde kapatır. */
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  /* Açılışta odak çekmeceye taşınır; yoksa klavye odağı arkadaki tabloda
     kalıyor ve ekran okuyucu çekmecenin açıldığını duymuyordu. */
  const rootRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (open) rootRef.current?.focus();
  }, [open]);

  if (!open) return null;

  return (
    <aside
      ref={rootRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label={typeof title === "string" ? title : "Ayrıntı"}
      className="sn-slide-in fixed top-0 right-0 z-[80] flex h-screen flex-col"
      style={{
        width: `min(${width}px, 100vw)`,
        background: "var(--sn-panel)",
        borderLeft: "1px solid var(--sn-border)",
        boxShadow: "var(--sn-shadow-pop)",
      }}
    >
      <header
        className="flex h-12 shrink-0 items-center gap-3 px-4"
        style={{ borderBottom: "1px solid var(--sn-hairline)" }}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              className="truncate font-medium"
              style={{ fontSize: "var(--sn-t-body-lg)", color: "var(--sn-ink)" }}
            >
              {title}
            </span>
            {badge}
          </div>
          {subtitle && (
            <div className="truncate" style={{ fontSize: "var(--sn-t-caption)", color: "var(--sn-ink-3)" }}>
              {subtitle}
            </div>
          )}
        </div>
        <IconButton label="Kapat" onClick={onClose}>
          <IClose size={15} />
        </IconButton>
      </header>
      <div className="sn-scroll flex-1 overflow-y-auto p-4">{children}</div>

      {footer && (
        <div
          className="flex shrink-0 justify-end gap-2 px-4 py-3"
          style={{ borderTop: "1px solid var(--sn-hairline)", background: "var(--sn-raised)" }}
        >
          {footer}
        </div>
      )}
    </aside>
  );
}

/** Çekmece içinde bir bölüm: başlık + içerik. */
export function DrawerSection({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <section className="mt-5 first:mt-0">
      <h3 className="sn-label">{title}</h3>
      {hint && (
        <p className="mt-1" style={{ fontSize: "var(--sn-t-caption)", color: "var(--sn-ink-3)", lineHeight: 1.5 }}>
          {hint}
        </p>
      )}
      <div className="mt-2">{children}</div>
    </section>
  );
}

/** Etiket/değer çifti listesi — çekmecenin iş atı. */
export function KeyValue({ rows }: { rows: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="flex flex-col">
      {rows.map((row) => (
        <div
          key={row.label}
          className="flex items-center justify-between gap-4 py-1.5"
          style={{ borderBottom: "1px solid var(--sn-hairline)" }}
        >
          <dt style={{ fontSize: "var(--sn-t-caption)", color: "var(--sn-ink-3)" }}>{row.label}</dt>
          <dd className="text-right" style={{ fontSize: "var(--sn-t-body)", color: "var(--sn-ink)" }}>
            {row.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
