"use client";

/**
 * Sayfa iskeleti.
 *
 * Eski panelde her sayfanın tepesinde açılıp kapanan bir "Bu sayfa ne işe
 * yarar?" kutusu vardı ve açıkken ekranın yarısını yiyordu; kapalıyken de
 * kimse açmıyordu. Aynı bilgi burada iki yere bölündü:
 *
 *   * tek cümlelik **özet** başlığın hemen altında, her zaman görünür;
 *   * ayrıntı, başlıktaki "nasıl okunur" düğmesinin arkasında.
 *
 * Böylece bilgi kaybolmuyor ama veriyle yer değiştirmiyor.
 */

import { useState, type ReactNode } from "react";
import { cx } from "@/design/cx";
import { Button } from "@/design/primitives";
import { IInfo } from "@/design/icons";

export function Page({
  title,
  summary,
  actions,
  guide,
  children,
  wide = false,
}: {
  title: string;
  /** Tek cümle: bu sayfa ne gösteriyor? Boş bırakılmaz. */
  summary: string;
  actions?: ReactNode;
  /** "Nasıl okunur" panelinin içeriği. */
  guide?: ReactNode;
  children: ReactNode;
  wide?: boolean;
}) {
  const [guideOpen, setGuideOpen] = useState(false);

  return (
    <div className={cx("mx-auto w-full px-4 py-4", wide ? "max-w-none" : "max-w-[1560px]")}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1
            className="font-semibold"
            style={{ fontSize: "var(--sn-t-title-lg)", color: "var(--sn-ink)", letterSpacing: "-0.01em" }}
          >
            {title}
          </h1>
          <p
            className="mt-1 max-w-[86ch]"
            style={{ fontSize: "var(--sn-t-caption)", color: "var(--sn-ink-3)" }}
          >
            {summary}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {guide && (
            <Button
              size="sm"
              variant="quiet"
              icon={<IInfo size={14} />}
              onClick={() => setGuideOpen((open) => !open)}
              aria-expanded={guideOpen}
            >
              Nasıl okunur
            </Button>
          )}
          {actions}
        </div>
      </div>

      {guide && guideOpen && (
        <div
          className="sn-fade-up mt-3 rounded-[var(--sn-r-md)] p-4"
          style={{ background: "var(--sn-panel)", border: "1px solid var(--sn-hairline)" }}
        >
          {guide}
        </div>
      )}

      <div className="mt-4 flex flex-col gap-4">{children}</div>
    </div>
  );
}

/** Kılavuz içindeki bir bölüm: küçük başlık + serbest metin. */
export function GuideSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-4 first:mt-0">
      <h3 className="sn-label">{title}</h3>
      <div
        className="mt-1.5 flex flex-col gap-1.5"
        style={{ fontSize: "var(--sn-t-body)", color: "var(--sn-ink-2)", lineHeight: 1.55, maxWidth: "84ch" }}
      >
        {children}
      </div>
    </section>
  );
}

