"use client";

/**
 * Komut paleti (⌘K) v2 — sayfa + sembol + bot.
 *
 * Sayfalar menüyle aynı kaynaktan (`shell/nav.ts`). Semboller havuzdan,
 * botlar listeden gelir; "PENDLE" yazınca Piyasa'daki sembol çekmecesi,
 * "taban" yazınca bot ayrıntısı açılır. Palet, yazmayı bilen için kısayol;
 * bilmeyen için keşif aracıdır — her satırda bir cümle ipucu.
 */

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import { useQuery } from "@tanstack/react-query";
import { api, type Bot, type UniverseSymbol } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { IBot, IPool } from "@/design/icons";
import { BotStatePill } from "@/design/pills";
import { NAV } from "./nav";

export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const { can } = useAuth();

  const { data: bots } = useQuery({
    queryKey: ["bots"],
    queryFn: () => api.get<Bot[]>("/bots"),
    enabled: open,
    staleTime: 30_000,
  });
  const { data: universe } = useQuery({
    queryKey: ["palette-universe"],
    queryFn: async () => {
      const markets = await Promise.all(
        ["CRYPTO", "BIST", "US"].map((market) =>
          api.get<{ symbols: UniverseSymbol[] }>("/universe/current", { market }).catch(() => ({ symbols: [] })),
        ),
      );
      return markets.flatMap((m) => m.symbols ?? []);
    },
    enabled: open,
    staleTime: 300_000,
  });

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  if (!open) return null;

  const go = (href: string) => {
    onOpenChange(false);
    router.push(href);
  };

  const pages = NAV.filter((item) => !item.roles || can(...item.roles));
  const itemClass =
    "flex cursor-pointer items-center gap-2.5 rounded-[var(--sn-r-sm)] px-2 py-2 data-[selected=true]:bg-[var(--sn-sunken)]";
  const headingClass =
    "[&_[cmdk-group-heading]]:sn-label [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:pb-1";

  return (
    <div className="fixed inset-0 z-[100]">
      <div className="sn-fade-up absolute inset-0" style={{ background: "rgba(6, 8, 11, 0.5)" }} onClick={() => onOpenChange(false)} aria-hidden />
      <Command
        label="Komut paleti"
        loop
        className="sn-fade-up absolute top-[14vh] left-1/2 w-[min(600px,92vw)] -translate-x-1/2 overflow-hidden rounded-[var(--sn-r-lg)]"
        style={{ background: "var(--sn-overlay)", boxShadow: "var(--sn-shadow-pop)" }}
      >
        <Command.Input
          autoFocus
          placeholder="Sayfa, sembol ya da bot…"
          className="h-11 w-full bg-transparent px-4 outline-none placeholder:text-[var(--sn-ink-4)]"
          style={{ color: "var(--sn-ink)", fontSize: "var(--sn-t-body-lg)", borderBottom: "1px solid var(--sn-hairline)" }}
        />
        <Command.List className="sn-scroll max-h-[56vh] overflow-y-auto p-1.5">
          <Command.Empty className="px-3 py-6 text-center" style={{ fontSize: "var(--sn-t-caption)", color: "var(--sn-ink-3)" }}>
            Eşleşen bir şey yok.
          </Command.Empty>

          <Command.Group heading="Sayfalar" className={headingClass}>
            {pages.map((item) => {
              const Icon = item.icon;
              return (
                <Command.Item key={item.href} value={`${item.label} ${item.hint}`} onSelect={() => go(item.href)} className={itemClass}>
                  <Icon size={15} style={{ color: "var(--sn-ink-3)" }} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate" style={{ fontSize: "var(--sn-t-body)", color: "var(--sn-ink)" }}>{item.label}</span>
                    <span className="block truncate" style={{ fontSize: "var(--sn-t-caption)", color: "var(--sn-ink-3)" }}>{item.hint}</span>
                  </span>
                  {item.key && (
                    <kbd className="sn-num rounded-[var(--sn-r-xs)] px-1" style={{ fontSize: 9.5, color: "var(--sn-ink-4)", background: "var(--sn-sunken)" }}>
                      g{item.key}
                    </kbd>
                  )}
                </Command.Item>
              );
            })}
          </Command.Group>

          {bots && bots.length > 0 && (
            <Command.Group heading="Botlar" className={headingClass}>
              {bots.map((bot) => (
                <Command.Item key={`bot-${bot.id}`} value={`bot ${bot.name} ${bot.market} ${bot.timeframe}`} onSelect={() => go(`/botlar/${bot.id}`)} className={itemClass}>
                  <IBot size={15} style={{ color: "var(--sn-ink-3)" }} />
                  <span className="min-w-0 flex-1 truncate" style={{ fontSize: "var(--sn-t-body)", color: "var(--sn-ink)" }}>{bot.name}</span>
                  <BotStatePill state={bot.state} hint={false} />
                </Command.Item>
              ))}
            </Command.Group>
          )}

          {universe && universe.length > 0 && (
            <Command.Group heading="Semboller" className={headingClass}>
              {universe.map((s) => (
                <Command.Item
                  key={`sym-${s.symbol}`}
                  value={`sembol ${s.symbol}`}
                  onSelect={() => go(`/piyasa?sembol=${encodeURIComponent(s.symbol)}`)}
                  className={itemClass}
                >
                  <IPool size={15} style={{ color: "var(--sn-ink-3)" }} />
                  <span className="sn-num min-w-0 flex-1 truncate" style={{ fontSize: "var(--sn-t-body)", color: "var(--sn-ink)" }}>{s.symbol}</span>
                </Command.Item>
              ))}
            </Command.Group>
          )}
        </Command.List>
      </Command>
    </div>
  );
}
