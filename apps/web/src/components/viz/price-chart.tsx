"use client";

/**
 * Fiyat grafiği — TradingView Lightweight Charts.
 *
 * Mum grafiğinin üstüne destek/direnç seviyeleri çizilir. Seviyeler sadece
 * çizgi değil, **etiketli** çizgidir: kullanıcı hangi çizginin destek hangisinin
 * direnç olduğunu renkten tahmin etmek zorunda kalmaz.
 *
 * Renkler CSS değişkenlerinden okunur ve tema değiştiğinde grafik yeniden
 * kurulur; aksi hâlde açık temada koyu bir grafik kalıyordu.
 */

import { useEffect, useRef } from "react";
import {
  createChart,
  ColorType,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";
import { useTheme } from "@/ui";
import type { Candle, SRLevels } from "@/lib/api";

/** Hesaplanmış CSS değişkenini okur — grafik kütüphanesi `var()` kabul etmez. */
function cssVar(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

export function PriceChart({
  candles,
  sr,
  height = 420,
  fill = false,
}: {
  candles: Candle[];
  sr?: SRLevels | null;
  height?: number;
  /**
   * Kapsayıcıyı doldur. Terminal panellerinde panel boyutu sürükleyerek
   * değiştiğinden sabit yükseklik işe yaramaz; bu modda yükseklik de
   * `ResizeObserver` ile izlenir.
   */
  fill?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const { resolved } = useTheme();

  /* Grafik kurulumu — tema değişince baştan kurulur. */
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const chart = createChart(el, {
      height: fill ? el.clientHeight : height,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: cssVar("--ink2", "#8a8a8a"),
        fontSize: 11,
      },
      grid: {
        vertLines: { color: cssVar("--line", "#e5e5e5") },
        horzLines: { color: cssVar("--line", "#e5e5e5") },
      },
      rightPriceScale: { borderColor: cssVar("--line", "#e5e5e5") },
      timeScale: {
        borderColor: cssVar("--line", "#e5e5e5"),
        timeVisible: true,
        secondsVisible: false,
      },
      crosshair: { mode: 1 },
      localization: {
        locale: "tr-TR",
      },
    });

    const series = chart.addCandlestickSeries({
      upColor: cssVar("--up", "#0ecb81"),
      downColor: cssVar("--down", "#f6465d"),
      borderUpColor: cssVar("--up", "#0ecb81"),
      borderDownColor: cssVar("--down", "#f6465d"),
      wickUpColor: cssVar("--up", "#0ecb81"),
      wickDownColor: cssVar("--down", "#f6465d"),
    });

    chartRef.current = chart;
    seriesRef.current = series;

    const resize = () => {
      chart.applyOptions({
        width: el.clientWidth,
        ...(fill ? { height: el.clientHeight } : {}),
      });
    };
    const observer = new ResizeObserver(resize);
    observer.observe(el);
    resize();

    return () => {
      observer.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, [height, fill, resolved]);

  /* Veri */
  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;
    series.setData(
      candles.map((c) => ({
        time: c.time as UTCTimestamp,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      })),
    );
    chartRef.current?.timeScale().fitContent();
  }, [candles]);

  /* Destek / direnç çizgileri */
  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;

    const lines: ReturnType<ISeriesApi<"Candlestick">["createPriceLine"]>[] = [];

    const add = (price: number | null | undefined, title: string, color: string) => {
      if (price === null || price === undefined || !Number.isFinite(price)) return;
      lines.push(
        series.createPriceLine({
          price,
          color,
          lineWidth: 1,
          lineStyle: 2,
          axisLabelVisible: true,
          title,
        }),
      );
    };

    add(sr?.resistance, "direnç", cssVar("--down", "#f6465d"));
    add(sr?.support, "destek", cssVar("--up", "#0ecb81"));
    add(sr?.poc, "POC", cssVar("--brand", "#f0b90b"));

    return () => {
      lines.forEach((l) => {
        try {
          series.removePriceLine(l);
        } catch {
          /* seri zaten yok edilmiş olabilir */
        }
      });
    };
  }, [sr, candles.length]);

  return (
    <div
      ref={containerRef}
      className={fill ? "h-full w-full" : "w-full"}
      style={fill ? undefined : { height }}
    />
  );
}
