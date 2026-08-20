import { useState, type ReactNode } from "react";
import { cx } from "./cx";
import { ICheck } from "./icons";

/* Toggle switch — Remind ref (card-design-0001) */
export function Switch({
  checked,
  onChange,
  size = "md",
  tone = "green",
  className,
}: {
  checked?: boolean;
  onChange?: (v: boolean) => void;
  size?: "sm" | "md";
  tone?: "green" | "ink";
  className?: string;
}) {
  const [internal, setInternal] = useState(checked ?? false);
  const on = checked ?? internal;
  const toggle = () => {
    const v = !on;
    setInternal(v);
    onChange?.(v);
  };
  const dims =
    size === "sm"
      ? { track: "h-5 w-8.5", knob: "size-3.5", shift: "translate-x-3.5" }
      : { track: "h-6 w-10.5", knob: "size-4.5", shift: "translate-x-4.5" };
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={toggle}
      className={cx(
        "inline-flex shrink-0 items-center rounded-full p-[3px] transition-colors duration-200",
        on
          ? tone === "ink"
            ? "bg-ink"
            : "bg-emerald-500"
          : "bg-ink/15 dark:bg-white/15",
        dims.track,
        className,
      )}
    >
      <span
        className={cx(
          "rounded-full bg-white transition-transform duration-200 dark:bg-white",
          dims.knob,
          on && dims.shift,
        )}
      />
    </button>
  );
}

/* Checkbox — schedule rows ref */
export function Checkbox({
  checked,
  onChange,
  tone = "green",
  className,
}: {
  checked?: boolean;
  onChange?: (v: boolean) => void;
  tone?: "green" | "orange" | "blue";
  className?: string;
}) {
  const [internal, setInternal] = useState(checked ?? false);
  const on = checked ?? internal;
  const tones = {
    green: "bg-emerald-500 border-emerald-500",
    orange: "bg-orange-500 border-orange-500",
    blue: "bg-blue-600 border-blue-600",
  };
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={on}
      onClick={() => {
        const v = !on;
        setInternal(v);
        onChange?.(v);
      }}
      className={cx(
        "inline-flex size-[18px] shrink-0 items-center justify-center rounded-md border transition-all duration-150",
        on
          ? cx(tones[tone], "text-white shadow-soft")
          : "border-line-strong bg-surface hover:border-ink-3",
        className,
      )}
    >
      {on && <ICheck size={12} strokeWidth={3} />}
    </button>
  );
}

/* Segmented control — 1D/7D/1M ref (card-design-0001) */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  size = "md",
  className,
}: {
  options: Array<{ value: T; label: ReactNode }>;
  value: T;
  onChange: (v: T) => void;
  size?: "sm" | "md";
  className?: string;
}) {
  return (
    <div
      className={cx(
        "inline-flex items-center rounded-[10px] bg-ink/6 p-0.5 dark:bg-white/8",
        className,
      )}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={cx(
              "inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-all duration-150",
              size === "sm" ? "h-6.5 px-2.5 text-xs" : "h-7.5 px-3.5 text-[13px]",
              active
                ? "bg-surface text-ink border border-line"
                : "text-ink-3 hover:text-ink-2",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/* Search field — sidebar refs */
export function SearchField({
  placeholder = "Search",
  kbd = "⌘K",
  className,
}: {
  placeholder?: string;
  kbd?: string;
  className?: string;
}) {
  return (
    <label
      className={cx(
        "flex h-9 cursor-text items-center gap-2 rounded-[10px] border border-line bg-surface px-3 shadow-soft transition-colors focus-within:border-line-strong",
        className,
      )}
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="shrink-0 text-ink-3">
        <circle cx="11" cy="11" r="7" />
        <path d="m20.2 20.2-3.4-3.4" />
      </svg>
      <input
        placeholder={placeholder}
        className="w-full min-w-0 bg-transparent text-sm text-ink outline-none placeholder:text-ink-3"
      />
      {kbd && (
        <span className="rounded-md border border-line bg-elev px-1.5 py-0.5 text-[10.5px] font-medium whitespace-nowrap text-ink-3">
          {kbd}
        </span>
      )}
    </label>
  );
}
