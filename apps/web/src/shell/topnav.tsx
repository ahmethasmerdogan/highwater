"use client";

/**
 * Manşet çubuğu — üst gezinme (DESIGN-V3 §3). Sol ray yok.
 *
 * Marka · dokuz niyet · ⌘K · tema · hesap. Masaüstünde yatay hap gezinme;
 * dar ekranda gezinme alt rıhtıma iner (`BottomDock`). Aktif hedef
 * yüzeyli hap, gerisi sessiz metin — uicean PillNav grameri, boyu 36px'e
 * indirilmiş (gezinme manşet değil, cetveldir).
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Kbd } from "uicean";
import { cx } from "@/design/cx";
import { IMoon, IScreen, ISearch, ISun } from "@/design/icons";
import { LogoTile } from "@/design/logo";
import { useTheme } from "@/design/theme";
import { useAuth } from "@/lib/auth";
import { NAV } from "./nav";

export function TopNav({ onOpenCommand }: { onOpenCommand: () => void }) {
  const pathname = usePathname();
  const { can, user } = useAuth();
  const { mode, setMode } = useTheme();
  const items = NAV.filter((item) => !item.roles || can(...item.roles));
  const ThemeIcon = mode === "light" ? ISun : mode === "dark" ? IMoon : IScreen;
  const nextMode = mode === "light" ? "dark" : mode === "dark" ? "system" : "light";

  return (
    <div className="flex h-12 items-center gap-3 border-b border-line bg-surface px-4 sm:px-6">
      <Link href="/" className="flex shrink-0 items-center gap-2.5" aria-label="Köprü">
        <LogoTile />
        <span className="hidden text-[13.5px] font-semibold tracking-[0.02em] text-ink lg:inline">HIGHWATER</span>
      </Link>

      <nav className="scroll-thin hidden min-w-0 flex-1 items-center gap-1 overflow-x-auto md:flex" aria-label="Ana gezinme">
        {items.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              title={item.hint}
              className={cx(
                "inline-flex h-8 shrink-0 items-center rounded-xl px-3 text-[13px] font-medium transition-colors",
                active ? "border border-line bg-elev text-ink" : "text-ink-3 hover:bg-inset hover:text-ink",
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="ml-auto flex shrink-0 items-center gap-1.5">
        <button
          type="button"
          onClick={onOpenCommand}
          className="inline-flex h-8 items-center gap-2 rounded-xl border border-line bg-inset px-2.5 text-[12.5px] text-ink-3 transition-colors hover:text-ink"
        >
          <ISearch size={13} />
          <span className="hidden sm:inline">Sembol, bot, sayfa…</span>
          <Kbd>⌘K</Kbd>
        </button>
        <button
          type="button"
          onClick={() => setMode(nextMode)}
          aria-label="Tema değiştir"
          className="inline-flex size-8 items-center justify-center rounded-xl text-ink-3 transition-colors hover:bg-inset hover:text-ink"
        >
          <ThemeIcon size={15} />
        </button>
        <Link
          href="/yonetim?tab=hesap"
          aria-label="Hesap"
          title={user ? `${user.display_name || user.email} · ${user.role}` : ""}
          className="inline-flex size-8 items-center justify-center rounded-full border border-line bg-elev text-[10.5px] font-semibold text-ink-2"
        >
          {initials(user?.display_name || user?.email || "?")}
        </Link>
      </div>
    </div>
  );
}

/** Dar ekran: alt rıhtım — ilk beş niyet, gerisi ⌘K'da. */
export function BottomDock() {
  const pathname = usePathname();
  const { can } = useAuth();
  const items = NAV.filter((item) => !item.roles || can(...item.roles)).slice(0, 5);
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 flex h-14 items-stretch border-t border-line bg-surface md:hidden" aria-label="Alt gezinme">
      {items.map((item) => {
        const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cx("flex flex-1 flex-col items-center justify-center gap-0.5 text-[10.5px]", active ? "text-brand" : "text-ink-3")}
          >
            <Icon size={17} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function initials(name: string): string {
  return name
    .split(/[\s@.]+/)
    .slice(0, 2)
    .map((part) => part[0]?.toLocaleUpperCase("tr") ?? "")
    .join("");
}
