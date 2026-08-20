"use client";

/**
 * Puan Kartı — sistemin imza bileşeni.
 *
 * Tek bakışta "puan kaç" değil, **"puan neyden oluşuyor"** görünür. Sistemin
 * tüm felsefesi bu bileşende: açıklanamayan bir sayı ekranda durmaz.
 *
 * Üç parça:
 *   1. Yığılmış çubuk — beş ailenin katkısı, gerçek oranlarında
 *   2. Başlıca sebepler — motorun kaydettiği ilk sürücüler
 *   3. Fiyat merdiveni — destek/direnç geometrisi, gerçek ölçekli
 *
 * Aynı bileşen Puanlar sayfasında, pozisyon detayında ve Terminal'de
 * kullanılır. Tek bileşen, üç yer.
 */

import { cx } from "@/ui";
import type { Rationale } from "@/lib/api";
import { FAMILY_COLORS, FAMILY_LABELS, FAMILY_TERMS, num, price } from "@/lib/format";
import { InfoDot, Term } from "@/components/common/explain";
import { AmountText } from "@/components/common/amount";

export function ScoreCard({
  rationale,
  compactStyle = false,
  className,
}: {
  rationale: Rationale;
  /** Çekmece içinde daha dar yerleşim. */
  compactStyle?: boolean;
  className?: string;
}) {
  const families = Object.entries(rationale.families ?? {}).filter(([, v]) => Number.isFinite(v));
  const modifiers = Object.entries(rationale.modifiers ?? {}).filter(
    ([, v]) => Number.isFinite(v) && v !== 0,
  );

  const familyTotal = families.reduce((s, [, v]) => s + Math.max(0, v), 0);
  const modifierTotal = modifiers.reduce((s, [, v]) => s + v, 0);

  return (
    <div className={cx("rounded-xl border border-line bg-surface", className)}>
      {/* Başlık */}
      <div className="flex items-baseline justify-between gap-3 border-b border-line px-4 py-3">
        <div className="min-w-0">
          <div className="truncate font-mono text-[14px] font-medium text-ink">
            {rationale.symbol}
          </div>
          {rationale.bar_time && (
            <div className="text-[11px] text-ink-3">
              {new Date(rationale.bar_time).toLocaleString("tr-TR", {
                day: "2-digit",
                month: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
              })}{" "}
              barı
            </div>
          )}
        </div>
        <div className="text-right">
          <div className="flex items-center justify-end gap-1">
            <span className="text-[10.5px] tracking-wide text-ink-3 uppercase">Puan</span>
            <InfoDot id="puan" align="end" />
          </div>
          <AmountText text={num(rationale.score, 1)} size="lg" />
        </div>
      </div>

      <div className="space-y-4 px-4 py-3.5">
        {/* Yığılmış çubuk */}
        <div>
          <div className="mb-1.5 flex items-center justify-between text-[11px] text-ink-3">
            <span>Puan neyden oluşuyor</span>
            <span className="num">
              taban {num(familyTotal, 1)}
              {modifierTotal !== 0 && ` · düzeltme ${modifierTotal > 0 ? "+" : ""}${num(modifierTotal, 1)}`}
            </span>
          </div>

          {/*
           * Segmentler arasında 2px yüzey boşluğu var: bitişik iki dolgu
           * doğrudan değdiğinde sınır kaybolur ve iki aile tek blok gibi
           * okunur. Boşluk `gap` ile veriliyor, genişlik hesabına karışmaz.
           */}
          <div className="flex h-6 w-full gap-[2px] overflow-hidden rounded-md bg-inset">
            {families.map(([key, value]) => {
              const width = familyTotal > 0 ? (Math.max(0, value) / familyTotal) * 100 : 0;
              if (width <= 0) return null;
              return (
                <div
                  key={key}
                  title={`${FAMILY_LABELS[key] ?? key}: ${num(value, 1)} puan`}
                  style={{ width: `${width}%`, background: FAMILY_COLORS[key] ?? "var(--ink3)" }}
                  className="h-full first:rounded-l-md last:rounded-r-md"
                />
              );
            })}
          </div>

          {/* Aile açıklamaları */}
          <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3">
            {families.map(([key, value]) => (
              <div key={key} className="flex items-center gap-1.5 text-[11.5px]">
                <span
                  aria-hidden
                  className="size-2 shrink-0 rounded-[2px]"
                  style={{ background: FAMILY_COLORS[key] ?? "var(--ink3)" }}
                />
                <Term id={FAMILY_TERMS[key] ?? ""} className="truncate text-ink-2">
                  {FAMILY_LABELS[key] ?? key}
                </Term>
                <span className="num ml-auto text-[11.5px] text-ink">{num(value, 1)}</span>
              </div>
            ))}
          </div>

          {modifiers.length > 0 && (
            <div className="mt-2 border-t border-line pt-2">
              <div className="mb-1 flex items-center gap-1 text-[11px] text-ink-3">
                Düzeltmeler
                <InfoDot id="formasyon" align="start" />
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3">
                {modifiers.map(([key, value]) => (
                  <div key={key} className="flex items-center gap-1.5 text-[11.5px]">
                    <span className="truncate text-ink-2">{key.replace(/_/g, " ")}</span>
                    <span
                      className={cx(
                        "num ml-auto text-[11.5px]",
                        value > 0 ? "text-up" : "text-down",
                      )}
                    >
                      {value > 0 ? "+" : ""}
                      {num(value, 1)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Başlıca sebepler */}
        {rationale.top_drivers?.length > 0 && (
          <div>
            <div className="mb-1.5 flex items-center gap-1 text-[11px] text-ink-3">
              Başlıca sebepler
              <InfoDot
                text="Motorun bu puanı verirken en çok ağırlık taşıyan gözlemleri. Puanın kaydedildiği anda saklanır ve sonradan değişmez."
                align="start"
              />
            </div>
            <ul className="space-y-1">
              {rationale.top_drivers.slice(0, 3).map((d, i) => (
                <li key={i} className="flex gap-2 text-[12.5px] text-ink-2">
                  <span aria-hidden className="text-ink-3">
                    ·
                  </span>
                  <span className="min-w-0 flex-1">{d}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Fiyat merdiveni */}
        {!compactStyle && <PriceLadder sr={rationale.sr} />}

        {/* Yüzdelikler */}
        {!compactStyle && Object.keys(rationale.percentiles ?? {}).length > 0 && (
          <div>
            <div className="mb-1.5 flex items-center gap-1 text-[11px] text-ink-3">
              Havuz içindeki yeri
              <InfoDot id="yuzdelik" align="start" />
            </div>
            <div className="space-y-1">
              {Object.entries(rationale.percentiles)
                .slice(0, 8)
                .map(([key, value]) => (
                  <div key={key} className="flex items-center gap-2">
                    <span className="w-28 shrink-0 truncate text-[11.5px] text-ink-2">
                      {key.replace(/_/g, " ")}
                    </span>
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-inset">
                      <div
                        className="h-full rounded-full bg-brand"
                        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
                      />
                    </div>
                    <span className="num w-10 text-[11.5px] text-ink-2">{num(value, 0)}</span>
                  </div>
                ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Fiyat merdiveni                                                    */
/* ------------------------------------------------------------------ */

/**
 * Destek / güncel fiyat / direnç üçlüsünü **gerçek ölçekte** çizer.
 *
 * Fiyatın desteğe mi dirence mi yakın olduğu görsel olarak doğru okunmalı;
 * eşit aralıklı bir çizim yanıltıcı olurdu.
 */
function PriceLadder({ sr }: { sr: Rationale["sr"] }) {
  const { support, resistance, rr_geometry, poc, atr } = sr ?? {};
  if (support === null || support === undefined || resistance === null || resistance === undefined) {
    return (
      <div className="rounded-lg border border-dashed border-line px-3 py-2.5 text-[12px] text-ink-3">
        Bu sembol için destek/direnç seviyesi hesaplanamadı — yeterli fiyat geçmişi yok ya da
        seviyeler henüz doğrulanmadı.
      </div>
    );
  }

  /*
   * Güncel fiyat gerekçe nesnesinde ayrı taşınmıyor; POC ile destek-direnç
   * arasından konum tahmin edilir. POC yoksa orta nokta kullanılır ve bu
   * durum kullanıcıya söylenir.
   */
  const current = poc ?? (support + resistance) / 2;
  const span = resistance - support;
  const position = span > 0 ? ((current - support) / span) * 100 : 50;

  return (
    <div>
      <div className="mb-1.5 flex items-center gap-1 text-[11px] text-ink-3">
        Destek / direnç geometrisi
        <InfoDot id="aile_sr" align="start" />
      </div>

      <div className="rounded-lg border border-line bg-elev px-3 py-2.5">
        <div className="flex items-center justify-between text-[11.5px]">
          <span className="text-ink-3">direnç</span>
          <span className="num text-[12px] text-ink">{price(resistance)}</span>
        </div>

        {/* Merdiven */}
        <div className="relative my-2 h-12">
          <div className="absolute inset-x-0 top-0 h-px bg-down/50" />
          <div className="absolute inset-x-0 bottom-0 h-px bg-up/50" />
          <div
            className="absolute inset-x-0 flex items-center gap-2"
            style={{ bottom: `${Math.max(0, Math.min(100, position))}%` }}
          >
            <div className="h-px flex-1 bg-brand" />
            <span className="num rounded bg-brand-soft px-1.5 py-0.5 text-[11px] text-brand">
              {price(current)}
            </span>
          </div>
        </div>

        <div className="flex items-center justify-between text-[11.5px]">
          <span className="text-ink-3">destek</span>
          <span className="num text-[12px] text-ink">{price(support)}</span>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line pt-2 text-[11.5px]">
          {rr_geometry !== null && rr_geometry !== undefined && (
            <span className="flex items-center gap-1 text-ink-2">
              <Term id="rr" className="text-ink-3" />
              <span className="num text-ink">{num(rr_geometry, 2)}</span>
            </span>
          )}
          {atr !== null && atr !== undefined && (
            <span className="flex items-center gap-1 text-ink-2">
              <Term id="atr" className="text-ink-3" />
              <span className="num text-ink">{price(atr)}</span>
            </span>
          )}
          {poc === null && (
            <span className="text-ink-3">
              Konum tahminî — hacim yoğunluğu seviyesi hesaplanamadı.
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
