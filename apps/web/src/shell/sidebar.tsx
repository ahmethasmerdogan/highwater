"use client";

/**
 * Yan menü.
 *
 * İki kip: geniş (208px, ikon + etiket) ve ray (56px, yalnız ikon).
 * Seçim saklanır — dar ekranda her açılışta menüyü toplamak zorunda
 * kalmak, menüyü hiç toplamamaktan kötüdür.
 *
 * Aktif öğe **iki** işaret taşır: amber sol şerit ve amber zemin. Tek
 * işaret (yalnız renk) ray kipinde etiket olmadığı için yetersiz kalır.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { cx } from "@/design/cx";
import { Dot, Tip } from "@/design/primitives";
import { ICaret } from "@/design/icons";
import { useAuth } from "@/lib/auth";
import { useLive } from "@/lib/ws";
import { NAV } from "./nav";

const KEY = "sarnic.sidebar.rail";

export function Sidebar() {
  const pathname = usePathname();
  const { can } = useAuth();
  const { state } = useLive();
  const [rail, setRail] = useState(false);

  /* Boyama sonrası okunur: sunucu ve istemcinin ilk karesi ayrışmasın. */
  useEffect(() => {
    setRail(window.localStorage.getItem(KEY) === "1");
  }, []);

  const toggle = () => {
    setRail((open) => {
      const next = !open;
      try {
        window.localStorage.setItem(KEY, next ? "1" : "0");
      } catch {
        /* Kota dolu — menü çalışır, tercih saklanmaz. */
      }
      return next;
    });
  };

  const live = state === "open";

  return (
    <nav
      className="flex h-full shrink-0 flex-col transition-[width] duration-[var(--sn-dur-3)] ease-[var(--sn-ease)]"
      style={{
        width: rail ? 56 : 208,
        background: "var(--sn-panel)",
        borderRight: "1px solid var(--sn-hairline)",
      }}
    >
      {/* ---- Marka ------------------------------------------------- */}
      <div className={cx("flex h-12 items-center gap-2.5", rail ? "justify-center px-0" : "px-3")}>
        <span
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--sn-r-sm)] font-semibold"
          style={{ background: "var(--sn-brand-solid)", color: "var(--sn-on-brand)", fontSize: 13 }}
        >
          S
        </span>
        {!rail && (
          <span className="min-w-0">
            <span
              className="block truncate font-semibold"
              style={{ fontSize: "var(--sn-t-body)", color: "var(--sn-ink)", letterSpacing: "0.02em" }}
            >
              SARNIÇ
            </span>
            <span className="block truncate" style={{ fontSize: 10, color: "var(--sn-ink-3)" }}>
              kağıt üstü işlem
            </span>
          </span>
        )}
      </div>

      {/* ---- Gruplar ----------------------------------------------- */}
      <div className="sn-scroll flex-1 overflow-y-auto pb-2">
        {NAV.map((group) => {
          const items = group.items.filter((item) => !item.roles || can(...item.roles));
          if (items.length === 0) return null;
          return (
            <div key={group.label} className="mt-3 first:mt-1">
              {rail ? (
                <div className="mx-3 my-2 h-px" style={{ background: "var(--sn-hairline)" }} />
              ) : (
                <div className="sn-label px-3 pb-1">{group.label}</div>
              )}
              {items.map((item) => {
                const active =
                  item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
                const Icon = item.icon;
                const link = (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cx(
                      "sn-focus relative mx-1.5 flex h-8 items-center gap-2.5 rounded-[var(--sn-r-sm)]",
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
                  </Link>
                );
                return rail ? (
                  <Tip key={item.href} content={`${item.label} — ${item.hint}`}>
                    {link}
                  </Tip>
                ) : (
                  link
                );
              })}
            </div>
          );
        })}
      </div>

      {/* ---- Alt: bağlantı + daraltma ------------------------------ */}
      <div
        className={cx("flex h-10 shrink-0 items-center gap-2", rail ? "justify-center" : "px-3")}
        style={{ borderTop: "1px solid var(--sn-hairline)" }}
      >
        {!rail && (
          <span className="flex min-w-0 items-center gap-1.5">
            <Dot tone={live ? "up" : "warn"} pulse={live} />
            <span className="truncate" style={{ fontSize: "var(--sn-t-micro)", color: "var(--sn-ink-3)" }}>
              {live ? "canlı" : "bağlanıyor"}
            </span>
          </span>
        )}
        <button
          type="button"
          onClick={toggle}
          aria-label={rail ? "Menüyü genişlet" : "Menüyü daralt"}
          title={rail ? "Menüyü genişlet" : "Menüyü daralt"}
          className={cx(
            "sn-focus flex h-7 w-7 items-center justify-center rounded-[var(--sn-r-sm)]",
            "transition-colors duration-[var(--sn-dur-1)] hover:bg-[var(--sn-sunken)]",
            !rail && "ml-auto",
          )}
          style={{ color: "var(--sn-ink-3)" }}
        >
          <ICaret size={15} style={{ transform: rail ? "rotate(-90deg)" : "rotate(90deg)" }} />
        </button>
      </div>
    </nav>
  );
}
