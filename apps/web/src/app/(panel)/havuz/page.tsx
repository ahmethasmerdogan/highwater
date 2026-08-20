"use client";

/**
 * Havuz — sistemin işlem yapmayı düşündüğü coin listesi.
 *
 * Bu sayfa yalnızca "hangi coinler havuzda" sorusuna değil, **"neden bu
 * coinler"** sorusuna da cevap verir. Filtre hunisi her adımda kaç adayın
 * elendiğini ve o filtrenin ne işe yaradığını gösterir; bir coine tıklayınca
 * hangi ölçütlerle geçtiği açılır.
 */

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, StatusPill, IX, cx } from "@/ui";
import {
  api,
  type Rationale,
  type ScoreDetail,
  type SnapshotDetail,
  type UniverseSymbol,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { toast } from "@/lib/toast";
import { Page, Section, StatGrid, Async, Empty } from "@/components/common/page";
import { Stat, AmountText } from "@/components/common/amount";
import { Explain, Field, InfoDot } from "@/components/common/explain";
import { DataTable, type Column } from "@/components/data/data-table";
import { Drawer, DrawerSection } from "@/components/data/drawer";
import { ScoreCard } from "@/components/viz/score-card";
import { filterInfo } from "@/lib/universe-filters";
import { compact, dateTime, num, pct, price, relative } from "@/lib/format";

export default function UniversePage() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const [selected, setSelected] = useState<UniverseSymbol | null>(null);

  const snapshot = useQuery({
    queryKey: ["universe-current"],
    queryFn: () => api.get<SnapshotDetail>("/universe/current"),
    refetchInterval: 60_000,
  });

  const refresh = useMutation({
    mutationFn: () => api.post("/universe/refresh"),
    onSuccess: () => {
      toast.success("Havuz yenilendi");
      void qc.invalidateQueries({ queryKey: ["universe-current"] });
    },
    onError: (e: Error) =>
      toast.error("Havuz yenilenemedi", e.message),
  });

  return (
    <Page
      title="Havuz"
      description="Sistemin işlem yapmayı düşündüğü coinler. Binance'teki her coin değil — likidite ve ölçülebilirlik filtrelerinden geçenler."
      intro={{
        storageKey: "havuz",
        what: "Binance spot piyasasında binlerce çift var; çoğu o kadar ince ki tek bir emir fiyatı kendi başına oynatır. Havuz bu gürültüyü eleyip geriye ölçülebilir biçimde işlem görebilen coinleri bırakır.\n\nSistem **yalnızca** havuzdaki coinleri puanlar ve yalnızca onlara pozisyon açar. Havuzda olmayan bir coin sistem için yoktur.",
        how: "**Filtre hunisi** havuzun nasıl kurulduğunu adım adım gösterir: her satırda kaç aday kaldı, kaçı elendi. Bir filtre tek başına adayların yarısından fazlasını eliyorsa, o filtrenin gerçekten tasarlandığı işi yapıp yapmadığı sorulmalıdır.\n\n**Coin tablosunda** her sütun havuza girme ölçütlerinden biridir. Bir satıra tıklayınca o coinin tüm ölçütleri ve güncel puanı açılır.",
        action: "Bir coini işlem dışı bırakmak isterseniz kara listeye ekleyin; bir sonraki yenilemede havuzdan çıkar. Eşikleri değiştirmek için **Ayarlar** sayfasına gidin — orada her eşiğin ne yaptığı ve yanlış ayarlanırsa ne olacağı yazılıdır.",
        terms: ["havuz", "huni", "snapshot", "histerezis", "config_hash", "kara_liste"],
      }}
      actions={
        can("TRADER") && (
          <Button
            size="sm"
            variant="amber"
            shape="rect"
            disabled={refresh.isPending}
            onClick={() => refresh.mutate()}
          >
            {refresh.isPending ? "Yenileniyor…" : "Havuzu yenile"}
          </Button>
        )
      }
    >
      <Async
        query={snapshot}
        empty={{
          title: "Havuz henüz kurulmadı",
          description:
            "Filtre zinciri hiç çalışmamış ya da girdi verisi gelmemiş. Piyasa verisi servisi ayaktaysa bir sonraki yenilemede kurulur.",
        }}
      >
        {(snap) => (
          <>
            <StatGrid cols={4}>
              <Stat
                label="Havuzdaki coin"
                term="havuz"
                value={<AmountText text={num(snap.size, 0)} size="xl" />}
                sub={`son yenileme ${relative(snap.taken_at)}`}
              />
              <Stat
                label="Eklenen"
                hint="Bu yenilemede havuza yeni giren coinler. Girdikleri anda puanlanmaya başlarlar."
                value={<AmountText text={num(snap.added.length, 0)} size="xl" />}
                sub={snap.added.slice(0, 4).join(", ") || "—"}
                tone={snap.added.length > 0 ? "up" : "neutral"}
              />
              <Stat
                label="Çıkan"
                hint="Bu yenilemede havuzdan düşen coinler. Bunlarda açık pozisyon varsa yönetilmeye devam edilir; yeni giriş yapılmaz."
                value={<AmountText text={num(snap.removed.length, 0)} size="xl" />}
                sub={snap.removed.slice(0, 4).join(", ") || "—"}
                tone={snap.removed.length > 0 ? "down" : "neutral"}
              />
              <Stat
                label="Yenileme sebebi"
                hint="Havuzun neden yeniden kurulduğu. Planlı: zamanlayıcı çalıştı. Elle: bir kullanıcı tetikledi. Yeniden deneme: önceki kuruluş girdi eksikliği yüzünden başarısız olmuş ve tekrarlanmış."
                value={<span className="text-[15px] text-ink">{reasonLabel(snap.reason)}</span>}
                sub={dateTime(snap.taken_at)}
              />
            </StatGrid>

            <Funnel snap={snap} />

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
/*  Filtre hunisi                                                      */
/* ------------------------------------------------------------------ */

function Funnel({ snap }: { snap: SnapshotDetail }) {
  const steps = snap.funnel ?? [];
  if (steps.length === 0) return null;

  const start = (steps[0]?.kept ?? 0) + (steps[0]?.dropped ?? 0);

  /* En çok eleyen filtre — dikkat çekmek için işaretlenir. */
  const biggest = steps.reduce(
    (m, s) => (s.dropped > (m?.dropped ?? -1) ? s : m),
    steps[0],
  );

  return (
    <Section
      title="Filtre hunisi"
      term="huni"
      description="Havuz tek bir kuralla değil, arka arkaya çalışan bir filtre zinciriyle kurulur. Her satır bir adımı gösterir."
    >
      <div className="mb-3 text-[12.5px] text-ink-2">
        <strong className="font-medium text-ink">{start}</strong> adayla başlandı,{" "}
        <strong className="font-medium text-ink">{snap.size}</strong> coin havuza girdi. En çok
        eleyen adım <strong className="font-medium text-ink">{filterInfo(biggest.name).label}</strong> (
        {biggest.dropped} aday).
      </div>

      <div className="space-y-1.5">
        {steps.map((step) => {
          const info = filterInfo(step.name);
          const width = start > 0 ? (step.kept / start) * 100 : 0;
          const isBiggest = step.name === biggest.name && step.dropped > 0;

          return (
            <div key={`${step.index}-${step.name}`} className="group">
              <div className="flex items-baseline gap-2 text-[12.5px]">
                <span className="num w-6 shrink-0 text-ink-3">{step.index}.</span>
                <span className="flex min-w-0 items-center gap-1 truncate text-ink">
                  {info.label}
                  <InfoDot
                    title={info.label}
                    text={info.why ? `${info.what}\n\n${info.why}` : info.what}
                    align="start"
                  />
                </span>
                <span className="num ml-auto shrink-0 text-ink-2">kaldı {step.kept}</span>
                <span
                  className={cx(
                    "num w-20 shrink-0 text-right",
                    step.dropped > 0 ? "text-down" : "text-ink-3",
                  )}
                >
                  {step.dropped > 0 ? `−${step.dropped}` : "—"}
                </span>
              </div>

              <div className="mt-0.5 ml-8 flex items-center gap-2">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-inset">
                  <div
                    className={cx(
                      "h-full rounded-full",
                      isBiggest ? "bg-warn" : "bg-brand",
                    )}
                    style={{ width: `${Math.max(0, Math.min(100, width))}%` }}
                  />
                </div>
              </div>

              <p className="mt-0.5 ml-8 text-[11.5px] leading-snug text-ink-3">
                {info.what}
                {step.examples.length > 0 && (
                  <span className="text-ink-3">
                    {" "}
                    Elenenlerden örnek:{" "}
                    <span className="font-mono">{step.examples.slice(0, 5).join(", ")}</span>
                  </span>
                )}
              </p>
            </div>
          );
        })}
      </div>
    </Section>
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
  onSelect: (s: UniverseSymbol) => void;
}) {
  const columns: Column<UniverseSymbol>[] = [
    {
      key: "rank",
      header: "#",
      width: "60px",
      num: true,
      hint: "Hacme göre sıra. 1 en yüksek günlük hacme sahip coin.",
      sort: (r) => r.rank,
      cell: (r) => r.rank,
    },
    {
      key: "symbol",
      header: "Sembol",
      width: "130px",
      sort: (r) => r.symbol,
      cell: (r) => (
        <span className="flex items-center gap-1.5">
          <span className="font-mono text-[12.5px] text-ink">{r.symbol}</span>
          {r.protected && (
            <StatusPill size="sm" tone="amber">
              korumalı
            </StatusPill>
          )}
        </span>
      ),
    },
    {
      key: "price",
      header: "Fiyat",
      num: true,
      sort: (r) => r.price,
      cell: (r) => price(r.price),
    },
    {
      key: "quote_volume",
      header: "24s hacim",
      num: true,
      hint: "Son 24 saatte bu coinde dönen toplam USDT tutarı. Havuza girmenin ilk şartı budur.",
      sort: (r) => r.quote_volume,
      cell: (r) => compact(r.quote_volume),
    },
    {
      key: "spread_pct",
      header: "Spread",
      num: true,
      term: "spread",
      sort: (r) => r.spread_pct,
      cell: (r) => (r.spread_pct === null ? "—" : pct(r.spread_pct / 100, 3)),
    },
    {
      key: "volatility_ann_pct",
      header: "Volatilite",
      num: true,
      hint: "Yıllıklandırılmış oynaklık. Çok düşükse hareket yok, çok yüksekse stop mesafesi makul pozisyon boyutu bırakmaz. Günlük veriden hesaplanır.",
      sort: (r) => r.volatility_ann_pct,
      cell: (r) => (r.volatility_ann_pct === null ? "—" : `%${num(r.volatility_ann_pct, 0)}`),
    },
    {
      key: "range_3d_pct",
      header: "3g aralık",
      num: true,
      hint: "Son üç gündeki fiyat aralığının genişliği. Aralığı düzensiz olan coinlerde risk hesabı tutmaz.",
      defaultHidden: true,
      sort: (r) => r.range_3d_pct,
      cell: (r) => (r.range_3d_pct === null ? "—" : `%${num(r.range_3d_pct, 1)}`),
    },
    {
      key: "age_days",
      header: "Yaş",
      num: true,
      hint: "Listelenmesinden bu yana geçen gün. Yeni coinlerde göstergelerin hesaplanacağı geçmiş yoktur.",
      defaultHidden: true,
      sort: (r) => r.age_days,
      cell: (r) => (r.age_days === null ? "—" : `${num(r.age_days, 0)} g`),
    },
  ];

  return (
    <Section
      title="Havuzdaki coinler"
      description="Her sütun havuza girme ölçütlerinden biri. Bir satıra tıklayınca o coinin tüm ölçütleri ve güncel puanı açılır."
      padded={false}
    >
      {snap.symbols.length === 0 ? (
        <Empty
          title="Havuz boş"
          description="Filtrelerden hiçbir coin geçemedi. Bu durumda hiçbir bot pozisyon açamaz. Ayarlar sayfasından eşiklere bakın."
          className="m-4 border-0"
        />
      ) : (
        <DataTable
          rows={snap.symbols}
          columns={columns}
          rowKey={(r) => r.symbol}
          onRowClick={onSelect}
          storageKey="havuz"
          searchText={(r) => r.symbol}
          searchPlaceholder="Sembol ara…"
          defaultSort={{ key: "rank", dir: "asc" }}
          dense
          footNote={
            <span>
              Ayar parmak izi <span className="font-mono">{snap.config_hash.slice(0, 12)}</span> ·
              bu liste {dateTime(snap.taken_at)} tarihinde dondurulmuştur.
            </span>
          }
        />
      )}
    </Section>
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
      title={<span className="font-mono">{symbol.symbol}</span>}
      subtitle={`Havuz sırası ${symbol.rank}`}
      badge={
        symbol.protected ? (
          <StatusPill size="sm" tone="amber">
            korumalı
          </StatusPill>
        ) : undefined
      }
    >
      <DrawerSection
        title="Havuza girme ölçütleri"
        description="Bu coinin filtrelerden geçerken ölçülen değerleri."
      >
        <div className="divide-y divide-line rounded-lg border border-line px-3.5">
          <Field label="Fiyat" value={<span className="num">{price(symbol.price)}</span>} />
          <Field
            label="24 saatlik hacim"
            hint="Bu coinde son 24 saatte dönen toplam USDT tutarı."
            value={<span className="num">{compact(symbol.quote_volume)}</span>}
          />
          <Field
            label="Spread"
            term="spread"
            value={
              <span className="num">
                {symbol.spread_pct === null ? "—" : pct(symbol.spread_pct / 100, 3)}
              </span>
            }
          />
          <Field
            label="Volatilite (yıllık)"
            hint="Günlük veriden hesaplanır. Bu değer yoksa coinin günlük geçmişi indirilmemiş demektir ve coin volatilite filtresine takılır."
            value={
              <span className="num">
                {symbol.volatility_ann_pct === null
                  ? "—"
                  : `%${num(symbol.volatility_ann_pct, 1)}`}
              </span>
            }
          />
          <Field
            label="3 günlük aralık"
            hint="Son üç gündeki fiyat aralığının genişliği."
            value={
              <span className="num">
                {symbol.range_3d_pct === null ? "—" : `%${num(symbol.range_3d_pct, 1)}`}
              </span>
            }
          />
          <Field
            label="Yaş"
            hint="Listelenmesinden bu yana geçen gün sayısı."
            value={
              <span className="num">
                {symbol.age_days === null ? "—" : `${num(symbol.age_days, 0)} gün`}
              </span>
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
        description="Bu coin havuzda olduğu için puanlanıyor. Puanın neyden oluştuğu aşağıda."
      >
        {score?.rationale ? (
          <ScoreCard rationale={score.rationale as Rationale} compactStyle />
        ) : (
          <p className="rounded-lg border border-dashed border-line px-3.5 py-3 text-[12.5px] text-ink-3">
            Bu coin için henüz puan hesaplanmamış. Puanlar karar barı kapandığında üretilir —
            havuza yeni girmiş bir coin ilk barını bekliyor olabilir.
          </p>
        )}
      </DrawerSection>

      <DrawerSection title="Havuz nedir">
        <Explain id="havuz" showTitle={false} />
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
    queryFn: () => api.get<{ symbol: string; reason: string; created_at: string }[]>(
      "/universe/blacklist",
    ),
  });

  const add = useMutation({
    mutationFn: () => api.post("/universe/blacklist", { symbol: symbol.toUpperCase(), reason }),
    onSuccess: () => {
      toast.success(`${symbol.toUpperCase()} kara listeye eklendi`);
      setSymbol("");
      setReason("");
      void qc.invalidateQueries({ queryKey: ["blacklist"] });
    },
    onError: (e: Error) =>
      toast.error("Eklenemedi", e.message),
  });

  const remove = useMutation({
    mutationFn: (s: string) => api.delete(`/universe/blacklist/${s}`),
    onSuccess: () => {
      toast.success("Kara listeden çıkarıldı");
      void qc.invalidateQueries({ queryKey: ["blacklist"] });
    },
    onError: (e: Error) =>
      toast.error("Çıkarılamadı", e.message),
  });

  return (
    <Section
      title="Kara liste"
      term="kara_liste"
      description="Buraya eklenen coinler filtrelerden geçse bile havuza alınmaz. Değişiklik bir sonraki yenilemede geçerli olur."
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (symbol.trim()) add.mutate();
        }}
        className="mb-4 flex flex-wrap items-end gap-2"
      >
        <label className="flex flex-col gap-1">
          <span className="text-[12px] text-ink-2">Sembol</span>
          <input
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
            placeholder="ÖRNUSDT"
            className="h-8 w-36 rounded-lg border border-line bg-inset px-2.5 font-mono text-[12.5px] text-ink uppercase placeholder:text-ink-3 focus:border-brand focus:outline-none"
          />
        </label>
        <label className="flex flex-1 flex-col gap-1">
          <span className="text-[12px] text-ink-2">Sebep</span>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Neden engellendiğini yazın — sonra siz de hatırlamayabilirsiniz."
            className="h-8 w-full min-w-48 rounded-lg border border-line bg-inset px-2.5 text-[12.5px] text-ink placeholder:text-ink-3 focus:border-brand focus:outline-none"
          />
        </label>
        <Button
          type="submit"
          size="sm"
          variant="outline"
          shape="rect"
          disabled={!symbol.trim() || add.isPending}
        >
          Kara listeye ekle
        </Button>
      </form>

      {(list.data ?? []).length === 0 ? (
        <p className="text-[12.5px] text-ink-3">
          Kara liste boş. Havuz yalnızca filtrelere göre kuruluyor.
        </p>
      ) : (
        <ul className="divide-y divide-line rounded-lg border border-line">
          {(list.data ?? []).map((b) => (
            <li key={b.symbol} className="flex items-center gap-3 px-3.5 py-2">
              <span className="font-mono text-[12.5px] text-ink">{b.symbol}</span>
              <span className="min-w-0 flex-1 truncate text-[12px] text-ink-2">
                {b.reason || "sebep yazılmamış"}
              </span>
              <span className="shrink-0 text-[11.5px] text-ink-3">
                {relative(b.created_at)}
              </span>
              <button
                type="button"
                onClick={() => remove.mutate(b.symbol)}
                aria-label={`${b.symbol} kara listeden çıkar`}
                className="shrink-0 rounded p-1 text-ink-3 hover:bg-inset hover:text-down"
              >
                <IX size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Section>
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
