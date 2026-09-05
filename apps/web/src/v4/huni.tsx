"use client";

/**
 * Karar hunisi — DESIGN-V4 §4'ün amiral bileşeni.
 *
 * Her basamakta **iki** sayı yan yana durur: kaç aday öldü ve ölenlerin
 * ölçülen kenar özelliği neydi.
 *
 * Tek başına "293 aday doluluk kapısında öldü" cümlesi bilgi değildir —
 * sistem zaten öyle çalışıyor. Yanına "ölenlerin sakinlik yüzdeliği 82,0,
 * açılanların 36,0" konunca huni bir **teşhis aracı** olur ve
 * KAR-TESHISI §9'un t = −9,20 bulgusu kalıcı bir organa dönüşür:
 * boyutlandırma, puanlamanın ödüllendirdiği kenarı sistematik olarak eliyor.
 */

import type { Huni } from "@/lib/api";
import { adet, Damga, Olcum, sayi } from "./olcum";
import { Etiket, Muhakeme } from "./kutu";

const OZELLIK_ADI: Record<string, string> = {
  atr_pct: "sakinlik",
  bb_width: "sıkışma",
  trend_1d: "trend",
  ret_168h_skip6: "momentum",
  taker_buy_ratio: "alıcı akışı",
};

/** Barın genişliği havuza oranlı; ölçek yanıltmasın diye kök alınmaz. */
function genislik(adet: number, havuz: number): string {
  if (!havuz) return "0%";
  return `${Math.max(0.6, (adet / havuz) * 100)}%`;
}

export function KararHunisi({ veri, ozellik }: { veri: Huni; ozellik: string }) {
  const havuz = veri.basamaklar.find((b) => b.asama === "havuz")?.adet ?? 0;
  const acilan = veri.basamaklar.find((b) => b.asama === "acildi");
  const kenar = veri.kenar;

  if (!veri.basamaklar.length) {
    return (
      <div className="px-4 py-5" style={{ borderTop: "1px solid var(--v4-cizgi)" }}>
        <Etiket>sessizlik</Etiket>
        <Muhakeme>
          Bu pencerede tek bir karar izi yok. Koşan bir kol varken bu beklenen bir durum
          değildir: ya kollar bar tüketmiyor ya da iz yazımı kopmuş. Karar izi
          2026-09-05&apos;te açıldı; ondan önceki barlar için huni kurulamaz.
        </Muhakeme>
      </div>
    );
  }

  return (
    <div>
      <table className="v4-tablo">
        <thead>
          <tr>
            <th style={{ width: "34%" }}>basamak</th>
            <th className="sayi" style={{ width: 74 }}>
              aday
            </th>
            <th style={{ width: "22%" }}>pay</th>
            <th className="sayi" style={{ width: 96 }}>
              ölen {OZELLIK_ADI[ozellik] ?? ozellik}
            </th>
            <th>sebep</th>
          </tr>
        </thead>
        <tbody>
          {veri.basamaklar.map((b) => {
            const acildi = b.asama === "acildi";
            const deger = b.ozellikler[ozellik];
            return (
              <tr key={b.asama}>
                <td>
                  <span style={{ color: "var(--v4-ikincil)" }}>
                    {b.asama === "havuz" ? "" : "└─ "}
                  </span>
                  <span
                    style={{
                      color: acildi ? "var(--v4-civit)" : "var(--v4-murekkep)",
                      fontWeight: acildi || b.asama === "havuz" ? 500 : 400,
                    }}
                  >
                    {b.ad}
                  </span>
                </td>
                <td className="sayi" style={{ color: acildi ? "var(--v4-civit)" : undefined }}>
                  {adet(b.adet)}
                </td>
                <td>
                  <div
                    style={{
                      height: 7,
                      width: genislik(b.adet, havuz),
                      background: acildi ? "var(--v4-civit)" : "var(--v4-olu)",
                      borderRadius: 1,
                      transition: "background var(--v4-gecis)",
                    }}
                  />
                </td>
                <td
                  className="sayi"
                  style={{ color: deger === undefined ? "var(--v4-olu)" : "var(--v4-murekkep)" }}
                >
                  {deger === undefined ? "—" : sayi(deger, 1)}
                </td>
                <td style={{ color: "var(--v4-ikincil)", fontSize: 12 }}>
                  {b.nedenler.map((n) => n.neden).join(" · ") || "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Hunideki asıl bulgu: ölenlerin kenarı açılanlarınkinden yüksek mi. */}
      <div
        className="grid gap-x-8 gap-y-4 px-4 py-4"
        style={{
          borderTop: "1px solid var(--v4-cizgi)",
          gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
        }}
      >
        <Olcum
          etiket={`boyutta ölen ${OZELLIK_ADI[ozellik] ?? ozellik}`}
          deger={sayi(kenar.olen_ortalama, 1)}
          kunye={`n=${adet(kenar.n_olen)} · yüzdelik`}
          durum="saglikli"
        />
        <Olcum
          etiket={`açılan ${OZELLIK_ADI[ozellik] ?? ozellik}`}
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
                : "|t| < 2 · fark gürültüden ayrışmıyor"
          }
          durum={kenar.t !== null && kenar.t < -2 ? "bozuk" : "kanit"}
        />
        <Olcum
          etiket="dolum oranı ortancası"
          deger={sayi(veri.dolum_orani.ortanca, 3)}
          kunye={`n=${adet(veri.dolum_orani.n)} · hedefin kaçta kaçı`}
        />
      </div>

      {/* Hiç bağlamayan tavan koruma değil yanılsamadır (§7). */}
      <div
        className="flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3"
        style={{ borderTop: "1px solid var(--v4-cizgi)", background: "var(--v4-oyuk)" }}
      >
        <Etiket>bağlayan tavan</Etiket>
        {veri.tavanlar.map((t) => (
          <span key={t.ad} className="flex items-baseline gap-2">
            {t.adet === 0 ? (
              <span style={{ color: "var(--v4-olu)", fontSize: 10 }} aria-hidden>
                ◼
              </span>
            ) : null}
            <span
              className="v4-olcum"
              style={{ color: t.adet === 0 ? "var(--v4-olu)" : "var(--v4-murekkep)" }}
            >
              {adet(t.adet)}
            </span>
            <span
              style={{ fontSize: 12, color: t.adet === 0 ? "var(--v4-olu)" : "var(--v4-ikincil)" }}
            >
              {t.ad}
            </span>
          </span>
        ))}
      </div>

      {acilan && kenar.t !== null && kenar.t < -2 ? (
        <div
          className="px-4 py-3"
          style={{ borderTop: "1px solid var(--v4-cizgi)", background: "var(--v4-kirmizi-zemin)" }}
        >
          <Damga tur="bozuk">kenar eleniyor</Damga>
          <Muhakeme>
            {" "}
            Boyutlandırmada ölen adayların {OZELLIK_ADI[ozellik] ?? ozellik} yüzdeliği{" "}
            {sayi(kenar.olen_ortalama, 1)}, açılanlarınki {sayi(kenar.acilan_ortalama, 1)}. Sistem
            puanlamayla ödüllendirdiği kenarı boyutlandırmada geri veriyor.
          </Muhakeme>
        </div>
      ) : null}
    </div>
  );
}

export { OZELLIK_ADI };
