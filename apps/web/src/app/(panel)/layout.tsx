"use client";

/**
 * Panel kabuğu v2.
 *
 *   ┌──────┬──────────────────────────────────────────────┐
 *   │ ray  │  sayfa · ⌘K  ·  K B A  9/9  Dikkat  özsermaye │
 *   │      ├──────────────────────────────────────────────┤
 *   │      │                   içerik                     │
 *   └──────┴──────────────────────────────────────────────┘
 *
 * Klavye: ⌘K palet; `g` sonra harf → sayfa (g k köprü, g b botlar…);
 * `.` dikkat listesi. Kısayollar bir giriş alanındayken çalışmaz.
 */

import { Suspense, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { TooltipHost } from "@/design/primitives";
import { IClose } from "@/design/icons";
import { CelebrationWatcher } from "@/design/celebration";
import { Sidebar } from "@/shell/sidebar";
import { Topbar } from "@/shell/topbar";
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
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.replace("/giris");
  }, [loading, user, router]);

  /* Eski adresler yeni hedeflere — yer imleri kırılmaz. */
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
      <div
        className="flex min-h-screen items-center justify-center"
        style={{ background: "var(--sn-bg)", color: "var(--sn-ink-3)", fontSize: "var(--sn-t-body)" }}
      >
        Yükleniyor…
      </div>
    );
  }
  if (!user) return null;

  return (
    <TooltipHost>
      <div className="sn-root flex h-screen overflow-hidden" style={{ background: "var(--sn-bg)" }}>
        <div className="hidden md:block">
          <Suspense fallback={null}>
            <Sidebar />
          </Suspense>
        </div>

        {menuOpen && (
          <div className="fixed inset-0 z-[70] md:hidden">
            <div className="sn-fade-up absolute inset-0" style={{ background: "rgba(6, 8, 11, 0.5)" }} onClick={() => setMenuOpen(false)} aria-hidden />
            <div className="sn-slide-in relative h-full w-[200px]" onClick={() => setMenuOpen(false)}>
              <Suspense fallback={null}>
                <Sidebar />
              </Suspense>
              <button
                type="button"
                onClick={() => setMenuOpen(false)}
                aria-label="Menüyü kapat"
                className="sn-focus absolute top-3 -right-10 flex h-8 w-8 items-center justify-center rounded-[var(--sn-r-sm)]"
                style={{ background: "var(--sn-panel)", color: "var(--sn-ink-2)", boxShadow: "var(--sn-shadow-pop)" }}
              >
                <IClose size={15} />
              </button>
            </div>
          </div>
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          <CelebrationWatcher />
          <Topbar
            onOpenCommand={() => setCommandOpen(true)}
            onOpenMenu={() => setMenuOpen(true)}
            onOpenAttention={() => setAttentionOpen(true)}
          />
          <main className="sn-scroll flex-1 overflow-y-auto" style={{ contain: "layout paint" }}>
            {children}
          </main>
        </div>

        <CommandPalette open={commandOpen} onOpenChange={setCommandOpen} />
        <AttentionSheet open={attentionOpen} onClose={() => setAttentionOpen(false)} />
      </div>
    </TooltipHost>
  );
}
