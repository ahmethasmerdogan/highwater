"use client";

/**
 * Bot risk rozetleri — liste ve detay aynı dili konuşsun.
 *
 * Öncelik sırası çağıranındır (ERROR → giriş yasağı → kesici → durum);
 * burada yalnızca rozetler ve "yasak hâlâ sürüyor mu" hesabı var.
 */

import { StatusPill } from "uicean";
import type { Bot } from "@/lib/api";
import { time } from "@/lib/format";

/** Pazar kodu → ekran adı. Kripto varsayılandır; listede rozet almaz. */
export const PAZAR_ETIKET: Record<string, string> = { CRYPTO: "Kripto", BIST: "BIST", US: "ABD" };

/** Kesici giriş yasağının bitişi — gelecekteyse `SS:DD`, değilse null. */
export function girisYasagiBitis(
  bot: Pick<Bot, "entries_blocked_until">,
  now = Date.now(),
): string | null {
  if (!bot.entries_blocked_until) return null;
  const t = new Date(bot.entries_blocked_until).getTime();
  if (!Number.isFinite(t) || t <= now) return null;
  return time(bot.entries_blocked_until).slice(0, 5);
}

export function GirisYasagiPill({ until }: { until: string }) {
  return (
    <StatusPill tone="amber" dot size="sm">
      giriş yasağı · <span className="sn-num">{until}</span>&apos;e kadar
    </StatusPill>
  );
}

export function KesiciPill({ reason }: { reason: string }) {
  return (
    <StatusPill tone="red" dot size="sm">
      kesici: {reason}
    </StatusPill>
  );
}
