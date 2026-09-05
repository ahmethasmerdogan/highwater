"use client";

/**
 * MARATON v3 — lig (DESIGN-V3 §4.2).
 *
 * Manşet (damga: "N. gün / 30") · Koşu (dört figür, tek blok) · Haftalar
 * (yatay şerit, kutlama yok) · Yarış (eğri) · Lig (sıralama defteri).
 *
 * Dürüstlük: tüm sayılar maraton başlangıcından süzülür (meta `settings`
 * tablosundan gelir, panelde sabit KOPYALANMAZ); getiri tabanı sıfırlanmış
 * sermayedir (equity/capital − 1, başka hesap yok); havuz sepeti aynı
 * grafikte — hepsi birlikte yükseliyorsa yükselen piyasadır, sistem değil.
 */

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Reveal } from "uicean";
import { api, type Benchmark, type Bot, type Trade } from "@/lib/api";
import { dateOnly, dateTime, money, num, pct, pctSigned } from "@/lib/format";
import { Page, GuideSection } from "@/shell/page";
import { Delta, Metric, NumText, Panel, Tag, TextMetric } from "@/design";
import { CurveChart, type CurveSeries } from "@/design/chart";
import { DataGrid } from "@/grid/data-grid";
import type { GridColumn } from "@/grid/types";

interface MarathonMeta {
  start: string | null;
  days: number;
  stake_usd: number;
  note: string;
}

const PALETTE = [
  "var(--sn-series-1)", "var(--sn-series-2)", "var(--sn-series-3)", "var(--sn-series-4)",
  "var(--sn-series-5)", "var(--sn-brand-2)", "var(--sn-info)", "var(--sn-warn)", "var(--sn-ink-2)",
];

const kisa = (name: string) => name.replace("Havuz Momentum · ", "").replace("MEYDAN OKUMA · ", "MO · ");

interface Ozet { islem: number; kazanan: number; toplamR: number }

interface LigRow {
  sira: number;
  bot: Bot;
  getiri: number | null;
  ozet: Ozet | undefined;
  /** Maratondan sonra kurulan kol — geç katılımcı. */
  gec: boolean;
}

/* Lig defteri — sütunlar satır verisinden başka bir şeye bakmaz. */
const LIG_COLUMNS: GridColumn<LigRow>[] = [
  { id: "sira", header: "#", width: 56, num: true, pin: true, value: (r) => r.sira, cell: (r) => <NumText text={String(r.sira)} size="sm" tone={r.sira === 1 ? "var(--sn-brand)" : "var(--sn-ink-3)"} /> },
  { id: "kol", header: "Kol", width: 200, pin: true, value: (r) => kisa(r.bot.name), cell: (r) => <span className="font-medium text-ink">{kisa(r.bot.name)}</span> },
  {
    id: "pazar",
    header: "Pazar",
    width: 84,
    value: (r) => r.bot.market,
    cell: (r) => (r.bot.market === "BIST" ? <Tag tone="info">BIST</Tag> : r.bot.market === "US" ? <Tag tone="info">ABD</Tag> : <span className="text-ink-3">Kripto</span>),
  },
  { id: "bar", header: "Bar", width: 64, value: (r) => r.bot.timeframe, cell: (r) => <NumText text={r.bot.timeframe} size="sm" /> },
  {
    id: "katilim",
    header: "Katılım",
    width: 110,
    value: (r) => (r.gec ? new Date(r.bot.created_at).getTime() : 0),
    cell: (r) => (r.gec ? <NumText text={dateOnly(r.bot.created_at)} size="sm" /> : <span className="text-ink-3">başlangıç</span>),
  },
  { id: "getiri", header: "Getiri", width: 100, num: true, value: (r) => r.getiri, cell: (r) => <Delta value={r.getiri} format={(v) => pctSigned(v)} size="md" /> },
  { id: "ozsermaye", header: "Özsermaye", width: 120, num: true, value: (r) => r.bot.equity, cell: (r) => <NumText text={money(r.bot.equity)} size="sm" /> },
  { id: "islem", header: "İşlem", width: 76, num: true, value: (r) => r.ozet?.islem ?? 0, cell: (r) => <NumText text={num(r.ozet?.islem ?? 0, 0)} size="sm" /> },
  {
    id: "isabet",
    header: "İsabet",
    width: 84,
    num: true,
    value: (r) => (r.ozet && r.ozet.islem > 0 ? r.ozet.kazanan / r.ozet.islem : null),
    cell: (r) => <NumText text={r.ozet && r.ozet.islem > 0 ? pct(r.ozet.kazanan / r.ozet.islem, 0) : "—"} size="sm" />,
  },
  {
    id: "ortR",
    header: "Ortalama R",
    width: 110,
    num: true,
    hint: "Maraton işlemlerinin ortalama sonucu, risk birimi (R) cinsinden.",
    value: (r) => (r.ozet && r.ozet.islem > 0 ? r.ozet.toplamR / r.ozet.islem : null),
    cell: (r) => (r.ozet && r.ozet.islem > 0 ? <Delta value={r.ozet.toplamR / r.ozet.islem} format={(v) => num(v, 2)} size="sm" /> : <NumText text="—" size="sm" />),
  },
];

export default function MarathonPage() {
  const meta = useQuery({ queryKey: ["marathon-meta"], queryFn: () => api.get<MarathonMeta>("/system/marathon"), staleTime: 300_000 });
  const bots = useQuery({ queryKey: ["bots"], queryFn: () => api.get<Bot[]>("/bots"), refetchInterval: 30_000 });
  const router = useRouter();
  const start = meta.data?.start ?? null;
  const gunSayisi = meta.data?.days ?? 30;

  const yarris = useQuery({
    queryKey: ["benchmark-since", start],
    queryFn: () => api.get<Benchmark>("/portfolio/benchmark", { since: start }),
    enabled: start !== null,
    refetchInterval: 300_000,
  });
  const trades = useQuery({ queryKey: ["trades", "maraton"], queryFn: () => api.get<Trade[]>("/trades", { limit: 1000 }), refetchInterval: 60_000 });

  const kosanlar = useMemo(() => (bots.data ?? []).filter((b) => b.state === "PAPER_RUNNING" || b.state === "DEGRADED"), [bots.data]);

  const maratonIslemleri = useMemo(() => (start ? (trades.data ?? []).filter((t) => t.exit_time >= start) : []), [trades.data, start]);

  const perBot = useMemo(() => {
    const map = new Map<number, Ozet>();
    for (const t of maratonIslemleri) {
      const row = map.get(t.bot_id) ?? { islem: 0, kazanan: 0, toplamR: 0 };
      row.islem += 1;
      if (t.pnl > 0) row.kazanan += 1;
      row.toplamR += t.pnl_r;
      map.set(t.bot_id, row);
    }
    return map;
  }, [maratonIslemleri]);

  const startMs = start ? new Date(start).getTime() : null;
  const siralama = useMemo<LigRow[]>(
    () =>
      [...kosanlar]
        .map((b) => ({ bot: b, getiri: b.equity !== null && b.capital > 0 ? b.equity / b.capital - 1 : null }))
        .sort((a, b) => (b.getiri ?? -Infinity) - (a.getiri ?? -Infinity))
        .map((r, i) => ({
          ...r,
          sira: i + 1,
          ozet: perBot.get(r.bot.id),
          gec: startMs !== null && new Date(r.bot.created_at).getTime() > startMs,
        })),
    [kosanlar, perBot, startMs],
  );

  const gecenGun = startMs !== null ? Math.max(0, (Date.now() - startMs) / 86_400_000) : null;
  const gun = gecenGun === null ? null : Math.min(gunSayisi, Math.floor(gecenGun) + 1);
  const lider = siralama[0];
  const filoOrt = siralama.length ? siralama.reduce((s, r) => s + (r.getiri ?? 0), 0) / siralama.length : null;

  const seriler = useMemo<CurveSeries[]>(() => {
    const out: CurveSeries[] = [];
    const kosanIdler = new Set(kosanlar.map((b) => b.id));
    let i = 0;
    for (const bot of yarris.data?.bots ?? []) {
      if (!kosanIdler.has(bot.bot_id) || bot.curve.length < 2) continue;
      out.push({ label: kisa(bot.name), color: PALETTE[i % PALETTE.length], points: bot.curve.map((p) => ({ at: p.at, value: p.value * 100 })) });
      i += 1;
    }
    const sepet = yarris.data?.benchmark ?? [];
    if (sepet.length > 1) {
      const taban = sepet[0]?.value || 1;
      out.push({ label: "Havuz sepeti (al-tut)", color: "var(--sn-ink-4)", dashed: true, points: sepet.map((p) => ({ at: p.at, value: (p.value / taban) * 100 })) });
    }
    return out;
  }, [yarris.data, kosanlar]);

  return (
    <Page
      title="Maraton"
      summary={`${num(gunSayisi, 0)} günlük komutsuz koşu — ${num(kosanlar.length, 0)} kol, hepsi ${num(meta.data?.stake_usd ?? 400, 0)} $ eşdeğeriyle; bu sayfa yalnızca hakem.`}
      stamp={gun !== null ? `${num(gun, 0)}. gün / ${num(gunSayisi, 0)}` : undefined}
      guide={
        <>
          <GuideSection title="Kurallar">
            <p>Maraton boyunca sisteme komut verilmez. Her kol kendi ayarıyla koşar — bu bir yarış olduğu kadar çok kollu bir A/B ölçümüdür.</p>
          </GuideSection>
          <GuideSection title="Nasıl okunur">
            <p>
              Getiri tabanı sıfırlanan sermayedir; başka hesap yoktur. Havuz sepeti aynı grafiktedir: hepsi birlikte yükseliyorsa yükselen
              piyasadır, sistem değil. BIST kolunun tutarı ₺ cinsindendir — yüzde getiri tek ortak dildir.
            </p>
          </GuideSection>
        </>
      }
    >
      <Reveal>
        <Panel title="Koşu">
          <div className="grid grid-cols-2 gap-x-6 gap-y-4 lg:grid-cols-4">
            <Metric
              label="Gün"
              value={gun}
              format={(v) => (v === null || v === undefined ? "—" : num(v, 0))}
              sub={`${num(gunSayisi, 0)} günün · başlangıç ${start ? dateOnly(start) : "—"}`}
            />
            <TextMetric
              label="Lider"
              value={
                lider ? (
                  <span className="flex items-baseline gap-2">
                    <span className="truncate text-[17px]">{kisa(lider.bot.name)}</span>
                    <Delta value={lider.getiri} format={(v) => pctSigned(v)} size="lg" />
                  </span>
                ) : (
                  "—"
                )
              }
              sub="sıfırlanmış sermayeye göre"
            />
            <Metric
              label="Maraton işlemi"
              value={maratonIslemleri.length}
              format={(v) => num(v, 0)}
              sub={`${num(maratonIslemleri.filter((t) => t.pnl > 0).length, 0)} kârlı kapanış`}
            />
            <Metric
              label="Filo ortalaması"
              value={filoOrt}
              format={(v) => (v === null || v === undefined ? "—" : pctSigned(v))}
              sub={`${num(siralama.length, 0)} kolun basit ortalaması`}
            />
          </div>
        </Panel>
      </Reveal>

      <Panel title="Haftalar" description="Dört hafta ve bitiş. İşaret bugünü gösterir; süs yok.">
        <HaftaSeridi gecenGun={gecenGun} gunSayisi={gunSayisi} start={start} />
      </Panel>

      <Panel title="Yarış" description="Maraton başlangıcına endeksli (100 = start). Kesikli çizgi havuz sepeti.">
        {seriler.length > 0 ? (
          <CurveChart series={seriler} height={260} valueFormat={(v) => num(v, 1)} labelFormat={(at) => dateTime(at)} legend />
        ) : (
          <p className="text-[13px] text-ink-3">Eğriler bar kapanışlarıyla dolacak.</p>
        )}
      </Panel>

      {/* ---- Lig: sıralama defteri ------------------------------------ */}
      <Panel title="Lig" description="Tek dürüst ölçü: sıfırlanmış sermayeye göre yüzde getiri. Maratondan sonra kurulan kol geç katılımcıdır." padded={false}>
        <DataGrid
          rows={siralama}
          columns={LIG_COLUMNS}
          rowKey={(r) => String(r.bot.id)}
          storageKey="maraton-lig"
          searchable={false}
          density="compact"
          defaultSort={[{ id: "sira", desc: false }]}
          onRowClick={(r) => router.push(`/botlar/${r.bot.id}`)}
          emptyTitle={bots.isLoading ? "Yükleniyor…" : "Koşan kol yok"}
        />
      </Panel>
    </Page>
  );
}

/* ------------------------------------------------------------------ */
/*  Hafta şeridi — yatay, token'lı, kutlamasız                          */
/* ------------------------------------------------------------------ */

/* uicean `StageFlow` dikey ikon kartları dizer (gölge + yeşil aktif hal);
   dört hafta + bitiş için yatay bir şerit daha dürüst. */
function HaftaSeridi({ gecenGun, gunSayisi, start }: { gecenGun: number | null; gunSayisi: number; start: string | null }) {
  const duraklar = [0, 7, 14, 21, gunSayisi].map((g, i, arr) => ({
    gun: g,
    label: i === 0 ? "Başlangıç" : i === arr.length - 1 ? "Bitiş" : `${num(i, 0)}. hafta`,
    tarih: start ? dateOnly(new Date(new Date(start).getTime() + g * 86_400_000).toISOString()) : null,
  }));
  const oran = gecenGun === null ? 0 : Math.min(1, gecenGun / gunSayisi);

  return (
    <div className="px-2 pt-2 pb-1">
      <div className="relative h-1.5">
        <div className="absolute inset-y-[2px] inset-x-0 rounded-full bg-line" />
        <div className="absolute inset-y-[2px] left-0 rounded-full bg-brand" style={{ width: `${oran * 100}%` }} />
        {duraklar.map((d) => {
          const gecti = gecenGun !== null && gecenGun >= d.gun;
          return (
            <span
              key={d.gun}
              aria-hidden
              className={`absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border ${gecti ? "border-brand bg-brand" : "border-line-strong bg-surface"}`}
              style={{ left: `${(d.gun / gunSayisi) * 100}%` }}
            />
          );
        })}
        {gecenGun !== null && (
          <span aria-hidden className="absolute top-1/2 h-4 w-px -translate-x-1/2 -translate-y-1/2 bg-ink" style={{ left: `${oran * 100}%` }} />
        )}
      </div>
      <div className="relative mt-3 h-9">
        {duraklar.map((d, i) => {
          const x = (d.gun / gunSayisi) * 100;
          const hiza = i === 0 ? "translate-x-0 text-left" : i === duraklar.length - 1 ? "-translate-x-full text-right" : "-translate-x-1/2 text-center";
          return (
            <div key={d.gun} className={`absolute top-0 ${hiza}`} style={{ left: `${x}%` }}>
              <div className="text-[11.5px] font-semibold tracking-[0.06em] text-ink-3 uppercase whitespace-nowrap">{d.label}</div>
              <div className="mt-0.5 whitespace-nowrap">
                <NumText text={d.tarih ?? "—"} size="xs" />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
