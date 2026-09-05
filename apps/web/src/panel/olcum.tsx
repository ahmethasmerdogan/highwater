"use client";

/**
 * Ölçüm ilkelleri — BoardUI token'ları üzerine kurulu.
 *
 * İki söz koda gömülü:
 *
 *   **Her sayının künyesi vardır.** `kunye` isteğe bağlı değil: n, pencere,
 *   kesit ve üretim zamanı yazılmadan bir sayı basılamaz.
 *
 *   **Payda gizlenmez.** `Oran` daima iki sayı basar. "615 test geçti" değil,
 *   "615 / 615". 2026-09-04/05'te bulunan sekiz arızanın altısı tam olarak
 *   paydası görünmediği için aylarca fark edilmedi.
 *
 * Renk BoardUI'nin semantik token'larından gelir; ham palet sınıfı yok.
 */

import type { ComponentType, ReactNode } from "react";
import { Chip } from "@/components/base/badges/chip";
import { Tooltip, TooltipTrigger } from "@/components/base/tooltip/tooltip";
import { Focusable } from "react-aria-components";
import { RiInformationLine } from "@remixicon/react";
import { cx } from "@/utils/cx";

export type Durum = "notr" | "kanit" | "uyari" | "bozuk" | "olu";

/** Durum → BoardUI chip rengi. Kâr yeşile boyanmaz; kanıt çivittir. */
export const CHIP_RENGI: Record<Durum, "neutral" | "blue" | "yellow" | "rose" | "gray"> = {
  notr: "neutral",
  kanit: "blue",
  uyari: "yellow",
  bozuk: "rose",
  olu: "gray",
};

const METIN_RENGI: Record<Durum, string> = {
  notr: "text-text-primary",
  kanit: "text-text-primary",
  uyari: "text-status-yellow-text",
  bozuk: "text-status-rose-text",
  olu: "text-text-tertiary",
};

/** @remixicon/react bileşenleri de dahil, sınıf alan her ikon. */
type Ikon = ComponentType<{ className?: string; [key: string]: unknown }>;

/* ------------------------------------------------------------------ */
/*  Biçimleyiciler — Türkçe: ondalık virgül, binlik nokta              */
/* ------------------------------------------------------------------ */
export function sayi(
  v: number | null | undefined,
  basamak = 2,
  opts: { isaret?: boolean; yuzde?: boolean } = {},
): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  const x = opts.yuzde ? v * 100 : v;
  const govde = x.toLocaleString("tr-TR", {
    minimumFractionDigits: basamak,
    maximumFractionDigits: basamak,
  });
  return `${opts.isaret && x > 0 ? "+" : ""}${govde}${opts.yuzde ? " %" : ""}`;
}

export function adet(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return Math.round(v).toLocaleString("tr-TR");
}

/** Mono + tabular-nums: anayasa kuralı 6. Hizalanmayan rakam kabul edilmez. */
export const MONO = "font-mono tabular-nums";

/* ------------------------------------------------------------------ */
/*  Künye — sayının kimliği                                            */
/* ------------------------------------------------------------------ */
export function Kunye({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cx("text-caption-1-regular text-text-tertiary tabular-nums", className)}>
      {children}
    </p>
  );
}

/* ------------------------------------------------------------------ */
/*  Ölçüm — künyesiz basılamayan tek sayı                              */
/* ------------------------------------------------------------------ */
export function Olcum({
  etiket,
  deger,
  kunye,
  ikon: Ikonu,
  durum = "notr",
  rozet,
  rozetDurum = "notr",
  buyuk,
  gecersiz,
  ipucu,
}: {
  etiket: string;
  deger: ReactNode;
  /** Zorunlu: n, pencere, kesit, üretim zamanı. Künyesi olmayan sayı basılmaz. */
  kunye: string;
  ikon?: Ikon;
  durum?: Durum;
  /** Sağdaki chip — oran, t değeri, eşik. */
  rozet?: string;
  rozetDurum?: Durum;
  /** Duvar ölçeği: Nöbet ekranının uzaktan okunan sayıları. */
  buyuk?: boolean;
  /** Geçersizlik geriye işler: üstü çizili durur ve sebebi yazılıdır. */
  gecersiz?: string | null;
  ipucu?: string;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div className="flex items-center gap-1.5">
        {Ikonu ? (
          <Ikonu className="size-4 shrink-0 text-foreground-icon-tertiary" aria-hidden />
        ) : null}
        <p className="truncate text-body-2-medium text-text-secondary">{etiket}</p>
        {ipucu ? (
          <TooltipTrigger delay={120}>
            <Focusable>
              <span className="cursor-help text-foreground-icon-quaternary" role="button">
                <RiInformationLine className="size-3.5" aria-hidden />
              </span>
            </Focusable>
            <Tooltip>{ipucu}</Tooltip>
          </TooltipTrigger>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span
          className={cx(
            MONO,
            "whitespace-nowrap",
            buyuk ? "text-title-2-medium" : "text-headline-medium",
            gecersiz ? "text-text-tertiary line-through decoration-status-rose-text" : METIN_RENGI[durum],
          )}
        >
          {deger}
        </span>
        {rozet ? (
          <Chip variant="bold" color={CHIP_RENGI[rozetDurum]}>
            {rozet}
          </Chip>
        ) : null}
      </div>

      <Kunye>{gecersiz ? `geçersiz · ${gecersiz}` : kunye}</Kunye>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Oran — payda daima görünür                                         */
/* ------------------------------------------------------------------ */
export function Oran({
  etiket,
  pay,
  payda,
  birim,
  kunye,
  kural,
  ters,
  ikon,
  buyuk,
  ipucu,
}: {
  etiket: string;
  pay: number | null;
  payda: number | null;
  birim?: string;
  kunye: string;
  /** Oranın altına düşmemesi gereken sınır (ör. kesici payı ≥ 1,5). */
  kural?: number;
  /** Doğru yön aşağıysa (ör. bağlantı kullanımı) kuralı tersine oku. */
  ters?: boolean;
  ikon?: Ikon;
  buyuk?: boolean;
  ipucu?: string;
}) {
  const oran = pay !== null && payda ? pay / payda : null;
  const ihlal = kural !== undefined && oran !== null && (ters ? oran > kural : oran < kural);
  return (
    <Olcum
      etiket={etiket}
      ikon={ikon}
      buyuk={buyuk}
      ipucu={ipucu}
      durum={ihlal ? "bozuk" : "notr"}
      deger={
        <>
          {adet(pay)}
          <span className="text-text-quaternary"> / </span>
          <span className={ihlal ? "text-status-rose-text" : "text-text-tertiary"}>
            {adet(payda)}
          </span>
          {birim ? (
            <span className="ml-1.5 font-sans text-body-2-regular text-text-tertiary">{birim}</span>
          ) : null}
        </>
      }
      rozet={oran !== null ? `${sayi(oran, 2)}×` : undefined}
      rozetDurum={ihlal ? "bozuk" : "notr"}
      kunye={`${kunye}${kural !== undefined ? ` · kural ${ters ? "≤" : "≥"} ${sayi(kural, 2)}×` : ""}`}
    />
  );
}

/* ------------------------------------------------------------------ */
/*  Sayaç — üç sınıf                                                   */
/* ------------------------------------------------------------------ */
export function Sayac({
  ad,
  deger,
  sinif,
  not,
}: {
  ad: string;
  deger: number;
  /** OLDU · OLMADI-BEKLENİYORDU · HİÇ OLMADI */
  sinif: "oldu" | "beklendi_olmadi" | "hic_olmadi";
  not?: string;
}) {
  const bozuk = sinif === "beklendi_olmadi" && deger > 0;
  const olu = sinif === "hic_olmadi" && deger === 0;
  return (
    <div className="flex items-center gap-3 py-1.5">
      <span
        className={cx(
          MONO,
          "w-16 shrink-0 text-right text-body-medium",
          bozuk ? "text-status-rose-text" : olu ? "text-text-quaternary" : "text-text-primary",
        )}
      >
        {adet(deger)}
      </span>
      <span
        className={cx(
          "min-w-0 flex-1 truncate text-body-regular",
          olu ? "text-text-quaternary" : "text-text-primary",
        )}
      >
        {ad}
      </span>
      {olu ? (
        <Chip variant="caption" color="gray">
          hiç olmadı
        </Chip>
      ) : bozuk ? (
        <Chip variant="caption" color="rose">
          {not ?? "beklenmiyordu"}
        </Chip>
      ) : not ? (
        <span className="text-caption-1-regular text-text-tertiary">{not}</span>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Sessizlik bir durumdur                                             */
/* ------------------------------------------------------------------ */
export function Sessizlik({ beklenen, bulunan }: { beklenen: string; bulunan?: string }) {
  return (
    <div className="flex flex-col items-start gap-2 px-5 py-8">
      <Chip variant="caption" color="yellow">
        sessizlik
      </Chip>
      <p className="max-w-[62ch] text-body-regular text-text-secondary">{beklenen}</p>
      {bulunan ? <Kunye>{bulunan}</Kunye> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Damga — kart ve kol durumları                                      */
/* ------------------------------------------------------------------ */
export function Damga({ children, durum }: { children: ReactNode; durum: Durum }) {
  return (
    <Chip variant="bold" color={CHIP_RENGI[durum]}>
      {children}
    </Chip>
  );
}
