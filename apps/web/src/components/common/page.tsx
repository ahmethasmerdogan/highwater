"use client";

/**
 * Sayfa iskeleti ve durum bileşenleri.
 *
 * Her panel sayfası aynı yapıyı kullanır: başlık + tek cümlelik özet +
 * eylemler, altında "bu sayfa ne işe yarar" bloğu, sonra içerik.
 *
 * Boş durum ve hata durumu burada standarttır çünkü tasarım kuralı şudur:
 * boş durum bir davettir, hata bir yönlendirmedir — ikisi de özür dilemez ve
 * ikisi de kullanıcıya ne yapacağını söyler.
 */

import type { ReactNode } from "react";
import { Card, IWarning, IInfo, ISpinner, Skeleton, cx } from "@/ui";
import { InfoDot, PageIntro } from "./explain";

/* ------------------------------------------------------------------ */
/*  Sayfa                                                              */
/* ------------------------------------------------------------------ */

export function Page({
  title,
  description,
  actions,
  intro,
  children,
  wide = false,
}: {
  title: string;
  /** Tek cümle: bu sayfa neyi gösterir. Başlığın altında, her zaman görünür. */
  description?: string;
  actions?: ReactNode;
  /** "Bu sayfa ne işe yarar" bloğu. Sayfa başına bir tane. */
  intro?: {
    what: string;
    how?: string;
    action?: string;
    terms?: string[];
    storageKey: string;
  };
  children: ReactNode;
  /** Geniş yerleşim — yoğun tablolar için kenar boşluğunu daraltır. */
  wide?: boolean;
}) {
  return (
    <div className={cx("mx-auto w-full px-5 py-5 md:px-7 md:py-6", wide ? "max-w-none" : "max-w-[1600px]")}>
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[19px] font-semibold tracking-tight text-ink">{title}</h1>
          {description && (
            <p className="mt-1 max-w-3xl text-[13px] leading-relaxed text-ink-2">
              {description}
            </p>
          )}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </header>

      {intro && (
        <div className="mb-4">
          <PageIntro {...intro} />
        </div>
      )}

      <div className="space-y-4">{children}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Bölüm                                                              */
/* ------------------------------------------------------------------ */

/**
 * Kart içindeki adlandırılmış bölüm.
 *
 * `description` bölümün ne gösterdiğini söyler; `term` başlığın yanına
 * sözlük açıklaması koyar. Bir bölüm başlığı açıklamasız duruyorsa,
 * muhtemelen açıklanması gerekiyordur.
 */
export function Section({
  title,
  description,
  term,
  hint,
  actions,
  children,
  padded = true,
  className,
}: {
  title?: string;
  description?: string;
  term?: string;
  hint?: string;
  actions?: ReactNode;
  children: ReactNode;
  /** Tabloların kart kenarına yapışması için `false`. */
  padded?: boolean;
  className?: string;
}) {
  return (
    <Card className={cx("overflow-hidden", className)}>
      {(title || actions) && (
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-3.5">
          <div className="min-w-0">
            {title && (
              <h2 className="flex items-center gap-1.5 text-[14px] font-semibold text-ink">
                {title}
                {(term || hint) && <InfoDot id={term} text={hint} align="start" />}
              </h2>
            )}
            {description && (
              <p className="mt-1 max-w-2xl text-[12.5px] leading-relaxed text-ink-2">
                {description}
              </p>
            )}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={cx(padded && "px-5 py-4")}>{children}</div>
    </Card>
  );
}

/** Ölçüm kutularının ızgarası. */
export function StatGrid({
  children,
  cols = 4,
  className,
}: {
  children: ReactNode;
  cols?: 2 | 3 | 4 | 5;
  className?: string;
}) {
  return (
    <div
      className={cx(
        "grid gap-3",
        cols === 2 && "grid-cols-1 sm:grid-cols-2",
        cols === 3 && "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
        cols === 4 && "grid-cols-2 lg:grid-cols-4",
        cols === 5 && "grid-cols-2 lg:grid-cols-5",
        className,
      )}
    >
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Durumlar                                                           */
/* ------------------------------------------------------------------ */

/**
 * Boş durum.
 *
 * "Kayıt yok" yazmak yeterli değildir: kullanıcı **neden** boş olduğunu ve
 * doluysa ne göreceğini bilmelidir.
 */
export function Empty({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cx(
        "flex flex-col items-center justify-center rounded-xl border border-dashed border-line-strong px-6 py-12 text-center",
        className,
      )}
    >
      <span className="flex size-10 items-center justify-center rounded-lg border border-line bg-elev text-ink-3">
        <IInfo size={18} />
      </span>
      <div className="mt-3 text-[14px] font-medium text-ink">{title}</div>
      {description && (
        <p className="mt-1.5 max-w-md text-[13px] leading-relaxed text-ink-2">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/**
 * Hata durumu.
 *
 * Hata özür dilemez; ne olduğunu ve ne yapılacağını söyler. Sunucudan gelen
 * teknik mesaj gizlenmez ama ikinci planda durur.
 */
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
      className={cx(
        "rounded-xl border border-down/30 bg-down-soft px-4 py-3.5",
        className,
      )}
    >
      <div className="flex items-start gap-2.5">
        <IWarning size={16} className="mt-0.5 shrink-0 text-down" />
        <div className="min-w-0 flex-1">
          <div className="text-[13.5px] font-medium text-ink">{title}</div>
          <p className="mt-1 text-[12.5px] leading-relaxed text-ink-2">
            {hint ?? "Sunucuya ulaşılamadı ya da istek reddedildi."}
          </p>
          {message && (
            <p className="mt-1.5 font-mono text-[11.5px] break-words text-ink-3">{message}</p>
          )}
          {action && <div className="mt-2.5">{action}</div>}
        </div>
      </div>
    </div>
  );
}

/** Yükleniyor — tablo yerine iskelet satırlar. */
export function LoadingRows({ rows = 6, className }: { rows?: number; className?: string }) {
  return (
    <div className={cx("space-y-2 p-1", className)}>
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-9 w-full rounded-lg" />
      ))}
    </div>
  );
}

/** Satır içi küçük yükleniyor göstergesi. */
export function Spinner({ label }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-[13px] text-ink-2">
      <ISpinner size={14} className="animate-spin" />
      {label ?? "Yükleniyor…"}
    </span>
  );
}

/**
 * Yükleme / hata / boş üçlüsünü tek yerde çözer.
 *
 * Her sayfada bu üç dalı elle yazmak hem tekrar hem de tutarsızlık üretiyordu;
 * bir sayfa boş durumu gösterirken diğeri sessizce boş tablo bırakıyordu.
 */
export function Async<T>({
  query,
  empty,
  children,
  loading,
}: {
  query: { isLoading: boolean; isError: boolean; error?: unknown; data?: T };
  /** Veri boşsa gösterilecek; verilmezse boş kontrolü yapılmaz. */
  empty?: { title: string; description?: string; action?: ReactNode };
  children: (data: T) => ReactNode;
  loading?: ReactNode;
}) {
  if (query.isLoading) return <>{loading ?? <LoadingRows />}</>;

  if (query.isError) {
    const message =
      query.error instanceof Error ? query.error.message : String(query.error ?? "");
    return <ErrorBox message={message} />;
  }

  const data = query.data;
  if (data === undefined || data === null) {
    return <Empty title={empty?.title ?? "Kayıt yok"} description={empty?.description} />;
  }

  if (empty && Array.isArray(data) && data.length === 0) {
    return <Empty title={empty.title} description={empty.description} action={empty.action} />;
  }

  return <>{children(data)}</>;
}
