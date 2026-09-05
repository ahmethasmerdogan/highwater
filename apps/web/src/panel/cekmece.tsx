"use client";

/**
 * Kütük çekmecesi — sağdan açılır, `~` ile ya da kenar çubuğundan.
 *
 * v3'te "Günlük" adında ayrı bir sayfaydı ve ayrı sayfa olması sentezi
 * kullanıcıya bırakıyordu: "bot 12 donmuş" Botlar'da, "BIST barı geldi"
 * Piyasa'daydı; ikisini birleştirmek arayüzün değil insanın işiydi. Kütük
 * artık her ekranın üzerinde açılır — baktığınız sayının yanında, sayfayı
 * terk etmeden.
 */

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { RiCloseLine } from "@remixicon/react";
import { Chip } from "@/components/base/badges/chip";
import { api, type BotEvent } from "@/lib/api";
import { cx } from "@/utils/cx";
import { Kunye, MONO, Sessizlik } from "./olcum";
import { Secim } from "./secim";

const SEVIYE: Record<string, "rose" | "yellow" | "soft"> = {
  CRITICAL: "rose",
  ERROR: "rose",
  WARN: "yellow",
  INFO: "soft",
};

const SUZGECLER = [
  { id: "hepsi", ad: "Hepsi" },
  { id: "WARN", ad: "Uyarı" },
  { id: "ERROR", ad: "Hata" },
] as const;

function saat(iso: string): string {
  return new Date(iso).toLocaleTimeString("tr-TR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function ozet(olay: BotEvent): string {
  const p = olay.payload ?? {};
  return String(p.message ?? p.symbol ?? JSON.stringify(p).slice(0, 200));
}

export function KutukCekmecesi({ acik, kapat }: { acik: boolean; kapat: () => void }) {
  const [suzgec, setSuzgec] = useState<(typeof SUZGECLER)[number]["id"]>("hepsi");

  const { data, isLoading } = useQuery({
    queryKey: ["kutuk", suzgec],
    queryFn: () =>
      api.get<BotEvent[]>("/logs", {
        limit: 300,
        level: suzgec === "hepsi" ? undefined : suzgec,
      }),
    refetchInterval: acik ? 15_000 : false,
    enabled: acik,
  });

  useEffect(() => {
    if (!acik) return;
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") kapat();
    };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [acik, kapat]);

  return (
    <>
      <div
        aria-hidden={!acik}
        onClick={kapat}
        className={cx(
          "fixed inset-0 z-40 bg-black/25 transition-opacity duration-200",
          acik ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      />
      <aside
        aria-hidden={!acik}
        className={cx(
          "fixed top-0 right-0 bottom-0 z-50 flex w-[min(600px,94vw)] flex-col",
          "border-l border-border-button-default bg-background-primary-default shadow-xl",
          "transition-transform duration-[260ms] ease-out",
          acik ? "translate-x-0" : "translate-x-full",
        )}
      >
        <div className="flex items-center justify-between gap-3 border-b border-separator-border px-4 py-3">
          <div>
            <p className="text-body-medium text-text-primary">Kütük</p>
            <Kunye>son 300 satır · 15 sn&apos;de bir yenilenir</Kunye>
          </div>
          <div className="flex items-center gap-2">
            <Secim
              ariaLabel="Kütük süzgeci"
              secenekler={[...SUZGECLER]}
              deger={suzgec}
              degistir={setSuzgec}
            />
            <button
              type="button"
              onClick={kapat}
              aria-label="Kütüğü kapat"
              className="cursor-pointer rounded-lg p-1.5 text-foreground-icon-tertiary hover:bg-background-tertiary-hover"
            >
              <RiCloseLine className="size-5" aria-hidden />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {isLoading ? (
            <p className="px-4 py-4 text-body-2-regular text-text-tertiary">okunuyor…</p>
          ) : !data?.length ? (
            <Sessizlik beklenen="Kütük boş. Koşan bir kol varken bu beklenen bir durum değildir: olay yazılmıyorsa ya kollar çalışmıyor ya da kayıt yolu kopmuş demektir." />
          ) : (
            <ul className="divide-y divide-separator-border">
              {data.map((olay) => (
                <li key={olay.id} className="flex gap-3 px-4 py-2.5">
                  <span className={cx(MONO, "shrink-0 text-caption-1-regular text-text-tertiary")}>
                    {saat(olay.created_at)}
                  </span>
                  <span className="shrink-0">
                    <Chip variant="caption" color={SEVIYE[olay.level] ?? "soft"}>
                      {olay.level}
                    </Chip>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-body-2-regular text-text-primary">
                      {ozet(olay)}
                    </span>
                    <Kunye>{olay.kind}</Kunye>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>
    </>
  );
}
