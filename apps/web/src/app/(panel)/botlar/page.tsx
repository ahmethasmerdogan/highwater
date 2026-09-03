"use client";

/**
 * BOTLAR v3 — kol defteri (DESIGN-V3 §4.4).
 *
 * Manşet · Filo (dört figür, tek blokta) · Maraton kolları (defter
 * tablosu) · Arşiv (katlı). Bot arayüzden bağımsız bir servistir: paneli
 * kapatmak botu durdurmaz — tablonun dipnotu bunu yazar.
 */

import { useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Collapsible } from "uicean";
import { api, type Bot, type Strategy, type PortfolioEquity } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { toast } from "@/lib/toast";
import { money, num, pctSigned, relative } from "@/lib/format";
import { botEylemleri, EYLEM_ETIKET } from "@/lib/bot-actions";
import { Page, GuideSection } from "@/shell/page";
import {
  Async,
  BotStatePill,
  Button,
  Delta,
  FormField,
  Metric,
  Modal,
  NumText,
  Panel,
  Select,
  TextInput,
  Tag,
} from "@/design";
import { Sparkline } from "@/design/chart";
import { DataGrid } from "@/grid/data-grid";
import type { GridColumn } from "@/grid/types";
import { girisYasagiBitis, GirisYasagiPill, KesiciPill } from "./risk";

/** Arşiv: adı "ARŞİV" ile başlayan ya da kesicisiz durdurulmuş bot. */
function arsivMi(bot: Bot): boolean {
  return bot.name.startsWith("ARŞİV") || (bot.state === "STOPPED" && !bot.halt_reason);
}

export default function BotsPage() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);

  const query = useQuery({
    queryKey: ["bots"],
    queryFn: () => api.get<Bot[]>("/bots"),
    refetchInterval: 15_000,
  });

  const action = useMutation({
    mutationFn: ({ id, verb }: { id: number; verb: string }) => api.post(`/bots/${id}/${verb}`),
    onSuccess: (_data, variables) => {
      const label =
        variables.verb === "start"
          ? "başlatıldı"
          : variables.verb === "pause"
            ? "duraklatıldı"
            : variables.verb === "stop"
              ? "durduruldu"
              : "kapatıldı";
      toast.success(`Bot ${label}`);
      void qc.invalidateQueries({ queryKey: ["bots"] });
    },
    onError: (error: Error) => toast.error("İşlem yapılamadı", error.message),
  });

  /* Satır başına mini özsermaye eğrisi — tek istekle tüm botlar. */
  const curves = useQuery({
    queryKey: ["equity", "hepsi"],
    queryFn: () => api.get<PortfolioEquity>("/portfolio/equity"),
    refetchInterval: 120_000,
  });
  const egriler = useMemo(() => {
    const map = new Map<number, number[]>();
    for (const bot of curves.data?.bots ?? []) {
      map.set(bot.bot_id, bot.curve.slice(-40).map((point) => point.equity));
    }
    return map;
  }, [curves.data]);

  const bots = query.data ?? [];
  const sirali = (list: Bot[]) => [...list].sort((a, b) => a.name.localeCompare(b.name, "tr"));
  const kollar = sirali(bots.filter((bot) => !arsivMi(bot)));
  const arsiv = sirali(bots.filter(arsivMi));
  const running = bots.filter((bot) => bot.state === "PAPER_RUNNING").length;
  const totalEquity = bots.reduce((sum, bot) => sum + (bot.equity ?? 0), 0);
  const totalCapital = bots.reduce((sum, bot) => sum + bot.capital, 0);
  const openPositions = bots.reduce((sum, bot) => sum + bot.open_positions, 0);
  const totalReturn = totalCapital > 0 ? totalEquity / totalCapital - 1 : 0;

  const tablo = (rows: Bot[], storageKey: string, bos: string) => (
    <KolTablosu
      rows={rows}
      egriler={egriler}
      storageKey={storageKey}
      bos={bos}
      actions={can("TRADER") ? (bot) => botEylemleri(bot.state).map((verb) => (
        <Button key={verb} size="sm" variant="neutral" onClick={() => action.mutate({ id: bot.id, verb })}>
          {EYLEM_ETIKET[verb]}
        </Button>
      )) : undefined}
    />
  );

  return (
    <Page
      title="Botlar"
      summary="Her kol bir strateji sürümünü kendi sermayesi ve karar barıyla bağımsız koşar."
      stamp={query.dataUpdatedAt ? `${relative(new Date(query.dataUpdatedAt).toISOString())} tazelendi` : undefined}
      actions={
        can("TRADER") ? (
          <Button size="sm" variant="primary" onClick={() => setCreateOpen(true)}>
            Yeni bot
          </Button>
        ) : undefined
      }
      guide={
        <>
          <GuideSection title="Ne gösteriyor">
            <p>
              Bir bot, seçilen strateji sürümünü belirli bir sermaye ve karar barıyla çalıştıran
              bağımsız bir süreçtir. Kendi nakdini, pozisyonlarını ve risk sayaçlarını taşır.
            </p>
          </GuideSection>
          <GuideSection title="Nasıl okunur">
            <p>
              <strong>Bot arayüzden bağımsızdır.</strong> Paneli ya da bilgisayarı kapatmak botu
              durdurmaz; bot sunucuda çalışır.
            </p>
            <p>
              <strong>Duraklat</strong> açık pozisyonları yönetir, yeni giriş yapmaz.{" "}
              <strong>Durdur</strong> botu tamamen keser. <strong>Giriş yasağı</strong> bir devre
              kesicinin girişleri geçici olarak kapattığı anlamına gelir.
            </p>
          </GuideSection>
        </>
      }
    >
      {/* ---- Filo: dört figür, tek blok --------------------------------- */}
      {bots.length > 0 && (
        <Panel title="Filo">
          <div className="grid grid-cols-2 gap-x-6 gap-y-4 lg:grid-cols-4">
            <Metric
              label="Çalışan bot"
              value={running}
              format={(value) => num(value, 0)}
              accent={running === 0 ? "var(--sn-warn)" : undefined}
              sub={`${num(bots.length, 0)} bot kurulu`}
            />
            <Metric
              label="Toplam özsermaye"
              value={totalEquity}
              format={(value) => money(value)}
              sub={`başlangıç ${money(totalCapital)}`}
            />
            <Metric
              label="Toplam getiri"
              value={totalReturn}
              format={(value) => pctSigned(value)}
              sub="birleşik başlangıç sermayesine göre"
            />
            <Metric
              label="Açık pozisyon"
              value={openPositions}
              format={(value) => num(value, 0)}
              sub="tüm kollarda"
            />
          </div>
        </Panel>
      )}

      {/* ---- Maraton kolları: defter tablosu ----------------------------- */}
      <Panel
        title="Maraton kolları"
        description="Koşan, kısıtlı ve durmuş kollar. Eğri son 40 barın seyri."
        padded={false}
        footer="Botlar sunucuda çalışır. Bu sayfayı kapatmak çalışan bir botu durdurmaz."
      >
        <Async
          query={query}
          empty={{
            title: "Henüz bot yok",
            hint: "Bot kurup başlatana kadar sistem hiçbir işlem açmaz. Önce bir strateji sürümü gerekir.",
            action: can("TRADER") ? (
              <Button size="sm" variant="primary" onClick={() => setCreateOpen(true)}>
                İlk botu kur
              </Button>
            ) : undefined,
          }}
        >
          {() => tablo(kollar, "botlar-kollar", "Koşan kol yok — tüm botlar arşivde.")}
        </Async>
      </Panel>

      {arsiv.length > 0 && (
        <Panel padded={false}>
          <Collapsible
            className="px-5"
            trigger={
              <span className="inline-flex items-baseline gap-1 text-[13px] text-ink-2">
                Arşiv (<NumText text={num(arsiv.length, 0)} size="sm" />)
              </span>
            }
          >
            <div className="-mx-5 border-t border-line">{tablo(arsiv, "botlar-arsiv", "Arşiv boş.")}</div>
          </Collapsible>
        </Panel>
      )}

      <CreateBotModal open={createOpen} onClose={() => setCreateOpen(false)} />
    </Page>
  );
}

/* ------------------------------------------------------------------ */
/*  Kol defteri                                                        */
/* ------------------------------------------------------------------ */

/**
 * Durum hücresi önceliği: hata → süren giriş yasağı → kesici durdurması →
 * durum. Bot "çalışıyor" görünüp alım yapamıyorsa bu sıra onu söyler.
 */
function DurumHucresi({ bot }: { bot: Bot }) {
  if (bot.state === "ERROR") return <BotStatePill state={bot.state} hint={false} />;
  const yasak = girisYasagiBitis(bot);
  if (yasak) return <GirisYasagiPill until={yasak} />;
  if (bot.state === "STOPPED" && bot.halt_reason) return <KesiciPill reason={bot.halt_reason} />;
  return (
    <span className="inline-flex items-center gap-1.5">
      <BotStatePill state={bot.state} hint={false} />
      {bot.halt_reason && <span className="text-[11.5px] text-ink-3">{bot.halt_reason}</span>}
    </span>
  );
}

interface KolRow {
  bot: Bot;
  spark: number[];
  getiri: number | null;
}

function KolTablosu({
  rows,
  egriler,
  storageKey,
  bos,
  actions,
}: {
  rows: Bot[];
  egriler: Map<number, number[]>;
  storageKey: string;
  bos: string;
  actions?: (bot: Bot) => ReactNode;
}) {
  const router = useRouter();
  const satirlar = useMemo<KolRow[]>(
    () =>
      rows.map((bot) => ({
        bot,
        spark: egriler.get(bot.id) ?? [],
        getiri: bot.equity !== null && bot.capital > 0 ? bot.equity / bot.capital - 1 : null,
      })),
    [rows, egriler],
  );

  const columns = useMemo<GridColumn<KolRow>[]>(() => {
    const list: GridColumn<KolRow>[] = [
      { id: "kol", header: "Kol", width: 220, pin: true, value: (r) => r.bot.name, cell: (r) => <span className="font-medium text-ink">{r.bot.name}</span> },
      {
        id: "pazar",
        header: "Pazar",
        width: 84,
        value: (r) => r.bot.market,
        cell: (r) => (r.bot.market === "BIST" ? <Tag tone="info">BIST</Tag> : r.bot.market === "US" ? <Tag tone="info">ABD</Tag> : <span className="text-ink-3">Kripto</span>),
      },
      { id: "bar", header: "Bar", width: 64, value: (r) => r.bot.timeframe, cell: (r) => <NumText text={r.bot.timeframe} size="sm" /> },
      { id: "durum", header: "Durum", width: 180, value: (r) => r.bot.state, search: (r) => `${r.bot.state} ${r.bot.halt_reason ?? ""}`, cell: (r) => <DurumHucresi bot={r.bot} /> },
      { id: "ozsermaye", header: "Özsermaye", width: 120, num: true, value: (r) => r.bot.equity, cell: (r) => <NumText text={money(r.bot.equity)} size="sm" /> },
      { id: "getiri", header: "Getiri", width: 100, num: true, value: (r) => r.getiri, cell: (r) => <Delta value={r.getiri} format={(v) => pctSigned(v)} size="md" /> },
      { id: "acik", header: "Açık", width: 72, num: true, value: (r) => r.bot.open_positions, cell: (r) => <NumText text={num(r.bot.open_positions, 0)} size="sm" /> },
      {
        id: "sinyal",
        header: "Yaşam sinyali",
        width: 120,
        num: true,
        value: (r) => (r.bot.last_heartbeat_at ? new Date(r.bot.last_heartbeat_at).getTime() : null),
        cell: (r) => <span className="text-[12px] text-ink-3">{relative(r.bot.last_heartbeat_at)}</span>,
      },
      {
        id: "egri",
        header: "Eğri",
        width: 110,
        cell: (r) => {
          const yukari = (r.spark.at(-1) ?? 0) >= (r.spark[0] ?? 0);
          return <Sparkline points={r.spark} width={96} height={20} color={yukari ? "var(--sn-up)" : "var(--sn-down)"} />;
        },
      },
    ];
    if (actions) {
      list.push({
        id: "eylem",
        header: "",
        width: 150,
        num: true,
        /* Düğme tıkı satıra sızmasın — satır tıkı bot sayfasına götürür. */
        cell: (r) => (
          <span className="inline-flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
            {actions(r.bot)}
          </span>
        ),
      });
    }
    return list;
  }, [actions]);

  return (
    <DataGrid
      rows={satirlar}
      columns={columns}
      rowKey={(r) => String(r.bot.id)}
      storageKey={storageKey}
      searchPlaceholder="Kol ara…"
      density="compact"
      defaultSort={[{ id: "kol", desc: false }]}
      onRowClick={(r) => router.push(`/botlar/${r.bot.id}`)}
      emptyTitle={bos}
    />
  );
}

/* ------------------------------------------------------------------ */
/*  Yeni bot                                                           */
/* ------------------------------------------------------------------ */

function CreateBotModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [versionId, setVersionId] = useState<number | null>(null);
  const [capital, setCapital] = useState("5000");
  const [timeframe, setTimeframe] = useState("1h");

  const strategies = useQuery({
    queryKey: ["strategies"],
    queryFn: () => api.get<Strategy[]>("/strategies"),
    enabled: open,
  });

  /* Sürüm listesi düzleştirilir: kullanıcı stratejiyi değil, çalıştırılacak
     sürümü seçer — bot her zaman belirli bir sürüme bağlanır. */
  const versions = (strategies.data ?? []).flatMap((strategy) =>
    strategy.versions.map((version) => ({
      id: version.id,
      label: `${strategy.name} · sürüm ${version.version}${version.frozen ? " (donuk)" : ""}`,
    })),
  );

  const create = useMutation({
    mutationFn: () =>
      api.post<Bot>("/bots", {
        name: name.trim(),
        strategy_version_id: versionId,
        capital: Number(capital),
        timeframe,
      }),
    onSuccess: () => {
      toast.success("Bot kuruldu", "Taslak durumunda. Başlatana kadar işlem açmaz.");
      void qc.invalidateQueries({ queryKey: ["bots"] });
      onClose();
    },
    onError: (error: Error) => toast.error("Bot kurulamadı", error.message),
  });

  const valid = name.trim().length > 0 && versionId !== null && Number(capital) > 0;

  return (
    <Modal
      open={open}
      onOpenChange={(next) => !next && onClose()}
      title="Yeni bot"
      description="Bot taslak olarak kurulur ve siz başlatana kadar hiçbir şey yapmaz."
      footer={
        <>
          <Button variant="quiet" onClick={onClose}>
            Vazgeç
          </Button>
          <Button variant="primary" disabled={!valid || create.isPending} onClick={() => create.mutate()}>
            {create.isPending ? "Kuruluyor…" : "Botu kur"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3.5">
        <FormField label="Ad">
          <TextInput
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Örn. Muhafazakâr 1h"
            autoFocus
          />
        </FormField>

        <FormField
          label="Strateji sürümü"
          term="strateji_surum"
          error={
            versions.length === 0
              ? "Hiç strateji sürümü yok. Önce Stratejiler sayfasından bir strateji oluşturun."
              : null
          }
        >
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

        <div className="grid grid-cols-2 gap-3">
          <FormField label="Sermaye (USD)">
            <TextInput
              value={capital}
              onChange={(event) => setCapital(event.target.value)}
              inputMode="decimal"
              numeric
            />
          </FormField>

          <FormField label="Karar barı" term="karar_bari">
            <Select value={timeframe} onChange={(event) => setTimeframe(event.target.value)}>
              {["15m", "1h", "4h", "1d"].map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </Select>
          </FormField>
        </div>

        <p className="rounded-lg bg-inset px-3 py-2 text-[12.5px] leading-[1.5] text-ink-2">
          Kararlar seçilen bar kapandığında alınır. Kapanmamış bir barın verisi karara girmez —
          bu, geçmiş testlerin dürüst kalması için zorunludur.
        </p>
      </div>
    </Modal>
  );
}
