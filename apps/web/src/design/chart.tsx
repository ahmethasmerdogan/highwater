"use client";

/**
 * Zaman serisi eğrisi — özsermaye ve kıyas.
 *
 * Tüm seriler **aynı** eksende çizilir. Farklı başlangıç tutarlarına sahip
 * eğrileri karşılaştırılabilir kılmak için `normalize` hepsini 100 tabanına
 * indeksler: sorulan soru "hangisi daha çok kazandırdı" değil, "hangisi
 * daha çok yükseldi"dir.
 *
 * Izgara yatayda ve noktalı; dikey ızgara yok. Bir eğri grafiğinde dikey
 * çizgiler değeri okumaya yardım etmez, yalnızca mürekkep ekler.
 */

import { useMemo } from "react";
import {
  Area,
  AreaChart,
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  ErrorBar,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { dateOnly, num, pct } from "@/lib/format";
import { Empty } from "./primitives";

/* Ortak eksen görünümü — üç grafikte de aynı. */
const AXIS = {
  tick: { fill: "var(--sn-ink-3)", fontSize: 10 },
  axisLine: false,
  tickLine: false,
} as const;

export interface CurveSeries {
  label: string;
  color: string;
  dashed?: boolean;
  points: { at: string; value: number }[];
}

export function CurveChart({
  series,
  height = 260,
  normalize = false,
  valueFormat = (value: number) => num(value, 2),
  emptyText = "Çizilecek veri yok.",
}: {
  series: CurveSeries[];
  height?: number;
  normalize?: boolean;
  valueFormat?: (value: number) => string;
  emptyText?: string;
}) {
  const { data, active } = useMemo(() => {
    const live = series.filter((one) => one.points.length > 0);
    if (live.length === 0) return { data: [], active: [] as CurveSeries[] };

    /* Zaman damgaları birleştirilir; eksik nokta `null` kalır ve recharts
       `connectNulls` ile çizgiyi sürdürür.

       Nokta araması Map üzerinden: seri başına `find` çağırmak her damga
       için listeyi baştan tarıyordu (O(n²) — 30 günlük saatlik eğride
       yüz binlerce karşılaştırma). */
    const index = new Map(
      live.map((one) => [one.label, new Map(one.points.map((point) => [point.at, point.value]))]),
    );
    const stamps = Array.from(new Set(live.flatMap((one) => one.points.map((p) => p.at)))).sort();
    const bases = new Map(live.map((one) => [one.label, one.points[0]?.value ?? 1]));

    const rows = stamps.map((at) => {
      const row: Record<string, string | number | null> = { at };
      for (const one of live) {
        const value = index.get(one.label)?.get(at);
        if (value === undefined) {
          row[one.label] = null;
          continue;
        }
        const base = bases.get(one.label) ?? 1;
        row[one.label] = normalize && base !== 0 ? (value / base) * 100 : value;
      }
      return row;
    });

    return { data: rows, active: live };
  }, [series, normalize]);

  if (data.length === 0) return <Empty title={emptyText} />;

  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid
            stroke="var(--sn-hairline)"
            strokeDasharray="2 4"
            vertical={false}
          />
          <XAxis
            dataKey="at"
            tickFormatter={(value: string) => dateOnly(value)}
            tick={{ fill: "var(--sn-ink-3)", fontSize: 10 }}
            axisLine={{ stroke: "var(--sn-hairline)" }}
            tickLine={false}
            minTickGap={48}
          />
          <YAxis
            tick={{ fill: "var(--sn-ink-3)", fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            width={56}
            domain={["auto", "auto"]}
            tickFormatter={(value: number) => valueFormat(value)}
          />
          <Tooltip
            content={({ active: hovered, payload, label }) => {
              if (!hovered || !payload?.length) return null;
              return (
                <div
                  className="rounded-[var(--sn-r-sm)] px-2.5 py-2"
                  style={{ background: "var(--sn-overlay)", boxShadow: "var(--sn-shadow-pop)" }}
                >
                  <div style={{ fontSize: 10, color: "var(--sn-ink-3)" }}>{dateOnly(String(label))}</div>
                  {payload.map((entry) => (
                    <div key={String(entry.dataKey)} className="mt-1 flex items-center gap-2">
                      <span
                        className="h-2 w-2 shrink-0 rounded-[2px]"
                        style={{ background: entry.color }}
                        aria-hidden
                      />
                      <span style={{ fontSize: "var(--sn-t-caption)", color: "var(--sn-ink-2)" }}>
                        {entry.name}
                      </span>
                      <span
                        className="sn-num ml-auto"
                        style={{ fontSize: "var(--sn-t-caption)", color: "var(--sn-ink)" }}
                      >
                        {typeof entry.value === "number" ? valueFormat(entry.value) : "—"}
                      </span>
                    </div>
                  ))}
                </div>
              );
            }}
          />
          <Legend
            verticalAlign="bottom"
            height={26}
            formatter={(value) => (
              <span style={{ fontSize: "var(--sn-t-caption)", color: "var(--sn-ink-2)" }}>{value}</span>
            )}
          />
          {active.map((one) => (
            <Line
              key={one.label}
              type="monotone"
              dataKey={one.label}
              name={one.label}
              stroke={one.color}
              strokeWidth={1.8}
              strokeDasharray={one.dashed ? "5 4" : undefined}
              dot={false}
              activeDot={{ r: 3, strokeWidth: 0 }}
              connectNulls
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}


/* ------------------------------------------------------------------ */
/*  Alan eğrisi                                                        */
/* ------------------------------------------------------------------ */

/**
 * Tek serilik dolgulu eğri — eksen ve ızgara yok, kart içinde durur.
 *
 * Dolgu **yön rengi taşımaz**: bir alan grafiği eğilimi gösterir, kâr/zarar
 * değil. Yeşil bir dolgu göze "kazanç" diye okunurdu.
 */
export function AreaCurve({
  points,
  height = 120,
  color = "var(--sn-series-1)",
  valueFormat = (value: number) => num(value, 2),
}: {
  points: { at: string; value: number }[];
  height?: number;
  color?: string;
  valueFormat?: (value: number) => string;
}) {
  if (points.length === 0) return <Empty title="Çizilecek veri yok." />;

  const id = `sn-area-${color.replace(/[^a-z0-9]/gi, "")}`;
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.28} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Tooltip
            content={({ active, payload, label }) =>
              active && payload?.length ? (
                <div
                  className="rounded-[var(--sn-r-sm)] px-2 py-1.5"
                  style={{ background: "var(--sn-overlay)", boxShadow: "var(--sn-shadow-pop)" }}
                >
                  <div style={{ fontSize: 10, color: "var(--sn-ink-3)" }}>{dateOnly(String(label))}</div>
                  <div className="sn-num" style={{ fontSize: "var(--sn-t-caption)", color: "var(--sn-ink)" }}>
                    {typeof payload[0].value === "number" ? valueFormat(payload[0].value) : "—"}
                  </div>
                </div>
              ) : null
            }
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={1.6}
            fill={`url(#${id})`}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Desil çubukları — kalibrasyon                                      */
/* ------------------------------------------------------------------ */

/**
 * Puan dilimi → ileri getiri. Sistemin dürüstlük organı.
 *
 * Yeşil/kırmızı burada **renk disiplinine uygundur**: çubuk bir getiridir,
 * yani gerçekten bir yöndür.
 *
 * Güven aralığı çubukları isteğe bağlı bir süs değil: ortalama getiri tek
 * başına, üç gözlemle hesaplanmış bir dilimi de kırk gözlemle hesaplanmış
 * bir dilim kadar kesin gösterirdi.
 */
export function DecileChart({
  data,
  height = 260,
}: {
  data: {
    decile: number;
    mean_return: number;
    median_return: number;
    ci_low: number;
    ci_high: number;
    count: number;
  }[];
  height?: number;
}) {
  const rows = useMemo(
    () =>
      data.map((row) => ({
        ...row,
        /* Hata çubuğu ortalamadan SAPMA ister, mutlak sınır değil. */
        err: [
          Math.max(0, row.mean_return - row.ci_low),
          Math.max(0, row.ci_high - row.mean_return),
        ] as [number, number],
      })),
    [data],
  );

  if (rows.length === 0) return <Empty title="Desil hesabı için yeterli gözlem yok." />;

  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={rows} margin={{ top: 8, right: 8, bottom: 14, left: 0 }}>
          <CartesianGrid stroke="var(--sn-hairline)" strokeDasharray="2 4" vertical={false} />
          <XAxis
            dataKey="decile"
            {...AXIS}
            label={{
              value: "puan dilimi (düşükten yükseğe)",
              position: "insideBottom",
              offset: -8,
              fill: "var(--sn-ink-3)",
              fontSize: 10,
            }}
          />
          <YAxis {...AXIS} width={58} tickFormatter={(value: number) => pct(value, 1)} />
          <ReferenceLine y={0} stroke="var(--sn-border-strong)" />
          <Tooltip
            cursor={{ fill: "var(--sn-sunken)" }}
            content={({ active, payload, label }) =>
              active && payload?.length ? (
                <div
                  className="rounded-[var(--sn-r-sm)] px-2.5 py-2"
                  style={{ background: "var(--sn-overlay)", boxShadow: "var(--sn-shadow-pop)" }}
                >
                  <div style={{ fontSize: 10, color: "var(--sn-ink-3)" }}>{label}. dilim</div>
                  {payload.map((entry) => (
                    <div key={String(entry.dataKey)} className="mt-1 flex items-center gap-3">
                      <span style={{ fontSize: "var(--sn-t-caption)", color: "var(--sn-ink-2)" }}>
                        {entry.name}
                      </span>
                      <span
                        className="sn-num ml-auto"
                        style={{ fontSize: "var(--sn-t-caption)", color: "var(--sn-ink)" }}
                      >
                        {typeof entry.value === "number" ? pct(entry.value, 2) : "—"}
                      </span>
                    </div>
                  ))}
                  <div className="mt-1" style={{ fontSize: 10, color: "var(--sn-ink-3)" }}>
                    {payload[0]?.payload?.count} gözlem
                  </div>
                </div>
              ) : null
            }
          />
          <Legend
            verticalAlign="top"
            height={22}
            formatter={(value) => (
              <span style={{ fontSize: "var(--sn-t-caption)", color: "var(--sn-ink-2)" }}>{value}</span>
            )}
          />
          <Bar dataKey="mean_return" name="Ortalama getiri" radius={[3, 3, 0, 0]} isAnimationActive={false}>
            {rows.map((row) => (
              <Cell
                key={row.decile}
                fill={row.mean_return >= 0 ? "var(--sn-up)" : "var(--sn-down)"}
              />
            ))}
            <ErrorBar dataKey="err" width={4} strokeWidth={1.4} stroke="var(--sn-ink-3)" />
          </Bar>
          {/* Medyan yön rengi taşımaz: ortalamayla kıyas için nötr çizgi. */}
          <Line
            type="monotone"
            dataKey="median_return"
            name="Medyan getiri"
            stroke="var(--sn-ink-2)"
            strokeWidth={1.4}
            strokeDasharray="4 3"
            dot={{ r: 2.2, fill: "var(--sn-ink-2)", strokeWidth: 0 }}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Sparkline                                                          */
/* ------------------------------------------------------------------ */

/**
 * Tablo hücresine sığan minik eğri.
 *
 * Eksen, ızgara ve ipucu yok — yalnızca şekli gösterir; sayı zaten yanındaki
 * sütunda durur. Recharts kullanılmaz: 60 piksellik bir çizgi için
 * `ResponsiveContainer` kurmak, satır başına bir ölçüm döngüsü demektir.
 */
export function Sparkline({
  points,
  width = 68,
  height = 18,
  color = "var(--sn-series-1)",
}: {
  points: number[];
  width?: number;
  height?: number;
  color?: string;
}) {
  if (points.length < 2) return null;

  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const step = width / (points.length - 1);
  const d = points
    .map((value, index) => {
      const x = index * step;
      const y = height - ((value - min) / span) * height;
      return `${index === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg width={width} height={height} aria-hidden className="shrink-0 align-middle">
      <path d={d} fill="none" stroke={color} strokeWidth={1.3} strokeLinejoin="round" />
    </svg>
  );
}

/* ------------------------------------------------------------------ */

/** Grafiğin dışında duran açıklama — renk + ad + isteğe bağlı sayı. */
export function ChartLegend({
  items,
}: {
  items: { label: string; color: string; value?: string; dashed?: boolean }[];
}) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5">
      {items.map((item) => (
        <span key={item.label} className="inline-flex items-center gap-1.5">
          <span
            aria-hidden
            className="h-0.5 w-4 shrink-0 rounded-full"
            style={{
              background: item.dashed
                ? `repeating-linear-gradient(90deg, ${item.color} 0 4px, transparent 4px 7px)`
                : item.color,
            }}
          />
          <span style={{ fontSize: "var(--sn-t-caption)", color: "var(--sn-ink-2)" }}>
            {item.label}
          </span>
          {item.value && (
            <span className="sn-num" style={{ fontSize: "var(--sn-t-caption)", color: "var(--sn-ink)" }}>
              {item.value}
            </span>
          )}
        </span>
      ))}
    </div>
  );
}
