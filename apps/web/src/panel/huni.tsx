"use client";

/**
 * Karar hunisi — DESIGN-V4 §4'ün amiral bileşeni.
 *
 * Her basamakta **iki** sayı yan yana durur: kaç aday öldü ve ölenlerin
 * ölçülen kenar özelliği neydi.
 *
 * Tek başına "293 aday doluluk kapısında öldü" cümlesi bilgi değildir — sistem
 * zaten öyle çalışıyor. Yanına "ölenlerin sakinlik yüzdeliği 82,0, açılanların
 * 36,0" konunca huni bir **teşhis aracı** olur ve KAR-TESHISI §9'un t = −9,20
 * bulgusu kalıcı bir organa dönüşür.
 */

import type { Huni } from "@/lib/api";
import { Chip } from "@/components/base/badges/chip";
import { cx } from "@/utils/cx";
import { Izgara, Not, Serit } from "./kart";
import { adet, Damga, Kunye, MONO, Olcum, sayi, Sessizlik } from "./olcum";

export const OZELLIK_ADI: Record<string, string> = {
  atr_pct: "sakinlik",
  bb_width: "sıkışma",
  trend_1d: "trend",
  ret_168h_skip6: "momentum",
  taker_buy_ratio: "alıcı akışı",
};

export function KararHunisi({ veri, ozellik }: { veri: Huni; ozellik: string }) {
  const havuz = veri.basamaklar.find((b) => b.asama === "havuz")?.adet ?? 0;
  const kenar = veri.kenar;
  const ad = OZELLIK_ADI[ozellik] ?? ozellik;
  // Payda bozuksa (bir basamak havuzdan büyükse) oran çizmek yalan söylemektir.
  const paydaBozuk = veri.basamaklar.some((b) => b.asama !== "havuz" && b.adet > havuz);

  if (!veri.basamaklar.length) {
    return (
      <Sessizlik beklenen="Bu pencerede tek bir karar izi yok. Koşan bir kol varken bu beklenen bir durum değildir: ya kollar bar tüketmiyor ya da iz yazımı kopmuş. Karar izi 2026-09-05'te açıldı; ondan önceki barlar için huni kurulamaz." />
    );
  }

  return (
    <div>
      {paydaBozuk ? (
        <Serit ton="uyari">
          <Damga durum="uyari">payda eksik</Damga>
          <Not className="mt-1.5">
            Bir basamak havuzdan büyük görünüyor. Bu pencereye karar izinin açılmasından önceki
            barlar giriyor: o barların kapı satırı var, havuz satırı yok. Oranlar bu yüzden
            okunmamalı; pencereyi daraltın.
          </Not>
        </Serit>
      ) : null}

      {/* Basamaklar — her satır bir çubuk, sağında ölenlerin kenarı */}
      <ul className="divide-y divide-separator-border">
        {veri.basamaklar.map((b, i) => {
          const acildi = b.asama === "acildi";
          const deger = b.ozellikler[ozellik];
          const oran = havuz && b.adet <= havuz ? b.adet / havuz : 0;
          return (
            <li key={b.asama} className="px-5 py-3">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="text-text-quaternary" aria-hidden>
                  {i === 0 ? "" : "└"}
                </span>
                <span
                  className={cx(
                    "text-body-medium",
                    acildi ? "text-status-blue-text" : "text-text-primary",
                  )}
                >
                  {b.ad}
                </span>
                <span className={cx(MONO, "text-body-medium text-text-primary")}>
                  {adet(b.adet)}
                </span>
                <span className="text-caption-1-regular text-text-tertiary">aday</span>
                <span className="ml-auto flex items-center gap-2">
                  <span className="text-caption-1-regular text-text-tertiary">{ad}</span>
                  <Chip
                    variant="bold"
                    color={
                      deger === undefined
                        ? "gray"
                        : acildi
                          ? "blue"
                          : deger >= 65
                            ? "rose"
                            : "neutral"
                    }
                  >
                    <span className={MONO}>{deger === undefined ? "—" : sayi(deger, 1)}</span>
                  </Chip>
                </span>
              </div>

              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-chart-track">
                <div
                  className={cx(
                    "h-full rounded-full transition-[width] duration-300 ease-out",
                    acildi ? "bg-chart-6-active" : "bg-chart-neutral",
                  )}
                  style={{ width: `${Math.max(oran * 100, oran > 0 ? 0.8 : 0)}%` }}
                />
              </div>

              {b.nedenler.length ? (
                <Kunye className="mt-1.5">{b.nedenler.map((n) => n.neden).join(" · ")}</Kunye>
              ) : null}
            </li>
          );
        })}
      </ul>

      {/* Asıl bulgu: ölenlerin kenarı açılanlarınkinden yüksek mi */}
      <div className="border-t border-separator-border px-5 py-4">
        <Izgara min={150}>
          <Olcum
            etiket={`boyutta ölen ${ad}`}
            deger={sayi(kenar.olen_ortalama, 1)}
            kunye={`n=${adet(kenar.n_olen)} · yüzdelik`}
            durum={
              kenar.olen_ortalama !== null && kenar.olen_ortalama >= 65 ? "bozuk" : "notr"
            }
          />
          <Olcum
            etiket={`açılan ${ad}`}
            deger={sayi(kenar.acilan_ortalama, 1)}
            kunye={`n=${adet(kenar.n_acilan)} · yüzdelik`}
            durum="kanit"
          />
          <Olcum
            etiket="fark (Welch t)"
            deger={kenar.t === null ? "—" : sayi(kenar.t, 2)}
            kunye={
              kenar.t === null
                ? "iki grup da ≥ 3 gözlem ister"
                : Math.abs(kenar.t) >= 2
                  ? "|t| ≥ 2 · fark gürültü değil"
                  : "|t| < 2 · gürültüden ayrışmıyor"
            }
            durum={kenar.t !== null && kenar.t < -2 ? "bozuk" : "kanit"}
          />
          <Olcum
            etiket="dolum oranı ortancası"
            deger={sayi(veri.dolum_orani.ortanca, 3)}
            kunye={`n=${adet(veri.dolum_orani.n)} · hedefin kaçta kaçı`}
          />
        </Izgara>
      </div>

      {/* Hiç bağlamayan tavan koruma değil yanılsamadır */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-separator-border bg-background-secondary-default px-5 py-3">
        <span className="text-caption-1-medium text-text-tertiary">bağlayan tavan</span>
        {veri.tavanlar.map((t) => (
          <span key={t.ad} className="flex items-center gap-1.5">
            <Chip variant="caption" color={t.adet === 0 ? "gray" : "neutral"}>
              <span className={MONO}>{adet(t.adet)}</span>
            </Chip>
            <span
              className={cx(
                "text-caption-1-regular",
                t.adet === 0 ? "text-text-quaternary" : "text-text-secondary",
              )}
            >
              {t.ad}
            </span>
          </span>
        ))}
      </div>

      {kenar.t !== null && kenar.t < -2 ? (
        <Serit ton="bozuk">
          <Damga durum="bozuk">kenar eleniyor</Damga>
          <Not className="mt-1.5">
            Boyutlandırmada ölen adayların {ad} yüzdeliği {sayi(kenar.olen_ortalama, 1)},
            açılanlarınki {sayi(kenar.acilan_ortalama, 1)}. Sistem puanlamayla ödüllendirdiği
            kenarı boyutlandırmada geri veriyor.
          </Not>
        </Serit>
      ) : null}
    </div>
  );
}
