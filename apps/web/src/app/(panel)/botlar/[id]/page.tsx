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
import { Button, cx } from "@/ui";
import { api, type Bot, type Position, type Trade } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { toast } from "@/lib/toast";
import { humanizeEvent, payloadSummary } from "@/lib/humanize";
import { Page, Section, StatGrid, Async, Empty } from "@/components/common/page";
import { Stat, AmountText, Signed } from "@/components/common/amount";
import { InfoDot, Field } from "@/components/common/explain";
import { BotStatePill, ExitReasonPill } from "@/components/common/pills";
import { SimpleTable, DataTable, type Column } from "@/components/data/data-table";
import { AreaCurve } from "@/components/viz/charts";
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
    onError: (e: Error) => toast.error("İşlem yapılamadı", e.message),
  });

  const b = bot.data;
  const stats = metrics.data?.stats;
  const curve = metrics.data?.equity_curve ?? [];
  const totalReturn = b && b.equity !== null && b.capital > 0 ? b.equity / b.capital - 1 : null;

  return (
    <Page
      title={b?.name ?? `Bot #${botId}`}
      description={
        b
          ? `${b.timeframe} karar barı · ${money(b.capital)} USD başlangıç sermayesi · strateji sürümü #${b.strategy_version_id}`
          : undefined
      }
      actions={
        <div className="flex items-center gap-2">
          <Link href="/botlar">
            <Button size="sm" variant="ghost" shape="rect">
              Tüm botlar
            </Button>
          </Link>
          {can("TRADER") && b && (
            <>
              {b.state === "PAPER_RUNNING" ? (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    shape="rect"
                    onClick={() => action.mutate("pause")}
                  >
                    Duraklat
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    shape="rect"
                    onClick={() => action.mutate("stop")}
                  >
                    Durdur
                  </Button>
                </>
              ) : (
                <Button
                  size="sm"
                  variant="amber"
                  shape="rect"
                  onClick={() => action.mutate("start")}
                >
                  Başlat
                </Button>
              )}
            </>
          )}
        </div>
      }
    >
      {b && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-elev px-4 py-3">
          <BotStatePill state={b.state} />
          {b.halt_reason && (
            <span className="text-[12.5px] text-warn">Durma sebebi: {b.halt_reason}</span>
          )}
          <span className="flex items-center gap-1 text-[12.5px] text-ink-2">
            Yaşam sinyali
            <InfoDot id="heartbeat" align="start" />
            <span className="text-ink">{relative(b.last_heartbeat_at)}</span>
          </span>
          <span className="ml-auto text-[12px] text-ink-3">
            Bu bot sunucuda çalışır; sayfayı kapatmak onu durdurmaz.
          </span>
        </div>
      )}

      <StatGrid cols={4}>
        <Stat
          label="Özsermaye"
          hint="Nakit artı açık pozisyonların güncel karşılığı."
          value={<AmountText text={money(b?.equity)} size="xl" />}
          sub={b ? `başlangıç ${money(b.capital)} · nakit ${money(b.cash)}` : null}
        />
        <Stat
          label="Toplam getiri"
          hint="Başlangıç sermayesine göre değişim."
          value={<Signed value={totalReturn} text={pctSigned(totalReturn)} size="xl" arrow />}
          tone={totalReturn === null ? "neutral" : totalReturn >= 0 ? "up" : "down"}
        />
        <Stat
          label="İşlem sayısı"
          hint="Kapanmış işlem sayısı. Sistem 30 gün ve 30 işlem dolmadan bir sonucu anlamlı saymaz."
          value={<AmountText text={num(stats?.trades ?? 0, 0)} size="xl" />}
          sub={
            (stats?.trades ?? 0) < 30
              ? `karar için ${30 - (stats?.trades ?? 0)} işlem daha gerekiyor`
              : "örneklem yeterli"
          }
          tone={(stats?.trades ?? 0) < 30 ? "warn" : "neutral"}
        />
        <Stat
          label="İşlem başına beklenti"
          term="beklenti"
          value={<AmountText text={rMultiple(stats?.expectancy_r)} size="xl" />}
          sub="risk birimi (R) cinsinden"
          tone={
            stats?.expectancy_r === null || stats?.expectancy_r === undefined
              ? "neutral"
              : stats.expectancy_r >= 0
                ? "up"
                : "down"
          }
        />
      </StatGrid>

      {/* Sekmeler */}
      <div className="flex flex-wrap gap-1 border-b border-line">
        {(
          [
            { id: "performans", label: "Nasıl gidiyor" },
            { id: "islemler", label: "Ne yaptı" },
            { id: "olaylar", label: "Neden yaptı" },
          ] as { id: Tab; label: string }[]
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cx(
              "-mb-px border-b-2 px-3 py-2 text-[13px] transition-colors",
              tab === t.id
                ? "border-brand font-medium text-ink"
                : "border-transparent text-ink-2 hover:text-ink",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "performans" && (
        <>
          <Section
            title="Özsermaye eğrisi"
            description="Botun toplam değerinin zaman içindeki seyri."
          >
            <AreaCurve
              points={curve.map((p) => ({ at: p.at, value: p.equity }))}
              height={220}
              valueFormat={(v) => money(v)}
            />
          </Section>

          <div className="grid gap-4 lg:grid-cols-2">
            <Section title="İşlem istatistikleri">
              <div className="divide-y divide-line">
                <Field
                  label="Kazanma oranı"
                  hint="Kârla kapanan işlemlerin oranı. Tek başına yanıltıcıdır: %70 kazanma oranı, kayıpların kazançlardan büyük olduğu bir sistemde de görülebilir."
                  value={<span className="num">{pct(stats?.win_rate)}</span>}
                />
                <Field
                  label="Kâr faktörü"
                  term="kar_faktoru"
                  value={<span className="num">{num(stats?.profit_factor)}</span>}
                />
                <Field
                  label="Ortalama sonuç"
                  term="r_katsayisi"
                  value={<span className="num">{rMultiple(stats?.avg_r)}</span>}
                />
                <Field
                  label="Toplam kâr/zarar"
                  hint="Kapanmış işlemlerin net toplamı. Komisyon düşülmüştür."
                  value={
                    <Signed
                      value={stats?.total_pnl}
                      text={money(stats?.total_pnl)}
                      size="sm"
                    />
                  }
                />
                <Field
                  label="Toplam komisyon"
                  hint="Ödenen komisyonların toplamı. Brüt kâra oranı yüksekse strateji fazla işlem yapıyor demektir."
                  value={<span className="num">{money(stats?.total_fees)}</span>}
                />
              </div>
            </Section>

            <Section
              title="Çıkış sebepleri"
              term="cikis_sebebi"
              description="Pozisyonların neden kapandığı. Dağılım stratejinin nasıl davrandığını anlatır."
            >
              {!stats || Object.keys(stats.exit_reasons).length === 0 ? (
                <p className="text-[13px] text-ink-3">Henüz kapanmış işlem yok.</p>
              ) : (
                <div className="space-y-2">
                  {Object.entries(stats.exit_reasons)
                    .sort((a, b) => b[1] - a[1])
                    .map(([reason, count]) => {
                      const share = stats.trades > 0 ? (count / stats.trades) * 100 : 0;
                      return (
                        <div key={reason} className="flex items-center gap-2.5">
                          <span className="w-40 shrink-0">
                            <ExitReasonPill reason={reason} />
                          </span>
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-inset">
                            <div
                              className="h-full rounded-full bg-brand"
                              style={{ width: `${share}%` }}
                            />
                          </div>
                          <span className="num w-16 text-right text-[12px] text-ink-2">
                            {count} · %{num(share, 0)}
                          </span>
                        </div>
                      );
                    })}
                </div>
              )}
            </Section>
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

  const columns: Column<Trade>[] = [
    {
      key: "exit_time",
      header: "Kapanış",
      width: "150px",
      sort: (r) => new Date(r.exit_time).getTime(),
      cell: (r) => <span className="num text-[12px]">{dateTime(r.exit_time)}</span>,
    },
    {
      key: "symbol",
      header: "Sembol",
      width: "120px",
      sort: (r) => r.symbol,
      cell: (r) => <span className="font-mono text-[12.5px]">{r.symbol}</span>,
    },
    {
      key: "exit_reason",
      header: "Sebep",
      width: "180px",
      term: "cikis_sebebi",
      sort: (r) => r.exit_reason,
      cell: (r) => <ExitReasonPill reason={r.exit_reason} />,
    },
    {
      key: "pnl",
      header: "K/Z",
      num: true,
      sort: (r) => r.pnl,
      cell: (r) => <Signed value={r.pnl} text={money(r.pnl)} size="sm" />,
    },
    {
      key: "pnl_r",
      header: "Sonuç",
      num: true,
      term: "r_katsayisi",
      sort: (r) => r.pnl_r,
      cell: (r) => <Signed value={r.pnl_r} text={rMultiple(r.pnl_r)} size="sm" />,
    },
    {
      key: "hold_hours",
      header: "Süre",
      num: true,
      hint: "Pozisyonun açık kaldığı süre.",
      sort: (r) => r.hold_hours,
      cell: (r) => duration(r.hold_hours),
    },
    {
      key: "fees",
      header: "Komisyon",
      num: true,
      defaultHidden: true,
      sort: (r) => r.fees,
      cell: (r) => money(r.fees),
    },
    {
      key: "slippage_bps",
      header: "Kayma",
      num: true,
      term: "kayma",
      defaultHidden: true,
      sort: (r) => r.slippage_bps,
      cell: (r) => num(r.slippage_bps, 1),
    },
    {
      key: "mfe",
      header: "MFE / MAE",
      num: true,
      term: "mfe_mae",
      defaultHidden: true,
      cell: (r) => (
        <span className="num text-[12px]">
          {num(r.mfe, 2)} / {num(r.mae, 2)}
        </span>
      ),
    },
  ];

  return (
    <>
      <Section
        title="Açık pozisyonlar"
        description="Şu an piyasada duran pozisyonlar."
        padded={false}
      >
        {(open.data ?? []).length === 0 ? (
          <Empty
            title="Açık pozisyon yok"
            description="Bu bot şu an piyasada değil."
            className="m-4 border-0"
          />
        ) : (
          <SimpleTable
            head={
              <>
                <th>Sembol</th>
                <th className="col-num">Giriş</th>
                <th className="col-num">Güncel</th>
                <th className="col-num">Stop</th>
                <th className="col-num">Girişteki puan</th>
                <th className="col-num">K/Z</th>
                <th>Açılış</th>
              </>
            }
          >
            {(open.data ?? []).map((p) => (
              <tr key={p.id}>
                <td className="font-mono text-[12.5px]">{p.symbol}</td>
                <td className="col-num">{price(p.entry_price)}</td>
                <td className="col-num">{price(p.last_price)}</td>
                <td className="col-num text-ink-2">{price(p.stop)}</td>
                <td className="col-num">{num(p.score_at_entry, 1)}</td>
                <td className="col-num">
                  <Signed value={p.unrealized_pnl} text={money(p.unrealized_pnl)} size="sm" />
                </td>
                <td className="text-[12px] text-ink-3">{relative(p.entry_time)}</td>
              </tr>
            ))}
          </SimpleTable>
        )}
      </Section>

      <Section
        title="Kapanmış işlemler"
        description="Sonuçlar hem para hem risk birimi (R) cinsinden gösterilir. R, farklı büyüklükteki işlemleri karşılaştırılabilir kılar."
        padded={false}
      >
        <Async
          query={closed}
          empty={{
            title: "Henüz kapanmış işlem yok",
            description: "Bir pozisyon kapandığında sonucu burada görünür.",
          }}
        >
          {(rows) => (
            <DataTable
              rows={rows}
              columns={columns}
              rowKey={(r) => r.id}
              storageKey="bot-islemler"
              searchText={(r) => `${r.symbol} ${r.exit_reason}`}
              searchPlaceholder="Sembol ya da sebep ara…"
              defaultSort={{ key: "exit_time", dir: "desc" }}
              dense
            />
          )}
        </Async>
      </Section>
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
      (query.data ?? []).map((e) => ({
        ...e,
        human: humanizeEvent(e.kind, e.level, e.payload),
      })),
    [query.data],
  );

  return (
    <Section
      title="Olay kayıtları"
      description="Botun ne yaptığı ve neden yaptığı. Sistem genelindeki kayıtlar için Loglar sayfasına bakın."
      padded={false}
    >
      <Async
        query={query}
        empty={{
          title: "Olay kaydı yok",
          description: "Bot çalışmaya başladığında kararları burada görünür.",
        }}
      >
        {() => (
          <ul className="divide-y divide-line">
            {rows.map((e) => (
              <li key={e.id} className="flex gap-3 px-5 py-2.5">
                <span
                  aria-hidden
                  className={cx(
                    "mt-1.5 size-1.5 shrink-0 rounded-full",
                    e.human.severity === "error"
                      ? "bg-down"
                      : e.human.severity === "warn"
                        ? "bg-warn"
                        : e.human.severity === "success"
                          ? "bg-up"
                          : "bg-ink-3",
                  )}
                />
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] text-ink">{e.human.title}</div>
                  <div className="text-[12px] leading-snug text-ink-2">
                    {typeof e.payload?.message === "string"
                      ? e.payload.message
                      : (e.human.detail ?? payloadSummary(e.payload, 4))}
                  </div>
                </div>
                <span className="shrink-0 text-right text-[11.5px] whitespace-nowrap text-ink-3">
                  {time(e.created_at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Async>
    </Section>
  );
}
