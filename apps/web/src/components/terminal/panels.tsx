"use client";

/**
 * Terminal panelleri.
 *
 * Her panel tek bir soruya cevap veren küçük bir görünümdür ve çalışma
 * alanında bağımsız yaşar. Panelin içeriği panelin dışındaki hiçbir şeye
 * bağlı değildir — bu, sürükle-bırak ile yeniden yerleştirildiğinde bozulmamalarını
 * sağlar.
 */

import { useQuery } from "@tanstack/react-query";
import { StatusPill, cx } from "@/ui";
import {
  api,
  type Candle,
  type Order,
  type Position,
  type Score,
  type ScoreConfig,
  type ScoreDetail,
  type SnapshotDetail,
  type SRLevels,
} from "@/lib/api";
import { useLive } from "@/lib/ws";
import { humanizeEvent } from "@/lib/humanize";
import { PriceChart } from "@/components/viz/price-chart";
import { ScoreCard } from "@/components/viz/score-card";
import { SimpleTable } from "@/components/data/data-table";
import { OrderStatusPill } from "@/components/common/pills";
import { filterInfo } from "@/lib/universe-filters";
import { compact, money, num, pctSigned, price, relative, time } from "@/lib/format";

export interface PanelParams {
  symbol?: string;
  timeframe?: string;
  threshold?: number;
}

/** Panel gövdesi — kaydırma ve dolgu her panelde aynı. */
function Body({ children, pad = true }: { children: React.ReactNode; pad?: boolean }) {
  return (
    <div className={cx("thin-scroll h-full overflow-auto", pad && "p-3")}>{children}</div>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return <p className="p-3 text-[12.5px] text-ink-3">{children}</p>;
}

/* ------------------------------------------------------------------ */
/*  Grafik                                                             */
/* ------------------------------------------------------------------ */

export function ChartPanel({ symbol, timeframe = "1h" }: PanelParams) {
  const candles = useQuery({
    queryKey: ["ohlcv", symbol, timeframe],
    queryFn: () => api.get<Candle[]>(`/symbols/${symbol}/ohlcv`, { tf: timeframe, limit: 400 }),
    enabled: Boolean(symbol),
    refetchInterval: 60_000,
  });

  const sr = useQuery({
    queryKey: ["sr", symbol, timeframe],
    queryFn: () => api.get<SRLevels>(`/symbols/${symbol}/sr`, { tf: timeframe }),
    enabled: Boolean(symbol),
    retry: false,
  });

  if (!symbol) return <Notice>Sembol belirtilmedi.</Notice>;
  if (candles.isLoading) return <Notice>Grafik yükleniyor…</Notice>;
  if ((candles.data ?? []).length === 0) {
    return <Notice>{symbol} için {timeframe} verisi yok.</Notice>;
  }

  return (
    <div className="h-full p-1">
      <PriceChart candles={candles.data ?? []} sr={sr.data} fill />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Puan kartı                                                         */
/* ------------------------------------------------------------------ */

export function ScoreCardPanel({ symbol }: PanelParams) {
  const detail = useQuery({
    queryKey: ["score", symbol],
    queryFn: () => api.get<ScoreDetail>(`/scores/${symbol}`),
    enabled: Boolean(symbol),
    retry: false,
  });

  if (!symbol) return <Notice>Sembol belirtilmedi.</Notice>;
  if (detail.isLoading) return <Notice>Yükleniyor…</Notice>;
  if (!detail.data?.rationale) {
    return <Notice>{symbol} için henüz puan hesaplanmamış.</Notice>;
  }

  return (
    <Body>
      <ScoreCard rationale={detail.data.rationale} className="border-0" />
    </Body>
  );
}

/* ------------------------------------------------------------------ */
/*  Destek / direnç                                                    */
/* ------------------------------------------------------------------ */

export function SrPanel({ symbol, timeframe = "1h" }: PanelParams) {
  const sr = useQuery({
    queryKey: ["sr", symbol, timeframe],
    queryFn: () => api.get<SRLevels>(`/symbols/${symbol}/sr`, { tf: timeframe }),
    enabled: Boolean(symbol),
    retry: false,
  });

  if (!symbol) return <Notice>Sembol belirtilmedi.</Notice>;
  if (!sr.data) return <Notice>{symbol} için seviye hesaplanamadı.</Notice>;

  return (
    <Body pad={false}>
      <div className="space-y-1 px-3 py-2 text-[12px]">
        <Row label="Fiyat" value={price(sr.data.price)} />
        <Row label="Direnç" value={price(sr.data.resistance)} tone="down" />
        <Row label="Destek" value={price(sr.data.support)} tone="up" />
        <Row label="Ödül/risk" value={num(sr.data.rr_geometry, 2)} />
        <Row label="POC" value={price(sr.data.poc)} />
        <Row label="ATR" value={price(sr.data.atr)} />
      </div>
      <SimpleTable
        dense
        head={
          <>
            <th>Tür</th>
            <th className="col-num">Fiyat</th>
            <th className="col-num">Güç</th>
          </>
        }
      >
        {sr.data.levels.map((lv, i) => (
          <tr key={i}>
            <td className="text-[11.5px]">{lv.kind === "support" ? "Destek" : "Direnç"}</td>
            <td className="col-num">{price(lv.price)}</td>
            <td className="col-num">{num(lv.strength, 2)}</td>
          </tr>
        ))}
      </SimpleTable>
    </Body>
  );
}

function Row({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "up" | "down";
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-ink-2">{label}</span>
      <span
        className={cx(
          "num",
          tone === "up" && "text-up",
          tone === "down" && "text-down",
        )}
      >
        {value}
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Puan tablosu / tarama                                              */
/* ------------------------------------------------------------------ */

export function ScoresPanel({ threshold }: PanelParams) {
  const configs = useQuery({
    queryKey: ["score-configs"],
    queryFn: () => api.get<ScoreConfig[]>("/scores/configs"),
  });

  const hash = configs.data?.[0]?.config_hash;
  const scores = useQuery({
    queryKey: ["scores", hash],
    queryFn: () => api.get<Score[]>("/scores", { config_hash: hash, limit: 300 }),
    enabled: Boolean(hash),
    refetchInterval: 60_000,
  });

  const rows = (scores.data ?? []).filter(
    (s) => threshold === undefined || s.score >= threshold,
  );

  if (rows.length === 0) {
    return (
      <Notice>
        {threshold !== undefined
          ? `Puanı ${threshold} ve üzeri olan coin yok.`
          : "Henüz puan hesaplanmamış."}
      </Notice>
    );
  }

  return (
    <Body pad={false}>
      <SimpleTable
        dense
        head={
          <>
            <th>Sembol</th>
            <th className="col-num">Puan</th>
          </>
        }
      >
        {rows.map((s) => (
          <tr key={s.symbol}>
            <td className="font-mono text-[11.5px]">{s.symbol}</td>
            <td className="col-num">{num(s.score, 1)}</td>
          </tr>
        ))}
      </SimpleTable>
    </Body>
  );
}

/* ------------------------------------------------------------------ */
/*  Havuz                                                              */
/* ------------------------------------------------------------------ */

export function PoolPanel() {
  const snap = useQuery({
    queryKey: ["universe-current"],
    queryFn: () => api.get<SnapshotDetail>("/universe/current"),
    refetchInterval: 60_000,
  });

  if (!snap.data) return <Notice>Havuz yüklenemedi.</Notice>;

  return (
    <Body pad={false}>
      <div className="border-b border-line px-3 py-2 text-[11.5px] text-ink-2">
        {snap.data.size} coin · {relative(snap.data.taken_at)}
      </div>

      <div className="border-b border-line px-3 py-2">
        <div className="mb-1 text-[10.5px] tracking-wide text-ink-3 uppercase">
          Filtre hunisi
        </div>
        {snap.data.funnel.map((step) => (
          <div
            key={`${step.index}-${step.name}`}
            className="flex items-baseline gap-2 text-[11.5px]"
            title={filterInfo(step.name).what}
          >
            <span className="num w-5 text-ink-3">{step.index}</span>
            <span className="min-w-0 flex-1 truncate text-ink-2">
              {filterInfo(step.name).label}
            </span>
            <span className="num text-ink">{step.kept}</span>
            <span className={cx("num w-10 text-right", step.dropped > 0 && "text-down")}>
              {step.dropped > 0 ? `−${step.dropped}` : "—"}
            </span>
          </div>
        ))}
      </div>

      <SimpleTable
        dense
        head={
          <>
            <th>#</th>
            <th>Sembol</th>
            <th className="col-num">Hacim</th>
          </>
        }
      >
        {snap.data.symbols.map((s) => (
          <tr key={s.symbol}>
            <td className="num text-[11px] text-ink-3">{s.rank}</td>
            <td className="font-mono text-[11.5px]">{s.symbol}</td>
            <td className="col-num">{compact(s.quote_volume)}</td>
          </tr>
        ))}
      </SimpleTable>
    </Body>
  );
}

/* ------------------------------------------------------------------ */
/*  Pozisyonlar / emirler                                              */
/* ------------------------------------------------------------------ */

export function PositionsPanel() {
  const { data = [] } = useQuery({
    queryKey: ["positions", "open"],
    queryFn: () => api.get<Position[]>("/positions", { status_filter: "OPEN" }),
    refetchInterval: 20_000,
  });

  if (data.length === 0) return <Notice>Açık pozisyon yok.</Notice>;

  return (
    <Body pad={false}>
      <SimpleTable
        dense
        head={
          <>
            <th>Sembol</th>
            <th className="col-num">Giriş</th>
            <th className="col-num">Güncel</th>
            <th className="col-num">K/Z</th>
            <th className="col-num">%</th>
          </>
        }
      >
        {data.map((p) => (
          <tr key={p.id}>
            <td className="font-mono text-[11.5px]">{p.symbol}</td>
            <td className="col-num">{price(p.entry_price)}</td>
            <td className="col-num">{price(p.last_price)}</td>
            <td className={cx("col-num", (p.unrealized_pnl ?? 0) >= 0 ? "text-up" : "text-down")}>
              {money(p.unrealized_pnl)}
            </td>
            <td className={cx("col-num", (p.unrealized_pct ?? 0) >= 0 ? "text-up" : "text-down")}>
              {pctSigned(p.unrealized_pct)}
            </td>
          </tr>
        ))}
      </SimpleTable>
    </Body>
  );
}

export function OrdersPanel() {
  const { data = [] } = useQuery({
    queryKey: ["orders"],
    queryFn: () => api.get<Order[]>("/orders", { limit: 100 }),
    refetchInterval: 30_000,
  });

  if (data.length === 0) return <Notice>Emir yok.</Notice>;

  return (
    <Body pad={false}>
      <SimpleTable
        dense
        head={
          <>
            <th>Zaman</th>
            <th>Sembol</th>
            <th>Yön</th>
            <th>Durum</th>
          </>
        }
      >
        {data.map((o) => (
          <tr key={o.id}>
            <td className="num text-[11px] text-ink-3">{time(o.created_at)}</td>
            <td className="font-mono text-[11.5px]">{o.symbol}</td>
            <td className={cx("text-[11.5px]", o.side === "BUY" ? "text-up" : "text-down")}>
              {o.side === "BUY" ? "Alış" : "Satış"}
            </td>
            <td>
              <OrderStatusPill status={o.status} />
            </td>
          </tr>
        ))}
      </SimpleTable>
    </Body>
  );
}

/* ------------------------------------------------------------------ */
/*  Log akışı                                                          */
/* ------------------------------------------------------------------ */

export function LogsPanel() {
  const { events, state } = useLive();

  if (events.length === 0) {
    return (
      <Notice>
        {state === "open"
          ? "Canlı akış bağlı, henüz olay gelmedi."
          : "Canlı bağlantı yok."}
      </Notice>
    );
  }

  return (
    <Body pad={false}>
      <ul className="divide-y divide-line">
        {events.slice(0, 200).map((e, i) => {
          const h = humanizeEvent(e.kind, e.level, e.payload);
          return (
            <li key={`${e.at}-${i}`} className="flex gap-2 px-3 py-1.5">
              <span className="num shrink-0 text-[10.5px] text-ink-3">{time(e.at)}</span>
              <span
                aria-hidden
                className={cx(
                  "mt-1.5 size-1.5 shrink-0 rounded-full",
                  h.severity === "error"
                    ? "bg-down"
                    : h.severity === "warn"
                      ? "bg-warn"
                      : h.severity === "success"
                        ? "bg-up"
                        : "bg-ink-3",
                )}
              />
              <span className="min-w-0 flex-1 text-[11.5px] leading-snug text-ink-2">
                <span className="text-ink">{h.title}</span>
                {typeof e.payload?.message === "string" && (
                  <span className="block truncate text-ink-3">{e.payload.message}</span>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </Body>
  );
}

/* ------------------------------------------------------------------ */
/*  Kalibrasyon mini                                                   */
/* ------------------------------------------------------------------ */

export function CalibrationPanel() {
  const { data } = useQuery({
    queryKey: ["calibration", "24h", 180],
    queryFn: () =>
      api.get<{
        n: number;
        sufficient: boolean;
        monotonic: boolean;
        spearman: number | null;
        verdict: string;
        deciles: { decile: number; mean_return: number }[];
      }>("/calibration", { horizon: "24h", days: 180 }),
    refetchInterval: 300_000,
  });

  if (!data) return <Notice>Yükleniyor…</Notice>;

  const max = Math.max(...data.deciles.map((d) => Math.abs(d.mean_return)), 0.0001);

  return (
    <Body>
      <div className="mb-2 flex items-center gap-2">
        <StatusPill size="sm" tone={data.monotonic ? "green" : "red"}>
          {data.monotonic ? "artıyor" : "artmıyor"}
        </StatusPill>
        <span className="num text-[11.5px] text-ink-2">
          ρ {num(data.spearman, 3)} · n {num(data.n, 0)}
        </span>
      </div>

      {/*
       * Sarmalayıcıya `h-full` şart: yüzde yükseklik yalnızca kesin
       * yükseklikli bir ebeveyne göre çözülür. Sarmalayıcı `auto` kaldığında
       * çubuklar sıfır yükseklikle çiziliyor ve grafik boş görünüyordu.
       */}
      <div className="flex h-24 items-end gap-1">
        {data.deciles.map((d) => (
          <div
            key={d.decile}
            className="flex h-full flex-1 items-end"
            title={`${d.decile}. dilim: ${num(d.mean_return * 100, 2)}%`}
          >
            <div
              className={cx(
                "w-full rounded-sm",
                d.mean_return >= 0 ? "bg-up" : "bg-down",
              )}
              style={{
                // En küçük çubuk da görünsün; sıfır yükseklik "veri yok" gibi okunur.
                height: `${Math.max((Math.abs(d.mean_return) / max) * 100, 2)}%`,
              }}
            />
          </div>
        ))}
      </div>

      <p className="mt-2 text-[11px] leading-snug text-ink-3">{data.verdict}</p>
    </Body>
  );
}
