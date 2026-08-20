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

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { DockviewReact, type DockviewApi, type IDockviewPanelProps } from "dockview-react";
import { useMutation } from "@tanstack/react-query";
import { Button, Kbd } from "@/ui";
import { api } from "@/lib/api";
import { toast } from "@/lib/toast";
import { parseCommand, type PanelKind } from "@/lib/terminal-commands";
import { InfoDot } from "@/components/common/explain";
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
} from "@/components/terminal/panels";

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
    <div className="flex h-full flex-col">
      {/* Dar ekran uyarısı */}
      <div className="border-b border-line bg-warn-soft px-4 py-3 text-[13px] text-ink lg:hidden">
        <strong className="font-medium">Terminal masaüstü içindir.</strong>{" "}
        <span className="text-ink-2">
          Çok panelli çalışma alanı dar ekranda okunmaz. Buradaki bilgilerin tamamı Panel,
          Puanlar, Havuz ve Pozisyonlar sayfalarında da var.
        </span>
      </div>

      <div className="hidden flex-1 flex-col lg:flex">
        {/* Komut satırı */}
        <div className="flex flex-wrap items-center gap-3 border-b border-line bg-surface px-4 py-2">
          <form onSubmit={submit} className="flex min-w-72 flex-1 items-center gap-2">
            <span className="text-[13px] text-ink-3">›</span>
            <input
              ref={inputRef}
              value={command}
              onChange={(e) => {
                setCommand(e.target.value);
                setError("");
              }}
              placeholder="SOLUSDT G 1h · SCAN 80 · POOL · POS · LOG · KILL"
              className="w-full bg-transparent font-mono text-[13px] text-ink uppercase placeholder:font-sans placeholder:normal-case placeholder:text-ink-3 focus:outline-none"
            />
            <Kbd>/</Kbd>
          </form>

          <div className="flex items-center gap-1.5">
            <span className="flex items-center gap-1 text-[11.5px] text-ink-3">
              Yerleşim
              <InfoDot
                text="Hazır bir yerleşim kurar. Panelleri sürükleyip bölebilir, sekmelere yığabilirsiniz; düzeniniz tarayıcıda saklanır."
                align="end"
              />
            </span>
            {TEMPLATES.map((t) => (
              <button
                key={t.id}
                type="button"
                title={t.hint}
                onClick={() => applyTemplate(t.id)}
                className="rounded-lg border border-line px-2 py-0.5 text-[11.5px] text-ink-2 hover:border-line-strong hover:text-ink"
              >
                {t.label}
              </button>
            ))}
            <Button
              size="sm"
              variant="ghost"
              shape="rect"
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
          <div className="border-b border-line bg-down-soft px-4 py-1.5 text-[12.5px] text-ink">
            {error}
          </div>
        )}

        {/* Çalışma alanı */}
        <div className="relative flex-1">
          <DockviewReact
            components={COMPONENTS}
            onReady={onReady}
            className="absolute inset-0"
          />
          {ready && apiRef.current?.panels.length === 0 && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <p className="text-[13px] text-ink-3">
                Panel yok. Yukarıdan bir yerleşim seçin ya da komut yazın.
              </p>
            </div>
          )}
        </div>

        {/* Komut yardımı */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line bg-surface px-4 py-1.5 text-[11px] text-ink-3">
          <span>
            <span className="font-mono text-ink-2">SEMBOL G [dilim]</span> grafik
          </span>
          <span>
            <span className="font-mono text-ink-2">SEMBOL SC</span> puan kartı
          </span>
          <span>
            <span className="font-mono text-ink-2">SEMBOL SR</span> destek/direnç
          </span>
          <span>
            <span className="font-mono text-ink-2">SCAN 80</span> puanı ≥80 olanlar
          </span>
          <span>
            <span className="font-mono text-ink-2">POOL · POS · ORD · LOG · CAL</span> paneller
          </span>
          <span className="text-warn">
            <span className="font-mono">KILL</span> acil durdurma (onay ister)
          </span>
        </div>
      </div>
    </div>
  );
}
