"use client";

/**
 * Backtest — stratejiyi geçmiş veride sınama.
 *
 * Bu sayfanın en önemli işi sonucu **güzel göstermek değil, dürüst
 * göstermektir.** Bu yüzden her rapor üç kıyasla birlikte gelir, kırmızı
 * bayraklar gizlenmez ve havuz fotoğrafı olmayan dönemler damgalanır.
 *
 * Aynı puanlama ve boyutlandırma kodu çalışır; "backtest sürümü" diye ayrı
 * bir kod yoktur. Değişen tek şey emirlerin nereye gittiğidir.
 */

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, StatusPill, cx } from "@/ui";
import {
  api,
  type Backtest,
  type BacktestDetail,
  type BacktestResult,
  type Strategy,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { toast } from "@/lib/toast";
import { Page, Section, StatGrid, Async, Empty, ErrorBox } from "@/components/common/page";
import { Stat, AmountText, Signed } from "@/components/common/amount";
import { Explain, InfoDot, Term } from "@/components/common/explain";
import { DataTable, SimpleTable, type Column } from "@/components/data/data-table";
import { CurveChart, type CurveSeries } from "@/components/viz/charts";
import { ExitReasonPill } from "@/components/common/pills";
import { dateOnly, dateTime, money, num, pct, pctSigned, relative, rMultiple } from "@/lib/format";

/** Ölçüt adlarının Türkçe karşılığı ve açıklaması. */
const METRIC_INFO: Record<string, { label: string; hint: string; format: "pct" | "num" | "money" }> =
  {
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

export default function BacktestPage() {
  const { can } = useAuth();
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const list = useQuery({
    queryKey: ["backtests"],
    queryFn: () => api.get<Backtest[]>("/backtests", { limit: 100 }),
    refetchInterval: 15_000,
  });

  return (
    <Page
      title="Backtest"
      description="Stratejiyi geçmiş veride çalıştır ve sonucu kıyaslarla karşılaştır."
      intro={{
        storageKey: "backtest",
        what: "Seçtiğiniz strateji sürümü geçmiş barlar üzerinde bar bar yürütülür. Puanlama, boyutlandırma ve risk kodu canlıdakiyle **aynıdır** — değişen tek şey emirlerin gerçek borsa yerine simülasyona gitmesidir.",
        how: "**Bir backtest sonucu bir vaat değildir.** Geçmişte iyi çalışmış olmak gelecekte çalışacağını göstermez ve iyi görünen sonuçların çoğu, farkında olmadan yapılmış arama sonucudur.\n\nBu yüzden her rapor **üç kıyasla** gelir. En önemlisi rastgele portföydür: aynı sıklıkta ama rastgele seçilen coinlerle kurulan portföy. Puanlama onu geçemiyorsa, kazancın kaynağı sıralama değil, sadece sık işlem yapmanın mekanik etkisidir.\n\n**Kırmızı bayraklar** sonuç fazla iyi göründüğünde basılır — çok yüksek Sharpe, çok az işlem, sıfıra yakın düşüş. Bunlar neredeyse her zaman hata işaretidir.",
        action: "Kilitli dönemi ayar denemelerinde kullanmayın; yalnızca son doğrulama için açın. Kaç deneme yaptığınızı kaydedin — kaç kez denendiği bilinmeden sonucun anlamı ölçülemez.",
        terms: ["backtest", "kiyas", "rastgele_portfoy", "out_of_sample", "yaklasik_evren", "kirmizi_bayrak", "drawdown"],
      }}
    >
      {can("TRADER") && <NewBacktest onCreated={setSelectedId} />}

      <Section
        title="Koşular"
        description="Geçmişteki backtest çalıştırmaları. Bir satıra tıklayınca raporu açılır."
        padded={false}
      >
        <Async
          query={list}
          empty={{
            title: "Henüz backtest yok",
            description:
              "Yukarıdaki formdan bir koşu başlatın. Sonuçlar hazır olduğunda burada listelenir.",
          }}
        >
          {(rows) => <BacktestList rows={rows} onSelect={setSelectedId} />}
        </Async>
      </Section>

      {selectedId !== null && (
        <BacktestReport id={selectedId} onClose={() => setSelectedId(null)} />
      )}

      <Section title="Neden bu kadar çok uyarı var">
        <div className="grid gap-5 md:grid-cols-2">
          <Explain id="rastgele_portfoy" showTitle />
          <Explain id="kirmizi_bayrak" showTitle />
        </div>
      </Section>
    </Page>
  );
}

/* ------------------------------------------------------------------ */
/*  Yeni koşu                                                          */
/* ------------------------------------------------------------------ */

function NewBacktest({ onCreated }: { onCreated: (id: number) => void }) {
  const qc = useQueryClient();
  const [versionId, setVersionId] = useState<number | null>(null);
  const [start, setStart] = useState(() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 1);
    return d.toISOString().slice(0, 10);
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

  const versions = (strategies.data ?? []).flatMap((s) =>
    s.versions.map((v) => ({
      id: v.id,
      label: `${s.name} · sürüm ${v.version}${v.frozen ? " (donuk)" : ""}`,
    })),
  );

  const run = useMutation({
    mutationFn: () =>
      api.post<Backtest>("/backtests", {
        strategy_version_id: versionId,
        // Tarih kutusu saat dilimsiz bir damga verir; motor bunu UTC kabul eder.
        start: `${start}T00:00:00`,
        end: `${end}T23:59:59`,
        initial_equity: Number(equity),
        symbols: symbols
          .split(/[\s,]+/)
          .map((s) => s.trim().toUpperCase())
          .filter(Boolean),
        use_holdout: useHoldout,
        with_patterns: withPatterns,
      }),
    onSuccess: (bt) => {
      toast.success("Backtest başlatıldı", "Sonuç hazır olduğunda listede görünecek.");
      void qc.invalidateQueries({ queryKey: ["backtests"] });
      onCreated(bt.id);
    },
    onError: (e: Error) => toast.error("Backtest başlatılamadı", e.message),
  });

  const valid = versionId !== null && start < end && Number(equity) > 0;

  return (
    <Section
      title="Yeni koşu"
      description="Hangi strateji sürümü, hangi dönem, hangi sermaye. Coin listesi boş bırakılırsa o dönemin havuzu kullanılır."
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) run.mutate();
        }}
        className="space-y-4"
      >
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          <label className="block">
            <span className="flex items-center gap-1 text-[12px] font-medium text-ink-2">
              Strateji sürümü
              <InfoDot id="strateji_surum" align="start" />
            </span>
            <select
              value={versionId ?? ""}
              onChange={(e) => setVersionId(Number(e.target.value) || null)}
              className="mt-1 h-9 w-full rounded-lg border border-line bg-inset px-2.5 text-[13px] text-ink focus:border-brand focus:outline-none"
            >
              <option value="">Seçin…</option>
              {versions.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-[12px] font-medium text-ink-2">Başlangıç</span>
            <input
              type="date"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              className="mt-1 h-9 w-full rounded-lg border border-line bg-inset px-2.5 text-[13px] text-ink focus:border-brand focus:outline-none"
            />
          </label>

          <label className="block">
            <span className="text-[12px] font-medium text-ink-2">Bitiş</span>
            <input
              type="date"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              className="mt-1 h-9 w-full rounded-lg border border-line bg-inset px-2.5 text-[13px] text-ink focus:border-brand focus:outline-none"
            />
          </label>

          <label className="block">
            <span className="text-[12px] font-medium text-ink-2">Başlangıç sermayesi (USD)</span>
            <input
              value={equity}
              onChange={(e) => setEquity(e.target.value)}
              inputMode="decimal"
              className="num mt-1 h-9 w-full rounded-lg border border-line bg-inset px-2.5 text-[13px] text-ink focus:border-brand focus:outline-none"
            />
          </label>
        </div>

        <label className="block">
          <span className="text-[12px] font-medium text-ink-2">
            Coin listesi (isteğe bağlı)
          </span>
          <input
            value={symbols}
            onChange={(e) => setSymbols(e.target.value)}
            placeholder="BTCUSDT, ETHUSDT — boş bırakılırsa o dönemin havuzu kullanılır"
            className="mt-1 h-9 w-full rounded-lg border border-line bg-inset px-2.5 font-mono text-[12.5px] text-ink uppercase placeholder:font-sans placeholder:text-ink-3 focus:border-brand focus:outline-none"
          />
          <span className="mt-1 block text-[11.5px] text-ink-3">
            Elle coin seçmek sonucu iyimser yapar: bugün bildiğiniz kazananları seçmek, cevabı
            bilerek sınava girmektir. Boş bırakmak daha dürüsttür.
          </span>
        </label>

        <div className="flex flex-wrap gap-4">
          <Toggle
            checked={useHoldout}
            onChange={setUseHoldout}
            label="Kilitli dönemi kullan"
            term="out_of_sample"
            hint="Ayar denemelerine kapalı tutulan veri aralığını açar. Yalnızca son doğrulama için kullanın."
          />
          <Toggle
            checked={withPatterns}
            onChange={setWithPatterns}
            label="Formasyon motoru açık"
            term="formasyon"
            hint="Formasyon ve mum sinyallerinin puana katkısını dahil eder. Kapatınca puan yalnızca beş aileden oluşur."
          />
        </div>

        <div className="flex justify-end">
          <Button
            type="submit"
            size="sm"
            variant="amber"
            shape="rect"
            disabled={!valid || run.isPending}
          >
            {run.isPending ? "Başlatılıyor…" : "Backtest çalıştır"}
          </Button>
        </div>
      </form>
    </Section>
  );
}

function Toggle({
  checked,
  onChange,
  label,
  term,
  hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  term?: string;
  hint?: string;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-[12.5px] text-ink">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="accent-[var(--brand)]"
      />
      {label}
      {(term || hint) && <InfoDot id={term} text={hint} align="start" />}
    </label>
  );
}

/* ------------------------------------------------------------------ */
/*  Koşu listesi                                                       */
/* ------------------------------------------------------------------ */

function BacktestList({
  rows,
  onSelect,
}: {
  rows: Backtest[];
  onSelect: (id: number) => void;
}) {
  const columns: Column<Backtest>[] = [
    {
      key: "created_at",
      header: "Başlatıldı",
      width: "150px",
      sort: (r) => new Date(r.created_at).getTime(),
      cell: (r) => <span className="num text-[12px]">{dateTime(r.created_at)}</span>,
    },
    {
      key: "status",
      header: "Durum",
      width: "140px",
      sort: (r) => r.status,
      cell: (r) => <BacktestStatus status={r.status} />,
    },
    {
      key: "period",
      header: "Dönem",
      cell: (r) => {
        const p = r.params as { start?: string; end?: string };
        return (
          <span className="text-[12.5px] text-ink-2">
            {dateOnly(p.start)} — {dateOnly(p.end)}
          </span>
        );
      },
    },
    {
      key: "version",
      header: "Sürüm",
      num: true,
      sort: (r) => r.strategy_version_id,
      cell: (r) => `#${r.strategy_version_id}`,
    },
    {
      key: "approximate",
      header: "Evren",
      width: "170px",
      term: "yaklasik_evren",
      cell: (r) =>
        r.approximate_universe ? (
          <StatusPill size="sm" tone="orange">
            yaklaşık evren
          </StatusPill>
        ) : (
          <span className="text-[12px] text-ink-3">gerçek fotoğraf</span>
        ),
    },
    {
      key: "duration",
      header: "Süre",
      width: "110px",
      cell: (r) =>
        r.finished_at && r.started_at ? (
          <span className="text-[12px] text-ink-2">
            {num(
              (new Date(r.finished_at).getTime() - new Date(r.started_at).getTime()) / 1000,
              0,
            )}{" "}
            sn
          </span>
        ) : (
          <span className="text-[12px] text-ink-3">{relative(r.started_at)}</span>
        ),
    },
  ];

  return (
    <DataTable
      rows={rows}
      columns={columns}
      rowKey={(r) => r.id}
      onRowClick={(r) => onSelect(r.id)}
      storageKey="backtestler"
      defaultSort={{ key: "created_at", dir: "desc" }}
      dense
    />
  );
}

function BacktestStatus({ status }: { status: string }) {
  const map: Record<string, { label: string; tone: "green" | "red" | "amber" | "gray" }> = {
    DONE: { label: "Tamamlandı", tone: "green" },
    FINISHED: { label: "Tamamlandı", tone: "green" },
    SUCCESS: { label: "Tamamlandı", tone: "green" },
    FAILED: { label: "Başarısız", tone: "red" },
    RUNNING: { label: "Çalışıyor", tone: "amber" },
    PENDING: { label: "Sırada", tone: "gray" },
    QUEUED: { label: "Sırada", tone: "gray" },
  };
  const info = map[status] ?? { label: status, tone: "gray" as const };
  return (
    <StatusPill size="sm" tone={info.tone}>
      {info.label}
    </StatusPill>
  );
}

/* ------------------------------------------------------------------ */
/*  Rapor                                                              */
/* ------------------------------------------------------------------ */

function BacktestReport({ id, onClose }: { id: number; onClose: () => void }) {
  const query = useQuery({
    queryKey: ["backtest", id],
    queryFn: () => api.get<BacktestDetail>(`/backtests/${id}`),
    // Koşu bitene kadar tazelenmeye devam eder.
    refetchInterval: (q) =>
      ["RUNNING", "PENDING", "QUEUED"].includes(q.state.data?.status ?? "") ? 3_000 : false,
  });

  const bt = query.data;
  const [scenario, setScenario] = useState(0);

  return (
    <Section
      title={`Rapor · koşu #${id}`}
      description="Sonuç, kıyaslar ve uyarılar."
      actions={
        <Button size="sm" variant="ghost" shape="rect" onClick={onClose}>
          Kapat
        </Button>
      }
    >
      {!bt ? (
        <p className="text-[13px] text-ink-3">Yükleniyor…</p>
      ) : bt.status === "FAILED" ? (
        <ErrorBox
          title="Backtest başarısız oldu"
          hint="Koşu tamamlanamadı. Aşağıdaki mesaj motordan geliyor."
          message={bt.error ?? "Sebep bildirilmedi."}
        />
      ) : ["RUNNING", "PENDING", "QUEUED"].includes(bt.status) ? (
        <p className="text-[13px] text-ink-2">
          Koşu sürüyor… Sonuç hazır olduğunda bu bölüm kendiliğinden dolacak.
        </p>
      ) : bt.results.length === 0 ? (
        <Empty
          title="Sonuç üretilmedi"
          description="Koşu tamamlandı ama rapor boş. Dönemde hiç işlem açılmamış olabilir."
        />
      ) : (
        <ReportBody bt={bt} scenario={scenario} onScenario={setScenario} />
      )}
    </Section>
  );
}

function ReportBody({
  bt,
  scenario,
  onScenario,
}: {
  bt: BacktestDetail;
  scenario: number;
  onScenario: (i: number) => void;
}) {
  const result: BacktestResult = bt.results[Math.min(scenario, bt.results.length - 1)];

  const curves: CurveSeries[] = [
    {
      label: "Strateji",
      color: "var(--series-1)",
      points: result.equity_curve.map(([at, v]) => ({ at, value: v })),
    },
    ...result.benchmarks.map((b, i) => ({
      label: b.name,
      color: `var(--series-${((i + 1) % 5) + 1})`,
      dashed: true,
      points: b.equity_curve.map(([at, v]) => ({ at, value: v })),
    })),
  ];

  return (
    <div className="space-y-4">
      {/* Evren damgası */}
      {bt.approximate_universe && (
        <div className="flex items-start gap-2.5 rounded-lg border border-warn/30 bg-warn-soft px-4 py-3 text-[13px]">
          <span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full bg-warn" />
          <span className="text-ink">
            <strong className="font-medium">Yaklaşık evren.</strong>{" "}
            <span className="text-ink-2">
              Bu dönemin bir kısmı için havuz fotoğrafı yok, havuz yeniden kurulmak zorunda
              kaldı. Sonuç iyimser sapmış olabilir — <Term id="yaklasik_evren" />.
            </span>
          </span>
        </div>
      )}

      {/* Kırmızı bayraklar */}
      {result.flags.length > 0 && (
        <div className="rounded-lg border border-down/30 bg-down-soft px-4 py-3">
          <div className="flex items-center gap-1.5 text-[13px] font-medium text-ink">
            Kırmızı bayrak
            <InfoDot id="kirmizi_bayrak" align="start" />
          </div>
          <ul className="mt-1.5 space-y-1">
            {result.flags.map((f, i) => (
              <li key={i} className="text-[12.5px] leading-relaxed text-ink-2">
                · {f.message}{" "}
                <span className="num text-ink-3">({num(f.value, 2)})</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Maliyet senaryosu */}
      {bt.results.length > 1 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-1 text-[12px] text-ink-2">
            Maliyet senaryosu
            <InfoDot
              text="Aynı koşu farklı komisyon ve kayma varsayımlarıyla değerlendirilir. İyimser senaryoda kârlı, kötümserde zararlı bir strateji kırılgandır."
              align="start"
            />
          </span>
          {bt.results.map((r, i) => (
            <button
              key={r.cost_scenario}
              type="button"
              onClick={() => onScenario(i)}
              className={cx(
                "rounded-lg border px-2.5 py-1 text-[12px] transition-colors",
                i === scenario
                  ? "border-brand bg-brand-soft font-medium text-brand"
                  : "border-line text-ink-2 hover:border-line-strong hover:text-ink",
              )}
            >
              {r.cost_scenario}
            </button>
          ))}
        </div>
      )}

      {/* Ölçütler */}
      <StatGrid cols={4}>
        {Object.entries(METRIC_INFO)
          .filter(([key]) => result.metrics[key] !== undefined)
          .slice(0, 8)
          .map(([key, info]) => {
            const raw = result.metrics[key];
            const value = typeof raw === "number" ? raw : null;
            const text =
              value === null
                ? "—"
                : info.format === "pct"
                  ? pctSigned(value)
                  : info.format === "money"
                    ? money(value)
                    : num(value, 2);
            return (
              <Stat
                key={key}
                label={info.label}
                hint={info.hint}
                value={
                  info.format === "pct" ? (
                    <Signed value={value} text={text} size="lg" />
                  ) : (
                    <AmountText text={text} size="lg" />
                  )
                }
              />
            );
          })}
      </StatGrid>

      {/* Eğriler */}
      <div>
        <div className="mb-2 flex items-center gap-1 text-[13px] font-medium text-ink">
          Strateji ve kıyaslar
          <InfoDot id="kiyas" align="start" />
        </div>
        <CurveChart series={curves} normalize height={280} valueFormat={(v) => num(v, 1)} />
        <p className="mt-2 text-[11.5px] leading-relaxed text-ink-3">
          Hepsi 100 tabanına endekslendi. Strateji eğrisi kıyasların altında kalıyorsa, seçim
          yapmak değer katmamış demektir.
        </p>
      </div>

      {/* Kıyas tablosu */}
      {result.benchmarks.length > 0 && (
        <div>
          <div className="mb-2 text-[13px] font-medium text-ink">Kıyas karşılaştırması</div>
          <SimpleTable
            dense
            head={
              <>
                <th>Kıyas</th>
                <th className="col-num">Toplam getiri</th>
                <th className="col-num">Azami düşüş</th>
                <th className="col-num">Sharpe</th>
              </>
            }
          >
            <tr>
              <td className="font-medium text-ink">Strateji</td>
              <td className="col-num">
                <Signed
                  value={asNumber(result.metrics.total_return)}
                  text={pctSigned(asNumber(result.metrics.total_return))}
                  size="sm"
                />
              </td>
              <td className="col-num">{pct(asNumber(result.metrics.max_drawdown))}</td>
              <td className="col-num">{num(asNumber(result.metrics.sharpe), 2)}</td>
            </tr>
            {result.benchmarks.map((b) => (
              <tr key={b.name}>
                <td className="text-ink-2">{b.name}</td>
                <td className="col-num">
                  <Signed
                    value={b.metrics?.total_return ?? null}
                    text={pctSigned(b.metrics?.total_return ?? null)}
                    size="sm"
                  />
                </td>
                <td className="col-num">{pct(b.metrics?.max_drawdown ?? null)}</td>
                <td className="col-num">{num(b.metrics?.sharpe ?? null, 2)}</td>
              </tr>
            ))}
          </SimpleTable>
        </div>
      )}

      {/* İşlem defteri */}
      {result.trades.length > 0 && <TradeLedger trades={result.trades} />}
    </div>
  );
}

function TradeLedger({ trades }: { trades: Record<string, unknown>[] }) {
  const columns: Column<Record<string, unknown>>[] = [
    {
      key: "exit_time",
      header: "Kapanış",
      width: "150px",
      sort: (r) => String(r.exit_time ?? ""),
      cell: (r) => <span className="num text-[12px]">{dateTime(String(r.exit_time ?? ""))}</span>,
    },
    {
      key: "symbol",
      header: "Sembol",
      width: "120px",
      sort: (r) => String(r.symbol ?? ""),
      cell: (r) => <span className="font-mono text-[12.5px]">{String(r.symbol ?? "—")}</span>,
    },
    {
      key: "exit_reason",
      header: "Sebep",
      width: "180px",
      term: "cikis_sebebi",
      cell: (r) => <ExitReasonPill reason={String(r.exit_reason ?? "")} />,
    },
    {
      key: "pnl",
      header: "K/Z",
      num: true,
      sort: (r) => asNumber(r.pnl),
      cell: (r) => <Signed value={asNumber(r.pnl)} text={money(asNumber(r.pnl))} size="sm" />,
    },
    {
      key: "pnl_r",
      header: "Sonuç",
      num: true,
      term: "r_katsayisi",
      sort: (r) => asNumber(r.pnl_r),
      cell: (r) => (
        <Signed value={asNumber(r.pnl_r)} text={rMultiple(asNumber(r.pnl_r))} size="sm" />
      ),
    },
  ];

  return (
    <div>
      <div className="mb-2 text-[13px] font-medium text-ink">İşlem defteri</div>
      <div className="overflow-hidden rounded-lg border border-line">
        <DataTable
          rows={trades}
          columns={columns}
          rowKey={(r) => String(r.id ?? `${r.symbol}-${r.exit_time}`)}
          searchText={(r) => `${r.symbol ?? ""} ${r.exit_reason ?? ""}`}
          searchPlaceholder="Sembol ara…"
          defaultSort={{ key: "exit_time", dir: "desc" }}
          pageSize={25}
          dense
        />
      </div>
    </div>
  );
}

function asNumber(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}
