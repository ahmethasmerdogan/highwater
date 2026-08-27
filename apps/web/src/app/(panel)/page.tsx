"use client";

/**
 * Panel — sistemin tek ekranda özeti.
 *
 * Sıralama bilinçli: önce **engel var mı** (uyarı şeridi), sonra **para
 * nerede** (metrikler), sonra **işe yarıyor mu** (eğri + kıyas), en sonda
 * **ne oluyor** (pozisyonlar, botlar, uyarılar).
 *
 * Kıyas eğrisi opsiyonel bir süs değil: sistemin birincil çıktısı ölçümdür.
 * Botların eğrisi havuzun eşit ağırlıklı al-ve-tut sepetini geçemiyorsa,
 * seçim yapmak değer katmıyor demektir ve panel bunu saklamaz.
 */

import Link from "next/link";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  api,
  type Benchmark,
  type LivePnl,
  type PortfolioEquity,
  type Position,
  type SystemStatus,
  type Trade,
} from "@/lib/api";
import { money, num, pct, pctSigned, price, relative, time } from "@/lib/format";
import { humanizeEvent, type Severity } from "@/lib/humanize";
import { useLive } from "@/lib/ws";
import { Page, GuideSection } from "@/shell/page";
import { Button, Dot, Empty, Panel, Tag } from "@/design/primitives";
import { ErrorBox, LoadingRows } from "@/design/state";
import { InfoDot } from "@/design/explain";
import { CelebrationReveal, SuccessCard } from "@/design/celebration";
import { IStar, ITrendUp, IWallet, IZap, Reveal } from "uicean";
import { Delta, Metric, NumCell, NumText } from "@/design/numeric";
import { CurveChart, type CurveSeries } from "@/design/chart";
import { Bar } from "@/design/viz";
import { DataGrid } from "@/grid/data-grid";
import type { GridColumn } from "@/grid/types";

export default function DashboardPage() {
  const { data: status } = useQuery({
    queryKey: ["system-status"],
    queryFn: () => api.get<SystemStatus>("/system/status"),
    refetchInterval: 15_000,
  });

  const { data: live } = useQuery({
    queryKey: ["live-pnl"],
    queryFn: () => api.get<LivePnl>("/portfolio/live"),
    refetchInterval: 10_000,
  });

  const { data: equity } = useQuery({
    queryKey: ["equity"],
    queryFn: () => api.get<PortfolioEquity>("/portfolio/equity"),
    refetchInterval: 60_000,
  });

  const { data: benchmark } = useQuery({
    queryKey: ["benchmark"],
    queryFn: () => api.get<Benchmark>("/portfolio/benchmark"),
    refetchInterval: 120_000,
  });

  const positionsQuery = useQuery({
    queryKey: ["positions", "open"],
    queryFn: () => api.get<Position[]>("/positions", { status_filter: "OPEN" }),
    refetchInterval: 20_000,
  });
  const positions = positionsQuery.data ?? [];

  const { events } = useLive();

  const curves = useMemo<CurveSeries[]>(() => {
    const out: CurveSeries[] = [];

    /* `equity.total` BURAYA GİREMEZ. O alan botların mutlak toplam
       özsermayesidir ve yeni bot eklendikçe sermaye enjeksiyonuyla
       basamaklanır — 15.000'den 33.653'e çıkışının çoğu getiri değil, eklenen
       sermayedir. Grafik her seriyi ilk noktasına göre 100'e çektiği için bu
       seri 224'e tırmanıyor, kıyas 115'te kalıyordu ve panel "piyasayı 109
       puan geçtik" diyordu. Gerçekte botların hepsi kıyasın altındaydı.
       Sayfanın kendi kılavuzu "kıyası geçemiyorsanız seçim değer katmıyor"
       diyor; grafik tam o soruyu ters cevaplıyordu.

       Doğru veri `benchmark.bots[]`: uç her botu kendi ilk noktasına göre
       zaten normalize ediyor, yani kıyasla aynı tabanda. */
    const oranlar = benchmark?.bots ?? [];

    /* Sermaye ağırlıklı bileşik: portföyün gerçek getirisi, botların
       getirilerinin sermayeyle ağırlıklı ortalamasıdır. Ağırlık her botun
       başlangıç özsermayesinden gelir. Eşit ağırlık almak, 416 USDT'lik
       meydan okuma botunu 5.000 USDT'lik botla eşitler ve tabloyu çarpıtır. */
    const agirlik = new Map<number, number>();
    for (const bot of equity?.bots ?? []) {
      const ilk = bot.curve[0]?.equity;
      if (ilk && ilk > 0) agirlik.set(bot.bot_id, ilk);
    }

    /* İşlem yapmamış botlar dışarıda: eğrileri sabit 1,0'dır ve bileşiği
       sulandırmaktan başka bir şey yapmazlar. */
    const calisan = oranlar.filter((bot) => {
      const w = agirlik.get(bot.bot_id);
      return Boolean(w) && bot.curve.some((point) => point.value !== 1);
    });

    if (calisan.length > 0) {
      const damgalar = new Map<string, { pay: number; toplam: number }>();
      for (const bot of calisan) {
        const w = agirlik.get(bot.bot_id) ?? 0;
        for (const point of bot.curve) {
          const hucre = damgalar.get(point.at) ?? { pay: 0, toplam: 0 };
          hucre.pay += point.value * w;
          hucre.toplam += w;
          damgalar.set(point.at, hucre);
        }
      }
      const points = [...damgalar.entries()]
        .filter(([, hucre]) => hucre.toplam > 0)
        .map(([at, hucre]) => ({ at, value: hucre.pay / hucre.toplam }))
        .sort((a, b) => a.at.localeCompare(b.at));
      if (points.length > 0) {
        out.push({
          label: `Botlar (sermaye ağırlıklı, ${calisan.length})`,
          color: "var(--sn-series-1)",
          points,
        });
      }
    }

    /* Meydan okuma botu ayrı çizilir: bileşiğin içinde kaybolan ama sahibin
       asıl izlediği eğri odur. */
    const meydan = calisan.find((bot) => bot.name.toUpperCase().includes("MEYDAN OKUMA"));
    if (meydan) {
      out.push({
        label: "Meydan okuma",
        color: "var(--sn-series-3)",
        points: meydan.curve.map((point) => ({ at: point.at, value: point.value })),
      });
    }

    if (benchmark?.benchmark?.length) {
      out.push({
        /* Sepet, penceresinin BAŞLANGIÇ havuzundan kurulur (point-in-time,
           hayatta kalma yanlılığı yok) — o gün 15 sembol vardı, bugün 115.
           Bunu söylememek "bugünkü havuzun sepeti" sanılmasına yol açıyordu. */
        label: `Havuz sepeti · ${benchmark.universe_size ?? "?"} sembol (başlangıç havuzu, al ve tut)`,
        color: "var(--sn-series-2)",
        dashed: true,
        points: benchmark.benchmark.map((point) => ({ at: point.at, value: point.value })),
      });
    }

    return out;
  }, [equity, benchmark]);

  /* Dikkat çeken son olaylar — bilgi düzeyindekiler panele çıkmaz. */
  const alerts = useMemo(() => {
    /* Aynı devre kesici uyarısı altı kez üst üste basılıyordu. Aynı
       kind+bot için tekille ve "× N" sayacı taşı; en yeni kayıt kalır. */
    const uyarilar = events
      .map((event) => ({ event, human: humanizeEvent(event.kind, event.level, event.payload) }))
      .filter((entry) => entry.human.severity === "warn" || entry.human.severity === "error");
    const gruplu = new Map<string, { event: (typeof uyarilar)[number]["event"]; human: (typeof uyarilar)[number]["human"]; count: number }>();
    for (const entry of uyarilar) {
      const key = `${entry.event.kind}:${entry.event.bot_id ?? ""}`;
      const mevcut = gruplu.get(key);
      if (mevcut) {
        mevcut.count += 1;
      } else {
        gruplu.set(key, { ...entry, count: 1 });
      }
    }
    return Array.from(gruplu.values()).slice(0, 6);
  }, [events]);

  const stalePrices = live?.stale_symbols ?? [];
  const exposurePct = live && live.equity > 0 ? live.exposure / live.equity : null;

  return (
    <Page
      title="Panel"
      summary="Sistemin şu anki durumu: para nerede, botlar ne yapıyor, dikkat edilmesi gereken bir şey var mı."
      guide={
        <>
          <GuideSection title="Ne gösteriyor">
            <p>
              Tüm botların toplam durumu, özsermaye eğrisi, açık pozisyonlar ve son uyarılar.
              Sistemde canlı para yoktur — tüm emirler dahili kağıt motorundan geçer, veriler ise
              gerçektir.
            </p>
          </GuideSection>
          <GuideSection title="Nasıl okunur">
            <p>
              <strong>Özsermaye</strong> botların toplam değeridir: nakit artı açık pozisyonların
              güncel karşılığı.
            </p>
            <p>
              <strong>Gerçekleşmemiş</strong> kâr/zarar açık pozisyonlardan gelir ve pozisyon
              kapanana kadar değişir — cebe girmiş sayılmaz.
            </p>
            <p>
              Eğri grafiğinde botların <strong>getirisi</strong> kıyas sepetiyle birlikte
              çizilir; hepsi 100 tabanına endekslenir. Bot eğrisi sermaye ağırlıklı bileşiktir
              — yani eklenen sermaye getiri gibi görünmez. Kıyası geçemiyorsanız, seçim yapmak
              değer katmıyor demektir.
            </p>
          </GuideSection>
          <GuideSection title="Ne yapabilirim">
            <p>
              Bir sayı beklediğinizden farklıysa ilgili sayfaya gidin: pozisyonlar için
              Pozisyonlar, botların neden karar aldığını görmek için Loglar, puanlamanın işe
              yarayıp yaramadığı için Kalibrasyon.
            </p>
          </GuideSection>
        </>
      }
    >
      {status && <SystemBanner status={status} stalePrices={stalePrices} />}

      <Reveal>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric
          animateOnMount
          label="Özsermaye"
          info={<InfoDot text="Nakit + açık pozisyonların anlık değeri. Sistemin şu anki toplam parası." />}
          value={live?.equity}
          format={(value) => money(value)}
          accent="var(--sn-brand-solid)"
          delta={
            live ? (
              <Delta value={live.total_return} format={(value) => pctSigned(value)} size="sm" />
            ) : undefined
          }
          sub={live ? `başlangıç ${money(live.capital)}` : "yükleniyor…"}
        />
        <Metric
          animateOnMount
          label="Bugün gerçekleşen"
          info={<InfoDot text="Bugün KAPANAN işlemlerin net toplamı — cebe girdi, artık fiyatla değişmez." />}
          value={live?.realized_today}
          format={(value) => money(value)}
          accent={
            live && live.realized_today !== 0
              ? live.realized_today > 0
                ? "var(--sn-up)"
                : "var(--sn-down)"
              : undefined
          }
          sub="kapanmış işlemler — cebe girdi"
        />
        <Metric
          animateOnMount
          label="Gerçekleşmemiş"
          info={<InfoDot text="Açık pozisyonların anlık kâr/zararı. Pozisyon kapanana kadar her barla değişir — cebe girmiş sayılmaz." />}
          value={live?.unrealized_pnl}
          format={(value) => money(value)}
          accent={
            live && live.unrealized_pnl !== 0
              ? live.unrealized_pnl > 0
                ? "var(--sn-up)"
                : "var(--sn-down)"
              : undefined
          }
          sub={live ? `${num(live.open_positions, 0)} açık pozisyon` : undefined}
        />
        <Metric
          animateOnMount
          label="Maruziyet"
          info={<InfoDot id="maruziyet" />}
          value={exposurePct}
          format={(value) => (value === null || value === undefined ? "—" : pct(value, 2))}
          sub={
            live
              ? `${money(live.exposure)} pozisyonda · ${money(live.cash)} nakit`
              : undefined
          }
        />
      </div>
      </Reveal>

      <GununKarnesi />

      <Panel
        title="Özsermaye ve kıyas"
        description="Botların eğrisi, havuzun eşit ağırlıklı al-ve-tut sepetiyle birlikte. İkisi de 100 tabanına endekslenmiştir; böylece farklı başlangıç tutarları karşılaştırılabilir."
        actions={
          <Link href="/kalibrasyon">
            <Button size="sm" variant="quiet">
              Kalibrasyon
            </Button>
          </Link>
        }
      >
        <CurveChart
          series={curves}
          normalize
          height={280}
          valueFormat={(value) => num(value, 1)}
          emptyText="Henüz eğri yok — botlar çalıştıkça özsermaye noktaları birikir."
        />
        {/* Hüküm sunucuda yazılır ve örneklem yetersizse bunu ZATEN söyler.
            Panelin ayrıca "örneklem yetersiz" cümlesi eklemesi aynı uyarıyı
            arka arkaya iki kez basıyordu. Yetersizlik burada yalnızca RENK
            olarak taşınır. */}
        {benchmark?.verdict && (
          <p
            className="mt-3 flex items-start gap-2"
            style={{ fontSize: "var(--sn-t-caption)", lineHeight: 1.5 }}
          >
            <span className="mt-1.5">
              <Dot tone={benchmark.sufficient === false ? "warn" : "info"} />
            </span>
            <span
              style={{
                color: benchmark.sufficient === false ? "var(--sn-warn)" : "var(--sn-ink-2)",
              }}
            >
              {benchmark.verdict}
            </span>
          </p>
        )}
      </Panel>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <BotSummary live={live} />
        <AlertList
          alerts={alerts}
          botAdlari={new Map((live?.bots ?? []).map((bot) => [bot.bot_id, bot.name]))}
        />
      </div>

      <OpenPositions rows={positions} query={positionsQuery} />
    </Page>
  );
}

/* ------------------------------------------------------------------ */
/*  Günün karnesi — başarı kartları                                    */
/* ------------------------------------------------------------------ */

/**
 * Bugün KAPANAN işlemlerin karnesi. Kutlama sözleşmesi: yalnızca
 * gerçekleşmiş kâr ışıldar; kayıp günü sakin ve net gösterilir, saklanmaz.
 */
function GununKarnesi() {
  const trades = useQuery({
    queryKey: ["trades", "karne"],
    queryFn: () => api.get<Trade[]>("/trades", { limit: 300 }),
    refetchInterval: 60_000,
  });

  const karne = useMemo(() => {
    const bugun = new Date();
    const ayniGun = (iso: string) => {
      const d = new Date(iso);
      return (
        d.getFullYear() === bugun.getFullYear() &&
        d.getMonth() === bugun.getMonth() &&
        d.getDate() === bugun.getDate()
      );
    };
    const rows = (trades.data ?? []).filter((t) => ayniGun(t.exit_time));
    if (rows.length === 0) return null;
    const net = rows.reduce((s, t) => s + t.pnl, 0);
    const kazanan = rows.filter((t) => t.pnl > 0);
    const enIyi = rows.reduce((best, t) => (t.pnl > best.pnl ? t : best), rows[0]);
    /* Seri: en yeni işlemden geriye, ilk kayba kadar. */
    const sirali = [...(trades.data ?? [])].sort((a, b) =>
      a.exit_time < b.exit_time ? 1 : -1,
    );
    let seri = 0;
    for (const t of sirali) {
      if (t.pnl > 0) seri += 1;
      else break;
    }
    return {
      islem: rows.length,
      net,
      kazanan: kazanan.length,
      isabet: kazanan.length / rows.length,
      enIyi,
      seri,
    };
  }, [trades.data]);

  if (trades.isError) return null; /* karne süstür; hatası şerit açmaz */
  if (!karne) {
    return (
      <Panel
        title="Günün karnesi"
        description="Bugün kapanan işlemler. Kutlama yalnızca cebe gireni sayar — açık pozisyonların kâğıt üstü değeri burada yoktur."
      >
        <p style={{ fontSize: "var(--sn-t-body)", color: "var(--sn-ink-3)" }}>
          Bugün henüz kapanan işlem yok. Botlar bar kapanışlarında karar veriyor;
          kapanan ilk işlem burada kartıyla görünecek.
        </p>
      </Panel>
    );
  }

  const kayipGunu = karne.net < 0;
  return (
    <Panel
      title="Günün karnesi"
      description="Bugün kapanan işlemler. Kutlama yalnızca cebe gireni sayar — açık pozisyonların kâğıt üstü değeri burada yoktur."
    >
      <CelebrationReveal>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <SuccessCard
            icon={<IWallet size={16} />}
            label="Bugün cebe giren"
            value={karne.net}
            format={(v) => `${(v ?? 0) > 0 ? "+" : ""}${money(v)}`}
            tone={karne.net > 0 ? "win" : karne.net < 0 ? "loss" : "flat"}
            sub={`${num(karne.islem, 0)} kapanan işlem`}
          />
          <SuccessCard
            icon={<IStar size={16} />}
            label="En iyi işlem"
            value={karne.enIyi.pnl}
            format={(v) => `${(v ?? 0) > 0 ? "+" : ""}${money(v)}`}
            tone={karne.enIyi.pnl > 0 ? "win" : "loss"}
            sub={`${karne.enIyi.symbol} · ${karne.enIyi.pnl_r > 0 ? "+" : ""}${num(karne.enIyi.pnl_r, 2)}R`}
          />
          <SuccessCard
            icon={<ITrendUp size={16} />}
            label="İsabet"
            value={karne.isabet}
            format={(v) => pct(v, 0)}
            tone={karne.isabet >= 0.5 ? "win" : "flat"}
            sub={`${num(karne.kazanan, 0)} / ${num(karne.islem, 0)} işlem kârla kapandı`}
          />
          <SuccessCard
            icon={<IZap size={16} />}
            label="Kazanç serisi"
            value={karne.seri}
            format={(v) => num(v, 0)}
            tone={karne.seri >= 3 ? "win" : "flat"}
            sub={
              karne.seri > 0
                ? "üst üste kârlı kapanış"
                : "seri kırıldı — sıradaki işlem yeni başlangıç"
            }
          />
        </div>
      </CelebrationReveal>
      {kayipGunu && (
        <p
          className="mt-3 pl-3"
          style={{
            borderLeft: "2px solid var(--sn-down)",
            fontSize: "var(--sn-t-caption)",
            color: "var(--sn-ink-2)",
          }}
        >
          Kayıp günü — saklamıyoruz: net {money(karne.net)} USDT. Kesicilerin durumu Loglar
          sayfasında; sistemin ölçümü Kalibrasyon sayfasında.
        </p>
      )}
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/*  Uyarı şeridi                                                       */
/* ------------------------------------------------------------------ */

/**
 * Sistemin çalışmasını engelleyen durumları en üstte ve açıkça söyler.
 *
 * Boş havuz ya da bayat veri sessizce geçilirse kullanıcı "bot neden işlem
 * açmıyor" sorusunun cevabını aramakla vakit kaybeder.
 */
function SystemBanner({ status, stalePrices }: { status: SystemStatus; stalePrices: string[] }) {
  const problems: { text: string; tone: Severity }[] = [];

  if (status.universe_size === 0) {
    problems.push({
      tone: "error",
      text: "Havuz boş — işlem yapılabilir coin yok, hiçbir bot pozisyon açamaz.",
    });
  }
  if (status.market_data_stale) {
    problems.push({
      tone: "error",
      text: "Piyasa verisi bayat. Eski fiyatla karar almamak için girişler durduruldu.",
    });
  }
  if (status.total_bots > 0 && status.running_bots === 0) {
    problems.push({
      tone: "warn",
      text: `${status.total_bots} bot kurulu ama hiçbiri çalışmıyor. Çalışmayan bot karar almaz.`,
    });
  }
  if (stalePrices.length > 0) {
    problems.push({
      tone: "warn",
      text: `${stalePrices.length} sembolün güncel fiyatı bilinmiyor (${stalePrices
        .slice(0, 3)
        .join(", ")}${stalePrices.length > 3 ? "…" : ""}). Gerçekleşmemiş kâr/zarar eksik hesaplanmış olabilir.`,
    });
  }
  if (status.alarms > 0) {
    /* Uç bu alanı hep gönderiyordu; panel hiç okumuyordu. */
    problems.push({
      tone: "warn",
      text: `${status.alarms} devre kesici alarmı etkin — ayrıntı Loglar sayfasında.`,
    });
  }

  if (problems.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      {problems.map((problem) => (
        <div
          key={problem.text}
          className="flex items-start gap-2.5 rounded-[var(--sn-r-md)] px-4 py-3"
          style={{
            background: problem.tone === "error" ? "var(--sn-down-bg)" : "var(--sn-warn-bg)",
            border: `1px solid color-mix(in oklab, ${
              problem.tone === "error" ? "var(--sn-down)" : "var(--sn-warn)"
            } 20%, transparent)`,
            fontSize: "var(--sn-t-body)",
          }}
        >
          <span className="mt-1.5">
            <Dot tone={problem.tone === "error" ? "down" : "warn"} />
          </span>
          <span style={{ color: "var(--sn-ink)" }}>{problem.text}</span>
          <Link
            href="/loglar"
            className="ml-auto shrink-0 underline underline-offset-2"
            style={{ fontSize: "var(--sn-t-caption)", color: "var(--sn-ink-2)" }}
          >
            Loglara bak
          </Link>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Botlar                                                             */
/* ------------------------------------------------------------------ */

function BotSummary({ live }: { live: LivePnl | undefined }) {
  const bots = live?.bots ?? [];

  return (
    <Panel
      title="Botlar"
      description="Her botun kendi özsermayesi ve getirisi."
      actions={
        <Link href="/botlar">
          <Button size="sm" variant="quiet">
            Tümü
          </Button>
        </Link>
      }
      padded={false}
    >
      {bots.length === 0 ? (
        <Empty
          title="Çalışan bot yok"
          hint="Bir bot kurup başlatana kadar sistem karar almaz ve pozisyon açmaz."
          action={
            <Link href="/botlar">
              <Button size="sm" variant="primary">
                Botlara git
              </Button>
            </Link>
          }
        />
      ) : (
        <ul>
          {bots.map((bot) => (
            <li
              key={bot.bot_id}
              className="flex items-center gap-3 px-4 py-2.5"
              style={{ borderTop: "1px solid var(--sn-hairline)" }}
            >
              <Dot
                tone={
                  bot.state === "PAPER_RUNNING"
                    ? "up"
                    : bot.state === "ERROR" || bot.state === "DEGRADED"
                      ? "down"
                      : bot.state === "STOPPED" || bot.state === "DRAFT"
                        ? "neutral"
                        : "warn"
                }
              />
              <Link
                href={`/botlar/${bot.bot_id}`}
                className="min-w-0 flex-1 truncate hover:underline"
                style={{ fontSize: "var(--sn-t-body)", color: "var(--sn-ink)" }}
              >
                {bot.name}
              </Link>
              {bot.open_positions > 0 && (
                <Tag tone="neutral" mono>
                  {bot.open_positions} poz
                </Tag>
              )}
              <NumText text={money(bot.equity)} size="sm" />
              <span className="w-[76px] text-right">
                <Delta value={bot.total_return} format={(value) => pctSigned(value)} size="sm" />
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/*  Uyarılar                                                           */
/* ------------------------------------------------------------------ */

function AlertList({
  alerts,
  botAdlari,
}: {
  alerts: {
    event: { at: string; payload: Record<string, unknown>; bot_id: number | null };
    human: { title: string; detail?: string; severity: Severity };
    count: number;
  }[];
  botAdlari: Map<number, string>;
}) {
  return (
    <Panel
      title="Dikkat gerektirenler"
      description="Son uyarı ve hatalar. Bilgi düzeyindeki kayıtlar buraya çıkmaz."
      actions={
        <Link href="/loglar">
          <Button size="sm" variant="quiet">
            Tüm loglar
          </Button>
        </Link>
      }
      padded={false}
    >
      {alerts.length === 0 ? (
        <Empty
          title="Şu an dikkat gerektiren bir şey yok"
          hint="Uyarı ve hatalar oluştuğu anda buraya düşer; sayfayı yenilemek gerekmez."
        />
      ) : (
        <ul>
          {alerts.map(({ event, human, count }, index) => (
            <li
              key={`${event.at}-${index}`}
              className="flex gap-3 px-4 py-2.5"
              style={{ borderTop: "1px solid var(--sn-hairline)" }}
            >
              <span className="mt-1.5">
                <Dot tone={human.severity === "error" ? "down" : "warn"} />
              </span>
              <div className="min-w-0 flex-1">
                <div
                  className="flex items-center gap-2"
                  style={{ fontSize: "var(--sn-t-body)", color: "var(--sn-ink)" }}
                >
                  <span className="min-w-0 truncate">{human.title}</span>
                  {count > 1 && (
                    <Tag tone="neutral" mono>
                      × {count}
                    </Tag>
                  )}
                  {event.bot_id !== null && (
                    <Link
                      href={`/botlar/${event.bot_id}`}
                      className="shrink-0 hover:underline"
                      style={{ fontSize: "var(--sn-t-caption)", color: "var(--sn-brand)" }}
                    >
                      {botAdlari.get(event.bot_id) ?? `Bot ${event.bot_id}`}
                    </Link>
                  )}
                </div>
                <div
                  className="truncate"
                  style={{ fontSize: "var(--sn-t-caption)", color: "var(--sn-ink-3)" }}
                >
                  {typeof event.payload?.message === "string"
                    ? event.payload.message
                    : (human.detail ?? "")}
                </div>
              </div>
              <span
                className="sn-num shrink-0"
                style={{ fontSize: "var(--sn-t-micro)", color: "var(--sn-ink-3)" }}
              >
                {time(event.at)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/*  Açık pozisyonlar                                                   */
/* ------------------------------------------------------------------ */

function OpenPositions({
  rows,
  query,
}: {
  rows: Position[];
  /* Boş tablo tek başına "pozisyon yok" demez — "veri gelmedi" de olabilir.
     İkisini aynı göstermek, veri yokluğunu ölçüm sonucu gibi sunar: API
     kapalıyken panel 11 açık pozisyonu "açık pozisyon yok" diye anlatır. */
  query: { isLoading: boolean; isError: boolean; error?: unknown };
}) {
  const columns = useMemo<GridColumn<Position>[]>(
    () => [
      {
        id: "symbol",
        header: "Sembol",
        width: 130,
        pin: true,
        value: (row) => row.symbol,
        search: (row) => row.symbol,
        cell: (row) => (
          <span className="sn-num" style={{ fontSize: "var(--sn-t-body)", color: "var(--sn-ink)" }}>
            {row.symbol}
          </span>
        ),
      },
      {
        id: "entry_time",
        header: "Süre",
        width: 100,
        value: (row) => new Date(row.entry_time).getTime(),
        cell: (row) => (
          <span style={{ fontSize: "var(--sn-t-caption)", color: "var(--sn-ink-2)" }}>
            {relative(row.entry_time)}
          </span>
        ),
      },
      {
        id: "entry_price",
        header: "Giriş",
        width: 118,
        num: true,
        value: (row) => row.entry_price,
        cell: (row) => <NumCell value={row.entry_price} text={price(row.entry_price)} tint={false} />,
      },
      {
        id: "last_price",
        header: "Güncel",
        width: 118,
        num: true,
        value: (row) => row.last_price,
        cell: (row) => <NumCell value={row.last_price} text={price(row.last_price)} />,
      },
      {
        id: "unrealized_pnl",
        header: "K/Z",
        width: 124,
        num: true,
        value: (row) => row.unrealized_pnl,
        cell: (row) => <NumCell value={row.unrealized_pnl} text={money(row.unrealized_pnl)} colorize />,
        footer: (list) => (
          <NumText
            text={money(list.reduce((sum, row) => sum + (row.unrealized_pnl ?? 0), 0))}
            size="sm"
          />
        ),
      },
      {
        id: "unrealized_pct",
        header: "%",
        width: 96,
        num: true,
        value: (row) => row.unrealized_pct,
        cell: (row) => (
          <NumCell
            value={row.unrealized_pct}
            text={row.unrealized_pct === null ? "—" : pct(row.unrealized_pct, 2)}
            colorize
          />
        ),
      },
      {
        id: "score_at_entry",
        header: "Girişteki puan",
        width: 128,
        num: true,
        value: (row) => row.score_at_entry,
        cell: (row) => (
          <span className="inline-flex items-center gap-2">
            <Bar value={row.score_at_entry} width={26} height={3} />
            <NumCell value={row.score_at_entry} text={num(row.score_at_entry, 1)} size="sm" tint={false} />
          </span>
        ),
      },
    ],
    [],
  );

  if (query.isLoading) {
    return (
      <Panel title="Açık pozisyonlar">
        <LoadingRows rows={4} />
      </Panel>
    );
  }

  if (query.isError) {
    return (
      <Panel title="Açık pozisyonlar">
        <ErrorBox
          message={query.error instanceof Error ? query.error.message : String(query.error ?? "")}
        />
      </Panel>
    );
  }

  return (
    <Panel
      title="Açık pozisyonlar"
      description="Şu an piyasada duran her pozisyon."
      actions={
        <Link href="/pozisyonlar">
          <Button size="sm" variant="quiet">
            Ayrıntı
          </Button>
        </Link>
      }
      padded={false}
    >
      <DataGrid
        rows={rows}
        columns={columns}
        rowKey={(row) => String(row.id)}
        storageKey="panel-pozisyonlar"
        searchable={false}
        defaultSort={[{ id: "unrealized_pnl", desc: true }]}
        maxHeight={360}
        rowAccent={(row) =>
          row.unrealized_pnl === null
            ? null
            : row.unrealized_pnl >= 0
              ? "var(--sn-up)"
              : "var(--sn-down)"
        }
        emptyTitle="Açık pozisyon yok"
        emptyHint="Botlar puan eşiğini geçen bir aday bulduğunda pozisyon açar. Aday yoksa beklemek doğru davranıştır."
      />
    </Panel>
  );
}
