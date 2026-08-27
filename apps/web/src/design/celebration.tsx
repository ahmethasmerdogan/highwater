"use client";

/**
 * Kutlama katmanı — başarı kartları, konfeti, kilometre taşları.
 *
 * DÜRÜSTLÜK SÖZLEŞMESİ (CLAUDE.md "panel dürüstçe göstermek zorundadır"):
 * - Kutlama yalnızca GERÇEKLEŞMİŞ kâra ateşlenir. Gerçekleşmemiş k/z
 *   havai fişek görmez — o daha cebe girmedi.
 * - Kayıp saklanmaz ve küçültülmez: kayıp kartı sakin, net ve kırmızıdır;
 *   utanç animasyonu da yoktur, kutlama da.
 * - Yeşil/kırmızı yalnızca yön demektir; parıltıyı marka amber'i taşır.
 * - `prefers-reduced-motion` her şeyi kapatır: konfeti hiç çizilmez.
 */

import { useEffect, useRef } from "react";
import { cx } from "@/design/cx";
import { Num } from "@/design/numeric";
import { useReducedMotion } from "@/design/motion";
import { useLive } from "@/lib/ws";
import { toast } from "@/lib/toast";
import { money, num } from "@/lib/format";

/* ------------------------------------------------------------------ */
/*  Konfeti — bağımlılıksız, tek seferlik canvas patlaması             */
/* ------------------------------------------------------------------ */

const CONFETTI_COLORS = ["#f0b90b", "#fcd535", "#0f7a4e", "#1d4ed8", "#ea580c", "#a855f7"];

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vr: number;
  w: number;
  h: number;
  color: string;
  life: number;
}

/**
 * Ekranın üstünden bir konfeti patlaması. `strength` parça sayısını ölçekler.
 *
 * Kendi canvas'ını yaratır, ~2 sn animasyon sonunda söker — kalıcı DOM yok,
 * dinleyici yok. Hareket azaltılmışsa HİÇ çizmez.
 */
export function fireConfetti(strength = 1): void {
  if (typeof window === "undefined") return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  canvas.style.cssText =
    "position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:120";
  canvas.width = window.innerWidth * devicePixelRatio;
  canvas.height = window.innerHeight * devicePixelRatio;
  ctx.scale(devicePixelRatio, devicePixelRatio);
  document.body.appendChild(canvas);

  const W = window.innerWidth;
  const count = Math.round(90 * Math.min(strength, 3));
  const parts: Particle[] = Array.from({ length: count }, (_, i) => {
    const fromLeft = i % 2 === 0;
    return {
      x: fromLeft ? W * 0.18 : W * 0.82,
      y: window.innerHeight * 0.28,
      vx: (fromLeft ? 1 : -1) * (2 + Math.random() * 5.5),
      vy: -(6 + Math.random() * 7),
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.35,
      w: 5 + Math.random() * 5,
      h: 3 + Math.random() * 4,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      life: 1,
    };
  });

  const started = performance.now();
  const DURATION = 1900;
  const tick = (now: number) => {
    const t = now - started;
    ctx.clearRect(0, 0, W, window.innerHeight);
    for (const p of parts) {
      p.vy += 0.22; // yer çekimi
      p.vx *= 0.992;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;
      p.life = Math.max(0, 1 - t / DURATION);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.globalAlpha = p.life;
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    }
    if (t < DURATION) {
      requestAnimationFrame(tick);
    } else {
      canvas.remove();
    }
  };
  requestAnimationFrame(tick);
}

/* ------------------------------------------------------------------ */
/*  Rozet ikonları — küçük, kendi içinde SVG                           */
/* ------------------------------------------------------------------ */

function svgProps(size: number) {
  return {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
}

export function ITrophy({ size = 18 }: { size?: number }) {
  return (
    <svg {...svgProps(size)}>
      <path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4Z" />
      <path d="M7 6H4a3 3 0 0 0 3 5M17 6h3a3 3 0 0 1-3 5" />
    </svg>
  );
}

export function IMedal({ size = 18 }: { size?: number }) {
  return (
    <svg {...svgProps(size)}>
      <circle cx="12" cy="14" r="5" />
      <path d="M9.5 10 7 3h4l1 3 1-3h4l-2.5 7" />
    </svg>
  );
}

export function IFlame({ size = 18 }: { size?: number }) {
  return (
    <svg {...svgProps(size)}>
      <path d="M12 21c-3.9 0-6-2.6-6-5.6 0-2.7 1.8-4.6 3.2-6.2C10.4 7.8 11 6.2 11 4c2.8 1.6 7 5.2 7 11.4 0 3-2.1 5.6-6 5.6Z" />
    </svg>
  );
}

export function IPeak({ size = 18 }: { size?: number }) {
  return (
    <svg {...svgProps(size)}>
      <path d="M3 20 10 6l4 8 3-5 4 11H3Z" />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/*  Başarı kartı                                                       */
/* ------------------------------------------------------------------ */

export function SuccessCard({
  icon,
  label,
  value,
  format = (v) => money(v),
  sub,
  tone,
  delay = 0,
}: {
  icon?: React.ReactNode;
  label: string;
  value: number | null;
  format?: (v: number | null | undefined) => string;
  sub?: React.ReactNode;
  /** win: amber ışıltı · loss: sakin kırmızı · flat: nötr */
  tone: "win" | "loss" | "flat";
  delay?: number;
}) {
  const reduced = useReducedMotion();
  const renk =
    tone === "win" ? "var(--sn-up)" : tone === "loss" ? "var(--sn-down)" : "var(--sn-ink)";
  return (
    <div
      className={cx(
        "rounded-[var(--sn-r-md)] px-4 py-3.5",
        !reduced && "sn-pop",
        tone === "win" ? "sn-card-win" : "sn-card-loss",
      )}
      style={{
        background: tone === "win" ? undefined : "var(--sn-panel)",
        animationDelay: reduced ? undefined : `${delay}ms`,
      }}
    >
      <div className="flex items-center gap-1.5">
        {icon && (
          <span
            className={cx(!reduced && "sn-medal")}
            style={{
              color: tone === "win" ? "var(--sn-brand)" : "var(--sn-ink-3)",
              animationDelay: reduced ? undefined : `${delay + 160}ms`,
            }}
          >
            {icon}
          </span>
        )}
        <span className="sn-label">{label}</span>
      </div>
      <div className="mt-1.5" style={{ color: renk }}>
        <Num value={value} format={format} size="display" animate animateOnMount />
      </div>
      {sub && (
        <div
          className="sn-num mt-1"
          style={{ fontSize: "var(--sn-t-caption)", color: "var(--sn-ink-3)" }}
        >
          {sub}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Kilometre taşı çizgisi — meydan okuma "seviye" hissi               */
/* ------------------------------------------------------------------ */

export interface Milestone {
  label: string;
  /** 0..1 arası konum. */
  at: number;
}

export function MilestoneTrack({
  progress,
  milestones,
  storageKey,
}: {
  /** 0..1 — gerçek ilerleme (kırpılır, uydurulmaz). */
  progress: number | null;
  milestones: Milestone[];
  /** Verilirse: yeni geçilen her eşik localStorage'a yazılır ve BİR KEZ
      konfeti atar. Sayfa yenilemesi kutlamayı tekrarlamaz. */
  storageKey?: string;
}) {
  const reduced = useReducedMotion();
  const clamped = progress === null ? 0 : Math.max(0, Math.min(1, progress));

  const fired = useRef(false);
  useEffect(() => {
    if (!storageKey || progress === null || fired.current) return;
    fired.current = true;
    try {
      const gecilen = milestones.filter((m) => m.at > 0 && clamped >= m.at).length;
      const onceki = Number(window.localStorage.getItem(storageKey) ?? "0");
      if (gecilen > onceki) {
        window.localStorage.setItem(storageKey, String(gecilen));
        fireConfetti(1 + gecilen * 0.4);
      } else if (gecilen < onceki) {
        // Gerileme: sayaç dürüstçe geri alınır ki aynı eşik tekrar
        // geçildiğinde yeniden kutlanabilsin.
        window.localStorage.setItem(storageKey, String(gecilen));
      }
    } catch {
      /* localStorage kapalı olabilir — kutlama süs, veri değil. */
    }
  }, [storageKey, progress, clamped, milestones]);

  return (
    <div>
      <div
        className="relative h-2.5 overflow-visible rounded-full"
        style={{ background: "var(--sn-sunken)" }}
      >
        <div
          className={cx("h-full rounded-full", !reduced && "sn-track-fill")}
          style={{
            width: `${clamped * 100}%`,
            background:
              "linear-gradient(90deg, var(--sn-brand-2), var(--sn-brand-solid))",
            minWidth: clamped > 0 ? 4 : 0,
          }}
        />
        {milestones.map((m) => {
          const gecildi = clamped >= m.at && m.at > 0;
          return (
            <span
              key={m.label}
              className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
              style={{
                left: `${m.at * 100}%`,
                background: gecildi ? "var(--sn-brand-solid)" : "var(--sn-panel)",
                border: `2px solid ${gecildi ? "var(--sn-brand-solid)" : "var(--sn-border-strong)"}`,
                boxShadow: gecildi ? "0 0 8px rgba(240,185,11,0.5)" : undefined,
              }}
              title={m.label}
            />
          );
        })}
      </div>
      <div className="sn-num mt-2 flex justify-between" style={{ fontSize: "var(--sn-t-micro)" }}>
        {milestones.map((m) => {
          const gecildi = clamped >= m.at && m.at > 0;
          return (
            <span
              key={m.label}
              style={{
                color: gecildi ? "var(--sn-brand)" : "var(--sn-ink-3)",
                fontWeight: gecildi ? 600 : 400,
              }}
            >
              {m.label}
            </span>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Canlı kutlama gözcüsü                                              */
/* ------------------------------------------------------------------ */

/**
 * WS akışını izler; bir pozisyon KÂRLA kapanınca başarı bildirimi + konfeti.
 *
 * Yalnızca gerçekleşmiş kâr: `position.closed` ve `pnl > 0`. Kayıpla kapanış
 * kutlanmaz — logda ve tabloda zaten net görünür. Aynı olay iki kez
 * ateşlenmez (at+symbol anahtarıyla tekilleştirilir).
 */
export function CelebrationWatcher() {
  const { events } = useLive();
  const seen = useRef<Set<string>>(new Set());
  const mountedAt = useRef<string>(new Date().toISOString());

  useEffect(() => {
    for (const event of events) {
      if (event.kind !== "position.closed") continue;
      const key = `${event.at}:${event.symbol ?? ""}`;
      if (seen.current.has(key)) continue;
      seen.current.add(key);
      /* Geçmiş (history) olayları kutlanmaz — sayfa açılışında 40 eski
         kapanış için konfeti yağdırmak hem yanlış hem gürültü. */
      if (event.at < mountedAt.current) continue;
      const pnl = Number(event.payload?.pnl ?? 0);
      const r = Number(event.payload?.pnl_r ?? 0);
      if (!Number.isFinite(pnl) || pnl <= 0) continue;
      toast.success(
        `${event.symbol ?? "Pozisyon"} kârla kapandı`,
        `+${money(pnl)} USDT · ${r > 0 ? "+" : ""}${num(r, 2)}R cebe girdi`,
      );
      fireConfetti(r >= 1 ? 1.8 : 1);
    }
  }, [events]);

  return null;
}
