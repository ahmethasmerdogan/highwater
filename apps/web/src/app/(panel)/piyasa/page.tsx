"use client";

/**
 * Piyasa — havuz, puanlar ve sembol ayrıntısı tek ekranda.
 *
 * Üç eski sayfa (Havuz, Puanlar, İndikatörler) burada birleşti. Tablo ya
 * "havuz" (hangi semboller, neden) ya da "puanlar" (0–100 not, gerekçesi)
 * görünümündedir; satıra tıklayınca sağdan bir sayfa açılır ve grafik,
 * destek/direnç, formasyon, puan kartı ve strateji atölyesi orada durur.
 *
 * URL sözleşmesi (başka sayfalar buraya bağlanır):
 *   ?market=CRYPTO|BIST|US   ?gorunum=havuz|puanlar   ?sembol=XXX
 */

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Collapsible, Reveal, SegmentedControl, UnderlineTabs } from "uicean";
import {
  api,
  type Score,
  type ScoreConfig,
  type SnapshotDetail,
  type UniverseSymbol,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { toast } from "@/lib/toast";
import { compact, dateTime, num, pct, price, relative } from "@/lib/format";
import { Page, GuideSection } from "@/shell/page";
import {
  Async,
  Button,
  Empty,
  FAMILIES,
  FamilyStack,
  Bar,
  Metric,
  NumCell,
  NumText,
  Panel,
  Picker,
  Tag,
  TextMetric,
} from "@/design";
import { DataGrid } from "@/grid/data-grid";
import type { GridColumn } from "@/grid/types";
import { Huni } from "./huni";
import { SembolSheet } from "./sembol-sheet";
import { keyOf, marketOf, scoreColor, stripCommonPrefix, sumModifiers, type Market } from "./ortak";

const MARKET_OPTIONS: { value: Market; label: string }[] = [
  { value: "CRYPTO", label: "Kripto" },
  { value: "BIST", label: "BIST" },
  { value: "US", label: "ABD" },
];

const MARKET_SUMMARY: Record<Market, string> = {
  CRYPTO:
    "Likidite filtrelerinden geçen coinler ve 0–100 puanları. Puan bir tahmin değil, aynı andaki diğer coinlere göre sıralamadır.",
  BIST: "Borsa İstanbul havuzu ve puanları — günlük barla çalışır, veri İş Yatırım'dan gelir, hacimler TL'dir.",
  US: "ABD hisse havuzu (NYSE/NASDAQ) ve puanları — günlük barla çalışır, hacimler dolardır.",
};

type Gorunum = "havuz" | "puanlar";

export default function PiyasaPage() {
  return (
    <Suspense
      fallback={
        <div className="px-6 py-8" style={{ fontSize: "var(--sn-t-body)", color: "var(--sn-ink-3)" }}>
          Yükleniyor…
        </div>
      }
    >
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
  const shorten = useMemo(
    () => stripCommonPrefix((configs.data ?? []).map((config) => config.label)),
    [configs.data],
  );

  const scores = useQuery({
    queryKey: ["scores", configKey],
    queryFn: () =>
      api.get<Score[]>("/scores", {
        config_hash: active!.config_hash,
        timeframe: active!.timeframe,
        limit: 300,
      }),
    enabled: Boolean(active),
    refetchInterval: 60_000,
  });

  /* Puanlama ayarı pazar bilmez (`ScoreConfig.market` yok); satırlar
     sembol ekine göre pazara ayrılır. */
  const scoreRows = useMemo(
    () => (scores.data ?? []).filter((row) => marketOf(row.symbol) === market),
    [scores.data, market],
  );
  const scoreOf = useMemo(() => new Map(scoreRows.map((row) => [row.symbol, row.score])), [scoreRows]);

  const poolSymbol = snapshot.data?.symbols.find((row) => row.symbol === sembol);

  return (
    <Page
      title="Piyasa"
      summary={MARKET_SUMMARY[market]}
      actions={
        <span className="flex items-center gap-2">
          <SegmentedControl
            size="sm"
            value={market}
            onChange={(m) => setParam({ market: m, sembol: null })}
            options={MARKET_OPTIONS}
          />
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
              {gorunum === "havuz" ? (
                <HavuzMetrikleri snap={snap} />
              ) : (
                <PuanMetrikleri rows={scoreRows} active={active} />
              )}
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
              <PuanTablosu
                rows={scoreRows}
                loading={scores.isLoading}
                onSelect={(s) => setParam({ sembol: s })}
              />
            )}

            <Panel padded={false}>
              <Collapsible
                className="px-4 py-1"
                trigger={<span>Filtre hunisi ve geçmiş</span>}
              >
                <Huni snap={snap} market={market} canEdit={can()} />
              </Collapsible>
            </Panel>

            {sembol && (
              <SembolSheet
                key={sembol}
                symbol={sembol}
                market={market}
                pool={poolSymbol}
                config={active}
                onClose={() => setParam({ sembol: null })}
              />
            )}
          </>
        )}
      </Async>
    </Page>
  );
}

/* ------------------------------------------------------------------ */
/*  Üst şerit                                                          */
/* ------------------------------------------------------------------ */

function HavuzMetrikleri({ snap }: { snap: SnapshotDetail }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Metric
        label="Havuzdaki sembol"
        value={snap.size}
        format={(value) => num(value, 0)}
        accent="var(--sn-brand-solid)"
        sub={`son yenileme ${relative(snap.taken_at)}`}
      />
      <Metric
        label="Eklenen"
        value={snap.added.length}
        format={(value) => num(value, 0)}
        accent={snap.added.length > 0 ? "var(--sn-up)" : undefined}
        sub={<span className="sn-num">{snap.added.slice(0, 4).join(", ") || "—"}</span>}
      />
      <Metric
        label="Çıkan"
        value={snap.removed.length}
        format={(value) => num(value, 0)}
        accent={snap.removed.length > 0 ? "var(--sn-down)" : undefined}
        sub={<span className="sn-num">{snap.removed.slice(0, 4).join(", ") || "—"}</span>}
      />
      <TextMetric label="Yenileme sebebi" value={reasonLabel(snap.reason)} sub={dateTime(snap.taken_at)} />
    </div>
  );
}

function PuanMetrikleri({ rows, active }: { rows: Score[]; active: ScoreConfig | undefined }) {
  const stats = useMemo(() => {
    if (rows.length === 0) return null;
    const values = rows.map((row) => row.score);
    const sorted = [...values].sort((a, b) => a - b);
    return {
      count: rows.length,
      top: Math.max(...values),
      median: sorted[Math.floor(sorted.length / 2)],
      above70: values.filter((value) => value >= 70).length,
    };
  }, [rows]);

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Metric
        label="Puanlanan sembol"
        value={stats?.count ?? 0}
        format={(value) => num(value, 0)}
        sub={active ? `son bar ${relative(active.bar_time)}` : "—"}
      />
      <Metric
        label="En yüksek puan"
        value={stats?.top}
        format={(value) => num(value, 1)}
        accent="var(--sn-brand-solid)"
        sub="tek başına bir şey söylemez — kalibrasyona bakın"
      />
      <Metric
        label="Ortanca puan"
        value={stats?.median}
        format={(value) => num(value, 1)}
        sub="50 civarıysa puanlama havuzu dengeli dağıtıyor"
      />
      <Metric
        label="70 ve üzeri"
        value={stats?.above70 ?? 0}
        format={(value) => num(value, 0)}
        sub={stats ? `listenin %${num((stats.above70 / stats.count) * 100, 0)}'i` : "—"}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Havuz tablosu                                                      */
/* ------------------------------------------------------------------ */

function HavuzTablosu({
  snap,
  scoreOf,
  onSelect,
}: {
  snap: SnapshotDetail;
  scoreOf: Map<string, number>;
  onSelect: (symbol: string) => void;
}) {
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
            <span className="sn-num" style={{ fontSize: "var(--sn-t-body)", color: "var(--sn-ink)" }}>
              {row.symbol}
            </span>
            {row.protected && <Tag tone="brand">korumalı</Tag>}
            {row.placeholder && <Tag tone="warn">ölçüm alınamadı</Tag>}
          </span>
        ),
      },
      {
        id: "score",
        header: "Puan",
        width: 112,
        num: true,
        hint: "Seçili puanlama ayarındaki güncel not. Boşsa bu sembol henüz puanlanmamış.",
        value: (row) => scoreOf.get(row.symbol) ?? null,
        cell: (row) => {
          const score = scoreOf.get(row.symbol);
          if (score === undefined) return <NumText text="—" size="sm" />;
          return (
            <span className="inline-flex items-center gap-2">
              <Bar value={score} color={scoreColor(score)} width={34} />
              <NumCell value={score} text={num(score, 1)} size="sm" />
            </span>
          );
        },
      },
      {
        id: "price",
        header: "Fiyat",
        width: 116,
        num: true,
        value: (row) => row.price,
        cell: (row) => <NumText text={row.placeholder ? "—" : price(row.price)} size="sm" />,
      },
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
        cell: (row) => (
          <NumText text={row.spread_pct === null ? "—" : pct(row.spread_pct / 100, 3)} size="sm" />
        ),
      },
      {
        id: "volatility_ann_pct",
        header: "Volatilite",
        width: 104,
        num: true,
        hint: "Yıllıklandırılmış oynaklık. Çok düşükse hareket yok, çok yüksekse stop mesafesi makul pozisyon boyutu bırakmaz.",
        value: (row) => row.volatility_ann_pct,
        cell: (row) => (
          <NumText
            text={row.volatility_ann_pct === null ? "—" : `%${num(row.volatility_ann_pct, 0)}`}
            size="sm"
          />
        ),
      },
      {
        id: "range_3d_pct",
        header: "3g aralık",
        width: 100,
        num: true,
        hidden: true,
        hint: "Son üç gündeki fiyat aralığının genişliği.",
        value: (row) => row.range_3d_pct,
        cell: (row) => (
          <NumText text={row.range_3d_pct === null ? "—" : `%${num(row.range_3d_pct, 1)}`} size="sm" />
        ),
      },
      {
        id: "age_days",
        header: "Yaş",
        width: 92,
        num: true,
        hint: "Listelenmesinden bu yana geçen gün. Yeni sembollerde göstergelerin hesaplanacağı geçmiş yoktur.",
        value: (row) => row.age_days,
        cell: (row) => (
          <NumText
            text={row.placeholder || row.age_days === null ? "—" : `${num(row.age_days, 0)} gün`}
            size="sm"
          />
        ),
      },
    ],
    [scoreOf],
  );

  return (
    <Panel padded={false}>
      {snap.symbols.length === 0 ? (
        <Empty
          title="Havuz boş"
          hint="Filtrelerden hiçbir sembol geçemedi. Bu durumda hiçbir bot pozisyon açamaz. Ayarlar sayfasından eşiklere bakın."
        />
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
              Ayar parmak izi <span className="sn-num">{snap.config_hash.slice(0, 12)}</span> · liste{" "}
              {dateTime(snap.taken_at)} tarihinde dondurulmuştur.
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

function PuanTablosu({
  rows,
  loading,
  onSelect,
}: {
  rows: Score[];
  loading: boolean;
  onSelect: (symbol: string) => void;
}) {
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
        cell: (row) => (
          <span className="sn-num" style={{ fontSize: "var(--sn-t-body)", color: "var(--sn-ink)" }}>
            {row.symbol}
          </span>
        ),
      },
      {
        id: "score",
        header: "Puan",
        width: 124,
        num: true,
        hint: "0–100 arası kesitsel not. Sembol kendi geçmişiyle değil, aynı andaki diğer havuz üyeleriyle karşılaştırılır.",
        value: (row) => row.score,
        cell: (row) => (
          <span className="inline-flex items-center gap-2">
            <Bar value={row.score} color={scoreColor(row.score)} width={38} />
            <NumCell value={row.score} text={num(row.score, 1)} />
          </span>
        ),
        footer: (list) =>
          list.length ? (
            <NumText text={num(list.reduce((sum, row) => sum + row.score, 0) / list.length, 1)} size="sm" />
          ) : null,
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
        cell: (row) => (
          <NumCell value={row.families?.[family.id]} text={num(row.families?.[family.id], 1)} size="sm" tint={false} />
        ),
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
          return (
            <NumCell tint={false} value={total} text={`${total > 0 ? "+" : ""}${num(total, 1)}`} size="sm" colorize />
          );
        },
      },
      {
        id: "bar_time",
        header: "Karar barı",
        width: 150,
        hidden: true,
        hint: "Puanlanan mumun açılış zamanı. Puan bu mum kapandıktan sonra hesaplandı.",
        value: (row) => new Date(row.bar_time).getTime(),
        cell: (row) => (
          <span style={{ fontSize: "var(--sn-t-caption)", color: "var(--sn-ink-3)" }}>{dateTime(row.bar_time)}</span>
        ),
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
        emptyHint={
          loading
            ? undefined
            : "Puanlar karar barı kapandığında hesaplanır. Seçili puanlama ayarı başka bir pazara ait olabilir — üstteki seçiciden değiştirin."
        }
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
          <strong>Havuz</strong>, likidite ve ölçülebilirlik filtrelerinden geçen semboller; sistem yalnızca
          bunları puanlar ve yalnızca bunlara pozisyon açar. <strong>Puanlar</strong>, her karar barı
          kapandığında beş aileden gelen katkıların toplamıdır; formasyon ve mum sinyalleri küçük bir düzeltme
          ekler.
        </p>
      </GuideSection>
      <GuideSection title="Nasıl okunur">
        <p>
          <strong>80 puan “yükselecek” demek değildir</strong> — “şu an havuzdaki çoğu sembolden daha uygun
          görünüyor” demektir. Puan kesitseldir. Bir satıra tıklayınca sembolün grafiği, destek/direnç
          seviyeleri, formasyonları ve puan kartı açılır.
        </p>
        <p>
          Filtre hunisi tablonun altındadır: her satırda kaç aday kaldı, kaçı elendi. Bir filtre tek başına
          adayların yarısından fazlasını eliyorsa, tasarlandığı işi yapıp yapmadığı sorulmalıdır.
        </p>
      </GuideSection>
      <GuideSection title="Ne yapabilirim">
        <p>
          Bir sembolü işlem dışı bırakmak için kara listeye ekleyin; bir sonraki yenilemede havuzdan çıkar.
          Puanlamanın işe yarayıp yaramadığını Kalibrasyon sayfası ölçer. Sembol sayfasındaki atölyede bir
          ayarı değiştirip kaydettiğinizde yeni bir strateji sürümü doğar; çalışan botlar etkilenmez.
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
