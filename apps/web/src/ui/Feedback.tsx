import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { cx } from "./cx";
import { ICheckCircleFill, IInfo, IWarning, IX } from "./icons";

/* ------------------------------------------------------------------ */
/* ALERT — inline banner                                               */
/* ------------------------------------------------------------------ */

export type AlertTone = "info" | "success" | "warning" | "danger";

const alertTones: Record<
  AlertTone,
  { box: string; icon: string; glyph: ReactNode }
> = {
  info: {
    box: "border-blue-500/25 bg-blue-500/8",
    icon: "text-blue-600 dark:text-blue-400",
    glyph: <IInfo size={16} />,
  },
  success: {
    box: "border-emerald-500/25 bg-emerald-500/8",
    icon: "text-emerald-600 dark:text-emerald-400",
    glyph: <ICheckCircleFill size={16} />,
  },
  warning: {
    box: "border-amber-500/30 bg-amber-400/10",
    icon: "text-amber-600 dark:text-amber-400",
    glyph: <IWarning size={16} />,
  },
  danger: {
    box: "border-red-500/25 bg-red-500/8",
    icon: "text-red-600 dark:text-red-400",
    glyph: <IWarning size={16} />,
  },
};

export function Alert({
  tone = "info",
  title,
  children,
  action,
  onClose,
  className,
}: {
  tone?: AlertTone;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  onClose?: () => void;
  className?: string;
}) {
  const t = alertTones[tone];
  return (
    <div
      role="alert"
      className={cx(
        "flex w-full items-start gap-3 rounded-xl border px-4 py-3.5",
        t.box,
        className,
      )}
    >
      <span className={cx("mt-px shrink-0", t.icon)}>{t.glyph}</span>
      <div className="min-w-0 flex-1">
        <div className="text-[13.5px] font-semibold text-ink">{title}</div>
        {children && (
          <div className="mt-0.5 text-[13px] leading-relaxed text-ink-2">
            {children}
          </div>
        )}
        {action && <div className="mt-2">{action}</div>}
      </div>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label="Dismiss"
          className="shrink-0 rounded-md p-1 text-ink-3 transition-colors hover:bg-ink/6 hover:text-ink dark:hover:bg-white/10"
        >
          <IX size={13} />
        </button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* TOAST — provider + hook + viewport                                  */
/* ------------------------------------------------------------------ */

export type ToastInput = {
  tone?: AlertTone;
  title: string;
  desc?: string;
  duration?: number;
};

type ToastItem = ToastInput & { id: number };

const ToastCtx = createContext<{ push: (t: ToastInput) => void }>({
  push: () => {},
});

export function useToast() {
  return useContext(ToastCtx);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((ts) => ts.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (t: ToastInput) => {
      const id = nextId.current++;
      setToasts((ts) => [...ts.slice(-3), { ...t, id }]);
      window.setTimeout(() => dismiss(id), t.duration ?? 4500);
    },
    [dismiss],
  );

  return (
    <ToastCtx.Provider value={{ push }}>
      {children}
      <div className="pointer-events-none fixed right-4 bottom-[4.5rem] z-[95] flex w-[340px] max-w-[calc(100vw-2rem)] flex-col gap-2.5">
        {toasts.map((t) => {
          const tone = alertTones[t.tone ?? "info"];
          return (
            <div
              key={t.id}
              className="pointer-events-auto flex items-start gap-3 rounded-2xl border border-line bg-surface px-4 py-3.5 shadow-pop"
              style={{ animation: "hashui-toast-in 0.25s cubic-bezier(0.2,0.9,0.3,1)" }}
            >
              <span className={cx("mt-px shrink-0", tone.icon)}>{tone.glyph}</span>
              <div className="min-w-0 flex-1">
                <div className="text-[13.5px] font-semibold text-ink">
                  {t.title}
                </div>
                {t.desc && (
                  <div className="mt-0.5 text-[12.5px] text-ink-2">{t.desc}</div>
                )}
              </div>
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                aria-label="Dismiss"
                className="shrink-0 rounded-md p-1 text-ink-3 transition-colors hover:bg-ink/6 hover:text-ink dark:hover:bg-white/10"
              >
                <IX size={13} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastCtx.Provider>
  );
}

/* ------------------------------------------------------------------ */
/* TOOLTIP                                                             */
/* ------------------------------------------------------------------ */

export function Tooltip({
  label,
  children,
  className,
  side = "top",
}: {
  label: string;
  children: ReactNode;
  className?: string;
  /**
   * Hangi tarafa açılacağı. Varsayılan üst; ama tetikleyici ekranın en
   * üstündeyse (üst çubuk) balon `overflow-hidden` kabuk tarafından kırpılır
   * ve hiç görünmez — orada `side="bottom"` verilir.
   */
  side?: "top" | "bottom";
}) {
  const top = side === "top";
  return (
    <span className={cx("group/tip relative inline-flex", className)}>
      {children}
      <span
        role="tooltip"
        className={cx(
          "pointer-events-none absolute left-1/2 z-50 -translate-x-1/2 scale-95 rounded-lg bg-[#1c1b18] px-2.5 py-1.5 text-[12px] font-medium whitespace-nowrap text-white opacity-0 shadow-pop transition-all delay-75 duration-150 group-hover/tip:scale-100 group-hover/tip:opacity-100 group-focus-within/tip:scale-100 group-focus-within/tip:opacity-100 dark:bg-white dark:text-[#1c1b18]",
          top ? "bottom-full mb-2" : "top-full mt-2",
        )}
      >
        {label}
        <span
          className={cx(
            "absolute left-1/2 size-2 -translate-x-1/2 rotate-45 bg-[#1c1b18] dark:bg-white",
            top ? "top-full -mt-1" : "bottom-full -mb-1",
          )}
        />
      </span>
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* SKELETON                                                            */
/* ------------------------------------------------------------------ */

export function Skeleton({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cx("block rounded-lg", className)}
      style={{
        background:
          "linear-gradient(100deg, var(--inset) 40%, var(--line) 50%, var(--inset) 60%)",
        backgroundSize: "200% 100%",
        animation: "hashui-shimmer 1.6s linear infinite",
      }}
    />
  );
}

/* ------------------------------------------------------------------ */
/* EMPTY STATE                                                         */
/* ------------------------------------------------------------------ */

export function EmptyState({
  icon,
  title,
  desc,
  action,
  className,
}: {
  icon: ReactNode;
  title: string;
  desc?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cx(
        "flex w-full flex-col items-center justify-center rounded-2xl border border-dashed border-line-strong px-6 py-10 text-center",
        className,
      )}
    >
      <span className="flex size-12 items-center justify-center rounded-[15px] border border-line bg-gradient-to-b from-surface to-elev text-ink-2 shadow-soft [&>svg]:size-5">
        {icon}
      </span>
      <div className="mt-4 text-[15px] font-semibold text-ink">{title}</div>
      {desc && (
        <p className="mt-1.5 max-w-60 text-[13px] leading-relaxed text-ink-3">
          {desc}
        </p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
