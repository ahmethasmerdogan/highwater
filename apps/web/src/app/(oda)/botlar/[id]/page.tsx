"use client";

/**
 * BOT SAYFASI v3 — DESIGN-V3 §4.4.
 *
 * Manşet (ad · bar · sermaye · sürüm · yaşam sinyali) · Durum bloğu
 * (risk rozetleri + dört figür, tek blok) · sekmeler: nasıl gidiyor ·
 * ne yaptı · neden yaptı.
 */

import Link from "next/link";
import { Suspense, use, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ProgressBar, StatusPill, UnderlineTabs } from "uicean";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type Bot, type Position, type Strategy, type Trade } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { toast } from "@/lib/toast";
import { botEylemleri, EYLEM_ETIKET } from "@/lib/bot-actions";
import { humanizeEvent, payloadSummary, type Severity } from "@/lib/humanize";
import { dateTime, duration, money, num, pct, pctSigned, price, relative, rMultiple, time } from "@/lib/format";
import { Page } from "@/shell/page";
import { Async, BotStatePill, Button, Delta, Dot, ExitReasonPill, Field, InfoDot, Metric, NumText, Panel, Segmented, Tag, type Tone } from "@/design";
import { AreaCurve } from "@/design/chart";
import { DataGrid } from "@/grid/data-grid";
import type { GridColumn } from "@/grid/types";
import { girisYasagiBitis, GirisYasagiPill, KesiciPill, PAZAR_ETIKET } from "../risk";

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

/* Sekme adres çubuğunda yaşar: `?tab=gidisat|islemler|neden`. */
type Tab = "gidisat" | "islemler" | "neden";
const TABS: { id: Tab; label: string }[] = [
  { id: "gidisat", label: "Nasıl gidiyor" },
  { id: "islemler", label: "Ne yaptı" },
  { id: "neden", label: "Neden yaptı" },
];

const SEVERITY_TONE: Record<Severity, Tone> = { error: "down", warn: "warn", success: "up", info: "neutral" };

/* Açık pozisyonlar — sütunlar satır verisinden başka bir şeye bakmaz. */
const ACIK_COLUMNS: GridColumn<Position>[] = [
  { id: "symbol", header: "Sembol", width: 124, pin: true, value: (r) => r.symbol, cell: (r) => <span className="sn-num text-ink">{r.symbol}</span> },
  { id: "entry_price", header: "Giriş", width: 110, num: true, value: (r) => r.entry_price, cell: (r) => <NumText text={price(r.entry_price)} size="sm" /> },
  { id: "last_price", header: "Güncel", width: 110, num: true, value: (r) => r.last_price, cell: (r) => <NumText text={price(r.last_price)} size="sm" /> },
  { id: "stop", header: "Stop", width: 110, num: true, value: (r) => r.stop, cell: (r) => <NumText text={price(r.stop)} size="sm" /> },
  { id: "score_at_entry", header: "Girişteki puan", width: 120, num: true, value: (r) => r.score_at_entry, cell: (r) => <NumText text={num(r.score_at_entry, 1)} size="sm" /> },
  { id: "unrealized_pnl", header: "K/Z", width: 110, num: true, value: (r) => r.unrealized_pnl, cell: (r) => <Delta value={r.unrealized_pnl} format={(v) => money(v)} size="sm" /> },
  {
    id: "entry_time",
    header: "Açılış",
    width: 110,
    num: true,
    value: (r) => new Date(r.entry_time).getTime(),
    cell: (r) => <span className="text-[12px] text-ink-3">{relative(r.entry_time)}</span>,
  },
];

type EventRow = BotEventRow & { human: ReturnType<typeof humanizeEvent> };

const olayAyrinti = (e: EventRow) =>
  typeof e.payload?.message === "string" ? e.payload.message : (e.human.detail ?? payloadSummary(e.payload, 4));

/* Olay defteri — düzey noktası, başlık, ayrıntı, saat. */
const OLAY_COLUMNS: GridColumn<EventRow>[] = [
  {
    id: "created_at",
    header: "Saat",
    width: 80,
    num: true,
    pin: true,
    value: (r) => new Date(r.created_at).getTime(),
    cell: (r) => <span className="text-[11px] text-ink-3">{time(r.created_at)}</span>,
  },
  {
    id: "duzey",
    header: "Düzey",
    width: 64,
    value: (r) => r.human.severity,
    cell: (r) => <Dot tone={SEVERITY_TONE[r.human.severity]} />,
  },
  { id: "olay", header: "Olay", width: 240, value: (r) => r.human.title, search: (r) => `${r.kind} ${r.human.title}`, cell: (r) => <span className="text-ink">{r.human.title}</span> },
  {
    id: "ayrinti",
    header: "Ayrıntı",
    width: 520,
    value: (r) => olayAyrinti(r),
    cell: (r) => {
      const text = olayAyrinti(r);
      return <span className="block max-w-full truncate text-[12.5px] text-ink-2" title={text}>{text}</span>;
    },
  },
  { id: "kind", header: "Tür", width: 160, hidden: true, value: (r) => r.kind, cell: (r) => <span className="sn-num text-[12px] text-ink-3">{r.kind}</span> },
];

/**
 * Yürürlükteki kritik ayarlar — sürüm kimliği değil, davranışı belirleyen
 * sayılar. Tanım JSON'undan okunur; motorla alan adları birebir.
 */
function kritikAyarlar(definition: Record<string, unknown>): [string, string][] {
  const oku = (path: string): unknown =>
    path.split(".").reduce<unknown>((acc, key) => {
      if (acc && typeof acc === "object") return (acc as Record<string, unknown>)[key];
      return undefined;
    }, definition);
  const sayi = (v: unknown, digits = 2, unit = ""): string | null =>
    typeof v === "number" && Number.isFinite(v) ? `${num(v, digits)}${unit}` : null;
  const yuzde = (v: unknown): string | null =>
    typeof v === "number" && Number.isFinite(v) ? `%${num(v * 100, 1)}` : null;

  const rows: [string, string | null][] = [
    ["kapı", sayi(oku("entry.min_score"), 1)],
    ["slot", sayi(oku("entry.max_positions"), 0)],
    ["risk", yuzde(oku("sizing.risk_pct"))],
    ["stop", sayi(oku("exit.stop_atr_multiple"), 1, " ATR")],
    ["başabaş", sayi(oku("exit.breakeven_r"), 1, "R")],
    ["iz süren", sayi(oku("exit.trail_atr"), 1, " ATR")],
  ];
  return rows.filter((entry): entry is [string, string] => entry[1] !== null);
}

/*
 * `useSearchParams` bir Suspense sınırı ister; yoksa derleme sırasında
 * uyarı verir ve sayfa tamamen istemci tarafına kaçar.
 */
export default function BotDetailPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<div className="px-8 py-8 text-[13px] text-ink-3">Yükleniyor…</div>}>
      <BotDetailContent params={params} />
    </Suspense>
  );
}

function BotDetailContent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const botId = Number(id);
  const { can } = useAuth();
  const qc = useQueryClient();
  const search = useSearchParams();
  const router = useRouter();
  const requested = search.get("tab");
  const tab: Tab = TABS.some((entry) => entry.id === requested) ? (requested as Tab) : "gidisat";
  const setTab = (next: string) => {
    const query = new URLSearchParams(search.toString());
    query.set("tab", next);
    router.replace(`/botlar/${botId}?${query.toString()}`, { scroll: false });
  };

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
  /* /strategies tanımın tamamını zaten döndürüyor — eşleştirme istemcide. */
  const strategies = useQuery({
    queryKey: ["strategies"],
    queryFn: () => api.get<Strategy[]>("/strategies"),
    staleTime: 300_000,
  });
  const surum = useMemo(() => {
    for (const st of strategies.data ?? []) {
      const v = st.versions.find((one) => one.id === bot.data?.strategy_version_id);
      if (v) return { strateji: st, surum: v };
    }
    return null;
  }, [strategies.data, bot.data?.strategy_version_id]);

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
  const marathon = useQuery({
    queryKey: ["marathon-meta"],
    queryFn: () => api.get<{ start: string | null }>("/system/marathon"),
    staleTime: 300_000,
  });
  const [egriTumu, setEgriTumu] = useState(false);
  const curveAll = metrics.data?.equity_curve ?? [];
  /* Sermaye sıfırlaması öncesi noktalar başka bir taban cinsindendir — eğri
     varsayılan olarak katılım anından başlar; "tümü" uçurumu bilerek gösterir. */
  const taban = Math.max(
    marathon.data?.start ? new Date(marathon.data.start).getTime() : 0,
    data ? new Date(data.created_at).getTime() : 0,
  );
  const curve = egriTumu || !taban ? curveAll : curveAll.filter((p) => new Date(p.at).getTime() >= taban);
  const totalReturn = data && data.equity !== null && data.capital > 0 ? data.equity / data.capital - 1 : null;
  const azTrade = (stats?.trades ?? 0) < 30;

  return (
    <Page
      title={data?.name ?? `Bot #${botId}`}
      summary={
        data
          ? `${data.timeframe} karar barı · ${money(data.capital)} USD sermaye · ${
              surum ? `${surum.strateji.name} v${surum.surum.version}` : `strateji sürümü #${data.strategy_version_id}`
            }`
          : "Bot bilgileri yükleniyor."
      }
      stamp={data ? `yaşam sinyali ${relative(data.last_heartbeat_at)}` : undefined}
      actions={
        <>
          {can("TRADER") && data && botEylemleri(data.state).map((verb) => (
            <Button key={verb} size="sm" variant={verb === "start" ? "primary" : "neutral"} onClick={() => action.mutate(verb)}>
              {EYLEM_ETIKET[verb]}
            </Button>
          ))}
          <Link href="/botlar"><Button size="sm" variant="quiet">Tüm botlar</Button></Link>
        </>
      }
    >
      {/* ---- Durum: rozetler + dört figür, tek blok ---------------------- */}
      <Panel
        title="Durum"
        footer={
          surum && (
            <span className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <Link href="/arastirma?tab=stratejiler" className="text-brand hover:underline">
                {surum.strateji.name} v{surum.surum.version} →
              </Link>
              {kritikAyarlar(surum.surum.definition).map(([etiket, deger]) => (
                <span key={etiket} className="inline-flex items-baseline gap-1">
                  {etiket} <NumText text={deger} size="xs" />
                </span>
              ))}
            </span>
          )
        }
      >
        {data && <RiskDurumu bot={data} />}
        <div className="mt-5 grid grid-cols-2 gap-x-6 gap-y-4 border-t border-line pt-4 lg:grid-cols-4">
          <Metric
            label="Özsermaye"
            value={data?.equity}
            format={(value) => money(value)}
            sub={data ? `başlangıç ${money(data.capital)} · nakit ${money(data.cash)}` : "—"}
          />
          <Metric
            label="Toplam getiri"
            value={totalReturn}
            format={(value) => pctSigned(value)}
            sub="başlangıç sermayesine göre"
          />
          <Metric
            label="İşlem sayısı"
            value={stats?.trades ?? 0}
            format={(value) => num(value, 0)}
            accent={azTrade ? "var(--sn-warn)" : undefined}
            sub={azTrade ? `karar için ${num(30 - (stats?.trades ?? 0), 0)} işlem daha` : "örneklem yeterli"}
          />
          <Metric
            label="Beklenti"
            value={stats?.expectancy_r}
            format={(value) => rMultiple(value)}
            sub="işlem başına, risk birimi (R)"
          />
        </div>
      </Panel>

      <UnderlineTabs items={TABS} value={tab} onChange={setTab} accent="var(--sn-brand)" />

      {tab === "gidisat" && (
        <>
          <Panel
            title="Özsermaye eğrisi"
            description={egriTumu ? "Tüm geçmiş — sermaye sıfırlaması dahil." : "Katılım anından bu yana."}
            actions={
              <Segmented
                size="sm"
                value={egriTumu ? "tumu" : "katilim"}
                onChange={(v) => setEgriTumu(v === "tumu")}
                options={[
                  { value: "katilim", label: "Katılımdan" },
                  { value: "tumu", label: "Tümü" },
                ]}
              />
            }
          >
            <AreaCurve
              points={curve.map((point) => ({ at: point.at, value: point.equity }))}
              height={220}
              valueFormat={(value) => money(value)}
            />
          </Panel>

          <div className="grid gap-5 lg:grid-cols-2">
            <Panel title="İşlem istatistikleri">
              <div className="flex flex-col">
                <Field
                  label="Kazanma oranı"
                  hint="Kârla kapanan işlemlerin oranı. Tek başına yanıltıcıdır."
                  value={<NumText text={pct(stats?.win_rate)} size="sm" />}
                />
                <Field label="Kâr faktörü" term="kar_faktoru" value={<NumText text={num(stats?.profit_factor)} size="sm" />} />
                <Field label="Ortalama sonuç" term="r_katsayisi" value={<NumText text={rMultiple(stats?.avg_r)} size="sm" />} />
                <Field
                  label="Toplam kâr/zarar"
                  hint="Kapanmış işlemlerin net toplamı. Komisyon düşülmüştür."
                  value={<Delta value={stats?.total_pnl} format={(value) => money(value)} size="sm" />}
                />
                <Field
                  label="Toplam komisyon"
                  hint="Brüt kâra oranı yüksekse strateji fazla işlem yapıyor demektir."
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
              description="Pozisyonlar neden kapandı."
            >
              {!stats || Object.keys(stats.exit_reasons).length === 0 ? (
                <p className="text-[13px] text-ink-3">Henüz kapanmış işlem yok.</p>
              ) : (
                <div className="flex flex-col gap-2.5">
                  {Object.entries(stats.exit_reasons)
                    .sort((a, b) => b[1] - a[1])
                    .map(([reason, count]) => {
                      const share = stats.trades > 0 ? (count / stats.trades) * 100 : 0;
                      return (
                        <div key={reason} className="flex items-center gap-3">
                          <span className="w-36 shrink-0"><ExitReasonPill reason={reason} /></span>
                          <ProgressBar value={share} tone="blue" className="flex-1" />
                          <span className="w-24 shrink-0 text-right">
                            <NumText text={num(count, 0)} size="sm" />
                            <span className="text-[12px] text-ink-3"> · </span>
                            <NumText text={`%${num(share, 0)}`} size="sm" />
                          </span>
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
      {tab === "neden" && <BotEvents botId={botId} />}
    </Page>
  );
}

/* ------------------------------------------------------------------ */
/*  Risk durumu                                                        */
/* ------------------------------------------------------------------ */

/**
 * Rozet satırı: durum, kesici, giriş yasağı, pazar, bar. Botun
 * "çalışıyor" görünüp alım yapamadığı hâl buradan okunur.
 */
function RiskDurumu({ bot }: { bot: Bot }) {
  const yasak = girisYasagiBitis(bot);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <BotStatePill state={bot.state} />
      {bot.halt_reason ? <KesiciPill reason={bot.halt_reason} /> : <StatusPill tone="gray" size="sm">kesici yok</StatusPill>}
      {yasak ? <GirisYasagiPill until={yasak} /> : <StatusPill tone="gray" size="sm">giriş açık</StatusPill>}
      <span className="ml-auto inline-flex items-center gap-1.5">
        <Tag tone={bot.market === "CRYPTO" ? "neutral" : "info"}>{PAZAR_ETIKET[bot.market] ?? bot.market}</Tag>
        <Tag tone="neutral" mono>{bot.timeframe}</Tag>
      </span>
    </div>
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
        cell: (row) => <span className="sn-num text-[13px] text-ink">{row.symbol}</span>,
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
        footer: (list) => <NumText text={money(list.reduce((sum, row) => sum + row.pnl, 0))} size="sm" />,
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
        cell: (row) => <span className="sn-num text-[12.5px] text-ink-2">{duration(row.hold_hours)}</span>,
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

  const acik = open.data ?? [];
  return (
    <>
      <Panel title="Açık pozisyonlar" padded={false}>
        <DataGrid
          rows={acik}
          columns={ACIK_COLUMNS}
          rowKey={(row) => String(row.id)}
          storageKey="bot-acik"
          searchable={false}
          density="compact"
          defaultSort={[{ id: "entry_time", desc: true }]}
          emptyTitle="Açık pozisyon yok"
          emptyHint="Bu bot şu an piyasada değil."
        />
      </Panel>

      <Panel title="Kapanmış işlemler" description="Sonuç hem para hem risk birimi (R) cinsinden." padded={false}>
        <Async query={closed} empty={{ title: "Henüz kapanmış işlem yok", hint: "Bir pozisyon kapandığında sonucu burada görünür." }}>
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

  const rows = useMemo<EventRow[]>(
    () => (query.data ?? []).map((event) => ({ ...event, human: humanizeEvent(event.kind, event.level, event.payload) })),
    [query.data],
  );

  return (
    <Panel title="Olay kayıtları" description="Botun ne yaptığı ve neden yaptığı. Sistem geneli için Günlük." padded={false}>
      <Async query={query} empty={{ title: "Olay kaydı yok", hint: "Bot çalışmaya başladığında kararları burada görünür." }}>
        {() => (
          <DataGrid
            rows={rows}
            columns={OLAY_COLUMNS}
            rowKey={(row) => String(row.id)}
            storageKey="bot-olaylar"
            searchPlaceholder="Olay ya da ayrıntı ara…"
            density="compact"
            defaultSort={[{ id: "created_at", desc: true }]}
            maxHeight={560}
          />
        )}
      </Async>
    </Panel>
  );
}
