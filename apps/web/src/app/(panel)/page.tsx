"use client";

/**
 * Panel — sistemin tek ekranda özeti.
 *
 * Buradaki her sayı bir soruya cevap verir ve her kutunun yanında o sorunun
 * ne olduğu yazılıdır. Kötü haber (zarar, düşüş, durmuş bot, bayat veri)
 * iyi haberle aynı büyüklükte ve aynı yerde durur; saklanmaz.
 */

import Link from "next/link";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button, cx } from "@/ui";
import {
  api,
  type Benchmark,
  type PortfolioEquity,
  type LivePnl,
  type Position,
  type SystemStatus,
} from "@/lib/api";
import { useLive } from "@/lib/ws";
import { humanizeEvent, type Severity } from "@/lib/humanize";
import { Page, Section, StatGrid, Empty } from "@/components/common/page";
import { Stat, AmountText, Signed } from "@/components/common/amount";
import { BotStatePill } from "@/components/common/pills";
import { CurveChart, type CurveSeries } from "@/components/viz/charts";
import { SimpleTable } from "@/components/data/data-table";
import { money, num, pct, pctSigned, price, relative, time } from "@/lib/format";

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

  const { data: positions = [] } = useQuery({
    queryKey: ["positions", "open"],
    queryFn: () => api.get<Position[]>("/positions", { status_filter: "OPEN" }),
    refetchInterval: 20_000,
  });

  const { events } = useLive();

  /* Özsermaye + kıyas eğrileri aynı eksende; ortak 100 tabanına endekslenir. */
  const curves = useMemo<CurveSeries[]>(() => {
    const out: CurveSeries[] = [];

    /*
     * Uç bir dizi değil `{bots, total}` döndürür. Diziymiş gibi okunduğunda
     * uzunluk `undefined` çıkıyor ve botların eğrisi **sessizce** çizilmiyordu;
     * grafikte yalnızca kıyas görünüyordu.
     */
    if ((equity?.total.length ?? 0) > 0) {
      out.push({
        label: "Botlar",
        color: "var(--series-1)",
        points: equity!.total.map((p) => ({ at: p.at, value: p.equity })),
      });
    }

    if (benchmark?.benchmark?.length) {
      out.push({
        label: "Havuz sepeti (al ve tut)",
        color: "var(--series-2)",
        dashed: true,
        points: benchmark.benchmark.map((p) => ({ at: p.at, value: p.value })),
      });
    }

    return out;
  }, [equity, benchmark]);

  /* Dikkat çeken son olaylar — bilgi düzeyindekiler panele çıkmaz. */
  const alerts = useMemo(
    () =>
      events
        .map((e) => ({ event: e, human: humanizeEvent(e.kind, e.level, e.payload) }))
        .filter((x) => x.human.severity === "warn" || x.human.severity === "error")
        .slice(0, 6),
    [events],
  );

  const stalePrices = live?.stale_symbols ?? [];

  return (
    <Page
      title="Panel"
      description="Sistemin şu anki durumu: para nerede, botlar ne yapıyor, dikkat edilmesi gereken bir şey var mı."
      intro={{
        storageKey: "panel",
        what: "Tüm botların toplam durumu, özsermaye eğrisi, açık pozisyonlar ve son uyarılar. Sistemde canlı para yoktur — tüm emirler dahili kağıt motorundan geçer, veriler ise gerçektir.",
        how: "**Özsermaye** botların toplam değeridir: nakit artı açık pozisyonların güncel karşılığı.\n**Gerçekleşmemiş** kâr/zarar açık pozisyonlardan gelir ve pozisyon kapanana kadar değişir — cebe girmiş sayılmaz.\nEğri grafiğinde botların eğrisi kıyas sepetiyle birlikte çizilir. Kıyası geçemiyorsanız, seçim yapmak değer katmıyor demektir.",
        action: "Bir sayı beklediğinizden farklıysa ilgili sayfaya gidin: pozisyonlar için **Pozisyonlar**, botların neden karar aldığını görmek için **Loglar**, puanlamanın işe yarayıp yaramadığı için **Kalibrasyon**.",
        terms: ["kagit_uzeri", "kiyas", "maruziyet", "drawdown", "havuz"],
      }}
    >
      {/* Uyarı şeridi */}
      {status && <SystemBanner status={status} stalePrices={stalePrices} />}

      {/* Ölçümler */}
      <StatGrid cols={4}>
        <Stat
          label="Özsermaye"
          hint="Tüm botların toplam değeri: elde kalan nakit artı açık pozisyonların güncel piyasa karşılığı."
          value={<AmountText text={money(live?.equity)} size="xl" />}
          sub={
            live ? (
              <span className="flex items-center gap-1.5">
                <span>başlangıç {money(live.capital)}</span>
                <Signed value={live.total_return} text={pctSigned(live.total_return)} size="sm" />
              </span>
            ) : null
          }
        />

        <Stat
          label="Bugün gerçekleşen"
          hint="Bugün kapanan işlemlerin net toplamı. Komisyon düşülmüştür ve bu tutar cebe girmiştir."
          value={
            <Signed
              value={live?.realized_today}
              text={money(live?.realized_today)}
              size="xl"
              arrow
            />
          }
          sub="kapanmış işlemler"
          tone={
            live?.realized_today === undefined || live.realized_today === 0
              ? "neutral"
              : live.realized_today > 0
                ? "up"
                : "down"
          }
        />

        <Stat
          label="Gerçekleşmemiş"
          hint="Açık pozisyonların anlık kâr/zararı. Pozisyon kapanana kadar değişir — henüz kazanılmış sayılmaz."
          value={
            <Signed
              value={live?.unrealized_pnl}
              text={money(live?.unrealized_pnl)}
              size="xl"
              arrow
            />
          }
          sub={`${live?.open_positions ?? 0} açık pozisyon`}
        />

        <Stat
          label="Maruziyet"
          term="maruziyet"
          value={
            <AmountText
              text={live ? pct(live.equity > 0 ? live.exposure / live.equity : 0) : "—"}
              size="xl"
            />
          }
          sub={live ? `${money(live.exposure)} pozisyonda · ${money(live.cash)} nakit` : null}
        />
      </StatGrid>

      {/* Eğri */}
      <Section
        title="Özsermaye ve kıyas"
        term="kiyas"
        description="Botların eğrisi, havuzun eşit ağırlıklı al-ve-tut sepetiyle birlikte. İkisi de 100 tabanına endekslenmiştir; böylece farklı başlangıç tutarları karşılaştırılabilir."
        actions={
          <Link href="/kalibrasyon">
            <Button size="sm" variant="ghost" shape="rect">
              Kalibrasyon
            </Button>
          </Link>
        }
      >
        <CurveChart
          series={curves}
          normalize
          height={260}
          valueFormat={(v) => `${num(v, 1)}`}
          emptyText="Henüz eğri çizilecek kadar veri yok. Botlar çalışmaya başladıkça burası dolar."
        />

        {benchmark?.verdict && (
          <p className="mt-3 rounded-lg border border-line bg-elev px-3.5 py-2.5 text-[12.5px] leading-relaxed text-ink-2">
            <strong className="font-medium text-ink">Değerlendirme: </strong>
            {benchmark.verdict}
            {benchmark.sufficient === false && (
              <>
                {" "}
                <span className="text-warn">
                  Örneklem henüz karar vermeye yetmiyor; bu fark gürültü olabilir.
                </span>
              </>
            )}
          </p>
        )}
      </Section>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Botlar */}
        <Section
          title="Botlar"
          description="Her bot kendi sermayesi ve pozisyonlarıyla bağımsız çalışır."
          padded={false}
          actions={
            <Link href="/botlar">
              <Button size="sm" variant="ghost" shape="rect">
                Tümü
              </Button>
            </Link>
          }
        >
          {!live || live.bots.length === 0 ? (
            <Empty
              title="Bot yok"
              description="Henüz hiç bot kurulmamış. Bot kurup başlatana kadar sistem işlem açmaz."
              action={
                <Link href="/botlar">
                  <Button size="sm" variant="amber" shape="rect">
                    Botlara git
                  </Button>
                </Link>
              }
              className="m-4 border-0"
            />
          ) : (
            <SimpleTable
              head={
                <>
                  <th>Bot</th>
                  <th>Durum</th>
                  <th className="col-num">Özsermaye</th>
                  <th className="col-num">Getiri</th>
                  <th className="col-num">Açık</th>
                </>
              }
            >
              {live.bots.map((b) => (
                <tr key={b.bot_id}>
                  <td>
                    <Link
                      href={`/botlar/${b.bot_id}`}
                      className="text-[13px] text-ink hover:text-brand"
                    >
                      {b.name}
                    </Link>
                  </td>
                  <td>
                    <BotStatePill state={b.state} />
                  </td>
                  <td className="col-num">
                    <AmountText text={money(b.equity)} size="sm" />
                  </td>
                  <td className="col-num">
                    <Signed value={b.total_return} text={pctSigned(b.total_return)} size="sm" />
                  </td>
                  <td className="col-num">{b.open_positions}</td>
                </tr>
              ))}
            </SimpleTable>
          )}
        </Section>

        {/* Son uyarılar */}
        <Section
          title="Dikkat gerektirenler"
          description="Son uyarı ve hatalar. Bilgi düzeyindeki kayıtlar buraya çıkmaz."
          padded={false}
          actions={
            <Link href="/loglar">
              <Button size="sm" variant="ghost" shape="rect">
                Tüm loglar
              </Button>
            </Link>
          }
        >
          {alerts.length === 0 ? (
            <div className="px-5 py-8 text-center text-[13px] text-ink-3">
              Şu an dikkat gerektiren bir şey yok.
            </div>
          ) : (
            <ul className="divide-y divide-line">
              {alerts.map(({ event, human }, i) => (
                <li key={`${event.at}-${i}`} className="flex gap-3 px-5 py-2.5">
                  <span
                    aria-hidden
                    className={cx(
                      "mt-1.5 size-1.5 shrink-0 rounded-full",
                      human.severity === "error" ? "bg-down" : "bg-warn",
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] text-ink">{human.title}</div>
                    <div className="truncate text-[11.5px] text-ink-3">
                      {typeof event.payload?.message === "string"
                        ? event.payload.message
                        : (human.detail ?? "")}
                    </div>
                  </div>
                  <span className="shrink-0 text-[11px] text-ink-3">{time(event.at)}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>

      {/* Açık pozisyonlar */}
      <Section
        title="Açık pozisyonlar"
        description="Şu an piyasada duran pozisyonlar. Stop seviyeleri girişin altındadır ve aşağı indirilmez."
        padded={false}
        actions={
          <Link href="/pozisyonlar">
            <Button size="sm" variant="ghost" shape="rect">
              Tümü
            </Button>
          </Link>
        }
      >
        {positions.length === 0 ? (
          <Empty
            title="Açık pozisyon yok"
            description="Botlar şu an piyasada değil. Puanı giriş eşiğini geçen bir aday çıktığında ve risk sınırları elverdiğinde pozisyon açılır."
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
                <th className="col-num">K/Z</th>
                <th className="col-num">%</th>
                <th>Süre</th>
              </>
            }
          >
            {positions.slice(0, 8).map((p) => (
              <tr key={p.id}>
                <td className="font-mono text-[12.5px]">{p.symbol}</td>
                <td className="col-num">{price(p.entry_price)}</td>
                <td className="col-num">{price(p.last_price)}</td>
                <td className="col-num text-ink-2">{price(p.stop)}</td>
                <td className="col-num">
                  <Signed value={p.unrealized_pnl} text={money(p.unrealized_pnl)} size="sm" />
                </td>
                <td className="col-num">
                  <Signed
                    value={p.unrealized_pct}
                    text={pctSigned(p.unrealized_pct)}
                    size="sm"
                  />
                </td>
                <td className="text-[12px] text-ink-3">{relative(p.entry_time)}</td>
              </tr>
            ))}
          </SimpleTable>
        )}
      </Section>
    </Page>
  );
}

/* ------------------------------------------------------------------ */
/*  Sistem uyarı şeridi                                                */
/* ------------------------------------------------------------------ */

/**
 * Sistemin çalışmasını engelleyen durumları en üstte ve açıkça söyler.
 *
 * Boş havuz ya da bayat veri sessizce geçilirse kullanıcı "bot neden işlem
 * açmıyor" sorusunun cevabını aramakla vakit kaybeder.
 */
function SystemBanner({
  status,
  stalePrices,
}: {
  status: SystemStatus;
  stalePrices: string[];
}) {
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
      text: `${stalePrices.length} sembolün güncel fiyatı bilinmiyor (${stalePrices.slice(0, 3).join(", ")}${stalePrices.length > 3 ? "…" : ""}). Gerçekleşmemiş kâr/zarar eksik hesaplanmış olabilir.`,
    });
  }

  if (problems.length === 0) return null;

  return (
    <div className="space-y-2">
      {problems.map((p, i) => (
        <div
          key={i}
          className={cx(
            "flex items-start gap-2.5 rounded-xl border px-4 py-3 text-[13px]",
            p.tone === "error"
              ? "border-down/30 bg-down-soft"
              : "border-warn/30 bg-warn-soft",
          )}
        >
          <span
            aria-hidden
            className={cx(
              "mt-1.5 size-1.5 shrink-0 rounded-full",
              p.tone === "error" ? "bg-down" : "bg-warn",
            )}
          />
          <span className="text-ink">{p.text}</span>
          <Link
            href="/loglar"
            className="ml-auto shrink-0 text-[12.5px] text-ink-2 underline underline-offset-2 hover:text-ink"
          >
            Loglara bak
          </Link>
        </div>
      ))}
    </div>
  );
}

