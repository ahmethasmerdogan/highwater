"use client";

/**
 * Grafikler — recharts, BoardUI'nin chart token'larıyla.
 *
 * v4'ün ilk sürümünde grafik yoktu ve bu bir kayıptı: özsermaye eğrisi,
 * desil dağılımı ve huni birer sayı listesine indirgenmişti. Şekil, sayının
 * söylemediğini söyler — desillerin monoton olup olmadığı tabloda satır satır
 * okunur, grafikte bir bakışta görülür.
 *
 * Sayı animasyonu yine yok: okunan sayı değişmemeli. Animasyon yalnızca
 * şekle uygulanır.
 */

import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useId } from "react";
import { sayi } from "./olcum";

const EKSEN = { fontSize: 11, fill: "var(--color-text-tertiary)" } as const;

function Kutu({
  baslik,
  satirlar,
}: {
  baslik: string;
  satirlar: { ad: string; deger: string; renk?: string }[];
}) {
  return (
    <div className="rounded-xl border border-border-button-default bg-background-primary-default px-3 py-2 shadow-md">
      <p className="text-caption-1-medium text-text-tertiary tabular-nums">{baslik}</p>
      {satirlar.map((s) => (
        <p key={s.ad} className="mt-0.5 flex items-center gap-2 text-body-2-medium">
          {s.renk ? (
            <span className="size-2 rounded-full" style={{ background: s.renk }} aria-hidden />
          ) : null}
          <span className="text-text-secondary">{s.ad}</span>
          <span className="ml-auto font-mono tabular-nums text-text-primary">{s.deger}</span>
        </p>
      ))}
    </div>
  );
}

/** Sıfır çizgili sütun grafiği — desiller, kenar farkları, aile IC'si. */
export function SutunGrafik({
  veri,
  yukseklik = 200,
  birim = "",
  basamak = 0,
  carpan = 1,
}: {
  veri: { ad: string; deger: number | null; n?: number }[];
  yukseklik?: number;
  birim?: string;
  basamak?: number;
  /** Gösterim çarpanı (ör. oranı bps'e çevirmek için 10000). */
  carpan?: number;
}) {
  const noktalar = veri.map((v) => ({ ...v, gosterim: (v.deger ?? 0) * carpan }));
  // Eksen SIFIRI daima içerir. recharts kendi başına veri aralığına daralır ve
  // hepsi negatif olan bir seride çubuklar tavandan sarkar; okuyan kişi "D2
  // küçük" sanır, oysa D2 de −20 bps'tir. İşaretli bir çubuk grafiğinde taban
  // çizgisi sıfır değilse grafik yalan söyler.
  const degerler = noktalar.map((n) => n.gosterim);
  const enAz = Math.min(0, ...degerler);
  const enCok = Math.max(0, ...degerler);
  const pay = (enCok - enAz) * 0.12 || 1;
  return (
    <div style={{ height: yukseklik }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={noktalar} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--color-chart-track)" strokeDasharray="3 3" />
          <XAxis
            dataKey="ad"
            tickLine={false}
            axisLine={false}
            tick={EKSEN}
            tickMargin={8}
            interval={0}
          />
          <YAxis
            width={56}
            tickLine={false}
            axisLine={false}
            tick={EKSEN}
            tickCount={5}
            domain={[enAz - (enAz < 0 ? pay : 0), enCok + (enCok > 0 ? pay : 0)]}
            tickFormatter={(v: number) => sayi(v, basamak)}
          />
          <ReferenceLine y={0} stroke="var(--color-chart-cursor)" />
          <Tooltip
            cursor={{ fill: "var(--color-chart-track)", fillOpacity: 0.4 }}
            content={({ payload, label }) =>
              payload?.length ? (
                <Kutu
                  baslik={String(label)}
                  satirlar={[
                    {
                      ad: "değer",
                      deger: `${sayi(payload[0].payload.gosterim, basamak)}${birim}`,
                    },
                    ...(payload[0].payload.n !== undefined
                      ? [{ ad: "n", deger: sayi(payload[0].payload.n, 0) }]
                      : []),
                  ]}
                />
              ) : null
            }
          />
          <Bar dataKey="gosterim" radius={[4, 4, 0, 0]} maxBarSize={44}>
            {noktalar.map((n, i) => (
              <Cell
                key={i}
                fill={
                  n.gosterim < 0 ? "var(--color-status-rose-text)" : "var(--color-chart-6-active)"
                }
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Alan + çizgi — özsermaye eğrisi ve kıyas ölçütü. */
export function AlanGrafik({
  veri,
  yukseklik = 260,
  adlar = ["sistem", "kıyas"],
}: {
  veri: { ad: string; a: number | null; b?: number | null; n?: number }[];
  yukseklik?: number;
  adlar?: [string, string] | string[];
}) {
  const gid = useId().replace(/[^a-zA-Z0-9]/g, "");
  return (
    <div style={{ height: yukseklik }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={veri} margin={{ top: 8, right: 6, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-chart-6)" stopOpacity={0.3} />
              <stop offset="100%" stopColor="var(--color-chart-6)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="var(--color-chart-track)" strokeDasharray="3 3" />
          <XAxis
            dataKey="ad"
            tickLine={false}
            axisLine={false}
            tick={EKSEN}
            tickMargin={10}
            minTickGap={40}
          />
          <YAxis
            width={54}
            tickLine={false}
            axisLine={false}
            tick={EKSEN}
            tickCount={5}
            domain={["auto", "auto"]}
            tickFormatter={(v: number) => sayi(v, 0)}
          />
          <ReferenceLine y={0} stroke="var(--color-chart-cursor)" strokeDasharray="4 4" />
          <Tooltip
            cursor={{
              stroke: "var(--color-chart-cursor)",
              strokeWidth: 1,
              strokeDasharray: "4 4",
            }}
            content={({ payload, label }) =>
              payload?.length ? (
                <Kutu
                  baslik={String(label)}
                  satirlar={[
                    ...payload.map((p, i) => ({
                      ad: adnr(adlar, i),
                      deger: sayi(Number(p.value), 2),
                      renk: i === 0 ? "var(--color-chart-6-active)" : "var(--color-chart-neutral)",
                    })),
                    ...(payload[0]?.payload?.n !== undefined
                      ? [{ ad: "kaç kol", deger: sayi(payload[0].payload.n, 0) }]
                      : []),
                  ]}
                />
              ) : null
            }
          />
          <Area
            type="monotone"
            dataKey="a"
            stroke="none"
            fill={`url(#${gid})`}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="b"
            stroke="var(--color-chart-neutral)"
            strokeWidth={2}
            strokeDasharray="5 5"
            dot={false}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="a"
            stroke="var(--color-chart-6-active)"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

function adnr(adlar: string[], i: number): string {
  return adlar[i] ?? `seri ${i + 1}`;
}
