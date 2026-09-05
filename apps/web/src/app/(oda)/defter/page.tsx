"use client";

/**
 * DEFTER — "Ne kazandık, hangi koşulda, kaç işlemle?"
 *
 * Kâr üçüncü sıradadır ve künyesi olmadan ekrana çıkmaz. Bu ekranda bilinçli
 * olarak yoktur: filo liderlik tablosu (ayırt etme gücü ±2,18R iken kâra göre
 * sıralamak gürültüyü sıralamaktır), kâr projeksiyonu (sistemin çıktısı ölçüm,
 * vaat değil) ve kutlama katmanı.
 */

import { useQuery } from "@tanstack/react-query";
import { RiCoinsLine, RiExchangeDollarLine, RiScales3Line } from "@remixicon/react";
import {
  api,
  type Benchmark,
  type CostSummary,
  type FleetRow,
  type Trade,
} from "@/lib/api";
import { Izgara, Kart, Not, Serit } from "@/panel/kart";
import { adet, Damga, Kunye, MONO, Olcum, sayi, Sessizlik } from "@/panel/olcum";
import { AlanGrafik, SutunGrafik } from "@/panel/grafik";
import { Chip } from "@/components/base/badges/chip";
import { cx } from "@/utils/cx";

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

/** %95 belirsizlik aralığı — tek sayı basmak yalan söylemektir. */
function belirsizlik(rler: number[]): { ort: number; yari: number } | null {
  if (rler.length < 3) return null;
  const ort = rler.reduce((a, b) => a + b, 0) / rler.length;
  const varyans = rler.reduce((a, b) => a + (b - ort) ** 2, 0) / (rler.length - 1);
  return { ort, yari: (1.96 * Math.sqrt(varyans)) / Math.sqrt(rler.length) };
}

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
  // yok, dolayısıyla 19.224 ₺ ile 400 $ toplanamaz.
  const dolar = kollar.filter((k) => k.market !== "BIST");
  const lira = kollar.filter((k) => k.market === "BIST");
  const ozsermaye = dolar.reduce((a, k) => a + k.equity, 0);
  const sermaye = dolar.reduce((a, k) => a + k.capital, 0);
  const liraFark = lira.reduce((a, k) => a + k.equity - k.capital, 0);

  const rler = (islemler.data ?? []).map((t) => t.pnl_r).filter((r) => Number.isFinite(r));
  const bel = belirsizlik(rler);

  const cikislar = Object.entries(
    (islemler.data ?? []).reduce<Record<string, number>>((acc, t) => {
      acc[t.exit_reason] = (acc[t.exit_reason] ?? 0) + 1;
      return acc;
    }, {}),
  ).sort((a, b) => b[1] - a[1]);

  const tutmalar = (islemler.data ?? []).reduce(
    (acc, t) => {
      if (t.hold_hours < 6) acc.kisa.push(t.pnl_r);
      else if (t.hold_hours < 24) acc.orta.push(t.pnl_r);
      else acc.uzun.push(t.pnl_r);
      return acc;
    },
    { kisa: [] as number[], orta: [] as number[], uzun: [] as number[] },
  );

  // Kıyas eğrisi: kolların ORTANCASI ile eşit ağırlıklı al-ve-tut yan yana.
  //
  // Ortalama değil ortanca: kollar farklı günlerde katıldı ve re-base görenler
  // var; tek bozuk eğri ortalamayı −%80'e çekiyordu. Ortanca o eğriyi yutar.
  //
  // Kaç kolun o anda rapor verdiği ipucunda yazar: eğrinin başında üç kol,
  // sonunda otuz kol var ve bu iki nokta aynı şeyi ölçmüyor. Çizgiyi gizlemek
  // yerine paydayı göstermek DESIGN-V4 §2'nin üçüncü kuralıdır.
  const kiyasEgrisi = (() => {
    const b = kiyas.data;
    if (!b?.benchmark?.length) return [];
    const kolNoktalari = new Map<string, number[]>();
    for (const kol of b.bots ?? []) {
      for (const p of kol.curve) {
        if (!kolNoktalari.has(p.at)) kolNoktalari.set(p.at, []);
        kolNoktalari.get(p.at)!.push(p.value);
      }
    }
    const ortanca = (xs: number[]) => {
      const s = [...xs].sort((x, y) => x - y);
      const m = Math.floor(s.length / 2);
      return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
    };
    return b.benchmark.map((p) => {
      const kol = kolNoktalari.get(p.at) ?? [];
      return {
        ad: new Date(p.at).toLocaleString("tr-TR", {
          day: "2-digit",
          month: "short",
          hour: "2-digit",
        }),
        a: kol.length >= 3 ? (ortanca(kol) - 1) * 100 : null,
        b: (p.value - 1) * 100,
        n: kol.length,
      };
    });
  })();

  return (
    <>
      <Kart baslik="Defter" soru="Ne kazandık ve o sayı ne kadar güvenilir?" govdeSiz>
        <div className="px-5 pb-4">
          <Izgara min={190}>
            <Olcum
              etiket="özsermaye − sermaye"
              ikon={RiCoinsLine}
              deger={`${sayi(ozsermaye - sermaye, 2, { isaret: true })} $`}
              kunye={`${adet(dolar.length)} dolar kolu · TL kolu hariç`}
              durum={ozsermaye - sermaye < 0 ? "bozuk" : "notr"}
              buyuk
            />
            <Olcum
              etiket="TL kolu (ayrı para)"
              ikon={RiExchangeDollarLine}
              deger={lira.length ? `${sayi(liraFark, 2, { isaret: true })} ₺` : "kol yok"}
              kunye={`${adet(lira.length)} kol · kur beslemesi yok, toplanamaz`}
              durum={liraFark < 0 ? "bozuk" : "notr"}
              buyuk
            />
            <Olcum
              etiket="R beklentisi"
              ikon={RiScales3Line}
              deger={
                bel ? `${sayi(bel.ort, 3, { isaret: true })} ± ${sayi(bel.yari, 3)}` : "yetersiz"
              }
              kunye={`n=${adet(rler.length)} işlem · %95 aralık`}
              durum={bel && bel.ort < 0 ? "bozuk" : "notr"}
              buyuk
            />
            <Olcum
              etiket="maliyetin brüt kâra oranı"
              deger={
                maliyet.data?.cost_ratio === null || maliyet.data?.cost_ratio === undefined
                  ? "brüt zararda"
                  : sayi(maliyet.data.cost_ratio, 3)
              }
              kunye={`n=${adet(maliyet.data?.trades ?? null)} işlem · komisyon + kayma`}
              durum={(maliyet.data?.cost_ratio ?? 0) > 0.5 ? "bozuk" : "notr"}
              rozet={
                maliyet.data?.measured_spread?.one_way_bps !== undefined
                  ? `ölçülen ${sayi(maliyet.data.measured_spread.one_way_bps, 1)} bps`
                  : undefined
              }
              rozetDurum={
                (maliyet.data?.measured_spread?.one_way_bps ?? 0) >
                (maliyet.data?.measured_spread?.assumed_one_way_bps ?? Infinity)
                  ? "uyari"
                  : "notr"
              }
              buyuk
            />
          </Izgara>
        </div>
        <Serit>
          <Not>
            Beklenti aralığı eşikten geniş olduğu sürece bu sayı bir hüküm değil bir birikimdir.
            Kolların hangisinin daha iyi olduğu bu ekrandan okunmaz; hüküm Hipotez ekranındaki
            mekanizma ölçüsünden okunur.
          </Not>
        </Serit>
      </Kart>

      <Kart
        baslik="Kıyas"
        soru="Seçmemek ne getirirdi? Bir getiri, alternatifi olmadan hiçbir şey ifade etmez."
        sag={
          kiyas.data?.sufficient === false ? <Damga durum="uyari">örneklem yetersiz</Damga> : null
        }
      >
        {kiyasEgrisi.length ? (
          <>
            <div className="mb-3 flex flex-wrap items-center gap-4">
              <span className="flex items-center gap-1.5 text-body-2-regular text-text-secondary">
                <span className="size-2 rounded-full bg-chart-6-active" aria-hidden />
                kol ortancası
              </span>
              <span className="flex items-center gap-1.5 text-body-2-regular text-text-secondary">
                <span className="size-2 rounded-full bg-chart-neutral" aria-hidden />
                eşit ağırlıklı al-ve-tut
              </span>
              <Kunye className="ml-auto">
                {adet(kiyas.data?.span_days ?? null)} gün · {adet(kiyas.data?.bots?.length ?? null)}{" "}
                kol · havuz {adet(kiyas.data?.universe_size ?? null)} sembol · ilk noktadan % değişim
              </Kunye>
            </div>
            <AlanGrafik veri={kiyasEgrisi} adlar={["kol ortancası", "al-ve-tut"]} />
            {kiyas.data?.verdict ? <Not className="mt-3">{kiyas.data.verdict}</Not> : null}
          </>
        ) : (
          <Sessizlik beklenen="Kıyas ölçütü henüz kurulamadı; alternatifi olmayan bir getiri basılmaz." />
        )}
      </Kart>

      <div className="grid gap-4 xl:grid-cols-2">
        <Kart baslik="Çıkış sebepleri" soru="Pozisyonlar neyle kapanıyor?">
          {cikislar.length ? (
            <>
              <SutunGrafik
                veri={cikislar.map(([sebep, n]) => {
                  const rs = (islemler.data ?? [])
                    .filter((t) => t.exit_reason === sebep)
                    .map((t) => t.pnl_r);
                  return {
                    ad: CIKIS_ADI[sebep] ?? sebep,
                    deger: rs.reduce((a, b) => a + b, 0) / (rs.length || 1),
                    n,
                  };
                })}
                basamak={2}
                birim=" R"
                yukseklik={200}
              />
              <Kunye className="mt-2">
                çubuk = ortalama R · n toplam {adet(islemler.data?.length ?? null)} işlem
              </Kunye>
            </>
          ) : (
            <Sessizlik beklenen="Bu pencerede kapanan işlem yok." />
          )}
        </Kart>

        <Kart
          baslik="Tutma süresi"
          soru="Kenar olgunlaşmadan mı çıkıyoruz?"
          sag={<Kunye>maliyet bariyeri ≈ 12 saat</Kunye>}
        >
          <SutunGrafik
            veri={[
              { ad: "2–6 sa", deger: ort(tutmalar.kisa), n: tutmalar.kisa.length },
              { ad: "6–24 sa", deger: ort(tutmalar.orta), n: tutmalar.orta.length },
              { ad: "24 sa +", deger: ort(tutmalar.uzun), n: tutmalar.uzun.length },
            ]}
            basamak={2}
            birim=" R"
            yukseklik={200}
          />
          <Not className="mt-2">
            Ölçüldü (2026-09-05): sinyal 1–4 saatlik ufukta round-trip maliyeti karşılamıyor, 12
            saatte başabaş, 48–72 saatte açık ara kârlı. Bugünkü ortalama tutma 12,3 saat, yani tam
            bariyerin dibinde.
          </Not>
        </Kart>
      </div>

      <Kart baslik="Kollar" soru="Her kol kendi sermayesine göre nerede?" govdeSiz>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left">
            <thead>
              <tr className="border-y border-separator-border bg-background-secondary-default text-caption-1-medium text-text-tertiary">
                <th className="w-12 px-5 py-2 font-medium">#</th>
                <th className="px-3 py-2 font-medium">Kol</th>
                <th className="w-20 px-3 py-2 font-medium">Grup</th>
                <th className="w-20 px-3 py-2 font-medium">Pazar</th>
                <th className="w-28 px-3 py-2 text-right font-medium">Özsermaye</th>
                <th className="w-24 px-3 py-2 text-right font-medium">Getiri</th>
                <th className="w-24 px-3 py-2 text-right font-medium">Düşüş</th>
                <th className="w-20 px-3 py-2 text-right font-medium">İşlem</th>
                <th className="w-24 px-3 py-2 text-right font-medium">Ort. R</th>
                <th className="w-16 px-3 py-2 pr-5 text-right font-medium">Açık</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-separator-border">
              {(filo.data ?? []).map((k) => (
                <tr
                  key={k.id}
                  className={cx(
                    "text-body-2-regular hover:bg-background-secondary-hover",
                    k.state === "STOPPED" && "opacity-50",
                  )}
                >
                  <td className={cx(MONO, "px-5 py-2 text-text-tertiary")}>{k.id}</td>
                  <td className="px-3 py-2 text-text-primary">{k.name}</td>
                  <td className="px-3 py-2">
                    <Chip variant="caption" color="soft">
                      {k.group}
                    </Chip>
                  </td>
                  <td className={cx(MONO, "px-3 py-2 text-caption-1-regular text-text-tertiary")}>
                    {k.market}
                  </td>
                  <td className={cx(MONO, "px-3 py-2 text-right text-text-primary")}>
                    {sayi(k.equity, 2)}
                  </td>
                  <td
                    className={cx(
                      MONO,
                      "px-3 py-2 text-right",
                      (k.return_pct ?? 0) < 0 ? "text-status-rose-text" : "text-text-primary",
                    )}
                  >
                    {sayi(k.return_pct, 2, { yuzde: true, isaret: true })}
                  </td>
                  <td
                    className={cx(
                      MONO,
                      "px-3 py-2 text-right",
                      (k.drawdown_pct ?? 0) < -0.1
                        ? "text-status-rose-text"
                        : "text-text-secondary",
                    )}
                  >
                    {sayi(k.drawdown_pct, 2, { yuzde: true })}
                  </td>
                  <td className={cx(MONO, "px-3 py-2 text-right text-text-secondary")}>
                    {adet(k.trades)}
                  </td>
                  <td
                    className={cx(
                      MONO,
                      "px-3 py-2 text-right",
                      (k.avg_r ?? 0) < 0 ? "text-status-rose-text" : "text-text-primary",
                    )}
                  >
                    {sayi(k.avg_r, 3, { isaret: true })}
                  </td>
                  <td className={cx(MONO, "px-3 py-2 pr-5 text-right text-text-secondary")}>
                    {adet(k.open_positions)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Serit>
          <Not>
            Tablo kol kimliğine göre sıralı, kâra göre değil. 14 günlük belirsizlik ±2,18R iken
            kolları kâra göre sıralamak gürültüyü sıralamaktır.
          </Not>
        </Serit>
      </Kart>
    </>
  );
}

function ort(xs: number[]): number | null {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}
