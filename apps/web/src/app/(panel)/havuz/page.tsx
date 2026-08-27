"use client";

/**
 * Havuz — sistemin işlem yapmayı düşündüğü coin listesi.
 *
 * Bu sayfa yalnızca "hangi coinler havuzda" sorusuna değil, **"neden bu
 * coinler"** sorusuna da cevap verir. Filtre hunisi her adımda kaç adayın
 * elendiğini ve o filtrenin ne işe yaradığını gösterir; bir coine tıklayınca
 * hangi ölçütlerle geçtiği açılır.
 */

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  api,
  type Rationale,
  type ScoreDetail,
  type SnapshotDetail,
  type UniverseSymbol,
  type SnapshotSummary,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { toast } from "@/lib/toast";
import { filterInfo } from "@/lib/universe-filters";
import { compact, dateTime, num, pct, price, relative } from "@/lib/format";
import { Page, GuideSection } from "@/shell/page";
import {
  Async,
  Button,
  Drawer,
  DrawerSection,
  Empty,
  Explain,
  Field,
  IClose,
  IconButton,
  InfoDot,
  Metric,
  NumText,
  Panel,
  Segmented,
  Tag,
  TextInput,
  TextMetric,
} from "@/design";
import { CurveChart, type CurveSeries } from "@/design/chart";
import { ScoreCard } from "@/design/score-card";
import { DataGrid } from "@/grid/data-grid";
import type { GridColumn } from "@/grid/types";
import { cx } from "@/design/cx";

type Market = "CRYPTO" | "BIST" | "US";

const MARKET_OPTIONS: { value: Market; label: string }[] = [
  { value: "CRYPTO", label: "Kripto" },
  { value: "BIST", label: "BIST" },
  { value: "US", label: "ABD" },
];

const MARKET_SUMMARY: Record<Market, string> = {
  CRYPTO:
    "Sistemin işlem yapmayı düşündüğü coinler. Binance'teki her coin değil — likidite ve ölçülebilirlik filtrelerinden geçenler.",
  BIST: "Borsa İstanbul havuzu — günlük barla çalışır, veri İş Yatırım'dan gelir. Hacimler TL'dir.",
  US: "ABD hisse havuzu (NYSE/NASDAQ) — günlük barla çalışır. Hacimler dolardır.",
};

export default function UniversePage() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const [selected, setSelected] = useState<UniverseSymbol | null>(null);
  /* Havuz pazar başınadır: TRY cirosu USD cirosuyla aynı sıralamaya
     girmez. Sekme yalnızca görünümü değiştirir; karar yolu zaten ayrı. */
  const [market, setMarket] = useState<Market>("CRYPTO");

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

  return (
    <Page
      title="Havuz"
      summary={MARKET_SUMMARY[market]}
      actions={
        <span className="flex items-center gap-2">
          <Segmented value={market} onChange={setMarket} options={MARKET_OPTIONS} size="sm" />
          {can("TRADER") && market === "CRYPTO" && (
            <Button
              size="sm"
              variant="primary"
              disabled={refresh.isPending}
              onClick={() => refresh.mutate()}
            >
              {refresh.isPending ? "Yenileniyor…" : "Havuzu yenile"}
            </Button>
          )}
        </span>
      }
      guide={
        <>
          <GuideSection title="Ne gösteriyor">
            <p>
              Binance spot piyasasında binlerce çift var; çoğu o kadar ince ki tek bir emir fiyatı
              kendi başına oynatır. Havuz bu gürültüyü eleyip geriye ölçülebilir biçimde işlem
              görebilen coinleri bırakır.
            </p>
            <p>
              Sistem <strong>yalnızca</strong> havuzdaki coinleri puanlar ve yalnızca onlara
              pozisyon açar. Havuzda olmayan bir coin sistem için yoktur.
            </p>
          </GuideSection>
          <GuideSection title="Nasıl okunur">
            <p>
              <strong>Filtre hunisi</strong> havuzun nasıl kurulduğunu adım adım gösterir: her
              satırda kaç aday kaldı, kaçı elendi. Bir filtre tek başına adayların yarısından
              fazlasını eliyorsa, o filtrenin gerçekten tasarlandığı işi yapıp yapmadığı
              sorulmalıdır.
            </p>
            <p>
              <strong>Coin tablosunda</strong> her sütun havuza girme ölçütlerinden biridir. Bir
              satıra tıklayınca o coinin tüm ölçütleri ve güncel puanı açılır.
            </p>
          </GuideSection>
          <GuideSection title="Ne yapabilirim">
            <p>
              Bir coini işlem dışı bırakmak isterseniz kara listeye ekleyin; bir sonraki
              yenilemede havuzdan çıkar. Eşikleri değiştirmek için Ayarlar sayfasına gidin —
              orada her eşiğin ne yaptığı ve yanlış ayarlanırsa ne olacağı yazılıdır.
            </p>
          </GuideSection>
        </>
      }
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
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Metric
                label="Havuzdaki coin"
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
                sub={snap.added.slice(0, 4).join(", ") || "—"}
              />
              <Metric
                label="Çıkan"
                value={snap.removed.length}
                format={(value) => num(value, 0)}
                accent={snap.removed.length > 0 ? "var(--sn-down)" : undefined}
                sub={snap.removed.slice(0, 4).join(", ") || "—"}
              />
              <TextMetric
                label="Yenileme sebebi"
                info={<InfoDot text="Havuzun neden yeniden kurulduğu. Planlı: zamanlayıcı çalıştı. Elle: bir kullanıcı tetikledi. Yeniden deneme: önceki kuruluş girdi eksikliği yüzünden başarısız olmuş ve tekrarlanmış." />}
                value={reasonLabel(snap.reason)}
                sub={dateTime(snap.taken_at)}
              />
            </div>

            <Funnel snap={snap} />
            <Turnover market={market} />
            <SymbolTable snap={snap} onSelect={setSelected} />
            {can() && <Blacklist />}
            <SymbolDrawer symbol={selected} onClose={() => setSelected(null)} />
          </>
        )}
      </Async>
    </Page>
  );
}

/* ------------------------------------------------------------------ */
/*  Havuz devri                                                        */
/* ------------------------------------------------------------------ */

/**
 * Snapshot geçmişinden havuzun boyutu ve giren/çıkan sayısı.
 *
 * Havuz her yenilemede DB'ye yazılır (bozulmaz kural 3) ama panel bu
 * geçmişi hiç göstermiyordu. Devir hızı bir sağlık ölçüsüdür: her turda
 * onlarca sembol değişiyorsa filtreler gürültüyü ölçüyor demektir.
 */
function Turnover({ market }: { market: Market }) {
  const q = useQuery({
    queryKey: ["universe-snapshots", market],
    queryFn: () => api.get<SnapshotSummary[]>("/universe/snapshots", { limit: 100, market }),
    refetchInterval: 300_000,
  });
  const seriler = useMemo<CurveSeries[]>(() => {
    const rows = [...(q.data ?? [])].sort((a, b) => (a.taken_at < b.taken_at ? -1 : 1));
    if (rows.length < 2) return [];
    return [
      {
        label: "Havuz boyutu",
        color: "var(--sn-series-1)",
        points: rows.map((r) => ({ at: r.taken_at, value: r.size })),
      },
      {
        label: "Giren + çıkan",
        color: "var(--sn-series-2)",
        dashed: true,
        points: rows.map((r) => ({ at: r.taken_at, value: r.added.length + r.removed.length })),
      },
    ];
  }, [q.data]);

  if (q.isError || seriler.length === 0) return null;
  return (
    <Panel
      title="Havuz devri"
      description="Her nokta bir snapshot. Kesikli çizgi o yenilemede giren+çıkan sembol sayısı — sıfıra yakın seyretmesi havuzun oturduğunu gösterir."
    >
      <CurveChart series={seriler} height={180} valueFormat={(v) => num(v, 0)} />
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/*  Filtre hunisi                                                      */
/* ------------------------------------------------------------------ */

function Funnel({ snap }: { snap: SnapshotDetail }) {
  const steps = snap.funnel ?? [];
  if (steps.length === 0) return null;

  const start = (steps[0]?.kept ?? 0) + (steps[0]?.dropped ?? 0);

  /* En çok eleyen filtre — dikkat çekmek için işaretlenir. Bir filtre tek
     başına adayların yarısını eliyorsa, tasarlandığı işi mi yapıyor yoksa
     eşiği mi kaçık, sorulması gereken soru budur. */
  const biggest = steps.reduce((best, step) => (step.dropped > (best?.dropped ?? -1) ? step : best), steps[0]);

  return (
    <Panel
      title={
        <span className="flex items-center gap-1.5">
          Filtre hunisi
          <InfoDot id="huni" />
        </span>
      }
      description="Havuz tek bir kuralla değil, arka arkaya çalışan bir filtre zinciriyle kurulur. Her satır bir adımı gösterir."
    >
      <p
        className="mb-3"
        style={{ fontSize: "var(--sn-t-caption)", color: "var(--sn-ink-2)" }}
      >
        <strong style={{ color: "var(--sn-ink)", fontWeight: 550 }}>{start}</strong> adayla
        başlandı, <strong style={{ color: "var(--sn-ink)", fontWeight: 550 }}>{snap.size}</strong>{" "}
        coin havuza girdi. En çok eleyen adım{" "}
        <strong style={{ color: "var(--sn-ink)", fontWeight: 550 }}>
          {filterInfo(biggest.name).label}
        </strong>{" "}
        ({biggest.dropped} aday).
      </p>

      <div className="flex flex-col gap-2">
        {steps.map((step) => {
          const info = filterInfo(step.name);
          const width = start > 0 ? (step.kept / start) * 100 : 0;
          const isBiggest = step.name === biggest.name && step.dropped > 0;

          return (
            <div key={`${step.index}-${step.name}`}>
              <div className="flex items-baseline gap-2" style={{ fontSize: "var(--sn-t-caption)" }}>
                <span className="sn-num w-6 shrink-0" style={{ color: "var(--sn-ink-3)" }}>
                  {step.index}.
                </span>
                <span
                  className="flex min-w-0 items-center gap-1 truncate"
                  style={{ color: "var(--sn-ink)" }}
                >
                  {info.label}
                  <InfoDot
                    title={info.label}
                    text={info.why ? `${info.what}\n\n${info.why}` : info.what}
                  />
                </span>
                <span className="sn-num ml-auto shrink-0" style={{ color: "var(--sn-ink-2)" }}>
                  kaldı {step.kept}
                </span>
                <span
                  className="sn-num w-20 shrink-0 text-right"
                  style={{
                    color:
                      step.dropped > 0
                        ? "var(--sn-down)"
                        : step.dropped < 0
                          ? "var(--sn-up)"
                          : "var(--sn-ink-3)",
                  }}
                >
                  {/* Negatif "elenen" = zincir DIŞINDAN eklenen üyeler
                      (histerezis + koruma + yer tutucu). Motor bu adımı
                      açıkça yazar; huninin sonu artık metrikle tutuyor. */}
                  {step.dropped > 0 ? `−${step.dropped}` : step.dropped < 0 ? `+${-step.dropped}` : "—"}
                </span>
              </div>

              <div className="mt-0.5 ml-8">
                <div
                  className="h-1.5 overflow-hidden rounded-full"
                  style={{ background: "var(--sn-sunken)" }}
                >
                  <div
                    className="h-full rounded-full transition-[width] duration-[var(--sn-dur-3)] ease-[var(--sn-ease)]"
                    style={{
                      width: `${Math.max(0, Math.min(100, width))}%`,
                      background: isBiggest ? "var(--sn-warn)" : "var(--sn-brand-solid)",
                    }}
                  />
                </div>
              </div>

              <p
                className={cx("mt-0.5 ml-8")}
                style={{ fontSize: "var(--sn-t-caption)", color: "var(--sn-ink-3)", lineHeight: 1.45 }}
              >
                {info.what}
                {step.examples.length > 0 && (
                  <>
                    {" "}
                    Elenenlerden örnek:{" "}
                    <span className="sn-num">{step.examples.slice(0, 5).join(", ")}</span>
                  </>
                )}
              </p>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/*  Coin tablosu                                                       */
/* ------------------------------------------------------------------ */

function SymbolTable({
  snap,
  onSelect,
}: {
  snap: SnapshotDetail;
  onSelect: (symbol: UniverseSymbol) => void;
}) {
  const columns = useMemo<GridColumn<UniverseSymbol>[]>(
    () => [
      {
        id: "rank",
        header: "#",
        width: 60,
        num: true,
        pin: true,
        hint: "Hacme göre sıra. 1 en yüksek günlük hacme sahip coin.",
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
            {row.placeholder && (
              <Tag tone="warn">
                ölçüm alınamadı
              </Tag>
            )}
          </span>
        ),
      },
      {
        id: "price",
        header: "Fiyat",
        width: 120,
        num: true,
        value: (row) => row.price,
        cell: (row) => (
          <NumText text={row.placeholder ? "—" : price(row.price)} size="sm" />
        ),
      },
      {
        id: "quote_volume",
        header: "24s hacim",
        width: 118,
        num: true,
        hint: "Son 24 saatte bu coinde dönen toplam USDT tutarı. Havuza girmenin ilk şartı budur.",
        value: (row) => row.quote_volume,
        cell: (row) => <NumText text={compact(row.quote_volume)} size="sm" />,
      },
      {
        id: "spread_pct",
        header: "Spread",
        width: 106,
        num: true,
        hint: "Alış ve satış fiyatı arasındaki fark. Geniş spread her işlemde görünmez bir maliyettir.",
        value: (row) => row.spread_pct,
        cell: (row) => (
          <NumText
            text={row.spread_pct === null ? "—" : pct(row.spread_pct / 100, 3)}
            size="sm"
          />
        ),
      },
      {
        id: "volatility_ann_pct",
        header: "Volatilite",
        width: 112,
        num: true,
        hint: "Yıllıklandırılmış oynaklık. Çok düşükse hareket yok, çok yüksekse stop mesafesi makul pozisyon boyutu bırakmaz. Günlük veriden hesaplanır.",
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
        width: 110,
        num: true,
        hidden: true,
        hint: "Son üç gündeki fiyat aralığının genişliği. Aralığı düzensiz olan coinlerde risk hesabı tutmaz.",
        value: (row) => row.range_3d_pct,
        cell: (row) => (
          <NumText text={row.range_3d_pct === null ? "—" : `%${num(row.range_3d_pct, 1)}`} size="sm" />
        ),
      },
      {
        id: "age_days",
        header: "Yaş",
        width: 96,
        num: true,
        hidden: true,
        hint: "Listelenmesinden bu yana geçen gün. Yeni coinlerde göstergelerin hesaplanacağı geçmiş yoktur.",
        value: (row) => row.age_days,
        cell: (row) => (
          <NumText
            text={
              row.placeholder || row.age_days === null ? "—" : `${num(row.age_days, 0)} gün`
            }
            size="sm"
          />
        ),
      },
    ],
    [],
  );

  return (
    <Panel
      title="Havuzdaki coinler"
      description="Her sütun havuza girme ölçütlerinden biri. Bir satıra tıklayınca o coinin tüm ölçütleri ve güncel puanı açılır."
      padded={false}
    >
      {snap.symbols.length === 0 ? (
        <Empty
          title="Havuz boş"
          hint="Filtrelerden hiçbir coin geçemedi. Bu durumda hiçbir bot pozisyon açamaz. Ayarlar sayfasından eşiklere bakın."
        />
      ) : (
        <DataGrid
          rows={snap.symbols}
          columns={columns}
          rowKey={(row) => row.symbol}
          onRowClick={onSelect}
          storageKey="havuz"
          searchPlaceholder="Sembol ara…"
          defaultSort={[{ id: "rank", desc: false }]}
          density="compact"
          maxHeight={620}
          footNote={
            <span>
              Ayar parmak izi <span className="sn-num">{snap.config_hash.slice(0, 12)}</span> · bu
              liste {dateTime(snap.taken_at)} tarihinde dondurulmuştur.
            </span>
          }
        />
      )}
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/*  Coin detayı                                                        */
/* ------------------------------------------------------------------ */

function SymbolDrawer({
  symbol,
  onClose,
}: {
  symbol: UniverseSymbol | null;
  onClose: () => void;
}) {
  const { data: score } = useQuery({
    queryKey: ["score", symbol?.symbol],
    queryFn: () => api.get<ScoreDetail>(`/scores/${symbol!.symbol}`),
    enabled: Boolean(symbol),
    retry: false,
  });

  if (!symbol) return null;

  return (
    <Drawer
      open
      onClose={onClose}
      title={<span className="sn-num">{symbol.symbol}</span>}
      subtitle={`Havuz sırası ${symbol.rank}`}
      badge={symbol.protected ? <Tag tone="brand">korumalı</Tag> : undefined}
      width={520}
    >
      <DrawerSection
        title="Havuza girme ölçütleri"
        hint="Bu coinin filtrelerden geçerken ölçülen değerleri."
      >
        <div className="flex flex-col">
          <Field label="Fiyat" value={<NumText text={price(symbol.price)} size="sm" />} />
          <Field
            label="24 saatlik hacim"
            hint="Bu coinde son 24 saatte dönen toplam USDT tutarı."
            value={<NumText text={compact(symbol.quote_volume)} size="sm" />}
          />
          <Field
            label="Spread"
            term="spread"
            value={
              <NumText
                text={symbol.spread_pct === null ? "—" : pct(symbol.spread_pct / 100, 3)}
                size="sm"
              />
            }
          />
          <Field
            label="Volatilite (yıllık)"
            hint="Günlük veriden hesaplanır. Bu değer yoksa coinin günlük geçmişi indirilmemiş demektir ve coin volatilite filtresine takılır."
            value={
              <NumText
                text={
                  symbol.volatility_ann_pct === null
                    ? "—"
                    : `%${num(symbol.volatility_ann_pct, 1)}`
                }
                size="sm"
              />
            }
          />
          <Field
            label="3 günlük aralık"
            hint="Son üç gündeki fiyat aralığının genişliği."
            value={
              <NumText
                text={symbol.range_3d_pct === null ? "—" : `%${num(symbol.range_3d_pct, 1)}`}
                size="sm"
              />
            }
          />
          <Field
            label="Yaş"
            hint="Listelenmesinden bu yana geçen gün sayısı."
            value={
              <NumText
                text={symbol.age_days === null ? "—" : `${num(symbol.age_days, 0)} gün`}
                size="sm"
              />
            }
          />
          <Field
            label="Korumalı"
            hint="Korumalı bir coin, havuzdan düşse bile açık pozisyonu olduğu için izlenmeye devam eder."
            value={symbol.protected ? "Evet" : "Hayır"}
          />
        </div>
      </DrawerSection>

      <DrawerSection
        title="Güncel puan"
        hint="Bu coin havuzda olduğu için puanlanıyor. Puanın neyden oluştuğu aşağıda."
      >
        {score?.rationale ? (
          <ScoreCard rationale={score.rationale as Rationale} compact />
        ) : (
          <p
            className="rounded-[var(--sn-r-sm)] px-3.5 py-3"
            style={{
              border: "1px dashed var(--sn-border)",
              fontSize: "var(--sn-t-caption)",
              color: "var(--sn-ink-3)",
            }}
          >
            Bu coin için henüz puan hesaplanmamış. Puanlar karar barı kapandığında üretilir —
            havuza yeni girmiş bir coin ilk barını bekliyor olabilir.
          </p>
        )}
      </DrawerSection>

      <DrawerSection title="Havuz nedir">
        <Explain id="havuz" />
      </DrawerSection>
    </Drawer>
  );
}

/* ------------------------------------------------------------------ */
/*  Kara liste                                                         */
/* ------------------------------------------------------------------ */

function Blacklist() {
  const qc = useQueryClient();
  const [symbol, setSymbol] = useState("");
  const [reason, setReason] = useState("");

  const list = useQuery({
    queryKey: ["blacklist"],
    queryFn: () =>
      api.get<{ symbol: string; reason: string; created_at: string }[]>("/universe/blacklist"),
  });

  const add = useMutation({
    mutationFn: () => api.post("/universe/blacklist", { symbol: symbol.toUpperCase(), reason }),
    onSuccess: () => {
      toast.success(`${symbol.toUpperCase()} kara listeye eklendi`);
      setSymbol("");
      setReason("");
      void qc.invalidateQueries({ queryKey: ["blacklist"] });
    },
    onError: (error: Error) => toast.error("Eklenemedi", error.message),
  });

  const remove = useMutation({
    mutationFn: (target: string) => api.delete(`/universe/blacklist/${target}`),
    onSuccess: () => {
      toast.success("Kara listeden çıkarıldı");
      void qc.invalidateQueries({ queryKey: ["blacklist"] });
    },
    onError: (error: Error) => toast.error("Çıkarılamadı", error.message),
  });

  return (
    <Panel
      title={
        <span className="flex items-center gap-1.5">
          Kara liste
          <InfoDot id="kara_liste" />
        </span>
      }
      description="Buraya eklenen coinler filtrelerden geçse bile havuza alınmaz. Değişiklik bir sonraki yenilemede geçerli olur."
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (symbol.trim()) add.mutate();
        }}
        className="mb-4 flex flex-wrap items-end gap-2"
      >
        <label className="flex flex-col gap-1">
          <span style={{ fontSize: "var(--sn-t-caption)", color: "var(--sn-ink-2)" }}>Sembol</span>
          <TextInput
            value={symbol}
            onChange={(event) => setSymbol(event.target.value)}
            placeholder="ÖRNUSDT"
            className="w-36 uppercase"
          />
        </label>
        <label className="flex min-w-48 flex-1 flex-col gap-1">
          <span style={{ fontSize: "var(--sn-t-caption)", color: "var(--sn-ink-2)" }}>Sebep</span>
          <TextInput
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Neden engellendiğini yazın — sonra siz de hatırlamayabilirsiniz."
          />
        </label>
        <Button type="submit" size="md" variant="neutral" disabled={!symbol.trim() || add.isPending}>
          Kara listeye ekle
        </Button>
      </form>

      {(list.data ?? []).length === 0 ? (
        <p style={{ fontSize: "var(--sn-t-caption)", color: "var(--sn-ink-3)" }}>
          Kara liste boş. Havuz yalnızca filtrelere göre kuruluyor.
        </p>
      ) : (
        <ul className="rounded-[var(--sn-r-sm)]" style={{ border: "1px solid var(--sn-border)" }}>
          {(list.data ?? []).map((entry, index) => (
            <li
              key={entry.symbol}
              className="flex items-center gap-3 px-3.5 py-2"
              style={index > 0 ? { borderTop: "1px solid var(--sn-hairline)" } : undefined}
            >
              <span className="sn-num" style={{ fontSize: "var(--sn-t-caption)", color: "var(--sn-ink)" }}>
                {entry.symbol}
              </span>
              <span
                className="min-w-0 flex-1 truncate"
                style={{ fontSize: "var(--sn-t-caption)", color: "var(--sn-ink-2)" }}
              >
                {entry.reason || "sebep yazılmamış"}
              </span>
              <span
                className="shrink-0"
                style={{ fontSize: "var(--sn-t-caption)", color: "var(--sn-ink-3)" }}
              >
                {relative(entry.created_at)}
              </span>
              <IconButton
                size="sm"
                label={`${entry.symbol} kara listeden çıkar`}
                onClick={() => remove.mutate(entry.symbol)}
              >
                <IClose size={13} />
              </IconButton>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

/* ------------------------------------------------------------------ */

/**
 * Yenileme sebebinin okunur karşılığı.
 *
 * Değerler veritabanındaki gerçek kayıtlardan alındı (`universe_snapshots`).
 * Karşılığı olmayan bir sebep uydurulmaz, olduğu gibi basılır.
 */
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
