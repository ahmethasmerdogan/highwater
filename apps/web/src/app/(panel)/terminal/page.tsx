"use client";

/**
 * Terminal — çok panelli çalışma alanı.
 *
 * Paneller sürüklenip bölünebilir, sekmelere yığılabilir; yerleşim
 * tarayıcıda saklanır. Komut satırı `SEMBOL KOMUT ARG` dilini konuşur ve
 * `lib/terminal-commands.ts` ile ⌘K paletiyle aynı ayrıştırıcıyı kullanır.
 *
 * Bu sayfa masaüstü içindir; dar ekranda uyarı gösterir ve panel açmaz —
 * yoğun bir veri ızgarasını telefona sıkıştırmak ikisini de bozar.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { DockviewReact, type DockviewApi, type IDockviewPanelProps } from "dockview-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Marquee } from "uicean";
import { api } from "@/lib/api";
import { toast } from "@/lib/toast";
import { parseCommand, type PanelKind } from "@/lib/terminal-commands";
import { Button, Chip, InfoDot } from "@/design";
import { LogoMark } from "@/design/logo";
import { num, pctSigned } from "@/lib/format";
import type { Position, Score, SystemStatus } from "@/lib/api";
import {
  CalibrationPanel,
  ChartPanel,
  LogsPanel,
  OrdersPanel,
  PoolPanel,
  PositionsPanel,
  ScoreCardPanel,
  ScoresPanel,
  SrPanel,
  type PanelParams,
} from "@/terminal/panels";

const LAYOUT_KEY = "sarnic.terminal.layout";

/* Panel kimliği → bileşen eşlemesi. dockview bileşenleri ada göre çözer. */
const COMPONENTS: Record<PanelKind, React.FC<IDockviewPanelProps<PanelParams>>> = {
  chart: (p) => <ChartPanel {...p.params} />,
  scorecard: (p) => <ScoreCardPanel {...p.params} />,
  sr: (p) => <SrPanel {...p.params} />,
  scores: (p) => <ScoresPanel {...p.params} />,
  pool: () => <PoolPanel />,
  positions: () => <PositionsPanel />,
  orders: () => <OrdersPanel />,
  logs: () => <LogsPanel />,
  calibration: () => <CalibrationPanel />,
};

/**
 * Hazır yerleşimler — boş bir çalışma alanı kullanıcıya ne yapacağını söylemez.
 *
 * `place` alanı panelin nereye konacağını söyler. Verilmezse dockview paneli
 * etkin grubun içine **sekme olarak** yığar; şablonların amacı yan yana
 * göstermek olduğu için ilk panel dışında hepsinde yön belirtilir.
 */
type Placement = { direction: "right" | "below"; ref: number };

const TEMPLATES: {
  id: string;
  label: string;
  hint: string;
  panels: { kind: PanelKind; title: string; params?: PanelParams; place?: Placement }[];
}[] = [
  {
    id: "tarama",
    label: "Tarama odaklı",
    hint: "Puan tablosu, havuz ve kalibrasyon yan yana — hangi coine bakacağınıza karar vermek için.",
    panels: [
      { kind: "scores", title: "Puanlar" },
      { kind: "pool", title: "Havuz", place: { direction: "right", ref: 0 } },
      { kind: "calibration", title: "Kalibrasyon", place: { direction: "right", ref: 1 } },
    ],
  },
  {
    id: "grafik",
    label: "Grafik odaklı",
    hint: "Büyük grafik, yanında puan kartı ve destek/direnç — tek bir coini incelemek için.",
    panels: [
      { kind: "chart", title: "Grafik", params: { symbol: "BTCUSDT", timeframe: "1h" } },
      {
        kind: "scorecard",
        title: "Puan Kartı",
        params: { symbol: "BTCUSDT" },
        place: { direction: "right", ref: 0 },
      },
      {
        kind: "sr",
        title: "S/R",
        params: { symbol: "BTCUSDT" },
        place: { direction: "below", ref: 1 },
      },
    ],
  },
  {
    id: "filo",
    label: "Filo izleme",
    hint: "Pozisyonlar, emirler ve canlı log akışı — sistemin ne yaptığını izlemek için.",
    panels: [
      { kind: "positions", title: "Pozisyonlar" },
      { kind: "orders", title: "Emirler", place: { direction: "below", ref: 0 } },
      { kind: "logs", title: "Log akışı", place: { direction: "right", ref: 0 } },
    ],
  },
];

/** Canlı saat — Bloomberg köşe saati. Yerel + UTC, saniyeli. */
function TerminalClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  const yerel = now.toLocaleTimeString("tr-TR", { hour12: false });
  const utc = now.toLocaleTimeString("tr-TR", { hour12: false, timeZone: "UTC" });
  return (
    <span
      className="sn-num flex items-baseline gap-2"
      style={{ fontSize: "var(--sn-t-caption)", color: "var(--sn-ink-2)" }}
    >
      <span style={{ color: "var(--sn-ink)" }}>{yerel}</span>
      <span style={{ color: "var(--sn-ink-3)" }}>UTC {utc}</span>
    </span>
  );
}

/** Canlı bant: açık pozisyonlar + en yüksek puanlar. Veri gerçektir. */
function TerminalTape() {
  const positions = useQuery({
    queryKey: ["positions", "tape"],
    queryFn: () => api.get<Position[]>("/positions", { status_filter: "OPEN" }),
    refetchInterval: 20_000,
  });
  const scores = useQuery({
    queryKey: ["scores", "tape"],
    queryFn: () => api.get<Score[]>("/scores", { limit: 10 }),
    refetchInterval: 60_000,
  });

  const items = useMemo(() => {
    const out: { key: string; node: React.ReactNode }[] = [];
    for (const p of positions.data ?? []) {
      const pct = p.unrealized_pct ?? null;
      out.push({
        key: `p-${p.id}`,
        node: (
          <span className="sn-num flex items-baseline gap-1.5">
            <span style={{ color: "var(--sn-ink)" }}>{p.symbol}</span>
            <span
              style={{
                color:
                  pct === null
                    ? "var(--sn-ink-3)"
                    : pct >= 0
                      ? "var(--sn-up)"
                      : "var(--sn-down)",
              }}
            >
              {pct === null ? "—" : pctSigned(pct)}
            </span>
          </span>
        ),
      });
    }
    for (const sc of scores.data ?? []) {
      out.push({
        key: `s-${sc.symbol}`,
        node: (
          <span className="sn-num flex items-baseline gap-1.5">
            <span style={{ color: "var(--sn-ink-2)" }}>{sc.symbol}</span>
            <span style={{ color: "var(--sn-brand)" }}>{num(sc.score, 1)}</span>
          </span>
        ),
      });
    }
    return out;
  }, [positions.data, scores.data]);

  if (items.length === 0) return null;
  return (
    <div className="sn-terminal-tape px-2 py-1">
      <Marquee duration={40}>
        {items.map((item) => (
          <span key={item.key} className="flex items-center gap-10">
            <span
              className="flex items-center gap-2"
              style={{ fontSize: "var(--sn-t-caption)" }}
            >
              {item.node}
            </span>
            <span aria-hidden style={{ color: "var(--sn-ink-4)", fontSize: 8 }}>
              ◆
            </span>
          </span>
        ))}
      </Marquee>
    </div>
  );
}

/** Alt durum çubuğu — sistemin nabzı, Bloomberg'in durum satırı. */
function TerminalStatusLine() {
  const status = useQuery({
    queryKey: ["system-status", "terminal"],
    queryFn: () => api.get<SystemStatus>("/system/status"),
    refetchInterval: 30_000,
  });
  const s = status.data;
  return (
    <span
      className="sn-num flex items-center gap-4"
      style={{ fontSize: "var(--sn-t-micro)", color: "var(--sn-ink-3)" }}
    >
      <span>
        havuz <span style={{ color: "var(--sn-ink)" }}>{s?.universe_size ?? "—"}</span>
      </span>
      <span>
        bot{" "}
        <span style={{ color: "var(--sn-ink)" }}>
          {s ? `${s.running_bots}/${s.total_bots}` : "—"}
        </span>
      </span>
      <span>
        alarm{" "}
        <span style={{ color: (s?.alarms ?? 0) > 0 ? "var(--sn-warn)" : "var(--sn-ink)" }}>
          {s?.alarms ?? "—"}
        </span>
      </span>
      {s?.market_data_stale ? (
        <span style={{ color: "var(--sn-down)" }}>VERİ BAYAT</span>
      ) : (
        <span className="flex items-center gap-1.5" style={{ color: "var(--sn-up)" }}>
          <span
            aria-hidden
            className="inline-block h-1.5 w-1.5 rounded-full"
            style={{ background: "var(--sn-up)" }}
          />
          CANLI
        </span>
      )}
    </span>
  );
}

export default function TerminalPage() {
  const router = useRouter();
  const apiRef = useRef<DockviewApi | null>(null);
  const [command, setCommand] = useState("");
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const counterRef = useRef(0);

  const killSwitch = useMutation({
    mutationFn: () => api.post("/system/kill-switch"),
    onSuccess: () => toast.warning("Acil durdurma çalıştırıldı", "Tüm botlar durduruldu."),
    onError: (e: Error) => toast.error("Acil durdurma başarısız", e.message),
  });

  /** Tek panel açar; komut satırı bunu kullanır (etkin gruba sekme olarak). */
  const addPanel = useCallback(
    (kind: PanelKind, title: string, params?: PanelParams): string | null => {
      const dv = apiRef.current;
      if (!dv) return null;
      counterRef.current += 1;
      const id = `${kind}-${counterRef.current}`;
      dv.addPanel({ id, component: kind, title, params: params ?? {} });
      return id;
    },
    [],
  );

  const applyTemplate = useCallback((templateId: string) => {
    const dv = apiRef.current;
    const template = TEMPLATES.find((t) => t.id === templateId);
    if (!dv || !template) return;

    dv.clear();
    const ids: string[] = [];

    template.panels.forEach((p) => {
      counterRef.current += 1;
      const id = `${p.kind}-${counterRef.current}`;
      dv.addPanel({
        id,
        component: p.kind,
        title: p.title,
        params: p.params ?? {},
        // Yön verilmezse dockview paneli etkin grubun içine sekme olarak yığar.
        position: p.place
          ? { referencePanel: ids[p.place.ref], direction: p.place.direction }
          : undefined,
      });
      ids.push(id);
    });
  }, []);

  /* Yerleşim tarayıcıda saklanır; ilk açılışta tarama şablonu kurulur. */
  const onReady = useCallback(
    (event: { api: DockviewApi }) => {
      apiRef.current = event.api;
      setReady(true);

      let restored = false;
      try {
        const saved = localStorage.getItem(LAYOUT_KEY);
        if (saved) {
          event.api.fromJSON(JSON.parse(saved));
          restored = event.api.panels.length > 0;
        }
      } catch {
        /* bozuk yerleşim kaydı sayfayı kilitlemesin */
      }
      if (!restored) applyTemplate("tarama");

      event.api.onDidLayoutChange(() => {
        try {
          localStorage.setItem(LAYOUT_KEY, JSON.stringify(event.api.toJSON()));
        } catch {
          /* saklanamadı; oturum boyunca geçerli */
        }
      });
    },
    [applyTemplate],
  );

  /* `/` komut satırına odaklanır — klavye öncelikli kullanım. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable;
      if (e.key === "/" && !typing) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const parsed = parseCommand(command);
    if (!parsed) return;

    switch (parsed.kind) {
      case "open":
        addPanel(parsed.panel, parsed.title, {
          symbol: parsed.symbol,
          timeframe: parsed.timeframe,
        });
        setCommand("");
        break;
      case "scan":
        addPanel("scores", `Tarama ≥ ${parsed.threshold}`, { threshold: parsed.threshold });
        setCommand("");
        break;
      case "backtest":
        router.push("/backtest");
        break;
      case "kill":
        if (
          window.confirm(
            "Acil durdurma tüm botları durdurur ve açık emirleri iptal eder. Bu işlem geri alınamaz. Devam edilsin mi?",
          )
        ) {
          killSwitch.mutate();
        }
        setCommand("");
        break;
      case "error":
        setError(parsed.message);
        break;
    }
  };

  return (
    <div className="sn-terminal flex h-full flex-col">
      {/* Dar ekran uyarısı */}
      <div
        className="px-4 py-3 lg:hidden"
        style={{
          background: "var(--sn-warn-bg)",
          borderBottom: "1px solid var(--sn-hairline)",
          fontSize: "var(--sn-t-body)",
          color: "var(--sn-ink)",
        }}
      >
        <strong style={{ fontWeight: 550 }}>Terminal masaüstü içindir.</strong>{" "}
        <span style={{ color: "var(--sn-ink-2)" }}>
          Çok panelli çalışma alanı dar ekranda okunmaz. Buradaki bilgilerin tamamı Panel,
          Puanlar, Havuz ve Pozisyonlar sayfalarında da var.
        </span>
      </div>

      <div className="hidden flex-1 flex-col lg:flex">
        {/* Üst şerit: marka · komut · saat — Bloomberg chrome'u */}
        <div
          className="flex flex-wrap items-center gap-3 px-3 py-1.5"
          style={{ background: "var(--sn-panel)", borderBottom: "1px solid var(--sn-hairline)" }}
        >
          <span
            className="flex items-center gap-2 pr-2"
            style={{ borderRight: "1px solid var(--sn-hairline)" }}
          >
            <LogoMark size={18} className="text-[var(--sn-brand)]" />
            <span
              className="font-semibold"
              style={{
                fontSize: "var(--sn-t-caption)",
                color: "var(--sn-brand)",
                letterSpacing: "0.08em",
              }}
            >
              SARNIÇ TERMİNAL
            </span>
          </span>
          <form
            onSubmit={submit}
            className="sn-terminal-cmd flex min-w-72 flex-1 items-center gap-2 rounded-[var(--sn-r-sm)] px-2.5 py-1"
            style={{ background: "var(--sn-sunken)", border: "1px solid var(--sn-border)" }}
          >
            <span
              className="sn-num"
              style={{ fontSize: "var(--sn-t-body)", color: "var(--sn-brand)" }}
            >
              &gt;
            </span>
            <input
              ref={inputRef}
              value={command}
              onChange={(event) => {
                setCommand(event.target.value);
                setError("");
              }}
              placeholder="SOLUSDT G 1h · SCAN 80 · POOL · POS · LOG · KILL"
              className="sn-num w-full bg-transparent uppercase focus:outline-none"
              style={{ fontSize: "var(--sn-t-body)", color: "var(--sn-ink)" }}
            />
            <kbd
              className="sn-num rounded-[var(--sn-r-xs)] px-1.5"
              style={{
                background: "var(--sn-raised)",
                color: "var(--sn-ink-3)",
                fontSize: "var(--sn-t-micro)",
              }}
            >
              /
            </kbd>
          </form>
          <TerminalClock />

          <div className="flex items-center gap-1.5">
            <span
              className="flex items-center gap-1"
              style={{ fontSize: "var(--sn-t-caption)", color: "var(--sn-ink-3)" }}
            >
              Yerleşim
              <InfoDot text="Hazır bir yerleşim kurar. Panelleri sürükleyip bölebilir, sekmelere yığabilirsiniz; düzeniniz tarayıcıda saklanır." />
            </span>
            {TEMPLATES.map((template) => (
              <Chip
                key={template.id}
                active={false}
                title={template.hint}
                onClick={() => applyTemplate(template.id)}
              >
                {template.label}
              </Chip>
            ))}
            <Button
              size="sm"
              variant="quiet"
              onClick={() => {
                apiRef.current?.clear();
                try {
                  localStorage.removeItem(LAYOUT_KEY);
                } catch {
                  /* yoksay */
                }
              }}
            >
              Temizle
            </Button>
          </div>
        </div>

        {error && (
          <div
            className="px-4 py-1.5"
            style={{
              background: "var(--sn-down-bg)",
              borderBottom: "1px solid var(--sn-hairline)",
              fontSize: "var(--sn-t-caption)",
              color: "var(--sn-ink)",
            }}
          >
            {error}
          </div>
        )}

        {/* Canlı bant */}
        <TerminalTape />

        {/* Çalışma alanı */}
        <div className="relative flex-1">
          <DockviewReact
            components={COMPONENTS}
            onReady={onReady}
            className="absolute inset-0"
          />
          {ready && apiRef.current?.panels.length === 0 && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <p style={{ fontSize: "var(--sn-t-body)", color: "var(--sn-ink-3)" }}>
                Panel yok. Yukarıdan bir yerleşim seçin ya da komut yazın.
              </p>
            </div>
          )}
        </div>

        {/* Alt şerit: tuş takımı + sistem nabzı */}
        <div
          className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-1.5"
          style={{
            background: "var(--sn-panel)",
            borderTop: "1px solid var(--sn-hairline)",
            fontSize: "var(--sn-t-micro)",
            color: "var(--sn-ink-3)",
          }}
        >
          {(
            [
              ["POS", "positions", "Pozisyonlar"],
              ["ORD", "orders", "Emirler"],
              ["POOL", "pool", "Havuz"],
              ["LOG", "logs", "Log akışı"],
              ["CAL", "calibration", "Kalibrasyon"],
            ] as const
          ).map(([kod, kind, title]) => (
            <button
              key={kod}
              type="button"
              onClick={() => addPanel(kind, title)}
              className="sn-num rounded-[3px] px-1.5 py-0.5 transition-colors duration-[var(--sn-dur-1)]"
              style={{
                background: "var(--sn-raised)",
                border: "1px solid var(--sn-border)",
                color: "var(--sn-brand)",
                cursor: "pointer",
              }}
              title={`${title} panelini aç`}
            >
              {kod}
            </button>
          ))}
          <span>
            <span className="sn-num" style={{ color: "var(--sn-ink-2)" }}>
              SEMBOL G · SC · SR
            </span>{" "}
            grafik / puan kartı / destek-direnç
          </span>
          <span>
            <span className="sn-num" style={{ color: "var(--sn-ink-2)" }}>
              SCAN 80
            </span>{" "}
            puanı ≥80 olanlar
          </span>
          <span style={{ color: "var(--sn-warn)" }}>
            <span className="sn-num">KILL</span> acil durdurma (onay ister)
          </span>
          <span className="ml-auto">
            <TerminalStatusLine />
          </span>
        </div>
      </div>
    </div>
  );
}
