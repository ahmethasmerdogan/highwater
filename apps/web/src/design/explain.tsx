"use client";

/**
 * Açıklama katmanı — DESIGN §1: **ekranda açıklanamayan sayı durmaz.**
 *
 * Üç ayrı yoğunlukta aynı sözlükten (`lib/glossary.ts`) beslenir:
 *
 *   `Term`     satır içinde noktalı altı çizili terim, üstüne gelince balon
 *   `InfoDot`  başlığın yanında (i), aynı balon
 *   `Explain`  kart içinde açık paragraf
 *
 * Sözlükte olmayan bir kimlik verilirse süsleme yapılmaz ve metin sade
 * görünür: eksik bir sözlük kaydı sayfayı bozmaz, yalnızca açıklamasız
 * bırakır. Sessizce çökmek, eksik olduğunu belli etmekten kötüdür.
 */

import type { ReactNode } from "react";
import { GLOSSARY, type TermEntry } from "@/lib/glossary";
import { cx } from "./cx";
import { IInfo } from "./icons";
import { Tip } from "./primitives";

/* ------------------------------------------------------------------ */
/*  Balon içeriği                                                      */
/* ------------------------------------------------------------------ */

function Balloon({ title, body }: { title?: string; body: string }) {
  return (
    <span className="block">
      {title && (
        <span
          className="mb-0.5 block font-medium"
          style={{ fontSize: "var(--sn-t-caption)", color: "var(--sn-ink)" }}
        >
          {title}
        </span>
      )}
      <span className="block">{body}</span>
    </span>
  );
}

/* ------------------------------------------------------------------ */

/**
 * Satır içinde bir sözlük terimi.
 *
 * Çocuk verilmezse sözlükteki adı basar — `<Term id="havuz" />` yeter.
 */
export function Term({
  id,
  children,
  className,
}: {
  id: string;
  children?: ReactNode;
  className?: string;
}) {
  const entry = GLOSSARY[id];
  const text = children ?? entry?.label ?? id;
  if (!entry) return <span className={className}>{text}</span>;

  return (
    <Tip content={<Balloon title={entry.label} body={entry.short} />}>
      {/* tabIndex: Radix `asChild` span'e odak vermez; balon klavyeden
          açılamıyordu. Span kalır (metin akışını düğme bozar), odak eklenir. */}
      <span
        tabIndex={0}
        className={cx("sn-focus underline decoration-dotted underline-offset-[3px]", className)}
        style={{ textDecorationColor: "var(--sn-ink-4)", cursor: "help" }}
      >
        {text}
      </span>
    </Tip>
  );
}

/**
 * Başlık, etiket ya da sütun adının yanındaki (i).
 *
 * `id` sözlükten, `text` doğrudan yazılan metinden beslenir. Kavramlar
 * sözlüğe girer; sayfaya özgü tek seferlik açıklamalar `text` kullanır.
 */
export function InfoDot({
  id,
  title,
  text,
  className,
}: {
  id?: string;
  title?: string;
  text?: string;
  className?: string;
}) {
  const entry = id ? GLOSSARY[id] : undefined;
  const body = text ?? entry?.short ?? "";
  if (!body) return null;

  return (
    <Tip content={<Balloon title={title ?? entry?.label} body={body} />}>
      <button
        type="button"
        aria-label={`Açıklama: ${title ?? entry?.label ?? "bilgi"}`}
        className={cx("sn-focus inline-flex shrink-0 border-0 bg-transparent p-0", className)}
        style={{ color: "var(--sn-ink-4)", cursor: "help" }}
      >
        <IInfo size={13} />
      </button>
    </Tip>
  );
}

/* ------------------------------------------------------------------ */
/*  Açık metin                                                         */
/* ------------------------------------------------------------------ */

/**
 * `**kalın**` işaretlemesi ve satır sonları destekleyen küçük basıcı.
 *
 * Tam bir markdown çözümleyicisi bilerek yok: sözlük metinlerinde yalnızca
 * bu ikisi kullanılıyor ve bir kitaplık taşımak, taşıdığı riski hak
 * etmiyor (sözlük metinleri kullanıcıdan gelmez ama yine de HTML enjekte
 * edilebilecek bir yol açmanın gereği yok).
 */
export function RichText({ text, className }: { text: string; className?: string }) {
  return (
    <span className={className}>
      {text.split("\n").map((line, lineIndex) => (
        <span key={lineIndex} className="block">
          {line.split(/(\*\*[^*]+\*\*)/g).map((part, partIndex) =>
            part.startsWith("**") && part.endsWith("**") ? (
              <strong key={partIndex} style={{ color: "var(--sn-ink)", fontWeight: 550 }}>
                {part.slice(2, -2)}
              </strong>
            ) : (
              <span key={partIndex}>{part}</span>
            ),
          )}
        </span>
      ))}
    </span>
  );
}

/** Sözlük kaydını kart içinde açık paragraf olarak basar. */
export function Explain({ id, className }: { id: string; className?: string }) {
  const entry = GLOSSARY[id];
  if (!entry) return null;

  return (
    <div
      className={cx("rounded-[var(--sn-r-md)] px-3.5 py-3", className)}
      style={{ background: "var(--sn-sunken)" }}
    >
      <div className="sn-label">{entry.label}</div>
      <div
        className="mt-1.5"
        style={{ fontSize: "var(--sn-t-body)", color: "var(--sn-ink-2)", lineHeight: 1.55 }}
      >
        <RichText text={entry.long ?? entry.short} />
      </div>
      {entry.action && (
        <div
          className="mt-2 pt-2"
          style={{
            borderTop: "1px solid var(--sn-hairline)",
            fontSize: "var(--sn-t-caption)",
            color: "var(--sn-ink-3)",
          }}
        >
          <RichText text={entry.action} />
        </div>
      )}
    </div>
  );
}

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
  term?: string;
  hint?: string;
  value: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cx("flex items-baseline justify-between gap-4 py-1.5", className)}
      style={{ borderBottom: "1px solid var(--sn-hairline)" }}
    >
      <span
        className="flex items-center gap-1"
        style={{ fontSize: "var(--sn-t-caption)", color: "var(--sn-ink-3)" }}
      >
        {label}
        {(term || hint) && <InfoDot id={term} text={hint} />}
      </span>
      <span className="text-right" style={{ fontSize: "var(--sn-t-body)", color: "var(--sn-ink)" }}>
        {value}
      </span>
    </div>
  );
}

/** Sözlük kaydını doğrudan almak isteyen bileşenler için. */
export function useTerm(id: string): TermEntry | undefined {
  return GLOSSARY[id];
}
