"use client";

/**
 * Araştırma › Backtest — rapor (DESIGN-V3 §4.6).
 *
 * Yeni koşu formu · koşu defteri · rapor: figürler, eğri, işlem defteri.
 * Sonuç güzel değil dürüst gösterilir: kıyaslar ve kırmızı bayraklar
 * gizlenmez. Aynı puanlama/boyutlandırma kodu; "backtest sürümü" yoktur.
 * Seçili koşu URL'de yaşar (`?run=<id>`).
 */

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Field as UiField,
  Reveal,
  SegmentedControl,
  StatusPill,
  Table,
  TBody,
  Td,
  Textarea,
  Th,
  THead,
  Toggle as PressToggle,
  Tr,
} from "uicean";
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
import { GuideSection } from "@/shell/page";
import {
  Alert,
  Async,
  Button,
  Delta,
  Empty,
  ErrorBox,
  ExitReasonPill,
  InfoDot,
  Metric,
  NumText,
  Panel,
  Select,
  Term,
  TextInput,
} from "@/design";
import { CurveChart, type CurveSeries } from "@/design/chart";

export const BACKTEST_SUMMARY = "Stratejiyi geçmiş veride çalıştır; sonucu kıyaslarla oku.";

export function BacktestGuide() {
  return (
    <>
      <GuideSection title="Ne gösteriyor">
        <p>
          Seçili strateji sürümü geçmiş barlarda bar bar yürütülür. Puanlama, boyutlandırma ve
          risk kodu canlıdakiyle <strong>aynıdır</strong>; yalnızca emirler simülasyona gider.
        </p>
      </GuideSection>
      <GuideSection title="Nasıl okunur">
        <p>
          <strong>Bir backtest sonucu bir vaat değildir.</strong> Her rapor üç kıyasla gelir; en
          önemlisi rastgele portföydür. Puanlama onu geçemiyorsa kazanç sıralamadan değil, sık
          işlem yapmanın mekanik etkisinden gelir.
        </p>
        <p>
          <strong>Kırmızı bayraklar</strong> sonuç fazla iyi göründüğünde basılır — çok yüksek
          Sharpe, çok az işlem, sıfıra yakın düşüş. Neredeyse her zaman hata işaretidir.
        </p>
      </GuideSection>
      <GuideSection title="Ne yapabilirim">
        <p>
          Kilitli dönemi ayar denemelerinde kullanmayın; yalnızca son doğrulama için açın. Kaç
          deneme yaptığınızı kaydedin.
        </p>
      </GuideSection>
    </>
  );
}

const SENARYO_ETIKET: Record<string, string> = {
  base: "Gerçek maliyet",
  "1.5x": "1,5 kat",
  "2x": "2 kat",
  stress_1_5x: "1,5 kat",
  stress_2x: "2 kat",
};

const METRIC_INFO: Record<string, { label: string; hint: string; format: "pct" | "num" | "money" }> = {
  total_return: { label: "Toplam getiri", hint: "Dönem sonundaki değerin başlangıca oranı.", format: "pct" },
  cagr: { label: "Yıllık bileşik", hint: "Getirinin yıllığa çevrilmiş hâli; farklı uzunluktaki dönemleri kıyaslamak için.", format: "pct" },
  sharpe: { label: "Sharpe", hint: "Risk birimi başına getiri. 3'ün üstü neredeyse her zaman modelleme hatasıdır.", format: "num" },
  sortino: { label: "Sortino", hint: "Sharpe'ın yalnızca aşağı yönlü oynaklığa bakan hâli.", format: "num" },
  max_drawdown: { label: "Azami düşüş", hint: "Zirveden dibe kayıp. Sistemin en dürüst tek sayısı.", format: "pct" },
  win_rate: { label: "Kazanma oranı", hint: "Kârla kapanan işlemlerin oranı. Tek başına yanıltıcıdır.", format: "pct" },
  profit_factor: { label: "Kâr faktörü", hint: "Toplam kazancın toplam kayba oranı.", format: "num" },
  trades: { label: "İşlem", hint: "Dönem boyunca kapanan işlem sayısı.", format: "num" },
  expectancy_r: { label: "Beklenti", hint: "İşlem başına ortalama sonuç, risk birimi (R) cinsinden.", format: "num" },
  total_fees: { label: "Komisyon", hint: "Ödenen toplam komisyon.", format: "money" },
};

const SURUYOR = ["RUNNING", "PENDING", "QUEUED"];

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
        <Panel title="Koşular" description="Satıra tıklayınca rapor açılır." padded={false}>
          <Async
            query={list}
            empty={{ title: "Henüz backtest yok", hint: "Yukarıdaki formdan bir koşu başlatın." }}
          >
            {(rows) => <BacktestList rows={rows} selected={run} onSelect={onRun} />}
          </Async>
        </Panel>
      </Reveal>

      {run !== null && <BacktestReport id={run} onClose={() => onRun(null)} />}
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
      description="Coin listesi boş bırakılırsa o dönemin havuz fotoğrafı kullanılır — daha dürüst olan budur."
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (valid) run.mutate();
        }}
        className="flex flex-col gap-5"
      >
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <UiField label={<span className="inline-flex items-center gap-1">Strateji sürümü <InfoDot id="strateji_surum" /></span>}>
            {(p) => (
              <Select {...p} value={versionId ?? ""} onChange={(event) => setVersionId(Number(event.target.value) || null)}>
                <option value="">Seçin…</option>
                {versions.map((version) => (
                  <option key={version.id} value={version.id}>{version.label}</option>
                ))}
              </Select>
            )}
          </UiField>
          <UiField label="Başlangıç">
            {(p) => <TextInput {...p} type="date" value={start} onChange={(event) => setStart(event.target.value)} className="sn-num" />}
          </UiField>
          <UiField label="Bitiş">
            {(p) => <TextInput {...p} type="date" value={end} onChange={(event) => setEnd(event.target.value)} className="sn-num" />}
          </UiField>
          <UiField label="Başlangıç sermayesi (USD)">
            {(p) => <TextInput {...p} value={equity} onChange={(event) => setEquity(event.target.value)} inputMode="decimal" numeric />}
          </UiField>
        </div>

        <UiField
          label="Coin listesi (isteğe bağlı)"
          hint="Elle coin seçmek sonucu iyimser yapar: bugün bildiğiniz kazananları seçmek, cevabı bilerek sınava girmektir."
        >
          {(p) => (
            <Textarea
              {...p}
              rows={2}
              autoGrow
              value={symbols}
              onChange={(event) => setSymbols(event.target.value)}
              placeholder="BTCUSDT, ETHUSDT"
              className="sn-num uppercase"
            />
          )}
        </UiField>

        <div className="grid gap-4 md:grid-cols-2">
          <UiField hint="Ayar denemelerine kapalı tutulan veri aralığını açar. Yalnızca son doğrulama için.">
            {() => (
              <span className="inline-flex items-center gap-2">
                <PressToggle size="sm" pressed={useHoldout} onChange={setUseHoldout}>Kilitli dönemi kullan</PressToggle>
                <InfoDot id="out_of_sample" />
              </span>
            )}
          </UiField>
          <UiField hint="Formasyon ve mum sinyallerinin puana katkısı. Kapalıyken puan yalnızca beş aileden oluşur.">
            {() => (
              <span className="inline-flex items-center gap-2">
                <PressToggle size="sm" pressed={withPatterns} onChange={setWithPatterns}>Formasyon motoru</PressToggle>
                <InfoDot id="formasyon" />
              </span>
            )}
          </UiField>
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
/*  Koşu defteri                                                       */
/* ------------------------------------------------------------------ */

const STATUS_INFO: Record<string, { label: string; tone: "green" | "red" | "amber" | "gray" }> = {
  DONE: { label: "Tamamlandı", tone: "green" },
  FINISHED: { label: "Tamamlandı", tone: "green" },
  SUCCESS: { label: "Tamamlandı", tone: "green" },
  FAILED: { label: "Başarısız", tone: "red" },
  RUNNING: { label: "Çalışıyor", tone: "amber" },
  PENDING: { label: "Sırada", tone: "gray" },
  QUEUED: { label: "Sırada", tone: "gray" },
};

function BacktestList({ rows, selected, onSelect }: { rows: Backtest[]; selected: number | null; onSelect: (id: number) => void }) {
  const sorted = useMemo(
    () => [...rows].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
    [rows],
  );

  return (
    <div className="max-h-[420px] overflow-y-auto">
      <Table minWidth={760}>
        <THead>
          <tr>
            <Th>Başlatıldı</Th>
            <Th>Durum</Th>
            <Th>Dönem</Th>
            <Th align="right">Sürüm</Th>
            <Th>Havuz</Th>
            <Th align="right">Süre</Th>
          </tr>
        </THead>
        <TBody>
          {sorted.map((row) => {
            const info = STATUS_INFO[row.status] ?? { label: row.status, tone: "gray" as const };
            const params = row.params as { start?: string; end?: string };
            const secs =
              row.finished_at && row.started_at
                ? (new Date(row.finished_at).getTime() - new Date(row.started_at).getTime()) / 1000
                : null;
            return (
              <Tr key={row.id} selected={row.id === selected} onClick={() => onSelect(row.id)}>
                <Td><NumText text={dateTime(row.created_at)} size="sm" /></Td>
                <Td><StatusPill tone={info.tone} size="sm" dot={info.tone === "amber"}>{info.label}</StatusPill></Td>
                <Td><NumText text={`${dateOnly(params.start)} — ${dateOnly(params.end)}`} size="sm" /></Td>
                <Td align="right"><NumText text={`#${row.strategy_version_id}`} size="sm" /></Td>
                <Td>
                  {row.approximate_universe
                    ? <StatusPill tone="amber" size="sm">yaklaşık havuz</StatusPill>
                    : <span className="text-[12px] text-ink-3">gerçek fotoğraf</span>}
                </Td>
                <Td align="right">
                  {secs !== null
                    ? <NumText text={`${num(secs, 0)} sn`} size="sm" />
                    : <span className="sn-num text-[12px] text-ink-3">{relative(row.started_at)}</span>}
                </Td>
              </Tr>
            );
          })}
        </TBody>
      </Table>
    </div>
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
    refetchInterval: (result) => (SURUYOR.includes(result.state.data?.status ?? "") ? 3_000 : false),
  });

  const backtest = query.data;
  const [scenario, setScenario] = useState(0);
  const kapat = <Button size="sm" variant="quiet" onClick={onClose}>Kapat</Button>;

  if (query.isError) {
    return (
      <Panel title="Rapor" actions={kapat}>
        <ErrorBox title="Rapor getirilemedi" hint="Koşu silinmiş olabilir ya da API'ye ulaşılamıyor." message={query.error instanceof Error ? query.error.message : "Bilinmeyen hata."} />
      </Panel>
    );
  }
  if (!backtest) {
    return <Panel title="Rapor" actions={kapat}><p className="text-[13px] text-ink-3">Yükleniyor…</p></Panel>;
  }
  if (backtest.status === "FAILED") {
    return (
      <Panel title="Rapor" description={`Koşu #${id}`} actions={kapat}>
        <ErrorBox title="Backtest başarısız oldu" hint="Aşağıdaki mesaj motordan geliyor." message={backtest.error ?? "Sebep bildirilmedi."} />
      </Panel>
    );
  }
  if (SURUYOR.includes(backtest.status)) {
    return (
      <Panel title="Rapor" description={`Koşu #${id}`} actions={kapat}>
        <p className="text-[13px] text-ink-2">Koşu sürüyor; sonuç hazır olduğunda bu bölüm kendiliğinden dolacak.</p>
      </Panel>
    );
  }
  if (backtest.results.length === 0) {
    return (
      <Panel title="Rapor" description={`Koşu #${id}`} actions={kapat}>
        <Empty title="Sonuç üretilmedi" hint="Koşu tamamlandı ama rapor boş. Dönemde hiç işlem açılmamış olabilir." />
      </Panel>
    );
  }
  return <ReportBody id={id} backtest={backtest} scenario={scenario} onScenario={setScenario} onClose={onClose} />;
}

function ReportBody({
  id,
  backtest,
  scenario,
  onScenario,
  onClose,
}: {
  id: number;
  backtest: BacktestDetail;
  scenario: number;
  onScenario: (index: number) => void;
  onClose: () => void;
}) {
  const result: BacktestResult = backtest.results[Math.min(scenario, backtest.results.length - 1)];

  const curves: CurveSeries[] = [
    { label: "Strateji", color: "var(--sn-series-1)", points: result.equity_curve.map(([at, value]) => ({ at, value })) },
    ...result.benchmarks.map((benchmark, index) => ({
      label: benchmark.name,
      color: `var(--sn-series-${((index + 1) % 5) + 1})`,
      dashed: true,
      points: benchmark.equity_curve.map(([at, value]) => ({ at, value })),
    })),
  ];

  const senaryolar = backtest.results.map((entry, index) => ({
    value: String(index),
    label: SENARYO_ETIKET[entry.cost_scenario] ?? entry.cost_scenario,
  }));

  return (
    <Reveal>
      <div className="flex flex-col gap-5">
        <Panel
          title="Rapor"
          description={`Koşu #${id} · sürüm #${backtest.strategy_version_id}`}
          actions={
            <>
              {senaryolar.length > 1 && (
                <SegmentedControl size="sm" options={senaryolar} value={String(Math.min(scenario, senaryolar.length - 1))} onChange={(v) => onScenario(Number(v))} />
              )}
              <Button size="sm" variant="quiet" onClick={onClose}>Kapat</Button>
            </>
          }
        >
          <div className="flex flex-col gap-4">
            {backtest.approximate_universe && (
              <Alert tone="warn" title="Yaklaşık evren">
                Dönemin bir kısmı için havuz fotoğrafı yok; havuz yeniden kuruldu. Sonuç iyimser sapmış olabilir — <Term id="yaklasik_evren" />.
              </Alert>
            )}
            {result.flags.length > 0 && (
              <Alert tone="down" title={<span className="flex items-center gap-1.5">Kırmızı bayrak <InfoDot id="kirmizi_bayrak" /></span>}>
                <ul className="mt-1 flex flex-col gap-1">
                  {result.flags.map((flag, index) => (
                    <li key={index}>{flag.message} <NumText text={`(${num(flag.value, 2)})`} size="sm" /></li>
                  ))}
                </ul>
              </Alert>
            )}

            <div className="grid grid-cols-2 gap-x-6 gap-y-4 md:grid-cols-3 lg:grid-cols-5">
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
                      info={<InfoDot text={info.hint} />}
                      format={(v) =>
                        v === null || v === undefined ? "—" : info.format === "pct" ? pctSigned(v) : info.format === "money" ? money(v) : num(v, key === "trades" ? 0 : 2)
                      }
                      accent={info.format === "pct" && value !== null ? (value >= 0 ? "var(--sn-up)" : "var(--sn-down)") : undefined}
                    />
                  );
                })}
            </div>
          </div>
        </Panel>

        <Panel
          title={<span className="inline-flex items-center gap-1.5">Strateji ve kıyaslar <InfoDot id="kiyas" /></span>}
          description="Hepsi 100 tabanına endekslendi. Strateji kıyasların altındaysa seçim yapmak değer katmamıştır."
          padded={false}
        >
          <div className="p-5">
            <CurveChart series={curves} normalize height={280} valueFormat={(value) => num(value, 1)} />
          </div>
          {result.benchmarks.length > 0 && <BenchmarkTable result={result} />}
        </Panel>

        {result.trades.length > 0 && <TradeLedger trades={result.trades} />}
      </div>
    </Reveal>
  );
}

/* ------------------------------------------------------------------ */

function BenchmarkTable({ result }: { result: BacktestResult }) {
  const rows = [
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

  return (
    <div className="border-t border-line">
      <Table minWidth={520}>
        <THead>
          <tr>
            <Th>Kıyas</Th>
            <Th align="right">Toplam getiri</Th>
            <Th align="right">Azami düşüş</Th>
            <Th align="right">Sharpe</Th>
          </tr>
        </THead>
        <TBody>
          {rows.map((row) => (
            <Tr key={row.name}>
              <Td className={row.strategy ? "font-medium text-ink" : undefined}>{row.name}</Td>
              <Td align="right"><Delta value={row.total_return} format={(v) => pctSigned(v)} size="sm" /></Td>
              <Td align="right"><NumText text={pct(row.max_drawdown)} size="sm" /></Td>
              <Td align="right"><NumText text={num(row.sharpe, 2)} size="sm" /></Td>
            </Tr>
          ))}
        </TBody>
      </Table>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  İşlem defteri                                                      */
/* ------------------------------------------------------------------ */

function TradeLedger({ trades }: { trades: BacktestTrade[] }) {
  /* Çıkış sebebi lejantı: defterde geçen her sebep ve kaç kez geçtiği.
     Yeni bir sebep (ör. LIQUIDATION) burada kendiliğinden belirir. */
  const reasons = useMemo(() => {
    const tally = new Map<string, number>();
    trades.forEach((row) => {
      const reason = String(row.exit_reason ?? "");
      if (reason) tally.set(reason, (tally.get(reason) ?? 0) + 1);
    });
    return [...tally.entries()].sort((a, b) => b[1] - a[1]);
  }, [trades]);

  const sorted = useMemo(
    () => [...trades].sort((a, b) => String(b.exit_time ?? "").localeCompare(String(a.exit_time ?? ""))),
    [trades],
  );

  return (
    <Panel
      title="İşlem defteri"
      description={<><NumText text={num(trades.length, 0)} size="sm" /> işlem, en yenisi üstte.</>}
      padded={false}
      actions={
        <span className="flex flex-wrap items-center gap-2">
          {reasons.map(([reason, count]) => (
            <span key={reason} className="inline-flex items-center gap-1">
              <ExitReasonPill reason={reason} />
              <NumText text={num(count, 0)} size="xs" />
            </span>
          ))}
        </span>
      }
    >
      <div className="max-h-[480px] overflow-y-auto">
        <Table minWidth={760}>
          <THead>
            <tr>
              <Th>Kapanış</Th>
              <Th>Sembol</Th>
              <Th>Sebep</Th>
              <Th align="right"><span className="inline-flex items-center gap-1">Kaldıraç <InfoDot text="Pozisyonun açıldığı kaldıraç çarpanı. 1 = kaldıraçsız." /></span></Th>
              <Th align="right">K/Z</Th>
              <Th align="right"><span className="inline-flex items-center gap-1">Sonuç <InfoDot text="İşlemin sonucu, o işlemde göze alınan riske bölünmüş hâli." /></span></Th>
            </tr>
          </THead>
          <TBody>
            {sorted.map((row, index) => {
              const lev = asNumber(row.leverage);
              return (
                <Tr key={String(row.id ?? `${row.symbol}-${row.exit_time}-${index}`)}>
                  <Td><NumText text={dateTime(String(row.exit_time ?? ""))} size="sm" /></Td>
                  <Td><NumText text={String(row.symbol ?? "—")} size="sm" /></Td>
                  <Td><ExitReasonPill reason={String(row.exit_reason ?? "")} /></Td>
                  <Td align="right"><NumText text={lev === null ? "—" : `×${num(lev, lev === Math.round(lev) ? 0 : 2)}`} size="sm" /></Td>
                  <Td align="right"><Delta value={asNumber(row.pnl)} format={(v) => money(v)} size="sm" /></Td>
                  <Td align="right"><Delta value={asNumber(row.pnl_r)} format={(v) => rMultiple(v)} size="sm" /></Td>
                </Tr>
              );
            })}
          </TBody>
        </Table>
      </div>
    </Panel>
  );
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
