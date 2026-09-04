"use client";

/**
 * POZİSYONLAR v3 — DESIGN-V3 §4.5.
 *
 * Manşet · Özet (maliyet figürleri, tek blokta) · sekmeler URL'de
 * (`?tab=acik|islemler|emirler`). Sayfanın asıl fikri **R**: sonuç, göze
 * alınan riske bölünür; R sütunu her tabloda vardır ve gizlenemez.
 */

import { Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { UnderlineTabs } from "uicean";
import Link from "next/link";
import {
  api,
  type Bot,
  type CostSummary,
  type Order,
  type Position,
  type ScoreDetail,
  type Trade,
} from "@/lib/api";
import {
  bps,
  dateTime,
  duration,
  money,
  num,
  pct,
  pctSigned,
  price,
  relative,
  rMultiple,
} from "@/lib/format";
import { Page, GuideSection } from "@/shell/page";
import { Panel, Tag, Tip } from "@/design/primitives";
import { ExitReasonPill, OrderStatusPill } from "@/design/pills";
import { ErrorBox } from "@/design/state";
import { Delta, Metric, NumCell, NumText } from "@/design/numeric";
/* uicean `RangeBar` 44px'lik yeşil çizgili hedef çubuğudur — hücreye
   sığmaz ve yeşil yön anlamı taşır; stop mesafesi ve puan için token'lı
   `Bar` kalır, çekmecede `RangeDot`. */
import { Bar, RangeDot } from "@/design/viz";
import { Drawer, DrawerSection, KeyValue } from "@/design/drawer";
import { ScoreCard } from "@/design/score-card";
import { TradeShareCard } from "@/design/win-card";
import { DataGrid } from "@/grid/data-grid";
import type { GridColumn } from "@/grid/types";
import { marketOf } from "../piyasa/ortak";

/* Sekme adres çubuğunda yaşar: `?tab=acik|islemler|emirler`. Başka
   sayfalar `/pozisyonlar?tab=islemler` diye bağlanır. */
type Tab = "acik" | "islemler" | "emirler";
const TABS: { id: Tab; label: string }[] = [
  { id: "acik", label: "Açık pozisyonlar" },
  { id: "islemler", label: "Kapanmış işlemler" },
  { id: "emirler", label: "Emirler" },
];

/*
 * Boş tablo tek başına "kayıt yok" demez — "veri gelmedi" de olabilir.
 * İkisini aynı göstermek veri yokluğunu ölçüm sonucu gibi sunar: API
 * kapalıyken sayfa 11 açık pozisyonu "açık pozisyon yok" diye anlatıyordu.
 */
type SorguDurumu = { isLoading: boolean; isError: boolean; error?: unknown };

function sorguHatasi(query: SorguDurumu): string {
  return query.error instanceof Error ? query.error.message : String(query.error ?? "");
}

/*
 * `useSearchParams` bir Suspense sınırı ister; yoksa derleme sırasında
 * uyarı verir ve sayfa tamamen istemci tarafına kaçar.
 */
export default function PositionsPage() {
  return (
    <Suspense
      fallback={<div className="px-8 py-8 text-[13px] text-ink-3">Yükleniyor…</div>}
    >
      <PositionsContent />
    </Suspense>
  );
}

function PositionsContent() {
  const search = useSearchParams();
  const router = useRouter();
  const requested = search.get("tab");
  const tab: Tab = TABS.some((entry) => entry.id === requested) ? (requested as Tab) : "acik";
  const setTab = (next: string) => {
    const query = new URLSearchParams(search.toString());
    query.set("tab", next);
    router.replace(`/pozisyonlar?${query.toString()}`, { scroll: false });
  };

  const open = useQuery({
    queryKey: ["positions", "open"],
    queryFn: () => api.get<Position[]>("/positions", { status_filter: "OPEN" }),
    refetchInterval: 20_000,
  });
  const trades = useQuery({
    queryKey: ["trades"],
    queryFn: () => api.get<Trade[]>("/trades", { limit: 500 }),
    refetchInterval: 60_000,
  });
  const orders = useQuery({
    queryKey: ["orders"],
    queryFn: () => api.get<Order[]>("/orders", { limit: 300 }),
    refetchInterval: 60_000,
  });
  /* Bot sütunu ham id yerine ad basar; durmuş botun açık pozisyonu ayrıca
     işaretlenir. Uç zaten var, eşleştirme istemcide. */
  const bots = useQuery({
    queryKey: ["bots"],
    queryFn: () => api.get<Bot[]>("/bots"),
    refetchInterval: 60_000,
  });
  const botlar = useMemo(() => new Map((bots.data ?? []).map((b) => [b.id, b])), [bots.data]);

  return (
    <Page
      title="Pozisyonlar"
      summary="Piyasada duran pozisyonlar, kapanmış işlemler ve gönderilen emirler."
      stamp={open.dataUpdatedAt ? `${relative(new Date(open.dataUpdatedAt).toISOString())} tazelendi` : undefined}
      guide={
        <>
          <GuideSection title="Nasıl okunur">
            <p>
              <strong>R (risk birimi)</strong> en önemli sütundur: sonuç, o işlemde göze alınan
              riske bölünür. +2R, riskin iki katı kazanç demektir.
            </p>
            <p>
              <strong>Stop</strong> her zaman girişin altındadır ve aşağı indirilmez; başabaşa
              çekme ve iz süren stop kârın bir kısmını kilitler. <strong>MFE / MAE</strong> işlemin
              en iyi ve en kötü anıdır.
            </p>
          </GuideSection>
          <GuideSection title="Ne yapabilirim">
            <p>
              Maliyet payı %30&apos;u geçiyorsa strateji fazla işlem yapıyor demektir. Kapanmış bir
              işlemin satırına tıklayıp paylaşılabilir kartını alabilirsiniz.
            </p>
          </GuideSection>
        </>
      }
    >
      <CostPanel />

      <UnderlineTabs items={TABS} value={tab} onChange={setTab} accent="var(--sn-brand)" />

      {tab === "acik" && <OpenPositions rows={open.data ?? []} query={open} botlar={botlar} />}
      {tab === "islemler" && <ClosedTrades rows={trades.data ?? []} query={trades} />}
      {tab === "emirler" && <Orders rows={orders.data ?? []} query={orders} />}
    </Page>
  );
}

/* ------------------------------------------------------------------ */
/*  Maliyet                                                            */
/* ------------------------------------------------------------------ */

/**
 * Komisyonun brüt kârdan aldığı pay.
 *
 * Kayma bu metriklerde ayrı bir kalem DEĞİLDİR: dolum fiyatlarının içinde
 * olduğu için brüt kârdan zaten düşülmüştür (`api/routes/portfolio.py`:
 * `gross = net + fees` ve `fees` yalnızca komisyon toplamıdır). Bu yüzden
 * "maliyet payı" kaymayı kapsamaz; kayma yanda baz puan olarak gösterilir.
 *
 * Ayrı bir bölüm olmasının sebebi: maliyet, tek tek işlemlere bakarken
 * görünmez. İşlem başına 8 baz puan önemsiz görünür; 400 işlemde brüt
 * kârın yarısı olur.
 */
function CostPanel() {
  const { data } = useQuery({
    queryKey: ["costs"],
    queryFn: () => api.get<CostSummary>("/portfolio/costs"),
    refetchInterval: 120_000,
  });

  if (!data || data.trades === 0) return null;

  const heavy = data.cost_ratio !== null && data.cost_ratio > 0.3;
  const measured = data.measured_spread;

  return (
    <Panel title="Özet" description="Kapanmış işlemlerin toplamı ve maliyetin brüt kârdan aldığı pay.">
      <div className="grid grid-cols-2 gap-x-6 gap-y-4 lg:grid-cols-4">
        <Metric
          label="Brüt kâr/zarar"
          value={data.gross_pnl}
          format={(value) => money(value)}
          sub={`${num(data.trades, 0)} kapanmış işlem`}
        />
        <Metric
          label="Komisyon"
          value={-Math.abs(data.fees)}
          format={(value) => money(value)}
          sub={
            data.avg_slippage_bps !== null
              ? `ortalama kayma ${bps(data.avg_slippage_bps)}`
              : "kayma ölçülmedi"
          }
        />
        <Metric
          label="Net kâr/zarar"
          value={data.net_pnl}
          format={(value) => money(value)}
          sub="cebe giren"
        />
        <Metric
          label="Maliyet payı"
          value={data.cost_ratio}
          format={(value) => (value === null || value === undefined ? "—" : pct(value, 1))}
          accent={heavy ? "var(--sn-warn)" : undefined}
          sub={
            data.cost_ratio === null
              ? "brüt zararda — pay hesaplanmaz"
              : heavy
                ? "%30 üstü: strateji fazla işlem yapıyor"
                : measured?.one_way_bps !== undefined
                  ? `komisyonun payı · ölçülen tek yön ${bps(measured.one_way_bps)}`
                  : "brüt kârın komisyona giden kısmı"
          }
        />
      </div>
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/*  Açık pozisyonlar                                                   */
/* ------------------------------------------------------------------ */

function OpenPositions({
  rows,
  query,
  botlar,
}: {
  rows: Position[];
  query: SorguDurumu;
  botlar: Map<number, Bot>;
}) {
  const [selected, setSelected] = useState<Position | null>(null);

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
          <span className="inline-flex items-center gap-1.5">
            <span className="sn-num text-[13px] text-ink">
              {row.symbol}
            </span>
            {row.leverage > 1 && (
              <Tag tone="brand">
                kaldıraç <span className="sn-num">{`${num(row.leverage, 0)}×`}</span>
              </Tag>
            )}
          </span>
        ),
      },
      {
        id: "entry_time",
        header: "Süre",
        width: 96,
        hint: "Pozisyonun açık kaldığı süre.",
        value: (row) => new Date(row.entry_time).getTime(),
        cell: (row) => (
          <span className="sn-num text-[12.5px] text-ink-2">{relative(row.entry_time)}</span>
        ),
      },
      {
        id: "qty",
        header: "Miktar",
        width: 120,
        num: true,
        value: (row) => row.qty,
        cell: (row) => <NumCell value={row.qty} text={num(row.qty, 4)} size="sm" tint={false} />,
      },
      {
        id: "entry_price",
        header: "Giriş",
        width: 120,
        num: true,
        value: (row) => row.entry_price,
        cell: (row) => <NumCell value={row.entry_price} text={price(row.entry_price)} tint={false} />,
      },
      {
        id: "last_price",
        header: "Güncel",
        width: 120,
        num: true,
        hint: "Son işlem fiyatı. Piyasa verisi kesilirse bu sayı donar; üst çubuk bunu ayrıca yazar.",
        value: (row) => row.last_price,
        cell: (row) => <NumCell value={row.last_price} text={price(row.last_price)} />,
      },
      {
        id: "stop",
        header: "Stop",
        width: 148,
        num: true,
        hint: "Zararı kesme fiyatı. Girişin altındadır ve aşağı indirilmez; başabaşa çekilmiş olabilir.",
        value: (row) => row.stop,
        cell: (row) => (
          <span className="inline-flex items-center gap-1.5">
            {row.breakeven_locked && (
              <Tip content="Stop başabaşa çekildi: bu pozisyon artık zarar yazamaz.">
                <span>
                  <Tag tone="info">BE</Tag>
                </span>
              </Tip>
            )}
            <NumCell value={row.stop} text={price(row.stop)} tint={false} />
          </span>
        ),
      },
      {
        id: "stop_distance",
        header: "Stop mesafesi",
        width: 136,
        num: true,
        hint: "Güncel fiyatın stopa uzaklığı: (güncel − stop) / güncel. Sıfıra yaklaştıkça pozisyon stopa yakındır; eksi değer fiyatın stopun altına indiğini gösterir. Çubuk %10'da dolar.",
        value: (row) => stopMesafesi(row),
        cell: (row) => {
          const mesafe = stopMesafesi(row);
          return (
            <span className="inline-flex items-center gap-2">
              <Bar value={mesafe === null ? null : Math.abs(mesafe) * 100} max={10} width={26} height={3} />
              <NumCell value={mesafe} text={pctSigned(mesafe)} size="sm" />
            </span>
          );
        },
      },
      {
        id: "risk",
        header: "Açık risk",
        width: 118,
        num: true,
        hint: "Fiyat buradan stopa düşerse geri verilecek tutar: (güncel fiyat − stop) × miktar. Stop girişin üstüne çekilmişse bu tutar kilitlenmiş kârdan gider, sermayeden değil.",
        value: (row) => openRisk(row),
        cell: (row) => {
          const risk = openRisk(row);
          return <NumCell value={risk} text={money(risk)} size="sm" tint={false} />;
        },
        footer: (list) => (
          <NumText text={money(list.reduce((sum, row) => sum + (openRisk(row) ?? 0), 0))} size="sm" />
        ),
      },
      {
        id: "unrealized_pnl",
        header: "K/Z",
        width: 126,
        num: true,
        hint: "Gerçekleşmemiş kâr/zarar. Pozisyon kapanana kadar değişir — cebe girmiş sayılmaz.",
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
        hint: "Pozisyon açılırken sembolün puanı. Düşük puanla açılmış bir pozisyon, eşiğin gevşediğini gösterebilir.",
        value: (row) => row.score_at_entry,
        cell: (row) => (
          <span className="inline-flex items-center gap-2">
            <Bar value={row.score_at_entry} width={26} height={3} />
            <NumCell value={row.score_at_entry} text={num(row.score_at_entry, 1)} size="sm" tint={false} />
          </span>
        ),
      },
      {
        id: "bot_id",
        header: "Bot",
        width: 168,
        value: (row) => botlar.get(row.bot_id)?.name ?? row.bot_id,
        search: (row) => botlar.get(row.bot_id)?.name ?? String(row.bot_id),
        cell: (row) => {
          const bot = botlar.get(row.bot_id);
          const durmus = bot && bot.state !== "PAPER_RUNNING" && bot.state !== "DEGRADED";
          return (
            <span className="inline-flex max-w-full items-center gap-1.5">
              <span className="truncate text-[12.5px] text-ink-2" title={bot?.name ?? `Bot ${row.bot_id}`}>
                {bot?.name ?? `Bot ${row.bot_id}`}
              </span>
              {durmus && <Tag tone="warn">bot durdu</Tag>}
            </span>
          );
        },
      },
    ],
    [botlar],
  );

  if (query.isError) {
    return (
      <Panel title="Açık pozisyonlar">
        <ErrorBox message={sorguHatasi(query)} />
      </Panel>
    );
  }

  return (
    <>
      <Panel
        title="Açık pozisyonlar"
        description="Satıra tıklayın: sayılar ve girişteki puan kartı."
        padded={false}
      >
        <DataGrid
          rows={rows}
          columns={columns}
          rowKey={(row) => String(row.id)}
          onRowClick={setSelected}
          storageKey="pozisyonlar-acik"
          searchPlaceholder="Sembol ara…"
          defaultSort={[{ id: "unrealized_pnl", desc: true }]}
          rowAccent={(row) =>
            row.unrealized_pnl === null
              ? null
              : row.unrealized_pnl >= 0
                ? "var(--sn-up)"
                : "var(--sn-down)"
          }
          emptyTitle={query.isLoading ? "Yükleniyor…" : "Açık pozisyon yok"}
          emptyHint={
            query.isLoading
              ? undefined
              : "Botlar puan eşiğini geçen bir aday bulduğunda pozisyon açar. Eşiği geçen aday yoksa beklemek doğru davranıştır."
          }
        />
      </Panel>

      <Drawer
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title={selected?.symbol ?? ""}
        subtitle={
          selected
            ? `${botlar.get(selected.bot_id)?.name ?? `Bot ${selected.bot_id}`} · ${dateTime(selected.entry_time)}`
            : undefined
        }
      >
        {selected && (
          <>
            <div className="flex items-baseline gap-3">
              <Delta value={selected.unrealized_pnl} format={(value) => money(value)} size="hero" />
              <span className="text-[12.5px] text-ink-3">gerçekleşmemiş</span>
            </div>

            <DrawerSection
              title="Fiyatın stop ile giriş arasındaki yeri"
              hint="Nokta stopa yaklaştıkça pozisyon riske yaklaşır. Stop girişin üstündeyse pozisyon başabaşa kilitlenmiştir."
            >
              <RangeDot
                value={selected.last_price}
                low={selected.stop}
                high={Math.max(selected.entry_price, selected.last_price ?? selected.entry_price)}
                lowLabel={`stop ${price(selected.stop)}`}
                highLabel={`giriş ${price(selected.entry_price)}`}
              />
            </DrawerSection>

            <DrawerSection title="Sayılar">
              <KeyValue
                rows={[
                  { label: "Miktar", value: <NumText text={num(selected.qty, 6)} size="sm" /> },
                  { label: "Giriş fiyatı", value: <NumText text={price(selected.entry_price)} size="sm" /> },
                  { label: "Güncel fiyat", value: <NumText text={price(selected.last_price)} size="sm" /> },
                  { label: "Stop", value: <NumText text={price(selected.stop)} size="sm" /> },
                  {
                    label: "İlk stop",
                    value: <NumText text={price(selected.initial_stop)} size="sm" />,
                  },
                  {
                    label: "Açık risk",
                    value: <NumText text={money(openRisk(selected))} size="sm" />,
                  },
                  {
                    label: "Girişteki puan",
                    value: <NumText text={num(selected.score_at_entry, 1)} size="sm" />,
                  },
                  {
                    label: "Kaldıraç",
                    value:
                      selected.leverage > 1 ? (
                        <Tag tone="brand" mono>{`${num(selected.leverage, 0)}×`}</Tag>
                      ) : (
                        <NumText text="1× (spot)" size="sm" />
                      ),
                  },
                  {
                    label: "Başabaş kilidi",
                    value: selected.breakeven_locked ? (
                      <Tag tone="info">kilitli</Tag>
                    ) : (
                      <Tag tone="neutral">yok</Tag>
                    ),
                  },
                ]}
              />
            </DrawerSection>

            <GirisGerekcesi rationaleId={selected.rationale_id} symbol={selected.symbol} />
          </>
        )}
      </Drawer>
    </>
  );
}

/**
 * Girişteki puan kartı — pozisyon açılırkenki gerekçe.
 *
 * Sembolün BUGÜNKÜ puanını basmak yalan olurdu; `rationale_id` giriş
 * anındaki `scores` satırına işaret eder ve `/scores/by-id` onu döndürür.
 */
function GirisGerekcesi({ rationaleId, symbol }: { rationaleId: number | null; symbol: string }) {
  const q = useQuery({
    queryKey: ["score-by-id", rationaleId],
    queryFn: () => api.get<ScoreDetail>(`/scores/by-id/${rationaleId}`),
    enabled: rationaleId !== null,
  });
  if (rationaleId === null) {
    return (
      <DrawerSection title="Giriş gerekçesi">
        <p className="text-[12.5px] text-ink-3">Bu pozisyon için gerekçe kaydı yok (eski bir giriş olabilir).</p>
      </DrawerSection>
    );
  }
  return (
    <DrawerSection
      title="Giriş gerekçesi"
      hint="Pozisyon açıldığı andaki puan kartı — bugünkü puan değil."
    >
      {q.isError ? (
        <p className="text-[12.5px] text-ink-3">Gerekçe getirilemedi.</p>
      ) : q.data ? (
        <>
          <ScoreCard rationale={q.data.rationale} compact />
          <div className="mt-2">
            <Link
              href={`/piyasa?sembol=${encodeURIComponent(symbol)}${marketOf(symbol) === "CRYPTO" ? "" : `&market=${marketOf(symbol)}`}`}
              className="text-[12.5px] text-brand hover:underline"
            >
              Piyasa sayfasında aç →
            </Link>
          </div>
        </>
      ) : (
        <p className="text-[12.5px] text-ink-3">Yükleniyor…</p>
      )}
    </DrawerSection>
  );
}

/**
 * Fiyat buradan stopa düşerse geri verilecek tutar.
 *
 * Referans giriş değil **güncel fiyattır**: stop trail edildikçe açık risk
 * düşer, başabaşa çekildiğinde sermaye riski biter. Sütunun ipucu önceden
 * `(giriş − stop)` diyordu — o ilk risktir (R birimi), bu ise şu anki risk.
 * İkisi farklı büyüklük; ipucu hesabın söylediğini söylemeli.
 */
function openRisk(position: Position): number | null {
  if (!Number.isFinite(position.qty) || !Number.isFinite(position.stop)) return null;
  const reference = position.last_price ?? position.entry_price;
  return (reference - position.stop) * position.qty;
}

/** Güncel fiyatın stopa oransal uzaklığı: (güncel − stop) / güncel. */
function stopMesafesi(position: Position): number | null {
  const last = position.last_price;
  if (last === null || !Number.isFinite(last) || last <= 0 || !Number.isFinite(position.stop)) return null;
  return (last - position.stop) / last;
}

/* ------------------------------------------------------------------ */
/*  Kapanmış işlemler                                                  */
/* ------------------------------------------------------------------ */

function ClosedTrades({ rows, query }: { rows: Trade[]; query: SorguDurumu }) {
  /* Satıra tıkla → paylaşılabilir işlem kartı (PNG indirilebilir). */
  const [paylas, setPaylas] = useState<Trade | null>(null);
  const columns = useMemo<GridColumn<Trade>[]>(
    () => [
      {
        id: "symbol",
        header: "Sembol",
        width: 130,
        pin: true,
        value: (row) => row.symbol,
        search: (row) => `${row.symbol} ${row.exit_reason}`,
        cell: (row) => (
          <span className="sn-num text-[13px] text-ink">
            {row.symbol}
          </span>
        ),
      },
      {
        id: "exit_time",
        header: "Kapanış",
        width: 148,
        value: (row) => new Date(row.exit_time).getTime(),
        cell: (row) => (
          <NumText text={dateTime(row.exit_time)} size="sm" />
        ),
      },
      {
        id: "pnl_r",
        header: "Sonuç (R)",
        width: 128,
        num: true,
        hint: "İşlemin sonucu, o işlemde göze alınan riske bölünmüş hâli. +2R, riskin iki katı kazanç demektir.",
        value: (row) => row.pnl_r,
        cell: (row) => <NumCell value={row.pnl_r} text={rMultiple(row.pnl_r)} colorize tint={false} />,
        footer: (list) =>
          list.length ? (
            <NumText
              text={rMultiple(list.reduce((sum, row) => sum + row.pnl_r, 0) / list.length)}
              size="sm"
            />
          ) : null,
      },
      {
        id: "pnl",
        header: "K/Z",
        width: 124,
        num: true,
        value: (row) => row.pnl,
        cell: (row) => <NumCell value={row.pnl} text={money(row.pnl)} colorize tint={false} />,
        footer: (list) => (
          <NumText text={money(list.reduce((sum, row) => sum + row.pnl, 0))} size="sm" />
        ),
      },
      {
        id: "exit_reason",
        header: "Çıkış sebebi",
        width: 152,
        hint: "Pozisyonu ne kapattı: stop, hedef, iz süren stop, puan düşüşü ya da kill switch.",
        value: (row) => row.exit_reason,
        cell: (row) => <ExitReasonPill reason={row.exit_reason} />,
      },
      {
        id: "hold_hours",
        header: "Süre",
        width: 96,
        num: true,
        value: (row) => row.hold_hours,
        cell: (row) => (
          <span className="sn-num text-[12.5px] text-ink-2">{duration(row.hold_hours)}</span>
        ),
      },
      {
        id: "mfe",
        header: "MFE",
        width: 108,
        num: true,
        hint: "İşlemin gördüğü en iyi nokta. Yüksek MFE ile düşük sonuç, kârın geri verildiğini gösterir.",
        value: (row) => row.mfe,
        cell: (row) => <NumCell value={row.mfe} text={num(row.mfe, 2)} size="sm" tint={false} />,
      },
      {
        id: "mae",
        header: "MAE",
        width: 108,
        num: true,
        hint: "İşlemin gördüğü en kötü nokta. Sürekli yüksek MAE, girişlerin erken olduğunu gösterebilir.",
        value: (row) => row.mae,
        cell: (row) => <NumCell value={row.mae} text={num(row.mae, 2)} size="sm" tint={false} />,
      },
      {
        id: "fees",
        header: "Komisyon",
        width: 110,
        num: true,
        hidden: true,
        value: (row) => row.fees,
        cell: (row) => <NumCell value={row.fees} text={money(row.fees)} size="sm" tint={false} />,
      },
      {
        id: "slippage_bps",
        header: "Kayma",
        width: 104,
        num: true,
        hidden: true,
        hint: "Beklenen fiyatla gerçekleşen fiyat arasındaki fark. Kağıt motorun modelinden gelir, varsayım içerir.",
        value: (row) => row.slippage_bps,
        cell: (row) => (
          <NumCell value={row.slippage_bps} text={bps(row.slippage_bps)} size="sm" tint={false} />
        ),
      },
    ],
    [],
  );

  if (query.isError) {
    return (
      <Panel title="Kapanmış işlemler">
        <ErrorBox message={sorguHatasi(query)} />
      </Panel>
    );
  }

  return (
    <Panel
      title="Kapanmış işlemler"
      description="En yeniden eskiye. Satıra tıklayın: paylaşılabilir işlem kartı."
      padded={false}
    >
      <TradeShareCard trade={paylas} onClose={() => setPaylas(null)} />
      <DataGrid
        rows={rows}
        columns={columns}
        onRowClick={setPaylas}
        rowKey={(row) => String(row.id)}
        storageKey="pozisyonlar-kapali"
        searchPlaceholder="Sembol ya da çıkış sebebi…"
        defaultSort={[{ id: "exit_time", desc: true }]}
        rowAccent={(row) => (row.pnl_r >= 0 ? "var(--sn-up)" : "var(--sn-down)")}
        emptyTitle={query.isLoading ? "Yükleniyor…" : "Kapanmış işlem yok"}
        emptyHint={
          query.isLoading
            ? undefined
            : "Bir pozisyon kapandığında sonucu burada R cinsinden görünür."
        }
      />
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/*  Emirler                                                            */
/* ------------------------------------------------------------------ */

function Orders({ rows, query }: { rows: Order[]; query: SorguDurumu }) {
  const columns = useMemo<GridColumn<Order>[]>(
    () => [
      {
        id: "created_at",
        header: "Zaman",
        width: 148,
        pin: true,
        value: (row) => new Date(row.created_at).getTime(),
        cell: (row) => (
          <NumText text={dateTime(row.created_at)} size="sm" />
        ),
      },
      {
        id: "symbol",
        header: "Sembol",
        width: 126,
        value: (row) => row.symbol,
        search: (row) => `${row.symbol} ${row.status} ${row.reject_reason ?? ""}`,
        cell: (row) => (
          <span className="sn-num text-[13px] text-ink">
            {row.symbol}
          </span>
        ),
      },
      {
        id: "side",
        header: "Yön",
        width: 84,
        value: (row) => row.side,
        cell: (row) => (
          <Tag tone={row.side.toUpperCase() === "BUY" ? "up" : "down"}>
            {row.side.toUpperCase() === "BUY" ? "Alış" : "Satış"}
          </Tag>
        ),
      },
      {
        id: "type",
        header: "Tür",
        width: 96,
        value: (row) => row.type,
        cell: (row) => (
          <Tag tone="neutral">{row.type.toUpperCase() === "MARKET" ? "Piyasa" : "Limit"}</Tag>
        ),
      },
      {
        id: "status",
        header: "Durum",
        width: 116,
        hint: "Reddedilen emir sessizce kaybolmaz — sebebi yanındaki sütunda yazar.",
        value: (row) => row.status,
        cell: (row) => <OrderStatusPill status={row.status} />,
      },
      {
        id: "qty",
        header: "Miktar",
        width: 120,
        num: true,
        value: (row) => row.qty,
        cell: (row) => <NumCell value={row.qty} text={num(row.qty, 4)} size="sm" tint={false} />,
      },
      {
        id: "filled_qty",
        header: "Dolan",
        width: 128,
        num: true,
        hint: "Kısmi dolum: emrin ne kadarı gerçekleşti.",
        value: (row) => (row.qty > 0 ? row.filled_qty / row.qty : null),
        cell: (row) => (
          <span className="inline-flex items-center gap-2">
            <Bar value={row.qty > 0 ? (row.filled_qty / row.qty) * 100 : 0} width={24} height={3} />
            <NumCell value={row.filled_qty} text={num(row.filled_qty, 4)} size="sm" tint={false} />
          </span>
        ),
      },
      {
        id: "avg_fill_price",
        header: "Ortalama fiyat",
        width: 132,
        num: true,
        value: (row) => row.avg_fill_price,
        cell: (row) => (
          <NumCell value={row.avg_fill_price} text={price(row.avg_fill_price)} tint={false} />
        ),
      },
      {
        id: "reject_reason",
        header: "Red sebebi",
        width: 220,
        value: (row) => row.reject_reason,
        cell: (row) =>
          row.reject_reason ? (
            <span className="text-[12.5px] text-ink-2">{row.reject_reason}</span>
          ) : (
            <NumText text="—" size="sm" />
          ),
      },
    ],
    [],
  );

  if (query.isError) {
    return (
      <Panel title="Emirler">
        <ErrorBox message={sorguHatasi(query)} />
      </Panel>
    );
  }

  return (
    <Panel
      title="Emirler"
      description="Dolmuş, kısmi dolmuş ya da reddedilmiş — reddedilen emir sessizce kaybolmaz."
      padded={false}
    >
      <DataGrid
        rows={rows}
        columns={columns}
        rowKey={(row) => String(row.id)}
        storageKey="pozisyonlar-emirler"
        searchPlaceholder="Sembol, durum ya da red sebebi…"
        defaultSort={[{ id: "created_at", desc: true }]}
        emptyTitle={query.isLoading ? "Yükleniyor…" : "Emir yok"}
        emptyHint={
          query.isLoading ? undefined : "Botlar pozisyon açtığında emirler burada görünür."
        }
      />
    </Panel>
  );
}
