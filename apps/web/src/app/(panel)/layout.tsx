"use client";

/**
 * Panel kabuğu.
 *
 *   ┌────────┬──────────────────────────────────────┐
 *   │  yan   │  ⌘K · havuz · bot · uyarı · 🔔 · ME  │
 *   │  menü  ├──────────────────────────────────────┤
 *   │        │              içerik                  │
 *   └────────┴──────────────────────────────────────┘
 *
 * Mobilde yan menü kayan panele döner; masaüstünde sabit ve daraltılabilir.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { IX, cx } from "@/ui";
import { useAuth } from "@/lib/auth";
import { Sidebar } from "@/components/shell/sidebar";
import { Topbar } from "@/components/shell/topbar";
import { CommandPalette } from "@/components/shell/command-palette";

export default function PanelLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [commandOpen, setCommandOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.replace("/giris");
  }, [loading, user, router]);

  /* ⌘K / Ctrl+K her yerden paleti açar. */
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen((open) => !open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-[13px] text-ink-3">
        Yükleniyor…
      </div>
    );
  }
  if (!user) return null;

  return (
    <div className="flex h-screen overflow-hidden bg-canvas">
      {/* Masaüstü menüsü */}
      <div className="hidden md:block">
        <Sidebar />
      </div>

      {/* Mobil menü — kayan panel */}
      {menuOpen && (
        <div className="fixed inset-0 z-[70] md:hidden">
          <div
            className="fade-in absolute inset-0 bg-black/45"
            onClick={() => setMenuOpen(false)}
            aria-hidden
          />
          <div className={cx("relative h-full w-[212px]")} onClick={() => setMenuOpen(false)}>
            <Sidebar />
            <button
              type="button"
              onClick={() => setMenuOpen(false)}
              aria-label="Menüyü kapat"
              className="absolute top-3 -right-11 rounded-lg bg-surface p-2 text-ink-2 shadow-pop"
            >
              <IX size={16} />
            </button>
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          onOpenCommand={() => setCommandOpen(true)}
          onOpenMenu={() => setMenuOpen(true)}
        />
        <main className="thin-scroll flex-1 overflow-y-auto">{children}</main>
      </div>

      <CommandPalette open={commandOpen} onOpenChange={setCommandOpen} />
    </div>
  );
}
