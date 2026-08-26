"use client";

/**
 * Bot detayı — bir botun ne yaptığı ve nasıl gittiği.
 *
 * Üç soruyu ayrı ayrı cevaplar: **nasıl gidiyor** (performans),
 * **ne yaptı** (işlemler) ve **neden yaptı** (olay kayıtları).
 */

import Link from "next/link";
import { use, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type Bot, type Position, type Trade } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { toast } from "@/lib/toast";
import { humanizeEvent, payloadSummary, type Severity } from "@/lib/humanize";
import {
  dateTime,
  duration,
  money,
  num,
  pct,
  pctSigned,
  price,
  relative,
  rMultiple,
  time,
} from "@/lib/format";
import { Page } from "@/shell/page";
import {
  Async,
  BotStatePill,
  Button,
  Delta,
  Dot,
  Empty,
  ExitReasonPill,
  Field,
  InfoDot,
  Metric,
  NumText,
  Panel,
  Segmented,
  type Tone,
} from "@/design";
import { AreaCurve } from "@/design/chart";
import { DataGrid } from "@/grid/data-grid";
import { SimpleTable, type SimpleColumn } from "@/grid/simple-table";
import type { GridColumn } from "@/grid/types";

interface BotMetricsResponse {
  stats: {
    trades: number;
    win_rate: number | null;
    profit_factor: number | null;
    expectancy_r: number | null;
    avg_r: number | null;
    total_pnl: number;
    total_fees: number;
    exit_reasons: Record<string, number>;
  };
  equity_curve: { at: string; equity: number; cash: number; exposure: number }[];
}

interface BotEventRow {
  id: number;
  kind: string;
  level: string;
  payload: Record<string, unknown>;
  created_at: string;
}

type Tab = "performans" | "islemler" | "olaylar";

const SEVERITY_TONE: Record<Severity, Tone> = {
  error: "down",
  warn: "warn",
  success: "up",
  info: "neutral",
};

export default function BotDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const botId = Number(id);
  const { can } = useAuth();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("performans");

  const bot = useQuery({
    queryKey: ["bot", botId],
    queryFn: () => api.get<Bot>(`/bots/${botId}`),
    refetchInterval: 15_000,
  });

  const metrics = useQuery({
    queryKey: ["bot-metrics", botId],
    queryFn: () => api.get<BotMetricsResponse>(`/bots/${botId}/metrics`),
    refetchInterval: 60_000,
  });

  const action = useMutation({
    mutationFn: (verb: string) => api.post(`/bots/${botId}/${verb}`),
    onSuccess: () => {
      toast.success("Bot durumu değişti");
      void qc.invalidateQueries({ queryKey: ["bot", botId] });
      void qc.invalidateQueries({ queryKey: ["bots"] });
    },
    onError: (error: Error) => toast.error("İşlem yapılamadı", error.message),
  });

  const data = bot.data;
  const stats = metrics.data?.stats;
  const curve = metrics.data?.equity_curve ?? [];
  const totalReturn =
    data && data.equity !== null && data.capital > 0 ? data.equity / data.capital - 1 : null;

  return (
    <Page
      title={data?.name ?? `Bot #${botId}`}
      summary={
        data
          ? `${data.timeframe} karar barı · ${money(data.capital)} USD başlangıç sermayesi · strateji sürümü #${data.strategy_version_id}`
          : "Bot bilgileri yükleniyor."
      }
      actions={
        <div className="flex items-center gap-2">
          <Link href="/botlar">
            <Button size="sm" variant="quiet">
              Tüm botlar
            </Button>
          </Link>
          {can("TRADER") && data && (
            <>
              {data.state === "PAPER_RUNNING" ? (
                <>
                  <Button size="sm" variant="neutral" onClick={() => action.mutate("pause")}>
                    Duraklat
                  </Button>
                  <Button size="sm" variant="neutral" onClick={() => action.mutate("stop")}>
                    Durdur
                  </Button>
                </>
              ) : (
                <Button size="sm" variant="primary" onClick={() => action.mutate("start")}>
                  Başlat
                </Button>
              )}
            </>
          )}
        </div>
      }
    >
      {data && (
        <div
          className="flex flex-wrap items-center gap-3 rounded-[var(--sn-r-md)] px-4 py-3"
          style={{ background: "var(--sn-panel)", border: "1px solid var(--sn-hairline)" }}
        >
          <BotStatePill state={data.state} />
          {data.halt_reason && (
            <span style={{ fontSize: "var(--sn-t-caption)", color: "var(--sn-warn)" }}>
              Durma sebebi: {data.halt_reason}
            </span>
          )}
          <span
            className="flex items-center gap-1"
            style={{ fontSize: "var(--sn-t-caption)", color: "var(--sn-ink-2)" }}
          >
            Yaşam sinyali
            <InfoDot id="heartbeat" />
            <span style={{ color: "var(--sn-ink)" }}>{relative(data.last_heartbeat_at)}</span>
          </span>
          <span
            className="ml-auto"
            style={{ fontSize: "var(--sn-t-caption)", color: "var(--sn-ink-3)" }}
          >
            Bu bot sunucuda çalışır; sayfayı kapatmak onu durdurmaz.
          </span>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric
          label="Özsermaye"
          value={data?.equity}
          format={(value) => money(value)}
          accent="var(--sn-brand-solid)"
          sub={data ? `başlangıç ${money(data.capital)} · nakit ${money(data.cash)}` : undefined}
        />
        <Metric
          label="Toplam getiri"
          value={totalReturn}
          format={(value) => pctSigned(value)}
          accent={
            totalReturn === null ? undefined : totalReturn >= 0 ? "var(--sn-up)" : "var(--sn-down)"
          }
          sub="başlangıç sermayesine göre"
        />
        <Metric
          label="İşlem sayısı"
          value={stats?.trades ?? 0}
          format={(value) => num(value, 0)}
          accent={(stats?.trades ?? 0) < 30 ? "var(--sn-warn)" : undefined}
          sub={
            (stats?.trades ?? 0) < 30
              ? `karar için ${30 - (stats?.trades ?? 0)} işlem daha gerekiyor`
              : "örneklem yeterli"
          }
        />
        <Metric
          label="İşlem başına beklenti"
          value={stats?.expectancy_r}
          format={(value) => rMultiple(value)}
          accent={
            stats?.expectancy_r === null || stats?.expectancy_r === undefined
              ? undefined
              : stats.expectancy_r >= 0
                ? "var(--sn-up)"
                : "var(--sn-down)"
          }
          sub="risk birimi (R) cinsinden"
        />
      </div>

      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { value: "performans", label: "Nasıl gidiyor" },
          { value: "islemler", label: "Ne yaptı" },
          { value: "olaylar", label: "Neden yaptı" },
        ]}
      />

      {tab === "performans" && (
        <>
          <Panel title="Özsermaye eğrisi" description="Botun toplam değerinin zaman içindeki seyri.">
            <AreaCurve
              points={curve.map((point) => ({ at: point.at, value: point.equity }))}
              height={220}
              valueFormat={(value) => money(value)}
            />
          </Panel>

          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title="İşlem istatistikleri">
              <div className="flex flex-col">
                <Field
                  label="Kazanma oranı"
                  hint="Kârla kapanan işlemlerin oranı. Tek başına yanıltıcıdır: %70 kazanma oranı, kayıpların kazançlardan büyük olduğu bir sistemde de görülebilir."
                  value={<NumText text={pct(stats?.win_rate)} size="sm" />}
                />
                <Field
                  label="Kâr faktörü"
                  term="kar_faktoru"
                  value={<NumText text={num(stats?.profit_factor)} size="sm" />}
                />
                <Field
                  label="Ortalama sonuç"
                  term="r_katsayisi"
                  value={<NumText text={rMultiple(stats?.avg_r)} size="sm" />}
                />
                <Field
                  label="Toplam kâr/zarar"
                  hint="Kapanmış işlemlerin net toplamı. Komisyon düşülmüştür."
                  value={<Delta value={stats?.total_pnl} format={(value) => money(value)} size="sm" />}
                />
                <Field
                  label="Toplam komisyon"
                  hint="Ödenen komisyonların toplamı. Brüt kâra oranı yüksekse strateji fazla işlem yapıyor demektir."
                  value={<NumText text={money(stats?.total_fees)} size="sm" />}
                />
              </div>
            </Panel>

            <Panel
              title={
                <span className="flex items-center gap-1.5">
                  Çıkış sebepleri
                  <InfoDot id="cikis_sebebi" />
                </span>
              }
              description="Pozisyonların neden kapandığı. Dağılım stratejinin nasıl davrandığını anlatır."
            >
              {!stats || Object.keys(stats.exit_reasons).length === 0 ? (
                <p style={{ fontSize: "var(--sn-t-body)", color: "var(--sn-ink-3)" }}>
                  Henüz kapanmış işlem yok.
                </p>
              ) : (
                <div className="flex flex-col gap-2">
                  {Object.entries(stats.exit_reasons)
                    .sort((a, b) => b[1] - a[1])
                    .map(([reason, count]) => {
                      const share = stats.trades > 0 ? (count / stats.trades) * 100 : 0;
                      return (
                        <div key={reason} className="flex items-center gap-2.5">
                          <span className="w-40 shrink-0">
                            <ExitReasonPill reason={reason} />
                          </span>
                          <div
                            className="h-1.5 flex-1 overflow-hidden rounded-full"
                            style={{ background: "var(--sn-sunken)" }}
                          >
                            <div
                              className="h-full rounded-full"
                              style={{ width: `${share}%`, background: "var(--sn-brand-solid)" }}
                            />
                          </div>
                          <NumText
                            text={`${count} · %${num(share, 0)}`}
                            size="sm"
                            className="w-20 text-right"
                          />
                        </div>
                      );
                    })}
                </div>
              )}
            </Panel>
          </div>
        </>
      )}

      {tab === "islemler" && <BotTrades botId={botId} />}
      {tab === "olaylar" && <BotEvents botId={botId} />}
    </Page>
  );
}

/* ------------------------------------------------------------------ */
/*  İşlemler                                                           */
/* ------------------------------------------------------------------ */

function BotTrades({ botId }: { botId: number }) {
  const open = useQuery({
    queryKey: ["positions", botId],
    queryFn: () => api.get<Position[]>("/positions", { bot_id: botId, status_filter: "OPEN" }),
    refetchInterval: 20_000,
  });

  const closed = useQuery({
    queryKey: ["trades", botId],
    queryFn: () => api.get<Trade[]>("/trades", { bot_id: botId, limit: 300 }),
    refetchInterval: 60_000,
  });

  const openColumns: SimpleColumn<Position>[] = [
    {
      header: "Sembol",
      cell: (row) => (
        <span className="sn-num" style={{ fontSize: "var(--sn-t-caption)" }}>
          {row.symbol}
        </span>
      ),
    },
    { header: "Giriş", num: true, cell: (row) => <NumText text={price(row.entry_price)} size="sm" /> },
    { header: "Güncel", num: true, cell: (row) => <NumText text={price(row.last_price)} size="sm" /> },
    { header: "Stop", num: true, cell: (row) => <NumText text={price(row.stop)} size="sm" /> },
    {
      header: "Girişteki puan",
      num: true,
      cell: (row) => <NumText text={num(row.score_at_entry, 1)} size="sm" />,
    },
    {
      header: "K/Z",
      num: true,
      cell: (row) => <Delta value={row.unrealized_pnl} format={(value) => money(value)} size="sm" />,
    },
    {
      header: "Açılış",
      cell: (row) => (
        <span style={{ fontSize: "var(--sn-t-caption)", color: "var(--sn-ink-3)" }}>
          {relative(row.entry_time)}
        </span>
      ),
    },
  ];

  const columns = useMemo<GridColumn<Trade>[]>(
    () => [
      {
        id: "exit_time",
        header: "Kapanış",
        width: 158,
        pin: true,
        value: (row) => new Date(row.exit_time).getTime(),
        cell: (row) => <NumText text={dateTime(row.exit_time)} size="sm" />,
      },
      {
        id: "symbol",
        header: "Sembol",
        width: 124,
        value: (row) => row.symbol,
        search: (row) => `${row.symbol} ${row.exit_reason}`,
        cell: (row) => (
          <span className="sn-num" style={{ fontSize: "var(--sn-t-caption)" }}>
            {row.symbol}
          </span>
        ),
      },
      {
        id: "exit_reason",
        header: "Sebep",
        width: 190,
        hint: "Pozisyonu ne kapattı: stop, hedef, iz süren stop ya da puan düşüşü.",
        value: (row) => row.exit_reason,
        cell: (row) => <ExitReasonPill reason={row.exit_reason} />,
      },
      {
        id: "pnl",
        header: "K/Z",
        width: 122,
        num: true,
        value: (row) => row.pnl,
        cell: (row) => <Delta value={row.pnl} format={(value) => money(value)} size="sm" />,
        footer: (list) => (
          <NumText text={money(list.reduce((sum, row) => sum + row.pnl, 0))} size="sm" />
        ),
      },
      {
        id: "pnl_r",
        header: "Sonuç",
        width: 116,
        num: true,
        hint: "İşlemin sonucu, o işlemde göze alınan riske bölünmüş hâli.",
        value: (row) => row.pnl_r,
        cell: (row) => <Delta value={row.pnl_r} format={(value) => rMultiple(value)} size="sm" />,
      },
      {
        id: "hold_hours",
        header: "Süre",
        width: 100,
        num: true,
        hint: "Pozisyonun açık kaldığı süre.",
        value: (row) => row.hold_hours,
        cell: (row) => (
          <span style={{ fontSize: "var(--sn-t-caption)", color: "var(--sn-ink-2)" }}>
            {duration(row.hold_hours)}
          </span>
        ),
      },
      {
        id: "fees",
        header: "Komisyon",
        width: 112,
        num: true,
        hidden: true,
        value: (row) => row.fees,
        cell: (row) => <NumText text={money(row.fees)} size="sm" />,
      },
      {
        id: "slippage_bps",
        header: "Kayma",
        width: 104,
        num: true,
        hidden: true,
        hint: "Beklenen fiyatla gerçekleşen fiyat arasındaki fark.",
        value: (row) => row.slippage_bps,
        cell: (row) => <NumText text={num(row.slippage_bps, 1)} size="sm" />,
      },
      {
        id: "mfe",
        header: "MFE / MAE",
        width: 130,
        num: true,
        hidden: true,
        hint: "İşlemin gördüğü en iyi ve en kötü nokta.",
        value: (row) => row.mfe,
        cell: (row) => <NumText text={`${num(row.mfe, 2)} / ${num(row.mae, 2)}`} size="sm" />,
      },
    ],
    [],
  );

  return (
    <>
      <Panel title="Açık pozisyonlar" description="Şu an piyasada duran pozisyonlar." padded={false}>
        {(open.data ?? []).length === 0 ? (
          <Empty title="Açık pozisyon yok" hint="Bu bot şu an piyasada değil." />
        ) : (
          <div className="sn-scroll overflow-x-auto">
            <SimpleTable
              rows={open.data ?? []}
              columns={openColumns}
              rowKey={(row) => row.id}
            />
          </div>
        )}
      </Panel>

      <Panel
        title="Kapanmış işlemler"
        description="Sonuçlar hem para hem risk birimi (R) cinsinden gösterilir. R, farklı büyüklükteki işlemleri karşılaştırılabilir kılar."
        padded={false}
      >
        <Async
          query={closed}
          empty={{
            title: "Henüz kapanmış işlem yok",
            hint: "Bir pozisyon kapandığında sonucu burada görünür.",
          }}
        >
          {(rows) => (
            <DataGrid
              rows={rows}
              columns={columns}
              rowKey={(row) => String(row.id)}
              storageKey="bot-islemler"
              searchPlaceholder="Sembol ya da sebep ara…"
              defaultSort={[{ id: "exit_time", desc: true }]}
              density="compact"
              maxHeight={520}
            />
          )}
        </Async>
      </Panel>
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Olaylar                                                            */
/* ------------------------------------------------------------------ */

function BotEvents({ botId }: { botId: number }) {
  const query = useQuery({
    queryKey: ["bot-events", botId],
    queryFn: () => api.get<BotEventRow[]>(`/bots/${botId}/events`, { limit: 300 }),
    refetchInterval: 30_000,
  });

  const rows = useMemo(
    () =>
      (query.data ?? []).map((event) => ({
        ...event,
        human: humanizeEvent(event.kind, event.level, event.payload),
      })),
    [query.data],
  );

  return (
    <Panel
      title="Olay kayıtları"
      description="Botun ne yaptığı ve neden yaptığı. Sistem genelindeki kayıtlar için Loglar sayfasına bakın."
      padded={false}
    >
      <Async
        query={query}
        empty={{
          title: "Olay kaydı yok",
          hint: "Bot çalışmaya başladığında kararları burada görünür.",
        }}
      >
        {() => (
          <ul>
            {rows.map((event) => (
              <li
                key={event.id}
                className="flex gap-3 px-4 py-2.5"
                style={{ borderTop: "1px solid var(--sn-hairline)" }}
              >
                <span className="mt-1.5">
                  <Dot tone={SEVERITY_TONE[event.human.severity]} />
                </span>
                <div className="min-w-0 flex-1">
                  <div style={{ fontSize: "var(--sn-t-body)", color: "var(--sn-ink)" }}>
                    {event.human.title}
                  </div>
                  <div
                    style={{ fontSize: "var(--sn-t-caption)", color: "var(--sn-ink-2)", lineHeight: 1.45 }}
                  >
                    {typeof event.payload?.message === "string"
                      ? event.payload.message
                      : (event.human.detail ?? payloadSummary(event.payload, 4))}
                  </div>
                </div>
                <span
                  className="sn-num shrink-0 text-right whitespace-nowrap"
                  style={{ fontSize: "var(--sn-t-micro)", color: "var(--sn-ink-3)" }}
                >
                  {time(event.created_at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Async>
    </Panel>
  );
}
