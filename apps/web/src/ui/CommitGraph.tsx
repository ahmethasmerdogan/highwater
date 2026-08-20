import { cx } from "./cx";
import { Avatar } from "./Avatar";
import { IArrowRight } from "./icons";

type Commit = {
  msg: string;
  lane: 0 | 1; // 0 = main (blue), 1 = branch
  branch?: "orange" | "red";
  dim?: boolean;
  open?: boolean; // hollow node
  highlight?: boolean;
};

const ROW = 44;
const X0 = 26; // main lane
const X1 = 54; // branch lane

/* Commit history with branch graph + hover card — activity-log-0001 */
export function CommitGraph({
  commits,
  popover,
  className,
}: {
  commits: Commit[];
  popover?: {
    afterIndex: number;
    name: string;
    time: string;
    text: string;
    files: string;
    add: number;
    del: number;
  };
  className?: string;
}) {
  const h = commits.length * ROW;

  // build branch segments: consecutive runs of lane 1 connect off/on main
  const paths: Array<{ d: string; color: string }> = [];
  let run: number[] = [];
  let runColor: "orange" | "red" = "orange";
  const flush = () => {
    if (!run.length) return;
    const first = run[0];
    const last = run[run.length - 1];
    const y = (i: number) => i * ROW + ROW / 2;
    const d = `M ${X0} ${y(first) - ROW} C ${X0} ${y(first) - 10}, ${X1} ${y(first) - ROW + 10}, ${X1} ${y(first)} L ${X1} ${y(last)} C ${X1} ${y(last) + ROW - 10}, ${X0} ${y(last) + 10}, ${X0} ${y(last) + ROW}`;
    paths.push({ d, color: runColor === "orange" ? "#f59e0b" : "#f87171" });
    run = [];
  };
  commits.forEach((c, i) => {
    if (c.lane === 1) {
      if (run.length && c.branch !== runColor) flush();
      runColor = c.branch ?? "orange";
      run.push(i);
    } else flush();
  });
  flush();

  return (
    <div className={cx("relative", className)}>
      <svg
        className="pointer-events-none absolute top-0 left-0"
        width={72}
        height={h}
        viewBox={`0 0 72 ${h}`}
      >
        <line x1={X0} y1={ROW / 2} x2={X0} y2={h - ROW / 2} stroke="#3b82f6" strokeWidth="2" />
        {paths.map((p, i) => (
          <path key={i} d={p.d} fill="none" stroke={p.color} strokeWidth="2" />
        ))}
        {commits.map((c, i) => {
          const cx_ = c.lane === 0 ? X0 : X1;
          const cy = i * ROW + ROW / 2;
          const color = c.lane === 0 ? "#3b82f6" : c.branch === "red" ? "#f87171" : "#f59e0b";
          return c.open ? (
            <circle key={i} cx={cx_} cy={cy} r={6} fill="var(--surface)" stroke={color} strokeWidth="2.5" />
          ) : (
            <g key={i}>
              <circle cx={cx_} cy={cy} r={7.5} fill={color} opacity={0.18} />
              <circle cx={cx_} cy={cy} r={4.5} fill={color} />
            </g>
          );
        })}
      </svg>

      <div className="flex flex-col">
        {commits.map((c, i) => (
          <div
            key={i}
            className={cx(
              "flex items-center rounded-lg pr-3 text-[14.5px]",
              c.highlight && "bg-ink/4 dark:bg-white/6",
            )}
            style={{ height: ROW, paddingLeft: 84 }}
          >
            <span
              className={cx(
                "truncate",
                c.dim ? "text-ink-3" : "font-medium text-ink",
              )}
            >
              {c.msg}
            </span>
          </div>
        ))}
      </div>

      {popover && (
        <div
          className="absolute left-24 z-10 w-80 max-w-[calc(100%-7rem)] rounded-2xl border border-line bg-surface p-4"
          style={{ top: (popover.afterIndex + 1) * ROW - 6 }}
        >
          <div className="flex items-center gap-2.5">
            <Avatar name={popover.name} size="sm" />
            <span className="text-sm font-semibold text-ink">{popover.name}</span>
            <span className="text-xs text-ink-3">{popover.time}</span>
          </div>
          <p className="mt-2.5 text-[13.5px] leading-relaxed text-ink-2">
            {popover.text}
          </p>
          <div className="mt-3 flex items-center gap-3 border-t border-line pt-3 text-[13px]">
            <span className="font-medium text-ink">{popover.files}</span>
            <span className="font-mono font-semibold text-emerald-600 dark:text-emerald-400">
              +{popover.add}
            </span>
            <span className="font-mono font-semibold text-red-500">
              −{popover.del}
            </span>
            <span className="ml-auto flex size-7 items-center justify-center rounded-[8px] border border-line bg-elev text-ink-2 shadow-soft">
              <IArrowRight size={14} />
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
