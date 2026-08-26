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

export function BotStatePill({ state, hint = true }: { state: string; hint?: boolean }) {
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
    <span className="inline-flex items-center gap-1">
      <Tag tone={tone}>{BOT_STATE_LABEL[state] ?? state}</Tag>
      {hint && BOT_STATE_HINT[state] && <InfoDot text={BOT_STATE_HINT[state]} />}
    </span>
  );
}

export function ExitReasonPill({ reason }: { reason: string }) {
  const tone: Tone =
    reason === "STOP" || reason === "KILL_SWITCH" || reason === "DELIST"
      ? "down"
      : reason === "TRAILING" || reason === "BREAKEVEN"
        ? "up"
        : "neutral";

  return (
    <span className="inline-flex items-center gap-1">
      <Tag tone={tone}>{EXIT_REASON_LABEL[reason] ?? reason}</Tag>
      {EXIT_REASON_HINT[reason] && <InfoDot text={EXIT_REASON_HINT[reason]} />}
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
