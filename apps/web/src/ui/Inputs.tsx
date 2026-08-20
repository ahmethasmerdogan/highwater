import { useState, type ReactNode } from "react";
import { cx } from "./cx";
import { ICheck, IChevronDown, IChevronLeft, IChevronRight } from "./icons";

/* ------------------------------------------------------------------ */
/* SLIDER                                                              */
/* ------------------------------------------------------------------ */

export function Slider({
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  suffix,
  className,
}: {
  value?: number;
  onChange?: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  className?: string;
}) {
  const [internal, setInternal] = useState(value ?? 60);
  const v = value ?? internal;
  const pct = ((v - min) / (max - min)) * 100;
  return (
    <div className={cx("flex w-full items-center gap-4", className)}>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={v}
        onChange={(e) => {
          const n = Number(e.target.value);
          setInternal(n);
          onChange?.(n);
        }}
        className="hashui-range w-full"
        style={{
          background: `linear-gradient(to right, #059669 0%, #059669 ${pct}%, var(--line) ${pct}%, var(--line) 100%)`,
        }}
      />
      <span className="w-14 shrink-0 text-right font-mono text-[13px] font-semibold text-ink tabular-nums">
        {v}
        {suffix}
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* RADIO                                                               */
/* ------------------------------------------------------------------ */

export function RadioGroup<T extends string>({
  options,
  value,
  onChange,
  className,
}: {
  options: Array<{ value: T; label: string; desc?: string }>;
  value: T;
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div className={cx("flex flex-col gap-2.5", className)} role="radiogroup">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className="flex items-start gap-3 text-left"
          >
            <span
              className={cx(
                "mt-0.5 flex size-[18px] shrink-0 items-center justify-center rounded-full border transition-all",
                on
                  ? "border-emerald-600 bg-emerald-600"
                  : "border-line-strong bg-surface",
              )}
            >
              {on && <span className="size-1.5 rounded-full bg-white" />}
            </span>
            <span className="leading-tight">
              <span className={cx("block text-[14px]", on ? "font-semibold text-ink" : "font-medium text-ink-2")}>
                {o.label}
              </span>
              {o.desc && (
                <span className="mt-0.5 block text-[12.5px] text-ink-3">
                  {o.desc}
                </span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* Card-style radio — plan picker */
export function RadioCards<T extends string>({
  options,
  value,
  onChange,
  className,
}: {
  options: Array<{ value: T; label: string; desc: string; meta?: string }>;
  value: T;
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div className={cx("grid gap-3 sm:grid-cols-2", className)} role="radiogroup">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={cx(
              "rounded-2xl border-2 p-4 text-left transition-all",
              on
                ? "border-emerald-600 bg-emerald-500/6"
                : "border-line bg-surface hover:border-line-strong",
            )}
          >
            <div className="flex items-center justify-between">
              <span className="text-[14.5px] font-semibold text-ink">
                {o.label}
              </span>
              <span
                className={cx(
                  "flex size-5 items-center justify-center rounded-full border transition-all",
                  on
                    ? "border-emerald-600 bg-emerald-600 text-white"
                    : "border-line-strong",
                )}
              >
                {on && <ICheck size={11} strokeWidth={3.5} />}
              </span>
            </div>
            <div className="mt-1 text-[12.5px] leading-relaxed text-ink-2">
              {o.desc}
            </div>
            {o.meta && (
              <div className="mt-2.5 font-mono text-[13px] font-bold text-ink">
                {o.meta}
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* SELECT — styled native                                              */
/* ------------------------------------------------------------------ */

export function SelectField({
  label,
  options,
  className,
}: {
  label?: string;
  options: string[];
  className?: string;
}) {
  return (
    <label className={cx("block text-left", className)}>
      {label && (
        <span className="mb-1.5 block text-[13px] font-medium text-ink">
          {label}
        </span>
      )}
      <span className="relative block">
        <select className="h-10.5 w-full appearance-none rounded-[10px] border border-line-strong bg-surface px-3.5 pr-9 text-sm text-ink shadow-soft outline-none focus:border-emerald-500 focus:ring-[3px] focus:ring-emerald-500/15">
          {options.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
        <IChevronDown
          size={14}
          className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-ink-3"
        />
      </span>
    </label>
  );
}

/* ------------------------------------------------------------------ */
/* ACCORDION                                                           */
/* ------------------------------------------------------------------ */

export function Accordion({
  items,
  className,
}: {
  items: Array<{ title: string; content: ReactNode }>;
  className?: string;
}) {
  const [openIdx, setOpenIdx] = useState<number | null>(0);
  return (
    <div
      className={cx(
        "w-full divide-y divide-line rounded-2xl border border-line bg-surface shadow-card",
        className,
      )}
    >
      {items.map((it, i) => {
        const open = openIdx === i;
        return (
          <div key={it.title}>
            <button
              type="button"
              aria-expanded={open}
              onClick={() => setOpenIdx(open ? null : i)}
              className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
            >
              <span className="text-[14.5px] font-semibold text-ink">
                {it.title}
              </span>
              <span
                className={cx(
                  "flex size-6.5 shrink-0 items-center justify-center rounded-full border border-line bg-elev text-ink-2 transition-transform duration-200",
                  open && "rotate-180",
                )}
              >
                <IChevronDown size={13} />
              </span>
            </button>
            <div
              className="grid transition-[grid-template-rows] duration-250 ease-out"
              style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
            >
              <div className="min-h-0 overflow-hidden">
                <div className="px-5 pb-4 text-[13.5px] leading-relaxed text-ink-2">
                  {it.content}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* STEPPER — segmented track, label rail underneath                    */
/* ------------------------------------------------------------------ */

export function Stepper({
  steps,
  current,
  className,
}: {
  steps: string[];
  current: number; // index of active step
  className?: string;
}) {
  const pct = Math.round(((current + 1) / steps.length) * 100);
  return (
    <div className={cx("w-full", className)}>
      <div className="mb-3 flex items-baseline gap-2.5">
        <span className="rounded-full bg-ink px-2.5 py-1 font-mono text-[11px] font-medium text-canvas tabular-nums">
          {current + 1}/{steps.length}
        </span>
        <span className="text-[15px] font-semibold text-ink">
          {steps[current]}
        </span>
        <span className="ml-auto font-mono text-[11.5px] text-ink-3 tabular-nums">
          {pct}%
        </span>
      </div>

      {/* segmented track */}
      <div className="flex gap-1">
        {steps.map((s, i) => (
          <span
            key={s}
            className={cx(
              "h-1.5 flex-1 rounded-full transition-colors duration-300",
              i < current && "bg-brand",
              i === current && "bg-brand/45",
              i > current && "bg-line",
            )}
          />
        ))}
      </div>

      {/* label rail */}
      <div className="mt-2.5 flex gap-1">
        {steps.map((s, i) => {
          const done = i < current;
          const active = i === current;
          return (
            <span
              key={s}
              className={cx(
                "flex flex-1 items-center gap-1.5 text-[11.5px] leading-tight",
                active
                  ? "font-semibold text-ink"
                  : done
                    ? "font-medium text-ink-2"
                    : "text-ink-3",
              )}
            >
              {done && (
                <ICheck size={11} strokeWidth={3} className="shrink-0 text-brand" />
              )}
              <span className="truncate">{s}</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* PAGINATION                                                          */
/* ------------------------------------------------------------------ */

export function Pagination({
  pages,
  value,
  onChange,
  className,
}: {
  pages: number;
  value: number; // 1-based
  onChange: (p: number) => void;
  className?: string;
}) {
  const items: Array<number | "…"> = [];
  for (let p = 1; p <= pages; p++) {
    if (p === 1 || p === pages || Math.abs(p - value) <= 1) items.push(p);
    else if (items[items.length - 1] !== "…") items.push("…");
  }
  const btn =
    "flex size-9 items-center justify-center rounded-[10px] text-[13.5px] font-medium transition-colors";
  return (
    <nav className={cx("flex items-center gap-1.5", className)} aria-label="Pagination">
      <button
        type="button"
        aria-label="Previous page"
        disabled={value === 1}
        onClick={() => onChange(value - 1)}
        className={cx(btn, "border border-line bg-surface text-ink-2 shadow-soft hover:bg-elev disabled:opacity-40")}
      >
        <IChevronLeft size={14} />
      </button>
      {items.map((it, i) =>
        it === "…" ? (
          <span key={`e${i}`} className="px-1 text-ink-3">
            …
          </span>
        ) : (
          <button
            key={it}
            type="button"
            aria-current={it === value ? "page" : undefined}
            onClick={() => onChange(it)}
            className={cx(
              btn,
              it === value
                ? "bg-[#1c1b18] font-semibold text-white shadow-btn dark:bg-white dark:text-[#1c1b18]"
                : "text-ink-2 hover:bg-inset hover:text-ink",
            )}
          >
            {it}
          </button>
        ),
      )}
      <button
        type="button"
        aria-label="Next page"
        disabled={value === pages}
        onClick={() => onChange(value + 1)}
        className={cx(btn, "border border-line bg-surface text-ink-2 shadow-soft hover:bg-elev disabled:opacity-40")}
      >
        <IChevronRight size={14} />
      </button>
    </nav>
  );
}

/* ------------------------------------------------------------------ */
/* BREADCRUMBS                                                         */
/* ------------------------------------------------------------------ */

export function Breadcrumbs({
  items,
  className,
}: {
  items: Array<{ label: ReactNode; href?: string }>;
  className?: string;
}) {
  return (
    <nav className={cx("flex items-center gap-1.5 text-[13.5px]", className)} aria-label="Breadcrumb">
      {items.map((it, i) => {
        const last = i === items.length - 1;
        return (
          <span key={i} className="flex items-center gap-1.5">
            {i > 0 && <IChevronRight size={12} className="text-ink-3" />}
            {last ? (
              <span className="font-semibold text-ink">{it.label}</span>
            ) : (
              <a
                href={it.href ?? "#"}
                className="font-medium text-ink-3 transition-colors hover:text-ink"
              >
                {it.label}
              </a>
            )}
          </span>
        );
      })}
    </nav>
  );
}
