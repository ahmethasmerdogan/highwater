"use client";

/**
 * Sayı bileşenleri — bozulmaz kural 6'nın uygulama yeri.
 *
 * "Her sayı monospace ve `tabular-nums`. Hizalanmayan rakam kabul edilmez."
 *
 * Ekranda elle biçimlenmiş bir sayı görürseniz o bir hatadır: hepsi
 * buradan geçer, biçimleme `lib/format.ts`'ten gelir.
 *
 * ---- Animasyon nerede var, nerede yok --------------------------------
 * `Metric` ve `Num animate` sayarak gider. Tablo hücreleri **saymaz** —
 * 400 hücre aynı anda sayarsa ızgara okunamaz — onun yerine `NumCell`
 * değişimi tek seferlik zemin rengiyle işaretler. İkisi de
 * `prefers-reduced-motion` altında anında oturur.
 */

import type { ReactNode } from "react";
import { EMPTY, direction, num as fmtNum } from "@/lib/format";
import { cx } from "./cx";
import { useAnimatedNumber, useChangeTint } from "./motion";

/* ------------------------------------------------------------------ */
/*  İki tonlu basım                                                    */
/* ------------------------------------------------------------------ */

const UNIT_RE = /\s(bps|USD|USDT|R|Mr|M|B|gün|sa|dk|adet)$/;

/**
 * Biçimlenmiş metni tamsayı / ondalık / birim olarak üç tona böler.
 *
 * Metin alır, sayı almaz: biçimleme kurallarını (`money`, `price`,
 * `pctSigned`…) ikinci kez yazmamak için. Tek doğruluk kaynağı
 * `lib/format.ts`.
 */
function split(text: string): { int: string; frac: string; unit: string } {
  const match = text.match(UNIT_RE);
  let body = match ? text.slice(0, -match[0].length) : text;
  let unit = match ? match[1] : "";

  /* Sonda yapışık duran R (+2,31R) ve % (baştaki) ayrı tonda durur. */
  if (!unit && /R$/.test(body) && /\d/.test(body)) {
    body = body.slice(0, -1);
    unit = "R";
  }

  const cut = body.lastIndexOf(",");
  return {
    int: cut === -1 ? body : body.slice(0, cut),
    frac: cut === -1 ? "" : body.slice(cut),
    unit,
  };
}

const SIZE: Record<string, string> = {
  xs: "var(--sn-t-micro)",
  sm: "var(--sn-t-caption)",
  md: "var(--sn-t-body)",
  lg: "var(--sn-t-body-lg)",
  xl: "var(--sn-t-title)",
  display: "var(--sn-t-display)",
  hero: "var(--sn-t-display-lg)",
};

export type NumSize = keyof typeof SIZE;

/** Biçimlenmiş bir metni üç tonda basar. Sayı bilmez, yalnızca gösterir. */
export function NumText({
  text,
  size = "md",
  className,
  tone,
}: {
  text: string;
  size?: NumSize;
  className?: string;
  /** Tamsayı tonunu ezer — yön rengi verirken kullanılır. */
  tone?: string;
}) {
  if (!text || text === EMPTY) {
    return (
      <span className={cx("sn-num", className)} style={{ fontSize: SIZE[size], color: "var(--sn-ink-4)" }}>
        {EMPTY}
      </span>
    );
  }
  const { int, frac, unit } = split(text);
  return (
    <span className={cx("sn-num", className)} style={{ fontSize: SIZE[size] }}>
      <span className="sn-num-int" style={tone ? { color: tone } : undefined}>
        {int}
      </span>
      {frac && (
        <span className="sn-num-frac" style={tone ? { color: tone, opacity: 0.72 } : undefined}>
          {frac}
        </span>
      )}
      {unit && <span className="sn-num-unit">{unit}</span>}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Sayan sayı                                                         */
/* ------------------------------------------------------------------ */

export interface NumProps {
  value: number | null | undefined;
  /** Ham sayıyı metne çevirir. Varsayılan: iki haneli yerel biçim. */
  format?: (value: number | null | undefined) => string;
  size?: NumSize;
  /** Hedefe sayarak gitsin mi? Tablolarda `false` bırakın. */
  animate?: boolean;
  /** İlk boyamada da saysın mı? Yalnızca büyük metrikler için. */
  animateOnMount?: boolean;
  /** Yön rengi uygulansın mı (yeşil yukarı / kırmızı aşağı)? */
  colorize?: boolean;
  duration?: number;
  className?: string;
}

/**
 * Panelin varsayılan sayısı.
 *
 * `animate` açıkken ara değerler `format` ile basılır; bu yüzden
 * biçimleyici saf ve ucuz olmalı (kare başına bir kez çağrılır).
 */
export function Num({
  value,
  format = (v) => fmtNum(v, 2),
  size = "md",
  animate = false,
  animateOnMount = false,
  colorize = false,
  duration,
  className,
}: NumProps) {
  const animated = useAnimatedNumber(animate ? value : undefined, { duration, animateOnMount });
  const shown = animate && value !== null && value !== undefined ? animated.value : value;
  const tone = colorize ? directionTone(value) : undefined;

  return <NumText text={format(shown)} size={size} tone={tone} className={className} />;
}

/** Yön rengi — yeşil/kırmızı YALNIZCA burada ve `Delta`'da üretilir. */
function directionTone(value: number | null | undefined): string | undefined {
  const d = direction(value);
  if (d === "flat") return "var(--sn-ink-2)";
  return d === "up" ? "var(--sn-up)" : "var(--sn-down)";
}

/* ------------------------------------------------------------------ */
/*  İşaretli değişim                                                   */
/* ------------------------------------------------------------------ */

/**
 * Yönlü bir değer: üçgen + renk + sayı.
 *
 * Üçgen süs değil — renk körlüğünde yeşil/kırmızı ayrımı kaybolur, yön
 * bilgisi biçimle de taşınmak zorunda.
 */
export function Delta({
  value,
  format,
  size = "md",
  animate = false,
  className,
}: {
  value: number | null | undefined;
  format: (value: number | null | undefined) => string;
  size?: NumSize;
  animate?: boolean;
  className?: string;
}) {
  const d = direction(value);
  const tone = d === "flat" ? "var(--sn-ink-2)" : d === "up" ? "var(--sn-up)" : "var(--sn-down)";
  const animated = useAnimatedNumber(animate ? value : undefined, {});
  const shown = animate && value !== null && value !== undefined ? animated.value : value;

  return (
    <span className={cx("inline-flex items-baseline gap-[3px]", className)}>
      {d !== "flat" && (
        <span aria-hidden style={{ color: tone, fontSize: "0.72em", lineHeight: 1 }}>
          {d === "up" ? "▲" : "▼"}
        </span>
      )}
      <NumText text={format(shown)} size={size} tone={tone} />
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Tablo hücresi                                                      */
/* ------------------------------------------------------------------ */

/**
 * Izgara hücresindeki sayı. Saymaz; değiştiğinde bir kez renk alır.
 *
 * Kırpma `overflow: hidden` ile değil, hücrenin sağa hizasıyla çözülür:
 * bir sayının sonu kesilirse okunan değer yanlış olur, başı kesilirse
 * belli olur.
 */
export function NumCell({
  value,
  text,
  size = "md",
  colorize = false,
  tint = true,
}: {
  value: number | null | undefined;
  text: string;
  size?: NumSize;
  colorize?: boolean;
  /** Değişince zemin rengi versin mi? Sık değişmeyen sütunlarda kapatın. */
  tint?: boolean;
}) {
  const changed = useChangeTint(tint ? value : undefined);
  return (
    <span
      className={cx(
        "inline-block rounded-[3px] px-[3px] -mx-[3px]",
        changed === "up" && "sn-tint-up",
        changed === "down" && "sn-tint-down",
      )}
    >
      <NumText text={text} size={size} tone={colorize ? directionTone(value) : undefined} />
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Metrik kutusu                                                      */
/* ------------------------------------------------------------------ */

/**
 * Sayı olmayan metrik: etiket, kısa metin, altyazı.
 *
 * "Artıyor / Artmıyor", "Evet / Hayır", "Planlı" gibi değerler için.
 * `Metric` ile aynı kutuyu paylaşır ki ızgarada yan yana dizildiklerinde
 * yükseklikleri ve iç boşlukları tutsun — üç ayrı yerde elle kopyalanan
 * bu kutu, her kopyada biraz kayıyordu.
 */
export function TextMetric({
  label,
  value,
  sub,
  accent,
  tone,
  info,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  accent?: string;
  /** Değerin rengi. Yön anlamı taşıyorsa yeşil/kırmızı buradan verilir. */
  tone?: string;
  info?: ReactNode;
}) {
  return (
    <div className="min-w-0 py-1">
      <div className="flex items-center gap-1.5 text-[11.5px] font-semibold tracking-[0.06em] text-ink-3 uppercase">
        {accent && <span aria-hidden className="inline-block size-1.5 rounded-full" style={{ background: accent }} />}
        <span>{label}</span>
        {info}
      </div>
      <div className="mt-2" style={{ fontSize: "var(--sn-t-display)", color: tone ?? "var(--sn-ink)" }}>
        {value}
      </div>
      {sub && (
        /* Yazı mono OLMAZ — mono yalnız sayının kendisine aittir (kural 6
           rakamı hizalar, cümleyi değil). Altyazı orantılı fontta kalır;
           içindeki rakamlar tabular-nums özelliğiyle hizalanır. */
        <div
          className="mt-1"
          style={{
            fontSize: "var(--sn-t-caption)",
            color: "var(--sn-ink-3)",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {sub}
        </div>
      )}
    </div>
  );
}

/**
 * Büyük tek sayı: etiket, değer, altyazı.
 *
 * Panelin üst şeridi bunlardan kurulur. Değer sayarak gelir — burası
 * animasyonun gerçekten bilgi taşıdığı yer.
 */
export function Metric({
  label,
  value,
  format,
  sub,
  delta,
  accent,
  animateOnMount = true,
  info,
}: {
  label: string;
  value: number | null | undefined;
  format: (value: number | null | undefined) => string;
  sub?: ReactNode;
  /** Değerin yanındaki ikincil yönlü sayı. */
  delta?: ReactNode;
  /** Geriye uyumluluk: v3'te kenar şeridi yok; verilirse etiket noktası olur. */
  accent?: string;
  animateOnMount?: boolean;
  info?: ReactNode;
}) {
  /* DESIGN-V3 "figür": sessiz etiket, büyük mono sayı, tek satır altyazı.
     Yüzey yok — figürler ledger bloğunun içinde yan yana durur; kendi
     kutusu olan figür, dört kutu yan yana gelince "kart yığını" olur. */
  return (
    <div className="min-w-0 py-1">
      <div className="flex items-center gap-1.5 text-[11.5px] font-semibold tracking-[0.06em] text-ink-3 uppercase">
        {accent && <span aria-hidden className="inline-block size-1.5 rounded-full" style={{ background: accent }} />}
        <span>{label}</span>
        {info}
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <Num value={value} format={format} size="display" animate animateOnMount={animateOnMount} />
        {delta}
      </div>
      {sub && (
        <div className="mt-1 text-[12px] text-ink-3" style={{ fontVariantNumeric: "tabular-nums" }}>
          {sub}
        </div>
      )}
    </div>
  );
}
