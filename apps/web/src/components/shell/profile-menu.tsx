"use client";

/**
 * Profil menüsü — kimlik, yetki ve çıkış.
 *
 * Yetkinin ne anlama geldiği burada yazılıdır: kullanıcı neyi
 * yapamayacağını, yapamadığı anda değil önceden bilmeli.
 */

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { IChevronDown, ILock, IUserCircle, cx } from "@/ui";
import { useAuth } from "@/lib/auth";
import { ROLE_HINT, ROLE_LABEL } from "@/lib/humanize";

export function ProfileMenu() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  /* Dışarı tıklama ve Esc kapatır. */
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!user) return null;

  const initials =
    (user.display_name || user.email)
      .split(/[\s@.]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toLocaleUpperCase("tr"))
      .join("") || "?";

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex items-center gap-1.5 rounded-lg py-1 pr-1.5 pl-1 hover:bg-inset"
      >
        <span className="flex size-7 items-center justify-center rounded-full border border-line bg-elev text-[11px] font-semibold text-ink-2">
          {initials}
        </span>
        <IChevronDown size={13} className={cx("text-ink-3 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-1.5 w-64 rounded-xl border border-line bg-surface p-1.5 shadow-pop"
        >
          <div className="border-b border-line px-2.5 pt-1.5 pb-2.5">
            <div className="truncate text-[13px] font-medium text-ink">
              {user.display_name || user.email}
            </div>
            <div className="truncate text-[12px] text-ink-3">{user.email}</div>
            <div className="mt-2 rounded-lg bg-inset px-2 py-1.5">
              <div className="text-[11.5px] font-medium text-ink">
                {ROLE_LABEL[user.role] ?? user.role}
              </div>
              <div className="mt-0.5 text-[11.5px] leading-snug text-ink-2">
                {ROLE_HINT[user.role]}
              </div>
            </div>
            {!user.totp_enabled && (
              <div className="mt-2 flex items-start gap-1.5 rounded-lg bg-warn-soft px-2 py-1.5 text-[11.5px] text-ink-2">
                <ILock size={12} className="mt-0.5 shrink-0 text-warn" />
                İki adımlı doğrulama kapalı. Panel dışarı açıksa bu ciddi bir risktir.
              </div>
            )}
          </div>

          <Link
            href="/hesap"
            onClick={() => setOpen(false)}
            role="menuitem"
            className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-[13px] text-ink-2 hover:bg-inset hover:text-ink"
          >
            <IUserCircle size={15} />
            Hesabım
          </Link>

          <button
            type="button"
            role="menuitem"
            onClick={() => void logout()}
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] text-ink-2 hover:bg-inset hover:text-ink"
          >
            <ILock size={15} />
            Çıkış yap
          </button>
        </div>
      )}
    </div>
  );
}
