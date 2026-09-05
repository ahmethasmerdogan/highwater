"use client";

/**
 * Gün başlıklı akış (DESIGN-V3 §4.7) — olay ve bildirim sekmelerinin ortak
 * parçası: satırlar güne göre kümelenir, her küme büyük harf bir başlıkla
 * açılır. Kart yok; defter satırı var.
 */

import type { ReactNode } from "react";
import { dateOnly } from "@/lib/format";

export function gunlere<T>(rows: T[], at: (row: T) => string): { baslik: string; items: T[] }[] {
  const bugun = new Date();
  const dun = new Date(bugun.getTime() - 86_400_000);
  const ayni = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  const gruplar: { baslik: string; items: T[] }[] = [];
  for (const row of rows) {
    const d = new Date(at(row));
    const baslik = ayni(d, bugun) ? "Bugün" : ayni(d, dun) ? "Dün" : dateOnly(at(row));
    const son = gruplar[gruplar.length - 1];
    if (son && son.baslik === baslik) son.items.push(row);
    else gruplar.push({ baslik, items: [row] });
  }
  return gruplar;
}

export function GunBasligi({ children, count }: { children: ReactNode; count?: number }) {
  return (
    <div className="sticky top-0 z-10 flex items-baseline justify-between border-y border-line bg-elev px-5 py-1.5 text-[11.5px] font-semibold tracking-[0.06em] text-ink-3 uppercase first:border-t-0">
      <span className="sn-num">{children}</span>
      {count !== undefined && <span className="sn-num font-normal normal-case tracking-normal">{count}</span>}
    </div>
  );
}
