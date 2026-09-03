"use client";

/**
 * Botlar — çalışan işlem süreçleri.
 *
 * Bot arayüzden bağımsız bir servistir: paneli ya da terminali kapatmak
 * botu durdurmaz. Sayfa bunu açıkça yazar, çünkü tersini varsayan bir
 * kullanıcı sekmeyi kapatarak işlemleri durdurduğunu sanabilir.
 */

import Link from "next/link";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type Bot, type Strategy , type PortfolioEquity } from "@/lib/api";
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
Tag } from "@/design";
import { Sparkline } from "@/design/chart";
import { Collapsible } from "uicean";
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

  /* Satır başına mini özsermaye eğrisi — tek istekle tüm botlar.
     Sayının yanında seyri: 416 yazan iki bottan hangisi düşerek geldi? */
  const curves = useQuery({
    queryKey: ["equity", "hepsi"],
    queryFn: () => api.get<PortfolioEquity>("/portfolio/equity"),
    refetchInterval: 120_000,
  });
  const egriler = useMemo(() => {
    const map = new Map<number, number[]>();
    for (const bot of curves.data?.bots ?? []) {
      map.set(
        bot.bot_id,
        bot.curve.slice(-40).map((point) => point.equity),
      );
    }
    return map;
  }, [curves.data]);

  const bots = query.data ?? [];
  const kollar = bots.filter((bot) => !arsivMi(bot));
  const arsiv = bots.filter(arsivMi);
  const running = bots.filter((bot) => bot.state === "PAPER_RUNNING").length;
  const totalEquity = bots.reduce((sum, bot) => sum + (bot.equity ?? 0), 0);
  const totalCapital = bots.reduce((sum, bot) => sum + bot.capital, 0);
  const openPositions = bots.reduce((sum, bot) => sum + bot.open_positions, 0);
  const totalReturn = totalCapital > 0 ? totalEquity / totalCapital - 1 : 0;

  const columns = useMemo<GridColumn<Bot>[]>(
    () => [
      {
        id: "name",
        header: "Bot",
        width: 230,
        pin: true,
        value: (row) => row.name,
        search: (row) => `${row.name} ${row.state} ${row.timeframe} ${row.market}`,
        cell: (row) => (
          <span className="inline-flex min-w-0 items-center gap-1.5">
            <Link
              href={`/botlar/${row.id}`}
              style={{ fontSize: "var(--sn-t-body)", color: "var(--sn-ink)" }}
              className="min-w-0 truncate hover:underline"
            >
              {row.name}
            </Link>
            {/* Pazar rozeti: kripto varsayılandır ve rozet almaz — BIST/ABD
                bir bakışta seçilsin diye işaretlenir. */}
            {row.market === "BIST" && <Tag tone="info">BIST</Tag>}
            {row.market === "US" && <Tag tone="info">ABD</Tag>}
          </span>
        ),
      },
      {
        id: "state",
        header: "Durum",
        width: 224,
        hint: "Çalışıyor: karar alır ve pozisyon açabilir. Duraklatıldı: açık pozisyonları yönetir, yeni giriş yapmaz. Kısıtlı: bir devre kesici girişleri kapatmış. Giriş yasağı: kesici cezası sürüyor, saat dolunca kalkar. Kesici: bot bir devre kesici tarafından durduruldu.",
        value: (row) => row.state,
        cell: (row) => {
          /* Öncelik: hata → süren giriş yasağı → kesici durdurması → durum. */
          if (row.state === "ERROR") return <BotStatePill state={row.state} />;
          const yasak = girisYasagiBitis(row);
          if (yasak) return <GirisYasagiPill until={yasak} />;
          if (row.state === "STOPPED" && row.halt_reason) return <KesiciPill reason={row.halt_reason} />;
          return (
            <span className="flex flex-col gap-0.5">
              <BotStatePill state={row.state} />
              {row.halt_reason && (
                <span style={{ fontSize: "var(--sn-t-micro)", color: "var(--sn-warn)" }}>
                  {row.halt_reason}
                </span>
              )}
            </span>
          );
        },
      },
      {
        id: "timeframe",
        header: "Bar",
        width: 82,
        hint: "Karar barı. Bu bar kapanmadan o barın verisi karara giremez.",
        value: (row) => row.timeframe,
        cell: (row) => (
          <span className="sn-num" style={{ fontSize: "var(--sn-t-caption)", color: "var(--sn-ink-2)" }}>
            {row.timeframe}
          </span>
        ),
      },
      {
        id: "equity",
        header: "Özsermaye",
        width: 190,
        num: true,
        hint: "Nakit artı açık pozisyonların güncel karşılığı. Yanındaki eğri son 40 barın seyri.",
        value: (row) => row.equity,
        cell: (row) => (
          <span className="inline-flex items-center justify-end gap-2">
            <Sparkline
              points={egriler.get(row.id) ?? []}
              width={96}
              height={16}
              color={
                (egriler.get(row.id)?.at(-1) ?? 0) >= (egriler.get(row.id)?.[0] ?? 0)
                  ? "var(--sn-up)"
                  : "var(--sn-down)"
              }
            />
            <NumText text={money(row.equity)} size="sm" />
          </span>
        ),
        footer: (list) => (
          <NumText text={money(list.reduce((sum, row) => sum + (row.equity ?? 0), 0))} size="sm" />
        ),
      },
      {
        id: "return",
        header: "Getiri",
        width: 112,
        num: true,
        hint: "Başlangıç sermayesine göre toplam değişim.",
        value: (row) => (row.equity !== null ? row.equity / row.capital - 1 : null),
        cell: (row) => {
          if (row.equity === null) return <NumText text="—" size="sm" />;
          const ret = row.capital > 0 ? row.equity / row.capital - 1 : 0;
          return <Delta value={ret} format={(value) => pctSigned(value)} size="sm" />;
        },
      },
      {
        id: "cash",
        header: "Nakit",
        width: 120,
        num: true,
        hidden: true,
        hint: "Pozisyona girmemiş, elde duran tutar.",
        value: (row) => row.cash,
        cell: (row) => <NumText text={money(row.cash)} size="sm" />,
      },
      {
        id: "open_positions",
        header: "Açık",
        width: 86,
        num: true,
        hint: "Şu an piyasada duran pozisyon sayısı.",
        value: (row) => row.open_positions,
        cell: (row) => <NumText text={String(row.open_positions)} size="sm" />,
      },
      {
        id: "heartbeat",
        header: "Yaşam sinyali",
        width: 134,
        hint: "Botun son kez haber verdiği an. Uzun süre sessiz kalan bir bot takılmış olabilir.",
        value: (row) => (row.last_heartbeat_at ? new Date(row.last_heartbeat_at).getTime() : null),
        cell: (row) => (
          <span style={{ fontSize: "var(--sn-t-caption)", color: "var(--sn-ink-2)" }}>
            {relative(row.last_heartbeat_at)}
          </span>
        ),
      },
      {
        id: "actions",
        header: "",
        width: 186,
        cell: (row) =>
          can("TRADER") ? (
            /* Satır tıklaması detaya gider; düğmeler onu tetiklemesin. */
            <span className="flex items-center gap-1" onClick={(event) => event.stopPropagation()}>
              {/* Sessiz (`quiet`) değil: satır içinde zeminsiz bir düğme
                  metin sütunundan ayırt edilmiyor ve tıklanabilir olduğu
                  anlaşılmıyordu. */}
              {botEylemleri(row.state).map((verb) => (
                <Button
                  key={verb}
                  size="sm"
                  variant="neutral"
                  onClick={() => action.mutate({ id: row.id, verb })}
                >
                  {EYLEM_ETIKET[verb]}
                </Button>
              ))}
            </span>
          ) : null,
      },
    ],
    [can, action, egriler],
  );

  return (
    <Page
      title="Botlar"
      summary="Her bot bir strateji sürümünü kendi sermayesi ve zaman dilimiyle bağımsız çalıştırır."
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
            <p>
              Birden fazla bot aynı anda farklı ayarlarla çalışabilir — bu, ayarları
              karşılaştırmanın en dürüst yoludur çünkü ikisi de aynı piyasayı aynı anda görür.
            </p>
          </GuideSection>
          <GuideSection title="Nasıl okunur">
            <p>
              <strong>Bot arayüzden bağımsızdır.</strong> Paneli kapatmak, tarayıcıyı kapatmak ya
              da bilgisayarı kapatmak botu durdurmaz; bot sunucuda çalışır.
            </p>
            <p>
              <strong>Duraklat</strong> açık pozisyonları yönetmeye devam eder ama yeni giriş
              yapmaz. <strong>Durdur</strong> botu tamamen keser. <strong>Kısıtlı</strong> durumu
              bir devre kesicinin girişleri kapattığı anlamına gelir — bot çalışıyordur ama alım
              yapmaz.
            </p>
          </GuideSection>
          <GuideSection title="Ne yapabilirim">
            <p>
              Bir botun neden karar aldığını görmek için adına tıklayın; olay kayıtları, işlemleri
              ve performansı orada. Sistem genelindeki kayıtlar için Loglar sayfası.
            </p>
          </GuideSection>
        </>
      }
    >
      {bots.length > 0 && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Metric
            label="Çalışan bot"
            value={running}
            format={(value) => num(value, 0)}
            accent={bots.length > 0 && running === 0 ? "var(--sn-warn)" : undefined}
            sub={`${bots.length} bot kurulu`}
          />
          <Metric
            label="Toplam özsermaye"
            value={totalEquity}
            format={(value) => money(value)}
            accent="var(--sn-brand-solid)"
            sub={`başlangıç ${money(totalCapital)}`}
          />
          <Metric
            label="Toplam getiri"
            value={totalReturn}
            format={(value) => pctSigned(value)}
            accent={totalReturn >= 0 ? "var(--sn-up)" : "var(--sn-down)"}
            sub="birleşik başlangıç sermayesine göre"
          />
          <Metric
            label="Açık pozisyon"
            value={openPositions}
            format={(value) => num(value, 0)}
            sub="tüm botlarda"
          />
        </div>
      )}

      <Panel
        title="Maraton kolları"
        description="Koşan, kısıtlı ve durmuş kollar. Arşive kaldırılanlar aşağıda katlıdır."
        padded={false}
      >
        <Async
          query={query}
          empty={{
            title: "Henüz bot yok",
            hint: "Bot kurup başlatana kadar sistem hiçbir işlem açmaz. Bot kurmak için önce bir strateji sürümü gerekir.",
            action: can("TRADER") ? (
              <Button size="sm" variant="primary" onClick={() => setCreateOpen(true)}>
                İlk botu kur
              </Button>
            ) : undefined,
          }}
        >
          {() => (
            <DataGrid
              rows={kollar}
              columns={columns}
              rowKey={(row) => String(row.id)}
              storageKey="botlar"
              searchPlaceholder="Bot ara…"
              defaultSort={[{ id: "name", desc: false }]}
              emptyTitle="Koşan kol yok"
              emptyHint="Tüm botlar arşivde."
              footNote="Botlar sunucuda çalışır. Bu sayfayı kapatmak çalışan bir botu durdurmaz."
            />
          )}
        </Async>
      </Panel>

      {arsiv.length > 0 && (
        <Panel padded={false}>
          <Collapsible
            className="px-3"
            trigger={
              <span className="inline-flex items-baseline gap-1">
                Arşiv (<span className="sn-num">{arsiv.length}</span>)
              </span>
            }
          >
            <div className="-mx-3">
              <DataGrid
                rows={arsiv}
                columns={columns}
                rowKey={(row) => String(row.id)}
                storageKey="botlar-arsiv"
                searchPlaceholder="Arşivde ara…"
                defaultSort={[{ id: "name", desc: false }]}
                density="compact"
              />
            </div>
          </Collapsible>
        </Panel>
      )}

      <CreateBotModal open={createOpen} onClose={() => setCreateOpen(false)} />
    </Page>
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

        <p
          className="rounded-[var(--sn-r-sm)] px-3 py-2"
          style={{
            background: "var(--sn-sunken)",
            fontSize: "var(--sn-t-caption)",
            color: "var(--sn-ink-2)",
            lineHeight: 1.5,
          }}
        >
          Kararlar seçilen bar kapandığında alınır. Kapanmamış bir barın verisi karara girmez —
          bu, geçmiş testlerin dürüst kalması için zorunludur.
        </p>
      </div>
    </Modal>
  );
}
