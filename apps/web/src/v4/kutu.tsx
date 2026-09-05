"use client";

/**
 * Yerleşim ilkelleri — bölüm, başlık, muhakeme bloğu.
 *
 * "Kart" yoktur. Kart bir nesneyi kutular; bu panelde nesne değil **soru**
 * vardır (DESIGN-V4 §3: ekranlar nesne türüne göre değil soruya göre
 * bölündü). `Bolum` bir sorunun cevabını taşıyan çerçevedir ve başlığında
 * o soruyu yazar.
 */

import type { ReactNode } from "react";

export function Bolum({
  baslik,
  soru,
  sag,
  children,
  duvar,
}: {
  baslik: string;
  /** Bu bölümün cevapladığı tek soru. Başlığın altında serif olarak durur. */
  soru?: string;
  sag?: ReactNode;
  children: ReactNode;
  /** Duvar ölçeği: Nöbet ekranının uzaktan okunan bölümleri. */
  duvar?: boolean;
}) {
  return (
    <section className="v4-bolum">
      <header
        className="flex items-start justify-between gap-4 px-4 pt-3 pb-2"
        style={{ borderBottom: "1px solid var(--v4-cizgi)" }}
      >
        <div className="min-w-0">
          <h2
            className="v4-etiket"
            style={{ color: "var(--v4-murekkep)", letterSpacing: "0.1em" }}
          >
            {baslik}
          </h2>
          {soru ? (
            <p
              className="v4-muhakeme mt-1"
              style={{
                color: "var(--v4-ikincil)",
                fontSize: duvar ? 14.5 : 13.5,
                maxWidth: "72ch",
              }}
            >
              {soru}
            </p>
          ) : null}
        </div>
        {sag ? <div className="shrink-0">{sag}</div> : null}
      </header>
      {children}
    </section>
  );
}

/** Muhakeme sesi: iddia, gerekçe, çürütme. Serif — makinenin sayısı değil. */
export function Muhakeme({ children, dar }: { children: ReactNode; dar?: boolean }) {
  return (
    <p className="v4-muhakeme" style={{ maxWidth: dar ? "52ch" : "72ch" }}>
      {children}
    </p>
  );
}

/** Etiket sesi: alan adı. Sans, 11px, büyük harf. */
export function Etiket({ children }: { children: ReactNode }) {
  return <span className="v4-etiket">{children}</span>;
}

/** Bölüm gövdesinde ızgara — duvar ölçeğinde geniş, masa ölçeğinde yoğun. */
export function Izgara({ children, sutun = 3 }: { children: ReactNode; sutun?: number }) {
  return (
    <div
      className="grid gap-x-8 gap-y-5 px-4 py-4"
      style={{ gridTemplateColumns: `repeat(auto-fit, minmax(${sutun >= 4 ? 150 : 190}px, 1fr))` }}
    >
      {children}
    </div>
  );
}

/** Yatay ayırıcı — bölüm içinde iki mantıksal blok arasında. */
export function Ayirici({ etiket }: { etiket?: string }) {
  return (
    <div
      className="flex items-center gap-3 px-4 py-2"
      style={{ borderTop: "1px solid var(--v4-cizgi)", background: "var(--v4-oyuk)" }}
    >
      {etiket ? <Etiket>{etiket}</Etiket> : null}
    </div>
  );
}
