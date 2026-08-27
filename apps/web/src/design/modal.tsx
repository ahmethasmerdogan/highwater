"use client";

/**
 * Kalıcı pencere ve onay.
 *
 * Çekmece (`drawer.tsx`) ile ayrımı net: çekmece **okumak** içindir ve
 * arkadaki liste görünür kalır; kalıcı pencere **karar vermek** içindir ve
 * arkayı kapatır. Bir botu durdurmak ya da kullanıcı silmek, yanlışlıkla
 * yapılabilecek bir eylem olmamalıdır.
 */

import { useEffect, type ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Button, IconButton } from "./primitives";
import { IClose } from "./icons";

export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  width = 440,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  width?: number;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay
          className="sn-fade-up fixed inset-0 z-[95]"
          style={{ background: "rgba(6, 8, 11, 0.55)" }}
        />
        <Dialog.Content
          className="sn-fade-up fixed top-1/2 left-1/2 z-[96] max-h-[86vh] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-[var(--sn-r-lg)]"
          style={{
            width: `min(${width}px, calc(100vw - 24px))`,
            background: "var(--sn-panel)",
            boxShadow: "var(--sn-shadow-pop)",
          }}
        >
          <div
            className="flex items-start gap-3 px-4 py-3"
            style={{ borderBottom: "1px solid var(--sn-hairline)" }}
          >
            <div className="min-w-0 flex-1">
              <Dialog.Title
                className="font-medium"
                style={{ fontSize: "var(--sn-t-title)", color: "var(--sn-ink)" }}
              >
                {title}
              </Dialog.Title>
              {description && (
                <Dialog.Description
                  className="mt-1"
                  style={{ fontSize: "var(--sn-t-caption)", color: "var(--sn-ink-3)", lineHeight: 1.5 }}
                >
                  {description}
                </Dialog.Description>
              )}
            </div>
            <Dialog.Close asChild>
              <IconButton label="Kapat">
                <IClose size={15} />
              </IconButton>
            </Dialog.Close>
          </div>

          {children && <div className="sn-scroll max-h-[60vh] overflow-y-auto p-4">{children}</div>}

          {footer && (
            <div
              className="flex justify-end gap-2 px-4 py-3"
              style={{ borderTop: "1px solid var(--sn-hairline)", background: "var(--sn-raised)" }}
            >
              {footer}
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/**
 * Yıkıcı bir eylem için onay.
 *
 * Onay düğmesi **ne yapacağını yazar** ("Botu durdur"), "Tamam" demez:
 * kullanıcı diyalog metnini okumadan tıklarsa bile ne olacağını görür.
 */
export function Confirm({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  onConfirm,
  danger = false,
  busy = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  danger?: boolean;
  busy?: boolean;
}) {
  /* Enter onaylar — ama yalnızca pencere açıkken ve bir alana yazılmıyorken. */
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      /* Odak "Vazgeç" düğmesindeyken Enter onayı ÇALIŞTIRIYORDU — klavye
         kullanıcısı tam tersini yapmak isterken onaylıyordu. Düğme
         üzerindeyken Enter'ı düğmenin kendisine bırak. */
      if (target?.closest("button")) return;
      if (event.key === "Enter" && !busy) onConfirm();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onConfirm]);

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      footer={
        <>
          <Button variant="quiet" onClick={() => onOpenChange(false)} disabled={busy}>
            Vazgeç
          </Button>
          <Button variant={danger ? "danger" : "primary"} onClick={onConfirm} disabled={busy}>
            {busy ? "…" : confirmLabel}
          </Button>
        </>
      }
    />
  );
}
