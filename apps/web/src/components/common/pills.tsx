"use client";

/**
 * Durum rozetleri.
 *
 * Her rozet açıklamasını yanında taşır: `ERROR` yazan bir rozet kullanıcıya
 * ne olduğunu söylemez, "Hata — beklenmeyen bir sorunla karşılaştı,
 * müdahale gerekiyor" söyler.
 */

import { StatusPill } from "@/ui";
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

export function BotStatePill({ state, hint = true }: { state: string; hint?: boolean }) {
  const tone =
    state === "PAPER_RUNNING"
      ? "green"
      : state === "ERROR"
        ? "red"
        : state === "DEGRADED"
          ? "orange"
          : state === "PAUSED"
            ? "amber"
            : "gray";

  return (
    <span className="inline-flex items-center gap-1">
      <StatusPill size="sm" tone={tone}>
        {BOT_STATE_LABEL[state] ?? state}
      </StatusPill>
      {hint && BOT_STATE_HINT[state] && <InfoDot text={BOT_STATE_HINT[state]} align="start" />}
    </span>
  );
}

export function ExitReasonPill({ reason }: { reason: string }) {
  const tone =
    reason === "STOP" || reason === "KILL_SWITCH" || reason === "DELIST"
      ? "red"
      : reason === "TRAILING" || reason === "BREAKEVEN"
        ? "green"
        : "gray";

  return (
    <span className="inline-flex items-center gap-1">
      <StatusPill size="sm" tone={tone}>
        {EXIT_REASON_LABEL[reason] ?? reason}
      </StatusPill>
      {EXIT_REASON_HINT[reason] && <InfoDot text={EXIT_REASON_HINT[reason]} align="start" />}
    </span>
  );
}

export function OrderStatusPill({ status }: { status: string }) {
  const tone =
    status === "FILLED"
      ? "green"
      : status === "REJECTED"
        ? "red"
        : status === "CANCELED"
          ? "gray"
          : "amber";

  return (
    <StatusPill size="sm" tone={tone}>
      {ORDER_STATUS_LABEL[status] ?? status}
    </StatusPill>
  );
}

export function RolePill({ role }: { role: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <StatusPill size="sm" tone={role === "ADMIN" ? "amber" : "gray"}>
        {ROLE_LABEL[role] ?? role}
      </StatusPill>
      {ROLE_HINT[role] && <InfoDot text={ROLE_HINT[role]} align="start" />}
    </span>
  );
}
