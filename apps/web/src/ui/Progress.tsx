import { cx } from "./cx";

/* Linear bar — timeline footer ref */
export function ProgressBar({
  value,
  tone = "green",
  className,
}: {
  value: number; // 0-100
  tone?: "green" | "blue" | "orange";
  className?: string;
}) {
  const tones = {
    green: "bg-emerald-500",
    blue: "bg-blue-500",
    orange: "bg-orange-500",
  };
  return (
    <div
      className={cx(
        "h-1.5 w-full overflow-hidden rounded-full bg-ink/8 dark:bg-white/10",
        className,
      )}
    >
      <div
        className={cx("h-full rounded-full transition-all duration-500", tones[tone])}
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  );
}

/* Tick bars — 2/6 Task segments (card-design) & volume bars (datatable-003) */
export function TickBars({
  total,
  filled,
  tone = "green",
  size = "md",
  className,
}: {
  total: number;
  filled: number;
  tone?: "green" | "gray" | "red";
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const dims =
    size === "lg"
      ? "w-[5px] h-5 rounded-[2.5px]"
      : size === "md"
        ? "w-1 h-4 rounded-[2px]"
        : "w-[3px] h-3 rounded-[1.5px]";
  const fill =
    tone === "green"
      ? "bg-emerald-500"
      : tone === "red"
        ? "bg-red-500"
        : "bg-ink-3";
  return (
    <span className={cx("inline-flex items-center gap-[3px]", className)}>
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className={cx(
            dims,
            i < filled ? fill : "bg-ink/12 dark:bg-white/12",
          )}
        />
      ))}
    </span>
  );
}

/* Signal bars — priority indicator (datatable-0001) */
export function SignalBars({
  level,
  tone = "green",
  className,
}: {
  level: 1 | 2 | 3 | 4;
  tone?: "green" | "orange" | "red";
  className?: string;
}) {
  const fill =
    tone === "green"
      ? "bg-emerald-500"
      : tone === "orange"
        ? "bg-orange-500"
        : "bg-red-500";
  return (
    <span className={cx("inline-flex items-end gap-[2.5px]", className)}>
      {[4, 7, 10, 13].map((h, i) => (
        <span
          key={i}
          className={cx(
            "w-[3.5px] rounded-[1.5px]",
            i < level ? fill : "bg-ink/15 dark:bg-white/15",
          )}
          style={{ height: h }}
        />
      ))}
    </span>
  );
}

/* Dense dotted meter — "Total prompts tracking" ref (datatable-003) */
export function DottedMeter({
  value,
  max,
  ticks = 40,
  className,
}: {
  value: number;
  max: number;
  ticks?: number;
  className?: string;
}) {
  const filled = Math.round((value / max) * ticks);
  return (
    <span className={cx("flex items-center gap-[2.5px]", className)}>
      {Array.from({ length: ticks }, (_, i) => (
        <span
          key={i}
          className={cx(
            "h-4 w-[3px] flex-1 rounded-full",
            i < filled ? "bg-emerald-500" : "bg-ink/12 dark:bg-white/12",
          )}
        />
      ))}
    </span>
  );
}

/* Goal bar with scale marks + dashed target — emissions dashboard (ui-design-2) */
export function GoalBar({
  value,
  target,
  marks,
  className,
}: {
  value: number; // 0-100
  target: number; // 0-100
  marks?: number[];
  className?: string;
}) {
  const ms = marks ?? [0, value, target, 100];
  return (
    <div className={cx("w-full", className)}>
      <div className="relative mb-1.5 h-4">
        {ms.map((m) => (
          <span
            key={m}
            className="absolute -translate-x-1/2 font-mono text-[11px] text-ink-3 tabular-nums"
            style={{ left: `${m}%` }}
          >
            {m}%
          </span>
        ))}
      </div>
      <div className="relative h-4 w-full rounded-md bg-ink/8 dark:bg-white/10">
        <div
          className="absolute inset-y-0 left-0 rounded-md rounded-r-none bg-gradient-to-b from-[#23a55b] to-[#188045]"
          style={{ width: `${value}%` }}
        />
        <span
          className="absolute inset-y-0 w-[3px] rounded-full bg-[#0f5c31]"
          style={{ left: `calc(${value}% - 1.5px)` }}
        />
        <span
          className="absolute -inset-y-1 border-l-2 border-dashed border-emerald-700/70 dark:border-emerald-400/60"
          style={{ left: `${target}%` }}
        />
      </div>
    </div>
  );
}

/* Rainbow score meter — red→green tick gradient (Ornek6 credit-score ref) */
export function RainbowMeter({
  ticks = 56,
  className,
}: {
  ticks?: number;
  className?: string;
}) {
  return (
    <span className={cx("flex items-center gap-[3px]", className)}>
      {Array.from({ length: ticks }, (_, i) => (
        <span
          key={i}
          className="h-6 w-[3.5px] flex-1 rounded-full"
          style={{
            background: `hsl(${(i / (ticks - 1)) * 125} 78% 52%)`,
          }}
        />
      ))}
    </span>
  );
}

/* Ring progress — 156/324 radial ref */
export function RingProgress({
  value,
  size = 20,
  stroke = 3,
  tone = "#10b981",
  className,
}: {
  value: number; // 0-1
  size?: number;
  stroke?: number;
  tone?: string;
  className?: string;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className={cx("-rotate-90", className)}
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="currentColor"
        className="text-ink/10 dark:text-white/12"
        strokeWidth={stroke}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={tone}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - Math.min(1, Math.max(0, value)))}
      />
    </svg>
  );
}

/* Striped range bar with event marker — insurance ref (progress-bar-001) */
export function RangeBar({
  startLabel,
  endLabel,
  progress = 0.62,
  markerLabel,
  className,
}: {
  startLabel: string;
  endLabel: string;
  progress?: number;
  markerLabel?: string;
  className?: string;
}) {
  return (
    <div className={cx("relative", className)}>
      {markerLabel && (
        <div
          className="absolute -top-7 text-[13.5px] font-semibold text-red-500"
          style={{ left: `${progress * 100}%`, transform: "translateX(-50%)" }}
        >
          {markerLabel}
        </div>
      )}
      <div className="flex h-11 w-full items-stretch overflow-hidden rounded-xl bg-ink/8 dark:bg-white/10">
        <div
          className="relative flex items-center rounded-r-md px-4 text-[14px] font-semibold text-white"
          style={{
            width: `${progress * 100}%`,
            background:
              "repeating-linear-gradient(115deg,#22b573 0 14px,#2cc282 14px 28px)",
          }}
        >
          {startLabel}
        </div>
        <div className="relative flex flex-1 items-center justify-end px-4 text-[14px] font-medium text-ink-2">
          <span
            className="absolute top-1/2 h-[130%] w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-red-500"
            style={{ left: 0 }}
          />
          {endLabel}
        </div>
      </div>
    </div>
  );
}

/* LCD countdown tiles — dark waitlist ref (button-design-0001.jpeg) */
export function CountdownLCD({
  segments,
  className,
}: {
  segments: Array<{ value: string; label: string }>;
  className?: string;
}) {
  return (
    <div
      className={cx(
        "inline-flex overflow-hidden rounded-[22px] border border-white/10 bg-[#101013] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]",
        className,
      )}
    >
      {segments.map((s, i) => (
        <div
          key={s.label}
          className={cx(
            "flex flex-col items-center gap-1.5 px-9 py-6",
            i > 0 && "border-l border-white/8",
          )}
          style={{
            backgroundImage:
              "repeating-linear-gradient(45deg, rgba(255,255,255,0.016) 0 2px, transparent 2px 4px)",
          }}
        >
          <span className="lcd bg-gradient-to-b from-white via-white to-[#9a9aa2] bg-clip-text text-[44px] leading-none font-bold text-transparent">
            {s.value}
          </span>
          <span className="text-[15px] text-[#8b8b93]">{s.label}</span>
        </div>
      ))}
    </div>
  );
}

/* LCD inline timer — "2h 50m" ref (active-node-0001) */
export function LcdTimer({ value, className }: { value: string; className?: string }) {
  return (
    <span className={cx("inline-flex items-center gap-3", className)}>
      <span className="inline-flex size-11 items-center justify-center rounded-full bg-ink/6 text-ink-2 dark:bg-white/8">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <circle cx="12" cy="12" r="8.5" strokeDasharray="2.5 3.5" />
          <path d="M12 8v4l2.5 1.5" />
        </svg>
      </span>
      <span className="lcd text-[34px] font-bold tracking-[0.1em] text-ink">
        {value}
      </span>
    </span>
  );
}
