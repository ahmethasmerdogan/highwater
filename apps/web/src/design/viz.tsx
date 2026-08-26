"use client";

/**
 * Küçük görselleştirmeler — hücre içine sığan türden.
 *
 * Hepsi saf SVG/CSS: bir grafik kitaplığı 40 piksellik bir çubuk için
 * çalıştırılmaz. Hiçbiri tek başına anlam taşımaz; yanında **her zaman**
 * sayısı yazar (renk körlüğü ve ekran okuyucu).
 */

import { cx } from "./cx";
import { FAMILIES } from "./series";

/* ------------------------------------------------------------------ */

/**
 * Oranı gösteren yatay çubuk.
 *
 * Sayının yerine geçmez, yanında durur: göz sıralamayı çubuktan, değeri
 * sayıdan okur.
 */
export function Bar({
  value,
  max = 100,
  color = "var(--sn-brand-solid)",
  width = 44,
  height = 4,
  className,
}: {
  value: number | null | undefined;
  max?: number;
  color?: string;
  width?: number;
  height?: number;
  className?: string;
}) {
  const ratio =
    value === null || value === undefined || !Number.isFinite(value)
      ? 0
      : Math.max(0, Math.min(1, value / max));
  return (
    <span
      className={cx("inline-block shrink-0 overflow-hidden rounded-full align-middle", className)}
      style={{ width, height, background: "var(--sn-sunken)" }}
      aria-hidden
    >
      <span
        className="block h-full rounded-full transition-[width] duration-[var(--sn-dur-3)] ease-[var(--sn-ease)]"
        style={{ width: `${ratio * 100}%`, background: color }}
      />
    </span>
  );
}

/* ------------------------------------------------------------------ */

/**
 * Aile katkılarının yığılmış çubuğu.
 *
 * Puanın **nereden geldiğini** tek bakışta gösterir: 72 puanın 25'i trend,
 * 21'i momentum… Toplam taban puanı verir; düzeltmeler ayrı gösterilir,
 * yığına karıştırılmaz — biri katkı, öbürü düzeltme.
 */
export function FamilyStack({
  families,
  height = 8,
  showLegend = false,
}: {
  families: Record<string, number> | undefined;
  height?: number;
  showLegend?: boolean;
}) {
  const parts = FAMILIES.map((family) => ({
    family,
    value: Math.max(0, families?.[family.id] ?? 0),
  }));
  const total = parts.reduce((sum, part) => sum + part.value, 0);

  if (total <= 0) {
    return (
      <span
        className="block w-full rounded-full"
        style={{ height, background: "var(--sn-sunken)" }}
        aria-hidden
      />
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span className="flex w-full overflow-hidden rounded-full" style={{ height }} aria-hidden>
        {parts.map(({ family, value }) => (
          <span
            key={family.id}
            className="h-full transition-[flex-grow] duration-[var(--sn-dur-3)] ease-[var(--sn-ease)]"
            style={{ flexGrow: value, background: family.color, minWidth: value > 0 ? 2 : 0 }}
          />
        ))}
      </span>
      {showLegend && (
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {parts.map(({ family, value }) => (
            <span key={family.id} className="inline-flex items-center gap-1.5">
              <span
                className="h-2 w-2 shrink-0 rounded-[2px]"
                style={{ background: family.color }}
                aria-hidden
              />
              <span style={{ fontSize: "var(--sn-t-caption)", color: "var(--sn-ink-2)" }}>
                {family.label}
              </span>
              <span className="sn-num" style={{ fontSize: "var(--sn-t-caption)", color: "var(--sn-ink-3)" }}>
                {value.toLocaleString("tr-TR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
              </span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

/**
 * Bir değerin aralık içindeki yerini gösteren nokta.
 *
 * Destek/direnç geometrisinde kullanılır: fiyat desteğe mi yakın, dirence
 * mi? Uçlar etiketlenir, yoksa nokta hiçbir şey söylemez.
 */
export function RangeDot({
  value,
  low,
  high,
  lowLabel,
  highLabel,
}: {
  value: number | null;
  low: number | null;
  high: number | null;
  lowLabel: string;
  highLabel: string;
}) {
  const ok =
    value !== null && low !== null && high !== null && Number.isFinite(high - low) && high > low;
  const ratio = ok ? Math.max(0, Math.min(1, (value - low) / (high - low))) : null;

  return (
    <div className="flex flex-col gap-1">
      <div className="relative h-1.5 w-full rounded-full" style={{ background: "var(--sn-sunken)" }}>
        {ratio !== null && (
          <span
            className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{ left: `${ratio * 100}%`, background: "var(--sn-brand-solid)", boxShadow: "0 0 0 2px var(--sn-panel)" }}
          />
        )}
      </div>
      <div className="flex justify-between" style={{ fontSize: 10, color: "var(--sn-ink-3)" }}>
        <span>{lowLabel}</span>
        <span>{highLabel}</span>
      </div>
    </div>
  );
}
