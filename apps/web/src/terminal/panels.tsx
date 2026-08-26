"use client";

/**
 * Terminal panelleri.
 *
 * Her panel tek bir soruya cevap veren küçük bir görünümdür ve çalışma
 * alanında bağımsız yaşar. Panelin içeriği panelin dışındaki hiçbir şeye
 * bağlı değildir — bu, sürükle-bırak ile yeniden yerleştirildiğinde
 * bozulmamalarını sağlar.
 *
 * Paneller `DataGrid` değil `SimpleTable` kullanır: bir terminal panelinde
 * araç çubuğu, sütun seçici ve yoğunluk düğmeleri panelin yarısını yer.
 * Sıralamak isteyen kullanıcı asıl sayfaya gider.
 */

import { useQuery } from "@tanstack/react-query";
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
import { humanizeEvent, type Severity } from "@/lib/humanize";
import { filterInfo } from "@/lib/universe-filters";
import { compact, money, num, pctSigned, price, relative, time } from "@/lib/format";
import { cx } from "@/design/cx";
import { Dot, NumText, OrderStatusPill, Tag, type Tone } from "@/design";
import { PriceChart } from "@/design/price-chart";
import { ScoreCard } from "@/design/score-card";
import { SimpleTable, type SimpleColumn } from "@/grid/simple-table";

export interface PanelParams {
  symbol?: string;
  timeframe?: string;
  threshold?: number;
}

const SEVERITY_TONE: Record<Severity, Tone> = {
  error: "down",
  warn: "warn",
  success: "up",
  info: "neutral",
};

/** Panel gövdesi — kaydırma ve dolgu her panelde aynı. */
function Body({ children, pad = true }: { children: React.ReactNode; pad?: boolean }) {
  return <div className={cx("sn-scroll h-full overflow-auto", pad && "p-3")}>{children}</div>;
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <p className="p-3" style={{ fontSize: "var(--sn-t-caption)", color: "var(--sn-ink-3)" }}>
      {children}
    </p>
  );
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
    return (
      <Notice>
        {symbol} için {timeframe} verisi yok.
      </Notice>
    );
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
  if (!detail.data?.rationale) return <Notice>{symbol} için henüz puan hesaplanmamış.</Notice>;

  return (
    <Body>
      <ScoreCard rationale={detail.data.rationale} />
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

  const columns: SimpleColumn<SRLevels["levels"][number]>[] = [
    {
      header: "Tür",
      cell: (row) => (
        <span style={{ fontSize: "var(--sn-t-micro)" }}>
          {row.kind === "support" ? "Destek" : "Direnç"}
        </span>
      ),
    },
    { header: "Fiyat", num: true, cell: (row) => <NumText text={price(row.price)} size="xs" /> },
    { header: "Güç", num: true, cell: (row) => <NumText text={num(row.strength, 2)} size="xs" /> },
  ];

  if (!symbol) return <Notice>Sembol belirtilmedi.</Notice>;
  if (!sr.data) return <Notice>{symbol} için seviye hesaplanamadı.</Notice>;

  return (
    <Body pad={false}>
      <div className="flex flex-col gap-1 px-3 py-2">
        <Row label="Fiyat" value={price(sr.data.price)} />
        <Row label="Direnç" value={price(sr.data.resistance)} tone="down" />
        <Row label="Destek" value={price(sr.data.support)} tone="up" />
        <Row label="Ödül/risk" value={num(sr.data.rr_geometry, 2)} />
        <Row label="POC" value={price(sr.data.poc)} />
        <Row label="ATR" value={price(sr.data.atr)} />
      </div>
      <SimpleTable
        rows={sr.data.levels}
        columns={columns}
        rowKey={(row) => `${row.kind}-${row.price}`}
        dense
      />
    </Body>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone?: "up" | "down" }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span style={{ fontSize: "var(--sn-t-caption)", color: "var(--sn-ink-2)" }}>{label}</span>
      <NumText
        text={value}
        size="sm"
        tone={tone === "up" ? "var(--sn-up)" : tone === "down" ? "var(--sn-down)" : undefined}
      />
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
    (entry) => threshold === undefined || entry.score >= threshold,
  );

  const columns: SimpleColumn<Score>[] = [
    {
      header: "Sembol",
      cell: (row) => (
        <span className="sn-num" style={{ fontSize: "var(--sn-t-micro)" }}>
          {row.symbol}
        </span>
      ),
    },
    { header: "Puan", num: true, cell: (row) => <NumText text={num(row.score, 1)} size="xs" /> },
  ];

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
      <SimpleTable rows={rows} columns={columns} rowKey={(row) => row.symbol} dense />
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

  const columns: SimpleColumn<SnapshotDetail["symbols"][number]>[] = [
    {
      header: "#",
      num: true,
      width: "44px",
      cell: (row) => <NumText text={String(row.rank)} size="xs" />,
    },
    {
      header: "Sembol",
      cell: (row) => (
        <span className="sn-num" style={{ fontSize: "var(--sn-t-micro)" }}>
          {row.symbol}
        </span>
      ),
    },
    {
      header: "Hacim",
      num: true,
      cell: (row) => <NumText text={compact(row.quote_volume)} size="xs" />,
    },
  ];

  if (!snap.data) return <Notice>Havuz yüklenemedi.</Notice>;

  return (
    <Body pad={false}>
      <div
        className="px-3 py-2"
        style={{
          borderBottom: "1px solid var(--sn-hairline)",
          fontSize: "var(--sn-t-caption)",
          color: "var(--sn-ink-2)",
        }}
      >
        {snap.data.size} coin · {relative(snap.data.taken_at)}
      </div>

      <div className="px-3 py-2" style={{ borderBottom: "1px solid var(--sn-hairline)" }}>
        <div className="sn-label mb-1">Filtre hunisi</div>
        {snap.data.funnel.map((step) => (
          <div
            key={`${step.index}-${step.name}`}
            className="flex items-baseline gap-2"
            title={filterInfo(step.name).what}
            style={{ fontSize: "var(--sn-t-caption)" }}
          >
            <span className="sn-num w-5" style={{ color: "var(--sn-ink-3)" }}>
              {step.index}
            </span>
            <span className="min-w-0 flex-1 truncate" style={{ color: "var(--sn-ink-2)" }}>
              {filterInfo(step.name).label}
            </span>
            <span className="sn-num" style={{ color: "var(--sn-ink)" }}>
              {step.kept}
            </span>
            <span
              className="sn-num w-10 text-right"
              style={{ color: step.dropped > 0 ? "var(--sn-down)" : "var(--sn-ink-3)" }}
            >
              {step.dropped > 0 ? `−${step.dropped}` : "—"}
            </span>
          </div>
        ))}
      </div>

      <SimpleTable
        rows={snap.data.symbols}
        columns={columns}
        rowKey={(row) => row.symbol}
        dense
      />
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

  const columns: SimpleColumn<Position>[] = [
    {
      header: "Sembol",
      cell: (row) => (
        <span className="sn-num" style={{ fontSize: "var(--sn-t-micro)" }}>
          {row.symbol}
        </span>
      ),
    },
    { header: "Giriş", num: true, cell: (row) => <NumText text={price(row.entry_price)} size="xs" /> },
    { header: "Güncel", num: true, cell: (row) => <NumText text={price(row.last_price)} size="xs" /> },
    {
      header: "K/Z",
      num: true,
      cell: (row) => (
        <NumText
          text={money(row.unrealized_pnl)}
          size="xs"
          tone={(row.unrealized_pnl ?? 0) >= 0 ? "var(--sn-up)" : "var(--sn-down)"}
        />
      ),
    },
    {
      header: "%",
      num: true,
      cell: (row) => (
        <NumText
          text={pctSigned(row.unrealized_pct)}
          size="xs"
          tone={(row.unrealized_pct ?? 0) >= 0 ? "var(--sn-up)" : "var(--sn-down)"}
        />
      ),
    },
  ];

  if (data.length === 0) return <Notice>Açık pozisyon yok.</Notice>;

  return (
    <Body pad={false}>
      <SimpleTable rows={data} columns={columns} rowKey={(row) => row.id} dense />
    </Body>
  );
}

export function OrdersPanel() {
  const { data = [] } = useQuery({
    queryKey: ["orders"],
    queryFn: () => api.get<Order[]>("/orders", { limit: 100 }),
    refetchInterval: 30_000,
  });

  const columns: SimpleColumn<Order>[] = [
    {
      header: "Zaman",
      cell: (row) => <NumText text={time(row.created_at)} size="xs" />,
    },
    {
      header: "Sembol",
      cell: (row) => (
        <span className="sn-num" style={{ fontSize: "var(--sn-t-micro)" }}>
          {row.symbol}
        </span>
      ),
    },
    {
      header: "Yön",
      cell: (row) => (
        <span
          style={{
            fontSize: "var(--sn-t-micro)",
            color: row.side === "BUY" ? "var(--sn-up)" : "var(--sn-down)",
          }}
        >
          {row.side === "BUY" ? "Alış" : "Satış"}
        </span>
      ),
    },
    { header: "Durum", cell: (row) => <OrderStatusPill status={row.status} /> },
  ];

  if (data.length === 0) return <Notice>Emir yok.</Notice>;

  return (
    <Body pad={false}>
      <SimpleTable rows={data} columns={columns} rowKey={(row) => row.id} dense />
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
        {state === "open" ? "Canlı akış bağlı, henüz olay gelmedi." : "Canlı bağlantı yok."}
      </Notice>
    );
  }

  return (
    <Body pad={false}>
      <ul>
        {events.slice(0, 200).map((event, index) => {
          const human = humanizeEvent(event.kind, event.level, event.payload);
          return (
            <li
              key={`${event.at}-${index}`}
              className="flex gap-2 px-3 py-1.5"
              style={{ borderTop: index > 0 ? "1px solid var(--sn-hairline)" : undefined }}
            >
              <span
                className="sn-num shrink-0"
                style={{ fontSize: 10, color: "var(--sn-ink-3)" }}
              >
                {time(event.at)}
              </span>
              <span className="mt-1.5">
                <Dot tone={SEVERITY_TONE[human.severity]} />
              </span>
              <span
                className="min-w-0 flex-1"
                style={{ fontSize: "var(--sn-t-caption)", color: "var(--sn-ink-2)", lineHeight: 1.4 }}
              >
                <span style={{ color: "var(--sn-ink)" }}>{human.title}</span>
                {typeof event.payload?.message === "string" && (
                  <span className="block truncate" style={{ color: "var(--sn-ink-3)" }}>
                    {event.payload.message}
                  </span>
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

  const max = Math.max(...data.deciles.map((entry) => Math.abs(entry.mean_return)), 0.0001);

  return (
    <Body>
      <div className="mb-2 flex items-center gap-2">
        <Tag tone={data.monotonic ? "up" : "down"}>{data.monotonic ? "artıyor" : "artmıyor"}</Tag>
        <span className="sn-num" style={{ fontSize: "var(--sn-t-caption)", color: "var(--sn-ink-2)" }}>
          ρ {num(data.spearman, 3)} · n {num(data.n, 0)}
        </span>
      </div>

      {/*
        Sarmalayıcıya `h-full` şart: yüzde yükseklik yalnızca kesin
        yükseklikli bir ebeveyne göre çözülür. Sarmalayıcı `auto` kaldığında
        çubuklar sıfır yükseklikle çiziliyor ve grafik boş görünüyordu.
      */}
      <div className="flex h-24 items-end gap-1">
        {data.deciles.map((entry) => (
          <div
            key={entry.decile}
            className="flex h-full flex-1 items-end"
            title={`${entry.decile}. dilim: ${num(entry.mean_return * 100, 2)}%`}
          >
            <div
              className="w-full rounded-[2px]"
              style={{
                background: entry.mean_return >= 0 ? "var(--sn-up)" : "var(--sn-down)",
                /* En küçük çubuk da görünsün; sıfır yükseklik "veri yok" gibi okunur. */
                height: `${Math.max((Math.abs(entry.mean_return) / max) * 100, 2)}%`,
              }}
            />
          </div>
        ))}
      </div>

      <p
        className="mt-2"
        style={{ fontSize: "var(--sn-t-micro)", color: "var(--sn-ink-3)", lineHeight: 1.4 }}
      >
        {data.verdict}
      </p>
    </Body>
  );
}
