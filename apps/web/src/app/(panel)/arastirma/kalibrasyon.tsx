"use client";

/**
 * Araştırma › Kalibrasyon — sistemin dürüstlük organı (DESIGN-V3 §4.6).
 *
 * Tek soru: **puanlama ileri getiriyi öngörüyor mu?** Cevap "hayır"
 * olabilir; hüküm en üstte, figürler tek blokta, grafikler ledger
 * bloklarında, desiller tablo.
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Reveal, SegmentedControl, StatusPill } from "uicean";
import { api, type Calibration, type CalibrationDecile } from "@/lib/api";
import { num, pct, pctSigned, signed } from "@/lib/format";
import { GuideSection } from "@/shell/page";
import { Async, InfoDot, Metric, NumText, Panel, RichText, Term, TextMetric } from "@/design";
import { ChartLegend, CurveChart, DecileChart } from "@/design/chart";
import { FAMILY_BY_ID } from "@/design/series";
import { cx } from "@/design/cx";
import { DataGrid } from "@/grid/data-grid";
import type { GridColumn } from "@/grid/types";

export const KALIBRASYON_SUMMARY = "Puanlama işe yarıyor mu? Cevap ölçülür ve olumsuz olabilir.";

export function KalibrasyonGuide() {
  return (
    <>
      <GuideSection title="Ne gösteriyor">
        <p>
          Her puan kaydedilir, sonra o coinin ileriki getirisiyle eşleştirilir. Soru tek: yüksek
          puan alanlar gerçekten daha iyi getiri sağladı mı?
        </p>
      </GuideSection>
      <GuideSection title="Nasıl okunur">
        <p>
          <strong>Desil grafiği</strong> ana görseldir: puanlar on dilime bölünür, dilim başına
          ortalama getiri çizilir. Puanlama çalışıyorsa çubuklar soldan sağa artmalıdır.
          İnce çizgiler güven aralığıdır; bolca kesişiyorsa fark gürültü olabilir.
        </p>
        <p>
          <strong>Sıra korelasyonu</strong> puan sırasıyla getiri sırasının uyumudur. Finansal
          veride 0,03–0,05 bile anlamlıdır; büyük değerler genellikle hata işaretidir.
        </p>
      </GuideSection>
      <GuideSection title="Ne yapabilirim">
        <p>
          İlişki düzse ağırlıkları değiştirip aynı veride yeniden denemeyin — bu keşif değil
          ezberdir. Hipotezi değiştirin, kilitli döneme dokunmayın.
        </p>
      </GuideSection>
    </>
  );
}

const HORIZONS = [
  { value: "4h", label: "4 sa" },
  { value: "24h", label: "24 sa" },
  { value: "72h", label: "72 sa" },
];

const WINDOWS = [
  { value: "90", label: "90 gün" },
  { value: "180", label: "180 gün" },
  { value: "365", label: "1 yıl" },
  { value: "730", label: "2 yıl" },
];

export default function KalibrasyonTab() {
  const [horizon, setHorizon] = useState("24h");
  const [days, setDays] = useState("180");

  const query = useQuery({
    queryKey: ["calibration", horizon, days],
    queryFn: () => api.get<Calibration>("/calibration", { horizon, days: Number(days) }),
    refetchInterval: 300_000,
  });

  return (
    <>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <span className="inline-flex items-center gap-2 text-[12.5px] text-ink-3">
          Ufuk <InfoDot text="Puan hesaplandıktan kaç saat sonraki getiriye bakılacağı." />
          <SegmentedControl size="sm" value={horizon} onChange={setHorizon} options={HORIZONS} />
        </span>
        <span className="inline-flex items-center gap-2 text-[12.5px] text-ink-3">
          Pencere <InfoDot text="Kaç günlük gözlem kullanılacağı. Kısa pencere güncel ama gürültülüdür." />
          <SegmentedControl size="sm" value={days} onChange={setDays} options={WINDOWS} />
        </span>
      </div>

      <Async query={query}>
        {(cal) => (
          <>
            <Reveal>
              <Verdict cal={cal} />
            </Reveal>
            <GateEdge cal={cal} />

            <Panel
              title={<span className="inline-flex items-center gap-1.5">Puan dilimi → ortalama getiri <InfoDot id="desil" /></span>}
              description="Ortalama ile medyan ayrışıyorsa dilimi birkaç aşırı getiri taşıyor demektir; karar verirken medyana bakın."
              padded={false}
            >
              <div className="p-5">
                <DecileChart data={cal.deciles} />
                <div className="mt-2">
                  <ChartLegend
                    items={[
                      { label: "Ortalama getiri (çubuk)", color: "var(--sn-ink-3)" },
                      { label: "Medyan getiri (kesik çizgi)", color: "var(--sn-ink-2)", dashed: true },
                    ]}
                  />
                </div>
              </div>
              <div className="border-t border-line">
                <DecileTable cal={cal} />
              </div>
            </Panel>

            <div className="grid gap-5 lg:grid-cols-2">
              <Panel
                title={<span className="inline-flex items-center gap-1.5">Aile bazında öngörü gücü <InfoDot id="ic" /></span>}
                description="Ölçek ±0,10. Uzun süre sıfır civarında gezen bir ailenin ağırlığı sorgulanmalıdır."
              >
                <FamilyIc familyIc={cal.family_ic} />
              </Panel>

              <Panel
                title="Sıra korelasyonunun seyri"
                description="30 günlük kayan pencere. Sıfırın üstünde geçen süre altında geçenden belirgin fazla olmalı."
              >
                <CurveChart
                  height={200}
                  series={[
                    {
                      label: "Sıra korelasyonu",
                      color: "var(--sn-series-1)",
                      points: (cal.rolling_spearman ?? [])
                        .filter((point) => point.value !== null)
                        .map((point) => ({ at: point.at, value: point.value as number })),
                    },
                  ]}
                  valueFormat={(value) => num(value, 3)}
                  emptyText="Kayan pencere için yeterli gözlem yok."
                />
              </Panel>
            </div>

            <IcSeries cal={cal} />
          </>
        )}
      </Async>
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Hüküm                                                              */
/* ------------------------------------------------------------------ */

function Verdict({ cal }: { cal: Calibration }) {
  const insufficient = !cal.sufficient;
  const positive = cal.monotonic && (cal.spearman ?? 0) > 0;

  /* Dağılım geneli düz olsa bile sistemin ALDIĞI bölge ayrışıyor olabilir. */
  const gateWorks =
    cal.gate_n >= 20 &&
    (cal.gate_edge ?? 0) > 0 &&
    Math.abs(cal.gate_edge_t_daily ?? cal.gate_edge_t ?? 0) >= 2;

  const tone = insufficient ? "amber" : positive || gateWorks ? "green" : "red";
  const title = insufficient
    ? "Karar vermek için henüz erken"
    : positive
      ? "Puanlama şu ana kadar öngörü gücü gösteriyor"
      : gateWorks
        ? "Dağılım geneli düz, ama sistemin aldığı bölge ayrışıyor"
        : "Puanlama öngörü gücü gösteremiyor";

  return (
    <Panel
      title="Hüküm"
      actions={<StatusPill tone={tone} dot>{insufficient ? "veri az" : positive || gateWorks ? "öngörüyor" : "öngörmüyor"}</StatusPill>}
    >
      <h3 className="text-[18px] font-semibold tracking-[-0.01em] text-ink">{title}</h3>
      <div className="mt-1.5 max-w-[78ch] text-[13.5px] leading-[1.55] text-ink-2">
        <RichText text={cal.verdict || fallbackVerdict(cal)} />
      </div>
      {!insufficient && !positive && !gateWorks && (
        <p className="mt-2.5 max-w-[78ch] text-[12.5px] leading-[1.55] text-ink-3">
          <strong className="font-medium text-ink-2">Ne yapmamalı: </strong>
          ağırlıkları değiştirip aynı veriyle yeniden denemek. Hipotezi değiştirin, kilitli
          döneme dokunmayın, kaç deneme yaptığınızı kaydedin.
        </p>
      )}

      <div className="mt-5 grid grid-cols-2 gap-x-6 gap-y-4 border-t border-line pt-4 lg:grid-cols-4">
        <Metric
          label="Gözlem"
          value={cal.n}
          format={(value) => num(value, 0)}
          accent={cal.sufficient ? undefined : "var(--sn-warn)"}
          sub={`${num(cal.span_days, 0)} gün · en az 500 gözlem ve 30 gün gerekir`}
        />
        <Metric
          label="Sıra korelasyonu"
          value={cal.spearman}
          format={(value) => num(value, 3)}
          accent={cal.spearman === null ? undefined : cal.spearman > 0 ? "var(--sn-up)" : "var(--sn-down)"}
          sub={cal.spearman_p !== null ? `şansa bağlı olma ihtimali ${num(cal.spearman_p, 3)}` : undefined}
        />
        <Metric
          label="Üst − alt dilim"
          value={cal.top_minus_bottom}
          format={(value) => pct(value, 2)}
          accent={cal.top_minus_bottom === null ? undefined : cal.top_minus_bottom > 0 ? "var(--sn-up)" : "var(--sn-down)"}
          sub={cal.top_minus_bottom_p !== null ? `şansa bağlı olma ihtimali ${num(cal.top_minus_bottom_p, 3)}` : undefined}
        />
        <TextMetric
          label="Monotonluk"
          info={<InfoDot id="monotonluk" />}
          value={cal.monotonic ? "Artıyor" : "Artmıyor"}
          tone={cal.monotonic ? "var(--sn-up)" : "var(--sn-down)"}
          sub={cal.monotonic ? "dilim ortalamaları sürekli yükseliyor" : "dilim ortalamaları düzensiz"}
        />
      </div>
    </Panel>
  );
}

function fallbackVerdict(cal: Calibration): string {
  if (!cal.sufficient) {
    return `Şu an ${cal.n} gözlem var ve bunlar ${num(cal.span_days, 0)} güne yayılıyor. Sistem en az 500 gözlem ve 30 gün olmadan bir sonucu anlamlı saymaz.`;
  }
  return cal.monotonic
    ? "Puan dilimleri yükseldikçe ortalama getiri de yükseliyor."
    : "Puan dilimleri ile getiri arasında tutarlı bir artış görünmüyor.";
}

/* ------------------------------------------------------------------ */
/*  Desil tablosu                                                      */
/* ------------------------------------------------------------------ */

const ayrismis = (row: CalibrationDecile) => row.ci_low > 0 || row.ci_high < 0;

const DESIL_COLUMNS: GridColumn<CalibrationDecile>[] = [
  { id: "decile", header: "Dilim", width: 70, num: true, pin: true, value: (r) => r.decile, cell: (r) => <NumText text={String(r.decile)} size="sm" /> },
  { id: "mean_score", header: "Ort. puan", width: 100, num: true, value: (r) => r.mean_score, cell: (r) => <NumText text={num(r.mean_score, 1)} size="sm" /> },
  { id: "count", header: "Gözlem", width: 90, num: true, value: (r) => r.count, cell: (r) => <NumText text={num(r.count, 0)} size="sm" /> },
  {
    id: "mean_return",
    header: "Ort. getiri",
    width: 110,
    num: true,
    value: (r) => r.mean_return,
    cell: (r) => <NumText text={pct(r.mean_return, 2)} size="sm" tone={r.mean_return >= 0 ? "var(--sn-up)" : "var(--sn-down)"} />,
  },
  {
    id: "median_return",
    header: "Medyan",
    width: 100,
    num: true,
    hint: "Ortalama birkaç aşırı getiriyle sürüklenir; medyan tipik gözlemi gösterir.",
    value: (r) => r.median_return,
    cell: (r) => <NumText text={pct(r.median_return, 2)} size="sm" tone={r.median_return >= 0 ? "var(--sn-up)" : "var(--sn-down)"} />,
  },
  {
    id: "ci",
    header: "Güven aralığı",
    width: 170,
    num: true,
    hint: "Ölçülen ortalamanın gerçekte hangi bandın içinde olabileceği. Bant sıfırı içeriyorsa fark belirsizdir.",
    value: (r) => r.ci_low,
    cell: (r) => <NumText text={`${pct(r.ci_low, 2)} … ${pct(r.ci_high, 2)}`} size="sm" />,
  },
  {
    id: "separated",
    header: "Gürültüden ayrı",
    width: 130,
    hint: "Güven aralığı sıfırı içermiyorsa fark gürültüden ayrışmış demektir.",
    value: (r) => (ayrismis(r) ? "evet" : "sıfırı içeriyor"),
    cell: (r) => (ayrismis(r) ? <StatusPill tone="gray" size="sm">evet</StatusPill> : <span className="text-[12px] text-ink-3">sıfırı içeriyor</span>),
  },
];

function DecileTable({ cal }: { cal: Calibration }) {
  return (
    <DataGrid
      rows={cal.deciles}
      columns={DESIL_COLUMNS}
      rowKey={(r) => String(r.decile)}
      storageKey="kalibrasyon-desil"
      searchable={false}
      density="compact"
      defaultSort={[{ id: "decile", desc: false }]}
      emptyTitle="Dilim yok"
    />
  );
}

/* ------------------------------------------------------------------ */
/*  Aile IC çubukları — sıfır ortada, ölçek ±0,10 sabit                */
/* ------------------------------------------------------------------ */

function FamilyIc({ familyIc }: { familyIc: Record<string, number | null> }) {
  const SCALE = 0.1;
  return (
    <div className="flex flex-col gap-2.5">
      {Object.entries(familyIc).map(([id, ic]) => {
        const family = FAMILY_BY_ID.get(id);
        const width = ic === null ? 0 : Math.min(100, (Math.abs(ic) / SCALE) * 100);
        return (
          <div key={id} className="flex items-center gap-2.5">
            <span className="w-28 shrink-0 text-[12.5px] text-ink-2">
              <Term id={`aile_${id}`}>{family?.label ?? id}</Term>
            </span>
            <div className="relative h-2 flex-1 rounded-full bg-inset">
              <span aria-hidden className="absolute top-0 bottom-0 left-1/2 w-px bg-line-strong" />
              {ic !== null && (
                <span
                  className={cx("absolute top-0 h-full rounded-full", ic >= 0 ? "left-1/2" : "right-1/2")}
                  style={{ width: `${width / 2}%`, background: ic >= 0 ? "var(--sn-up)" : "var(--sn-down)" }}
                />
              )}
            </div>
            <NumText text={num(ic, 3)} size="sm" className="w-14 text-right" />
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Kapının üstü — sistemin fiilen işlem yaptığı bölge                 */
/* ------------------------------------------------------------------ */

function GateEdge({ cal }: { cal: Calibration }) {
  if (cal.gate === null || cal.gate_n < 20 || cal.gate_edge === null) return null;

  const edge = cal.gate_edge;
  const t = cal.gate_edge_t;
  /* Karar KÜMELENMİŞ t'ye göre: aynı günün barları aynı dalgayı paylaşır. */
  const tDaily = cal.gate_edge_t_daily ?? null;
  const tKarar = tDaily ?? t;
  const strong = tKarar !== null && Math.abs(tKarar) >= 2;

  return (
    <Panel
      title="Kapının üstü"
      description={`Puanı ${num(cal.gate, 0)} ve üstünde olanların ileri getirisi, aynı barlardaki havuz ortalamasıyla bar bazında karşılaştırılır. Eşik bu veride seçildi: iyi görünmesi kenarın gerçek olduğunun değil, henüz çürütülmediğinin kanıtıdır.`}
    >
      <div className="grid grid-cols-2 gap-x-6 gap-y-4 lg:grid-cols-4">
        <Metric
          label="Kapının üstü"
          value={cal.gate_return}
          format={(value) => pct(value, 2)}
          accent={(cal.gate_return ?? 0) >= 0 ? "var(--sn-up)" : "var(--sn-down)"}
          sub={`${num(cal.gate_n, 0)} bar`}
        />
        <Metric
          label="Havuz"
          value={cal.pool_return}
          format={(value) => pct(value, 2)}
          accent={(cal.pool_return ?? 0) >= 0 ? "var(--sn-up)" : "var(--sn-down)"}
          sub="aynı barlar — karşılaştırma tabanı"
        />
        <Metric
          label="Fark"
          value={edge}
          format={(value) => pctSigned(value, 2)}
          accent={edge > 0 ? "var(--sn-up)" : "var(--sn-down)"}
          sub={
            tDaily !== null
              ? `t = ${signed(tDaily, 1)} (gün-kümeli, ${num(cal.gate_days, 0)} gün) · ham ${signed(t ?? 0, 1)}`
              : t !== null
                ? `t = ${signed(t, 1)} (ham — kümelenmiş henüz yok)`
                : "sistemin seçiciliğinin tek ölçüsü"
          }
        />
        <TextMetric
          label="Gürültüden ayrı"
          info={<InfoDot text="|t| ≥ 2 kabaca %95 güven demektir. Ölçü gün-kümelenmiş t'dir; ham t şişkin çıkar." />}
          value={strong ? "Evet" : "Hayır"}
          tone={strong ? "var(--sn-ink)" : "var(--sn-ink-3)"}
          sub={strong ? "|t| ≥ 2" : "|t| < 2 — tesadüf olabilir"}
        />
      </div>
    </Panel>
  );
}

/* ------------------------------------------------------------------ */

function IcSeries({ cal }: { cal: Calibration }) {
  const ids = Array.from(new Set((cal.ic_series ?? []).map((point) => point.family)));
  if (ids.length === 0) return null;

  const series = ids.map((id) => ({
    label: FAMILY_BY_ID.get(id)?.label ?? id,
    color: FAMILY_BY_ID.get(id)?.color ?? "var(--sn-ink-3)",
    points: (cal.ic_series ?? [])
      .filter((point) => point.family === id && point.ic !== null)
      .map((point) => ({ at: point.at, value: point.ic as number })),
  }));

  return (
    <Panel
      title={<span className="inline-flex items-center gap-1.5">Aile öngörü gücünün seyri <InfoDot id="ic" /></span>}
      description="Uzun süre sıfır civarında gezen aile puana katkı veriyor ama öngörü katmıyor demektir."
    >
      <CurveChart height={240} series={series} valueFormat={(value) => num(value, 3)} />
      <div className="mt-2">
        <ChartLegend items={series.map((one) => ({ label: one.label, color: one.color }))} />
      </div>
    </Panel>
  );
}
