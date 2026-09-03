"use client";

/**
 * KÖPRÜ v3 — gazete (DESIGN-V3 §4.1).
 *
 * Manşet · "Bugün" (makine yazımı hikâye) · Para (dört figür, tek blokta)
 * · Filo (defter tablosu, kart değil) · Yarış · Dikkat. Her sayı mono;
 * her satır bir yere götürür; süs yok. Eğriler katılım anına endeksli.
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
  "var(--sn-series-5)", "var(--sn-brand-2)", "var(--sn-ink-2)", "var(--sn-ink-3)", "var(--sn-warn)",
];

const imzali = (v: number | null | undefined) => (v === null || v === undefined ? "—" : `${v > 0 ? "+" : ""}${money(v)}`);
const kisa = (name: string) => name.replace("Havuz Momentum · ", "").replace("MEYDAN OKUMA · ", "MO · ");

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
  const trades = useQuery({ queryKey: ["trades", "kopru"], queryFn: () => api.get<Trade[]>("/trades", { limit: 40 }), refetchInterval: 60_000 });

  const now = Date.now();
  const fleet = useMemo(() => {
    const liveById = new Map((live.data?.bots ?? []).map((b) => [b.bot_id, b]));
    const curveById = new Map((race.data?.bots ?? []).map((b) => [b.bot_id, b.curve.map((p) => p.value)]));
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
  }, [bots.data, live.data, race.data, now]);

  const raceSeries = useMemo<CurveSeries[]>(() => {
    const running = new Set(fleet.map((f) => f.bot.id));
    const out: CurveSeries[] = [];
    let i = 0;
    for (const bot of race.data?.bots ?? []) {
      if (!running.has(bot.bot_id) || bot.curve.length < 2) continue;
      out.push({ label: kisa(bot.name), color: PALETTE[i % PALETTE.length], points: bot.curve.map((p) => ({ at: p.at, value: p.value * 100 })) });
      i += 1;
    }
    const sepet = race.data?.benchmark ?? [];
    if (sepet.length > 1) {
      const taban = sepet[0]?.value || 1;
      out.push({ label: "Havuz sepeti", color: "var(--sn-ink-4)", dashed: true, points: sepet.map((p) => ({ at: p.at, value: (p.value / taban) * 100 })) });
    }
    return out;
  }, [race.data, fleet]);

  /* Bugünün hikâyesi — makine yazımı, sayılar mono. */
  const bugun = useMemo(() => {
    const t = trades.data ?? [];
    const gunBasi = new Date(); gunBasi.setUTCHours(0, 0, 0, 0);
    const bugunku = t.filter((x) => new Date(x.exit_time).getTime() >= gunBasi.getTime());
    const kar = bugunku.filter((x) => x.pnl > 0).length;
    const toplam = bugunku.reduce((s, x) => s + x.pnl, 0);
    const enIyi = [...bugunku].sort((a, b) => b.pnl - a.pnl)[0];
    return { bugunku, kar, toplam, enIyi };
  }, [trades.data]);

  const gun = start ? Math.floor((now - new Date(start).getTime()) / 86_400_000) + 1 : null;
  const l = live.data;
  const exposurePct = l && l.equity > 0 ? l.exposure / l.equity : null;
  const items = attention.data?.items ?? [];
  const urgent = items.filter((i) => i.level !== "INFO");
  const feeds = attention.data?.feeds ?? [];

  return (
    <Page
      title={gun !== null ? `Maratonun ${num(gun, 0)}. günü` : "Köprü"}
      summary={gun !== null ? `${num(meta.data?.days ?? 30, 0)} günlük komutsuz koşu. Sistem kendi başına; bu sayfa yalnızca okur.` : "Sistemin şu anki durumu."}
      stamp={attention.data ? `${relative(attention.data.at)} tazelendi` : undefined}
    >
      <Reveal>
        <div className="grid gap-5 lg:grid-cols-[3fr_2fr]">
          {/* ---- Bugün: hikâye ---------------------------------------- */}
          <Panel title="Bugün">
            <div className="flex flex-col gap-2 text-[15px] leading-[1.6] text-ink">
              <p>
                {bugun.bugunku.length === 0 ? (
                  <>Bugün henüz kapanan işlem yok.</>
                ) : (
                  <>
                    Bugün <NumText text={num(bugun.bugunku.length, 0)} size="md" /> işlem kapandı,{" "}
                    <NumText text={num(bugun.kar, 0)} size="md" /> tanesi kârla; toplam{" "}
                    <Delta value={bugun.toplam} format={(v) => money(v)} size="md" />.
                    {bugun.enIyi && bugun.enIyi.pnl > 0 && (
                      <> En iyisi <NumText text={bugun.enIyi.symbol} size="md" /> ({rMultiple(bugun.enIyi.pnl_r)}).</>
                    )}
                  </>
                )}
              </p>
              <p>
                {l ? (
                  <>
                    Şu an <NumText text={num(l.open_positions, 0)} size="md" /> açık pozisyon var; kâğıt üstünde{" "}
                    <Delta value={l.unrealized_pnl} format={(v) => money(v)} size="md" />.
                  </>
                ) : "Canlı değer yükleniyor."}
              </p>
              <p className="text-ink-2">
                {urgent.length === 0
                  ? "Dikkat isteyen bir şey yok; üç akış da beklenen aralıkta."
                  : <>Dikkat isteyen <NumText text={num(urgent.length, 0)} size="md" /> kalem var — sağ üstte "Dikkat".</>}
                {feeds.some((f) => !f.ok) && (
                  <> Akış notu: {feeds.filter((f) => !f.ok).map((f) => f.detail).join(" ")}</>
                )}
              </p>
            </div>
            {urgent.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {urgent.map((item) => (
                  <Link key={item.id} href={item.href} className="rounded-full">
                    <StatusPill tone={item.level === "CRITICAL" ? "red" : "amber"} dot size="sm">{item.title}</StatusPill>
                  </Link>
                ))}
              </div>
            )}
          </Panel>

          {/* ---- Para: dört figür, tek blok ---------------------------- */}
          <Panel title="Para">
            <div className="grid grid-cols-2 gap-x-6 gap-y-4">
              <Metric label="Özsermaye" value={l?.equity} format={(v) => money(v)} sub={l ? `başlangıç ${money(l.capital)}` : "—"} />
              <Metric label="Bugün" value={l ? l.realized_today + l.unrealized_pnl : null} format={imzali} sub={l ? `${money(l.realized_today)} cebe girdi` : "—"} />
              <Metric label="Açık kâr/zarar" value={l?.unrealized_pnl} format={imzali} sub={l ? `${num(l.open_positions, 0)} pozisyon` : "—"} />
              <Metric label="Maruziyet" value={exposurePct} format={(v) => (v === null || v === undefined ? "—" : `%${num(v * 100, 1)}`)} sub={l ? `${money(l.cash)} nakit` : "—"} />
            </div>
          </Panel>
        </div>
      </Reveal>

      {/* ---- Filo: defter tablosu ------------------------------------- */}
      <Panel title="Filo" description="Her satır bir kol. Getiri katılım tabanına göre; eğri katılımdan bu yana." padded={false}>
        <div className="scroll-thin overflow-x-auto">
          <table className="w-full border-collapse text-left text-[13px]">
            <thead className="border-b border-line">
              <tr>
                {["Kol", "Pazar", "Bar", "Durum", "Getiri", "Açık", "Kâğıt üstü", "Eğri"].map((h, i) => (
                  <th key={h} className={`px-5 py-2.5 text-[11.5px] font-semibold tracking-[0.04em] text-ink-3 uppercase ${i >= 4 && i <= 6 ? "text-right" : ""}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {fleet.map(({ bot, live: lb, spark, blocked, getiri }, idx) => (
                <tr key={bot.id} className="border-b border-line last:border-0 hover:bg-inset/60">
                  <td className="px-5 py-2.5">
                    <Link href={`/botlar/${bot.id}`} className="font-medium text-ink hover:text-brand">{kisa(bot.name)}</Link>
                  </td>
                  <td className="px-5 py-2.5">{bot.market === "BIST" ? <Tag tone="info">BIST</Tag> : bot.market === "US" ? <Tag tone="info">ABD</Tag> : <span className="text-ink-3">Kripto</span>}</td>
                  <td className="px-5 py-2.5"><NumText text={bot.timeframe} size="sm" /></td>
                  <td className="px-5 py-2.5">{blocked ? <StatusPill tone="amber" size="sm" dot>giriş yasağı</StatusPill> : <BotStatePill state={bot.state} hint={false} />}</td>
                  <td className="px-5 py-2.5 text-right"><Delta value={getiri} format={(v) => pctSigned(v)} size="md" /></td>
                  <td className="px-5 py-2.5 text-right"><NumText text={num(lb?.open_positions ?? bot.open_positions, 0)} size="sm" /></td>
                  <td className="px-5 py-2.5 text-right">{lb && lb.unrealized_pnl !== 0 ? <Delta value={lb.unrealized_pnl} format={(v) => money(v)} size="sm" /> : <NumText text="—" size="sm" />}</td>
                  <td className="px-5 py-2.5"><Sparkline points={spark} width={96} height={20} color={PALETTE[idx % PALETTE.length]} /></td>
                </tr>
              ))}
              {fleet.length === 0 && (
                <tr><td colSpan={8} className="px-5 py-8 text-center text-ink-3">Koşan kol yok.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>

      <div className="grid gap-5 xl:grid-cols-[3fr_2fr]">
        <Panel title="Yarış" description="Katılım anına endeksli (100 = start). Kesikli çizgi havuz sepeti." actions={<Link href="/maraton" className="text-[12.5px] text-brand hover:underline">Maraton →</Link>}>
          {raceSeries.length > 0 ? (
            <CurveChart series={raceSeries} height={280} valueFormat={(v) => num(v, 1)} legend />
          ) : (
            <p className="text-[13px] text-ink-3">Eğriler bar kapanışlarıyla dolacak.</p>
          )}
        </Panel>

        <Panel title="Son işlemler" description="En yenisi üstte." padded={false} actions={<Link href="/pozisyonlar?tab=islemler" className="text-[12.5px] text-brand hover:underline">Tümü →</Link>}>
          <ul>
            {(trades.data ?? []).slice(0, 9).map((t) => {
              const bot = bots.data?.find((b) => b.id === t.bot_id);
              return (
                <li key={t.id} className="flex items-center gap-3 border-b border-line px-5 py-2.5 last:border-0">
                  <span className="sn-num w-24 shrink-0 truncate text-[13px] text-ink">{t.symbol}</span>
                  <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink-3">{bot ? kisa(bot.name) : `bot ${t.bot_id}`}</span>
                  <ExitReasonPill reason={t.exit_reason} />
                  <Delta value={t.pnl} format={(v) => money(v)} size="sm" />
                  <NumText text={rMultiple(t.pnl_r)} size="sm" />
                  <span className="sn-num w-14 shrink-0 text-right text-[11px] text-ink-3">{relative(t.exit_time)}</span>
                </li>
              );
            })}
            {trades.data && trades.data.length === 0 && <li className="px-5 py-6 text-[13px] text-ink-3">Henüz kapanan işlem yok.</li>}
          </ul>
        </Panel>
      </div>
    </Page>
  );
}
