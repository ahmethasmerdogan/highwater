"use client";

/**
 * Yan menü.
 *
 * Seçili öğe sol kenarda amber bir rayla işaretlenir — dolgu yerine ray,
 * çünkü amber dolgu bu palette "uyarı" gibi okunuyordu.
 *
 * Daraltılabilir: yoğun tablo sayfalarında ekran genişliği değerlidir.
 * Tercih tarayıcıda saklanır.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { IChevronLeft, cx } from "@/ui";
import { useAuth } from "@/lib/auth";
import { InfoTip } from "@/components/common/explain";
import { NAV } from "./nav";

const STORAGE_KEY = "sarnic.sidebar.collapsed";

export function Sidebar() {
  const pathname = usePathname();
  const { can } = useAuth();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(STORAGE_KEY) === "1");
    } catch {
      /* localStorage kapalı olabilir */
    }
  }, []);

  const toggle = () => {
    setCollapsed((v) => {
      const next = !v;
      try {
        localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      } catch {
        /* tercih saklanamadı; oturum boyunca geçerli */
      }
      return next;
    });
  };

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <nav
      aria-label="Ana menü"
      className={cx(
        "flex h-full shrink-0 flex-col border-r border-line bg-surface transition-[width] duration-150",
        collapsed ? "w-[60px]" : "w-[212px]",
      )}
    >
      {/* Marka */}
      <div className="flex h-[52px] items-center gap-2.5 border-b border-line px-4">
        <span
          aria-hidden
          className="flex size-7 shrink-0 items-center justify-center rounded-md bg-accent-solid text-[13px] font-bold text-accent-ink"
        >
          S
        </span>
        {!collapsed && (
          <div className="min-w-0">
            <div className="truncate text-[14px] font-semibold tracking-tight text-ink">
              SARNIÇ
            </div>
            <div className="truncate text-[10.5px] text-ink-3">kağıt üstü işlem</div>
          </div>
        )}
      </div>

      {/* Menü */}
      <div className="thin-scroll flex-1 overflow-y-auto py-2">
        {NAV.map((group) => {
          const items = group.items.filter((i) => !i.roles || can(...i.roles));
          if (items.length === 0) return null;

          return (
            <div key={group.label} className="mb-3 last:mb-0">
              {!collapsed && (
                <div className="px-4 pb-1 text-[10.5px] font-semibold tracking-wider text-ink-3 uppercase">
                  {group.label}
                </div>
              )}
              <ul className="px-2">
                {items.map((item) => {
                  const active = isActive(item.href);
                  const Icon = item.icon;

                  const link = (
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={cx(
                        "relative flex items-center gap-2.5 rounded-lg py-1.5 text-[13px] transition-colors",
                        collapsed ? "justify-center px-2" : "px-2.5",
                        active
                          ? "bg-inset font-medium text-ink"
                          : "text-ink-2 hover:bg-inset hover:text-ink",
                      )}
                    >
                      {/* Seçili rayı */}
                      <span
                        aria-hidden
                        className={cx(
                          "absolute top-1/2 -left-2 h-5 w-[3px] -translate-y-1/2 rounded-r-full transition-opacity",
                          active ? "bg-brand opacity-100" : "opacity-0",
                        )}
                      />
                      <Icon
                        size={16}
                        className={cx("shrink-0", active ? "text-brand" : "text-ink-3")}
                      />
                      {!collapsed && <span className="truncate">{item.label}</span>}
                    </Link>
                  );

                  return (
                    <li key={item.href}>
                      {collapsed ? (
                        <InfoTip
                          title={item.label}
                          body={item.hint}
                          side="bottom"
                          align="start"
                          className="w-full"
                        >
                          {link}
                        </InfoTip>
                      ) : (
                        link
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>

      {/* Daraltma */}
      <button
        type="button"
        onClick={toggle}
        aria-label={collapsed ? "Menüyü genişlet" : "Menüyü daralt"}
        className="flex h-9 items-center justify-center border-t border-line text-ink-3 hover:bg-inset hover:text-ink"
      >
        <IChevronLeft
          size={15}
          className={cx("transition-transform", collapsed && "rotate-180")}
        />
      </button>
    </nav>
  );
}
