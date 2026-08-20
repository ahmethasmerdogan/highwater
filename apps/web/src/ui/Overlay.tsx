import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { cx } from "./cx";
import { IChevronDown, IX } from "./icons";

/* ------------------------------------------------------------------ */
/* MODAL — portal dialog with backdrop                                 */
/* ------------------------------------------------------------------ */

export function Modal({
  open,
  onClose,
  children,
  width = "max-w-lg",
  label,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  width?: string;
  label?: string;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    panelRef.current?.querySelector<HTMLElement>("button, [href], input")?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={label}
    >
      <div
        className="absolute inset-0 bg-[#1c1b18]/45 backdrop-blur-[3px] dark:bg-black/60"
        style={{ animation: "hashui-overlay-in 0.2s ease-out" }}
        onClick={onClose}
      />
      {/*
        Yüzey burada verilir. Eskiden her çağıranın kendi kartını sarması
        gerekiyordu ve hiçbiri sarmıyordu: diyaloglar bulanık arka planın
        üzerinde zeminsiz duruyor, metin okunmuyordu.
      */}
      <div
        ref={panelRef}
        className={cx(
          "relative w-full overflow-hidden rounded-2xl border border-line bg-surface shadow-pop",
          width,
        )}
        style={{ animation: "hashui-modal-in 0.22s cubic-bezier(0.2,0.9,0.3,1)" }}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}

/* Convenience header for modal panels */
export function ModalClose({ onClose }: { onClose: () => void }) {
  return (
    <button
      type="button"
      onClick={onClose}
      aria-label="Close"
      className="absolute top-4 right-4 z-10 flex size-7.5 items-center justify-center rounded-full bg-ink/6 text-ink-2 transition-colors hover:bg-ink/10 hover:text-ink dark:bg-white/10 dark:hover:bg-white/16"
    >
      <IX size={14} />
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* DROPDOWN — click-to-open menu                                       */
/* ------------------------------------------------------------------ */

export type MenuEntry =
  | { type?: "item"; label: string; icon?: ReactNode; danger?: boolean; onSelect?: () => void }
  | { type: "divider" }
  | { type: "label"; label: string };

export function Dropdown({
  label,
  icon,
  entries,
  className,
}: {
  label: string;
  icon?: ReactNode;
  entries: MenuEntry[];
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={cx("relative inline-block", className)}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className={cx(
          "flex h-9.5 items-center gap-2 rounded-[10px] border border-line-strong bg-surface px-3.5 text-sm font-medium text-ink shadow-soft transition-colors",
          open ? "bg-elev" : "hover:bg-elev",
        )}
      >
        {icon}
        {label}
        <IChevronDown
          size={13}
          className={cx("text-ink-3 transition-transform", open && "rotate-180")}
        />
      </button>
      {open && (
        <div
          className="absolute top-full left-0 z-40 mt-1.5 w-56 rounded-2xl border border-line bg-surface p-1.5 shadow-pop"
          style={{ animation: "hashui-modal-in 0.16s cubic-bezier(0.2,0.9,0.3,1)" }}
          role="menu"
        >
          {entries.map((e, i) => {
            if (e.type === "divider")
              return (
                <div
                  key={i}
                  className="mx-2 my-1.5 border-t border-dashed border-line-strong"
                />
              );
            if (e.type === "label")
              return (
                <div key={i} className="microlabel px-3 pt-2 pb-1">
                  {e.label}
                </div>
              );
            return (
              <button
                key={i}
                type="button"
                role="menuitem"
                onClick={() => {
                  e.onSelect?.();
                  setOpen(false);
                }}
                className={cx(
                  "flex w-full items-center gap-2.5 rounded-[10px] px-3 py-2 text-left text-[13.5px] font-medium transition-colors",
                  e.danger
                    ? "text-red-600 hover:bg-red-500/8 dark:text-red-400"
                    : "text-ink-2 hover:bg-inset hover:text-ink",
                )}
              >
                <span className={cx("[&>svg]:size-4", e.danger ? "" : "text-ink-3")}>
                  {e.icon}
                </span>
                {e.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
