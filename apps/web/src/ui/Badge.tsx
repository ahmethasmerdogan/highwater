import type { ReactNode } from "react";
import { cx } from "./cx";

export type Tone =
  | "green"
  | "amber"
  | "red"
  | "blue"
  | "orange"
  | "pink"
  | "violet"
  | "gray";

/* soft tinted status pills — CRM table / order refs */
const softTones: Record<Tone, string> = {
  green: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300",
  amber: "bg-amber-400/18 text-amber-700 dark:text-amber-300",
  red: "bg-red-500/12 text-red-600 dark:text-red-300",
  blue: "bg-blue-500/12 text-blue-600 dark:text-blue-300",
  orange: "bg-orange-500/14 text-orange-600 dark:text-orange-300",
  pink: "bg-pink-500/12 text-pink-600 dark:text-pink-300",
  violet: "bg-violet-500/12 text-violet-600 dark:text-violet-300",
  gray: "bg-ink/6 text-ink-2 dark:bg-white/8",
};

const dotTones: Record<Tone, string> = {
  green: "bg-emerald-500",
  amber: "bg-amber-500",
  red: "bg-red-500",
  blue: "bg-blue-500",
  orange: "bg-orange-500",
  pink: "bg-pink-500",
  violet: "bg-violet-500",
  gray: "bg-ink-3",
};

export function StatusPill({
  tone = "gray",
  dot,
  icon,
  children,
  className,
  size = "md",
}: {
  tone?: Tone;
  dot?: boolean;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
  size?: "sm" | "md";
}) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 rounded-full font-medium whitespace-nowrap",
        size === "sm" ? "h-5.5 px-2 text-[11px]" : "h-6.5 px-2.5 text-xs",
        softTones[tone],
        className,
      )}
    >
      {dot && <span className={cx("size-1.5 rounded-full", dotTones[tone])} />}
      {icon}
      {children}
    </span>
  );
}

/* bordered pill with a leading dot — Department cells in ui-design-4 */
export function DotPill({
  tone = "green",
  children,
  dim,
  className,
}: {
  tone?: Tone;
  children: ReactNode;
  dim?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cx(
        "inline-flex h-7 items-center gap-2 rounded-full border border-line bg-surface px-3 text-[12.5px] font-medium whitespace-nowrap text-ink",
        dim && "opacity-55",
        className,
      )}
    >
      <span className={cx("size-2 rounded-full", dotTones[tone])} />
      {children}
    </span>
  );
}

/* outlined badge — PRIORITY ref (card-design-0001) */
export function OutlineBadge({
  tone = "green",
  children,
  className,
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
}) {
  const tones: Record<Tone, string> = {
    green:
      "border-emerald-500/40 text-emerald-700 bg-emerald-500/6 dark:text-emerald-300",
    amber: "border-amber-500/40 text-amber-700 bg-amber-500/6 dark:text-amber-300",
    red: "border-red-500/40 text-red-600 bg-red-500/6 dark:text-red-300",
    blue: "border-blue-500/40 text-blue-600 bg-blue-500/6 dark:text-blue-300",
    orange:
      "border-orange-500/40 text-orange-600 bg-orange-500/6 dark:text-orange-300",
    pink: "border-pink-500/40 text-pink-600 bg-pink-500/6 dark:text-pink-300",
    violet:
      "border-violet-500/40 text-violet-600 bg-violet-500/6 dark:text-violet-300",
    gray: "border-line-strong text-ink-2 bg-transparent",
  };
  return (
    <span
      className={cx(
        "inline-flex h-6.5 items-center rounded-full border px-2.5 text-[11px] font-semibold tracking-[0.06em] uppercase",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/* flat state pill — "Offline" (active-node-0001), glow removed */
export function GlowPill({
  tone = "red",
  children,
  className,
}: {
  tone?: "red" | "green";
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cx(
        "inline-flex h-7 items-center rounded-full px-3.5 text-[13px] font-semibold",
        tone === "red"
          ? "bg-red-500/12 text-red-500"
          : "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400",
        className,
      )}
    >
      {children}
    </span>
  );
}

/* state dot with a soft halo ring (flat, no glow) */
export function GlowDot({
  tone = "red",
  className,
}: {
  tone?: "red" | "green";
  className?: string;
}) {
  return (
    <span
      className={cx(
        "inline-flex size-4 items-center justify-center rounded-full",
        tone === "red" ? "bg-red-500/15" : "bg-emerald-500/15",
        className,
      )}
    >
      <span
        className={cx(
          "size-2 rounded-full",
          tone === "red" ? "bg-red-500" : "bg-emerald-500",
        )}
      />
    </span>
  );
}

/* Animated announcement pill — "New · Real Time Analytics" (alert-0002).
   The chip runs a looping gradient; a light sweep crosses the whole pill. */
export function AnnouncementPill({
  chip = "New",
  children,
  gradient = "solid",
  className,
}: {
  chip?: string;
  children: ReactNode;
  gradient?: "solid" | "sheen";
  className?: string;
}) {
  return (
    <span
      className={cx(
        "relative inline-flex items-center gap-3 overflow-hidden rounded-full bg-[#0d0d0f] py-1.5 pr-4 pl-1.5 text-[15px] font-medium text-white",
        className,
      )}
    >
      <span
        className="inline-flex h-7 items-center rounded-full px-3 text-sm font-semibold text-white"
        style={{
          backgroundImage:
            gradient === "solid"
              ? "linear-gradient(100deg,#f0338d,#e935c9,#8b3af5,#e935c9,#f0338d)"
              : "linear-gradient(115deg,#ff2fb4,#ff8ee0,#ffffff,#ff5ecf,#e935c9,#ff2fb4)",
          backgroundSize: "300% 100%",
          animation: "hashui-gradient-x 4.5s ease-in-out infinite",
        }}
      >
        {chip}
      </span>
      <span className="relative z-10">{children}</span>
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-1/4 bg-gradient-to-r from-transparent via-white/12 to-transparent"
        style={{ animation: "hashui-shine 4.5s ease-in-out infinite" }}
      />
    </span>
  );
}

/* small count badge — Filter ³ ref (datatable-0001) */
export function CountBadge({
  tone = "orange",
  children,
}: {
  tone?: "orange" | "red" | "gray" | "green";
  children: ReactNode;
}) {
  const tones = {
    orange: "bg-orange-500/15 text-orange-600 dark:text-orange-300",
    red: "bg-red-500 text-white",
    green: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
    gray: "bg-ink/8 text-ink-2 dark:bg-white/10",
  } as const;
  return (
    <span
      className={cx(
        "inline-flex size-4.5 items-center justify-center rounded-full text-[10.5px] font-bold tabular-nums",
        tones[tone],
      )}
    >
      {children}
    </span>
  );
}

/* keyboard hint — command palette ref (chat-log-001) */
export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <kbd
      className={cx(
        "inline-flex h-6 min-w-6 items-center justify-center rounded-[8px] border border-line bg-elev px-1.5 font-sans text-[11.5px] font-medium text-ink-2",
        className,
      )}
    >
      {children}
    </kbd>
  );
}
