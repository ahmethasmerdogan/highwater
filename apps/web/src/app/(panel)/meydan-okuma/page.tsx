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
import { api, type Bot, type SystemLoad, type Trade } from "@/lib/api";
import { money, num, pct, pctSigned, relative } from "@/lib/format";
import { Page, GuideSection } from "@/shell/page";
import {
  Alert,
  Async,
  BotStatePill,
  Button,
  Delta,
  Dot,
  InfoDot,
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

const BASLANGIC_TRY = 20_000;
const HEDEF_TRY = 100_000;
/** Meydan okuma başlarken USDTTRY (2026-08-26). Bilerek dondurulmuştur. */
const KUR = 48.08;

/** Sahibin koyduğu süre: 30 gün, 26 Ağustos 2026'dan itibaren. */
const BASLANGIC = new Date("2026-08-26T00:00:00Z");
const SURE_GUN = 30;

const BASLANGIC_USDT = BASLANGIC_TRY / KUR;
const HEDEF_USDT = HEDEF_TRY / KUR;

/* ------------------------------------------------------------------ */

export default function ChallengePage() {
  const bots = useQuery({
    queryKey: ["bots"],
    queryFn: () => api.get<Bot[]>("/bots"),
    refetchInterval: 15_000,
  });

  const trades = useQuery({
    queryKey: ["trades", "hepsi"],
    queryFn: () => api.get<Trade[]>("/trades", { limit: 1000 }),
    refetchInterval: 60_000,
  });

  const load = useQuery({
    queryKey: ["system-load"],
    queryFn: () => api.get<SystemLoad>("/system/load"),
    refetchInterval: 20_000,
  });

  const meydan = (bots.data ?? []).find((bot) => bot.name.startsWith(BOT_ADI)) ?? null;
  const kontroller = (bots.data ?? []).filter((bot) => !bot.name.startsWith(BOT_ADI));

  /* Bot başına özet: kaç işlem, ortalama R, toplam k/z, komisyon.
     Ortalama R tek karşılaştırılabilir ölçüdür — farklı sermayeli botların
     TL kârını yan yana koymak, büyük sermayeliyi otomatik kazandırır. */
  const perBot = useMemo(() => {
    const map = new Map<number, { islem: number; toplamR: number; kz: number; komisyon: number }>();
    for (const trade of trades.data ?? []) {
      const row = map.get(trade.bot_id) ?? { islem: 0, toplamR: 0, kz: 0, komisyon: 0 };
      row.islem += 1;
      row.toplamR += trade.pnl_r;
      row.kz += trade.pnl;
      row.komisyon += trade.fees;
      map.set(trade.bot_id, row);
    }
    return map;
  }, [trades.data]);

  const equity = meydan?.equity ?? null;
  const ilerleme =
    equity === null ? null : (equity - BASLANGIC_USDT) / (HEDEF_USDT - BASLANGIC_USDT);
  const tryKarsiligi = equity === null ? null : equity * KUR;

  /* Süre ve hız. Tek başına "ne kadar kaldı" yetmez: hedefe yetişip
     yetişmediğimizi söyleyen şey gereken günlük oran ile gerçekleşen oranın
     karşılaştırması. İkisini yan yana koymayan bir sayaç, son gün sürpriz yapar. */
  const gecen = Math.max(
    0,
    (Date.now() - BASLANGIC.getTime()) / 86_400_000,
  );
  const kalan = Math.max(0, SURE_GUN - gecen);
  const gerekenGunluk = kalan > 0 && equity !== null && equity > 0
    ? Math.pow(HEDEF_USDT / equity, 1 / kalan) - 1
    : null;
  const gerceklesenGunluk = gecen >= 0.5 && equity !== null
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
      {/* ---- İlerleme ------------------------------------------------ */}
      {meydan === null ? (
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

            <ProgressBar ratio={ilerleme} />

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
              format={(value) => num(value, 1)}
              accent={kalan < 7 ? "var(--sn-warn)" : undefined}
              sub={`${num(SURE_GUN, 0)} günlük süre · ${num(gecen, 1)} gün geçti`}
            />
            <Metric
              label="Gereken günlük"
              value={gerekenGunluk}
              format={(value) => (value === null || value === undefined ? "—" : pct(value, 2))}
              accent="var(--sn-brand-solid)"
              sub="bugünkü özsermayeden hedefe, kalan günde"
            />
            <Metric
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
              sub={gecen < 0.5 ? "ilk yarım gün dolmadan ölçülmez" : "başlangıçtan bugüne bileşik"}
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
                gecen < 1
                  ? "ilk gün — henüz anlamlı değil"
                  : "erken günlerde çok oynak"
              }
            />
          </div>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Metric
              label="Özsermaye"
              value={equity}
              format={(value) => money(value)}
              accent="var(--sn-brand-solid)"
              sub={`başlangıç ${money(BASLANGIC_USDT)} USDT`}
            />
            <Metric
              label="Getiri"
              value={equity === null ? null : equity / BASLANGIC_USDT - 1}
              format={(value) => pctSigned(value)}
              accent={
                equity === null
                  ? undefined
                  : equity >= BASLANGIC_USDT
                    ? "var(--sn-up)"
                    : "var(--sn-down)"
              }
              sub="beş kat için +%400 gerekiyor"
            />
            <Metric
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

      {/* ---- Kontrol grubu ------------------------------------------- */}
      <Panel
        title="Kontrol grubuyla karşılaştırma"
        description="Bütün botlar aynı havuzu aynı barlarda görür. Meydan okuma botu bunları geçemiyorsa, yaptığım değişiklikler değer katmıyor demektir."
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

function ProgressBar({ ratio }: { ratio: number | null }) {
  const clamped = ratio === null ? 0 : Math.max(0, Math.min(1, ratio));
  return (
    <div
      className="mt-4 h-3 w-full overflow-hidden rounded-full"
      style={{ background: "var(--sn-sunken)" }}
    >
      <div
        className="h-full rounded-full transition-[width] duration-[var(--sn-dur-3)] ease-[var(--sn-ease)]"
        style={{
          width: `${clamped * 100}%`,
          background: "var(--sn-brand-solid)",
          minWidth: clamped > 0 ? 3 : 0,
        }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */

type BotOzet = Map<number, { islem: number; toplamR: number; kz: number; komisyon: number }>;

function botColumns(perBot: BotOzet, meydanId: number): SimpleColumn<Bot>[] {
  const ortR = (bot: Bot) => {
    const row = perBot.get(bot.id);
    return row && row.islem > 0 ? row.toplamR / row.islem : null;
  };

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
      cell: (row) => <NumText text={num(perBot.get(row.id)?.islem ?? 0, 0)} size="sm" />,
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
        <Delta value={perBot.get(row.id)?.kz ?? null} format={(v) => money(v)} size="sm" />
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
      cell: (row) => <NumText text={money(perBot.get(row.id)?.komisyon ?? 0)} size="sm" />,
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
  const yuksek = basinc !== null && basinc >= 1.0;

  /* Aday: meydan okuma botu hariç, en az bir işlem yapmış, en düşük ortalama R.
     İşlem yapmamış bot sıralamaya girmez — ortalama R'si yoktur, "kötü" değil
     "ölçülmemiş"tir ve ikisini karıştırmak yanlış botu durdurur. */
  const aday = bots
    .filter((bot) => bot.id !== meydanId)
    .map((bot) => {
      const row = perBot.get(bot.id);
      return { bot, ortR: row && row.islem > 0 ? row.toplamR / row.islem : null, islem: row?.islem ?? 0 };
    })
    .filter((entry) => entry.ortR !== null)
    .sort((a, b) => (a.ortR as number) - (b.ortR as number))[0];

  const olculmemis = bots.filter((bot) => (perBot.get(bot.id)?.islem ?? 0) === 0 && bot.id !== meydanId);

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
            <Metric label="Yük · 1 dk" value={load.load_1} format={(v) => num(v, 2)} sub="anlık" />
            <Metric label="Yük · 5 dk" value={load.load_5} format={(v) => num(v, 2)} sub="kısa vadeli eğilim" />
            <Metric label="Yük · 15 dk" value={load.load_15} format={(v) => num(v, 2)} sub="kalıcı yük" />
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
