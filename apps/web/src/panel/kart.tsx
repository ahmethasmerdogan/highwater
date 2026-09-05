"use client";

/**
 * Panel çerçeveleri — BoardUI'nin kart reçetesi (rounded-3xl, hairline border).
 *
 * "Kart" burada bir nesneyi değil bir **soruyu** kutular: ekranlar nesne türüne
 * göre değil soruya göre bölündü (DESIGN-V4 §3). Başlık sorunun kendisini
 * taşır, böylece kullanıcı ekrandaki her bloğun neyi cevapladığını okur.
 */

import type { ReactNode } from "react";
import { cx } from "@/utils/cx";

export function Kart({
  baslik,
  soru,
  sag,
  children,
  className,
  govdeSiz,
}: {
  baslik: string;
  /** Bu bölümün cevapladığı tek soru. */
  soru?: string;
  sag?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Tablo doğrudan kenara otursun diye iç dolguyu kaldırır. */
  govdeSiz?: boolean;
}) {
  return (
    <section
      className={cx(
        "flex min-w-0 flex-col overflow-hidden rounded-3xl border border-border-button-default bg-background-primary-default",
        className,
      )}
    >
      <header className="flex flex-wrap items-start justify-between gap-3 px-5 pt-4 pb-3">
        <div className="min-w-0">
          <h2 className="text-body-medium text-text-primary">{baslik}</h2>
          {soru ? (
            <p className="mt-0.5 max-w-[78ch] text-body-2-regular text-text-tertiary">{soru}</p>
          ) : null}
        </div>
        {sag ? <div className="flex shrink-0 items-center gap-2">{sag}</div> : null}
      </header>
      <div className={cx("min-w-0 flex-1", govdeSiz ? "" : "px-5 pb-5")}>{children}</div>
    </section>
  );
}

/** Ölçüm ızgarası — kart içinde eşit genişlikte sayı sütunları. */
export function Izgara({ children, min = 190 }: { children: ReactNode; min?: number }) {
  return (
    <div
      className="grid gap-x-6 gap-y-5"
      style={{ gridTemplateColumns: `repeat(auto-fit, minmax(${min}px, 1fr))` }}
    >
      {children}
    </div>
  );
}

/** Muhakeme: iddia, gerekçe, çürütme. Makinenin sayısı değil, insanın cümlesi. */
export function Not({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cx("max-w-[80ch] text-body-2-regular text-text-secondary", className)}>
      {children}
    </p>
  );
}

/** Kart içinde alt banda oturan gerekçe şeridi. */
export function Serit({
  children,
  ton = "notr",
}: {
  children: ReactNode;
  ton?: "notr" | "uyari" | "bozuk";
}) {
  return (
    <div
      className={cx(
        "border-t px-5 py-3",
        ton === "bozuk"
          ? "border-border-error-default bg-status-rose-background/40"
          : ton === "uyari"
            ? "border-separator-border bg-status-yellow-background/40"
            : "border-separator-border bg-background-secondary-default",
      )}
    >
      {children}
    </div>
  );
}
