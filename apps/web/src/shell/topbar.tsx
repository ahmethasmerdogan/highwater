"use client";

/**
 * Üst çubuk v2 — durum şeridi.
 *
 * Solda sayfa ve ⌘K; sağda üç akış nabzı (Kripto · BIST · ABD), filo
 * sayacı, DİKKAT düğmesi (tıklanır, sayısı sunucudan gelir) ve iki büyük
 * sayı: özsermaye ve bugün. Eskiden altı mini sayı vardı ve "UYARI 0"
 * bot giriş yasağındayken de sıfır diyordu — sayaç artık /system/attention
 * ile aynı listeden gelir, ayrı hesaplanmaz.
 *
 * Bağlantı koparsa amber şerit iner ve yazar: sessizce eski veri yok.
 */

import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { CountBadge } from "uicean";
import { api, type LivePnl } from "@/lib/api";
import { money } from "@/lib/format";
import { useLive } from "@/lib/ws";
import { Delta, Num } from "@/design/numeric";
import { Dot, IconButton, Tag, Tip } from "@/design/primitives";
import { IBell, ISearch, IWarn } from "@/design/icons";
import { findNavItem } from "./nav";
import { useAttention } from "./attention";

const MARKET_SHORT: Record<string, string> = { CRYPTO: "K", BIST: "B", US: "A" };

export function Topbar({
  onOpenCommand,
  onOpenMenu,
  onOpenAttention,
}: {
  onOpenCommand: () => void;
  onOpenMenu: () => void;
  onOpenAttention: () => void;
}) {
  const pathname = usePathname();
  const item = findNavItem(pathname);
  const { state } = useLive();
  const offline = state === "reconnecting" || state === "closed";
  const { data: attention } = useAttention();
  const { data: live } = useQuery({
    queryKey: ["live-pnl"],
    queryFn: () => api.get<LivePnl>("/portfolio/live"),
    refetchInterval: 10_000,
  });

  const urgent = attention?.items.filter((i) => i.level !== "INFO").length ?? 0;
  const info = (attention?.items.length ?? 0) - urgent;

  return (
    <header className="shrink-0" style={{ borderBottom: "1px solid var(--sn-hairline)" }}>
      <div
        className="grid transition-[grid-template-rows] duration-[var(--sn-dur-3)] ease-[var(--sn-ease)]"
        style={{ gridTemplateRows: offline ? "1fr" : "0fr" }}
        aria-hidden={!offline}
      >
        <div className="overflow-hidden">
          <div
            className="flex h-7 items-center gap-2 px-4"
            style={{ background: "var(--sn-warn-bg)", color: "var(--sn-warn)", fontSize: "var(--sn-t-caption)" }}
          >
            <IWarn size={13} />
            <span className="font-medium">Canlı veri kesildi</span>
            <span style={{ opacity: 0.8 }}>· yeniden bağlanılıyor. Sayılar son bilinen değerlerdir.</span>
          </div>
        </div>
      </div>

      <div className="flex h-11 items-center gap-2 px-3" style={{ background: "var(--sn-panel)" }}>
        <IconButton label="Menü" className="md:hidden" onClick={onOpenMenu}>
          <span className="flex flex-col gap-[3px]">
            {[0, 1, 2].map((i) => (
              <span key={i} className="block h-[1.5px] w-4 rounded" style={{ background: "currentColor" }} />
            ))}
          </span>
        </IconButton>

        <h1 className="shrink-0 truncate font-medium" style={{ fontSize: "var(--sn-t-body-lg)", color: "var(--sn-ink)" }}>
          {item?.label ?? "HIGHWATER"}
        </h1>

        <button
          type="button"
          onClick={onOpenCommand}
          className="sn-focus hidden h-7 items-center gap-2 rounded-[var(--sn-r-sm)] px-2.5 lg:flex"
          style={{ background: "var(--sn-sunken)", color: "var(--sn-ink-4)", fontSize: "var(--sn-t-caption)", minWidth: 200 }}
        >
          <ISearch size={13} />
          <span>Sembol, bot, sayfa…</span>
          <kbd className="sn-num ml-auto rounded-[var(--sn-r-xs)] px-1" style={{ background: "var(--sn-panel)", color: "var(--sn-ink-3)", fontSize: 10 }}>
            ⌘K
          </kbd>
        </button>

        <div className="ml-auto flex items-center gap-1">
          {/* Akış nabızları */}
          <div className="hidden items-center gap-1 pr-2 sm:flex">
            {(attention?.feeds ?? []).map((f) => (
              <Tip key={f.market} content={`${f.market === "CRYPTO" ? "Kripto" : f.market === "BIST" ? "BIST" : "ABD"} akışı — ${f.detail}`}>
                <span
                  className="flex h-6 items-center gap-1 rounded-[var(--sn-r-xs)] px-1.5"
                  style={{ background: "var(--sn-sunken)", fontSize: "var(--sn-t-micro)", color: "var(--sn-ink-2)" }}
                >
                  <Dot tone={f.ok ? "up" : "warn"} pulse={f.ok} />
                  <span className="font-medium">{MARKET_SHORT[f.market]}</span>
                </span>
              </Tip>
            ))}
          </div>

          <Tip content={attention ? `${attention.fleet.running}/${attention.fleet.total} bot koşuyor · ${attention.fleet.blocked} giriş yasağında · ${attention.fleet.halted} kesiciyle durmuş` : "filo yükleniyor"}>
            <span className="sn-num hidden px-2 sm:inline" style={{ fontSize: "var(--sn-t-caption)", color: "var(--sn-ink-2)" }}>
              <span className="sn-num-int">{attention?.fleet.running ?? "—"}</span>
              <span className="sn-num-frac">/{attention?.fleet.total ?? "—"}</span>
              <span className="sn-num-unit"> bot</span>
            </span>
          </Tip>

          <button
            type="button"
            onClick={onOpenAttention}
            className="sn-focus flex h-8 items-center gap-1.5 rounded-[var(--sn-r-sm)] px-2 transition-colors hover:bg-[var(--sn-sunken)]"
            style={{ color: urgent > 0 ? "var(--sn-warn)" : "var(--sn-ink-2)", fontSize: "var(--sn-t-caption)" }}
            aria-label="Dikkat listesi"
          >
            <IBell size={15} />
            <span className="hidden md:inline">Dikkat</span>
            {urgent > 0 ? (
              <CountBadge tone="orange">{urgent}</CountBadge>
            ) : info > 0 ? (
              <CountBadge tone="gray">{info}</CountBadge>
            ) : null}
          </button>

          <span className="mx-1 h-6 w-px" style={{ background: "var(--sn-hairline)" }} />

          <Tip content="Botların toplam değeri: nakit + açık pozisyonların güncel karşılığı. 10 saniyede bir tazelenir.">
            <div className="flex flex-col items-end px-2 leading-none">
              <span className="sn-label" style={{ fontSize: 9 }}>özsermaye</span>
              <Num value={live?.equity} format={(v) => money(v)} size="lg" animate />
            </div>
          </Tip>
          <Tip content="Bugün cebe giren (kapanmış) + açık pozisyonların anlık kâr/zararı.">
            <div className="flex flex-col items-end px-2 leading-none">
              <span className="sn-label" style={{ fontSize: 9 }}>bugün</span>
              <Delta value={live ? live.realized_today + live.unrealized_pnl : null} format={(v) => money(v)} size="lg" animate />
            </div>
          </Tip>

          <Tip content="Canlı para yok. Tüm emirler kağıt motorundan geçer; veriler gerçektir.">
            <span className="hidden lg:inline">
              <Tag tone="brand">paper</Tag>
            </span>
          </Tip>
        </div>
      </div>
    </header>
  );
}
