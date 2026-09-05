"use client";

/**
 * Sayfa manşeti (masthead) — DESIGN-V3 §3.
 *
 * Her sayfa aynı üç şeyle açılır: başlık, tek cümle duruş, "tazelendi"
 * damgası. Kılavuz bir düğmenin arkasında (uicean Collapsible değil,
 * çünkü manşetin altında bir yüzey değil bir metin bloğu açılır).
 * İçerik 12 sütunluk ızgarada, azami 1440px; boşluk cömert.
 */

import { useState, type ReactNode } from "react";
import { cx } from "@/design/cx";
import { IInfo } from "@/design/icons";

export function Page({
  title,
  summary,
  actions,
  guide,
  children,
  wide = false,
  stamp,
}: {
  title: string;
  /** Tek cümle: bu sayfa ne gösteriyor? Boş bırakılmaz. */
  summary: string;
  actions?: ReactNode;
  /** "Nasıl okunur" içeriği. */
  guide?: ReactNode;
  children: ReactNode;
  wide?: boolean;
  /** Sağ üstte küçük zaman damgası / not ("12 sn önce tazelendi"). */
  stamp?: ReactNode;
}) {
  const [guideOpen, setGuideOpen] = useState(false);

  return (
    <div className={cx("mx-auto w-full px-4 py-5 sm:px-6", wide ? "max-w-none" : "max-w-[1560px]")}>
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <h1 className="text-[19px] font-semibold tracking-[-0.015em] text-ink">{title}</h1>
          <p className="mt-0.5 max-w-[84ch] text-[13px] leading-snug text-ink-3">{summary}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {stamp && <span className="text-[12px] text-ink-3">{stamp}</span>}
          {guide && (
            <button
              type="button"
              onClick={() => setGuideOpen((open) => !open)}
              aria-expanded={guideOpen}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[12.5px] text-ink-2 transition-colors hover:bg-inset hover:text-ink"
            >
              <IInfo size={14} />
              Nasıl okunur
            </button>
          )}
          {actions}
        </div>
      </header>

      {guide && guideOpen && (
        <div className="sn-fade-up mt-4 rounded-2xl border border-line bg-elev px-5 py-4">{guide}</div>
      )}

      <div className="mt-4 flex flex-col gap-4">{children}</div>
    </div>
  );
}

/** Kılavuz içindeki bir bölüm: küçük büyük-harf başlık + serbest metin. */
export function GuideSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-4 first:mt-0">
      <h3 className="text-[11.5px] font-semibold tracking-[0.06em] text-ink-3 uppercase">{title}</h3>
      <div className="mt-1.5 flex max-w-[84ch] flex-col gap-1.5 text-[13px] leading-[1.55] text-ink-2">{children}</div>
    </section>
  );
}
