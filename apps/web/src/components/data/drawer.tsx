"use client";

/**
 * Detay çekmecesi — sağdan açılır panel.
 *
 * Modal değil, bilinçli olarak: kullanıcı bir satırın detayına bakarken
 * listeyi kaybetmemeli, bir sonraki satıra geçebilmeli. Bu, tabloyu tarayıp
 * karşılaştırma yapan bir kullanıcı için modalden belirgin biçimde daha iyi.
 */

import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { IX, cx } from "@/ui";

export function Drawer({
  open,
  onClose,
  title,
  subtitle,
  badge,
  children,
  footer,
  width = "max-w-xl",
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  /** Başlığın yanındaki durum rozeti. */
  badge?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  width?: string;
}) {
  /* Esc kapatır; açıkken arka plan kaymaz. */
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[80] flex justify-end">
      <div
        className="fade-in absolute inset-0 bg-black/40"
        onClick={onClose}
        aria-hidden
      />
      <aside
        role="dialog"
        aria-modal="true"
        className={cx(
          "drawer-in relative flex h-full w-full flex-col border-l border-line bg-surface",
          width,
        )}
      >
        <header className="flex items-start gap-3 border-b border-line px-5 py-3.5">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
              {badge}
            </div>
            {subtitle && <div className="mt-0.5 text-[12.5px] text-ink-2">{subtitle}</div>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Kapat"
            className="shrink-0 rounded-lg p-1.5 text-ink-3 hover:bg-inset hover:text-ink"
          >
            <IX size={16} />
          </button>
        </header>

        <div className="thin-scroll flex-1 overflow-y-auto px-5 py-4">{children}</div>

        {footer && (
          <footer className="border-t border-line px-5 py-3">{footer}</footer>
        )}
      </aside>
    </div>,
    document.body,
  );
}

/** Çekmece içindeki adlandırılmış blok. */
export function DrawerSection({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cx("mb-5 last:mb-0", className)}>
      <h3 className="text-[12px] font-semibold tracking-wide text-ink-3 uppercase">
        {title}
      </h3>
      {description && (
        <p className="mt-1 text-[12.5px] leading-relaxed text-ink-2">{description}</p>
      )}
      <div className="mt-2">{children}</div>
    </section>
  );
}
