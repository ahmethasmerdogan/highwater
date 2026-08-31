"use client";

/**
 * MARATON — 30 gün, 9 bot, hepsi 400 $, komut yok.
 *
 * Sahibin kuralı: maraton boyunca sisteme hiç komut verilmeyecek; bu sayfa
 * yarışın tek hakemidir. Her bot kendi konfigürasyonuyla koşar (G8 kaldıraç
 * dahil) — bu bir yarış olduğu kadar 9 kollu bir A/B ölçümüdür.
 *
 * Dürüstlük: tüm sayılar maraton başlangıcından süzülür (meta `settings`
 * tablosundan gelir, panelde sabit KOPYALANMAZ); getiri tabanı sıfırlanmış
 * sermayedir (equity/capital − 1 = maraton getirisi, başka hesap yok);
 * havuz sepeti aynı grafikte — hepsi birlikte yükseliyorsa yükselen şey
 * piyasadır, sistem değil.
 */

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Reveal } from "uicean";
import {
  api,
  type Benchmark,
  type Bot,
  type Trade,
} from "@/lib/api";
import { dateOnly, dateTime, money, num, pct, pctSigned } from "@/lib/format";
import { Page, GuideSection } from "@/shell/page";
import { Async, Delta, Metric, NumText, Panel, Tag, TextMetric } from "@/design";
import { CurveChart, type CurveSeries } from "@/design/chart";
import { MilestoneTrack } from "@/design/celebration";
import { SimpleTable, type SimpleColumn } from "@/grid/simple-table";

interface MarathonMeta {
  start: string | null;
  days: number;
  stake_usd: number;
  note: string;
}

export default function MarathonPage() {
  const meta = useQuery({
    queryKey: ["marathon-meta"],
    queryFn: () => api.get<MarathonMeta>("/system/marathon"),
    staleTime: 300_000,
  });
  const bots = useQuery({
    queryKey: ["bots"],
    queryFn: () => api.get<Bot[]>("/bots"),
    refetchInterval: 30_000,
  });
  const start = meta.data?.start ?? null;
  const gunSayisi = meta.data?.days ?? 30;

  const yarris = useQuery({
    queryKey: ["benchmark-since", start],
    queryFn: () => api.get<Benchmark>("/portfolio/benchmark", { since: start }),
    enabled: start !== null,
    refetchInterval: 300_000,
  });
  const trades = useQuery({
    queryKey: ["trades", "maraton"],
    queryFn: () => api.get<Trade[]>("/trades", { limit: 1000 }),
    refetchInterval: 60_000,
  });

  const kosanlar = useMemo(
    () => (bots.data ?? []).filter((b) => b.state === "PAPER_RUNNING" || b.state === "DEGRADED"),
    [bots.data],
  );

  const maratonIslemleri = useMemo(() => {
    if (!start) return [];
    return (trades.data ?? []).filter((t) => t.exit_time >= start);
  }, [trades.data, start]);

  const perBot = useMemo(() => {
    const map = new Map<number, { islem: number; kazanan: number; toplamR: number }>();
    for (const t of maratonIslemleri) {
      const row = map.get(t.bot_id) ?? { islem: 0, kazanan: 0, toplamR: 0 };
      row.islem += 1;
      if (t.pnl > 0) row.kazanan += 1;
      row.toplamR += t.pnl_r;
      map.set(t.bot_id, row);
    }
    return map;
  }, [maratonIslemleri]);

  const siralama = useMemo(() => {
    return [...kosanlar]
      .map((b) => ({
        bot: b,
        getiri: b.equity !== null && b.capital > 0 ? b.equity / b.capital - 1 : null,
      }))
      .sort((a, b) => (b.getiri ?? -Infinity) - (a.getiri ?? -Infinity));
  }, [kosanlar]);

  const gecenGun = start ? Math.max(0, (Date.now() - new Date(start).getTime()) / 86_400_000) : null;
  const lider = siralama[0];

  const seriler = useMemo<CurveSeries[]>(() => {
    const out: CurveSeries[] = [];
    const kosanIdler = new Set(kosanlar.map((b) => b.id));
    const paleta = [
      "var(--sn-series-1)",
      "var(--sn-series-2)",
      "var(--sn-series-3)",
      "var(--sn-series-4)",
      "var(--sn-series-5)",
      "var(--sn-brand-2)",
      "var(--sn-info)",
      "var(--sn-warn)",
      "var(--sn-ink-2)",
    ];
    let i = 0;
    for (const bot of yarris.data?.bots ?? []) {
      if (!kosanIdler.has(bot.bot_id) || bot.curve.length < 2) continue;
      out.push({
        label: bot.name.replace("Havuz Momentum · ", "").replace("MEYDAN OKUMA · ", "MO · "),
        color: paleta[i % paleta.length],
        points: bot.curve.map((p) => ({ at: p.at, value: p.value * 100 })),
      });
      i += 1;
    }
    const sepet = yarris.data?.benchmark ?? [];
    if (sepet.length > 1) {
      const taban = sepet[0]?.value || 1;
      out.push({
        label: "Havuz sepeti (al-tut)",
        color: "var(--sn-ink-4)",
        dashed: true,
        points: sepet.map((p) => ({ at: p.at, value: (p.value / taban) * 100 })),
      });
    }
    return out;
  }, [yarris.data, kosanlar]);

  return (
    <Page
      title="Maraton"
      summary={`30 günlük komutsuz koşu — 9 bot, hepsi ${num(meta.data?.stake_usd ?? 400, 0)} $ eşdeğeriyle. Sistem kendi başına; bu sayfa yalnızca hakem.`}
      guide={
        <>
          <GuideSection title="Kurallar">
            <p>
              Maraton boyunca sisteme komut verilmez. Her bot kendi konfigürasyonuyla koşar —
              bu 9 kollu bir A/B ölçümüdür: hangi ayar ailesi ne getiriyor, defter söyleyecek.
            </p>
          </GuideSection>
          <GuideSection title="Nasıl okunur">
            <p>
              Getiri tabanı sıfırlanan sermayedir; başka hesap yoktur. Havuz sepeti aynı
              grafiktedir: hepsi birlikte yükseliyorsa yükselen piyasadır, sistem değil.
              BIST botunun tutarı ₺ cinsindendir (400 $ × dondurulmuş kur 48,08) — yüzde
              getiri tek ortak dildir.
            </p>
          </GuideSection>
        </>
      }
    >
      <Reveal>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Metric
            animateOnMount
            label="Gün"
            value={gecenGun}
            format={(v) => (v === null || v === undefined ? "—" : num(Math.floor(v), 0))}
            sub={`${num(gunSayisi, 0)} günün · başlangıç ${start ? dateOnly(start) : "—"}`}
          />
          <TextMetric
            label="Lider"
            value={
              lider ? (
                <span className="flex items-baseline gap-2">
                  <span className="truncate" style={{ fontSize: "var(--sn-t-title)" }}>
                    {lider.bot.name.replace("Havuz Momentum · ", "")}
                  </span>
                  <Delta value={lider.getiri} format={(v) => pctSigned(v)} size="md" />
                </span>
              ) : (
                "—"
              )
            }
            sub="sıfırlanmış sermayeye göre"
          />
          <Metric
            animateOnMount
            label="Maraton işlemi"
            value={maratonIslemleri.length}
            format={(v) => num(v, 0)}
            sub={`${num(maratonIslemleri.filter((t) => t.pnl > 0).length, 0)} kârlı kapanış`}
          />
          <Metric
            animateOnMount
            label="Filo ortalaması"
            value={
              siralama.length
                ? siralama.reduce((s, r) => s + (r.getiri ?? 0), 0) / siralama.length
                : null
            }
            format={(v) => (v === null || v === undefined ? "—" : pctSigned(v))}
            sub="9 botun basit ortalaması"
          />
        </div>
      </Reveal>

      <Panel
        title="Yol"
        description="Haftalık işaretler. Kutlama yalnız gerçek eşiklere — süs değil."
      >
        <MilestoneTrack
          progress={gecenGun === null ? null : gecenGun / gunSayisi}
          storageKey="maraton-hafta"
          milestones={[
            { label: "Başlangıç", at: 0 },
            { label: "1. hafta", at: 7 / gunSayisi },
            { label: "2. hafta", at: 14 / gunSayisi },
            { label: "3. hafta", at: 21 / gunSayisi },
            { label: "Bitiş", at: 1 },
          ]}
        />
      </Panel>

      <Panel
        title="Yarış"
        description="Tüm eğriler maraton başlangıcına tabanlanmış (100 = start). Kesikli çizgi havuz sepetidir."
      >
        {seriler.length > 0 ? (
          <CurveChart
            series={seriler}
            height={260}
            valueFormat={(v) => num(v, 1)}
            labelFormat={(at) => dateTime(at)}
          />
        ) : (
          <p style={{ fontSize: "var(--sn-t-body)", color: "var(--sn-ink-3)" }}>
            Eğriler ilk bar kapanışlarıyla dolmaya başlayacak.
          </p>
        )}
      </Panel>

      <Panel title="Sıralama" description="Tek dürüst ölçü: sıfırlanmış sermayeye göre yüzde getiri." padded={false}>
        <Async
          query={bots}
          empty={{ title: "Bot yok", hint: "Koşacak bot bulunamadı." }}
        >
          {() => (
            <div className="sn-scroll overflow-x-auto">
              <SimpleTable
                rows={siralama.map((r, i) => ({ ...r, sira: i + 1 }))}
                rowKey={(r) => r.bot.id}
                columns={SIRALAMA_KOLONLARI(perBot)}
              />
            </div>
          )}
        </Async>
      </Panel>
    </Page>
  );
}

type Satir = { sira: number; bot: Bot; getiri: number | null };

function SIRALAMA_KOLONLARI(
  perBot: Map<number, { islem: number; kazanan: number; toplamR: number }>,
): SimpleColumn<Satir>[] {
  return [
    {
      header: "#",
      num: true,
      cell: (r) => (
        <span className="sn-num" style={{ fontSize: "var(--sn-t-body)", color: r.sira === 1 ? "var(--sn-brand)" : "var(--sn-ink-3)" }}>
          {r.sira}
        </span>
      ),
    },
    {
      header: "Bot",
      cell: (r) => (
        <span className="flex items-center gap-1.5">
          <span style={{ fontSize: "var(--sn-t-body)", color: "var(--sn-ink)" }}>
            {r.bot.name}
          </span>
          {r.bot.market === "BIST" && <Tag tone="info">BIST</Tag>}
          {r.bot.market === "US" && <Tag tone="info">ABD</Tag>}
        </span>
      ),
    },
    { header: "Bar", cell: (r) => <span className="sn-num" style={{ fontSize: "var(--sn-t-caption)", color: "var(--sn-ink-2)" }}>{r.bot.timeframe}</span> },
    {
      header: "Getiri",
      num: true,
      cell: (r) =>
        r.getiri === null ? (
          <NumText text="—" size="sm" />
        ) : (
          <Delta value={r.getiri} format={(v) => pctSigned(v)} size="sm" />
        ),
    },
    {
      header: "Özsermaye",
      num: true,
      cell: (r) => <NumText text={money(r.bot.equity)} size="sm" />,
    },
    {
      header: "İşlem",
      num: true,
      cell: (r) => <NumText text={num(perBot.get(r.bot.id)?.islem ?? 0, 0)} size="sm" />,
    },
    {
      header: "İsabet",
      num: true,
      cell: (r) => {
        const s = perBot.get(r.bot.id);
        return (
          <NumText
            text={s && s.islem > 0 ? pct(s.kazanan / s.islem, 0) : "—"}
            size="sm"
          />
        );
      },
    },
    {
      header: "Ortalama R",
      num: true,
      cell: (r) => {
        const s = perBot.get(r.bot.id);
        return s && s.islem > 0 ? (
          <Delta value={s.toplamR / s.islem} format={(v) => num(v, 2)} size="sm" />
        ) : (
          <NumText text="—" size="sm" />
        );
      },
    },
  ];
}
