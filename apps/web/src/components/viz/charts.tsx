"use client";

/**
 * Grafikler.
 *
 * Kurallar:
 *   · Tek eksen. İki farklı ölçekli ölçü asla aynı grafikte iki y ekseniyle
 *     çizilmez — ya iki grafik olur ya ortak bir tabana endekslenir.
 *   · İnce çizgi (2px), silik ızgara, seçici etiket. Her noktaya sayı basmak
 *     grafiği okunmaz kılar.
 *   · Renk kimliği taşır ama kimliği **yalnız** taşımaz: iki ve üzeri seride
 *     her zaman bir açıklama şeridi vardır.
 *   · Yön renkleri (yeşil/kırmızı) grafiklerde seri rengi olarak kullanılmaz.
 *
 * Recharts kullanılıyor; renkler CSS değişkenlerinden okunuyor ki tema
 * değiştiğinde grafik de değişsin.
 */

import { useMemo } from "react";
import {
  Area,
  AreaChart,
  Bar,
  CartesianGrid,
  ComposedChart,
  Cell,
  ErrorBar,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { cx } from "@/ui";
import { dateOnly, dateTime, num, pct } from "@/lib/format";

/* ------------------------------------------------------------------ */
/*  Ortak parçalar                                                     */
/* ------------------------------------------------------------------ */

const AXIS = {
  stroke: "var(--line)",
  tick: { fill: "var(--ink3)", fontSize: 11 },
  tickLine: false,
  axisLine: false,
} as const;

/** Tema uyumlu ipucu kutusu. Recharts'ın varsayılanı token okumaz. */
function ChartTooltip({
  active,
  payload,
  label,
  formatValue,
  labelFormatter,
}: {
  active?: boolean;
  payload?: { name?: string; value?: number; color?: string; dataKey?: string }[];
  label?: string | number;
  formatValue?: (v: number, key?: string) => string;
  labelFormatter?: (l: string | number) => string;
}) {
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-lg border border-line bg-surface px-3 py-2 shadow-pop">
      <div className="mb-1 text-[11.5px] text-ink-3">
        {labelFormatter ? labelFormatter(label ?? "") : String(label ?? "")}
      </div>
      <div className="space-y-0.5">
        {payload.map((p, i) => (
          <div key={i} className="flex items-center gap-2 text-[12px]">
            <span
              aria-hidden
              className="size-2 shrink-0 rounded-[2px]"
              style={{ background: p.color }}
            />
            <span className="text-ink-2">{p.name}</span>
            <span className="num ml-auto text-ink">
              {p.value === undefined
                ? "—"
                : formatValue
                  ? formatValue(p.value, p.dataKey)
                  : num(p.value, 2)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Seri açıklama şeridi — iki ve üzeri seride zorunlu. */
export function Legend({
  items,
  className,
}: {
  items: { label: string; color: string; dashed?: boolean }[];
  className?: string;
}) {
  return (
    <div className={cx("flex flex-wrap items-center gap-x-4 gap-y-1", className)}>
      {items.map((it) => (
        <span key={it.label} className="flex items-center gap-1.5 text-[11.5px] text-ink-2">
          <span
            aria-hidden
            className="h-0.5 w-4 shrink-0 rounded-full"
            style={{
              background: it.dashed
                ? `repeating-linear-gradient(90deg, ${it.color} 0 4px, transparent 4px 7px)`
                : it.color,
            }}
          />
          {it.label}
        </span>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Özsermaye / kıyas eğrisi                                           */
/* ------------------------------------------------------------------ */

export interface CurveSeries {
  label: string;
  color: string;
  dashed?: boolean;
  points: { at: string; value: number }[];
}

/**
 * Zaman serisi çizgi grafiği — özsermaye ve kıyas eğrileri.
 *
 * Tüm seriler aynı eksende; bu yüzden farklı ölçekli değerler geldiğinde
 * `normalize` ile ortak bir tabana (100) endekslenir. Bir bot 5.000 USD ile,
 * kıyas sepeti 1,0 ile başlıyorsa ham çizim anlamsız olurdu.
 */
export function CurveChart({
  series,
  height = 240,
  normalize = false,
  valueFormat,
  emptyText = "Çizilecek veri yok.",
}: {
  series: CurveSeries[];
  height?: number;
  /** Serileri 100 tabanına endeksler — farklı ölçekleri karşılaştırmak için. */
  normalize?: boolean;
  valueFormat?: (v: number) => string;
  emptyText?: string;
}) {
  const { data, active, pad } = useMemo(() => {
    const live = series.filter((s) => s.points.length > 0);
    if (live.length === 0) return { data: [], active: [] as CurveSeries[], pad: 1 };

    /* Tüm serilerin zaman damgaları birleştirilir; eksik nokta boş bırakılır
       (recharts `connectNulls` ile çizgiyi sürdürür). */
    const stamps = Array.from(
      new Set(live.flatMap((s) => s.points.map((p) => p.at))),
    ).sort();

    const bases = new Map<string, number>();
    live.forEach((s) => bases.set(s.label, s.points[0]?.value ?? 1));

    const rows = stamps.map((at) => {
      const row: Record<string, string | number | null> = { at };
      live.forEach((s) => {
        const point = s.points.find((p) => p.at === at);
        if (point === undefined) {
          row[s.label] = null;
          return;
        }
        const base = bases.get(s.label) ?? 1;
        row[s.label] =
          normalize && base !== 0 ? (point.value / base) * 100 : point.value;
      });
      return row;
    });

    /* Eksen dolgusu, çizilen değerlerin gerçek aralığından türetilir. */
    const values = rows.flatMap((r) =>
      live.map((s) => r[s.label]).filter((v): v is number => typeof v === "number"),
    );
    const lo = values.length ? Math.min(...values) : 0;
    const hi = values.length ? Math.max(...values) : 1;
    const padding = Math.max((hi - lo) * 0.08, Math.abs(hi) * 0.002, 0.5);

    return { data: rows, active: live, pad: padding };
  }, [series, normalize]);

  if (data.length === 0) {
    return (
      <div
        style={{ height }}
        className="flex items-center justify-center rounded-lg border border-dashed border-line text-[12.5px] text-ink-3"
      >
        {emptyText}
      </div>
    );
  }

  const format = valueFormat ?? ((v: number) => num(v, normalize ? 1 : 2));

  return (
    <div>
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="var(--line)" strokeDasharray="2 4" vertical={false} />
          <XAxis
            dataKey="at"
            {...AXIS}
            minTickGap={40}
            tickFormatter={(v: string) => dateOnly(v)}
          />
          {/*
           * Eksen sıfırdan başlamaz.
           *
           * Recharts'ın varsayılanı `[0, auto]`. 100 tabanına endekslenmiş bir
           * özsermaye eğrisinde bu, %1–2'lik gerçek hareketi ekranın üst
           * kenarında düz bir çizgiye çeviriyordu — yani grafik "hiçbir şey
           * olmuyor" diyordu, oysa oluyordu.
           *
           * Sıfırdan başlamamak burada yanıltıcı değil, tam tersi: bu bir
           * mutlak büyüklük karşılaştırması değil, bir seyir grafiği. Referans
           * çizgisi (100) zaten ölçeği sabitliyor.
           */}
          <YAxis
            {...AXIS}
            width={56}
            domain={[
              (min: number) => Number((min - pad).toFixed(2)),
              (max: number) => Number((max + pad).toFixed(2)),
            ]}
            tickFormatter={(v: number) => num(v, normalize ? 1 : 0)}
          />
          {normalize && (
            <ReferenceLine
              y={100}
              stroke="var(--ink3)"
              strokeDasharray="3 3"
              label={{
                value: "başlangıç",
                position: "insideTopLeft",
                fill: "var(--ink3)",
                fontSize: 10,
              }}
            />
          )}
          <Tooltip
            content={
              <ChartTooltip
                formatValue={(v) => format(v)}
                labelFormatter={(l) => dateTime(String(l))}
              />
            }
          />
          {active.map((s) => (
            <Line
              key={s.label}
              type="monotone"
              dataKey={s.label}
              name={s.label}
              stroke={s.color}
              strokeWidth={2}
              strokeDasharray={s.dashed ? "4 3" : undefined}
              dot={false}
              connectNulls
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>

      {active.length > 1 && (
        <Legend
          className="mt-2"
          items={active.map((s) => ({ label: s.label, color: s.color, dashed: s.dashed }))}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Desil grafiği (kalibrasyon)                                        */
/* ------------------------------------------------------------------ */

/**
 * Puan desili → ortalama ileri getiri, güven aralığıyla.
 *
 * Kalibrasyonun ana görselidir. Çubuklar soldan sağa artıyorsa puan
 * sıralaması anlamlı; düzse değil. Güven aralığı çubukları birbirini bolca
 * kesiyorsa fark gürültü olabilir — bu yüzden hata çubuğu isteğe bağlı değil.
 *
 * Çubukların üstüne **medyan** noktaları bindirilir. Ortalama birkaç aşırı
 * getiriyle sürüklenir: en düşük dilimde ortalama pozitif çıkarken medyan
 * negatif olabiliyor — yalnızca çubuğa bakan okuyucu "en düşük puanlılar en
 * iyi getiriyi verdi" sonucunu çıkarır. İki ölçü aynı görselde durmalı.
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
      data.map((d) => ({
        ...d,
        /* Hata çubuğu ortalamadan sapma ister, mutlak sınır değil. */
        err: [
          Math.max(0, d.mean_return - d.ci_low),
          Math.max(0, d.ci_high - d.mean_return),
        ] as [number, number],
      })),
    [data],
  );

  if (rows.length === 0) {
    return (
      <div
        style={{ height }}
        className="flex items-center justify-center rounded-lg border border-dashed border-line text-[12.5px] text-ink-3"
      >
        Desil hesabı için yeterli gözlem yok.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid stroke="var(--line)" strokeDasharray="2 4" vertical={false} />
        <XAxis
          dataKey="decile"
          {...AXIS}
          tickFormatter={(v: number) => `${v}`}
          label={{
            value: "puan dilimi (düşükten yükseğe)",
            position: "insideBottom",
            offset: -2,
            fill: "var(--ink3)",
            fontSize: 11,
          }}
        />
        <YAxis {...AXIS} width={60} tickFormatter={(v: number) => pct(v, 1)} />
        <ReferenceLine y={0} stroke="var(--line-strong)" />
        <Tooltip
          cursor={{ fill: "var(--inset)" }}
          content={
            <ChartTooltip
              formatValue={(v) => pct(v, 2)}
              labelFormatter={(l) => `${l}. dilim`}
            />
          }
        />
        <Bar dataKey="mean_return" name="Ortalama getiri" radius={[4, 4, 0, 0]} isAnimationActive={false}>
          {rows.map((r) => (
            /*
             * Yön burada anlamlıdır (getiri pozitif mi negatif mi), bu yüzden
             * yeşil/kırmızı kullanımı renk disiplinine uygun.
             */
            <Cell
              key={r.decile}
              fill={r.mean_return >= 0 ? "var(--up)" : "var(--down)"}
            />
          ))}
          <ErrorBar dataKey="err" width={4} strokeWidth={1.5} stroke="var(--ink3)" />
        </Bar>
        {/* Medyan: yön rengi taşımaz, nötr çizgidir — ortalamayla kıyas içindir. */}
        <Line
          type="monotone"
          dataKey="median_return"
          name="Medyan getiri"
          stroke="var(--ink2)"
          strokeWidth={1.5}
          strokeDasharray="4 3"
          dot={{ r: 2.5, fill: "var(--ink2)", strokeWidth: 0 }}
          isAnimationActive={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

/* ------------------------------------------------------------------ */
/*  Küçük çizgi (sparkline)                                            */
/* ------------------------------------------------------------------ */

/**
 * Tablo hücresine sığan minik eğri. Eksen, ızgara ve ipucu yoktur —
 * yalnızca şekli gösterir; sayı zaten yanındaki sütunda durur.
 */
export function Sparkline({
  values,
  width = 72,
  height = 20,
  className,
}: {
  values: number[];
  width?: number;
  height?: number;
  className?: string;
}) {
  if (values.length < 2) {
    return <span className={cx("text-[11px] text-ink-3", className)}>—</span>;
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const step = width / (values.length - 1);

  const points = values
    .map((v, i) => `${(i * step).toFixed(1)},${(height - ((v - min) / span) * height).toFixed(1)}`)
    .join(" ");

  const rising = values[values.length - 1] >= values[0];

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={cx("overflow-visible", className)}
      role="img"
      aria-label={rising ? "yükselen eğri" : "düşen eğri"}
    >
      <polyline
        points={points}
        fill="none"
        stroke={rising ? "var(--up)" : "var(--down)"}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/*  Alan grafiği — tek seri                                            */
/* ------------------------------------------------------------------ */

/** Tek serilik dolgulu eğri; panelin özsermaye kutusunda kullanılır. */
export function AreaCurve({
  points,
  height = 120,
  color = "var(--brand)",
  valueFormat,
}: {
  points: { at: string; value: number }[];
  height?: number;
  color?: string;
  valueFormat?: (v: number) => string;
}) {
  if (points.length < 2) {
    return (
      <div
        style={{ height }}
        className="flex items-center justify-center rounded-lg border border-dashed border-line text-[12px] text-ink-3"
      >
        Eğri için yeterli nokta yok.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={points} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id="area-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.22} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis dataKey="at" hide />
        <YAxis hide domain={["dataMin", "dataMax"]} />
        <Tooltip
          content={
            <ChartTooltip
              formatValue={(v) => (valueFormat ? valueFormat(v) : num(v, 2))}
              labelFormatter={(l) => dateTime(String(l))}
            />
          }
        />
        <Area
          type="monotone"
          dataKey="value"
          name="Özsermaye"
          stroke={color}
          strokeWidth={2}
          fill="url(#area-fill)"
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
