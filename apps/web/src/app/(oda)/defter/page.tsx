"use client";

/**
 * DEFTER — "Ne kazandık, hangi koşulda, kaç işlemle?"
 *
 * Kâr üçüncü sıradadır ve künyesi olmadan ekrana çıkmaz (§1). Bu ekranda
 * bilinçli olarak **yoktur**:
 *   · filo liderlik tablosu — ayırt etme gücü ±2,18R iken kâra göre
 *     sıralamak gürültüyü sıralamaktır;
 *   · kâr projeksiyonu — sistemin çıktısı ölçümdür, vaat değil;
 *   · kutlama katmanı — beklentisi negatif olan bir sistemin kullanıcısını
 *     tebrik etmesi yalandır.
 *
 * Kâr renk kazanmaz, zarar kazanır. Asimetriktir ve öyle olmalı: renk
 * bütçesi kârdan alınıp güvene aktarıldı.
 */

import { useQuery } from "@tanstack/react-query";
import {
  api,
  type Benchmark,
  type CostSummary,
  type FleetRow,
  type Trade,
} from "@/lib/api";
import { Bolum, Izgara, Muhakeme } from "@/v4/kutu";
import { adet, Damga, Olcum, sayi, Sessizlik } from "@/v4/olcum";

/** Para: negatifse kırmızı, pozitifse renksiz. */
function Para({ v, kunye, etiket }: { v: number | null; kunye: string; etiket: string }) {
  return (
    <Olcum
      etiket={etiket}
      deger={v === null ? "—" : `${sayi(v, 2, { isaret: true })} $`}
      kunye={kunye}
      durum={v !== null && v < 0 ? "bozuk" : "saglikli"}
      olcek="duvar"
    />
  );
}

/** %95 belirsizlik aralığı — tek sayı basmak yalan söylemektir. */
function belirsizlik(rler: number[]): { ort: number; yari: number } | null {
  if (rler.length < 3) return null;
  const ort = rler.reduce((a, b) => a + b, 0) / rler.length;
  const varyans = rler.reduce((a, b) => a + (b - ort) ** 2, 0) / (rler.length - 1);
  return { ort, yari: (1.96 * Math.sqrt(varyans)) / Math.sqrt(rler.length) };
}

const CIKIS_ADI: Record<string, string> = {
  STOP: "stop",
  BREAKEVEN: "başabaş",
  TRAILING: "iz sürme",
  SCORE: "puan düştü",
  TIME: "süre doldu",
  ROTATION: "rotasyon",
  KILL_SWITCH: "acil durdurma",
  DELIST: "listeden düştü",
  MANUAL: "elle",
  LIQUIDATION: "tasfiye",
  PARTIAL: "kısmi",
};

export default function DefterEkrani() {
  const filo = useQuery({
    queryKey: ["filo"],
    queryFn: () => api.get<FleetRow[]>("/bots/fleet"),
    refetchInterval: 60_000,
  });
  const maliyet = useQuery({
    queryKey: ["maliyet"],
    queryFn: () => api.get<CostSummary>("/portfolio/costs"),
  });
  const kiyas = useQuery({
    queryKey: ["kiyas"],
    queryFn: () => api.get<Benchmark>("/portfolio/benchmark"),
  });
  const islemler = useQuery({
    queryKey: ["islemler"],
    queryFn: () => api.get<Trade[]>("/trades", { limit: 500 }),
  });

  const kollar = (filo.data ?? []).filter((k) => k.state !== "STOPPED");
  // BIST kolu TL cinsindendir ve USD toplamına KARIŞTIRILMAZ: kur beslemesi
  // yok, dolayısıyla 19.224 ₺ ile 400 $ toplanamaz. Karıştırıldığında toplam
  // sessizce yanlış çıkar — payda gizlemekle aynı hata.
  const dolarKollari = kollar.filter((k) => k.market !== "BIST");
  const liraKollari = kollar.filter((k) => k.market === "BIST");
  const toplamOzsermaye = dolarKollari.reduce((a, k) => a + k.equity, 0);
  const toplamSermaye = dolarKollari.reduce((a, k) => a + k.capital, 0);
  const toplamIslem = dolarKollari.reduce((a, k) => a + k.trades, 0);
  const liraFark = liraKollari.reduce((a, k) => a + k.equity - k.capital, 0);

  const rler = (islemler.data ?? []).map((t) => t.pnl_r).filter((r) => Number.isFinite(r));
  const bel = belirsizlik(rler);

  const cikislar = (islemler.data ?? []).reduce<Record<string, number>>((acc, t) => {
    acc[t.exit_reason] = (acc[t.exit_reason] ?? 0) + 1;
    return acc;
  }, {});

  const tutmalar = (islemler.data ?? []).reduce(
    (acc, t) => {
      const s = t.hold_hours;
      if (s < 6) acc.kisa.push(t.pnl_r);
      else if (s < 24) acc.orta.push(t.pnl_r);
      else acc.uzun.push(t.pnl_r);
      return acc;
    },
    { kisa: [] as number[], orta: [] as number[], uzun: [] as number[] },
  );

  return (
    <>
      <Bolum
        baslik="defter"
        soru="Ne kazandık ve o sayı ne kadar güvenilir?"
        sag={<span className="v4-kunye">canlı para yok · tüm emirler kağıt motorundan geçer</span>}
      >
        <Izgara sutun={4}>
          <Para
            etiket="özsermaye − sermaye"
            v={toplamOzsermaye - toplamSermaye}
            kunye={`${adet(dolarKollari.length)} dolar kolu · ${adet(toplamIslem)} işlem · TL kolu hariç`}
          />
          <Olcum
            etiket="TL kolu (ayrı para)"
            deger={
              liraKollari.length
                ? `${sayi(liraFark, 2, { isaret: true })} ₺`
                : "kol yok"
            }
            kunye={`${adet(liraKollari.length)} kol · kur beslemesi yok, toplanamaz`}
            durum={liraFark < 0 ? "bozuk" : "saglikli"}
            olcek="duvar"
          />
          <Olcum
            etiket="R beklentisi"
            deger={
              bel
                ? `${sayi(bel.ort, 3, { isaret: true })} ± ${sayi(bel.yari, 3)}`
                : "örneklem yetersiz"
            }
            kunye={`n=${adet(rler.length)} işlem · %95 aralık`}
            durum={bel && bel.ort < 0 ? "bozuk" : "saglikli"}
            olcek="duvar"
          />
          <Olcum
            etiket="maliyetin brüt kâra oranı"
            deger={
              maliyet.data?.cost_ratio === null || maliyet.data?.cost_ratio === undefined
                ? "brüt zararda"
                : sayi(maliyet.data.cost_ratio, 3)
            }
            kunye={`n=${adet(maliyet.data?.trades ?? null)} işlem · komisyon+kayma`}
            durum={(maliyet.data?.cost_ratio ?? 0) > 0.5 ? "bozuk" : "saglikli"}
            olcek="duvar"
          />
          <Olcum
            etiket="ölçülen tek yön maliyet"
            deger={
              maliyet.data?.measured_spread?.one_way_bps === undefined
                ? "—"
                : `${sayi(maliyet.data.measured_spread.one_way_bps, 1)} bps`
            }
            kunye={`varsayım ${sayi(maliyet.data?.measured_spread?.assumed_one_way_bps ?? null, 1)} bps · n=${adet(
              maliyet.data?.measured_spread?.samples ?? null,
            )} örnek`}
            durum={
              (maliyet.data?.measured_spread?.one_way_bps ?? 0) >
              (maliyet.data?.measured_spread?.assumed_one_way_bps ?? Infinity)
                ? "supheli"
                : "saglikli"
            }
            olcek="duvar"
          />
        </Izgara>
        <div className="px-4 pb-4">
          <Muhakeme>
            Beklenti aralığı eşikten geniş olduğu sürece bu sayı bir hüküm değil bir
            birikimdir. Kolların hangisinin daha iyi olduğu bu ekrandan okunmaz; hüküm
            Hipotez ekranındaki mekanizma ölçüsünden okunur.
          </Muhakeme>
        </div>
      </Bolum>

      <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(380px, 1fr))" }}>
        <Bolum baslik="çıkış sebepleri" soru="Pozisyonlar neyle kapanıyor?">
          {Object.keys(cikislar).length ? (
            <table className="v4-tablo">
              <thead>
                <tr>
                  <th>sebep</th>
                  <th className="sayi" style={{ width: 74 }}>
                    adet
                  </th>
                  <th className="sayi" style={{ width: 92 }}>
                    ortalama R
                  </th>
                  <th>pay</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(cikislar)
                  .sort((a, b) => b[1] - a[1])
                  .map(([sebep, n]) => {
                    const rs = (islemler.data ?? [])
                      .filter((t) => t.exit_reason === sebep)
                      .map((t) => t.pnl_r);
                    const ort = rs.reduce((a, b) => a + b, 0) / (rs.length || 1);
                    return (
                      <tr key={sebep}>
                        <td>{CIKIS_ADI[sebep] ?? sebep}</td>
                        <td className="sayi">{adet(n)}</td>
                        <td className="sayi" style={{ color: ort < 0 ? "var(--v4-kirmizi)" : undefined }}>
                          {sayi(ort, 3, { isaret: true })}
                        </td>
                        <td>
                          <div
                            style={{
                              height: 6,
                              width: `${(n / (islemler.data?.length || 1)) * 100}%`,
                              background: "var(--v4-olu)",
                            }}
                          />
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          ) : (
            <Sessizlik beklenen="Bu pencerede kapanan işlem yok." />
          )}
        </Bolum>

        <Bolum
          baslik="tutma süresi"
          soru="Kenar olgunlaşmadan mı çıkıyoruz?"
          sag={<span className="v4-kunye">maliyet bariyeri ≈ 12 saat</span>}
        >
          <table className="v4-tablo">
            <thead>
              <tr>
                <th>pencere</th>
                <th className="sayi" style={{ width: 74 }}>
                  n
                </th>
                <th className="sayi" style={{ width: 110 }}>
                  ortalama R
                </th>
                <th className="sayi" style={{ width: 96 }}>
                  kazanma
                </th>
              </tr>
            </thead>
            <tbody>
              {(
                [
                  ["2–6 saat", tutmalar.kisa],
                  ["6–24 saat", tutmalar.orta],
                  ["24 saat +", tutmalar.uzun],
                ] as const
              ).map(([ad, rs]) => {
                const ort = rs.length ? rs.reduce((a, b) => a + b, 0) / rs.length : null;
                const kazanan = rs.filter((r) => r > 0).length;
                return (
                  <tr key={ad}>
                    <td>{ad}</td>
                    <td className="sayi">{adet(rs.length)}</td>
                    <td
                      className="sayi"
                      style={{ color: (ort ?? 0) < 0 ? "var(--v4-kirmizi)" : undefined }}
                    >
                      {ort === null ? "—" : sayi(ort, 3, { isaret: true })}
                    </td>
                    <td className="sayi">
                      {rs.length ? sayi(kazanan / rs.length, 0, { yuzde: true }) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="px-4 py-3" style={{ borderTop: "1px solid var(--v4-cizgi)" }}>
            <Muhakeme>
              Ölçüldü (2026-09-05): sinyal 1–4 saatlik ufukta round-trip maliyeti
              karşılamıyor, 12 saatte başabaş, 48–72 saatte açık ara kârlı. Bugünkü ortalama
              tutma 12,3 saat, yani tam bariyerin dibinde.
            </Muhakeme>
          </div>
        </Bolum>
      </div>

      <Bolum
        baslik="kıyas"
        soru="Seçmemek ne getirirdi? Bir getiri, alternatifi olmadan hiçbir şey ifade etmez."
        sag={
          kiyas.data?.sufficient === false ? (
            <Damga tur="supheli">örneklem yetersiz</Damga>
          ) : null
        }
      >
        {kiyas.data?.verdict ? (
          <div className="px-4 py-3">
            <Muhakeme>{kiyas.data.verdict}</Muhakeme>
            <div className="v4-kunye mt-2">
              {adet(kiyas.data.span_days ?? null)} gün · {adet(kiyas.data.trades ?? null)} işlem ·
              havuz {adet(kiyas.data.universe_size ?? null)} sembol · eşit ağırlıklı al-ve-tut
            </div>
          </div>
        ) : (
          <Sessizlik beklenen="Kıyas ölçütü henüz kurulamadı; alternatifi olmayan bir getiri basılmaz." />
        )}
      </Bolum>

      <Bolum baslik="kollar" soru="Her kol kendi sermayesine göre nerede?">
        <table className="v4-tablo">
          <thead>
            <tr>
              <th style={{ width: 46 }}>#</th>
              <th>kol</th>
              <th style={{ width: 74 }}>grup</th>
              <th style={{ width: 62 }}>pazar</th>
              <th className="sayi" style={{ width: 92 }}>
                özsermaye
              </th>
              <th className="sayi" style={{ width: 86 }}>
                getiri
              </th>
              <th className="sayi" style={{ width: 86 }}>
                düşüş
              </th>
              <th className="sayi" style={{ width: 66 }}>
                işlem
              </th>
              <th className="sayi" style={{ width: 86 }}>
                ortalama R
              </th>
              <th className="sayi" style={{ width: 74 }}>
                açık
              </th>
            </tr>
          </thead>
          <tbody>
            {(filo.data ?? []).map((k) => (
              <tr key={k.id} style={{ opacity: k.state === "STOPPED" ? 0.5 : 1 }}>
                <td className="sayi" style={{ color: "var(--v4-ikincil)" }}>
                  {k.id}
                </td>
                <td>{k.name}</td>
                <td className="v4-kunye">{k.group}</td>
                <td className="v4-kunye">{k.market}</td>
                <td className="sayi">{sayi(k.equity, 2)}</td>
                <td
                  className="sayi"
                  style={{ color: (k.return_pct ?? 0) < 0 ? "var(--v4-kirmizi)" : undefined }}
                >
                  {sayi(k.return_pct, 2, { yuzde: true, isaret: true })}
                </td>
                <td
                  className="sayi"
                  style={{ color: (k.drawdown_pct ?? 0) < -0.1 ? "var(--v4-kirmizi)" : undefined }}
                >
                  {sayi(k.drawdown_pct, 2, { yuzde: true })}
                </td>
                <td className="sayi">{adet(k.trades)}</td>
                <td
                  className="sayi"
                  style={{ color: (k.avg_r ?? 0) < 0 ? "var(--v4-kirmizi)" : undefined }}
                >
                  {sayi(k.avg_r, 3, { isaret: true })}
                </td>
                <td className="sayi">{adet(k.open_positions)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="px-4 py-3" style={{ borderTop: "1px solid var(--v4-cizgi)" }}>
          <Muhakeme>
            Tablo kol kimliğine göre sıralı, kâra göre değil. 14 günlük belirsizlik ±2,18R
            iken kolları kâra göre sıralamak gürültüyü sıralamaktır.
          </Muhakeme>
        </div>
      </Bolum>
    </>
  );
}
