"use client";

/**
 * Araştırma › Backtest — stratejiyi geçmiş veride sınama.
 *
 * Bu sekmenin en önemli işi sonucu **güzel göstermek değil, dürüst
 * göstermektir.** Her rapor üç kıyasla gelir, kırmızı bayraklar gizlenmez
 * ve havuz fotoğrafı olmayan dönemler damgalanır.
 *
 * Aynı puanlama ve boyutlandırma kodu çalışır; "backtest sürümü" diye ayrı
 * bir kod yoktur. Seçili koşu URL'de yaşar (`?run=<id>`).
 */

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  api,
  type Backtest,
  type BacktestDetail,
  type BacktestResult,
  type BacktestTrade,
  type Strategy,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { toast } from "@/lib/toast";
import { dateOnly, dateTime, money, num, pct, pctSigned, relative, rMultiple } from "@/lib/format";
import { Reveal } from "uicean";
import { GuideSection } from "@/shell/page";
import {
  Alert,
  Async,
  Button,
  Chip,
  Delta,
  Empty,
  ErrorBox,
  ExitReasonPill,
  Explain,
  FormField,
  InfoDot,
  Metric,
  NumText,
  Panel,
  Select,
  Tag,
  Term,
  TextInput,
  Toggle,
  type Tone,
} from "@/design";
import { CurveChart, type CurveSeries } from "@/design/chart";
import { DataGrid } from "@/grid/data-grid";
import { SimpleTable, type SimpleColumn } from "@/grid/simple-table";
import type { GridColumn } from "@/grid/types";

export const BACKTEST_SUMMARY =
  "Stratejiyi geçmiş veride çalıştır ve sonucu kıyaslarla karşılaştır.";

export function BacktestGuide() {
  return (
    <>
      <GuideSection title="Ne gösteriyor">
        <p>
          Seçtiğiniz strateji sürümü geçmiş barlar üzerinde bar bar yürütülür. Puanlama,
          boyutlandırma ve risk kodu canlıdakiyle <strong>aynıdır</strong> — değişen tek şey
          emirlerin gerçek borsa yerine simülasyona gitmesidir.
        </p>
      </GuideSection>
      <GuideSection title="Nasıl okunur">
        <p>
          <strong>Bir backtest sonucu bir vaat değildir.</strong> Geçmişte iyi çalışmış olmak
          gelecekte çalışacağını göstermez ve iyi görünen sonuçların çoğu, farkında olmadan yapılmış
          arama sonucudur.
        </p>
        <p>
          Bu yüzden her rapor <strong>üç kıyasla</strong> gelir. En önemlisi rastgele portföydür:
          aynı sıklıkta ama rastgele seçilen coinlerle kurulan portföy. Puanlama onu geçemiyorsa,
          kazancın kaynağı sıralama değil, sadece sık işlem yapmanın mekanik etkisidir.
        </p>
        <p>
          <strong>Kırmızı bayraklar</strong> sonuç fazla iyi göründüğünde basılır — çok yüksek
          Sharpe, çok az işlem, sıfıra yakın düşüş. Bunlar neredeyse her zaman hata işaretidir.
        </p>
      </GuideSection>
      <GuideSection title="Ne yapabilirim">
        <p>
          Kilitli dönemi ayar denemelerinde kullanmayın; yalnızca son doğrulama için açın. Kaç deneme
          yaptığınızı kaydedin — kaç kez denendiği bilinmeden sonucun anlamı ölçülemez.
        </p>
      </GuideSection>
    </>
  );
}

/** Ölçüt adlarının Türkçe karşılığı ve açıklaması. */
const SENARYO_ETIKET: Record<string, string> = {
  base: "Gerçek maliyet",
  "1.5x": "1,5 kat maliyet",
  "2x": "2 kat maliyet",
  stress_1_5x: "1,5 kat maliyet",
  stress_2x: "2 kat maliyet",
};

const METRIC_INFO: Record<string, { label: string; hint: string; format: "pct" | "num" | "money" }> = {
  total_return: {
    label: "Toplam getiri",
    hint: "Dönem sonundaki değerin başlangıca oranı.",
    format: "pct",
  },
  cagr: {
    label: "Yıllık bileşik getiri",
    hint: "Getirinin yıllığa çevrilmiş hâli. Farklı uzunluktaki dönemleri karşılaştırmak için.",
    format: "pct",
  },
  sharpe: {
    label: "Sharpe",
    hint: "Risk birimi başına getiri. 3'ün üstü neredeyse her zaman bir modelleme hatasını gösterir, başarıyı değil.",
    format: "num",
  },
  sortino: {
    label: "Sortino",
    hint: "Sharpe'ın yalnızca aşağı yönlü oynaklığa bakan hâli.",
    format: "num",
  },
  max_drawdown: {
    label: "Azami düşüş",
    hint: "Zirveden en dip noktaya kadarki kayıp. Sistemin en dürüst tek sayısıdır.",
    format: "pct",
  },
  win_rate: {
    label: "Kazanma oranı",
    hint: "Kârla kapanan işlemlerin oranı. Tek başına yanıltıcıdır.",
    format: "pct",
  },
  profit_factor: {
    label: "Kâr faktörü",
    hint: "Toplam kazancın toplam kayba oranı.",
    format: "num",
  },
  trades: { label: "İşlem sayısı", hint: "Dönem boyunca kapanan işlem sayısı.", format: "num" },
  expectancy_r: {
    label: "İşlem başına beklenti",
    hint: "Ortalama sonuç, risk birimi cinsinden.",
    format: "num",
  },
  total_fees: { label: "Toplam komisyon", hint: "Ödenen komisyonlar.", format: "money" },
};

export default function BacktestTab({
  run,
  onRun,
}: {
  run: number | null;
  /** Raporu açar (`id`) ya da kapatır (`null`). */
  onRun: (id: number | null) => void;
}) {
  const { can } = useAuth();

  const list = useQuery({
    queryKey: ["backtests"],
    queryFn: () => api.get<Backtest[]>("/backtests", { limit: 100 }),
    refetchInterval: 15_000,
  });

  return (
    <>
      {can("TRADER") && (
        <Reveal>
          <NewBacktest onCreated={onRun} />
        </Reveal>
      )}

      <Reveal delay={80}>
        <Panel
          title="Koşular"
          description="Geçmişteki backtest çalıştırmaları. Bir satıra tıklayınca raporu açılır."
          padded={false}
        >
          <Async
            query={list}
            empty={{
              title: "Henüz backtest yok",
              hint: "Yukarıdaki formdan bir koşu başlatın. Sonuçlar hazır olduğunda burada listelenir.",
            }}
          >
            {(rows) => <BacktestList rows={rows} onSelect={onRun} />}
          </Async>
        </Panel>
      </Reveal>

      {run !== null && <BacktestReport id={run} onClose={() => onRun(null)} />}

      <Panel title="Neden bu kadar çok uyarı var">
        <div className="grid gap-4 md:grid-cols-2">
          <Explain id="rastgele_portfoy" />
          <Explain id="kirmizi_bayrak" />
        </div>
      </Panel>
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Yeni koşu                                                          */
/* ------------------------------------------------------------------ */

function NewBacktest({ onCreated }: { onCreated: (id: number) => void }) {
  const qc = useQueryClient();
  const [versionId, setVersionId] = useState<number | null>(null);
  const [start, setStart] = useState(() => {
    const date = new Date();
    date.setFullYear(date.getFullYear() - 1);
    return date.toISOString().slice(0, 10);
  });
  const [end, setEnd] = useState(() => new Date().toISOString().slice(0, 10));
  const [equity, setEquity] = useState("5000");
  const [symbols, setSymbols] = useState("");
  const [useHoldout, setUseHoldout] = useState(false);
  const [withPatterns, setWithPatterns] = useState(true);

  const strategies = useQuery({
    queryKey: ["strategies"],
    queryFn: () => api.get<Strategy[]>("/strategies"),
  });

  const versions = (strategies.data ?? []).flatMap((strategy) =>
    strategy.versions.map((version) => ({
      id: version.id,
      label: `${strategy.name} · sürüm ${version.version}${version.frozen ? " (donuk)" : ""}`,
    })),
  );

  const run = useMutation({
    mutationFn: () =>
      api.post<Backtest>("/backtests", {
        strategy_version_id: versionId,
        /* Tarih kutusu saat dilimsiz bir damga verir; motor bunu UTC kabul eder. */
        start: `${start}T00:00:00`,
        end: `${end}T23:59:59`,
        initial_equity: Number(equity),
        symbols: symbols
          .split(/[\s,]+/)
          .map((entry) => entry.trim().toUpperCase())
          .filter(Boolean),
        use_holdout: useHoldout,
        with_patterns: withPatterns,
      }),
    onSuccess: (backtest) => {
      toast.success("Backtest başlatıldı", "Sonuç hazır olduğunda listede görünecek.");
      void qc.invalidateQueries({ queryKey: ["backtests"] });
      onCreated(backtest.id);
    },
    onError: (error: Error) => toast.error("Backtest başlatılamadı", error.message),
  });

  const valid = versionId !== null && start < end && Number(equity) > 0;

  return (
    <Panel
      title="Yeni koşu"
      description="Hangi strateji sürümü, hangi dönem, hangi sermaye. Coin listesi boş bırakılırsa o dönemin havuzu kullanılır."
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (valid) run.mutate();
        }}
        className="flex flex-col gap-4"
      >
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          <FormField label="Strateji sürümü" term="strateji_surum">
            <Select
              value={versionId ?? ""}
              onChange={(event) => setVersionId(Number(event.target.value) || null)}
            >
              <option value="">Seçin…</option>
              {versions.map((version) => (
                <option key={version.id} value={version.id}>
                  {version.label}
                </option>
              ))}
            </Select>
          </FormField>

          <FormField label="Başlangıç">
            <TextInput type="date" value={start} onChange={(event) => setStart(event.target.value)} />
          </FormField>

          <FormField label="Bitiş">
            <TextInput type="date" value={end} onChange={(event) => setEnd(event.target.value)} />
          </FormField>

          <FormField label="Başlangıç sermayesi (USD)">
            <TextInput
              value={equity}
              onChange={(event) => setEquity(event.target.value)}
              inputMode="decimal"
              numeric
            />
          </FormField>
        </div>

        <FormField
          label="Coin listesi (isteğe bağlı)"
          hint="Elle coin seçmek sonucu iyimser yapar: bugün bildiğiniz kazananları seçmek, cevabı bilerek sınava girmektir. Boş bırakmak daha dürüsttür."
        >
          <TextInput
            value={symbols}
            onChange={(event) => setSymbols(event.target.value)}
            placeholder="BTCUSDT, ETHUSDT — boş bırakılırsa o dönemin havuzu kullanılır"
            className="sn-num uppercase"
          />
        </FormField>

        <div className="grid gap-x-6 md:grid-cols-2">
          <Toggle
            checked={useHoldout}
            onChange={setUseHoldout}
            label={
              <span className="flex items-center gap-1.5">
                Kilitli dönemi kullan
                <InfoDot id="out_of_sample" />
              </span>
            }
            hint="Ayar denemelerine kapalı tutulan veri aralığını açar. Yalnızca son doğrulama için kullanın."
          />
          <Toggle
            checked={withPatterns}
            onChange={setWithPatterns}
            label={
              <span className="flex items-center gap-1.5">
                Formasyon motoru açık
                <InfoDot id="formasyon" />
              </span>
            }
            hint="Formasyon ve mum sinyallerinin puana katkısını dahil eder. Kapatınca puan yalnızca beş aileden oluşur."
          />
        </div>

        <div className="flex justify-end">
          <Button type="submit" size="sm" variant="primary" disabled={!valid || run.isPending}>
            {run.isPending ? "Başlatılıyor…" : "Backtest çalıştır"}
          </Button>
        </div>
      </form>
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/*  Koşu listesi                                                       */
/* ------------------------------------------------------------------ */

const STATUS_INFO: Record<string, { label: string; tone: Tone }> = {
  DONE: { label: "Tamamlandı", tone: "up" },
  FINISHED: { label: "Tamamlandı", tone: "up" },
  SUCCESS: { label: "Tamamlandı", tone: "up" },
  FAILED: { label: "Başarısız", tone: "down" },
  RUNNING: { label: "Çalışıyor", tone: "warn" },
  PENDING: { label: "Sırada", tone: "neutral" },
  QUEUED: { label: "Sırada", tone: "neutral" },
};

function BacktestList({ rows, onSelect }: { rows: Backtest[]; onSelect: (id: number) => void }) {
  const columns = useMemo<GridColumn<Backtest>[]>(
    () => [
      {
        id: "created_at",
        header: "Başlatıldı",
        width: 158,
        pin: true,
        value: (row) => new Date(row.created_at).getTime(),
        cell: (row) => <NumText text={dateTime(row.created_at)} size="sm" />,
      },
      {
        id: "status",
        header: "Durum",
        width: 142,
        value: (row) => row.status,
        cell: (row) => {
          const info = STATUS_INFO[row.status] ?? { label: row.status, tone: "neutral" as Tone };
          return <Tag tone={info.tone}>{info.label}</Tag>;
        },
      },
      {
        id: "period",
        header: "Dönem",
        width: 230,
        cell: (row) => {
          const params = row.params as { start?: string; end?: string };
          return (
            <span className="sn-num" style={{ fontSize: "var(--sn-t-caption)", color: "var(--sn-ink-2)" }}>
              {dateOnly(params.start)} — {dateOnly(params.end)}
            </span>
          );
        },
      },
      {
        id: "version",
        header: "Sürüm",
        width: 92,
        num: true,
        value: (row) => row.strategy_version_id,
        cell: (row) => <NumText text={`#${row.strategy_version_id}`} size="sm" />,
      },
      {
        id: "approximate",
        header: "Havuz",
        width: 176,
        hint: "Dönemin havuz fotoğrafı yoksa havuz yeniden kurulur; sonuç iyimser sapabilir.",
        value: (row) => (row.approximate_universe ? 1 : 0),
        cell: (row) =>
          row.approximate_universe ? (
            <Tag tone="warn">yaklaşık havuz</Tag>
          ) : (
            <span style={{ fontSize: "var(--sn-t-caption)", color: "var(--sn-ink-3)" }}>
              gerçek fotoğraf
            </span>
          ),
      },
      {
        id: "duration",
        header: "Süre",
        width: 118,
        num: true,
        cell: (row) =>
          row.finished_at && row.started_at ? (
            <NumText
              size="sm"
              text={`${num(
                (new Date(row.finished_at).getTime() - new Date(row.started_at).getTime()) / 1000,
                0,
              )} sn`}
            />
          ) : (
            <span style={{ fontSize: "var(--sn-t-caption)", color: "var(--sn-ink-3)" }}>
              {relative(row.started_at)}
            </span>
          ),
      },
    ],
    [],
  );

  return (
    <DataGrid
      rows={rows}
      columns={columns}
      rowKey={(row) => String(row.id)}
      onRowClick={(row) => onSelect(row.id)}
      storageKey="backtestler"
      defaultSort={[{ id: "created_at", desc: true }]}
      density="compact"
      searchable={false}
      maxHeight={420}
    />
  );
}

/* ------------------------------------------------------------------ */
/*  Rapor                                                              */
/* ------------------------------------------------------------------ */

function BacktestReport({ id, onClose }: { id: number; onClose: () => void }) {
  const query = useQuery({
    queryKey: ["backtest", id],
    queryFn: () => api.get<BacktestDetail>(`/backtests/${id}`),
    /* Koşu bitene kadar tazelenmeye devam eder. */
    refetchInterval: (result) =>
      ["RUNNING", "PENDING", "QUEUED"].includes(result.state.data?.status ?? "") ? 3_000 : false,
  });

  const backtest = query.data;
  const [scenario, setScenario] = useState(0);

  return (
    <Panel
      title={`Rapor · koşu #${id}`}
      description="Sonuç, kıyaslar ve uyarılar."
      actions={
        <Button size="sm" variant="quiet" onClick={onClose}>
          Kapat
        </Button>
      }
    >
      {query.isError ? (
        /* Uç 404 dönerse `data` hiç dolmaz; bekleme ile başarısızlık aynı
           görünmemeli. */
        <ErrorBox
          title="Rapor getirilemedi"
          hint="Koşu silinmiş olabilir ya da API'ye ulaşılamıyor."
          message={query.error instanceof Error ? query.error.message : "Bilinmeyen hata."}
        />
      ) : !backtest ? (
        <p style={{ fontSize: "var(--sn-t-body)", color: "var(--sn-ink-3)" }}>Yükleniyor…</p>
      ) : backtest.status === "FAILED" ? (
        <ErrorBox
          title="Backtest başarısız oldu"
          hint="Koşu tamamlanamadı. Aşağıdaki mesaj motordan geliyor."
          message={backtest.error ?? "Sebep bildirilmedi."}
        />
      ) : ["RUNNING", "PENDING", "QUEUED"].includes(backtest.status) ? (
        <p style={{ fontSize: "var(--sn-t-body)", color: "var(--sn-ink-2)" }}>
          Koşu sürüyor… Sonuç hazır olduğunda bu bölüm kendiliğinden dolacak.
        </p>
      ) : backtest.results.length === 0 ? (
        <Empty
          title="Sonuç üretilmedi"
          hint="Koşu tamamlandı ama rapor boş. Dönemde hiç işlem açılmamış olabilir."
        />
      ) : (
        <ReportBody backtest={backtest} scenario={scenario} onScenario={setScenario} />
      )}
    </Panel>
  );
}

function ReportBody({
  backtest,
  scenario,
  onScenario,
}: {
  backtest: BacktestDetail;
  scenario: number;
  onScenario: (index: number) => void;
}) {
  const result: BacktestResult = backtest.results[Math.min(scenario, backtest.results.length - 1)];

  const curves: CurveSeries[] = [
    {
      label: "Strateji",
      color: "var(--sn-series-1)",
      points: result.equity_curve.map(([at, value]) => ({ at, value })),
    },
    ...result.benchmarks.map((benchmark, index) => ({
      label: benchmark.name,
      color: `var(--sn-series-${((index + 1) % 5) + 1})`,
      dashed: true,
      points: benchmark.equity_curve.map(([at, value]) => ({ at, value })),
    })),
  ];

  return (
    <div className="flex flex-col gap-4">
      {backtest.approximate_universe && (
        <Alert tone="warn" title="Yaklaşık evren">
          Bu dönemin bir kısmı için havuz fotoğrafı yok, havuz yeniden kurulmak zorunda kaldı.
          Sonuç iyimser sapmış olabilir — <Term id="yaklasik_evren" />.
        </Alert>
      )}

      {result.flags.length > 0 && (
        <Alert
          tone="down"
          title={
            <span className="flex items-center gap-1.5">
              Kırmızı bayrak
              <InfoDot id="kirmizi_bayrak" />
            </span>
          }
        >
          <ul className="mt-1 flex flex-col gap-1">
            {result.flags.map((flag, index) => (
              <li key={index} style={{ lineHeight: 1.5 }}>
                · {flag.message} <span className="sn-num">({num(flag.value, 2)})</span>
              </li>
            ))}
          </ul>
        </Alert>
      )}

      {backtest.results.length > 1 && (
        <div className="flex flex-wrap items-center gap-2">
          <span
            className="flex items-center gap-1"
            style={{ fontSize: "var(--sn-t-caption)", color: "var(--sn-ink-2)" }}
          >
            Maliyet senaryosu
            <InfoDot text="Aynı koşu farklı komisyon ve kayma varsayımlarıyla değerlendirilir. İyimser senaryoda kârlı, kötümserde zararlı bir strateji kırılgandır." />
          </span>
          {backtest.results.map((entry, index) => (
            <Chip
              key={entry.cost_scenario}
              active={index === scenario}
              onClick={() => onScenario(index)}
            >
              {SENARYO_ETIKET[entry.cost_scenario] ?? entry.cost_scenario}
            </Chip>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Object.entries(METRIC_INFO)
          .filter(([key]) => typeof result.metrics[key] === "number")
          .map(([key, info]) => {
            const raw = result.metrics[key];
            const value = typeof raw === "number" ? raw : null;
            return (
              <Metric
                key={key}
                label={info.label}
                value={value}
                animateOnMount={false}
                format={(input) =>
                  input === null || input === undefined
                    ? "—"
                    : info.format === "pct"
                      ? pctSigned(input)
                      : info.format === "money"
                        ? money(input)
                        : num(input, 2)
                }
                accent={
                  info.format === "pct" && value !== null
                    ? value >= 0
                      ? "var(--sn-up)"
                      : "var(--sn-down)"
                    : undefined
                }
                sub={info.hint}
              />
            );
          })}
      </div>

      <div>
        <div
          className="mb-2 flex items-center gap-1 font-medium"
          style={{ fontSize: "var(--sn-t-body)", color: "var(--sn-ink)" }}
        >
          Strateji ve kıyaslar
          <InfoDot id="kiyas" />
        </div>
        <CurveChart series={curves} normalize height={280} valueFormat={(value) => num(value, 1)} />
        <p
          className="mt-2"
          style={{ fontSize: "var(--sn-t-caption)", color: "var(--sn-ink-3)", lineHeight: 1.55 }}
        >
          Hepsi 100 tabanına endekslendi. Strateji eğrisi kıyasların altında kalıyorsa, seçim
          yapmak değer katmamış demektir.
        </p>
      </div>

      {result.benchmarks.length > 0 && <BenchmarkTable result={result} />}

      {result.trades.length > 0 && <TradeLedger trades={result.trades} />}
    </div>
  );
}

/* ------------------------------------------------------------------ */

interface BenchmarkRow {
  name: string;
  strategy: boolean;
  total_return: number | null;
  max_drawdown: number | null;
  sharpe: number | null;
}

function BenchmarkTable({ result }: { result: BacktestResult }) {
  const rows: BenchmarkRow[] = [
    {
      name: "Strateji",
      strategy: true,
      total_return: asNumber(result.metrics.total_return),
      max_drawdown: asNumber(result.metrics.max_drawdown),
      sharpe: asNumber(result.metrics.sharpe),
    },
    ...result.benchmarks.map((benchmark) => ({
      name: benchmark.name,
      strategy: false,
      total_return: benchmark.metrics?.total_return ?? null,
      max_drawdown: benchmark.metrics?.max_drawdown ?? null,
      sharpe: benchmark.metrics?.sharpe ?? null,
    })),
  ];

  const columns: SimpleColumn<BenchmarkRow>[] = [
    {
      header: "Kıyas",
      cell: (row) => (
        <span
          style={{
            fontSize: "var(--sn-t-body)",
            color: row.strategy ? "var(--sn-ink)" : "var(--sn-ink-2)",
            fontWeight: row.strategy ? 550 : 400,
          }}
        >
          {row.name}
        </span>
      ),
    },
    {
      header: "Toplam getiri",
      num: true,
      cell: (row) => <Delta value={row.total_return} format={(value) => pctSigned(value)} size="sm" />,
    },
    {
      header: "Azami düşüş",
      num: true,
      cell: (row) => <NumText text={pct(row.max_drawdown)} size="sm" />,
    },
    { header: "Sharpe", num: true, cell: (row) => <NumText text={num(row.sharpe, 2)} size="sm" /> },
  ];

  return (
    <div>
      <div
        className="mb-2 font-medium"
        style={{ fontSize: "var(--sn-t-body)", color: "var(--sn-ink)" }}
      >
        Kıyas karşılaştırması
      </div>
      <div
        className="sn-scroll overflow-x-auto rounded-[var(--sn-r-sm)]"
        style={{ border: "1px solid var(--sn-hairline)" }}
      >
        <SimpleTable rows={rows} columns={columns} rowKey={(row) => row.name} dense />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  İşlem defteri                                                      */
/* ------------------------------------------------------------------ */

function TradeLedger({ trades }: { trades: BacktestTrade[] }) {
  /* Çıkış sebebi lejantı: defterde geçen her sebep ve kaç kez geçtiği.
     Yeni bir sebep (ör. LIQUIDATION) çıktığında burada kendiliğinden
     belirir; `ExitReasonPill` tanımadığı kodu ham basar, gizlemez. */
  const reasons = useMemo(() => {
    const tally = new Map<string, number>();
    trades.forEach((row) => {
      const reason = String(row.exit_reason ?? "");
      if (reason) tally.set(reason, (tally.get(reason) ?? 0) + 1);
    });
    return [...tally.entries()].sort((a, b) => b[1] - a[1]);
  }, [trades]);

  const columns = useMemo<GridColumn<BacktestTrade>[]>(
    () => [
      {
        id: "exit_time",
        header: "Kapanış",
        width: 158,
        pin: true,
        value: (row) => String(row.exit_time ?? ""),
        cell: (row) => <NumText text={dateTime(String(row.exit_time ?? ""))} size="sm" />,
      },
      {
        id: "symbol",
        header: "Sembol",
        width: 126,
        value: (row) => String(row.symbol ?? ""),
        search: (row) => `${row.symbol ?? ""} ${row.exit_reason ?? ""}`,
        cell: (row) => (
          <span className="sn-num" style={{ fontSize: "var(--sn-t-caption)" }}>
            {String(row.symbol ?? "—")}
          </span>
        ),
      },
      {
        id: "exit_reason",
        header: "Sebep",
        width: 190,
        hint: "Pozisyonu ne kapattı: stop, hedef, iz süren stop, puan düşüşü ya da likidasyon.",
        value: (row) => String(row.exit_reason ?? ""),
        cell: (row) => <ExitReasonPill reason={String(row.exit_reason ?? "")} />,
      },
      {
        id: "leverage",
        header: "Kaldıraç",
        width: 96,
        num: true,
        hint: "Pozisyonun açıldığı kaldıraç çarpanı. 1 = kaldıraçsız.",
        value: (row) => asNumber(row.leverage),
        cell: (row) => {
          const lev = asNumber(row.leverage);
          return <NumText text={lev === null ? "—" : `×${num(lev, lev === Math.round(lev) ? 0 : 2)}`} size="sm" />;
        },
      },
      {
        id: "pnl",
        header: "K/Z",
        width: 122,
        num: true,
        value: (row) => asNumber(row.pnl),
        cell: (row) => (
          <Delta value={asNumber(row.pnl)} format={(value) => money(value)} size="sm" />
        ),
      },
      {
        id: "pnl_r",
        header: "Sonuç",
        width: 116,
        num: true,
        hint: "İşlemin sonucu, o işlemde göze alınan riske bölünmüş hâli.",
        value: (row) => asNumber(row.pnl_r),
        cell: (row) => (
          <Delta value={asNumber(row.pnl_r)} format={(value) => rMultiple(value)} size="sm" />
        ),
      },
    ],
    [],
  );

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="font-medium" style={{ fontSize: "var(--sn-t-body)", color: "var(--sn-ink)" }}>
          İşlem defteri
        </span>
        <span className="flex flex-wrap items-center gap-2">
          {reasons.map(([reason, count]) => (
            <span key={reason} className="inline-flex items-center gap-1">
              <ExitReasonPill reason={reason} />
              <NumText text={num(count, 0)} size="xs" />
            </span>
          ))}
        </span>
      </div>
      <div
        className="overflow-hidden rounded-[var(--sn-r-sm)]"
        style={{ border: "1px solid var(--sn-hairline)" }}
      >
        <DataGrid
          rows={trades}
          columns={columns}
          rowKey={(row) => String(row.id ?? `${row.symbol}-${row.exit_time}`)}
          searchPlaceholder="Sembol ara…"
          defaultSort={[{ id: "exit_time", desc: true }]}
          density="compact"
          maxHeight={420}
        />
      </div>
    </div>
  );
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
