"use client";

/**
 * Fiyat grafiği — TradingView Lightweight Charts.
 *
 * Mum grafiğinin üstüne destek/direnç seviyeleri çizilir. Seviyeler yalnız
 * çizgi değil, **etiketli** çizgidir: kullanıcı hangisinin destek hangisinin
 * direnç olduğunu renkten tahmin etmek zorunda kalmaz.
 *
 * Kitaplık `var()` kabul etmez, hesaplanmış renk ister. Bu yüzden token'lar
 * `getComputedStyle` ile okunur ve tema değişince **yalnızca renkler**
 * güncellenir (`applyOptions`). Önceden grafik baştan kuruluyordu; mumları
 * basan effect yalnızca `candles`'a bağlı olduğu ve tema değişiminde o
 * referans değişmediği için `setData` hiç çağrılmıyor, grafik boş kalıyordu.
 * Renkleri yerinde güncellemek ayrıca kullanıcının yakınlaştırmasını korur.
 */

import { useEffect, useRef } from "react";
import {
  ColorType,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";
import type { Candle, SRLevels } from "@/lib/api";
import { price } from "@/lib/format";
import { useTheme } from "./theme";

function cssVar(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
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
   * Kapsayıcıyı doldur. Terminal panellerinde panel boyutu sürüklenerek
   * değiştiğinden sabit yükseklik işe yaramaz; bu modda yükseklik de
   * `ResizeObserver` ile izlenir.
   */
  fill?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const { resolved } = useTheme();

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const line = cssVar("--sn-hairline", "#e7eaef");
    const up = cssVar("--sn-up", "#17a56b");
    const down = cssVar("--sn-down", "#d6304a");

    const chart = createChart(el, {
      height: fill ? el.clientHeight : height,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: cssVar("--sn-ink-3", "#6b7480"),
        fontSize: 10,
        /* Verilmezse kitaplık kendi Trebuchet/Roboto varsayılanıyla çizer —
           panelde monospace olmayan tek sayı ekseni burasıydı (kural 6). */
        fontFamily: cssVar("--font-stack-mono", "monospace"),
      },
      /* Eksen "78783.99" yazarken alttaki kart "78.783,99" yazıyordu.
         Sayı biçiminin tek kaynağı lib/format.ts'tir. */
      localization: { locale: "tr-TR", priceFormatter: (v: number) => price(v) },
      grid: {
        vertLines: { color: line },
        horzLines: { color: line },
      },
      rightPriceScale: { borderColor: line },
      timeScale: { borderColor: line, timeVisible: true, secondsVisible: false },
      crosshair: { mode: 1 },
    });

    const series = chart.addCandlestickSeries({
      upColor: up,
      downColor: down,
      borderUpColor: up,
      borderDownColor: down,
      wickUpColor: up,
      wickDownColor: down,
    });

    chartRef.current = chart;
    seriesRef.current = series;

    const resize = () =>
      chart.applyOptions({
        width: el.clientWidth,
        ...(fill ? { height: el.clientHeight } : {}),
      });
    const observer = new ResizeObserver(resize);
    observer.observe(el);
    resize();

    return () => {
      observer.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, [height, fill]);

  useEffect(() => {
    const chart = chartRef.current;
    const series = seriesRef.current;
    if (!chart || !series) return;

    const line = cssVar("--sn-hairline", "#e7eaef");
    const up = cssVar("--sn-up", "#17a56b");
    const down = cssVar("--sn-down", "#d6304a");

    chart.applyOptions({
      layout: { textColor: cssVar("--sn-ink-3", "#838d9b") },
      grid: { vertLines: { color: line }, horzLines: { color: line } },
      rightPriceScale: { borderColor: line },
      timeScale: { borderColor: line },
    });
    series.applyOptions({
      upColor: up,
      downColor: down,
      borderUpColor: up,
      borderDownColor: down,
      wickUpColor: up,
      wickDownColor: down,
    });
  }, [resolved]);

  /* `fitContent` her bar güncellemesinde çağrılırsa saat başı gelen yeni
     bar kullanıcının yakınlaştırmasını sıfırlar. Yalnızca seri kimliği
     (ilk yükleme / sembol değişimi) değiştiğinde sığdır. */
  const fittedKeyRef = useRef<string | null>(null);

  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;
    /* S/R çizgileri için Number.isFinite denetimi zaten vardı; asıl seriye
       uygulanmamıştı. NaN'lı tek bar tüm çizimi bozabilir. */
    const temiz = candles.filter(
      (c) =>
        Number.isFinite(c.open) &&
        Number.isFinite(c.high) &&
        Number.isFinite(c.low) &&
        Number.isFinite(c.close),
    );
    series.setData(
      temiz.map((candle) => ({
        time: candle.time as UTCTimestamp,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
      })),
    );
    const key = temiz.length ? `${temiz[0].time}` : null;
    if (key !== fittedKeyRef.current) {
      fittedKeyRef.current = key;
      chartRef.current?.timeScale().fitContent();
    }
  }, [candles]);

  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;

    const lines: ReturnType<ISeriesApi<"Candlestick">["createPriceLine"]>[] = [];
    const add = (price: number | null | undefined, title: string, color: string) => {
      if (price === null || price === undefined || !Number.isFinite(price)) return;
      lines.push(
        series.createPriceLine({ price, color, lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title }),
      );
    };

    add(sr?.resistance, "direnç", cssVar("--sn-down", "#d6304a"));
    add(sr?.support, "destek", cssVar("--sn-up", "#17a56b"));
    add(sr?.poc, "POC", cssVar("--sn-brand-solid", "#f0b90b"));

    return () => {
      lines.forEach((line) => {
        try {
          series.removePriceLine(line);
        } catch {
          /* Seri tema değişiminde yok edilmiş olabilir. */
        }
      });
    };
  }, [sr, candles.length, resolved]);

  return (
    <div
      ref={containerRef}
      className={fill ? "h-full w-full" : "w-full"}
      style={fill ? undefined : { height }}
    />
  );
}
