"use client";

/**
 * Meydan Okuma — 20.000 ₺ → 100.000 ₺.
 *
 * Sayfa üç soruya cevap verir ve üçünü de dürüstçe verir:
 *
 *   1. **Neredeyiz?** Hedefe uzaklık, ₺ ve USDT cinsinden.
 *   2. **İşe yarıyor mu?** Meydan okuma botu, aynı piyasayı aynı anda gören
 *      kontrol botlarını geçiyor mu. Tek başına bir getiri sayısı hiçbir şey
 *      söylemez; kıyas olmadan yükselen bir eğri piyasanın yükselmesi de
 *      olabilir.
 *   3. **Sistem taşıyabiliyor mu?** Çekirdek yükü ve bot başına kârlılık —
 *      yük artarsa hangi botun durdurulacağına bakılacak yer burası.
 *
 * Hedef ₺ cinsindendir ama sistem USDT ile çalışır. Kur bu sayfada **sabittir
 * ve yazılıdır**: meydan okuma başlarken 48,08'di. Güncel kurla çarpmak,
 * botun performansını kur hareketiyle karıştırırdı.
 */

import Link from "next/link";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  api,
  type Benchmark,
  type Bot,
  type BotMetrics,
  type PortfolioEquity,
  type PortfolioMetrics,
  type SystemLoad,
} from "@/lib/api";
import { MilestoneTrack } from "@/design/celebration";
import { CurveChart, type CurveSeries } from "@/design/chart";
import { dateTime, money, num, pct, pctSigned, relative } from "@/lib/format";
import { Page, GuideSection } from "@/shell/page";
import {
  Alert,
  Async,
  BotStatePill,
  Button,
  Delta,
  Dot,
  ErrorBox,
  InfoDot,
  LoadingRows,
  Metric,
  NumText,
  Panel,
  Tag,
  TextMetric,
} from "@/design";
import { SimpleTable, type SimpleColumn } from "@/grid/simple-table";

/* ------------------------------------------------------------------ */
/*  Meydan okumanın sabitleri                                          */
/* ------------------------------------------------------------------ */

/** Botun adı kimliğidir; başka bir yerde saklanan bir bayrak yok. */
const BOT_ADI = "MEYDAN OKUMA";

/* Kalan sürenin altında bileşik günlük oranın hesaplanmadığı eşik (gün). */
const SON_CEYREK_GUN = 0.25;
const BASLANGIC_TRY = 20_000;
const HEDEF_TRY = 100_000;
/** Meydan okuma başlarken USDTTRY (2026-08-26). Bilerek dondurulmuştur. */
const KUR = 48.08;

/** Sahibin koyduğu süre: 30 gün. Sayaç botun fonlandığı andan işler. */
const SURE_GUN = 30;

/* Beş seviye, geometrik: 20k → 30k → 44,7k → 66,9k → 100k (her adım ~×1,5).
   Doğrusal eşikler ilk günleri ödüllendirip son haftayı umutsuz gösterirdi;
   bileşik bir hedefte adil merdiven geometrik olandır. */
const SEVIYELER = [20_000, 29_907, 44_721, 66_874, 100_000];

const BASLANGIC_USDT = BASLANGIC_TRY / KUR;
const HEDEF_USDT = HEDEF_TRY / KUR;

/* ------------------------------------------------------------------ */

export default function ChallengePage() {
  const bots = useQuery({
    queryKey: ["bots"],
    queryFn: () => api.get<Bot[]>("/bots"),
    refetchInterval: 15_000,
  });

  /* Finansal ölçüler motorda hesaplanır (tek karar yolu): /portfolio/metrics
     bot başına işlem sayısı, ortalama R, net K/Z ve komisyonu hazır verir.
     Önceden sayfa 1000 işlemi çekip tarayıcıda topluyordu. */
  const metrics = useQuery({
    queryKey: ["portfolio-metrics"],
    queryFn: () => api.get<PortfolioMetrics>("/portfolio/metrics"),
    refetchInterval: 60_000,
  });

  const load = useQuery({
    queryKey: ["system-load"],
    queryFn: () => api.get<SystemLoad>("/system/load"),
    refetchInterval: 20_000,
  });

  const meydan = (bots.data ?? []).find((bot) => bot.name.startsWith(BOT_ADI)) ?? null;
  /* Kontrol grubu = ÇALIŞAN 1h botları. Durmuş arşiv botlarını ve farklı
     karar dilimlerini aynı tabloya koymak, farklı pencerelerin tüm-zaman
     ortalamalarını yarıştırmaktı (bkz. tablo altındaki dürüstlük notu). */
  const kontroller = (bots.data ?? []).filter(
    (bot) =>
      !bot.name.startsWith(BOT_ADI) &&
      (bot.state === "PAPER_RUNNING" || bot.state === "DEGRADED") &&
      bot.timeframe === meydan?.timeframe,
  );

  /* Aynı-andan yarış: tüm eğriler meydan okumanın FONLANMA anına yeniden
     tabanlanır (uçtaki ?since=). Bunsuz kontroller 11 gün önde başlıyor ve
     karşılaştırma anlamsızlaşıyordu. */
  const yarris = useQuery({
    queryKey: ["benchmark-since", meydan?.created_at],
    queryFn: () =>
      api.get<Benchmark>("/portfolio/benchmark", { since: meydan!.created_at }),
    enabled: meydan !== null,
    refetchInterval: 300_000,
  });

  /* Hedef yolu grafiği: botun gerçek özsermayesi + hedefe giden gereken
     bileşik patika. İkisinin arasındaki dikey mesafe "ne kadar geridesin"in
     kendisidir. */
  const equityCurve = useQuery({
    queryKey: ["equity", meydan?.id],
    queryFn: () => api.get<PortfolioEquity>("/portfolio/equity", { bot_id: meydan?.id }),
    enabled: meydan !== null,
    refetchInterval: 60_000,
  });

  /* Bot başına özet: kaç işlem, ortalama R, toplam k/z, komisyon.
     Ortalama R tek karşılaştırılabilir ölçüdür — farklı sermayeli botların
     TL kârını yan yana koymak, büyük sermayeliyi otomatik kazandırır. */
  const perBot = useMemo(() => {
    const map = new Map<number, BotMetrics>();
    for (const row of metrics.data?.bots ?? []) map.set(row.bot_id, row);
    return map;
  }, [metrics.data]);

  const equity = meydan?.equity ?? null;
  const ilerleme =
    equity === null ? null : (equity - BASLANGIC_USDT) / (HEDEF_USDT - BASLANGIC_USDT);
  const tryKarsiligi = equity === null ? null : equity * KUR;

  /* Süre ve hız. Tek başına "ne kadar kaldı" yetmez: hedefe yetişip
     yetişmediğimizi söyleyen şey gereken günlük oran ile gerçekleşen oranın
     karşılaştırması. İkisini yan yana koymayan bir sayaç, son gün sürpriz yapar.

     Başlangıç anı botun kendi `created_at`'inden gelir, elle yazılmış bir
     tarihten değil. Elle yazıldığında gece yarısından sayıyordu ama bot 17:18'de
     fonlanmıştı: geçen süre 0,57 gün yerine 1,29 gün çıkıyor, gerçekleşen oran
     %1,24 yerine %0,55 görünüyordu. İki hata da aynı yöne çalışıyordu — bot
     olduğundan yavaş, hedef olduğundan uzak. */
  const baslangic = meydan ? new Date(meydan.created_at) : null;
  const gecen =
    baslangic === null
      ? null
      : Math.max(0, (Date.now() - baslangic.getTime()) / 86_400_000);
  const kalan = gecen === null ? null : Math.max(0, SURE_GUN - gecen);
  /* Son çeyrek günde bileşik oran hesaplanmaz. `1 / kalan` sıfıra yaklaşırken
     üs patlar: `kalan` 0,001 günken kart 40 basamaklı bir sayı yazıyordu.
     Sıfır korunmuştu, sıfırın hemen üstü korunmamıştı. Bir günün altındaki
     süre için "günlük bileşik oran" zaten anlamsız bir büyüklüktür. */
  const sureDoluyor = kalan !== null && kalan < SON_CEYREK_GUN;
  const gerekenGunluk =
    kalan !== null && kalan >= SON_CEYREK_GUN && equity !== null && equity > 0
      ? Math.pow(HEDEF_USDT / equity, 1 / kalan) - 1
      : null;
  /* Yarım gün dolmadan bileşik oran hesaplanmaz: birkaç saatlik veriden
     günlük hız çıkarmak sayıyı anlamsız büyütür. */
  const gerceklesenGunluk =
    gecen !== null && gecen >= 0.5 && equity !== null && equity > 0
      ? Math.pow(equity / BASLANGIC_USDT, 1 / gecen) - 1
      : null;

  return (
    <Page
      title="Meydan Okuma"
      summary="20.000 ₺ → 100.000 ₺. Sistemi geliştire geliştire beş katına çıkarma denemesi — ilerleme, denemeler ve kontrol grubuyla karşılaştırma."
      actions={
        <Link href="/kalibrasyon">
          <Button size="sm" variant="neutral">
            Kenar hâlâ var mı?
          </Button>
        </Link>
      }
      guide={
        <>
          <GuideSection title="Ne gösteriyor">
            <p>
              Meydan okuma botunun hedefe uzaklığı ve aynı piyasayı aynı anda gören kontrol
              botlarıyla karşılaştırması. Sistem <strong>kağıt üstüdür</strong>; canlı para
              yoktur, beş kat da kağıt üstünde beş kattır.
            </p>
          </GuideSection>
          <GuideSection title="Nasıl okunur">
            <p>
              <strong>Tek başına bir getiri sayısı hiçbir şey söylemez.</strong> Yükselen bir
              eğri, piyasanın yükselmesi de olabilir. Anlamlı olan, meydan okuma botunun kontrol
              botlarını geçip geçmediğidir — hepsi aynı havuzu, aynı barlarda görür.
            </p>
            <p>
              <strong>Ortalama R</strong> tek karşılaştırılabilir ölçüdür. Farklı sermayeli
              botların TL kârını yan yana koymak, büyük sermayeliyi otomatik kazandırır.
            </p>
            <p>
              Kur <strong>dondurulmuştur</strong> ({num(KUR, 2)} ₺/USDT, 26.08.2026). Güncel
              kurla çarpmak, botun performansını kur hareketiyle karıştırırdı.
            </p>
          </GuideSection>
          <GuideSection title="Ne yapabilirim">
            <p>
              Aşağıdaki <em>Sistem yükü</em> bölümü çekirdek baskısını gösterir. Yük 1,0&apos;ı
              aşarsa karar barları gecikmeye başlar; en düşük ortalama R&apos;ye sahip botu
              durdurmak en az bilgi kaybettiren seçimdir.
            </p>
          </GuideSection>
        </>
      }
    >
      {/* ---- İlerleme ------------------------------------------------
          Üç durum ayrılır: yükleniyor, hata, gerçekten yok. Üçünü "bot
          bulunamadı" diye göstermek, veri yokluğunu ölçüm sonucu gibi sunar —
          API kapalıyken sahibi botun silindiğini sanır. */}
      {bots.isLoading ? (
        <Panel>
          <LoadingRows rows={3} />
        </Panel>
      ) : bots.isError ? (
        <ErrorBox
          message={
            bots.error instanceof Error ? bots.error.message : String(bots.error ?? "")
          }
        />
      ) : meydan === null ? (
        <Alert tone="warn" title="Meydan okuma botu bulunamadı">
          Adı <span className="sn-num">{BOT_ADI}</span> ile başlayan bir bot yok. Bot silinmiş ya
          da yeniden adlandırılmış olabilir; sayfa botu adından tanır.
        </Alert>
      ) : (
        <>
          <Panel
            title="Hedefe ne kadar kaldı"
            description={`${num(BASLANGIC_TRY, 0)} ₺ ile başlandı, hedef ${num(HEDEF_TRY, 0)} ₺. Sistem USDT ile çalışır; ₺ karşılığı dondurulmuş kurla hesaplanır.`}
          >
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <div className="flex items-baseline gap-2">
                <NumText text={money(tryKarsiligi, 0)} size="hero" />
                <span style={{ fontSize: "var(--sn-t-title)", color: "var(--sn-ink-3)" }}>₺</span>
              </div>
              <div className="flex items-baseline gap-2">
                <NumText text={money(equity)} size="xl" />
                <span style={{ fontSize: "var(--sn-t-caption)", color: "var(--sn-ink-3)" }}>
                  USDT · başlangıç {money(BASLANGIC_USDT)}
                </span>
              </div>
            </div>

            {/* Seviye çizgisi: 20k → 100k beş geometrik kademe (her seviye
                ×1,5). Eşik geçişi localStorage'la BİR KEZ kutlanır; sayfa
                yenilemesi konfeti yağdırmaz, gerileme sayacı dürüstçe geri
                alır. */}
            <div className="mt-4">
              <MilestoneTrack
                progress={ilerleme}
                storageKey="meydan-seviye"
                milestones={SEVIYELER.map((tl, i) => ({
                  /* Kısa etiket: mutlak konumlu etiketler uzun metinle
                     birbirine giriyordu. */
                  label: i === 0 ? "20k ₺" : `S${i} · ${num(tl / 1000, 0)}k`,
                  at: (tl - BASLANGIC_TRY) / (HEDEF_TRY - BASLANGIC_TRY),
                }))}
              />
            </div>

            <div
              className="mt-2 flex flex-wrap justify-between gap-2"
              style={{ fontSize: "var(--sn-t-caption)", color: "var(--sn-ink-3)" }}
            >
              <span className="sn-num">{num(BASLANGIC_TRY, 0)} ₺</span>
              <span>
                {ilerleme === null
                  ? "ilerleme hesaplanamadı"
                  : `yolun %${num(Math.max(0, ilerleme) * 100, 1)}'i`}
              </span>
              <span className="sn-num">{num(HEDEF_TRY, 0)} ₺</span>
            </div>
          </Panel>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Metric
              label="Kalan gün"
              value={kalan}
              format={(value) => (value === null || value === undefined ? "—" : num(value, 1))}
              accent={kalan !== null && kalan < 7 ? "var(--sn-warn)" : undefined}
              sub={
                gecen === null
                  ? "bot bulunamadı"
                  : `${num(SURE_GUN, 0)} günlük süre · ${num(gecen, 1)} gün geçti`
              }
            />
            <Metric
              animateOnMount
              label="Gereken günlük"
              value={gerekenGunluk}
              format={(value) => (value === null || value === undefined ? "—" : pct(value, 2))}
              accent="var(--sn-brand-solid)"
              sub={
                sureDoluyor
                  ? "süre doluyor — günlük oran anlamını yitirdi"
                  : "bugünkü özsermayeden hedefe, kalan günde"
              }
            />
            <Metric
              animateOnMount
              label="Gerçekleşen günlük"
              value={gerceklesenGunluk}
              format={(value) => (value === null || value === undefined ? "—" : pct(value, 2))}
              accent={
                gerekenGunluk !== null && gerceklesenGunluk !== null
                  ? gerceklesenGunluk >= gerekenGunluk
                    ? "var(--sn-up)"
                    : "var(--sn-down)"
                  : undefined
              }
              sub={
                gecen !== null && gecen < 0.5
                  ? "ilk yarım gün dolmadan ölçülmez"
                  : "fonlanmadan bugüne bileşik"
              }
            />
            <TextMetric
              label="Yetişiyor mu"
              info={
                <InfoDot text="Gerçekleşen günlük oran, gereken günlük oranın altındaysa mevcut hızla hedefe yetişilmez. Erken günlerde bu oran çok oynaktır; birkaç işlem tabloyu tamamen çevirir." />
              }
              value={
                gerekenGunluk === null || gerceklesenGunluk === null
                  ? "—"
                  : gerceklesenGunluk >= gerekenGunluk
                    ? "Evet"
                    : "Hayır"
              }
              tone={
                gerekenGunluk === null || gerceklesenGunluk === null
                  ? "var(--sn-ink-3)"
                  : gerceklesenGunluk >= gerekenGunluk
                    ? "var(--sn-up)"
                    : "var(--sn-down)"
              }
              sub={
                gecen !== null && gecen < 1
                  ? "ilk gün — henüz anlamlı değil"
                  : "erken günlerde çok oynak"
              }
            />
          </div>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Metric
              animateOnMount
              label="Özsermaye"
              value={equity}
              format={(value) => money(value)}
              accent="var(--sn-brand-solid)"
              sub={`başlangıç ${money(BASLANGIC_USDT)} USDT`}
            />
            <Metric
              animateOnMount
              label="Getiri"
              value={
                equity === null || meydan.capital <= 0 ? null : equity / meydan.capital - 1
              }
              format={(value) => pctSigned(value)}
              accent={
                equity === null
                  ? undefined
                  : equity >= meydan.capital
                    ? "var(--sn-up)"
                    : "var(--sn-down)"
              }
              sub="taban: botun cüzdanı — alttaki tabloyla aynı"
            />
            <Metric
              animateOnMount
              label="Açık pozisyon"
              value={meydan.open_positions}
              format={(value) => num(value, 0)}
              sub={`nakit ${money(meydan.cash)}`}
            />
            <TextMetric
              label="Durum"
              info={<InfoDot text="Bot sunucuda çalışır. Paneli kapatmak onu durdurmaz." />}
              value={<BotStatePill state={meydan.state} hint={false} />}
              sub={`yaşam sinyali ${relative(meydan.last_heartbeat_at)}`}
            />
          </div>
        </>
      )}

      {/* ---- Hedef yolu ---------------------------------------------- */}
      {meydan && (
        <Panel
          title="Hedef yolu"
          description="Düz çizgi botun gerçek özsermayesi; kesikli çizgi bugünden değil BAŞLANGIÇTAN hedefe giden gereken bileşik patika. Aradaki dikey mesafe, ne kadar geride olduğunun kendisi."
        >
          <HedefYolu
            curve={equityCurve.data?.bots.find((b) => b.bot_id === meydan.id)?.curve ?? []}
            baslangic={baslangic}
            kapital={meydan.capital}
          />
          {(perBot.get(meydan.id)?.trades ?? 0) === 0 && (
            <p
              className="mt-2"
              style={{ fontSize: "var(--sn-t-caption)", color: "var(--sn-ink-3)", lineHeight: 1.5 }}
            >
              Henüz hiç pozisyon kapanmadı — yukarıdaki getirinin tamamı{" "}
              {meydan.open_positions} açık pozisyonun <strong>gerçekleşmemiş</strong> değeri.
              Cebe girmiş tek kuruş yok.
            </p>
          )}
        </Panel>
      )}

      {/* ---- Aynı andan yarış ---------------------------------------- */}
      {meydan && yarris.data && (
        <Panel
          title="Aynı andan yarış"
          description="Meydan okuma, çalışan kontroller ve havuz sepeti — hepsi meydan okumanın fonlandığı ana yeniden tabanlanmış (100 = başlangıç). Hepsi birlikte yükseliyorsa yükselen şey piyasadır, sistem değil."
        >
          <YarisGrafigi data={yarris.data} meydanId={meydan.id} kontroller={kontroller} />
        </Panel>
      )}

      {/* ---- Kontrol grubu ------------------------------------------- */}
      <Panel
        title="Kontrol grubuyla karşılaştırma"
        description="Yalnızca ÇALIŞAN ve aynı karar dilimindeki botlar. Dikkat: kontrollerin geçmişi daha uzun — İşlem/R sütunları tüm zamanları kapsar, aynı pencerenin yarışı değildir."
        padded={false}
      >
        <Async
          query={bots}
          empty={{ title: "Bot yok", hint: "Karşılaştırılacak bir bot bulunamadı." }}
        >
          {() => (
            <div className="sn-scroll overflow-x-auto">
              <SimpleTable
                rows={[...(meydan ? [meydan] : []), ...kontroller]}
                columns={botColumns(perBot, meydan?.id ?? -1)}
                rowKey={(row) => row.id}
              />
            </div>
          )}
        </Async>
      </Panel>

      {/* ---- Sistem yükü --------------------------------------------- */}
      <SystemLoadPanel load={load.data} perBot={perBot} bots={bots.data ?? []} meydanId={meydan?.id ?? -1} />
    </Page>
  );
}

/* ------------------------------------------------------------------ */


/* ------------------------------------------------------------------ */

/**
 * Özsermaye eğrisi + gereken bileşik patika, TAM 30 günlük eksende.
 *
 * Eksen bugüne kadar değil sürenin sonuna kadar gider: kalan boşluğun
 * kendisi bilgidir. 416'dan 2.080'e giden bir eksende bugünkü nokta
 * neredeyse tabanda durur — gerçek de bu.
 */
function HedefYolu({
  curve,
  baslangic,
  kapital,
}: {
  curve: { at: string; equity: number }[];
  baslangic: Date | null;
  kapital: number;
}) {
  const seriler = useMemo<CurveSeries[]>(() => {
    if (!baslangic || kapital <= 0) return [];
    const t0 = baslangic.getTime();
    const bitis = t0 + SURE_GUN * 86_400_000;
    const patika: { at: string; value: number }[] = [];
    for (let t = t0; t <= bitis; t += 6 * 3_600_000) {
      const oran = (t - t0) / (SURE_GUN * 86_400_000);
      patika.push({
        at: new Date(t).toISOString(),
        value: kapital * Math.pow(HEDEF_USDT / kapital, oran),
      });
    }
    return [
      {
        label: "Gerçek özsermaye",
        color: "var(--sn-series-3)",
        points: curve.map((p) => ({ at: p.at, value: p.equity })),
      },
      {
        label: "Gereken patika (hedefe bileşik)",
        color: "var(--sn-ink-3)",
        dashed: true,
        points: patika,
      },
    ];
  }, [curve, baslangic, kapital]);

  if (seriler.length === 0 || curve.length === 0) {
    return (
      <p style={{ fontSize: "var(--sn-t-body)", color: "var(--sn-ink-3)" }}>
        Özsermaye eğrisi henüz boş — ilk bar kapanışını bekliyor.
      </p>
    );
  }
  return (
    <CurveChart
      series={seriler}
      height={240}
      valueFormat={(v) => money(v)}
      labelFormat={(at) => dateTime(at)}
    />
  );
}

function YarisGrafigi({
  data,
  meydanId,
  kontroller,
}: {
  data: Benchmark;
  meydanId: number;
  kontroller: Bot[];
}) {
  const kontrolIdler = useMemo(() => new Set(kontroller.map((b) => b.id)), [kontroller]);
  const seriler = useMemo<CurveSeries[]>(() => {
    const out: CurveSeries[] = [];
    for (const bot of data.bots) {
      if (bot.curve.length < 2) continue;
      if (bot.bot_id === meydanId) {
        out.push({
          label: "Meydan okuma",
          color: "var(--sn-series-3)",
          points: bot.curve.map((p) => ({ at: p.at, value: p.value * 100 })),
        });
      } else if (kontrolIdler.has(bot.bot_id)) {
        out.push({
          label: bot.name.replace("Havuz Momentum · ", "kontrol: "),
          color: "var(--sn-ink-4)",
          points: bot.curve.map((p) => ({ at: p.at, value: p.value * 100 })),
        });
      }
    }
    if (data.benchmark.length > 1) {
      /* Sepet kendi penceresinin başına normalize gelir; since penceresinde
         yeniden tabanla. */
      const kesit = data.benchmark;
      const taban = kesit[0]?.value || 1;
      out.push({
        label: `Havuz sepeti · ${data.universe_size ?? "?"} sembol`,
        color: "var(--sn-series-2)",
        dashed: true,
        points: kesit.map((p) => ({ at: p.at, value: (p.value / taban) * 100 })),
      });
    }
    return out;
  }, [data, meydanId, kontrolIdler]);

  if (seriler.length === 0) {
    return (
      <p style={{ fontSize: "var(--sn-t-body)", color: "var(--sn-ink-3)" }}>
        Yarış eğrisi için henüz yeterli nokta yok.
      </p>
    );
  }
  return (
    <>
      {data.verdict && (
        <p
          className="mb-2"
          style={{ fontSize: "var(--sn-t-caption)", color: "var(--sn-warn)" }}
        >
          {data.verdict}
        </p>
      )}
      <CurveChart
        series={seriler}
        height={220}
        valueFormat={(v) => num(v, 1)}
        labelFormat={(at) => dateTime(at)}
      />
    </>
  );
}

type BotOzet = Map<number, BotMetrics>;

function botColumns(perBot: BotOzet, meydanId: number): SimpleColumn<Bot>[] {
  const ortR = (bot: Bot) => perBot.get(bot.id)?.avg_r ?? null;

  return [
    {
      header: "Bot",
      cell: (row) => (
        <span className="flex items-center gap-2">
          {row.id === meydanId && <Tag tone="brand">meydan okuma</Tag>}
          <Link
            href={`/botlar/${row.id}`}
            className="hover:underline"
            style={{ fontSize: "var(--sn-t-body)", color: "var(--sn-ink)" }}
          >
            {row.name}
          </Link>
        </span>
      ),
    },
    {
      header: "Bar",
      cell: (row) => (
        <span className="sn-num" style={{ fontSize: "var(--sn-t-caption)", color: "var(--sn-ink-2)" }}>
          {row.timeframe}
        </span>
      ),
    },
    { header: "Durum", cell: (row) => <BotStatePill state={row.state} hint={false} /> },
    {
      header: "İşlem",
      num: true,
      cell: (row) => <NumText text={num(perBot.get(row.id)?.trades ?? 0, 0)} size="sm" />,
    },
    {
      header: "Ortalama R",
      num: true,
      hint: "İşlem başına sonuç, risk birimi cinsinden. Farklı sermayeli botları karşılaştırmanın tek dürüst yolu.",
      cell: (row) => {
        const value = ortR(row);
        return value === null ? (
          <NumText text="—" size="sm" />
        ) : (
          <Delta value={value} format={(v) => num(v, 3)} size="sm" />
        );
      },
    },
    {
      header: "Toplam K/Z",
      num: true,
      cell: (row) => (
        <Delta value={perBot.get(row.id)?.total_pnl ?? null} format={(v) => money(v)} size="sm" />
      ),
    },
    {
      header: "Getiri",
      num: true,
      hint: "Botun kendi başlangıç sermayesine göre değişimi.",
      cell: (row) => {
        const value = row.equity !== null && row.capital > 0 ? row.equity / row.capital - 1 : null;
        return value === null ? (
          <NumText text="—" size="sm" />
        ) : (
          <Delta value={value} format={(v) => pctSigned(v)} size="sm" />
        );
      },
    },
    {
      header: "Komisyon",
      num: true,
      cell: (row) => <NumText text={money(perBot.get(row.id)?.total_fees ?? 0)} size="sm" />,
    },
  ];
}

/* ------------------------------------------------------------------ */
/*  Sistem yükü                                                        */
/* ------------------------------------------------------------------ */

/**
 * Çekirdek baskısı ve durdurma adayı.
 *
 * Yük arttığında hangi botun kapatılacağı bir tercih değil, ölçüm sorusudur:
 * **en düşük ortalama R'ye sahip olan** en az bilgi kaybettirir. Sayfa adayı
 * gösterir ama durdurmaz — durdurma kararı kullanıcınındır ve bot sayfasından
 * verilir.
 */
function SystemLoadPanel({
  load,
  perBot,
  bots,
  meydanId,
}: {
  load: SystemLoad | undefined;
  perBot: BotOzet;
  bots: Bot[];
  meydanId: number;
}) {
  const basinc = load?.pressure ?? null;
  /* Alarm KALICI yüke bakar: load_1 üç ortalamanın en gürültülüsüdür —
     anlık bir backtest koşusu yanlış bir "bot durdur" önerisi üretiyordu. */
  const kalici =
    load && load.load_5 !== null && load.cores > 0 ? load.load_5 / load.cores : null;
  const yuksek = kalici !== null && kalici >= 1.0;

  /* Aday: meydan okuma botu hariç, en az bir işlem yapmış, en düşük ortalama R.
     İşlem yapmamış bot sıralamaya girmez — ortalama R'si yoktur, "kötü" değil
     "ölçülmemiş"tir ve ikisini karıştırmak yanlış botu durdurur. */
  /* Yalnızca ÇALIŞAN botlar: durmuş bot çekirdek tüketmez, onu "durdurma
     adayı" diye önermek yanlış karar üretir. (Beş STOPPED arşiv botu bu
     listeye giriyordu.) */
  const calisanlar = bots.filter(
    (bot) =>
      bot.id !== meydanId && (bot.state === "PAPER_RUNNING" || bot.state === "DEGRADED"),
  );
  const aday = calisanlar
    .map((bot) => {
      const row = perBot.get(bot.id);
      return { bot, ortR: row?.avg_r ?? null, islem: row?.trades ?? 0 };
    })
    .filter((entry) => entry.ortR !== null)
    .sort((a, b) => (a.ortR as number) - (b.ortR as number))[0];

  const olculmemis = calisanlar.filter((bot) => (perBot.get(bot.id)?.trades ?? 0) === 0);

  return (
    <Panel
      title="Sistem yükü"
      description="Backtest koşuları ve bot işçileri aynı çekirdekleri paylaşır. Yük çekirdek sayısını aşarsa karar barları gecikmeye başlar."
    >
      {!load || basinc === null ? (
        <p style={{ fontSize: "var(--sn-t-body)", color: "var(--sn-ink-3)" }}>
          {load?.message ?? "Yük bilgisi yükleniyor…"}
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Metric
              label="Çekirdek baskısı"
              value={basinc}
              format={(value) => num(value, 2)}
              accent={yuksek ? "var(--sn-down)" : "var(--sn-up)"}
              sub={`${load.cores} çekirdek · 1,00 = hepsi dolu`}
            />
            {/* Üçü de çekirdeğe bölünür — ilk kart 0,33 gösterirken bunların
                ham 1,33 göstermesi "yük dolu" diye okunuyordu. */}
            <Metric
              label="Baskı · 1 dk"
              value={load.load_1 !== null ? load.load_1 / load.cores : null}
              format={(v) => num(v, 2)}
              sub="anlık — en gürültülü"
            />
            <Metric
              label="Baskı · 5 dk"
              value={load.load_5 !== null ? load.load_5 / load.cores : null}
              format={(v) => num(v, 2)}
              accent={yuksek ? "var(--sn-down)" : undefined}
              sub="alarm eşiği bu ortalamaya bakar"
            />
            <Metric
              label="Baskı · 15 dk"
              value={load.load_15 !== null ? load.load_15 / load.cores : null}
              format={(v) => num(v, 2)}
              sub="kalıcı yük"
            />
          </div>

          <div className="mt-3">
            {yuksek ? (
              <Alert tone="down" title="Çekirdekler dolu">
                {load.message} Yük kalıcıysa bir bot durdurulabilir.
                {aday && (
                  <>
                    {" "}En az bilgi kaybettiren aday{" "}
                    <Link href={`/botlar/${aday.bot.id}`} className="underline underline-offset-2">
                      {aday.bot.name}
                    </Link>{" "}
                    — ortalama R {num(aday.ortR, 3)}, {aday.islem} işlem.
                  </>
                )}
              </Alert>
            ) : (
              <Alert tone="up" title="Yük normal">
                {load.message} Şu an bir bot durdurmaya gerek yok.
                {aday && (
                  <>
                    {" "}Gerekirse ilk aday{" "}
                    <Link href={`/botlar/${aday.bot.id}`} className="underline underline-offset-2">
                      {aday.bot.name}
                    </Link>{" "}
                    olurdu (ortalama R {num(aday.ortR, 3)}).
                  </>
                )}
              </Alert>
            )}
          </div>

          {olculmemis.length > 0 && (
            <p
              className="mt-3 flex items-start gap-2"
              style={{ fontSize: "var(--sn-t-caption)", color: "var(--sn-ink-3)", lineHeight: 1.5 }}
            >
              <span className="mt-1.5">
                <Dot tone="warn" />
              </span>
              <span>
                {olculmemis.map((bot) => bot.name).join(", ")} hiç işlem kapatmamış. Sıralamaya
                girmiyor: ortalama R&apos;si yok, yani <strong>kötü değil, ölçülmemiş</strong> —
                ikisini karıştırmak yanlış botu durdurur.
              </span>
            </p>
          )}
        </>
      )}
    </Panel>
  );
}
