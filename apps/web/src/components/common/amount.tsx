"use client";

/**
 * Sayı bileşenleri — bozulmaz kural 6'nın uygulama yeri.
 *
 * Kural: her sayı monospace, `tabular-nums`, sağa hizalı. Ekranda elle
 * biçimlenmiş bir sayı görürseniz o bir hatadır; hepsi buradan geçer.
 *
 * İki tonlu basım (tam sayı koyu, ondalık açık) gözün ondalığı ayırt etmek
 * için fazladan iş yapmasını engeller — büyük rakamların yan yana durduğu
 * bir panelde bu okunabilirliği belirgin biçimde artırır.
 */

import type { ReactNode } from "react";
import { cx } from "@/ui";
import { EMPTY, direction, num as fmtNum } from "@/lib/format";
import { InfoDot } from "./explain";

/* ------------------------------------------------------------------ */
/*  İki tonlu sayı                                                     */
/* ------------------------------------------------------------------ */

/**
 * Zaten biçimlenmiş bir metni son ondalık ayracından ikiye böler ve iki
 * tonda basar. Birim (`%`, `bps`, `R`, `USD`) ayrı bir tonda sonda durur.
 *
 * Biçimleme kurallarını (`money`, `pctSigned`, `price`…) ikinci kez yazmamak
 * için metin alır: tek doğruluk kaynağı `lib/format.ts`.
 */
export function AmountText({
  text,
  className,
  size = "md",
}: {
  text: string;
  className?: string;
  size?: "sm" | "md" | "lg" | "xl";
}) {
  if (!text || text === EMPTY) {
    return <span className={cx("num text-ink-3", sizeClass[size], className)}>{EMPTY}</span>;
  }

  // Sondaki birimi ayır: "1.234,50 bps" → gövde "1.234,50", birim "bps"
  const unitMatch = text.match(/\s(bps|USD|USDT|R|gün|sa|dk|adet)$/);
  let body = unitMatch ? text.slice(0, -unitMatch[0].length) : text;
  let unit = unitMatch ? unitMatch[1] : "";

  // Sonda birim olarak yapışık duran R (+2,31R) ayrı tonda gösterilir.
  if (!unit && /R$/.test(body) && /\d/.test(body)) {
    body = body.slice(0, -1);
    unit = "R";
  }

  const cut = body.lastIndexOf(",");
  const int = cut === -1 ? body : body.slice(0, cut);
  const frac = cut === -1 ? "" : body.slice(cut);

  return (
    <span className={cx("num", sizeClass[size], className)}>
      <span className="amount-int">{int}</span>
      {frac && <span className="amount-frac">{frac}</span>}
      {unit && <span className="amount-unit">{unit}</span>}
    </span>
  );
}

const sizeClass = {
  sm: "text-[12px]",
  md: "text-[13px]",
  lg: "text-[20px]",
  xl: "text-[28px] leading-tight",
} as const;

/* ------------------------------------------------------------------ */
/*  Yönlü sayı                                                         */
/* ------------------------------------------------------------------ */

/**
 * Yön rengiyle basılan sayı. Yeşil/kırmızı YALNIZCA burada ve `Delta`'da
 * çıkar — renk disiplini tek yerden korunur.
 *
 * `value` rengi belirler, `text` basılan metni. İkisi ayrı çünkü renk ham
 * değerden, metin biçimlenmiş hâlinden gelir.
 */
export function Signed({
  value,
  text,
  className,
  size = "md",
  arrow = false,
}: {
  value: number | null | undefined;
  text: string;
  className?: string;
  size?: "sm" | "md" | "lg" | "xl";
  /** Sayının önüne ▲/▼ koyar. Renk körlüğünde yön tek renkle anlaşılmasın. */
  arrow?: boolean;
}) {
  const dir = direction(value);
  const tone =
    dir === "up" ? "text-up" : dir === "down" ? "text-down" : "text-ink-3";

  return (
    <span className={cx("num inline-flex items-baseline gap-0.5", sizeClass[size], tone, className)}>
      {arrow && dir !== "flat" && (
        <span aria-hidden className="text-[0.8em]">
          {dir === "up" ? "▲" : "▼"}
        </span>
      )}
      <AmountText text={text} size={size} className={cx(tone, "[&_.amount-int]:text-inherit [&_.amount-frac]:text-inherit [&_.amount-frac]:opacity-75")} />
    </span>
  );
}

/** Sade monospace sayı — yön anlamı taşımayan değerler için. */
export function Num({
  value,
  digits = 2,
  className,
  size = "md",
}: {
  value: number | null | undefined;
  digits?: number;
  className?: string;
  size?: "sm" | "md" | "lg" | "xl";
}) {
  return <AmountText text={fmtNum(value, digits)} className={className} size={size} />;
}

/* ------------------------------------------------------------------ */
/*  Ölçüm kutusu                                                       */
/* ------------------------------------------------------------------ */

/**
 * Panel ve detay ekranlarındaki büyük sayı kutusu.
 *
 * `hint` her kutuda **zorunlu gibi** düşünülmelidir: bir sayı ne anlama
 * geldiği yazılmadan büyük puntoyla basılıyorsa, kullanıcı onu yanlış
 * yorumlar.
 */
export function Stat({
  label,
  value,
  sub,
  hint,
  term,
  tone = "neutral",
  className,
}: {
  label: string;
  value: ReactNode;
  /** Alt satır: kıyas, dönem ya da ikincil sayı. */
  sub?: ReactNode;
  hint?: string;
  term?: string;
  tone?: "neutral" | "up" | "down" | "warn";
  className?: string;
}) {
  return (
    <div
      className={cx(
        "rounded-xl border border-line bg-surface px-4 py-3.5",
        tone === "up" && "border-l-2 border-l-up",
        tone === "down" && "border-l-2 border-l-down",
        tone === "warn" && "border-l-2 border-l-warn",
        className,
      )}
    >
      <div className="flex items-center gap-1 text-[11.5px] font-medium tracking-wide text-ink-2 uppercase">
        <span className="truncate">{label}</span>
        {(hint || term) && <InfoDot id={term} text={hint} align="start" />}
      </div>
      <div className="mt-1.5">{value}</div>
      {sub && <div className="mt-1 text-[12px] text-ink-3">{sub}</div>}
    </div>
  );
}
