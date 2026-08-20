"use client";

/**
 * Açıklama katmanı.
 *
 * Sistemin kuralı: **açıklanamayan hiçbir sayı ekranda durmaz.** Bu dosya o
 * kuralın uygulama aracıdır. Dört seviye açıklama sunar ve hepsi aynı
 * sözlükten (`lib/glossary.ts`) beslenir — metin iki yerde yazılmaz.
 *
 *   <Term id="havuz">havuz</Term>   satır içi terim, üstüne gelince balon
 *   <InfoDot id="havuz" />          başlık yanındaki (i) işareti
 *   <Explain id="havuz" />          kart içinde açık paragraf
 *   <PageIntro ... />               sayfanın en üstündeki "bu sayfa ne işe yarar"
 *
 * HashUI'ın kendi `Tooltip`'i tek satırlıktır (`whitespace-nowrap`); açıklama
 * cümleleri için burada sarmalı ve genişliği sınırlı kendi balonumuz var.
 */

import { useEffect, useId, useState, type ReactNode } from "react";
import { IInfo, IChevronDown, cx } from "@/ui";
import { GLOSSARY, type TermEntry } from "@/lib/glossary";

/* ------------------------------------------------------------------ */
/*  Balon                                                              */
/* ------------------------------------------------------------------ */

/**
 * Sarmalı açıklama balonu.
 *
 * Hover **ve** klavye odağıyla açılır; dokunmatikte de çalışsın diye
 * tetikleyici bir `<button>`tur. `aria-describedby` ile balon metni ekran
 * okuyucuya bağlanır.
 */
export function InfoTip({
  title,
  body,
  children,
  side = "top",
  align = "center",
  width = 280,
  className,
}: {
  title?: string;
  body: string;
  children: ReactNode;
  side?: "top" | "bottom";
  align?: "center" | "start" | "end";
  width?: number;
  className?: string;
}) {
  const id = useId();
  if (!body) return <>{children}</>;

  return (
    <span className={cx("group/tip relative inline-flex align-middle", className)}>
      <button
        type="button"
        aria-describedby={id}
        // Balon bilgi taşır, eylem üretmez: tıklama varsayılanı bastırılır.
        onClick={(e) => e.preventDefault()}
        className="inline-flex cursor-help items-center gap-1 text-left"
      >
        {children}
      </button>
      <span
        id={id}
        role="tooltip"
        style={{ width }}
        className={cx(
          "pointer-events-none absolute z-[60] rounded-lg border border-line bg-surface p-3 text-left opacity-0 shadow-pop transition-opacity duration-150 group-hover/tip:opacity-100 group-focus-within/tip:opacity-100",
          side === "top" ? "bottom-full mb-2" : "top-full mt-2",
          align === "center" && "left-1/2 -translate-x-1/2",
          align === "start" && "left-0",
          align === "end" && "right-0",
        )}
      >
        {title && (
          <span className="mb-1 block text-[12px] font-semibold text-ink">{title}</span>
        )}
        <span className="block text-[12px] leading-relaxed whitespace-normal text-ink-2">
          {body}
        </span>
      </span>
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Satır içi terim                                                    */
/* ------------------------------------------------------------------ */

/**
 * Sözlükteki bir terimi satır içinde işaretler.
 *
 * Çocuk verilmezse sözlükteki adı basar — `<Term id="havuz" />` yeterlidir.
 * Sözlükte olmayan bir kimlik verilirse süsleme yapılmaz ve metin sade
 * görünür: eksik sözlük kaydı sayfayı bozmaz, sadece açıklamasız bırakır.
 */
export function Term({
  id,
  children,
  className,
  side,
}: {
  id: string;
  children?: ReactNode;
  className?: string;
  side?: "top" | "bottom";
}) {
  const entry = GLOSSARY[id];
  const text = children ?? entry?.label ?? id;
  if (!entry) return <span className={className}>{text}</span>;

  return (
    <InfoTip title={entry.label} body={entry.short} side={side} className={className}>
      <span className="term-underline">{text}</span>
    </InfoTip>
  );
}

/**
 * Başlık, etiket veya sütun adının yanındaki (i).
 *
 * `id` verilirse sözlükten, `text` verilirse doğrudan yazılan metinden
 * beslenir. Sayfaya özgü tek seferlik açıklamalar için `text` kullanılır;
 * kavramlar sözlüğe girer.
 */
export function InfoDot({
  id,
  title,
  text,
  side = "top",
  align = "center",
  className,
}: {
  id?: string;
  title?: string;
  text?: string;
  side?: "top" | "bottom";
  align?: "center" | "start" | "end";
  className?: string;
}) {
  const entry = id ? GLOSSARY[id] : undefined;
  const body = text ?? entry?.short ?? "";
  if (!body) return null;

  return (
    <InfoTip
      title={title ?? entry?.label}
      body={body}
      side={side}
      align={align}
      className={className}
    >
      <IInfo
        size={13}
        className="shrink-0 text-ink-3 transition-colors group-hover/tip:text-brand"
        aria-label="Açıklama"
      />
    </InfoTip>
  );
}

/* ------------------------------------------------------------------ */
/*  Açık paragraf                                                      */
/* ------------------------------------------------------------------ */

/**
 * Sözlük kaydını kart içinde açık metin olarak basar.
 *
 * `long` varsa onu, yoksa `short`u kullanır. `**kalın**` işaretlemesi ve
 * satır sonları desteklenir — sözlükteki bot durumu / çıkış sebebi gibi
 * listeler bu sayede okunur çıkıyor.
 */
export function Explain({
  id,
  compactStyle = false,
  showTitle = true,
  className,
}: {
  id: string;
  compactStyle?: boolean;
  showTitle?: boolean;
  className?: string;
}) {
  const entry = GLOSSARY[id];
  if (!entry) return null;

  return (
    <div className={cx("text-[13px] leading-relaxed", className)}>
      {showTitle && (
        <div className="mb-1.5 text-[13px] font-semibold text-ink">{entry.label}</div>
      )}
      <RichText text={compactStyle ? entry.short : (entry.long ?? entry.short)} />
      {entry.action && !compactStyle && (
        <p className="mt-2 border-l-2 border-brand pl-3 text-[12.5px] text-ink-2">
          <span className="font-medium text-ink">Ne yapmalı: </span>
          {entry.action}
        </p>
      )}
      {entry.see && entry.see.length > 0 && !compactStyle && (
        <div className="mt-2.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[12px] text-ink-3">
          <span>İlgili:</span>
          {entry.see
            .filter((s) => GLOSSARY[s])
            .map((s) => (
              <Term key={s} id={s} className="text-ink-2" />
            ))}
        </div>
      )}
    </div>
  );
}

/**
 * `**kalın**` ve satır sonlarını işleyen küçük metin basıcı.
 *
 * Tam bir markdown ayrıştırıcısı değil ve olmamalı: sözlük metinleri
 * kontrolümüzde, bu yüzden iki kural yetiyor. `dangerouslySetInnerHTML`
 * kullanılmaz.
 */
export function RichText({ text, className }: { text: string; className?: string }) {
  const paragraphs = text.split("\n").filter((p) => p.trim().length > 0);

  return (
    <div className={cx("space-y-2 text-ink-2", className)}>
      {paragraphs.map((p, i) => (
        <p key={i}>
          {p.split(/(\*\*[^*]+\*\*)/g).map((chunk, j) =>
            chunk.startsWith("**") && chunk.endsWith("**") ? (
              <strong key={j} className="font-medium text-ink">
                {chunk.slice(2, -2)}
              </strong>
            ) : (
              <span key={j}>{chunk}</span>
            ),
          )}
        </p>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Sayfa girişi                                                       */
/* ------------------------------------------------------------------ */

/**
 * Her sayfanın başındaki "bu sayfa ne işe yarar" bloğu.
 *
 * Üç soruya cevap verir: **ne gösteriyor**, **nasıl okunur**, **ne
 * yapabilirim**. Varsayılan olarak kapalıdır — her gün paneli açan biri için
 * üç paragraf gürültüdür — ama tercih tarayıcıda saklanır, yani bir kez
 * açan kullanıcı için açık kalır.
 */
export function PageIntro({
  what,
  how,
  action,
  terms = [],
  storageKey,
}: {
  what: string;
  how?: string;
  action?: string;
  /** Sayfada geçen kavramlar — altta tıklanabilir terim şeridi olarak çıkar. */
  terms?: string[];
  /** Açık/kapalı tercihinin saklanacağı anahtar. Sayfa başına benzersiz. */
  storageKey: string;
}) {
  const key = `sarnic.intro.${storageKey}`;
  /*
   * Varsayılan **açık**: sistemi bilmeyen kullanıcı ilk karşılaşmada
   * açıklamayı görmeli. Kapatan kullanıcının tercihi saklanır.
   *
   * Tercih `useState` başlatıcısında değil etkide okunuyor: sunucuda
   * `localStorage` yok, ilk çizim ile hidrasyon farklı sonuç verirdi.
   */
  const [open, setOpen] = useState(true);

  useEffect(() => {
    try {
      if (localStorage.getItem(key) === "0") setOpen(false);
    } catch {
      /* özel sekmede localStorage kapalı olabilir */
    }
  }, [key]);

  const toggle = () => {
    setOpen((v) => {
      const next = !v;
      try {
        localStorage.setItem(key, next ? "1" : "0");
      } catch {
        /* özel sekmede localStorage kapalı olabilir — sorun değil */
      }
      return next;
    });
  };

  const known = terms.filter((t) => GLOSSARY[t]);

  return (
    <div className="rounded-xl border border-line bg-elev">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-4 py-2.5 text-left"
      >
        <IInfo size={14} className="shrink-0 text-brand" />
        <span className="text-[13px] font-medium text-ink">Bu sayfa ne işe yarar?</span>
        <IChevronDown
          size={14}
          className={cx(
            "ml-auto shrink-0 text-ink-3 transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <div className="space-y-3 border-t border-line px-4 py-3.5 text-[13px] leading-relaxed">
          <div>
            <div className="mb-0.5 text-[11px] font-semibold tracking-wide text-ink-3 uppercase">
              Ne gösteriyor
            </div>
            <RichText text={what} />
          </div>

          {how && (
            <div>
              <div className="mb-0.5 text-[11px] font-semibold tracking-wide text-ink-3 uppercase">
                Nasıl okunur
              </div>
              <RichText text={how} />
            </div>
          )}

          {action && (
            <div>
              <div className="mb-0.5 text-[11px] font-semibold tracking-wide text-ink-3 uppercase">
                Ne yapabilirim
              </div>
              <RichText text={action} />
            </div>
          )}

          {known.length > 0 && (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-line pt-3 text-[12px] text-ink-3">
              <span>Bu sayfadaki kavramlar:</span>
              {known.map((t) => (
                <Term key={t} id={t} className="text-ink-2" />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Etiketli değer                                                     */
/* ------------------------------------------------------------------ */

/**
 * Etiket + değer satırı; etiketin yanında isteğe bağlı açıklama.
 *
 * Detay panellerinin temel yapı taşı. Değer `ReactNode` çünkü çoğu zaman
 * biçimlenmiş bir sayı bileşeni gelir.
 */
export function Field({
  label,
  term,
  hint,
  value,
  className,
}: {
  label: string;
  /** Sözlük terimi — etiketin yanına (i) koyar. */
  term?: string;
  /** Sayfaya özgü açıklama; `term` yerine ya da onunla birlikte. */
  hint?: string;
  value: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("flex items-baseline justify-between gap-4 py-1.5", className)}>
      <span className="flex items-center gap-1 text-[12.5px] text-ink-2">
        {label}
        {(term || hint) && <InfoDot id={term} text={hint} align="start" />}
      </span>
      <span className="text-right text-[13px] text-ink">{value}</span>
    </div>
  );
}

/** Sözlük kaydını doğrudan almak isteyen bileşenler için. */
export function useTerm(id: string): TermEntry | undefined {
  return GLOSSARY[id];
}
