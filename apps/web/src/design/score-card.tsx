"use client";

/**
 * Puan Kartı — sistemin imza bileşeni.
 *
 * Tek bakışta "puan kaç" değil, **"puan neyden oluşuyor"** görünür.
 * Sistemin tüm felsefesi burada: açıklanamayan bir sayı ekranda durmaz.
 *
 * Dört parça:
 *   1. Yığılmış çubuk — beş ailenin katkısı, gerçek oranlarında
 *   2. Düzeltmeler — taban puana eklenen formasyon/mum etkileri, AYRI
 *   3. Başlıca sebepler — motorun karar anında kaydettiği ilk sürücüler
 *   4. Fiyat merdiveni — destek/direnç geometrisi, GERÇEK ölçekte
 *
 * Aynı bileşen Puanlar, Havuz, İndikatörler ve Terminal'de kullanılır.
 */

import type { Rationale } from "@/lib/api";
import { num, price } from "@/lib/format";
import { cx } from "./cx";
import { InfoDot, Term } from "./explain";
import { NumText } from "./numeric";
import { FAMILIES } from "./series";

export function ScoreCard({
  rationale,
  compact = false,
  className,
}: {
  rationale: Rationale;
  /** Çekmece içinde daha dar yerleşim: merdiven ve yüzdelikler gizlenir. */
  compact?: boolean;
  className?: string;
}) {
  const families = FAMILIES.map((family) => ({
    family,
    value: rationale.families?.[family.id],
  })).filter((entry) => Number.isFinite(entry.value));

  const modifiers = Object.entries(rationale.modifiers ?? {}).filter(
    ([, value]) => Number.isFinite(value) && value !== 0,
  );

  const familyTotal = families.reduce((sum, entry) => sum + Math.max(0, entry.value ?? 0), 0);
  const modifierTotal = modifiers.reduce((sum, [, value]) => sum + value, 0);

  return (
    <div
      className={cx("rounded-[var(--sn-r-md)] overflow-hidden", className)}
      style={{ background: "var(--sn-panel)", border: "1px solid var(--sn-hairline)" }}
    >
      <header
        className="flex items-baseline justify-between gap-3 px-4 py-3"
        style={{ borderBottom: "1px solid var(--sn-hairline)" }}
      >
        <div className="min-w-0">
          <div
            className="sn-num truncate font-medium"
            style={{ fontSize: "var(--sn-t-body-lg)", color: "var(--sn-ink)" }}
          >
            {rationale.symbol}
          </div>
          {rationale.bar_time && (
            <div style={{ fontSize: "var(--sn-t-micro)", color: "var(--sn-ink-3)" }}>
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
            <span className="sn-label">Puan</span>
            <InfoDot id="puan" />
          </div>
          <NumText text={num(rationale.score, 1)} size="xl" />
        </div>
      </header>

      <div className="flex flex-col gap-4 px-4 py-3.5">
        {/* ---- Yığılmış çubuk ------------------------------------- */}
        <section>
          <div
            className="mb-1.5 flex items-center justify-between"
            style={{ fontSize: "var(--sn-t-micro)", color: "var(--sn-ink-3)" }}
          >
            <span>Puan neyden oluşuyor</span>
            <span className="sn-num">
              taban {num(familyTotal, 1)}
              {modifierTotal !== 0 &&
                ` · düzeltme ${modifierTotal > 0 ? "+" : ""}${num(modifierTotal, 1)}`}
            </span>
          </div>

          {/*
            Segmentler arasında 2px boşluk var: bitişik iki dolgu doğrudan
            değdiğinde sınır kaybolur ve iki aile tek blok gibi okunur.
            Boşluk `gap` ile veriliyor, genişlik hesabına karışmaz.
          */}
          <div
            className="flex h-6 w-full gap-[2px] overflow-hidden rounded-[var(--sn-r-sm)]"
            style={{ background: "var(--sn-sunken)" }}
          >
            {families.map(({ family, value }) => {
              const width = familyTotal > 0 ? (Math.max(0, value ?? 0) / familyTotal) * 100 : 0;
              if (width <= 0) return null;
              return (
                <div
                  key={family.id}
                  title={`${family.label}: ${num(value, 1)} puan`}
                  style={{ width: `${width}%`, background: family.color }}
                  className="h-full"
                />
              );
            })}
          </div>

          <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3">
            {families.map(({ family, value }) => (
              <div key={family.id} className="flex items-center gap-1.5">
                <span
                  aria-hidden
                  className="h-2 w-2 shrink-0 rounded-[2px]"
                  style={{ background: family.color }}
                />
                <Term id={`aile_${family.id}`} className="truncate">
                  <span style={{ fontSize: "var(--sn-t-caption)", color: "var(--sn-ink-2)" }}>
                    {family.label}
                  </span>
                </Term>
                <NumText text={num(value, 1)} size="sm" className="ml-auto" />
              </div>
            ))}
          </div>

          {modifiers.length > 0 && (
            <div className="mt-2 pt-2" style={{ borderTop: "1px solid var(--sn-hairline)" }}>
              <div
                className="mb-1 flex items-center gap-1"
                style={{ fontSize: "var(--sn-t-micro)", color: "var(--sn-ink-3)" }}
              >
                Düzeltmeler
                <InfoDot id="formasyon" />
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3">
                {modifiers.map(([key, value]) => (
                  <div key={key} className="flex items-center gap-1.5">
                    <span
                      className="truncate"
                      style={{ fontSize: "var(--sn-t-caption)", color: "var(--sn-ink-2)" }}
                    >
                      {key.replace(/_/g, " ")}
                    </span>
                    <span className="ml-auto">
                      <NumText
                        text={`${value > 0 ? "+" : ""}${num(value, 1)}`}
                        size="sm"
                        tone={value > 0 ? "var(--sn-up)" : "var(--sn-down)"}
                      />
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* ---- Başlıca sebepler ----------------------------------- */}
        {rationale.top_drivers?.length > 0 && (
          <section>
            <div
              className="mb-1.5 flex items-center gap-1"
              style={{ fontSize: "var(--sn-t-micro)", color: "var(--sn-ink-3)" }}
            >
              Başlıca sebepler
              <InfoDot text="Motorun bu puanı verirken en çok ağırlık taşıyan gözlemleri. Puanın kaydedildiği anda saklanır ve sonradan değişmez." />
            </div>
            <ul className="flex flex-col gap-1">
              {rationale.top_drivers.slice(0, 3).map((driver, index) => (
                <li
                  key={index}
                  className="flex gap-2"
                  style={{ fontSize: "var(--sn-t-body)", color: "var(--sn-ink-2)" }}
                >
                  <span aria-hidden style={{ color: "var(--sn-brand)" }}>
                    ·
                  </span>
                  <span className="min-w-0 flex-1">{driver}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {!compact && <PriceLadder sr={rationale.sr} />}

        {!compact && Object.keys(rationale.percentiles ?? {}).length > 0 && (
          <section>
            <div
              className="mb-1.5 flex items-center gap-1"
              style={{ fontSize: "var(--sn-t-micro)", color: "var(--sn-ink-3)" }}
            >
              Havuz içindeki yeri
              <InfoDot id="yuzdelik" />
            </div>
            <div className="flex flex-col gap-1">
              {Object.entries(rationale.percentiles)
                .slice(0, 8)
                .map(([key, value]) => (
                  <div key={key} className="flex items-center gap-2">
                    <span
                      className="w-28 shrink-0 truncate"
                      style={{ fontSize: "var(--sn-t-caption)", color: "var(--sn-ink-2)" }}
                    >
                      {key.replace(/_/g, " ")}
                    </span>
                    <span
                      className="h-1.5 flex-1 overflow-hidden rounded-full"
                      style={{ background: "var(--sn-sunken)" }}
                    >
                      <span
                        className="block h-full rounded-full"
                        style={{
                          width: `${Math.max(0, Math.min(100, value))}%`,
                          background: "var(--sn-brand-solid)",
                        }}
                      />
                    </span>
                    <NumText text={num(value, 0)} size="sm" className="w-10" />
                  </div>
                ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

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
      <div
        className="rounded-[var(--sn-r-sm)] px-3 py-2.5"
        style={{
          border: "1px dashed var(--sn-border)",
          fontSize: "var(--sn-t-caption)",
          color: "var(--sn-ink-3)",
        }}
      >
        Bu sembol için destek/direnç seviyesi hesaplanamadı — yeterli fiyat geçmişi yok ya da
        seviyeler henüz doğrulanmadı.
      </div>
    );
  }

  /* Güncel fiyat gerekçe nesnesinde ayrı taşınmıyor; POC ile destek-direnç
     arasından konum tahmin edilir. POC yoksa orta nokta kullanılır ve bu
     durum kullanıcıya AÇIKÇA söylenir — tahmini ölçüm gibi göstermeyiz. */
  const current = poc ?? (support + resistance) / 2;
  const span = resistance - support;
  const position = span > 0 ? ((current - support) / span) * 100 : 50;

  return (
    <section>
      <div
        className="mb-1.5 flex items-center gap-1"
        style={{ fontSize: "var(--sn-t-micro)", color: "var(--sn-ink-3)" }}
      >
        Destek / direnç geometrisi
        <InfoDot id="aile_sr" />
      </div>

      <div
        className="rounded-[var(--sn-r-sm)] px-3 py-2.5"
        style={{ background: "var(--sn-raised)", border: "1px solid var(--sn-hairline)" }}
      >
        <div className="flex items-center justify-between">
          <span style={{ fontSize: "var(--sn-t-caption)", color: "var(--sn-ink-3)" }}>direnç</span>
          <NumText text={price(resistance)} size="sm" />
        </div>

        <div className="relative my-2 h-12">
          <div
            className="absolute inset-x-0 top-0 h-px"
            style={{ background: "color-mix(in oklab, var(--sn-down) 50%, transparent)" }}
          />
          <div
            className="absolute inset-x-0 bottom-0 h-px"
            style={{ background: "color-mix(in oklab, var(--sn-up) 50%, transparent)" }}
          />
          <div
            className="absolute inset-x-0 flex items-center gap-2"
            style={{ bottom: `${Math.max(0, Math.min(100, position))}%` }}
          >
            <span className="h-px flex-1" style={{ background: "var(--sn-brand-solid)" }} />
            <span
              className="sn-num rounded-[var(--sn-r-xs)] px-1.5 py-0.5"
              style={{
                background: "var(--sn-brand-bg)",
                color: "var(--sn-brand)",
                fontSize: "var(--sn-t-micro)",
              }}
            >
              {price(current)}
            </span>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <span style={{ fontSize: "var(--sn-t-caption)", color: "var(--sn-ink-3)" }}>destek</span>
          <NumText text={price(support)} size="sm" />
        </div>

        <div
          className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 pt-2"
          style={{ borderTop: "1px solid var(--sn-hairline)", fontSize: "var(--sn-t-caption)" }}
        >
          {rr_geometry !== null && rr_geometry !== undefined && (
            <span className="flex items-center gap-1">
              <Term id="rr" />
              <NumText text={num(rr_geometry, 2)} size="sm" />
            </span>
          )}
          {atr !== null && atr !== undefined && (
            <span className="flex items-center gap-1">
              <Term id="atr" />
              <NumText text={price(atr)} size="sm" />
            </span>
          )}
          {(poc === null || poc === undefined) && (
            <span style={{ color: "var(--sn-ink-3)" }}>
              Konum tahminî — hacim yoğunluğu seviyesi hesaplanamadı.
            </span>
          )}
        </div>
      </div>
    </section>
  );
}
