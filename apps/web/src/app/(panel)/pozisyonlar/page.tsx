"use client";

/**
 * Pozisyonlar — açık pozisyonlar, kapanmış işlemler ve emir defteri.
 *
 * Sayfanın taşıdığı asıl fikir **R**'dir: bir işlemin sonucu, o işlemde
 * göze alınan riske bölünür. İki işlemin TL kârını doğrudan karşılaştırmak
 * yanıltıcıdır — biri büyük pozisyonla küçük hareket, öbürü küçük
 * pozisyonla büyük hareket yakalamış olabilir. Bu yüzden R sütunu her
 * tabloda vardır ve gizlenemez.
 */

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, type CostSummary, type Order, type Position, type Trade } from "@/lib/api";
import {
  bps,
  dateTime,
  duration,
  money,
  num,
  pct,
  price,
  relative,
  rMultiple,
} from "@/lib/format";
import { Page, GuideSection } from "@/shell/page";
import { Panel, Segmented, Tag, Tip } from "@/design/primitives";
import { ErrorBox } from "@/design/state";
import { Delta, Metric, NumCell, NumText } from "@/design/numeric";
import { Bar, RangeDot } from "@/design/viz";
import { Drawer, DrawerSection, KeyValue } from "@/design/drawer";
import { DataGrid } from "@/grid/data-grid";
import type { GridColumn } from "@/grid/types";

type Tab = "acik" | "kapali" | "emirler";

/*
 * Boş tablo tek başına "kayıt yok" demez — "veri gelmedi" de olabilir.
 * İkisini aynı göstermek veri yokluğunu ölçüm sonucu gibi sunar: API
 * kapalıyken sayfa 11 açık pozisyonu "açık pozisyon yok" diye anlatıyordu.
 */
type SorguDurumu = { isLoading: boolean; isError: boolean; error?: unknown };

function sorguHatasi(query: SorguDurumu): string {
  return query.error instanceof Error ? query.error.message : String(query.error ?? "");
}

export default function PositionsPage() {
  const [tab, setTab] = useState<Tab>("acik");

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

  return (
    <Page
      title="Pozisyonlar"
      summary="Şu an piyasada duran pozisyonlar, kapanmış işlemler ve gönderilen emirler."
      guide={
        <>
          <GuideSection title="Ne gösteriyor">
            <p>
              Botların açtığı her pozisyon ve kapanan her işlem burada. Emirler sekmesi, gönderilen
              ama dolmayan ya da reddedilen emirleri de gösterir — reddedilen bir emir sessizce
              kaybolmaz.
            </p>
          </GuideSection>
          <GuideSection title="Nasıl okunur">
            <p>
              <strong>R (risk birimi)</strong> bu sayfadaki en önemli sütundur. Bir işlemin sonucu,
              o işlemde göze alınan riske bölünür: +2R, riskin iki katı kazanç demektir.
            </p>
            <p>
              <strong>Stop</strong> her zaman girişin altındadır ve aşağı indirilmez. Yukarı
              taşınabilir: başabaşa çekme ve iz süren stop kârın bir kısmını kilitler.
            </p>
            <p>
              <strong>MFE / MAE</strong> işlemin en iyi ve en kötü anını gösterir. Yüksek MFE ile
              düşük sonuç, kârın geri verildiği anlamına gelir — çıkış kuralı gözden geçirilmeli.
            </p>
          </GuideSection>
          <GuideSection title="Ne yapabilirim">
            <p>
              Maliyet payı %30&apos;u geçiyorsa strateji fazla işlem yapıyor demektir. Aşağıdaki
              maliyet bölümü bunu ölçer; komisyon ve kaymanın brüt kârın ne kadarını yediğini
              gösterir.
            </p>
          </GuideSection>
        </>
      }
    >
      <CostPanel />

      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { value: "acik", label: "Açık pozisyonlar", count: open.data?.length },
          { value: "kapali", label: "Kapanmış işlemler", count: trades.data?.length },
          { value: "emirler", label: "Emirler", count: orders.data?.length },
        ]}
      />

      {tab === "acik" && <OpenPositions rows={open.data ?? []} query={open} />}
      {tab === "kapali" && <ClosedTrades rows={trades.data ?? []} query={trades} />}
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
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
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
        accent="var(--sn-warn)"
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
        accent={data.net_pnl >= 0 ? "var(--sn-up)" : "var(--sn-down)"}
        sub="cebe giren"
      />
      <Metric
        label="Maliyet payı"
        value={data.cost_ratio}
        format={(value) => (value === null || value === undefined ? "—" : pct(value, 1))}
        accent={heavy ? "var(--sn-down)" : undefined}
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
  );
}

/* ------------------------------------------------------------------ */
/*  Açık pozisyonlar                                                   */
/* ------------------------------------------------------------------ */

function OpenPositions({ rows, query }: { rows: Position[]; query: SorguDurumu }) {
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
          <span className="sn-num" style={{ fontSize: "var(--sn-t-body)", color: "var(--sn-ink)" }}>
            {row.symbol}
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
          <span style={{ fontSize: "var(--sn-t-caption)", color: "var(--sn-ink-2)" }}>
            {relative(row.entry_time)}
          </span>
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
        width: 76,
        num: true,
        hidden: true,
        value: (row) => row.bot_id,
        cell: (row) => <NumText text={String(row.bot_id)} size="sm" />,
      },
    ],
    [],
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
        description="Piyasada duran her pozisyon. Satıra tıklayın: giriş gerekçesi ve stop geçmişi açılır."
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
        subtitle={selected ? `Bot ${selected.bot_id} · ${dateTime(selected.entry_time)}` : undefined}
      >
        {selected && (
          <>
            <div className="flex items-baseline gap-3">
              <Delta value={selected.unrealized_pnl} format={(value) => money(value)} size="hero" />
              <span style={{ fontSize: "var(--sn-t-caption)", color: "var(--sn-ink-3)" }}>
                gerçekleşmemiş
              </span>
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
          </>
        )}
      </Drawer>
    </>
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

/* ------------------------------------------------------------------ */
/*  Kapanmış işlemler                                                  */
/* ------------------------------------------------------------------ */

function ClosedTrades({ rows, query }: { rows: Trade[]; query: SorguDurumu }) {
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
          <span className="sn-num" style={{ fontSize: "var(--sn-t-body)", color: "var(--sn-ink)" }}>
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
          <span style={{ fontSize: "var(--sn-t-caption)", color: "var(--sn-ink-2)" }}>
            {dateTime(row.exit_time)}
          </span>
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
        cell: (row) => <Tag tone={exitTone(row.exit_reason)}>{row.exit_reason}</Tag>,
      },
      {
        id: "hold_hours",
        header: "Süre",
        width: 96,
        num: true,
        value: (row) => row.hold_hours,
        cell: (row) => (
          <span style={{ fontSize: "var(--sn-t-caption)", color: "var(--sn-ink-2)" }}>
            {duration(row.hold_hours)}
          </span>
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
      description="En yeniden eskiye. R sütunu işlemleri karşılaştırılabilir kılan tek ölçüdür."
      padded={false}
    >
      <DataGrid
        rows={rows}
        columns={columns}
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

function exitTone(reason: string): "up" | "down" | "warn" | "info" | "neutral" {
  const key = reason.toUpperCase();
  if (key.includes("TARGET") || key.includes("HEDEF")) return "up";
  if (key.includes("STOP")) return "down";
  if (key.includes("KILL")) return "warn";
  return "neutral";
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
          <span style={{ fontSize: "var(--sn-t-caption)", color: "var(--sn-ink-2)" }}>
            {dateTime(row.created_at)}
          </span>
        ),
      },
      {
        id: "symbol",
        header: "Sembol",
        width: 126,
        value: (row) => row.symbol,
        search: (row) => `${row.symbol} ${row.status} ${row.reject_reason ?? ""}`,
        cell: (row) => (
          <span className="sn-num" style={{ fontSize: "var(--sn-t-body)", color: "var(--sn-ink)" }}>
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
          <Tag tone={row.side.toUpperCase() === "BUY" ? "up" : "down"}>{row.side}</Tag>
        ),
      },
      {
        id: "type",
        header: "Tür",
        width: 96,
        value: (row) => row.type,
        cell: (row) => <Tag tone="neutral">{row.type}</Tag>,
      },
      {
        id: "status",
        header: "Durum",
        width: 116,
        hint: "Reddedilen emir sessizce kaybolmaz — sebebi yanındaki sütunda yazar.",
        value: (row) => row.status,
        cell: (row) => <Tag tone={orderTone(row.status)}>{row.status}</Tag>,
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
            <span style={{ fontSize: "var(--sn-t-caption)", color: "var(--sn-down)" }}>
              {row.reject_reason}
            </span>
          ) : (
            <span style={{ color: "var(--sn-ink-4)" }}>—</span>
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
      description="Gönderilen her emir — dolmuş, kısmi dolmuş ya da reddedilmiş."
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

function orderTone(status: string): "up" | "down" | "warn" | "neutral" {
  const key = status.toUpperCase();
  if (key === "FILLED") return "up";
  if (key === "REJECTED" || key === "CANCELED" || key === "CANCELLED") return "down";
  if (key === "PARTIAL" || key === "PARTIALLY_FILLED" || key === "NEW") return "warn";
  return "neutral";
}
