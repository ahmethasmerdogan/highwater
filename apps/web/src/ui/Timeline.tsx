import type { ReactNode } from "react";
import { cx } from "./cx";
import { StatusPill, type Tone } from "./Badge";
import { ICheck } from "./icons";

export type TimelineStep = {
  title: string;
  desc?: string;
  time?: string;
  state: "done" | "active" | "pending";
  badge?: string;
};

/* Vertical delivery timeline — time-line-001 left card */
export function DeliveryTimeline({
  steps,
  className,
}: {
  steps: TimelineStep[];
  className?: string;
}) {
  return (
    <div className={cx("flex flex-col", className)}>
      {steps.map((s, i) => {
        const last = i === steps.length - 1;
        return (
          <div key={s.title} className="flex gap-3.5">
            <div className="flex flex-col items-center">
              {s.state === "done" ? (
                <span className="z-10 flex size-6 items-center justify-center rounded-full bg-emerald-500 text-white ring-[3px] ring-emerald-500/15">
                  <ICheck size={13} strokeWidth={2.6} />
                </span>
              ) : s.state === "active" ? (
                <span className="z-10 flex size-6 items-center justify-center rounded-full border-2 border-emerald-500 bg-surface">
                  <span
                    className="size-3 rounded-full border-2 border-emerald-500 border-t-transparent"
                    style={{ animation: "hashui-spin 1s linear infinite" }}
                  />
                </span>
              ) : (
                <span className="z-10 flex size-6 items-center justify-center rounded-full border border-line-strong bg-elev text-[11px] font-semibold text-ink-3">
                  {i + 1}
                </span>
              )}
              {!last && (
                <span
                  className={cx(
                    "w-px flex-1",
                    s.state === "done" ? "bg-emerald-500/40" : "bg-line",
                  )}
                />
              )}
            </div>
            <div className={cx("min-w-0 flex-1", !last && "pb-5")}>
              <div className="flex items-center gap-2.5">
                <span
                  className={cx(
                    "text-[13.5px] font-semibold",
                    s.state === "pending" ? "text-ink-3" : "text-ink",
                  )}
                >
                  {s.title}
                </span>
                {s.badge &&
                  (s.state === "done" ? (
                    <StatusPill tone="green" size="sm" icon={<ICheck size={10} strokeWidth={3} />}>
                      {s.badge}
                    </StatusPill>
                  ) : s.state === "active" ? (
                    <StatusPill tone="green" size="sm" dot>
                      {s.badge}
                    </StatusPill>
                  ) : (
                    <StatusPill tone="gray" size="sm">
                      {s.badge}
                    </StatusPill>
                  ))}
                {s.time && (
                  <span className="ml-auto text-xs whitespace-nowrap text-ink-3 tabular-nums">
                    {s.time}
                  </span>
                )}
              </div>
              {s.desc && (
                <p className="mt-1 text-[12.5px] leading-snug text-ink-2">{s.desc}</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export type Stage = {
  icon: ReactNode;
  iconTone: string; // css color for icon tile
  title: string;
  desc: string;
  chip: string;
  chipTone: Tone;
  state?: "default" | "active" | "pending";
  connector?: { label: string; latency?: string };
};

/* Service pipeline — time-line-001 right card */
export function StageFlow({ stages, className }: { stages: Stage[]; className?: string }) {
  return (
    <div className={cx("flex flex-col", className)}>
      {stages.map((s, i) => (
        <div key={s.title}>
          {i > 0 && s.connector && (
            <div className="flex items-center gap-3 py-1.5 pl-[29.5px]">
              <span className="h-6 border-l border-dashed border-line-strong" />
              <span className="microlabel">
                {s.connector.label}
                {s.connector.latency && (
                  <span className="ml-2 font-mono text-[10px] normal-case opacity-80">
                    {s.connector.latency}
                  </span>
                )}
              </span>
            </div>
          )}
          <div
            className={cx(
              "flex items-center gap-3 rounded-xl border px-3.5 py-3",
              s.state === "active"
                ? "border-emerald-500/40 bg-emerald-500/8"
                : s.state === "pending"
                  ? "border-dashed border-line-strong opacity-70"
                  : "border-line bg-surface shadow-soft",
            )}
          >
            <span
              className="flex size-8 shrink-0 items-center justify-center rounded-lg text-white [&>svg]:size-4"
              style={{ background: s.iconTone }}
            >
              {s.icon}
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[13.5px] font-semibold text-ink">{s.title}</div>
              <div className="truncate text-xs text-ink-2">{s.desc}</div>
            </div>
            <StatusPill tone={s.chipTone} size="sm" className="uppercase tracking-[0.05em] !font-semibold">
              {s.chip}
            </StatusPill>
          </div>
        </div>
      ))}
    </div>
  );
}
