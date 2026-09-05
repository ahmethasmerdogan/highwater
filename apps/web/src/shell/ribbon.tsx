"use client";

/**
 * Şerit — gezinmenin altındaki canlı durum satırı (DESIGN-V3 §3).
 *
 * Solda üç akış nabzı METİNLİ ("Kripto · 12 dk önce"), filo, tıklanır
 * DİKKAT; sağda özsermaye ve bugün. Sayaç sunucudan (/system/attention),
 * panel türetmez. Bağlantı koparsa şerit amber uyarıya döner ve yazar —
 * sessizce eski veri yok.
 */

import { useQuery } from "@tanstack/react-query";
import { CountBadge } from "uicean";
import { api, type LivePnl } from "@/lib/api";
import { money, relative } from "@/lib/format";
import { useLive } from "@/lib/ws";
import { cx } from "@/design/cx";
import { Delta, Num } from "@/design/numeric";
import { IBell, IWarn } from "@/design/icons";
import { useAttention } from "./attention";

const MARKET_LABEL: Record<string, string> = { CRYPTO: "Kripto", BIST: "BIST", US: "ABD" };

export function Ribbon({ onOpenAttention }: { onOpenAttention: () => void }) {
  const { state } = useLive();
  const offline = state === "reconnecting" || state === "closed";
  const { data: attention } = useAttention();
  const { data: live } = useQuery({
    queryKey: ["live-pnl"],
    queryFn: () => api.get<LivePnl>("/portfolio/live"),
    refetchInterval: 10_000,
  });
  const urgent = attention?.items.filter((i) => i.level !== "INFO").length ?? 0;

  return (
    <div
      role="status"
      aria-live="polite"
      className={cx(
        "flex h-10 items-center gap-4 border-b border-line px-4 text-[12.5px] sm:px-6",
        offline ? "bg-[var(--sn-warn-bg)] text-[var(--sn-warn)]" : "bg-canvas text-ink-2",
      )}
    >
      {offline ? (
        <span className="flex items-center gap-2 font-medium">
          <IWarn size={13} />
          Canlı veri kesildi · yeniden bağlanılıyor; sayılar son bilinen değerlerdir.
        </span>
      ) : (
        <div className="scroll-thin flex min-w-0 items-center gap-4 overflow-x-auto">
          {(attention?.feeds ?? []).map((f) => (
            <span key={f.market} className="flex shrink-0 items-center gap-1.5" title={f.detail}>
              <span
                aria-hidden
                className={cx("inline-block size-1.5 rounded-full", f.ok ? "bg-[var(--sn-up)]" : "bg-[var(--sn-warn)]")}
              />
              <span className="text-ink">{MARKET_LABEL[f.market]}</span>
              <span className="sn-num text-ink-3">{f.last_bar_at ? relative(f.last_bar_at) : "—"}</span>
            </span>
          ))}
          {attention && (
            <span className="hidden shrink-0 items-center gap-1 sm:flex">
              <span className="sn-num text-ink">{attention.fleet.running}</span>
              <span className="text-ink-3">/</span>
              <span className="sn-num text-ink-3">{attention.fleet.total}</span>
              <span className="text-ink-3">kol koşuyor</span>
            </span>
          )}
        </div>
      )}

      <div className="ml-auto flex shrink-0 items-center gap-4">
        <button
          type="button"
          onClick={onOpenAttention}
          aria-label="Dikkat listesi"
          className={cx(
            "inline-flex h-7 items-center gap-1.5 rounded-lg px-2 transition-colors hover:bg-inset",
            urgent > 0 ? "text-[var(--sn-warn)]" : "text-ink-2",
          )}
        >
          <IBell size={14} />
          <span className="hidden sm:inline">Dikkat</span>
          {urgent > 0 ? <CountBadge tone="orange">{urgent}</CountBadge> : <span className="text-ink-3">yok</span>}
        </button>
        <span className="hidden h-4 w-px bg-line sm:inline" />
        <span className="flex items-baseline gap-1.5" title="Botların toplam değeri; 10 sn'de bir tazelenir.">
          <span className="text-ink-3">özsermaye</span>
          <Num value={live?.equity} format={(v) => money(v)} size="md" animate />
        </span>
        <span className="flex items-baseline gap-1.5" title="Bugün cebe giren + açık pozisyonların anlık kâr/zararı.">
          <span className="text-ink-3">bugün</span>
          <Delta value={live ? live.realized_today + live.unrealized_pnl : null} format={(v) => money(v)} size="md" animate />
        </span>
      </div>
    </div>
  );
}
