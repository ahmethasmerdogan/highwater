"use client";

/**
 * KÖPRÜ v3 — gazete (DESIGN-V3 §4.1).
 *
 * Manşet · "Bugün" (makine yazımı hikâye) · Para (dört figür, tek blokta)
 * · Filo (defter tablosu, kart değil) · Yarış · Dikkat. Her sayı mono;
 * her satır bir yere götürür; süs yok. Eğriler katılım anına endeksli.
 *
 * Filo tek uçtan beslenir (`/bots/fleet`): getiri pencereleri, kazanma
 * oranı, seri ve nabız sunucuda hesaplanır; panel türetmez.
 */

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Reveal, StatusPill, Toggle as PressToggle } from "uicean";
import { api, type Benchmark, type FleetRow, type LivePnl, type Trade } from "@/lib/api";
import { money, num, pctSigned, relative, rMultiple } from "@/lib/format";
import { Page } from "@/shell/page";
import { useAttention } from "@/shell/attention";
import { Delta, ErrorBox, Metric, NumText, Panel, Tag } from "@/design";
import { BotStatePill, ExitReasonPill } from "@/design/pills";
import { CurveChart, Sparkline, type CurveSeries } from "@/design/chart";
import { DataGrid } from "@/grid/data-grid";
import type { GridColumn } from "@/grid/types";

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
const kisa = (name: string) => name.replace("Havuz Momentum · ", "").replace("MEYDAN OKUMA · ", "MO · ").replace("ARŞİV · ", "");
const yuzde = (v: number | null | undefined, digits = 1) => (v === null || v === undefined ? "—" : `%${num(v * 100, digits)}`);

/* Filo satırı: sunucu satırı + eğri + renk. Sütunlar başka bir şeye bakmaz. */
interface FiloSatir {
  row: FleetRow;
  spark: number[];
  color: string;
  blocked: boolean;
}

type Grup = "maraton" | "deney" | "arsiv";
const GRUP_ETIKET: Record<Grup, string> = { maraton: "Maraton", deney: "Deney", arsiv: "Arşiv" };
const GRUP_ANAHTAR = "sarnic.kopru.filo.gruplar";
const NABIZ_ESIK_S = 300;

const pazar = (r: FleetRow) =>
  r.market === "BIST" ? <Tag tone="info">BIST</Tag> : r.market === "US" ? <Tag tone="info">ABD</Tag> : <span className="text-ink-3">Kripto</span>;

function KolHucresi({ r }: { r: FleetRow }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <span className="truncate font-medium text-ink">{kisa(r.name)}</span>
      {r.direction === "SHORT" && <Tag tone="down">kısa</Tag>}
      {r.direction === "BOTH" && <Tag tone="info">iki yön</Tag>}
      {r.agresif && <Tag tone="warn">agresif</Tag>}
      {!r.agresif && r.deney && <Tag tone="neutral">deney</Tag>}
      {r.max_leverage > 1 && (
        <Tag tone="brand" mono>{`${num(r.max_leverage, 0)}×`}</Tag>
      )}
    </span>
  );
}

function DurumHucresi({ s }: { s: FiloSatir }) {
  const r = s.row;
  if (s.blocked) return <StatusPill tone="amber" size="sm" dot>giriş yasağı</StatusPill>;
  if (r.state === "STOPPED" && r.halt_reason) return <StatusPill tone="red" size="sm" dot>{`durdu · ${r.halt_reason}`}</StatusPill>;
  return <BotStatePill state={r.state} hint={false} />;
}

function NabizHucresi({ r }: { r: FleetRow }) {
  const kosuyor = r.state === "PAPER_RUNNING" || r.state === "DEGRADED";
  const gec = kosuyor && r.heartbeat_age_s !== null && r.heartbeat_age_s > NABIZ_ESIK_S;
  if (!r.last_heartbeat_at) return <NumText text="—" size="sm" />;
  return gec ? (
    <StatusPill tone="amber" size="sm" dot>{relative(r.last_heartbeat_at)}</StatusPill>
  ) : (
    <span className="sn-num text-[12px] text-ink-3">{relative(r.last_heartbeat_at)}</span>
  );
}

const para = (v: number | null | undefined) => <Delta value={v} format={(x) => money(x)} size="sm" />;

/** TL kolunu USD'den ayrı yazar: kur beslemesi yok, iki birim toplanmaz. */
function lira(v: number): string {
  return new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 0 }).format(v);
}

/* Filo defteri — sütunlar satır verisinden başka bir şeye bakmaz. */
const FILO_COLUMNS: GridColumn<FiloSatir>[] = [
  { id: "kol", header: "Kol", width: 260, pin: true, value: (s) => kisa(s.row.name), search: (s) => `${s.row.name} ${s.row.market} ${s.row.state}`, cell: (s) => <KolHucresi r={s.row} /> },
  { id: "pazar", header: "Pazar", width: 80, value: (s) => s.row.market, cell: (s) => pazar(s.row) },
  { id: "bar", header: "Bar", width: 60, value: (s) => s.row.timeframe, cell: (s) => <NumText text={s.row.timeframe} size="sm" /> },
  { id: "durum", header: "Durum", width: 160, value: (s) => (s.blocked ? "giriş yasağı" : s.row.state), cell: (s) => <DurumHucresi s={s} /> },
  { id: "ozsermaye", header: "Özsermaye", width: 110, num: true, value: (s) => s.row.equity, cell: (s) => <NumText text={money(s.row.equity)} size="sm" /> },
  {
    id: "getiri",
    header: "Getiri",
    hint: "Özsermaye / katılım sermayesi − 1. Katılım tabanı re-base anındaki sermayedir.",
    width: 96,
    num: true,
    value: (s) => s.row.return_pct,
    cell: (s) => <Delta value={s.row.return_pct} format={(v) => pctSigned(v)} size="md" />,
  },
  { id: "bugun", header: "Bugün", hint: "UTC günü içinde cebe giren (kapanan işlemler).", width: 92, num: true, value: (s) => s.row.realized_today, cell: (s) => para(s.row.realized_today) },
  { id: "s24", header: "24s", width: 92, num: true, value: (s) => s.row.realized_24h, cell: (s) => para(s.row.realized_24h) },
  { id: "g7", header: "7g", width: 92, num: true, hidden: true, value: (s) => s.row.realized_7d, cell: (s) => para(s.row.realized_7d) },
  { id: "katilim", header: "Katılımdan beri", hint: "Re-base anından bu yana kapanan işlemlerin net toplamı.", width: 120, num: true, value: (s) => s.row.realized_since_rebase, cell: (s) => para(s.row.realized_since_rebase) },
  {
    id: "kagit",
    header: "Kâğıt üstü",
    hint: "Açık pozisyonların canlı fiyatla kâr/zararı; henüz cebe girmedi.",
    width: 100,
    num: true,
    value: (s) => s.row.unrealized_pnl,
    cell: (s) => (s.row.open_positions > 0 ? para(s.row.unrealized_pnl) : <NumText text="—" size="sm" />),
  },
  {
    id: "dd",
    header: "Drawdown",
    hint: "Tepeden uzaklık: özsermaye / tepe − 1.",
    width: 96,
    num: true,
    value: (s) => s.row.drawdown_pct,
    cell: (s) => <Delta value={s.row.drawdown_pct} format={(v) => pctSigned(v)} size="sm" />,
  },
  {
    id: "maruziyet",
    header: "Maruziyet",
    hint: "Brüt pozisyon değeri / özsermaye. Kaldıraçlı kollarda %100'ü aşabilir.",
    width: 96,
    num: true,
    value: (s) => s.row.exposure_pct,
    cell: (s) => <NumText text={yuzde(s.row.exposure_pct, 0)} size="sm" />,
  },
  {
    id: "acik",
    header: "Açık",
    hint: "Açık pozisyon sayısı; kısa ve kaldıraçlı olanlar ayrıca yazılır.",
    width: 120,
    num: true,
    value: (s) => s.row.open_positions,
    cell: (s) => {
      const r = s.row;
      const ek = [r.open_short > 0 ? `${num(r.open_short, 0)} kısa` : null, r.open_leveraged > 0 ? `${num(r.open_leveraged, 0)} kald.` : null].filter(Boolean);
      return (
        <span className="inline-flex items-baseline gap-1.5">
          <NumText text={num(r.open_positions, 0)} size="sm" />
          {ek.length > 0 && <span className="sn-num text-[11px] text-ink-3">{ek.join(" · ")}</span>}
        </span>
      );
    },
  },
  { id: "islem", header: "İşlem", hint: "Katılımdan bu yana kapanan işlem sayısı.", width: 70, num: true, value: (s) => s.row.trades, cell: (s) => <NumText text={num(s.row.trades, 0)} size="sm" /> },
  { id: "kazanma", header: "Kazanma", width: 88, num: true, value: (s) => s.row.win_rate, cell: (s) => <NumText text={yuzde(s.row.win_rate, 0)} size="sm" /> },
  { id: "ortr", header: "Ort. R", hint: "İşlem başına ortalama R çarpanı (kâr / ilk risk).", width: 80, num: true, value: (s) => s.row.avg_r, cell: (s) => <NumText text={s.row.avg_r === null ? "—" : rMultiple(s.row.avg_r)} size="sm" /> },
  { id: "pf", header: "Kâr çarpanı", hint: "Brüt kâr / brüt zarar.", width: 96, num: true, hidden: true, value: (s) => s.row.profit_factor, cell: (s) => <NumText text={s.row.profit_factor === null ? "—" : num(s.row.profit_factor, 2)} size="sm" /> },
  {
    id: "seri",
    header: "Seri",
    hint: "Ardışık zarar sayısı (son 20 işlem). Kesici 6+ da devreye girer.",
    width: 64,
    num: true,
    value: (s) => s.row.consecutive_losses,
    cell: (s) =>
      s.row.consecutive_losses >= 3 ? (
        <StatusPill tone="amber" size="sm">{num(s.row.consecutive_losses, 0)}</StatusPill>
      ) : (
        <NumText text={num(s.row.consecutive_losses, 0)} size="sm" />
      ),
  },
  { id: "risk", header: "Risk/işlem", hint: "Tanımdaki risk_pct (özsermaye yüzdesi).", width: 90, num: true, hidden: true, value: (s) => s.row.risk_pct, cell: (s) => <NumText text={yuzde(s.row.risk_pct, 1)} size="sm" /> },
  { id: "sonbar", header: "Son bar", width: 96, num: true, value: (s) => (s.row.last_bar_at ? new Date(s.row.last_bar_at).getTime() : null), cell: (s) => <span className="sn-num text-[12px] text-ink-3">{relative(s.row.last_bar_at)}</span> },
  { id: "nabiz", header: "Nabız", hint: "Son yaşam sinyali; 5 dakikayı aşınca amber.", width: 100, num: true, value: (s) => s.row.heartbeat_age_s, cell: (s) => <NabizHucresi r={s.row} /> },
  { id: "egri", header: "Eğri", width: 110, cell: (s) => <Sparkline points={s.spark} width={96} height={20} color={s.color} /> },
];

function gruplariOku(): Record<Grup, boolean> {
  const varsayilan: Record<Grup, boolean> = { maraton: true, deney: true, arsiv: false };
  try {
    const ham = window.localStorage.getItem(GRUP_ANAHTAR);
    return ham ? { ...varsayilan, ...(JSON.parse(ham) as Partial<Record<Grup, boolean>>) } : varsayilan;
  } catch {
    return varsayilan;
  }
}

export default function BridgePage() {
  const live = useQuery({ queryKey: ["live-pnl"], queryFn: () => api.get<LivePnl>("/portfolio/live"), refetchInterval: 10_000 });
  const filo = useQuery({ queryKey: ["bots-fleet"], queryFn: () => api.get<FleetRow[]>("/bots/fleet"), refetchInterval: 30_000 });
  const meta = useQuery({ queryKey: ["marathon-meta"], queryFn: () => api.get<MarathonMeta>("/system/marathon"), staleTime: 300_000 });
  const attention = useAttention();
  const router = useRouter();
  const start = meta.data?.start ?? null;
  const race = useQuery({
    queryKey: ["benchmark-since", start],
    queryFn: () => api.get<Benchmark>("/portfolio/benchmark", { since: start }),
    enabled: start !== null,
    refetchInterval: 300_000,
  });
  const trades = useQuery({ queryKey: ["trades", "kopru"], queryFn: () => api.get<Trade[]>("/trades", { limit: 40 }), refetchInterval: 60_000 });

  const [gruplar, setGruplar] = useState<Record<Grup, boolean>>({ maraton: true, deney: true, arsiv: false });
  useEffect(() => {
    setGruplar(gruplariOku());
  }, []);
  const grupSec = (g: Grup, acik: boolean) =>
    setGruplar((eski) => {
      const yeni = { ...eski, [g]: acik };
      try {
        window.localStorage.setItem(GRUP_ANAHTAR, JSON.stringify(yeni));
      } catch {
        /* depolama yoksa yalnız oturum içi */
      }
      return yeni;
    });

  const fleet = useMemo<FiloSatir[]>(() => {
    const now = Date.now();
    const curveById = new Map((race.data?.bots ?? []).map((b) => [b.bot_id, b.curve.map((p) => p.value)]));
    return (filo.data ?? [])
      .filter((r) => r.state !== "DRAFT" && gruplar[(r.group as Grup) ?? "maraton"])
      .map((r) => ({
        row: r,
        spark: curveById.get(r.id) ?? [],
        blocked: !!r.entries_blocked_until && new Date(r.entries_blocked_until).getTime() > now,
        color: "",
      }))
      .sort((a, b) => (b.row.return_pct ?? -Infinity) - (a.row.return_pct ?? -Infinity))
      .map((s, i) => ({ ...s, color: PALETTE[i % PALETTE.length] }));
  }, [filo.data, race.data, gruplar]);

  const sayilar = useMemo(() => {
    const out: Record<Grup, number> = { maraton: 0, deney: 0, arsiv: 0 };
    for (const r of filo.data ?? []) if (r.state !== "DRAFT") out[(r.group as Grup) ?? "maraton"] += 1;
    return out;
  }, [filo.data]);

  const raceSeries = useMemo<CurveSeries[]>(() => {
    const running = new Set(fleet.filter((f) => f.row.group !== "arsiv").map((f) => f.row.id));
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

  const adlar = useMemo(() => new Map((filo.data ?? []).map((r) => [r.id, r.name])), [filo.data]);
  const gun = start ? Math.floor((Date.now() - new Date(start).getTime()) / 86_400_000) + 1 : null;
  const hata = filo.isError ? filo : live.isError ? live : null;
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
      {hata && (
        <ErrorBox
          message={hata.error instanceof Error ? hata.error.message : String(hata.error ?? "")}
          action={
            <button type="button" onClick={() => void hata.refetch()} className="text-[12.5px] text-brand hover:underline">
              Yeniden dene
            </button>
          }
        />
      )}
      <Reveal>
        <div className="grid gap-5 lg:grid-cols-[3fr_2fr]">
          {/* ---- Bugün: hikâye ---------------------------------------- */}
          <Panel title="Bugün">
            <div className="flex flex-col gap-2 text-[15px] leading-[1.6] text-ink">
              <p>
                {bugun.bugunku.length === 0 ? (
                  <>Bugün (UTC günü) henüz kapanan işlem yok.</>
                ) : (
                  <>
                    Bugün (UTC günü) <NumText text={num(bugun.bugunku.length, 0)} size="md" /> işlem kapandı,{" "}
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
              <Metric
                label="Özsermaye"
                value={l?.equity}
                format={(v) => money(v)}
                sub={
                  l
                    ? l.try_equity
                      ? `başlangıç ${money(l.capital)} · ayrıca ${lira(l.try_equity)} TL kolu`
                      : `başlangıç ${money(l.capital)}`
                    : "—"
                }
              />
              <Metric label="Bugün" value={l ? l.realized_today + l.unrealized_pnl : null} format={imzali} sub={l ? `${money(l.realized_today)} cebe girdi` : "—"} />
              <Metric label="Açık kâr/zarar" value={l?.unrealized_pnl} format={imzali} sub={l ? `${num(l.open_positions, 0)} pozisyon` : "—"} />
              <Metric label="Maruziyet" value={exposurePct} format={(v) => (v === null || v === undefined ? "—" : `%${num(v * 100, 1)}`)} sub={l ? `${money(l.cash)} nakit` : "—"} />
            </div>
          </Panel>
        </div>
      </Reveal>

      {/* ---- Filo: defter tablosu ------------------------------------- */}
      <Panel
        title="Filo"
        description="Her satır bir kol. Getiri katılım tabanına göre; pencereler UTC; eğri katılımdan bu yana. Sütunlar başlıktan gizlenip sıralanabilir."
        padded={false}
      >
        <DataGrid
          rows={fleet}
          columns={FILO_COLUMNS}
          rowKey={(s) => String(s.row.id)}
          storageKey="kopru-filo-v2"
          searchPlaceholder="Kol ara…"
          density="compact"
          maxHeight={720}
          defaultSort={[{ id: "getiri", desc: true }]}
          onRowClick={(s) => router.push(`/botlar/${s.row.id}`)}
          emptyTitle="Seçili grupta kol yok"
          emptyHint="Üstteki grup düğmelerinden en az birini açın."
          toolbar={
            <span className="inline-flex items-center gap-1.5">
              {(Object.keys(GRUP_ETIKET) as Grup[]).map((g) => (
                <PressToggle key={g} size="sm" pressed={gruplar[g]} onChange={(acik: boolean) => grupSec(g, acik)}>
                  {GRUP_ETIKET[g]} <span className="sn-num">{num(sayilar[g], 0)}</span>
                </PressToggle>
              ))}
            </span>
          }
          footNote={`Kaynak /bots/fleet · 30 sn'de bir tazelenir · ${num(fleet.length, 0)} kol gösteriliyor`}
        />
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
              const ad = adlar.get(t.bot_id);
              return (
                <li key={t.id} className="flex items-center gap-3 border-b border-line px-5 py-2.5 last:border-0">
                  <span className="sn-num w-24 shrink-0 truncate text-[13px] text-ink">{t.symbol}</span>
                  <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink-3">{ad ? kisa(ad) : `bot ${t.bot_id}`}</span>
                  {t.side === "SELL" && <Tag tone="down">kısa</Tag>}
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
