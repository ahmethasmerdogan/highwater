"use client";

/**
 * Pozisyonlar — açık pozisyonlar, kapanmış işlemler, emirler ve maliyet.
 *
 * Maliyet bölümü ayrı bir sekme değil, sayfanın parçası: bir stratejinin
 * kâğıt üzerinde kârlı görünüp maliyetten sonra zarara dönmesi bu üründe en
 * sık karşılaşılan yanılgıdır ve gizlenmez.
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { cx } from "@/ui";
import { api, type CostSummary, type Order, type Position, type Trade } from "@/lib/api";
import { Page, Section, StatGrid, Async } from "@/components/common/page";
import { Stat, AmountText, Signed } from "@/components/common/amount";
import { Field } from "@/components/common/explain";
import { ExitReasonPill, OrderStatusPill } from "@/components/common/pills";
import { DataTable, type Column } from "@/components/data/data-table";
import { Drawer, DrawerSection } from "@/components/data/drawer";
import { rejectReason } from "@/lib/humanize";
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

type Tab = "acik" | "kapali" | "emirler";

export default function PositionsPage() {
  const [tab, setTab] = useState<Tab>("acik");

  return (
    <Page
      title="Pozisyonlar"
      description="Şu an piyasada duran pozisyonlar, kapanmış işlemler ve gönderilen emirler."
      intro={{
        storageKey: "pozisyonlar",
        what: "Botların açtığı her pozisyon ve kapanan her işlem burada. Emirler sekmesi, gönderilen ama dolmayan ya da reddedilen emirleri de gösterir — reddedilen bir emir sessizce kaybolmaz.",
        how: "**R (risk birimi)** bu sayfadaki en önemli sütundur. Bir işlemin sonucu, o işlemde göze alınan riske bölünür: +2R, riskin iki katı kazanç demektir. İki işlemin TL kârını doğrudan karşılaştırmak yanıltıcıdır çünkü biri büyük pozisyonla küçük hareket, diğeri küçük pozisyonla büyük hareket yakalamış olabilir.\n\n**Stop** her zaman girişin altındadır ve aşağı indirilmez. Yukarı taşınabilir: başabaşa çekme ve iz süren stop kârın bir kısmını kilitler.",
        action: "Bir işlemin neden açıldığını görmek için satıra tıklayın. Maliyet payı %30'u geçiyorsa strateji fazla işlem yapıyor demektir — bunu aşağıdaki maliyet bölümünden takip edin.",
        terms: ["r_katsayisi", "stop", "basabas", "iz_suren", "mfe_mae", "kayma", "maliyet_payi", "cikis_sebebi"],
      }}
    >
      <CostPanel />

      <div className="flex flex-wrap gap-1 border-b border-line">
        {(
          [
            { id: "acik", label: "Açık pozisyonlar" },
            { id: "kapali", label: "Kapanmış işlemler" },
            { id: "emirler", label: "Emirler" },
          ] as { id: Tab; label: string }[]
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cx(
              "-mb-px border-b-2 px-3 py-2 text-[13px] transition-colors",
              tab === t.id
                ? "border-brand font-medium text-ink"
                : "border-transparent text-ink-2 hover:text-ink",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "acik" && <OpenPositions />}
      {tab === "kapali" && <ClosedTrades />}
      {tab === "emirler" && <Orders />}
    </Page>
  );
}

/* ------------------------------------------------------------------ */
/*  Maliyet                                                            */
/* ------------------------------------------------------------------ */

function CostPanel() {
  const { data } = useQuery({
    queryKey: ["costs"],
    queryFn: () => api.get<CostSummary>("/portfolio/costs"),
    refetchInterval: 120_000,
  });

  if (!data) return null;

  const ratio = data.cost_ratio;
  const measured = data.measured_spread;

  return (
    <Section
      title="İşlem maliyeti"
      term="maliyet_payi"
      description="Kârın ne kadarı komisyon ve kaymaya gidiyor. Bir strateji kâğıt üzerinde kârlı görünüp maliyetten sonra zarara dönebilir."
    >
      <StatGrid cols={4}>
        <Stat
          label="Brüt kâr"
          hint="Maliyetler düşülmeden önceki toplam sonuç."
          value={<Signed value={data.gross_pnl} text={money(data.gross_pnl)} size="lg" />}
          sub={`${data.trades} işlem`}
        />
        <Stat
          label="Komisyon"
          hint="Ödenen toplam komisyon."
          value={<AmountText text={money(data.fees)} size="lg" />}
        />
        <Stat
          label="Net kâr"
          hint="Maliyetler düşüldükten sonra gerçekten kalan tutar."
          value={<Signed value={data.net_pnl} text={money(data.net_pnl)} size="lg" />}
          tone={data.net_pnl >= 0 ? "up" : "down"}
        />
        <Stat
          label="Maliyet payı"
          hint="Brüt kârın kaçta kaçı maliyete gitti. %30'u geçiyorsa işlem sıklığı stratejinin kendi kenarını yiyor demektir. Brüt zarardaysa bu oran hesaplanamaz."
          value={<AmountText text={ratio === null ? "—" : pct(ratio)} size="lg" />}
          tone={ratio !== null && ratio > 0.3 ? "warn" : "neutral"}
        />
      </StatGrid>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border border-line px-3.5 py-1">
          <div className="border-b border-line py-2 text-[12px] font-semibold text-ink">
            Modellenmiş kayma
          </div>
          <Field
            label="Ortalama kayma"
            term="kayma"
            value={<span className="num">{bps(data.avg_slippage_bps)}</span>}
          />
          <Field
            label="En yüksek kayma"
            hint="Tek bir emirde görülen en büyük fiyat sapması."
            value={<span className="num">{bps(data.max_slippage_bps)}</span>}
          />
          <p className="py-2 text-[11.5px] leading-relaxed text-ink-3">
            Bu değerler kağıt motorun emir defteri modelinden gelir ve bir{" "}
            <strong className="text-ink-2">varsayım</strong> içerir.
          </p>
        </div>

        {measured && (
          <div className="rounded-lg border border-line px-3.5 py-1">
            <div className="border-b border-line py-2 text-[12px] font-semibold text-ink">
              Ölçülmüş spread
            </div>
            <Field
              label="Ortanca spread"
              term="spread"
              value={<span className="num">{bps(measured.median_bps)}</span>}
            />
            <Field
              label="%90'lık dilim"
              hint="Ölçümlerin %90'ı bu değerin altında kaldı. Kötü anları temsil eder."
              value={<span className="num">{bps(measured.p90_bps)}</span>}
            />
            <Field
              label="Tek yön maliyeti"
              hint="Komisyon artı yarım spread — bir alım ya da satımın gerçek maliyeti."
              value={<span className="num">{bps(measured.one_way_bps)}</span>}
            />
            {measured.assumed_one_way_bps !== undefined && (
              <Field
                label="Varsayılan (doğrulama deneyi)"
                hint="Sistemin ilk doğrulama deneyinde kullandığı varsayım. Ölçülen değer bundan yüksekse deney iyimser çıkmış demektir."
                value={<span className="num">{bps(measured.assumed_one_way_bps)}</span>}
              />
            )}
            <p className="py-2 text-[11.5px] leading-relaxed text-ink-3">
              Bu değerler gerçek emir defterinden{" "}
              <strong className="text-ink-2">ölçülmüştür</strong>, varsayım değildir.
              {measured.samples ? ` ${num(measured.samples, 0)} örnek.` : ""}
            </p>
          </div>
        )}
      </div>

      {data.note && (
        <p className="mt-3 text-[12px] text-ink-3">{data.note}</p>
      )}
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/*  Açık pozisyonlar                                                   */
/* ------------------------------------------------------------------ */

function OpenPositions() {
  const [selected, setSelected] = useState<Position | null>(null);

  const query = useQuery({
    queryKey: ["positions", "open"],
    queryFn: () => api.get<Position[]>("/positions", { status_filter: "OPEN" }),
    refetchInterval: 20_000,
  });

  const rows = query.data ?? [];
  const totalUnrealized = rows.reduce((s, p) => s + (p.unrealized_pnl ?? 0), 0);

  const columns: Column<Position>[] = [
    {
      key: "symbol",
      header: "Sembol",
      width: "120px",
      sort: (r) => r.symbol,
      cell: (r) => <span className="font-mono text-[12.5px] text-ink">{r.symbol}</span>,
    },
    {
      key: "qty",
      header: "Miktar",
      num: true,
      defaultHidden: true,
      sort: (r) => r.qty,
      cell: (r) => num(r.qty, 6),
    },
    {
      key: "entry_price",
      header: "Giriş",
      num: true,
      sort: (r) => r.entry_price,
      cell: (r) => price(r.entry_price),
    },
    {
      key: "last_price",
      header: "Güncel",
      num: true,
      sort: (r) => r.last_price,
      cell: (r) =>
        r.last_price === null ? (
          <span className="text-warn" title="Bu sembolün güncel fiyatı bilinmiyor">
            —
          </span>
        ) : (
          price(r.last_price)
        ),
    },
    {
      key: "stop",
      header: "Stop",
      num: true,
      term: "stop",
      sort: (r) => r.stop,
      cell: (r) => (
        <span className="flex items-center justify-end gap-1.5">
          {r.breakeven_locked && (
            <span
              className="rounded bg-up-soft px-1 text-[9.5px] font-medium text-up"
              title="Stop başabaşa çekildi; bu pozisyon artık zarar edemez."
            >
              başabaş
            </span>
          )}
          <span className="num text-ink-2">{price(r.stop)}</span>
        </span>
      ),
    },
    {
      key: "risk",
      header: "Açık risk",
      num: true,
      hint: "Güncel fiyattan stop'a kadar olan mesafenin pozisyon büyüklüğüyle çarpımı — şu an masada duran tutar.",
      sort: (r) => (r.last_price !== null ? (r.last_price - r.stop) * r.qty : null),
      cell: (r) => {
        if (r.last_price === null) return <span className="text-ink-3">—</span>;
        return <span className="num">{money((r.last_price - r.stop) * r.qty)}</span>;
      },
    },
    {
      key: "unrealized_pnl",
      header: "K/Z",
      num: true,
      sort: (r) => r.unrealized_pnl,
      cell: (r) => <Signed value={r.unrealized_pnl} text={money(r.unrealized_pnl)} size="sm" />,
    },
    {
      key: "unrealized_pct",
      header: "%",
      num: true,
      sort: (r) => r.unrealized_pct,
      cell: (r) => (
        <Signed value={r.unrealized_pct} text={pctSigned(r.unrealized_pct)} size="sm" />
      ),
    },
    {
      key: "score_at_entry",
      header: "Girişteki puan",
      num: true,
      term: "puan",
      sort: (r) => r.score_at_entry,
      cell: (r) => num(r.score_at_entry, 1),
    },
    {
      key: "entry_time",
      header: "Açılış",
      width: "120px",
      sort: (r) => new Date(r.entry_time).getTime(),
      cell: (r) => <span className="text-[12px] text-ink-2">{relative(r.entry_time)}</span>,
    },
  ];

  return (
    <>
      {rows.length > 0 && (
        <StatGrid cols={3}>
          <Stat
            label="Açık pozisyon"
            value={<AmountText text={`${rows.length}`} size="xl" />}
          />
          <Stat
            label="Gerçekleşmemiş K/Z"
            hint="Pozisyonlar kapanana kadar değişir. Henüz kazanılmış sayılmaz."
            value={<Signed value={totalUnrealized} text={money(totalUnrealized)} size="xl" arrow />}
            tone={totalUnrealized >= 0 ? "up" : "down"}
          />
          <Stat
            label="Fiyatı bilinmeyen"
            hint="Güncel fiyatı gelmeyen semboller. Varsa gerçekleşmemiş kâr/zarar eksik hesaplanmıştır."
            value={
              <AmountText text={`${rows.filter((r) => r.last_price === null).length}`} size="xl" />
            }
            tone={rows.some((r) => r.last_price === null) ? "warn" : "neutral"}
          />
        </StatGrid>
      )}

      <Section padded={false}>
        <Async
          query={query}
          empty={{
            title: "Açık pozisyon yok",
            description:
              "Botlar şu an piyasada değil. Puanı giriş eşiğini geçen bir aday çıktığında ve risk sınırları elverdiğinde pozisyon açılır.",
          }}
        >
          {(list) => (
            <DataTable
              rows={list}
              columns={columns}
              rowKey={(r) => r.id}
              onRowClick={setSelected}
              storageKey="pozisyonlar-acik"
              searchText={(r) => r.symbol}
              searchPlaceholder="Sembol ara…"
              defaultSort={{ key: "unrealized_pnl", dir: "desc" }}
              dense
            />
          )}
        </Async>
      </Section>

      {selected && (
        <Drawer
          open
          onClose={() => setSelected(null)}
          title={<span className="font-mono">{selected.symbol}</span>}
          subtitle={`${relative(selected.entry_time)} açıldı · bot #${selected.bot_id}`}
        >
          <DrawerSection
            title="Risk hesabı"
            description="Bu pozisyon açılırken ne kadar risk alındı ve şu an ne durumda."
          >
            <div className="divide-y divide-line rounded-lg border border-line px-3.5">
              <Field
                label="Giriş fiyatı"
                value={<span className="num">{price(selected.entry_price)}</span>}
              />
              <Field
                label="İlk stop"
                hint="Pozisyon açılırken belirlenen zarar durdurma seviyesi. 1R bu mesafedir."
                value={<span className="num">{price(selected.initial_stop)}</span>}
              />
              <Field
                label="Güncel stop"
                term="stop"
                value={<span className="num">{price(selected.stop)}</span>}
              />
              <Field
                label="Başabaş kilidi"
                term="basabas"
                value={selected.breakeven_locked ? "Kilitli — zarar edemez" : "Henüz kilitlenmedi"}
              />
              <Field
                label="Başlangıç riski (1R)"
                hint="Girişten ilk stop'a kadarki mesafenin miktarla çarpımı — pozisyon açılırken göze alınan tutar."
                value={
                  <span className="num">
                    {money((selected.entry_price - selected.initial_stop) * selected.qty)}
                  </span>
                }
              />
              <Field
                label="Şu anki sonuç"
                term="r_katsayisi"
                value={
                  <Signed
                    value={selected.unrealized_pnl}
                    text={rMultiple(
                      selected.unrealized_pnl !== null &&
                        selected.entry_price !== selected.initial_stop
                        ? selected.unrealized_pnl /
                            ((selected.entry_price - selected.initial_stop) * selected.qty)
                        : null,
                    )}
                    size="sm"
                  />
                }
              />
            </div>
          </DrawerSection>

          <DrawerSection title="Pozisyon">
            <div className="divide-y divide-line rounded-lg border border-line px-3.5">
              <Field label="Miktar" value={<span className="num">{num(selected.qty, 8)}</span>} />
              <Field
                label="Güncel fiyat"
                value={<span className="num">{price(selected.last_price)}</span>}
              />
              <Field
                label="Girişteki puan"
                term="puan"
                value={<span className="num">{num(selected.score_at_entry, 1)}</span>}
              />
              <Field label="Açılış zamanı" value={dateTime(selected.entry_time)} />
            </div>
          </DrawerSection>
        </Drawer>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Kapanmış işlemler                                                  */
/* ------------------------------------------------------------------ */

function ClosedTrades() {
  const query = useQuery({
    queryKey: ["trades"],
    queryFn: () => api.get<Trade[]>("/trades", { limit: 500 }),
    refetchInterval: 60_000,
  });

  const columns: Column<Trade>[] = [
    {
      key: "exit_time",
      header: "Kapanış",
      width: "150px",
      sort: (r) => new Date(r.exit_time).getTime(),
      cell: (r) => <span className="num text-[12px]">{dateTime(r.exit_time)}</span>,
    },
    {
      key: "symbol",
      header: "Sembol",
      width: "120px",
      sort: (r) => r.symbol,
      cell: (r) => <span className="font-mono text-[12.5px]">{r.symbol}</span>,
    },
    {
      key: "exit_reason",
      header: "Sebep",
      width: "180px",
      term: "cikis_sebebi",
      sort: (r) => r.exit_reason,
      cell: (r) => <ExitReasonPill reason={r.exit_reason} />,
    },
    {
      key: "pnl",
      header: "K/Z",
      num: true,
      sort: (r) => r.pnl,
      cell: (r) => <Signed value={r.pnl} text={money(r.pnl)} size="sm" />,
    },
    {
      key: "pnl_r",
      header: "Sonuç",
      num: true,
      term: "r_katsayisi",
      sort: (r) => r.pnl_r,
      cell: (r) => <Signed value={r.pnl_r} text={rMultiple(r.pnl_r)} size="sm" />,
    },
    {
      key: "hold_hours",
      header: "Süre",
      num: true,
      sort: (r) => r.hold_hours,
      cell: (r) => duration(r.hold_hours),
    },
    {
      key: "fees",
      header: "Komisyon",
      num: true,
      sort: (r) => r.fees,
      cell: (r) => money(r.fees),
    },
    {
      key: "slippage_bps",
      header: "Kayma",
      num: true,
      term: "kayma",
      defaultHidden: true,
      sort: (r) => r.slippage_bps,
      cell: (r) => num(r.slippage_bps, 1),
    },
    {
      key: "mfe_mae",
      header: "MFE / MAE",
      num: true,
      term: "mfe_mae",
      defaultHidden: true,
      cell: (r) => (
        <span className="num text-[12px]">
          {num(r.mfe, 2)} / {num(r.mae, 2)}
        </span>
      ),
    },
    {
      key: "bot_id",
      header: "Bot",
      num: true,
      defaultHidden: true,
      sort: (r) => r.bot_id,
      cell: (r) => `#${r.bot_id}`,
    },
  ];

  return (
    <Section padded={false}>
      <Async
        query={query}
        empty={{
          title: "Henüz kapanmış işlem yok",
          description:
            "Bir pozisyon kapandığında sonucu burada görünür — hem para hem risk birimi cinsinden.",
        }}
      >
        {(rows) => (
          <DataTable
            rows={rows}
            columns={columns}
            rowKey={(r) => r.id}
            storageKey="pozisyonlar-kapali"
            searchText={(r) => `${r.symbol} ${r.exit_reason}`}
            searchPlaceholder="Sembol ya da sebep ara…"
            defaultSort={{ key: "exit_time", dir: "desc" }}
            dense
            footNote={
              <span>
                Sistem 30 gün ve 30 işlem dolmadan bir sonucu anlamlı saymaz. Şu an{" "}
                {rows.length} işlem var.
              </span>
            }
          />
        )}
      </Async>
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/*  Emirler                                                            */
/* ------------------------------------------------------------------ */

function Orders() {
  const query = useQuery({
    queryKey: ["orders"],
    queryFn: () => api.get<Order[]>("/orders", { limit: 300 }),
    refetchInterval: 30_000,
  });

  const rows = query.data ?? [];
  const rejected = rows.filter((r) => r.status === "REJECTED");

  const columns: Column<Order>[] = [
    {
      key: "created_at",
      header: "Gönderim",
      width: "150px",
      sort: (r) => new Date(r.created_at).getTime(),
      cell: (r) => <span className="num text-[12px]">{dateTime(r.created_at)}</span>,
    },
    {
      key: "symbol",
      header: "Sembol",
      width: "120px",
      sort: (r) => r.symbol,
      cell: (r) => <span className="font-mono text-[12.5px]">{r.symbol}</span>,
    },
    {
      key: "side",
      header: "Yön",
      width: "80px",
      sort: (r) => r.side,
      cell: (r) => (
        <span className={cx("text-[12px]", r.side === "BUY" ? "text-up" : "text-down")}>
          {r.side === "BUY" ? "Alış" : "Satış"}
        </span>
      ),
    },
    {
      key: "status",
      header: "Durum",
      width: "130px",
      sort: (r) => r.status,
      cell: (r) => <OrderStatusPill status={r.status} />,
    },
    {
      key: "qty",
      header: "Miktar",
      num: true,
      sort: (r) => r.qty,
      cell: (r) => num(r.qty, 6),
    },
    {
      key: "avg_fill_price",
      header: "Dolum fiyatı",
      num: true,
      sort: (r) => r.avg_fill_price,
      cell: (r) => price(r.avg_fill_price),
    },
    {
      key: "reject_reason",
      header: "Ret sebebi",
      hint: "Emir neden kabul edilmedi. Boş olması emrin geçtiği anlamına gelir.",
      sort: (r) => r.reject_reason,
      cell: (r) =>
        r.reject_reason ? (
          <span className="text-[12px] text-warn">{rejectReason(r.reject_reason)}</span>
        ) : (
          <span className="text-ink-3">—</span>
        ),
    },
    {
      key: "slippage_bps",
      header: "Kayma",
      num: true,
      term: "kayma",
      defaultHidden: true,
      sort: (r) => r.slippage_bps,
      cell: (r) => num(r.slippage_bps, 1),
    },
  ];

  return (
    <>
      {rejected.length > 0 && (
        <div className="rounded-xl border border-warn/30 bg-warn-soft px-4 py-3 text-[13px]">
          <strong className="font-medium text-ink">{rejected.length} emir reddedildi.</strong>{" "}
          <span className="text-ink-2">
            Reddedilen emir sessizce kaybolmaz — sebebini aşağıdaki tablodan görebilirsiniz. En
            sık sebepler nakit yetersizliği, asgari emir büyüklüğünün altında kalma ve risk
            sınırlarıdır.
          </span>
        </div>
      )}

      <Section padded={false}>
        <Async
          query={query}
          empty={{
            title: "Emir yok",
            description: "Botlar pozisyon açıp kapattıkça gönderilen emirler burada listelenir.",
          }}
        >
          {(list) => (
            <DataTable
              rows={list}
              columns={columns}
              rowKey={(r) => r.id}
              storageKey="pozisyonlar-emirler"
              searchText={(r) => `${r.symbol} ${r.status} ${r.reject_reason ?? ""}`}
              searchPlaceholder="Sembol ya da durum ara…"
              defaultSort={{ key: "created_at", dir: "desc" }}
              dense
            />
          )}
        </Async>
      </Section>
    </>
  );
}
