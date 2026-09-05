"use client";

/**
 * HIGHWATER markası.
 *
 * İsim finansın kendi terimi: high-water mark — özsermayenin gördüğü en
 * yüksek seviye (motorda `equity_peak` olarak zaten yaşıyor). Sarnıç
 * mirası işarette sürer: su çizgisi + onu AŞAN ölçüm oku = high water.
 *
 * İşaret bir sarnıcın kesitidir: kubbeli hazne, içinde su seviyesi, suyun
 * üstünde yükselen ölçüm çizgisi. Sistemin kendisi de bu: birikmiş
 * likiditeyi ölçen bir hazne. "S harfli amber kutu" değil.
 *
 * Tek renk + zemin: işaret her boyutta tek `currentColor` ile çizilir,
 * amber kakma yalnız `tile` varyantında. Karanlık/aydınlık temada aynı
 * dosya çalışır.
 */

import { cx } from "@/design/cx";

export function LogoMark({
  size = 28,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden
      className={className}
    >
      {/* kubbeli hazne */}
      <path
        d="M6 13.5C6 8.5 10 5 16 5s10 3.5 10 8.5V23a4 4 0 0 1-4 4H10a4 4 0 0 1-4-4V13.5Z"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinejoin="round"
      />
      {/* su seviyesi — iki sakin dalga */}
      <path
        d="M9.5 19c1.6-1.3 3.4-1.3 5 0s3.4 1.3 5 0 3.4-1.3 5 0"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.55"
      />
      {/* ölçüm: sudan yükselen çizgi + tepe noktası */}
      <path
        d="M16 19.5V11.5"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <path
        d="M12.8 14.2 16 11l3.2 3.2"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Amber karo içinde işaret — kenar çubuğu ve giriş ekranı. */
export function LogoTile({ size = 28 }: { size?: number }) {
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-[var(--sn-r-sm)]"
      style={{
        width: size,
        height: size,
        background: "var(--sn-brand-solid)",
        color: "var(--sn-on-brand)",
      }}
    >
      <LogoMark size={Math.round(size * 0.72)} />
    </span>
  );
}

/** İşaret + yazı — başlıklar için. Yazı ASLA mono değildir. */
export function LogoWordmark({
  tile = true,
  sub,
  className,
}: {
  tile?: boolean;
  sub?: string;
  className?: string;
}) {
  return (
    <span className={cx("flex min-w-0 items-center gap-2.5", className)}>
      {tile ? <LogoTile /> : <LogoMark size={22} className="text-[var(--sn-brand)]" />}
      <span className="min-w-0">
        <span
          className="block truncate font-semibold"
          style={{
            fontSize: "var(--sn-t-body)",
            color: "var(--sn-ink)",
            letterSpacing: "0.02em",
          }}
        >
          HIGHWATER
        </span>
        {sub && (
          <span className="block truncate" style={{ fontSize: 10, color: "var(--sn-ink-3)" }}>
            {sub}
          </span>
        )}
      </span>
    </span>
  );
}
