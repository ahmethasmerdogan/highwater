"use client";

/**
 * Kutlama katmanı — v2, uicean diliyle.
 *
 * İlk sürüm parıltıyı tek karta yığmıştı (akan gradyan çerçeve, madalya
 * animasyonu, kademeli pop) — ucuz duruyordu. uicean'ın kuralı düz ve
 * gölgesizdir: hareket İÇERİKTE yaşar (sayaçla dolan değer, tek Reveal),
 * süslemede değil.
 *
 * DÜRÜSTLÜK SÖZLEŞMESİ değişmedi:
 * - Kutlama yalnızca GERÇEKLEŞMİŞ kâra ve gerçek eşiklere ateşlenir.
 * - Kayıp saklanmaz; kayıp kartı sakin, net, kırmızıdır.
 * - `prefers-reduced-motion` her şeyi kapatır; konfeti hiç çizilmez.
 */

import { useEffect, useRef } from "react";
import { Reveal } from "uicean";
import { cx } from "@/design/cx";
import { Num } from "@/design/numeric";
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
 * Bir konfeti patlaması. `strength` parça sayısını ölçekler.
 *
 * Kendi canvas'ını yaratır, ~2 sn sonra söker — kalıcı DOM yok, dinleyici
 * yok. Hareket azaltılmışsa HİÇ çizmez.
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
      p.vy += 0.22;
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
/*  Başarı kartı — düz, gölgesiz; hareket içerikte                     */
/* ------------------------------------------------------------------ */

export function SuccessCard({
  icon,
  label,
  value,
  format = (v) => money(v),
  sub,
  tone,
}: {
  icon?: React.ReactNode;
  label: string;
  value: number | null;
  format?: (v: number | null | undefined) => string;
  sub?: React.ReactNode;
  /** win: amber vurgu · loss: sakin kırmızı · flat: nötr */
  tone: "win" | "loss" | "flat";
}) {
  const renk =
    tone === "win" ? "var(--sn-up)" : tone === "loss" ? "var(--sn-down)" : "var(--sn-ink)";
  return (
    <div
      className="flex items-start gap-3 rounded-[var(--sn-r-md)] px-4 py-3.5"
      style={{ background: "var(--sn-panel)", border: "1px solid var(--sn-hairline)" }}
    >
      {icon && (
        <span
          className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--sn-r-sm)]"
          style={{
            background: tone === "win" ? "var(--sn-brand-bg)" : "var(--sn-sunken)",
            color: tone === "win" ? "var(--sn-brand)" : "var(--sn-ink-3)",
          }}
        >
          {icon}
        </span>
      )}
      <div className="min-w-0">
        <div className="sn-label">{label}</div>
        <div className="mt-1" style={{ color: renk }}>
          <Num value={value} format={format} size="lg" animate animateOnMount />
        </div>
        {sub && (
          <div
            className="mt-0.5 truncate"
            style={{ fontSize: "var(--sn-t-caption)", color: "var(--sn-ink-3)" }}
          >
            {sub}
          </div>
        )}
      </div>
    </div>
  );
}

/** Bölümün tek, sakin girişi — kart başına ayrı gösteri yok. */
export function CelebrationReveal({ children }: { children: React.ReactNode }) {
  return <Reveal>{children}</Reveal>;
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
        /* Gerileme dürüstçe geri alınır: aynı eşik yeniden geçilirse
           yeniden kutlanabilir. */
        window.localStorage.setItem(storageKey, String(gecilen));
      }
    } catch {
      /* localStorage kapalı olabilir — kutlama süstür, veri değil. */
    }
  }, [storageKey, progress, clamped, milestones]);

  return (
    /* Etiketler noktaların ALTINA hizalanır (mutlak konum) — ilk sürümde
       justify-between eşit dağıtıyordu ve etiketler geometrik eşiklerle
       örtüşmüyordu; çizgi "bozuk" görünüyordu. Alt boşluk etiket satırına. */
    <div className="relative pb-7">
      <div className="relative h-2 rounded-full" style={{ background: "var(--sn-sunken)" }}>
        <div
          className="sn-track-fill h-full rounded-full"
          style={{
            width: `${clamped * 100}%`,
            background: "var(--sn-brand-solid)",
            minWidth: clamped > 0 ? 4 : 0,
          }}
        />
        {milestones.map((m) => {
          const gecildi = clamped >= m.at && m.at > 0;
          return (
            <span
              key={m.label}
              className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full transition-colors duration-[var(--sn-dur-2)]"
              style={{
                left: `${m.at * 100}%`,
                background: gecildi ? "var(--sn-brand-solid)" : "var(--sn-panel)",
                border: `2px solid ${gecildi ? "var(--sn-brand-solid)" : "var(--sn-border-strong)"}`,
              }}
              title={m.label}
            />
          );
        })}
      </div>
      {milestones.map((m, i) => {
        const gecildi = clamped >= m.at && m.at > 0;
        const ilk = i === 0;
        const son = i === milestones.length - 1;
        return (
          <span
            key={m.label}
            className={cx(
              "sn-num absolute top-4 whitespace-nowrap",
              ilk ? "" : son ? "-translate-x-full" : "-translate-x-1/2",
            )}
            style={{
              left: `${m.at * 100}%`,
              fontSize: "var(--sn-t-micro)",
              color: gecildi ? "var(--sn-brand)" : "var(--sn-ink-3)",
              fontWeight: gecildi ? 600 : 400,
            }}
          >
            {m.label}
          </span>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Canlı kutlama gözcüsü                                              */
/* ------------------------------------------------------------------ */

/**
 * WS akışını izler; bir pozisyon KÂRLA kapanınca başarı bildirimi + konfeti.
 *
 * Yalnızca gerçekleşmiş kâr: `position.closed` ve `pnl > 0`. Kayıpla
 * kapanış kutlanmaz — logda ve tabloda zaten net görünür. Aynı olay iki
 * kez ateşlenmez; açılıştaki history olayları kutlanmaz.
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
