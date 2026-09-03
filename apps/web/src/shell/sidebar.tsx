"use client";

/**
 * Yan menü v2 — dokuz hedef, tek liste, grup başlığı yok.
 *
 * Grup etiketleri ("İzleme", "İşlem"…) menüyü uzatıyor ama seçime yardım
 * etmiyordu; dokuz kalem tek bakışta okunur. Ray kipi (56px) kalıcıdır;
 * ray'da her kalemin ipucu ve `g`+harf kısayolu görünür.
 *
 * Alt bölüm: bağlantı nabzı, tema, hesap. Dikkat sayacı üst çubuktadır —
 * iki yerde iki sayaç, iki farklı sayı demektir.
 */

import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { cx } from "@/design/cx";
import { Dot, IconButton, Tip } from "@/design/primitives";
import { LogoTile, LogoWordmark } from "@/design/logo";
import { ICaret, IMoon, IScreen, ISun } from "@/design/icons";
import { useTheme } from "@/design/theme";
import { useAuth } from "@/lib/auth";
import { useLive } from "@/lib/ws";
import { NAV } from "./nav";

function PendingPulse() {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  return (
    <span
      aria-hidden
      className="sn-pulse-dot ml-auto inline-block h-1.5 w-1.5 shrink-0 rounded-full"
      style={{ background: "var(--sn-brand-solid)" }}
    />
  );
}

const KEY = "sarnic.sidebar.rail";

export function Sidebar() {
  const pathname = usePathname();
  const { can, user } = useAuth();
  const { state } = useLive();
  const { mode, setMode } = useTheme();
  const [rail, setRail] = useState(false);

  useEffect(() => {
    setRail(window.localStorage.getItem(KEY) === "1");
  }, []);

  const toggle = () => {
    setRail((open) => {
      const next = !open;
      try {
        window.localStorage.setItem(KEY, next ? "1" : "0");
      } catch {
        /* kota dolu — tercih saklanmaz */
      }
      return next;
    });
  };

  const live = state === "open";
  const items = NAV.filter((item) => !item.roles || can(...item.roles));
  const ThemeIcon = mode === "light" ? ISun : mode === "dark" ? IMoon : IScreen;
  const nextMode = mode === "light" ? "dark" : mode === "dark" ? "system" : "light";

  return (
    <nav
      className="flex h-full shrink-0 flex-col transition-[width] duration-[var(--sn-dur-3)] ease-[var(--sn-ease)]"
      style={{ width: rail ? 56 : 200, background: "var(--sn-panel)", borderRight: "1px solid var(--sn-hairline)" }}
    >
      <div className={cx("flex h-12 items-center", rail ? "justify-center" : "px-3")}>
        {rail ? <LogoTile /> : <LogoWordmark sub="kağıt üstü işlem" />}
      </div>

      <div className="sn-scroll flex-1 overflow-y-auto pt-1 pb-2">
        {items.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          const Icon = item.icon;
          const link = (
            <Link
              key={item.href}
              href={item.href}
              className={cx(
                "sn-focus relative mx-1.5 my-0.5 flex h-8 items-center gap-2.5 rounded-[var(--sn-r-sm)]",
                "transition-colors duration-[var(--sn-dur-1)]",
                rail ? "justify-center px-0" : "px-2.5",
                !active && "hover:bg-[var(--sn-sunken)]",
              )}
              style={{
                background: active ? "var(--sn-brand-bg)" : undefined,
                color: active ? "var(--sn-brand)" : "var(--sn-ink-2)",
                fontSize: "var(--sn-t-body)",
              }}
            >
              {active && (
                <span
                  aria-hidden
                  className="absolute top-1.5 bottom-1.5 -left-1.5 w-[2px] rounded-r"
                  style={{ background: "var(--sn-brand-solid)" }}
                />
              )}
              <Icon size={16} />
              {!rail && <span className="truncate">{item.label}</span>}
              {!rail && <PendingPulse />}
              {!rail && item.key && (
                <kbd
                  className="sn-num ml-auto rounded-[var(--sn-r-xs)] px-1 opacity-0 transition-opacity group-hover:opacity-100"
                  style={{ fontSize: 9.5, color: "var(--sn-ink-4)", background: "var(--sn-sunken)" }}
                >
                  g{item.key}
                </kbd>
              )}
            </Link>
          );
          return rail ? (
            <Tip key={item.href} content={`${item.label}${item.key ? ` (g ${item.key})` : ""} — ${item.hint}`}>
              {link}
            </Tip>
          ) : (
            <div key={item.href} className="group">
              {link}
            </div>
          );
        })}
      </div>

      <div
        className={cx("flex shrink-0 items-center gap-1", rail ? "flex-col py-2" : "h-11 px-2")}
        style={{ borderTop: "1px solid var(--sn-hairline)" }}
      >
        <Tip content={live ? "Canlı bağlantı açık." : "Bağlantı kopuk — yeniden bağlanıyor."}>
          <span className={cx("flex items-center gap-1.5", rail ? "justify-center" : "px-1")}>
            <Dot tone={live ? "up" : "warn"} pulse={live} />
            {!rail && (
              <span style={{ fontSize: "var(--sn-t-micro)", color: "var(--sn-ink-3)" }}>
                {live ? "canlı" : "bağlanıyor"}
              </span>
            )}
          </span>
        </Tip>
        {!rail && <span className="flex-1" />}
        <IconButton label="Tema değiştir" onClick={() => setMode(nextMode)}>
          <ThemeIcon size={14} />
        </IconButton>
        <Tip content={user ? `${user.display_name || user.email} · ${user.role}` : ""}>
          <Link
            href="/yonetim?tab=hesap"
            className="sn-focus flex h-6 w-6 items-center justify-center rounded-full font-semibold"
            style={{ background: "var(--sn-sunken)", color: "var(--sn-ink-2)", fontSize: 10 }}
            aria-label="Hesap"
          >
            {initials(user?.display_name || user?.email || "?")}
          </Link>
        </Tip>
        <IconButton label={rail ? "Menüyü genişlet" : "Menüyü daralt"} onClick={toggle}>
          <ICaret size={14} style={{ transform: rail ? "rotate(-90deg)" : "rotate(90deg)" }} />
        </IconButton>
      </div>
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
