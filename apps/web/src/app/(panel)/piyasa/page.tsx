"use client";

/**
 * PİYASA v3 — defter (DESIGN-V3 §4.3).
 *
 * Pazar `SegmentedControl` manşette; havuz/puan `UnderlineTabs`; figürler
 * tek ledger bloğunda; defter tablosu (puan `DottedMeter`, kapı 80
 * işaretli); sembol `Sheet`; huni `Collapsible`. Sayılar mono, süs yok.
 *
 * URL sözleşmesi (başka sayfalar buraya bağlanır):
 *   ?market=CRYPTO|BIST|US   ?gorunum=havuz|puanlar   ?sembol=XXX
 */

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Collapsible, DottedMeter, Reveal, SegmentedControl, UnderlineTabs } from "uicean";
import { api, type Score, type ScoreConfig, type SnapshotDetail, type UniverseSymbol } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { toast } from "@/lib/toast";
import { compact, dateTime, num, pct, price, relative } from "@/lib/format";
import { Page, GuideSection } from "@/shell/page";
import { Async, Button, Empty, FAMILIES, FamilyStack, Metric, NumCell, NumText, Panel, Picker, Tag, TextMetric } from "@/design";
import { DataGrid } from "@/grid/data-grid";
import type { GridColumn } from "@/grid/types";
import { Huni } from "./huni";
import { SembolSheet } from "./sembol-sheet";
import { keyOf, marketOf, stripCommonPrefix, sumModifiers, type Market } from "./ortak";

const MARKET_OPTIONS: { value: Market; label: string }[] = [
  { value: "CRYPTO", label: "Kripto" },
  { value: "BIST", label: "BIST" },
  { value: "US", label: "ABD" },
];

const MARKET_SUMMARY: Record<Market, string> = {
  CRYPTO: "Likidite filtrelerinden geçen coinler ve 0–100 puanları. Puan tahmin değil, aynı andaki diğerlerine göre sıra.",
  BIST: "Borsa İstanbul havuzu ve puanları — günlük bar, veri İş Yatırım, hacimler TL.",
  US: "ABD hisse havuzu (NYSE/NASDAQ) ve puanları — günlük bar, hacimler dolar.",
};

/** Puan kapısı: bu değerin üstü işlem adayıdır. Ölçek üstünde işaretlidir. */
const KAPI = 80;

type Gorunum = "havuz" | "puanlar";

export default function PiyasaPage() {
  return (
    <Suspense fallback={<div className="px-8 py-8 text-[13px] text-ink-3">Yükleniyor…</div>}>
      <PiyasaContent />
    </Suspense>
  );
}

function PiyasaContent() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const params = useSearchParams();
  const router = useRouter();

  /* ---- URL durumu ------------------------------------------------- */
  const paramMarket = params.get("market");
  const market: Market = paramMarket === "BIST" || paramMarket === "US" ? paramMarket : "CRYPTO";
  const gorunum: Gorunum = params.get("gorunum") === "puanlar" ? "puanlar" : "havuz";
  const sembol = params.get("sembol");

  const setParam = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(params.toString());
      for (const [key, value] of Object.entries(patch)) {
        if (value === null) next.delete(key);
        else next.set(key, value);
      }
      /* Varsayılanlar URL'de durmaz; "/piyasa" temiz kalır. */
      if (next.get("market") === "CRYPTO") next.delete("market");
      if (next.get("gorunum") === "havuz") next.delete("gorunum");
      const qs = next.toString();
      router.replace(qs ? `/piyasa?${qs}` : "/piyasa", { scroll: false });
    },
    [params, router],
  );

  /* ---- Havuz ------------------------------------------------------ */
  const snapshot = useQuery({
    queryKey: ["universe-current", market],
    queryFn: () => api.get<SnapshotDetail>("/universe/current", { market }),
    refetchInterval: 60_000,
  });

  const refresh = useMutation({
    mutationFn: () => api.post("/universe/refresh"),
    onSuccess: () => {
      toast.success("Havuz yenilendi");
      void qc.invalidateQueries({ queryKey: ["universe-current"] });
    },
    onError: (error: Error) => toast.error("Havuz yenilenemedi", error.message),
  });

  /* ---- Puanlar ---------------------------------------------------- */
  const [configKey, setConfigKey] = useState<string | null>(null);
  const configs = useQuery({
    queryKey: ["score-configs"],
    queryFn: () => api.get<ScoreConfig[]>("/scores/configs"),
    refetchInterval: 60_000,
  });
  useEffect(() => {
    const liste = configs.data ?? [];
    if (!liste.length) return;
    const secili = liste.find((config) => keyOf(config) === configKey);
    if (secili && secili.market === market) return;
    // Pazara uygun ilk ayar; yoksa listenin ilki (boş kesit yerine dürüst ipucu görünür).
    const uygun = liste.find((config) => config.market === market) ?? liste[0];
    setConfigKey(keyOf(uygun));
  }, [configs.data, configKey, market]);
  const active = configs.data?.find((config) => keyOf(config) === configKey);
  const shorten = useMemo(() => stripCommonPrefix((configs.data ?? []).map((config) => config.label)), [configs.data]);

  const scores = useQuery({
    queryKey: ["scores", configKey],
    queryFn: () => api.get<Score[]>("/scores", { config_hash: active!.config_hash, timeframe: active!.timeframe, limit: 300 }),
    enabled: Boolean(active),
    refetchInterval: 60_000,
  });

  /* Puanlama ayarı pazar bilmez; satırlar sembol ekine göre pazara ayrılır. */
  const scoreRows = useMemo(() => (scores.data ?? []).filter((row) => marketOf(row.symbol) === market), [scores.data, market]);
  const scoreOf = useMemo(() => new Map(scoreRows.map((row) => [row.symbol, row.score])), [scoreRows]);

  const poolSymbol = snapshot.data?.symbols.find((row) => row.symbol === sembol);

  return (
    <Page
      title="Piyasa"
      summary={MARKET_SUMMARY[market]}
      stamp={snapshot.data ? `${relative(snapshot.data.taken_at)} tazelendi` : undefined}
      actions={
        <span className="flex items-center gap-2">
          <SegmentedControl size="sm" value={market} onChange={(m) => setParam({ market: m, sembol: null })} options={MARKET_OPTIONS} />
          {can("TRADER") && market === "CRYPTO" && (
            <Button size="sm" variant="primary" disabled={refresh.isPending} onClick={() => refresh.mutate()}>
              {refresh.isPending ? "Yenileniyor…" : "Havuzu yenile"}
            </Button>
          )}
        </span>
      }
      guide={<Kilavuz />}
    >
      <Async
        query={snapshot}
        empty={{
          title: "Havuz henüz kurulmadı",
          hint: "Filtre zinciri hiç çalışmamış ya da girdi verisi gelmemiş. Piyasa verisi servisi ayaktaysa bir sonraki yenilemede kurulur.",
        }}
      >
        {(snap) => (
          <>
            <Reveal>
              {gorunum === "havuz" ? <HavuzFigurleri snap={snap} /> : <PuanFigurleri rows={scoreRows} active={active} />}
            </Reveal>

            <div className="flex flex-wrap items-end justify-between gap-3">
              <UnderlineTabs
                items={[
                  { id: "havuz", label: "Havuz" },
                  { id: "puanlar", label: "Puanlar" },
                ]}
                value={gorunum}
                onChange={(id) => setParam({ gorunum: id })}
              />
              {(configs.data?.length ?? 0) > 1 && (
                <Picker
                  label="Puanlama ayarı"
                  value={configKey}
                  onChange={setConfigKey}
                  width={320}
                  options={(configs.data ?? []).map((config) => ({
                    value: keyOf(config),
                    label: shorten(config.label),
                    meta: `${config.timeframe} · ${config.symbols} sembol`,
                  }))}
                />
              )}
            </div>

            {gorunum === "havuz" ? (
              <HavuzTablosu snap={snap} scoreOf={scoreOf} onSelect={(s) => setParam({ sembol: s })} />
            ) : (
              <PuanTablosu rows={scoreRows} loading={scores.isLoading} onSelect={(s) => setParam({ sembol: s })} />
            )}

            <Panel padded={false}>
              <Collapsible className="px-5 py-1" trigger={<span>Filtre hunisi ve geçmiş</span>}>
                <Huni snap={snap} market={market} canEdit={can()} />
              </Collapsible>
            </Panel>

            {sembol && (
              <SembolSheet key={sembol} symbol={sembol} market={market} pool={poolSymbol} config={active} onClose={() => setParam({ sembol: null })} />
            )}
          </>
        )}
      </Async>
    </Page>
  );
}

/* ------------------------------------------------------------------ */
/*  Figürler — tek ledger bloğunda dört sütun                          */
/* ------------------------------------------------------------------ */

const FIGUR_IZGARA = "grid grid-cols-2 gap-x-6 gap-y-4 lg:grid-cols-4";

function HavuzFigurleri({ snap }: { snap: SnapshotDetail }) {
  return (
    <Panel title="Havuz">
      <div className={FIGUR_IZGARA}>
        <Metric label="Havuzdaki sembol" value={snap.size} format={(v) => num(v, 0)} sub={`son yenileme ${relative(snap.taken_at)}`} />
        <Metric
          label="Eklenen"
          value={snap.added.length}
          format={(v) => num(v, 0)}
          sub={<span className="sn-num">{snap.added.slice(0, 4).join(", ") || "—"}</span>}
        />
        <Metric
          label="Çıkan"
          value={snap.removed.length}
          format={(v) => num(v, 0)}
          sub={<span className="sn-num">{snap.removed.slice(0, 4).join(", ") || "—"}</span>}
        />
        <TextMetric label="Yenileme sebebi" value={reasonLabel(snap.reason)} sub={dateTime(snap.taken_at)} />
      </div>
    </Panel>
  );
}

function PuanFigurleri({ rows, active }: { rows: Score[]; active: ScoreConfig | undefined }) {
  const stats = useMemo(() => {
    if (rows.length === 0) return null;
    const values = rows.map((row) => row.score);
    const sorted = [...values].sort((a, b) => a - b);
    return {
      count: rows.length,
      top: Math.max(...values),
      median: sorted[Math.floor(sorted.length / 2)],
      kapiUstu: values.filter((value) => value >= KAPI).length,
    };
  }, [rows]);

  return (
    <Panel title="Puanlar">
      <div className={FIGUR_IZGARA}>
        <Metric label="Puanlanan sembol" value={stats?.count ?? 0} format={(v) => num(v, 0)} sub={active ? `son bar ${relative(active.bar_time)}` : "—"} />
        <Metric label="En yüksek puan" value={stats?.top} format={(v) => num(v, 1)} sub="tek başına bir şey söylemez" />
        <Metric label="Ortanca puan" value={stats?.median} format={(v) => num(v, 1)} sub="50 civarı dengeli dağılım" />
        <Metric
          label={`Kapı üstü (≥${KAPI})`}
          value={stats?.kapiUstu ?? 0}
          format={(v) => num(v, 0)}
          sub={stats ? `listenin %${num((stats.kapiUstu / stats.count) * 100, 0)}'i` : "—"}
        />
      </div>
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/*  Puan ölçeği — çubuk değil ölçek; kapı çizgisi üstünde              */
/* ------------------------------------------------------------------ */

function PuanOlcegi({ value, size = "sm" }: { value: number; size?: "sm" | "md" }) {
  /* uicean DottedMeter dolu tikleri yeşil basar; yeşil yalnız yön içindir,
     puan bir yön değil sıradır — dolu tik markaya çevrilir. Kapı işareti
     bileşende yok: ölçeğin üstüne hairline bindirilir. */
  return (
    <span className="inline-flex items-center gap-2">
      <span className="relative inline-flex w-[64px]" title={`kapı ${KAPI}`}>
        <DottedMeter value={value} max={100} ticks={20} className="w-full [&>span]:h-3 [&>.bg-emerald-500]:bg-brand" />
        <span aria-hidden className="absolute inset-y-[-2px] w-px bg-ink-3" style={{ left: `${KAPI}%` }} />
      </span>
      <NumCell value={value} text={num(value, 1)} size={size} />
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Havuz tablosu                                                      */
/* ------------------------------------------------------------------ */

function HavuzTablosu({ snap, scoreOf, onSelect }: { snap: SnapshotDetail; scoreOf: Map<string, number>; onSelect: (symbol: string) => void }) {
  const columns = useMemo<GridColumn<UniverseSymbol>[]>(
    () => [
      {
        id: "rank",
        header: "#",
        width: 56,
        num: true,
        pin: true,
        hint: "Hacme göre sıra. 1 en yüksek günlük hacme sahip sembol.",
        value: (row) => row.rank,
        cell: (row) => <NumText text={row.placeholder ? "—" : String(row.rank)} size="sm" />,
      },
      {
        id: "symbol",
        header: "Sembol",
        width: 150,
        pin: true,
        value: (row) => row.symbol,
        search: (row) => row.symbol,
        cell: (row) => (
          <span className="flex items-center gap-1.5">
            <span className="sn-num text-[13px] text-ink">{row.symbol}</span>
            {row.protected && <Tag tone="brand">korumalı</Tag>}
            {row.placeholder && <Tag tone="warn">ölçüm alınamadı</Tag>}
          </span>
        ),
      },
      {
        id: "score",
        header: "Puan",
        width: 132,
        num: true,
        hint: `Seçili puanlama ayarındaki güncel not; çizgi ${KAPI} kapısı. Boşsa bu sembol henüz puanlanmamış.`,
        value: (row) => scoreOf.get(row.symbol) ?? null,
        cell: (row) => {
          const score = scoreOf.get(row.symbol);
          return score === undefined ? <NumText text="—" size="sm" /> : <PuanOlcegi value={score} />;
        },
      },
      { id: "price", header: "Fiyat", width: 116, num: true, value: (row) => row.price, cell: (row) => <NumText text={row.placeholder ? "—" : price(row.price)} size="sm" /> },
      {
        id: "quote_volume",
        header: "24s hacim",
        width: 112,
        num: true,
        hint: "Son 24 saatte bu sembolde dönen toplam tutar. Havuza girmenin ilk şartı budur.",
        value: (row) => row.quote_volume,
        cell: (row) => <NumText text={compact(row.quote_volume)} size="sm" />,
      },
      {
        id: "spread_pct",
        header: "Spread",
        width: 100,
        num: true,
        hint: "Alış ve satış fiyatı arasındaki fark. Geniş spread her işlemde görünmez bir maliyettir.",
        value: (row) => row.spread_pct,
        cell: (row) => <NumText text={row.spread_pct === null ? "—" : pct(row.spread_pct / 100, 3)} size="sm" />,
      },
      {
        id: "volatility_ann_pct",
        header: "Volatilite",
        width: 104,
        num: true,
        hint: "Yıllıklandırılmış oynaklık. Çok düşükse hareket yok, çok yüksekse stop mesafesi makul pozisyon boyutu bırakmaz.",
        value: (row) => row.volatility_ann_pct,
        cell: (row) => <NumText text={row.volatility_ann_pct === null ? "—" : `%${num(row.volatility_ann_pct, 0)}`} size="sm" />,
      },
      {
        id: "range_3d_pct",
        header: "3g aralık",
        width: 100,
        num: true,
        hidden: true,
        hint: "Son üç gündeki fiyat aralığının genişliği.",
        value: (row) => row.range_3d_pct,
        cell: (row) => <NumText text={row.range_3d_pct === null ? "—" : `%${num(row.range_3d_pct, 1)}`} size="sm" />,
      },
      {
        id: "age_days",
        header: "Yaş",
        width: 92,
        num: true,
        hint: "Listelenmesinden bu yana geçen gün. Yeni sembollerde göstergelerin hesaplanacağı geçmiş yoktur.",
        value: (row) => row.age_days,
        cell: (row) => <NumText text={row.placeholder || row.age_days === null ? "—" : `${num(row.age_days, 0)} gün`} size="sm" />,
      },
    ],
    [scoreOf],
  );

  return (
    <Panel padded={false}>
      {snap.symbols.length === 0 ? (
        <Empty title="Havuz boş" hint="Filtrelerden hiçbir sembol geçemedi. Bu durumda hiçbir bot pozisyon açamaz. Ayarlar sayfasından eşiklere bakın." />
      ) : (
        <DataGrid
          rows={snap.symbols}
          columns={columns}
          rowKey={(row) => row.symbol}
          onRowClick={(row) => onSelect(row.symbol)}
          storageKey="piyasa-havuz"
          searchPlaceholder="Sembol ara…"
          defaultSort={[{ id: "rank", desc: false }]}
          density="compact"
          maxHeight={620}
          footNote={
            <span>
              Ayar parmak izi <span className="sn-num">{snap.config_hash.slice(0, 12)}</span> · liste {dateTime(snap.taken_at)} tarihinde donduruldu.
            </span>
          }
        />
      )}
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/*  Puan tablosu                                                       */
/* ------------------------------------------------------------------ */

function PuanTablosu({ rows, loading, onSelect }: { rows: Score[]; loading: boolean; onSelect: (symbol: string) => void }) {
  /* Sıra listenin kendisinden türetilir; `indexOf` her hücrede O(n) olurdu. */
  const rankOf = useMemo(() => {
    const map = new Map<string, number>();
    rows.forEach((row, index) => map.set(row.symbol, index + 1));
    return map;
  }, [rows]);

  const columns = useMemo<GridColumn<Score>[]>(
    () => [
      {
        id: "rank",
        header: "#",
        width: 52,
        num: true,
        pin: true,
        value: (row) => rankOf.get(row.symbol) ?? null,
        cell: (row) => <NumText text={String(rankOf.get(row.symbol) ?? "")} size="sm" className="opacity-60" />,
      },
      {
        id: "symbol",
        header: "Sembol",
        width: 128,
        pin: true,
        value: (row) => row.symbol,
        search: (row) => row.symbol,
        cell: (row) => <span className="sn-num text-[13px] text-ink">{row.symbol}</span>,
      },
      {
        id: "score",
        header: "Puan",
        width: 140,
        num: true,
        hint: `0–100 arası kesitsel not; çizgi ${KAPI} kapısı. Sembol kendi geçmişiyle değil, aynı andaki diğer havuz üyeleriyle karşılaştırılır.`,
        value: (row) => row.score,
        cell: (row) => <PuanOlcegi value={row.score} size="md" />,
        footer: (list) => (list.length ? <NumText text={num(list.reduce((sum, row) => sum + row.score, 0) / list.length, 1)} size="sm" /> : null),
      },
      {
        id: "families",
        header: "Aileler",
        width: 170,
        hint: "Beş ailenin katkısı, gerçek oranlarında. Renkler: trend, momentum, akış, volatilite, destek/direnç.",
        cell: (row) => (
          <span className="inline-block w-[150px] align-middle">
            <FamilyStack families={row.families} height={6} />
          </span>
        ),
      },
      ...FAMILIES.map<GridColumn<Score>>((family) => ({
        id: family.id,
        header: family.label,
        width: 108,
        num: true,
        hidden: true,
        hint: family.hint,
        value: (row) => row.families?.[family.id] ?? null,
        cell: (row) => <NumCell value={row.families?.[family.id]} text={num(row.families?.[family.id], 1)} size="sm" tint={false} />,
      })),
      {
        id: "modifiers",
        header: "Düzeltme",
        width: 100,
        num: true,
        hint: "Formasyon ve mum sinyallerinin taban puana eklediği küçük düzeltme. Aile katkılarına karıştırılmaz.",
        value: (row) => sumModifiers(row.modifiers),
        cell: (row) => {
          const total = sumModifiers(row.modifiers);
          if (total === 0) return <NumText text="—" size="sm" />;
          return <NumCell tint={false} value={total} text={`${total > 0 ? "+" : ""}${num(total, 1)}`} size="sm" colorize />;
        },
      },
      {
        id: "bar_time",
        header: "Karar barı",
        width: 150,
        hidden: true,
        hint: "Puanlanan mumun açılış zamanı. Puan bu mum kapandıktan sonra hesaplandı.",
        value: (row) => new Date(row.bar_time).getTime(),
        cell: (row) => <span className="sn-num text-[12px] text-ink-3">{dateTime(row.bar_time)}</span>,
      },
    ],
    [rankOf],
  );

  return (
    <Panel padded={false}>
      <DataGrid
        rows={rows}
        columns={columns}
        rowKey={(row) => row.symbol}
        onRowClick={(row) => onSelect(row.symbol)}
        storageKey="piyasa-puanlar"
        searchPlaceholder="Sembol ara…"
        defaultSort={[{ id: "score", desc: true }]}
        density="compact"
        maxHeight={620}
        emptyTitle={loading ? "Yükleniyor…" : "Bu pazarda puan yok"}
        emptyHint={loading ? undefined : "Puanlar karar barı kapandığında hesaplanır. Seçili puanlama ayarı başka bir pazara ait olabilir — üstteki seçiciden değiştirin."}
      />
    </Panel>
  );
}

/* ------------------------------------------------------------------ */

function Kilavuz() {
  return (
    <>
      <GuideSection title="Ne gösteriyor">
        <p>
          <strong>Havuz</strong>: likidite ve ölçülebilirlik filtrelerinden geçen semboller; sistem yalnızca bunları puanlar ve yalnızca bunlara
          pozisyon açar. <strong>Puanlar</strong>: her karar barında beş aileden gelen katkıların toplamı; formasyon ve mum sinyalleri küçük bir
          düzeltme ekler.
        </p>
      </GuideSection>
      <GuideSection title="Nasıl okunur">
        <p>
          <strong>{KAPI} puan “yükselecek” demek değildir</strong> — “şu an havuzdaki çoğu sembolden daha uygun görünüyor” demektir. Ölçekteki
          çizgi kapıdır. Satıra tıklayınca sembolün grafiği, seviyeleri, formasyonları ve puan kartı sağdan açılır; huni tablonun altındadır.
        </p>
      </GuideSection>
    </>
  );
}

function reasonLabel(reason: string): string {
  const map: Record<string, string> = {
    scheduled: "Planlı",
    manual: "Elle tetiklendi",
    retry: "Yeniden deneme",
    emergency: "Acil",
    startup: "Açılış",
    delist: "Listeden çıkma",
  };
  return map[reason] ?? reason;
}
