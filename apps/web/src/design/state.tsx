"use client";

/**
 * Yükleniyor / hata / boş — üç dalın tek yeri.
 *
 * Her sayfada bu üç dalı elle yazmak hem tekrar hem tutarsızlık üretiyordu:
 * bir sayfa boş durumu gösterirken diğeri sessizce boş bir tablo bırakıyordu.
 * Boş bir tablo, "kayıt yok" ile "veri gelmedi"yi aynı gösterir.
 */

import type { ReactNode } from "react";
import { cx } from "./cx";
import { IWarn } from "./icons";
import { Empty, Skeleton, type Tone } from "./primitives";

/* ------------------------------------------------------------------ */

export function LoadingRows({
  rows = 6,
  rowHeight = 14,
  className,
}: {
  rows?: number;
  /* Gerçek satır yüksekliğiyle eşleşirse iskelet → veri geçişi zıplamaz. */
  rowHeight?: number;
  className?: string;
}) {
  return (
    <div className={cx("flex flex-col gap-2 p-3", className)}>
      {Array.from({ length: rows }).map((_, index) => (
        <Skeleton key={index} h={rowHeight} w={`${100 - (index % 3) * 12}%`} />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */

export function ErrorBox({
  title = "Veri alınamadı",
  message,
  hint,
  action,
  className,
}: {
  title?: string;
  message?: string;
  hint?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cx("flex items-start gap-2.5 rounded-[var(--sn-r-md)] px-4 py-3.5", className)}
      style={{ background: "var(--sn-down-bg)", border: "1px solid color-mix(in oklab, var(--sn-down) 30%, transparent)" }}
    >
      <span className="mt-0.5 shrink-0" style={{ color: "var(--sn-down)" }}>
        <IWarn size={15} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="font-medium" style={{ fontSize: "var(--sn-t-body)", color: "var(--sn-ink)" }}>
          {title}
        </div>
        <p
          className="mt-1"
          style={{ fontSize: "var(--sn-t-caption)", color: "var(--sn-ink-2)", lineHeight: 1.5 }}
        >
          {hint ?? "Sunucuya ulaşılamadı ya da istek reddedildi."}
        </p>
        {message && (
          <p
            className="sn-num mt-1.5 break-words"
            style={{ fontSize: "var(--sn-t-micro)", color: "var(--sn-ink-3)" }}
          >
            {message}
          </p>
        )}
        {action && <div className="mt-2.5">{action}</div>}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

/** Renkli bilgi kutusu — sayfa içi kalıcı uyarılar için. */
export function Alert({
  tone = "info",
  title,
  children,
  action,
}: {
  tone?: Tone;
  title?: ReactNode;
  children: ReactNode;
  action?: ReactNode;
}) {
  const color =
    tone === "down"
      ? "var(--sn-down)"
      : tone === "warn"
        ? "var(--sn-warn)"
        : tone === "up"
          ? "var(--sn-up)"
          : tone === "brand"
            ? "var(--sn-brand)"
            : "var(--sn-info)";
  const background =
    tone === "down"
      ? "var(--sn-down-bg)"
      : tone === "warn"
        ? "var(--sn-warn-bg)"
        : tone === "up"
          ? "var(--sn-up-bg)"
          : tone === "brand"
            ? "var(--sn-brand-bg)"
            : "var(--sn-info-bg)";

  return (
    <div
      className="flex items-start gap-2.5 rounded-[var(--sn-r-md)] px-4 py-3"
      style={{ background, border: `1px solid color-mix(in oklab, ${color} 28%, transparent)` }}
    >
      <span
        aria-hidden
        className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ background: color }}
      />
      <div className="min-w-0 flex-1" style={{ fontSize: "var(--sn-t-body)", lineHeight: 1.5 }}>
        {title && (
          <div className="font-medium" style={{ color: "var(--sn-ink)" }}>
            {title}
          </div>
        )}
        <div style={{ color: "var(--sn-ink-2)" }}>{children}</div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ */

/**
 * Sorgu durumunu tek yerde çözer.
 *
 * `empty` verilirse dizi boşluğu da kontrol edilir; verilmezse yalnızca
 * yükleniyor/hata dalları ele alınır ve boş dizi çocuğa geçer (bazı
 * bileşenler kendi boş durumunu daha iyi anlatır — örneğin ızgara).
 */
export function Async<T>({
  query,
  empty,
  children,
  loading,
}: {
  query: { isLoading: boolean; isError: boolean; error?: unknown; data?: T };
  empty?: { title: string; hint?: ReactNode; action?: ReactNode };
  children: (data: T) => ReactNode;
  loading?: ReactNode;
}) {
  if (query.isLoading) return <>{loading ?? <LoadingRows />}</>;

  if (query.isError) {
    const message = query.error instanceof Error ? query.error.message : String(query.error ?? "");
    return <ErrorBox message={message} />;
  }

  const data = query.data;
  if (data === undefined || data === null) {
    return <Empty title={empty?.title ?? "Kayıt yok"} hint={empty?.hint} />;
  }

  if (empty && Array.isArray(data) && data.length === 0) {
    return <Empty title={empty.title} hint={empty.hint} action={empty.action} />;
  }

  return <>{children(data)}</>;
}
