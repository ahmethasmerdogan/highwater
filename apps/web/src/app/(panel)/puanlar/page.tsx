"use client";

/**
 * Puanlar — havuzdaki coinlerin 0–100 notu ve her notun gerekçesi.
 *
 * Puan mutlak bir yargı değildir: "bu coin yükselecek" demez, "şu an
 * havuzdaki coinler arasında şurada duruyor" der. Sayfa bunu her yerde
 * açıkça yazar; aksi hâlde kullanıcı 84 puanı bir tahmin sanır.
 */

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button, cx } from "@/ui";
import { api, type Score, type ScoreConfig, type ScoreDetail } from "@/lib/api";
import { Page, Section, StatGrid, Async, Empty } from "@/components/common/page";
import { Stat, AmountText } from "@/components/common/amount";
import { Explain, InfoDot, Term } from "@/components/common/explain";
import { DataTable, type Column } from "@/components/data/data-table";
import { Drawer, DrawerSection } from "@/components/data/drawer";
import { ScoreCard } from "@/components/viz/score-card";
import { CurveChart } from "@/components/viz/charts";
import {
  FAMILY_COLORS,
  FAMILY_LABELS,
  FAMILY_TERMS,
  dateTime,
  num,
  relative,
} from "@/lib/format";

const keyOf = (c: ScoreConfig) => `${c.config_hash}:${c.timeframe}`;

export default function ScoresPage() {
  /* Bir sıralamanın kimliği hash + zaman dilimidir; aynı ağırlıklar farklı
     dilimlerde aynı hash'i üretir ve tek başına hash seçimi belirsiz bırakır. */
  const [configKey, setConfigKey] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  /* Aynı anda birden çok bot farklı ağırlıklarla puanlar; hepsini tek listede
     göstermek sıralamayı anlamsız kılar. Panel her seferinde tek bir ayar
     kümesini gösterir. */
  const configs = useQuery({
    queryKey: ["score-configs"],
    queryFn: () => api.get<ScoreConfig[]>("/scores/configs"),
    refetchInterval: 60_000,
  });

  useEffect(() => {
    if (!configKey && configs.data?.length) setConfigKey(keyOf(configs.data[0]));
  }, [configs.data, configKey]);

  const active = configs.data?.find((c) => keyOf(c) === configKey);

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

  // `useMemo` bağımlılığı; her çizimde yeni dizi üretmesin.
  const rows = useMemo(() => scores.data ?? [], [scores.data]);

  const stats = useMemo(() => {
    if (rows.length === 0) return null;
    const values = rows.map((r) => r.score);
    const sorted = [...values].sort((a, b) => a - b);
    return {
      count: rows.length,
      top: Math.max(...values),
      median: sorted[Math.floor(sorted.length / 2)],
      above70: values.filter((v) => v >= 70).length,
    };
  }, [rows]);

  const columns: Column<Score>[] = [
    {
      key: "rank",
      header: "#",
      width: "56px",
      num: true,
      cell: (r) => rows.indexOf(r) + 1,
    },
    {
      key: "symbol",
      header: "Sembol",
      width: "130px",
      sort: (r) => r.symbol,
      cell: (r) => <span className="font-mono text-[12.5px] text-ink">{r.symbol}</span>,
    },
    {
      key: "score",
      header: "Puan",
      width: "110px",
      num: true,
      term: "puan",
      sort: (r) => r.score,
      cell: (r) => <ScoreBadge score={r.score} />,
    },
    ...Object.keys(FAMILY_LABELS).map<Column<Score>>((family) => ({
      key: family,
      header: FAMILY_LABELS[family],
      num: true,
      term: FAMILY_TERMS[family],
      sort: (r) => r.families?.[family] ?? null,
      cell: (r) => <FamilyCell value={r.families?.[family]} family={family} />,
    })),
    {
      key: "modifiers",
      header: "Düzeltme",
      num: true,
      term: "formasyon",
      sort: (r) => Object.values(r.modifiers ?? {}).reduce((s, v) => s + v, 0),
      cell: (r) => {
        const total = Object.values(r.modifiers ?? {}).reduce((s, v) => s + v, 0);
        if (total === 0) return <span className="text-ink-3">—</span>;
        return (
          <span className={cx("num", total > 0 ? "text-up" : "text-down")}>
            {total > 0 ? "+" : ""}
            {num(total, 1)}
          </span>
        );
      },
    },
    {
      key: "bar_time",
      header: "Bar",
      width: "150px",
      defaultHidden: true,
      term: "karar_bari",
      sort: (r) => new Date(r.bar_time).getTime(),
      cell: (r) => <span className="text-[12px] text-ink-3">{dateTime(r.bar_time)}</span>,
    },
  ];

  return (
    <Page
      title="Puanlar"
      description="Havuzdaki coinlerin 0–100 arası notu. Bir tahmin değil, aynı andaki diğer coinlere göre sıralama."
      intro={{
        storageKey: "puanlar",
        what: "Her karar barı kapandığında havuzdaki tüm coinler aynı ölçütlerle puanlanır. Puan beş aileden gelen katkıların toplamıdır; üstüne formasyon ve mum sinyalleri küçük bir düzeltme ekler.",
        how: "**80 puan \"yükselecek\" demek değildir.** \"Şu an havuzdaki çoğu coinden daha uygun görünüyor\" demektir. Puan kesitseldir: coin kendi geçmişiyle değil, aynı andaki diğer coinlerle karşılaştırılır.\n\nSütunlardaki aile katkıları puanın nereden geldiğini gösterir. Bir satıra tıklayınca **Puan Kartı** açılır: yığılmış çubuk, ilk üç sebep ve destek/direnç geometrisi.\n\n**Ayar seçici** üstte: birden fazla bot farklı ağırlıklarla puanlıyorsa her biri ayrı bir liste üretir, karıştırılmaz.",
        action: "Puanlamanın gerçekten işe yarayıp yaramadığını görmek için **Kalibrasyon** sayfasına gidin. Orada puan dilimlerinin ileri getiriyle ilişkisi ölçülür ve cevap \"hayır\" olabilir.",
        terms: ["puan", "gerekce", "yuzdelik", "config_hash", "karar_bari", "kalibrasyon"],
      }}
      actions={
        <Link href="/kalibrasyon">
          <Button size="sm" variant="ghost" shape="rect">
            Bu puanlar işe yarıyor mu?
          </Button>
        </Link>
      }
    >
      {/* Ayar seçici */}
      {(configs.data?.length ?? 0) > 1 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-elev px-4 py-2.5">
          <span className="flex items-center gap-1 text-[12.5px] text-ink-2">
            Puanlama ayarı
            <InfoDot id="config_hash" align="start" />
          </span>
          {configs.data!.map((c) => (
            <button
              key={keyOf(c)}
              type="button"
              onClick={() => setConfigKey(keyOf(c))}
              className={cx(
                "rounded-lg border px-2.5 py-1 text-[12px] transition-colors",
                keyOf(c) === configKey
                  ? "border-brand bg-brand-soft font-medium text-brand"
                  : "border-line text-ink-2 hover:border-line-strong hover:text-ink",
              )}
            >
              {c.label}
              <span className="ml-1.5 text-[11px] opacity-70">
                {c.timeframe} · {c.symbols} coin
              </span>
            </button>
          ))}
        </div>
      )}

      {stats && (
        <StatGrid cols={4}>
          <Stat
            label="Puanlanan coin"
            hint="Bu ayar kümesiyle son barda puanlanan coin sayısı. Havuz boyutuyla aynı olmalıdır."
            value={<AmountText text={num(stats.count, 0)} size="xl" />}
            sub={active ? `son bar ${relative(active.bar_time)}` : null}
          />
          <Stat
            label="En yüksek puan"
            hint="Listedeki en yüksek not. Tek başına bir şey söylemez — kalibrasyon sayfası bunun anlamlı olup olmadığını ölçer."
            value={<AmountText text={num(stats.top, 1)} size="xl" />}
          />
          <Stat
            label="Ortanca puan"
            hint="Listenin tam ortasındaki değer. Ortanca 50 civarındaysa puanlama havuzu dengeli dağıtıyor demektir."
            value={<AmountText text={num(stats.median, 1)} size="xl" />}
          />
          <Stat
            label="70 ve üzeri"
            hint="Giriş eşiğine yakın aday sayısı. Çok azsa bot işlem açacak aday bulamaz; çok fazlaysa eşik gevşek olabilir."
            value={<AmountText text={num(stats.above70, 0)} size="xl" />}
            sub={`${num((stats.above70 / stats.count) * 100, 0)}% listenin`}
          />
        </StatGrid>
      )}

      <Section
        title="Puan tablosu"
        description="En yüksekten en düşüğe. Aile sütunları puanın nereden geldiğini gösterir; toplamları taban puanı verir."
        padded={false}
      >
        <Async
          query={scores}
          empty={{
            title: "Henüz puan yok",
            description:
              "Puanlar karar barı kapandığında hesaplanır. Havuz kurulduysa bir sonraki bar kapanışında burası dolar.",
          }}
        >
          {(list) =>
            list.length === 0 ? (
              <Empty
                title="Henüz puan yok"
                description="Puanlar karar barı kapandığında hesaplanır."
                className="m-4 border-0"
              />
            ) : (
              <DataTable
                rows={list}
                columns={columns}
                rowKey={(r) => r.symbol}
                onRowClick={(r) => setSelected(r.symbol)}
                storageKey="puanlar"
                searchText={(r) => r.symbol}
                searchPlaceholder="Sembol ara…"
                defaultSort={{ key: "score", dir: "desc" }}
                dense
                footNote={
                  active ? (
                    <span>
                      {active.label} ayarıyla · {dateTime(active.bar_time)} barı
                    </span>
                  ) : null
                }
              />
            )
          }
        </Async>
      </Section>

      <Section title="Puan nedir, nasıl okunur" padded>
        <div className="grid gap-5 md:grid-cols-2">
          <Explain id="puan" showTitle={false} />
          <div className="space-y-3">
            <div>
              <h3 className="mb-1.5 text-[13px] font-semibold text-ink">Beş aile</h3>
              <ul className="space-y-1.5">
                {Object.keys(FAMILY_LABELS).map((f) => (
                  <li key={f} className="flex items-start gap-2 text-[12.5px]">
                    <span
                      aria-hidden
                      className="mt-1.5 size-2 shrink-0 rounded-[2px]"
                      style={{ background: FAMILY_COLORS[f] }}
                    />
                    <span>
                      <Term id={FAMILY_TERMS[f]} className="font-medium text-ink" />
                      <span className="text-ink-2"> — üstüne gelin, ne ölçtüğü yazıyor.</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <Explain id="gerekce" compactStyle />
          </div>
        </div>
      </Section>

      <ScoreDrawer symbol={selected} onClose={() => setSelected(null)} />
    </Page>
  );
}

/* ------------------------------------------------------------------ */
/*  Puan detayı                                                        */
/* ------------------------------------------------------------------ */

function ScoreDrawer({ symbol, onClose }: { symbol: string | null; onClose: () => void }) {
  const detail = useQuery({
    queryKey: ["score", symbol],
    queryFn: () => api.get<ScoreDetail>(`/scores/${symbol}`),
    enabled: Boolean(symbol),
  });

  const history = useQuery({
    queryKey: ["score-history", symbol],
    queryFn: () =>
      api.get<{ bar_time: string; score: number }[]>(`/scores/${symbol}/history`, { days: 7 }),
    enabled: Boolean(symbol),
  });

  if (!symbol) return null;

  return (
    <Drawer
      open
      onClose={onClose}
      title={<span className="font-mono">{symbol}</span>}
      subtitle="Puanın gerekçesi"
      width="max-w-2xl"
    >
      {detail.data?.rationale ? (
        <>
          <DrawerSection title="Puan kartı">
            <ScoreCard rationale={detail.data.rationale} />
          </DrawerSection>

          <DrawerSection
            title="Son 7 gün"
            description="Puanın zaman içindeki seyri. Sürekli düşen bir puan, pozisyondaysanız çıkış sinyali olabilir."
          >
            <CurveChart
              height={160}
              series={[
                {
                  label: "Puan",
                  color: "var(--brand)",
                  points: (history.data ?? []).map((h) => ({
                    at: h.bar_time,
                    value: h.score,
                  })),
                },
              ]}
              valueFormat={(v) => num(v, 1)}
              emptyText="Bu sembol için yeterli puan geçmişi yok."
            />
          </DrawerSection>

          <DrawerSection title="Künye">
            <div className="space-y-1 rounded-lg border border-line px-3.5 py-2.5 text-[12.5px]">
              <div className="flex justify-between gap-3">
                <span className="text-ink-2">Bar zamanı</span>
                <span className="num">{dateTime(detail.data.bar_time)}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="flex items-center gap-1 text-ink-2">
                  Ayar parmak izi
                  <InfoDot id="config_hash" align="start" />
                </span>
                <span className="font-mono text-[11.5px]">
                  {detail.data.config_hash.slice(0, 16)}
                </span>
              </div>
            </div>
          </DrawerSection>
        </>
      ) : detail.isLoading ? (
        <p className="text-[13px] text-ink-3">Yükleniyor…</p>
      ) : (
        <p className="text-[13px] text-ink-3">
          Bu sembol için gerekçe bulunamadı. Puan hesaplanmış ama gerekçesi kaydedilmemişse bu
          bir kayıt hatasıdır — Loglar sayfasına bakın.
        </p>
      )}
    </Drawer>
  );
}

/* ------------------------------------------------------------------ */
/*  Küçük parçalar                                                     */
/* ------------------------------------------------------------------ */

/**
 * Puanı sayı + doluluk çubuğu olarak basar.
 *
 * Çubuk kimliği renkle değil doluluk oranıyla taşır; puanın kendisi zaten
 * yanında yazılı, yani bilgi renge bağlı değil.
 */
function ScoreBadge({ score }: { score: number }) {
  return (
    <span className="inline-flex items-center justify-end gap-2">
      <span className="h-1.5 w-10 overflow-hidden rounded-full bg-inset">
        <span
          className="block h-full rounded-full bg-brand"
          style={{ width: `${Math.max(0, Math.min(100, score))}%` }}
        />
      </span>
      <AmountText text={num(score, 1)} size="sm" />
    </span>
  );
}

function FamilyCell({ value, family }: { value: number | undefined; family: string }) {
  if (value === undefined || !Number.isFinite(value)) {
    return <span className="text-ink-3">—</span>;
  }
  return (
    <span className="inline-flex items-center justify-end gap-1.5">
      <span
        aria-hidden
        className="size-1.5 shrink-0 rounded-[1px] opacity-70"
        style={{ background: FAMILY_COLORS[family] }}
      />
      <span className="num">{num(value, 1)}</span>
    </span>
  );
}
