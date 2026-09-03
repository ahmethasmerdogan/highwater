"use client";

/**
 * KÖPRÜ — tek bakışta: para, filo, dikkat isteyenler, yarış, son işlemler.
 *
 * Eski Panel bir kutlama kartı + uzun grafikle açılıyordu; maraton
 * sıfırlamasında grafik uçurum çiziyordu. Köprü maraton tabanlıdır (her
 * eğri katılım anına endekslenir), dikkat listesi sunucudan aynen gelir ve
 * filo dokuz kart olarak okunur — tablo değil, karne. Tıklanan her şey bir
 * yere götürür; süs yok.
 */

import Link from "next/link";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Reveal, StatusPill } from "uicean";
import { api, type Benchmark, type Bot, type LivePnl, type Trade } from "@/lib/api";
import { money, num, pctSigned, relative, rMultiple } from "@/lib/format";
import { Page } from "@/shell/page";
import { useAttention } from "@/shell/attention";
import { Delta, Metric, NumText, Panel, Tag } from "@/design";
import { BotStatePill, ExitReasonPill } from "@/design/pills";
import { CurveChart, Sparkline, type CurveSeries } from "@/design/chart";

interface MarathonMeta {
  start: string | null;
  days: number;
  stake_usd: number;
}

const PALETTE = [
  "var(--sn-series-1)", "var(--sn-series-2)", "var(--sn-series-3)", "var(--sn-series-4)",
  "var(--sn-series-5)", "var(--sn-brand-2)", "var(--sn-info)", "var(--sn-warn)", "var(--sn-ink-2)",
];

const imzali = (v: number | null | undefined) => (v === null || v === undefined ? "—" : `${v > 0 ? "+" : ""}${money(v)}`);
const shortName = (name: string) => name.replace("Havuz Momentum · ", "").replace("MEYDAN OKUMA · ", "MO · ");

export default function BridgePage() {
  const live = useQuery({ queryKey: ["live-pnl"], queryFn: () => api.get<LivePnl>("/portfolio/live"), refetchInterval: 10_000 });
  const bots = useQuery({ queryKey: ["bots"], queryFn: () => api.get<Bot[]>("/bots"), refetchInterval: 30_000 });
  const meta = useQuery({ queryKey: ["marathon-meta"], queryFn: () => api.get<MarathonMeta>("/system/marathon"), staleTime: 300_000 });
  const attention = useAttention();
  const start = meta.data?.start ?? null;
  const race = useQuery({
    queryKey: ["benchmark-since", start],
    queryFn: () => api.get<Benchmark>("/portfolio/benchmark", { since: start }),
    enabled: start !== null,
    refetchInterval: 300_000,
  });
  const trades = useQuery({ queryKey: ["trades", "kopru"], queryFn: () => api.get<Trade[]>("/trades", { limit: 8 }), refetchInterval: 60_000 });

  const fleet = useMemo(() => {
    const liveById = new Map((live.data?.bots ?? []).map((b) => [b.bot_id, b]));
    const curveById = new Map((race.data?.bots ?? []).map((b) => [b.bot_id, b.curve.map((p) => p.value)]));
    const now = Date.now();
    return (bots.data ?? [])
      .filter((b) => b.state === "PAPER_RUNNING" || b.state === "DEGRADED" || b.state === "ERROR" || (b.state === "STOPPED" && b.halt_reason))
      .map((b) => ({
        bot: b,
        live: liveById.get(b.id),
        spark: curveById.get(b.id) ?? [],
        blocked: !!b.entries_blocked_until && new Date(b.entries_blocked_until).getTime() > now,
        getiri: b.equity !== null && b.capital > 0 ? b.equity / b.capital - 1 : null,
      }))
      .sort((a, b) => (b.getiri ?? -Infinity) - (a.getiri ?? -Infinity));
  }, [bots.data, live.data, race.data]);

  const raceSeries = useMemo<CurveSeries[]>(() => {
    const running = new Set(fleet.map((f) => f.bot.id));
    const out: CurveSeries[] = [];
    let i = 0;
    for (const bot of race.data?.bots ?? []) {
      if (!running.has(bot.bot_id) || bot.curve.length < 2) continue;
      out.push({ label: shortName(bot.name), color: PALETTE[i % PALETTE.length], points: bot.curve.map((p) => ({ at: p.at, value: p.value * 100 })) });
      i += 1;
    }
    const sepet = race.data?.benchmark ?? [];
    if (sepet.length > 1) {
      const taban = sepet[0]?.value || 1;
      out.push({ label: "Havuz sepeti", color: "var(--sn-ink-4)", dashed: true, points: sepet.map((p) => ({ at: p.at, value: (p.value / taban) * 100 })) });
    }
    return out;
  }, [race.data, fleet]);

  const gun = start ? Math.floor((Date.now() - new Date(start).getTime()) / 86_400_000) : null;
  const l = live.data;
  const exposurePct = l && l.equity > 0 ? l.exposure / l.equity : null;
  const urgent = (attention.data?.items ?? []).filter((i) => i.level !== "INFO");

  return (
    <Page
      title="Köprü"
      summary={gun !== null ? `Maratonun ${num(gun + 1, 0)}. günü / ${num(meta.data?.days ?? 30, 0)} · sistem kendi başına, sen yalnızca bakıyorsun.` : "Sistemin şu anki durumu."}
    >
      <Reveal>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Metric animateOnMount label="Özsermaye" value={l?.equity} format={(v) => money(v)} sub={l ? `başlangıç ${money(l.capital)}` : "—"} accent="brand" />
          <Metric animateOnMount label="Bugün" value={l ? l.realized_today + l.unrealized_pnl : null} format={(v) => imzali(v)} sub={l ? `${money(l.realized_today)} cebe girdi` : "—"} />
          <Metric animateOnMount label="Açık kâr/zarar" value={l?.unrealized_pnl} format={(v) => imzali(v)} sub={l ? `${num(l.open_positions, 0)} açık pozisyon` : "—"} />
          <Metric animateOnMount label="Maruziyet" value={exposurePct} format={(v) => (v === null || v === undefined ? "—" : `%${num(v * 100, 1)}`)} sub={l ? `${money(l.cash)} nakit` : "—"} />
        </div>
      </Reveal>

      {urgent.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {urgent.map((item) => (
            <Link key={item.id} href={item.href} className="sn-focus rounded-full">
              <StatusPill tone={item.level === "CRITICAL" ? "red" : "amber"} dot>
                {item.title}
              </StatusPill>
            </Link>
          ))}
        </div>
      )}

      <Panel title="Filo" description="Her kart bir kol. Getiri maraton tabanına göre; mini eğri katılımdan bu yana.">
        {fleet.length === 0 ? (
          <p style={{ fontSize: "var(--sn-t-body)", color: "var(--sn-ink-3)" }}>Koşan bot yok.</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {fleet.map(({ bot, live: lb, spark, blocked, getiri }, idx) => (
              <Link
                key={bot.id}
                href={`/botlar/${bot.id}`}
                className="sn-focus group flex flex-col gap-2 rounded-[var(--sn-r-md)] p-3 transition-colors hover:bg-[var(--sn-sunken)]"
                style={{ border: "1px solid var(--sn-hairline)", background: "var(--sn-panel)" }}
              >
                <div className="flex items-center gap-1.5">
                  <span className="truncate font-medium" style={{ fontSize: "var(--sn-t-body)", color: "var(--sn-ink)" }}>
                    {shortName(bot.name)}
                  </span>
                  <span className="ml-auto flex shrink-0 items-center gap-1">
                    {bot.market === "BIST" && <Tag tone="info">BIST</Tag>}
                    {bot.market === "US" && <Tag tone="info">ABD</Tag>}
                    <span className="sn-num" style={{ fontSize: "var(--sn-t-micro)", color: "var(--sn-ink-3)" }}>{bot.timeframe}</span>
                  </span>
                </div>
                <div className="flex items-end justify-between gap-2">
                  <Delta value={getiri} format={(v) => pctSigned(v)} size="lg" />
                  <Sparkline points={spark} width={72} height={22} color={PALETTE[idx % PALETTE.length]} />
                </div>
                <div className="flex items-center gap-1.5">
                  {blocked ? (
                    <StatusPill tone="amber" size="sm" dot>giriş yasağı</StatusPill>
                  ) : (
                    <BotStatePill state={bot.state} hint={false} />
                  )}
                  <span className="ml-auto sn-num" style={{ fontSize: "var(--sn-t-caption)", color: "var(--sn-ink-2)" }}>
                    {num(lb?.open_positions ?? bot.open_positions, 0)} açık
                    {lb && lb.unrealized_pnl !== 0 && (
                      <>
                        {" · "}
                        <span style={{ color: lb.unrealized_pnl > 0 ? "var(--sn-up)" : "var(--sn-down)" }}>{money(lb.unrealized_pnl)}</span>
                      </>
                    )}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </Panel>

      <div className="grid gap-4 xl:grid-cols-[3fr_2fr]">
        <Panel title="Yarış" description="Katılım anına endeksli (100 = start). Kesikli çizgi havuz sepeti." padded>
          {raceSeries.length > 0 ? (
            <CurveChart series={raceSeries} height={280} valueFormat={(v) => num(v, 1)} legend />
          ) : (
            <p style={{ fontSize: "var(--sn-t-body)", color: "var(--sn-ink-3)" }}>Eğriler bar kapanışlarıyla dolacak.</p>
          )}
          <div className="mt-2 text-right">
            <Link href="/maraton" className="sn-focus" style={{ fontSize: "var(--sn-t-caption)", color: "var(--sn-brand)" }}>Maraton →</Link>
          </div>
        </Panel>

        <Panel title="Son işlemler" description="Kapanan son sekiz işlem, en yenisi üstte." padded={false}>
          <ul>
            {(trades.data ?? []).map((t) => {
              const bot = bots.data?.find((b) => b.id === t.bot_id);
              return (
                <li key={t.id} className="flex items-center gap-2 px-3 py-2" style={{ borderTop: "1px solid var(--sn-hairline)" }}>
                  <span className="sn-num w-24 shrink-0 truncate" style={{ fontSize: "var(--sn-t-caption)", color: "var(--sn-ink)" }}>{t.symbol}</span>
                  <span className="min-w-0 flex-1 truncate" style={{ fontSize: "var(--sn-t-caption)", color: "var(--sn-ink-3)" }}>{bot ? shortName(bot.name) : `bot ${t.bot_id}`}</span>
                  <ExitReasonPill reason={t.exit_reason} />
                  <Delta value={t.pnl} format={(v) => money(v)} size="sm" />
                  <NumText text={rMultiple(t.pnl_r)} size="sm" />
                  <span className="sn-num w-14 shrink-0 text-right" style={{ fontSize: "var(--sn-t-micro)", color: "var(--sn-ink-4)" }}>{relative(t.exit_time)}</span>
                </li>
              );
            })}
            {trades.data && trades.data.length === 0 && (
              <li className="px-3 py-4" style={{ fontSize: "var(--sn-t-caption)", color: "var(--sn-ink-3)" }}>Henüz kapanan işlem yok.</li>
            )}
          </ul>
          <div className="px-3 py-2 text-right" style={{ borderTop: "1px solid var(--sn-hairline)" }}>
            <Link href="/pozisyonlar?tab=islemler" className="sn-focus" style={{ fontSize: "var(--sn-t-caption)", color: "var(--sn-brand)" }}>Tümü →</Link>
          </div>
        </Panel>
      </div>
    </Page>
  );
}
