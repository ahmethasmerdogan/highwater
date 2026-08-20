import { useState, type ReactNode } from "react";
import { cx } from "./cx";

export type TabItem = {
  id: string;
  label: string;
  icon?: ReactNode;
  divider?: boolean; // draw a separator before this item (tabs-design v.2 "UI Kit")
};

/* v.1 — dark pill tabs, active = raised lighter pill with hairline (tabs-design ref) */
export function PillTabs({
  items,
  value,
  onChange,
  accentFirst,
  className,
}: {
  items: TabItem[];
  value?: string;
  onChange?: (id: string) => void;
  accentFirst?: boolean;
  className?: string;
}) {
  const [internal, setInternal] = useState(value ?? items[0]?.id);
  const active = value ?? internal;
  const set = (id: string) => {
    setInternal(id);
    onChange?.(id);
  };
  return (
    <div
      className={cx(
        "inline-flex items-center gap-1 rounded-full border border-white/6 bg-[#141417] p-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]",
        className,
      )}
    >
      {items.map((t, i) => {
        const on = t.id === active;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => set(t.id)}
            className={cx(
              "inline-flex h-11 items-center gap-2.5 rounded-full px-5 text-[15px] font-medium transition-all duration-150",
              on
                ? "border border-white/10 bg-gradient-to-b from-[#2c2c31] to-[#232327] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
                : "text-[#7c7c85] hover:text-[#b0b0b8]",
            )}
          >
            {t.icon && (
              <span
                className={cx(
                  "[&>svg]:size-[18px]",
                  on && accentFirst && i === 0
                    ? "text-emerald-400"
                    : on
                      ? "text-white"
                      : "text-[#63636c]",
                )}
              >
                {t.icon}
              </span>
            )}
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

/* v.2 — browser-notch tabs: active tab rises out of the bar with inverse corners */
export function NotchTabs({
  items,
  value,
  onChange,
  className,
}: {
  items: TabItem[];
  value?: string;
  onChange?: (id: string) => void;
  className?: string;
}) {
  const [internal, setInternal] = useState(value ?? items[1]?.id ?? items[0]?.id);
  const active = value ?? internal;
  const set = (id: string) => {
    setInternal(id);
    onChange?.(id);
  };
  const RISE = 14;
  const R = 14;
  const tabBg = "#2e2e34";
  return (
    <div className={cx("inline-flex items-end", className)} style={{ paddingTop: RISE }}>
      <div className="flex h-16 items-stretch rounded-2xl bg-[#1a1a1e] pr-2 pl-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
        {items.map((t) => {
          const on = t.id === active;
          if (on) {
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => set(t.id)}
                className="relative -mt-3.5 flex items-center gap-2.5 self-stretch rounded-t-[18px] px-7 text-[15px] font-semibold text-white"
                style={{ background: tabBg, height: 64 + RISE }}
              >
                {/* inverse corner fillets where the tab meets the bar's top edge */}
                <span
                  aria-hidden
                  className="pointer-events-none absolute"
                  style={{
                    left: -R,
                    top: RISE - R,
                    width: R,
                    height: R,
                    background: `radial-gradient(circle ${R}px at 0 0, transparent ${R - 0.5}px, ${tabBg} ${R}px)`,
                  }}
                />
                <span
                  aria-hidden
                  className="pointer-events-none absolute"
                  style={{
                    right: -R,
                    top: RISE - R,
                    width: R,
                    height: R,
                    background: `radial-gradient(circle ${R}px at 100% 0, transparent ${R - 0.5}px, ${tabBg} ${R}px)`,
                  }}
                />
                <span className="[&>svg]:size-[18px]">{t.icon}</span>
                {t.label}
              </button>
            );
          }
          return (
            <span key={t.id} className="flex items-center">
              {t.divider && <span className="mx-1 h-8 w-px bg-white/12" />}
              <button
                type="button"
                onClick={() => set(t.id)}
                className="flex h-full items-center gap-2.5 px-6 text-[15px] font-medium text-[#7c7c85] transition-colors hover:text-[#b0b0b8]"
              >
                <span className="text-[#63636c] [&>svg]:size-[18px]">
                  {t.icon}
                </span>
                {t.label}
              </button>
            </span>
          );
        })}
      </div>
    </div>
  );
}

/* v.3 — pill bar with an accent dot indicator on a secondary state */
export function DotTabs({
  items,
  value,
  onChange,
  dotted,
  className,
}: {
  items: TabItem[];
  value?: string;
  onChange?: (id: string) => void;
  dotted?: string; // id that shows the accent-dot state
  className?: string;
}) {
  const [internal, setInternal] = useState(value ?? items[1]?.id ?? items[0]?.id);
  const active = value ?? internal;
  const set = (id: string) => {
    setInternal(id);
    onChange?.(id);
  };
  return (
    <div
      className={cx(
        "inline-flex items-center rounded-full bg-[#151518] p-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]",
        className,
      )}
    >
      {items.map((t) => {
        const on = t.id === active;
        const dot = t.id === dotted && !on;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => set(t.id)}
            className={cx(
              "relative inline-flex h-12 items-center rounded-full px-7 text-[15px] font-medium transition-all duration-150",
              on
                ? "bg-gradient-to-b from-[#2c2c31] to-[#222226] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
                : dot
                  ? "text-emerald-300"
                  : "text-[#7c7c85] hover:text-[#b0b0b8]",
            )}
          >
            {t.label}
            {dot && (
              <span className="absolute bottom-1.5 left-1/2 size-1.5 -translate-x-1/2 rounded-full bg-emerald-400" />
            )}
          </button>
        );
      })}
    </div>
  );
}

/* Underline tabs — Flow view ref (menu-design-001) */
export function UnderlineTabs({
  items,
  value,
  onChange,
  accent = "#f97316",
  className,
}: {
  items: TabItem[];
  value?: string;
  onChange?: (id: string) => void;
  accent?: string;
  className?: string;
}) {
  const [internal, setInternal] = useState(value ?? items[0]?.id);
  const active = value ?? internal;
  const set = (id: string) => {
    setInternal(id);
    onChange?.(id);
  };
  return (
    <div className={cx("scroll-thin flex items-center gap-7 overflow-x-auto border-b border-line", className)}>
      {items.map((t) => {
        const on = t.id === active;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => set(t.id)}
            className={cx(
              "relative -mb-px flex items-center gap-2 border-b-2 pb-3 text-sm font-medium whitespace-nowrap transition-colors",
              on ? "text-ink" : "border-transparent text-ink-3 hover:text-ink-2",
            )}
            style={on ? { borderColor: accent } : undefined}
          >
            <span
              className="[&>svg]:size-4"
              style={on ? { color: accent } : undefined}
            >
              {t.icon}
            </span>
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

/* Light pill nav — Home / My Nodes / Staking ref (active-node-0001) */
export function PillNav({
  items,
  value,
  onChange,
  className,
}: {
  items: TabItem[];
  value?: string;
  onChange?: (id: string) => void;
  className?: string;
}) {
  const [internal, setInternal] = useState(value ?? items[0]?.id);
  const active = value ?? internal;
  const set = (id: string) => {
    setInternal(id);
    onChange?.(id);
  };
  return (
    <div className={cx("inline-flex items-center gap-2.5", className)}>
      {items.map((t) => {
        const on = t.id === active;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => set(t.id)}
            className={cx(
              "inline-flex h-11 items-center gap-2.5 rounded-2xl px-5 text-[15px] font-semibold transition-all duration-150",
              on
                ? "border border-line bg-surface text-ink"
                : "bg-ink/5 text-ink-3 hover:text-ink-2 dark:bg-white/6",
            )}
          >
            <span className="[&>svg]:size-[18px]">{t.icon}</span>
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
