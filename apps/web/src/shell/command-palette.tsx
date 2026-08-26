"use client";

/**
 * Komut paleti (⌘K).
 *
 * Menüyle **aynı** kaynaktan (`shell/nav.ts`) beslenir; ayrı bir liste
 * tutulsaydı yeni bir sayfa eklendiğinde palet sessizce eksik kalırdı.
 *
 * Her satır bir cümle ipucu taşır: palet sayfa adlarını ezberlemiş
 * kullanıcı için bir kısayol değil, ezberlememiş kullanıcı için bir
 * keşif aracıdır.
 */

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import { useAuth } from "@/lib/auth";
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

  /* Palet açıkken arkadaki sayfa kaymasın. */
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

  return (
    <div className="fixed inset-0 z-[100]">
      <div
        className="sn-fade-up absolute inset-0"
        style={{ background: "rgba(6, 8, 11, 0.5)" }}
        onClick={() => onOpenChange(false)}
        aria-hidden
      />
      <Command
        label="Komut paleti"
        loop
        className="sn-fade-up absolute top-[14vh] left-1/2 w-[min(560px,92vw)] -translate-x-1/2 overflow-hidden rounded-[var(--sn-r-lg)]"
        style={{ background: "var(--sn-overlay)", boxShadow: "var(--sn-shadow-pop)" }}
      >
        <Command.Input
          autoFocus
          placeholder="Sayfa ara…"
          className="h-11 w-full bg-transparent px-4 outline-none placeholder:text-[var(--sn-ink-4)]"
          style={{
            color: "var(--sn-ink)",
            fontSize: "var(--sn-t-body-lg)",
            borderBottom: "1px solid var(--sn-hairline)",
          }}
        />
        <Command.List className="sn-scroll max-h-[54vh] overflow-y-auto p-1.5">
          <Command.Empty
            className="px-3 py-6 text-center"
            style={{ fontSize: "var(--sn-t-caption)", color: "var(--sn-ink-3)" }}
          >
            Eşleşen sayfa yok.
          </Command.Empty>

          {NAV.map((group) => {
            const items = group.items.filter((item) => !item.roles || can(...item.roles));
            if (items.length === 0) return null;
            return (
              <Command.Group
                key={group.label}
                heading={group.label}
                className="[&_[cmdk-group-heading]]:sn-label [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:pb-1"
              >
                {items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <Command.Item
                      key={item.href}
                      value={`${item.label} ${item.hint}`}
                      onSelect={() => go(item.href)}
                      className="flex cursor-pointer items-center gap-2.5 rounded-[var(--sn-r-sm)] px-2 py-2 data-[selected=true]:bg-[var(--sn-sunken)]"
                    >
                      <Icon size={15} style={{ color: "var(--sn-ink-3)" }} />
                      <span className="min-w-0">
                        <span
                          className="block truncate"
                          style={{ fontSize: "var(--sn-t-body)", color: "var(--sn-ink)" }}
                        >
                          {item.label}
                        </span>
                        <span
                          className="block truncate"
                          style={{ fontSize: "var(--sn-t-caption)", color: "var(--sn-ink-3)" }}
                        >
                          {item.hint}
                        </span>
                      </span>
                    </Command.Item>
                  );
                })}
              </Command.Group>
            );
          })}
        </Command.List>
      </Command>
    </div>
  );
}
