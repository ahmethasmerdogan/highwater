"use client";

/**
 * Durum rozetleri.
 *
 * Her rozet **açıklamasını yanında taşır**: `ERROR` yazan bir rozet
 * kullanıcıya ne olduğunu söylemez; "Hata — beklenmeyen bir sorunla
 * karşılaştı, müdahale gerekiyor" söyler.
 *
 * Renk tonları `Tag`'in anlamsal tonlarıdır, dolayısıyla renk disiplini
 * kendiliğinden korunur: yeşil yalnızca gerçekten "iyi giden" durumlarda
 * (çalışıyor, iz süren stopla kâr kilitlenmiş) çıkar.
 */

import { useEffect, useRef, useState } from "react";
import {
  BOT_STATE_HINT,
  BOT_STATE_LABEL,
  EXIT_REASON_HINT,
  EXIT_REASON_LABEL,
  ORDER_STATUS_LABEL,
  ROLE_HINT,
  ROLE_LABEL,
} from "@/lib/humanize";
import { InfoDot } from "./explain";
import { Tag, type Tone } from "./primitives";

/**
 * Dizge değişince BİR KEZ vurgu sınıfı verir.
 *
 * `motion.ts`'e konmadı — orada iki SAYISAL kanca yeter; bu dizge
 * karşılaştırır. İlk render vurgulanmaz: sayfa açılışı bir "değişim"
 * değildir.
 */
function useChangeFlash(key: string): boolean {
  const prev = useRef<string | null>(null);
  const [flash, setFlash] = useState(false);
  useEffect(() => {
    const once = prev.current;
    prev.current = key;
    if (once === null || once === key) return;
    setFlash(true);
    const timer = window.setTimeout(() => setFlash(false), 950);
    return () => window.clearTimeout(timer);
  }, [key]);
  return flash;
}

export function BotStatePill({ state, hint = true }: { state: string; hint?: boolean }) {
  const flash = useChangeFlash(state);
  const tone: Tone =
    state === "PAPER_RUNNING"
      ? "up"
      : state === "ERROR"
        ? "down"
        : state === "DEGRADED"
          ? "warn"
          : state === "PAUSED"
            ? "brand"
            : "neutral";

  return (
    <span className={`inline-flex items-center gap-1 rounded-[var(--sn-r-xs)] ${flash ? "sn-flash" : ""}`}>
      <Tag tone={tone}>{BOT_STATE_LABEL[state] ?? state}</Tag>
      {hint && BOT_STATE_HINT[state] && <InfoDot text={BOT_STATE_HINT[state]} />}
    </span>
  );
}

/* Kaldıraçlı paper motorunun yeni çıkış sebebi; `humanize` sözlüğüne
   girmeden önce burada tanınır ki defterde ham kod basılmasın. */
const EXTRA_EXIT_LABEL: Record<string, string> = { LIQUIDATION: "likidasyon" };
const EXTRA_EXIT_HINT: Record<string, string> = {
  LIQUIDATION: "Kaldıraçlı pozisyonun teminatı tükendi ve pozisyon zorla kapatıldı.",
};

export function ExitReasonPill({ reason }: { reason: string }) {
  const tone: Tone =
    reason === "STOP" || reason === "KILL_SWITCH" || reason === "DELIST" || reason === "LIQUIDATION"
      ? "down"
      : reason === "TRAILING" || reason === "BREAKEVEN"
        ? "up"
        : "neutral";

  return (
    <span className="inline-flex items-center gap-1">
      <Tag tone={tone}>{EXIT_REASON_LABEL[reason] ?? EXTRA_EXIT_LABEL[reason] ?? reason}</Tag>
      {(EXIT_REASON_HINT[reason] ?? EXTRA_EXIT_HINT[reason]) && (
        <InfoDot text={EXIT_REASON_HINT[reason] ?? EXTRA_EXIT_HINT[reason]} />
      )}
    </span>
  );
}

export function OrderStatusPill({ status }: { status: string }) {
  const tone: Tone =
    status === "FILLED"
      ? "up"
      : status === "REJECTED"
        ? "down"
        : status === "CANCELED"
          ? "neutral"
          : "warn";

  return <Tag tone={tone}>{ORDER_STATUS_LABEL[status] ?? status}</Tag>;
}

export function RolePill({ role }: { role: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <Tag tone={role === "ADMIN" ? "brand" : "neutral"}>{ROLE_LABEL[role] ?? role}</Tag>
      {ROLE_HINT[role] && <InfoDot text={ROLE_HINT[role]} />}
    </span>
  );
}
