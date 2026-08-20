import type { HTMLAttributes, ReactNode } from "react";
import { cx } from "./cx";

/* Base surface card — white, generous radius, hairline border (no shadow) */
export function Card({
  className,
  floating,
  children,
  ...rest
}: HTMLAttributes<HTMLDivElement> & { floating?: boolean }) {
  return (
    <div
      className={cx(
        "rounded-2xl border border-line bg-surface",
        floating ? "shadow-float" : "shadow-card",
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

/* Inner inset panel — the gray section inside cards (Order Summary ref) */
export function InsetPanel({
  className,
  children,
  ...rest
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cx("rounded-xl bg-elev", className)} {...rest}>
      {children}
    </div>
  );
}

/* Stat tile — icon + value + label (ai-chat ref) */
export function StatTile({
  icon,
  value,
  label,
  mono,
  className,
}: {
  icon?: ReactNode;
  value: ReactNode;
  label: string;
  mono?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cx(
        "flex flex-col items-center gap-1 rounded-xl border border-line bg-surface px-4 py-3.5 text-center shadow-soft",
        className,
      )}
    >
      {icon && (
        <span className="mb-1 inline-flex size-8 items-center justify-center rounded-lg border border-line bg-elev text-ink-2">
          {icon}
        </span>
      )}
      <div
        className={cx(
          "text-[17px] font-semibold text-ink",
          mono && "font-mono tracking-tight",
        )}
      >
        {value}
      </div>
      <div className="text-xs text-ink-2">{label}</div>
    </div>
  );
}

/* Tinted overview tile — "2 COMPLETED" ref (time-line-001) */
export function OverviewTile({
  value,
  label,
  tone = "gray",
  className,
}: {
  value: ReactNode;
  label: string;
  tone?: "green" | "gray";
  className?: string;
}) {
  return (
    <div
      className={cx(
        "flex flex-col items-center gap-0.5 rounded-xl px-4 py-3",
        tone === "green"
          ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
          : "bg-ink/5 text-ink-2 dark:bg-white/6",
        className,
      )}
    >
      <div className="text-lg font-bold tabular-nums">{value}</div>
      <div className="microlabel !text-current opacity-80">{label}</div>
    </div>
  );
}

/* Meta row — icon + label + value (incident card ref, menu-design-001) */
export function MetaRow({
  icon,
  label,
  value,
  className,
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("flex items-center gap-3 py-[7px] text-[13px]", className)}>
      <span className="flex w-24 shrink-0 items-center gap-2 text-ink-3">
        <span className="text-ink-3 [&>svg]:size-4">{icon}</span>
        {label}
      </span>
      <span className="truncate font-medium text-ink">{value}</span>
    </div>
  );
}
