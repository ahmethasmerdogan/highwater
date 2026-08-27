"use client";

/**
 * Panel kabuğu.
 *
 *   ┌────────┬──────────────────────────────────────────────┐
 *   │  yan   │  sayfa · ⌘K · özsermaye bugün maruziyet …    │
 *   │  menü  ├──────────────────────────────────────────────┤
 *   │        │                   içerik                     │
 *   └────────┴──────────────────────────────────────────────┘
 *
 * Masaüstünde yan menü sabit ve raya daraltılabilir; mobilde kayan panele
 * döner. İçerik alanı tek kaydırma yüzeyidir — iç içe kaydırma, uzun
 * tablolarda başlığın nereye yapıştığını belirsizleştirir.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { TooltipHost } from "@/design/primitives";
import { IClose } from "@/design/icons";
import { CelebrationWatcher } from "@/design/celebration";
import { Sidebar } from "@/shell/sidebar";
import { Topbar } from "@/shell/topbar";
import { CommandPalette } from "@/shell/command-palette";

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
          <Sidebar />
        </div>

        {/* Mobil menü — kayan panel */}
        {menuOpen && (
          <div className="fixed inset-0 z-[70] md:hidden">
            <div
              className="sn-fade-up absolute inset-0"
              style={{ background: "rgba(6, 8, 11, 0.5)" }}
              onClick={() => setMenuOpen(false)}
              aria-hidden
            />
            <div className="sn-slide-in relative h-full w-[208px]" onClick={() => setMenuOpen(false)}>
              <Sidebar />
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
          {/* Kârla kapanan pozisyon: başarı bildirimi + konfeti (yalnız
              gerçekleşmiş kâr; geçmiş olaylar kutlanmaz). */}
          <CelebrationWatcher />
          <Topbar onOpenCommand={() => setCommandOpen(true)} onOpenMenu={() => setMenuOpen(true)} />
          {/* contain: içerikteki animasyonlar yerleşim/boyama maliyetini
              kendi kutusunda tutar — kenar çubuğu ve üst çubuk yeniden
              boyanmaz. */}
          <main className="sn-scroll flex-1 overflow-y-auto" style={{ contain: "layout paint" }}>
            {children}
          </main>
        </div>

        <CommandPalette open={commandOpen} onOpenChange={setCommandOpen} />
      </div>
    </TooltipHost>
  );
}
