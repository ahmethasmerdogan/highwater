import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { cx } from "./cx";

/* ------------------------------------------------------------------ */
/* useInView — shared intersection helper                              */
/* ------------------------------------------------------------------ */

function useInView<T extends HTMLElement>(threshold = 0.3) {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => e.isIntersecting && setInView(true),
      { threshold },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);
  return { ref, inView };
}

/* ------------------------------------------------------------------ */
/* NUMBER TICKER — counts up when scrolled into view                   */
/* ------------------------------------------------------------------ */

export function NumberTicker({
  value,
  duration = 1400,
  prefix = "",
  suffix = "",
  decimals = 0,
  className,
}: {
  value: number;
  duration?: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  className?: string;
}) {
  const { ref, inView } = useInView<HTMLSpanElement>(0.6);
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!inView) return;
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setN(value * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, value, duration]);
  return (
    <span ref={ref} className={cx("tabular-nums", className)}>
      {prefix}
      {n.toLocaleString("en-US", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })}
      {suffix}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* TYPEWRITER — loops through words                                    */
/* ------------------------------------------------------------------ */

export function Typewriter({
  words,
  typeMs = 65,
  holdMs = 1400,
  className,
}: {
  words: string[];
  typeMs?: number;
  holdMs?: number;
  className?: string;
}) {
  const [wi, setWi] = useState(0);
  const [len, setLen] = useState(0);
  const [deleting, setDeleting] = useState(false);
  const word = words[wi % words.length];

  useEffect(() => {
    let t: number;
    if (!deleting && len < word.length) {
      t = window.setTimeout(() => setLen(len + 1), typeMs);
    } else if (!deleting && len === word.length) {
      t = window.setTimeout(() => setDeleting(true), holdMs);
    } else if (deleting && len > 0) {
      t = window.setTimeout(() => setLen(len - 1), typeMs / 2);
    } else {
      t = window.setTimeout(() => {
        setDeleting(false);
        setWi((w) => w + 1);
      }, 250);
    }
    return () => clearTimeout(t);
  }, [len, deleting, word, typeMs, holdMs]);

  return (
    <span className={className}>
      {word.slice(0, len)}
      <span
        aria-hidden
        className="ml-0.5 inline-block h-[1em] w-[2.5px] translate-y-[0.12em] rounded-full bg-current"
        style={{ animation: "hashui-caret 1.1s steps(1) infinite" }}
      />
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* MARQUEE — infinite horizontal scroll                                */
/* ------------------------------------------------------------------ */

export function Marquee({
  children,
  duration = 28,
  reverse,
  pauseOnHover = true,
  fade = true,
  className,
}: {
  children: ReactNode;
  duration?: number;
  reverse?: boolean;
  pauseOnHover?: boolean;
  fade?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cx("group/mq w-full overflow-hidden", className)}
      style={
        fade
          ? {
              maskImage:
                "linear-gradient(90deg, transparent, black 12%, black 88%, transparent)",
            }
          : undefined
      }
    >
      <div
        className={cx(
          "flex w-max items-center gap-10",
          pauseOnHover && "group-hover/mq:[animation-play-state:paused]",
        )}
        style={{
          animation: `hashui-marquee ${duration}s linear infinite ${reverse ? "reverse" : ""}`,
        }}
      >
        <div className="flex shrink-0 items-center gap-10">{children}</div>
        <div className="flex shrink-0 items-center gap-10" aria-hidden>
          {children}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* SHIMMER BUTTON — spinning conic border + shine sweep                */
/* ------------------------------------------------------------------ */

export function ShimmerButton({
  children,
  className,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={cx(
        "group/sh relative inline-flex overflow-hidden rounded-full p-px select-none active:scale-[0.985]",
        className,
      )}
      {...rest}
    >
      <span
        aria-hidden
        className="absolute inset-[-120%]"
        style={{
          background:
            "conic-gradient(from 0deg, transparent 0 300deg, rgba(52,211,153,0.9) 330deg, #a7f3d0 345deg, rgba(52,211,153,0.9) 355deg, transparent 360deg)",
          animation: "hashui-rotate 3.2s linear infinite",
        }}
      />
      <span className="relative z-10 inline-flex h-11 items-center gap-2 overflow-hidden rounded-full bg-[#101013] px-6 text-[14.5px] font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
        {children}
        <span
          aria-hidden
          className="absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-white/25 to-transparent"
          style={{ animation: "hashui-shine 3.2s ease-in-out infinite" }}
        />
      </span>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* BORDER BEAM — light segment traveling along a card border           */
/* ------------------------------------------------------------------ */

export function BorderBeam({
  radius = 16,
  duration = 6,
  color = "#34d399",
  width = 72,
  className,
}: {
  radius?: number;
  duration?: number;
  color?: string;
  width?: number;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cx("pointer-events-none absolute inset-0", className)}
      style={{ borderRadius: radius }}
    >
      <span
        className="absolute h-[2px]"
        style={{
          width,
          background: `linear-gradient(90deg, transparent, ${color}, transparent)`,
          offsetPath: `rect(0px auto auto 0px round ${radius}px)`,
          animation: `hashui-beam ${duration}s linear infinite`,
        }}
      />
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* SPOTLIGHT — mouse-tracking radial highlight                         */
/* ------------------------------------------------------------------ */

export function Spotlight({
  children,
  className,
  size = 320,
  color = "rgba(52,211,153,0.14)",
}: {
  children: ReactNode;
  className?: string;
  size?: number;
  color?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: -999, y: -999 });
  return (
    <div
      ref={ref}
      onMouseMove={(e) => {
        const r = ref.current!.getBoundingClientRect();
        setPos({ x: e.clientX - r.left, y: e.clientY - r.top });
      }}
      onMouseLeave={() => setPos({ x: -999, y: -999 })}
      className={cx("relative overflow-hidden", className)}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 transition-opacity duration-300"
        style={{
          background: `radial-gradient(${size}px circle at ${pos.x}px ${pos.y}px, ${color}, transparent 65%)`,
        }}
      />
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* TILT CARD — 3D perspective on hover                                 */
/* ------------------------------------------------------------------ */

export function TiltCard({
  children,
  max = 10,
  className,
}: {
  children: ReactNode;
  max?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [t, setT] = useState({ rx: 0, ry: 0 });
  return (
    <div style={{ perspective: 900 }} className={className}>
      <div
        ref={ref}
        onMouseMove={(e) => {
          const r = ref.current!.getBoundingClientRect();
          const px = (e.clientX - r.left) / r.width - 0.5;
          const py = (e.clientY - r.top) / r.height - 0.5;
          setT({ rx: -py * max, ry: px * max });
        }}
        onMouseLeave={() => setT({ rx: 0, ry: 0 })}
        className="transition-transform duration-150 will-change-transform"
        style={{
          transform: `rotateX(${t.rx}deg) rotateY(${t.ry}deg)`,
          transformStyle: "preserve-3d",
        }}
      >
        {children}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* REVEAL — fade-up on scroll                                          */
/* ------------------------------------------------------------------ */

export function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  const { ref, inView } = useInView<HTMLDivElement>(0.25);
  return (
    <div
      ref={ref}
      className={cx(
        "transition-all duration-700 ease-out",
        inView ? "translate-y-0 opacity-100" : "translate-y-5 opacity-0",
        className,
      )}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* METEORS — diagonal shooting lines                                   */
/* ------------------------------------------------------------------ */

export function Meteors({ count = 9 }: { count?: number }) {
  const items = Array.from({ length: count }, (_, i) => ({
    left: `${(i * 97) % 100}%`,
    top: `${((i * 53) % 60) - 10}%`,
    delay: `${((i * 137) % 60) / 10}s`,
    duration: `${5 + ((i * 71) % 40) / 10}s`,
  }));
  return (
    <span aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {items.map((m, i) => (
        <span
          key={i}
          className="absolute h-0.5 w-0.5 rounded-full bg-emerald-300"
          style={
            {
              left: m.left,
              top: m.top,
              animation: `hashui-meteor ${m.duration} linear ${m.delay} infinite`,
            } as CSSProperties
          }
        >
          <span className="absolute top-1/2 h-px w-14 -translate-y-1/2 bg-gradient-to-r from-emerald-300/70 to-transparent" />
        </span>
      ))}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* ANIMATED GRADIENT TEXT                                              */
/* ------------------------------------------------------------------ */

export function GradientText({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cx("bg-clip-text text-transparent", className)}
      style={{
        backgroundImage:
          "linear-gradient(90deg, #059669, #22d3ee, #8b5cf6, #ec4899, #059669)",
        backgroundSize: "300% 100%",
        animation: "hashui-gradient-x 6s ease infinite",
      }}
    >
      {children}
    </span>
  );
}
