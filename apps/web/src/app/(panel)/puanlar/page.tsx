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
import { api, type Score, type ScoreConfig, type ScoreDetail } from "@/lib/api";
import { dateTime, num, relative } from "@/lib/format";
import { Page, GuideSection } from "@/shell/page";
import { Button, Panel, Picker, Tag, Tip } from "@/design/primitives";
import { Metric, NumCell, NumText } from "@/design/numeric";
import { Bar, FamilyStack, RangeDot } from "@/design/viz";
import { Drawer, DrawerSection, KeyValue } from "@/design/drawer";
import { FAMILIES } from "@/design/series";
import { DataGrid } from "@/grid/data-grid";
import type { GridColumn } from "@/grid/types";

/** Bir sıralamanın kimliği hash **ve** zaman dilimidir: aynı ağırlıklar
 *  farklı dilimlerde aynı hash'i üretir, tek başına hash seçimi belirsiz
 *  bırakır ve React'te aynı anahtarı üç kez doğurur. */
const keyOf = (config: ScoreConfig) => `${config.config_hash}:${config.timeframe}`;

/**
 * Seçenek etiketlerinin ORTAK önekini ayıklar.
 *
 * Uçtan gelen etiket, o ayarı kullanan botların adlarının birleşimidir:
 * "Havuz Momentum · taban · Havuz Momentum · seçici". Hepsi aynı strateji
 * ailesinden olduğu için baştaki parça her seçenekte aynıdır ve ayrımı
 * taşımaz — ama seçiciyi taşırıp **sonu** kestiriyor, yani ayrımı taşıyan
 * tek kısmı gizliyordu. Ortak önek atılınca "taban · seçici" ile "trend
 * ağırlıklı" yan yana okunabilir hâle gelir.
 *
 * Ayıklama yalnızca ` · ` sınırlarında yapılır; kelime ortasından kesmek
 * anlamsız parçalar üretirdi.
 */
function stripCommonPrefix(labels: string[]): (label: string) => string {
  if (labels.length < 2) return (label) => label;

  const parts = labels.map((label) => label.split(" · "));
  let shared = 0;
  while (
    shared < parts[0].length - 1 &&
    parts.every((part) => part.length > shared + 1 && part[shared] === parts[0][shared])
  ) {
    shared += 1;
  }
  if (shared === 0) return (label) => label;

  return (label) => {
    const own = label.split(" · ");
    return own.slice(shared).join(" · ") || label;
  };
}

export default function ScoresPage() {
  const [configKey, setConfigKey] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  const configs = useQuery({
    queryKey: ["score-configs"],
    queryFn: () => api.get<ScoreConfig[]>("/scores/configs"),
    refetchInterval: 60_000,
  });

  useEffect(() => {
    if (!configKey && configs.data?.length) setConfigKey(keyOf(configs.data[0]));
  }, [configs.data, configKey]);

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

  const rows = useMemo(() => scores.data ?? [], [scores.data]);

  /* Sıra numarası listenin kendisinden türetilir; `indexOf` her hücrede
     listeyi baştan tarardı (O(n²) — 300 satırda fark ediliyor). */
  const rankOf = useMemo(() => {
    const map = new Map<string, number>();
    rows.forEach((row, index) => map.set(row.symbol, index + 1));
    return map;
  }, [rows]);

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

  const columns = useMemo<GridColumn<Score>[]>(
    () => [
      {
        id: "rank",
        header: "#",
        width: 52,
        num: true,
        value: (row) => rankOf.get(row.symbol) ?? null,
        cell: (row) => (
          <NumText text={String(rankOf.get(row.symbol) ?? "")} size="sm" className="opacity-60" />
        ),
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
        hint: "0–100 arası kesitsel not. Coin kendi geçmişiyle değil, aynı andaki diğer havuz coinleriyle karşılaştırılır.",
        value: (row) => row.score,
        cell: (row) => (
          <span className="inline-flex items-center gap-2">
            <Bar value={row.score} color={scoreColor(row.score)} width={38} />
            <NumCell value={row.score} text={num(row.score, 1)} />
          </span>
        ),
        footer: (list) =>
          list.length ? (
            <NumText
              text={num(list.reduce((sum, row) => sum + row.score, 0) / list.length, 1)}
              size="sm"
            />
          ) : null,
      },
      ...FAMILIES.map<GridColumn<Score>>((family) => ({
        id: family.id,
        header: family.label,
        width: 116,
        num: true,
        hint: family.hint,
        value: (row) => row.families?.[family.id] ?? null,
        cell: (row) => (
          <span className="inline-flex items-center gap-2">
            <Bar value={row.families?.[family.id]} max={30} color={family.color} width={26} height={3} />
            <NumCell
              value={row.families?.[family.id]}
              text={num(row.families?.[family.id], 1)}
              size="sm"
            />
          </span>
        ),
      })),
      {
        id: "modifiers",
        header: "Düzeltme",
        width: 104,
        num: true,
        hint: "Formasyon ve mum sinyallerinin taban puana eklediği küçük düzeltme. Aile katkılarına karıştırılmaz.",
        value: (row) => sumModifiers(row.modifiers),
        cell: (row) => {
          const total = sumModifiers(row.modifiers);
          if (total === 0) return <NumText text="—" size="sm" />;
          return (
            <NumCell
              value={total}
              text={`${total > 0 ? "+" : ""}${num(total, 1)}`}
              size="sm"
              colorize
            />
          );
        },
      },
      {
        id: "bar_time",
        header: "Karar barı",
        width: 150,
        hidden: true,
        hint: "Bu puanın hesaplandığı mumun kapanış zamanı. Bar kapanmadan o barın verisi karara giremez.",
        value: (row) => new Date(row.bar_time).getTime(),
        cell: (row) => (
          <span style={{ fontSize: "var(--sn-t-caption)", color: "var(--sn-ink-3)" }}>
            {dateTime(row.bar_time)}
          </span>
        ),
      },
    ],
    [rankOf],
  );

  return (
    <Page
      title="Puanlar"
      summary="Havuzdaki coinlerin 0–100 arası notu. Bir tahmin değil, aynı andaki diğer coinlere göre sıralama."
      actions={
        <Link href="/kalibrasyon">
          <Button size="sm" variant="neutral">
            Bu puanlar işe yarıyor mu?
          </Button>
        </Link>
      }
      guide={
        <>
          <GuideSection title="Ne gösteriyor">
            <p>
              Her karar barı kapandığında havuzdaki tüm coinler aynı ölçütlerle puanlanır. Puan beş
              aileden gelen katkıların toplamıdır; üstüne formasyon ve mum sinyalleri küçük bir
              düzeltme ekler.
            </p>
          </GuideSection>
          <GuideSection title="Nasıl okunur">
            <p>
              <strong>80 puan “yükselecek” demek değildir.</strong> “Şu an havuzdaki çoğu coinden
              daha uygun görünüyor” demektir. Puan kesitseldir: coin kendi geçmişiyle değil, aynı
              andaki diğer coinlerle karşılaştırılır.
            </p>
            <p>
              Aile sütunları puanın nereden geldiğini gösterir. Bir satıra tıklayınca Puan Kartı
              açılır: yığılmış çubuk, ilk üç sebep ve destek/direnç geometrisi.
            </p>
            <p>
              Birden fazla bot farklı ağırlıklarla puanlıyorsa her biri ayrı bir liste üretir;
              üstteki seçici hangisine baktığınızı belirler ve listeler karıştırılmaz.
            </p>
          </GuideSection>
          <GuideSection title="Ne yapabilirim">
            <p>
              Puanlamanın gerçekten işe yarayıp yaramadığını görmek için Kalibrasyon sayfasına
              gidin. Orada puan dilimlerinin ileri getiriyle ilişkisi ölçülür ve cevap “hayır”
              olabilir.
            </p>
          </GuideSection>
        </>
      }
    >
      {(configs.data?.length ?? 0) > 1 && (
        <div className="flex flex-wrap items-center gap-2">
          <Picker
            label="Puanlama ayarı"
            value={configKey}
            onChange={setConfigKey}
            width={340}
            options={(configs.data ?? []).map((config) => ({
              value: keyOf(config),
              label: shorten(config.label),
              meta: `${config.timeframe} · ${config.symbols} coin`,
            }))}
          />
          <Tip content="Aynı anda birden çok bot farklı ağırlıklarla puanlıyor. Her ağırlık kümesi ayrı bir sıralama üretir; hepsini tek listede göstermek aynı sembolü iki farklı puanla iki kez gösterirdi.">
            <span
              className="underline decoration-dotted underline-offset-[3px]"
              style={{ fontSize: "var(--sn-t-caption)", color: "var(--sn-ink-3)" }}
            >
              neden birden çok liste var?
            </span>
          </Tip>
        </div>
      )}

      {stats && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Metric
            label="Puanlanan coin"
            value={stats.count}
            format={(value) => num(value, 0)}
            sub={active ? `son bar ${relative(active.bar_time)}` : undefined}
          />
          <Metric
            label="En yüksek puan"
            value={stats.top}
            format={(value) => num(value, 1)}
            accent="var(--sn-brand-solid)"
            sub="tek başına bir şey söylemez — kalibrasyona bakın"
          />
          <Metric
            label="Ortanca puan"
            value={stats.median}
            format={(value) => num(value, 1)}
            sub="50 civarıysa puanlama havuzu dengeli dağıtıyor"
          />
          <Metric
            label="70 ve üzeri"
            value={stats.above70}
            format={(value) => num(value, 0)}
            sub={`listenin %${num((stats.above70 / stats.count) * 100, 0)}'i · giriş eşiğine yakın aday`}
          />
        </div>
      )}

      <Panel
        title="Puan tablosu"
        description="En yüksekten en düşüğe. Aile sütunlarının toplamı taban puanı verir; düzeltme ayrı durur. Satıra tıklayın, Puan Kartı açılsın."
        padded={false}
      >
        <DataGrid
          rows={rows}
          columns={columns}
          rowKey={(row) => row.symbol}
          onRowClick={(row) => setSelected(row.symbol)}
          storageKey="puanlar"
          searchPlaceholder="Sembol ara…"
          defaultSort={[{ id: "score", desc: true }]}
          maxHeight={620}
          emptyTitle={scores.isLoading ? "Yükleniyor…" : "Henüz puan yok"}
          emptyHint={
            scores.isLoading
              ? undefined
              : "Puanlar karar barı kapandığında hesaplanır. Havuz kurulduysa bir sonraki bar kapanışında burası dolar."
          }
        />
      </Panel>

      <ScoreDrawer
        symbol={selected}
        config={active}
        onClose={() => setSelected(null)}
      />
    </Page>
  );
}

/* ------------------------------------------------------------------ */
/*  Puan Kartı                                                         */
/* ------------------------------------------------------------------ */

function ScoreDrawer({
  symbol,
  config,
  onClose,
}: {
  symbol: string | null;
  config: ScoreConfig | undefined;
  onClose: () => void;
}) {
  const detail = useQuery({
    queryKey: ["score-detail", symbol, config?.config_hash, config?.timeframe],
    queryFn: () =>
      api.get<ScoreDetail>(`/scores/${symbol}`, {
        config_hash: config!.config_hash,
        timeframe: config!.timeframe,
      }),
    enabled: Boolean(symbol && config),
  });

  const rationale = detail.data?.rationale;

  return (
    <Drawer
      open={Boolean(symbol)}
      onClose={onClose}
      title={symbol ?? ""}
      subtitle={config ? `${config.label} · ${config.timeframe}` : undefined}
    >
      {detail.isLoading && (
        <p style={{ fontSize: "var(--sn-t-body)", color: "var(--sn-ink-3)" }}>Yükleniyor…</p>
      )}

      {detail.isError && (
        <p style={{ fontSize: "var(--sn-t-body)", color: "var(--sn-down)" }}>
          Gerekçe getirilemedi. Puan hesaplanmış ama gerekçesi saklanmamış olabilir.
        </p>
      )}

      {detail.data && (
        <>
          <div className="flex items-baseline gap-3">
            <NumText text={num(detail.data.score, 1)} size="hero" />
            <span style={{ fontSize: "var(--sn-t-caption)", color: "var(--sn-ink-3)" }}>
              / 100 · {relative(detail.data.bar_time)}
            </span>
          </div>

          <DrawerSection
            title="Puan nereden geliyor"
            hint="Beş ailenin katkısı. Toplamları taban puanı verir; düzeltmeler bu yığına dahil değildir."
          >
            <FamilyStack families={detail.data.families} height={10} showLegend />
          </DrawerSection>

          {rationale?.top_drivers?.length ? (
            <DrawerSection
              title="İlk sebepler"
              hint="Bu puanı en çok yukarı taşıyan üç ölçüt."
            >
              <ul className="flex flex-col gap-1.5">
                {rationale.top_drivers.map((driver) => (
                  <li
                    key={driver}
                    className="flex items-start gap-2"
                    style={{ fontSize: "var(--sn-t-body)", color: "var(--sn-ink-2)" }}
                  >
                    <span style={{ color: "var(--sn-brand)" }}>·</span>
                    {driver}
                  </li>
                ))}
              </ul>
            </DrawerSection>
          ) : null}

          {sumModifiers(detail.data.modifiers) !== 0 && (
            <DrawerSection
              title="Düzeltmeler"
              hint="Formasyon ve mum sinyalleri. Taban puanı küçük miktarda yukarı ya da aşağı çeker."
            >
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(detail.data.modifiers)
                  .filter(([, value]) => value !== 0)
                  .map(([name, value]) => (
                    <Tag key={name} tone={value > 0 ? "up" : "down"} mono>
                      {name} {value > 0 ? "+" : ""}
                      {num(value, 1)}
                    </Tag>
                  ))}
              </div>
            </DrawerSection>
          )}

          {rationale?.sr && (
            <DrawerSection
              title="Destek / direnç geometrisi"
              hint="Fiyatın destekle direnç arasındaki yeri. Dirence yapışmış bir fiyatın yukarı alanı azdır."
            >
              <RangeDot
                value={rationale.sr.poc}
                low={rationale.sr.support}
                high={rationale.sr.resistance}
                lowLabel={`destek ${fmtOrDash(rationale.sr.support)}`}
                highLabel={`direnç ${fmtOrDash(rationale.sr.resistance)}`}
              />
              <div className="mt-3">
                <KeyValue
                  rows={[
                    {
                      label: "Risk/ödül geometrisi",
                      value: <NumText text={num(rationale.sr.rr_geometry, 2)} size="sm" />,
                    },
                    {
                      label: "Destek gücü",
                      value: <NumText text={num(rationale.sr.support_strength, 1)} size="sm" />,
                    },
                    {
                      label: "Direnç gücü",
                      value: <NumText text={num(rationale.sr.resistance_strength, 1)} size="sm" />,
                    },
                    {
                      label: "ATR",
                      value: <NumText text={num(rationale.sr.atr, 4)} size="sm" />,
                    },
                  ]}
                />
              </div>
            </DrawerSection>
          )}
        </>
      )}
    </Drawer>
  );
}

/* ------------------------------------------------------------------ */

function sumModifiers(modifiers: Record<string, number> | undefined): number {
  return Object.values(modifiers ?? {}).reduce((sum, value) => sum + value, 0);
}

function fmtOrDash(value: number | null): string {
  return value === null ? "—" : num(value, 4);
}

/**
 * Puanın rengi.
 *
 * Yeşil/kırmızı **kullanılmaz**: puan bir yön değil bir sıralamadır ve
 * yüksek puan "kazanç" anlamına gelmez. Yoğunluk amber ailesinde değişir.
 */
function scoreColor(score: number): string {
  if (score >= 70) return "var(--sn-brand-solid)";
  if (score >= 50) return "var(--sn-border-strong)";
  return "var(--sn-border)";
}
