"use client";

/**
 * Panel kabuğu v3 — DESIGN-V3 §3.
 *
 *   ┌──────────────────────────────────────────────────────────┐
 *   │ HIGHWATER  Köprü Maraton Piyasa Botlar …        ⌘K ◐ AE  │  manşet çubuğu
 *   ├──────────────────────────────────────────────────────────┤
 *   │ ● Kripto 12 dk  ● BIST  ● ABD · 9/9 kol   Dikkat 1  24.1k │  şerit
 *   ├──────────────────────────────────────────────────────────┤
 *   │                       içerik                             │
 *   └──────────────────────────────────────────────────────────┘
 *
 * Sol ray yok. Dar ekranda alt rıhtım. Klavye: ⌘K palet; `g`+harf sayfa;
 * `.` dikkat. Kısayollar bir giriş alanındayken çalışmaz.
 */

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { TooltipHost } from "@/design/primitives";
import { CelebrationWatcher } from "@/design/celebration";
import { BottomDock, TopNav } from "@/shell/topnav";
import { Ribbon } from "@/shell/ribbon";
import { CommandPalette } from "@/shell/command-palette";
import { AttentionSheet } from "@/shell/attention";
import { LEGACY, NAV } from "@/shell/nav";

function inField(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
}

export default function PanelLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, can } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [commandOpen, setCommandOpen] = useState(false);
  const [attentionOpen, setAttentionOpen] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.replace("/giris");
  }, [loading, user, router]);

  useEffect(() => {
    const hedef = LEGACY[pathname];
    if (hedef) router.replace(hedef);
  }, [pathname, router]);

  useEffect(() => {
    let pendingG = 0;
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen((open) => !open);
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey || inField(event.target)) return;
      const key = event.key.toLowerCase();
      if (key === ".") {
        setAttentionOpen((open) => !open);
        return;
      }
      if (key === "g") {
        pendingG = Date.now();
        return;
      }
      if (pendingG && Date.now() - pendingG < 1200) {
        const item = NAV.find((n) => n.key === key && (!n.roles || can(...n.roles)));
        pendingG = 0;
        if (item) router.push(item.href);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router, can]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas text-[13px] text-ink-3">Yükleniyor…</div>
    );
  }
  if (!user) return null;

  return (
    <TooltipHost>
      <div className="sn-root flex h-screen flex-col overflow-hidden bg-canvas">
        <CelebrationWatcher />
        <TopNav onOpenCommand={() => setCommandOpen(true)} />
        <Ribbon onOpenAttention={() => setAttentionOpen(true)} />
        <main className="sn-scroll flex-1 overflow-y-auto pb-16 md:pb-0" style={{ contain: "layout paint" }}>
          {children}
        </main>
        <BottomDock />
        <CommandPalette open={commandOpen} onOpenChange={setCommandOpen} />
        <AttentionSheet open={attentionOpen} onClose={() => setAttentionOpen(false)} />
      </div>
    </TooltipHost>
  );
}
