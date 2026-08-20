import type { ReactNode } from "react";
import { cx } from "./cx";

const palettes = [
  "bg-gradient-to-b from-sky-300 to-blue-500 text-white",
  "bg-gradient-to-b from-emerald-300 to-emerald-600 text-white",
  "bg-gradient-to-b from-amber-300 to-orange-500 text-white",
  "bg-gradient-to-b from-pink-300 to-rose-500 text-white",
  "bg-gradient-to-b from-violet-300 to-purple-600 text-white",
  "bg-gradient-to-b from-stone-300 to-stone-500 text-white",
];

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export type AvatarSize = "xs" | "sm" | "md" | "lg" | "xl";

const sizeCls: Record<AvatarSize, string> = {
  xs: "size-5.5 text-[9px]",
  sm: "size-7 text-[11px]",
  md: "size-9 text-[13px]",
  lg: "size-11 text-[15px]",
  xl: "size-14 text-lg",
};

export function Avatar({
  name,
  emoji,
  size = "md",
  ring,
  status,
  badge,
  tint,
  className,
}: {
  name: string;
  emoji?: string;
  size?: AvatarSize;
  ring?: boolean;
  status?: "online" | "away" | "busy";
  badge?: ReactNode; // small overlay chip at the bottom edge (invite-card ref)
  tint?: "blue" | "green" | "yellow" | "pink";
  className?: string;
}) {
  const initials = name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  const emojiTints = {
    blue: "bg-sky-200/80 dark:bg-sky-300/90",
    green: "bg-emerald-200/80 dark:bg-emerald-300/90",
    yellow: "bg-amber-200/80 dark:bg-amber-300/90",
    pink: "bg-pink-200/80 dark:bg-pink-300/90",
  } as const;
  return (
    <span className={cx("relative inline-flex shrink-0", className)}>
      <span
        className={cx(
          "inline-flex items-center justify-center rounded-full font-semibold select-none",
          sizeCls[size],
          emoji
            ? cx("text-[1.4em]", emojiTints[tint ?? "blue"])
            : palettes[hash(name) % palettes.length],
          ring && "ring-2 ring-surface shadow-soft",
        )}
      >
        {emoji ?? initials}
      </span>
      {status && (
        <span
          className={cx(
            "absolute -right-0 -bottom-0 size-[30%] min-w-2 min-h-2 rounded-full ring-2 ring-surface",
            status === "online" && "bg-emerald-500",
            status === "away" && "bg-amber-400",
            status === "busy" && "bg-red-500",
          )}
        />
      )}
      {badge && (
        <span className="absolute -bottom-1 left-1/2 z-10 flex size-[38%] min-h-3.5 min-w-3.5 -translate-x-1/2 items-center justify-center rounded-full bg-surface shadow-soft ring-1 ring-line">
          {badge}
        </span>
      )}
    </span>
  );
}

export function AvatarGroup({
  people,
  size = "md",
  max = 4,
  className,
}: {
  people: Array<{
    name: string;
    emoji?: string;
    tint?: "blue" | "green" | "yellow" | "pink";
    badge?: ReactNode;
  }>;
  size?: AvatarSize;
  max?: number;
  className?: string;
}) {
  const shown = people.slice(0, max);
  const rest = people.length - shown.length;
  return (
    <span className={cx("inline-flex items-center -space-x-[0.55em]", className)}>
      {shown.map((p) => (
        <Avatar
          key={p.name}
          name={p.name}
          emoji={p.emoji}
          tint={p.tint}
          badge={p.badge}
          size={size}
          ring
        />
      ))}
      {rest > 0 && (
        <span
          className={cx(
            "inline-flex items-center justify-center rounded-full bg-inset font-semibold text-ink-2 ring-2 ring-surface",
            sizeCls[size],
          )}
        >
          +{rest}
        </span>
      )}
    </span>
  );
}

/* company chip — CRM table ref */
export function EntityChip({
  name,
  hue,
  icon,
  className,
}: {
  name: string;
  hue?: string;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 text-[13px] font-medium text-ink",
        className,
      )}
    >
      <span
        className="inline-flex size-4.5 items-center justify-center rounded-[5px] text-[9px] font-bold text-white"
        style={{ background: hue ?? "#57534e" }}
      >
        {icon ?? name[0]}
      </span>
      {name}
    </span>
  );
}
