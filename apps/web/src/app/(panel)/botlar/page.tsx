"use client";

/**
 * Botlar — çalışan işlem süreçleri.
 *
 * Bot arayüzden bağımsız bir servistir: paneli ya da terminali kapatmak
 * botu durdurmaz. Sayfa bunu açıkça yazar, çünkü tersini varsayan bir
 * kullanıcı sekmeyi kapatarak işlemleri durdurduğunu sanabilir.
 */

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Modal } from "@/ui";
import { api, type Bot, type Strategy } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { toast } from "@/lib/toast";
import { Page, Section, StatGrid, Async } from "@/components/common/page";
import { Stat, AmountText, Signed } from "@/components/common/amount";
import { InfoDot } from "@/components/common/explain";
import { BotStatePill } from "@/components/common/pills";
import { DataTable, type Column } from "@/components/data/data-table";
import { money, pctSigned, relative } from "@/lib/format";

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
    mutationFn: ({ id, verb }: { id: number; verb: string }) =>
      api.post(`/bots/${id}/${verb}`),
    onSuccess: (_d, v) => {
      const label =
        v.verb === "start"
          ? "başlatıldı"
          : v.verb === "pause"
            ? "duraklatıldı"
            : v.verb === "stop"
              ? "durduruldu"
              : "kapatıldı";
      toast.success(`Bot ${label}`);
      void qc.invalidateQueries({ queryKey: ["bots"] });
    },
    onError: (e: Error) => toast.error("İşlem yapılamadı", e.message),
  });

  const bots = query.data ?? [];
  const running = bots.filter((b) => b.state === "PAPER_RUNNING").length;
  const totalEquity = bots.reduce((s, b) => s + (b.equity ?? 0), 0);
  const totalCapital = bots.reduce((s, b) => s + b.capital, 0);
  const openPositions = bots.reduce((s, b) => s + b.open_positions, 0);

  const columns: Column<Bot>[] = [
    {
      key: "name",
      header: "Bot",
      sort: (r) => r.name,
      cell: (r) => (
        <Link href={`/botlar/${r.id}`} className="text-[13px] text-ink hover:text-brand">
          {r.name}
        </Link>
      ),
    },
    {
      key: "state",
      header: "Durum",
      width: "150px",
      term: "bot_durum",
      sort: (r) => r.state,
      cell: (r) => (
        <span className="flex flex-col gap-0.5">
          <BotStatePill state={r.state} />
          {r.halt_reason && (
            <span className="text-[11px] text-warn">{r.halt_reason}</span>
          )}
        </span>
      ),
    },
    {
      key: "timeframe",
      header: "Bar",
      width: "80px",
      term: "karar_bari",
      sort: (r) => r.timeframe,
      cell: (r) => <span className="font-mono text-[12px] text-ink-2">{r.timeframe}</span>,
    },
    {
      key: "equity",
      header: "Özsermaye",
      num: true,
      hint: "Nakit artı açık pozisyonların güncel karşılığı.",
      sort: (r) => r.equity,
      cell: (r) => <AmountText text={money(r.equity)} size="sm" />,
    },
    {
      key: "return",
      header: "Getiri",
      num: true,
      hint: "Başlangıç sermayesine göre toplam değişim.",
      sort: (r) => (r.equity !== null ? r.equity / r.capital - 1 : null),
      cell: (r) => {
        if (r.equity === null) return <span className="text-ink-3">—</span>;
        const ret = r.capital > 0 ? r.equity / r.capital - 1 : 0;
        return <Signed value={ret} text={pctSigned(ret)} size="sm" />;
      },
    },
    {
      key: "cash",
      header: "Nakit",
      num: true,
      defaultHidden: true,
      hint: "Pozisyona girmemiş, elde duran tutar.",
      sort: (r) => r.cash,
      cell: (r) => <AmountText text={money(r.cash)} size="sm" />,
    },
    {
      key: "open_positions",
      header: "Açık",
      num: true,
      hint: "Şu an piyasada duran pozisyon sayısı.",
      sort: (r) => r.open_positions,
      cell: (r) => r.open_positions,
    },
    {
      key: "heartbeat",
      header: "Yaşam sinyali",
      width: "130px",
      term: "heartbeat",
      sort: (r) => (r.last_heartbeat_at ? new Date(r.last_heartbeat_at).getTime() : null),
      cell: (r) => (
        <span className="text-[12px] text-ink-2">{relative(r.last_heartbeat_at)}</span>
      ),
    },
    {
      key: "actions",
      header: "",
      width: "190px",
      cell: (r) =>
        can("TRADER") ? (
          <span
            className="flex items-center gap-1"
            // Satır tıklaması detay açıyor; düğmeler onu tetiklemesin.
            onClick={(e) => e.stopPropagation()}
          >
            {r.state === "PAPER_RUNNING" ? (
              <>
                <Button
                  size="sm"
                  variant="ghost"
                  shape="rect"
                  onClick={() => action.mutate({ id: r.id, verb: "pause" })}
                >
                  Duraklat
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  shape="rect"
                  onClick={() => action.mutate({ id: r.id, verb: "stop" })}
                >
                  Durdur
                </Button>
              </>
            ) : (
              <Button
                size="sm"
                variant="outline"
                shape="rect"
                onClick={() => action.mutate({ id: r.id, verb: "start" })}
              >
                Başlat
              </Button>
            )}
          </span>
        ) : null,
    },
  ];

  return (
    <Page
      title="Botlar"
      description="Her bot bir strateji sürümünü kendi sermayesi ve zaman dilimiyle bağımsız çalıştırır."
      intro={{
        storageKey: "botlar",
        what: "Bir bot, seçilen strateji sürümünü belirli bir sermaye ve karar barıyla çalıştıran bağımsız bir süreçtir. Kendi nakdini, pozisyonlarını ve risk sayaçlarını taşır.\n\nBirden fazla bot aynı anda farklı ayarlarla çalışabilir — bu, ayarları karşılaştırmanın en dürüst yoludur çünkü ikisi de aynı piyasayı aynı anda görür.",
        how: "**Bot arayüzden bağımsızdır.** Paneli kapatmak, tarayıcıyı kapatmak ya da bilgisayarı kapatmak botu durdurmaz; bot sunucuda çalışır.\n\n**Duraklat** açık pozisyonları yönetmeye devam eder ama yeni giriş yapmaz. **Durdur** botu tamamen keser. **Kısıtlı** durumu bir devre kesicinin girişleri kapattığı anlamına gelir — bot çalışıyordur ama alım yapmaz.",
        action: "Bir botun neden karar aldığını görmek için adına tıklayın; olay kayıtları, işlemleri ve performansı orada. Sistem genelindeki kayıtlar için **Loglar** sayfası.",
        terms: ["bot", "bot_durum", "strateji_surum", "heartbeat", "devre_kesici", "kagit_uzeri"],
      }}
      actions={
        can("TRADER") && (
          <Button size="sm" variant="amber" shape="rect" onClick={() => setCreateOpen(true)}>
            Yeni bot
          </Button>
        )
      }
    >
      {bots.length > 0 && (
        <StatGrid cols={4}>
          <Stat
            label="Çalışan bot"
            hint="Karar alan ve pozisyon açabilen botlar. Çalışmayan bot hiçbir şey yapmaz."
            value={<AmountText text={`${running}`} size="xl" />}
            sub={`${bots.length} bot kurulu`}
            tone={bots.length > 0 && running === 0 ? "warn" : "neutral"}
          />
          <Stat
            label="Toplam özsermaye"
            hint="Tüm botların nakdi artı açık pozisyonlarının güncel karşılığı."
            value={<AmountText text={money(totalEquity)} size="xl" />}
            sub={`başlangıç ${money(totalCapital)}`}
          />
          <Stat
            label="Toplam getiri"
            hint="Tüm botların birleşik başlangıç sermayesine göre değişimi."
            value={
              <Signed
                value={totalCapital > 0 ? totalEquity / totalCapital - 1 : 0}
                text={pctSigned(totalCapital > 0 ? totalEquity / totalCapital - 1 : 0)}
                size="xl"
                arrow
              />
            }
          />
          <Stat
            label="Açık pozisyon"
            hint="Tüm botların şu an piyasada duran pozisyon sayısı."
            value={<AmountText text={`${openPositions}`} size="xl" />}
          />
        </StatGrid>
      )}

      <Section padded={false}>
        <Async
          query={query}
          empty={{
            title: "Henüz bot yok",
            description:
              "Bot kurup başlatana kadar sistem hiçbir işlem açmaz. Bot kurmak için önce bir strateji sürümü gerekir.",
            action: can("TRADER") ? (
              <Button size="sm" variant="amber" shape="rect" onClick={() => setCreateOpen(true)}>
                İlk botu kur
              </Button>
            ) : undefined,
          }}
        >
          {(list) => (
            <DataTable
              rows={list}
              columns={columns}
              rowKey={(r) => r.id}
              storageKey="botlar"
              searchText={(r) => `${r.name} ${r.state} ${r.timeframe}`}
              searchPlaceholder="Bot ara…"
              defaultSort={{ key: "name", dir: "asc" }}
              footNote={
                <span>
                  Botlar sunucuda çalışır. Bu sayfayı kapatmak çalışan bir botu durdurmaz.
                </span>
              }
            />
          )}
        </Async>
      </Section>

      {createOpen && <CreateBotModal onClose={() => setCreateOpen(false)} />}
    </Page>
  );
}

/* ------------------------------------------------------------------ */
/*  Yeni bot                                                           */
/* ------------------------------------------------------------------ */

function CreateBotModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [versionId, setVersionId] = useState<number | null>(null);
  const [capital, setCapital] = useState("5000");
  const [timeframe, setTimeframe] = useState("1h");

  const strategies = useQuery({
    queryKey: ["strategies"],
    queryFn: () => api.get<Strategy[]>("/strategies"),
  });

  /* Sürüm listesi düzleştirilir: kullanıcı stratejiyi değil, çalıştırılacak
     sürümü seçer — bot her zaman belirli bir sürüme bağlanır. */
  const versions = (strategies.data ?? []).flatMap((s) =>
    s.versions.map((v) => ({
      id: v.id,
      label: `${s.name} · sürüm ${v.version}${v.frozen ? " (donuk)" : ""}`,
      frozen: v.frozen,
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
    onError: (e: Error) => toast.error("Bot kurulamadı", e.message),
  });

  const valid = name.trim().length > 0 && versionId !== null && Number(capital) > 0;

  return (
    <Modal open onClose={onClose} label="Yeni bot" width="max-w-md">
      <div className="p-5">
        <h2 className="text-[15px] font-semibold text-ink">Yeni bot</h2>
        <p className="mt-1 text-[12.5px] leading-relaxed text-ink-2">
          Bot taslak olarak kurulur ve siz başlatana kadar hiçbir şey yapmaz.
        </p>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (valid) create.mutate();
          }}
          className="mt-4 space-y-3.5"
        >
          <label className="block">
            <span className="text-[12px] font-medium text-ink-2">Ad</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Örn. Muhafazakâr 1h"
              className="mt-1 h-9 w-full rounded-lg border border-line bg-inset px-2.5 text-[13px] text-ink placeholder:text-ink-3 focus:border-brand focus:outline-none"
            />
          </label>

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
            {versions.length === 0 && (
              <span className="mt-1 block text-[11.5px] text-warn">
                Hiç strateji sürümü yok. Önce Stratejiler sayfasından bir strateji oluşturun.
              </span>
            )}
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-[12px] font-medium text-ink-2">Sermaye (USD)</span>
              <input
                value={capital}
                onChange={(e) => setCapital(e.target.value)}
                inputMode="decimal"
                className="num mt-1 h-9 w-full rounded-lg border border-line bg-inset px-2.5 text-[13px] text-ink focus:border-brand focus:outline-none"
              />
            </label>

            <label className="block">
              <span className="flex items-center gap-1 text-[12px] font-medium text-ink-2">
                Karar barı
                <InfoDot id="karar_bari" align="start" />
              </span>
              <select
                value={timeframe}
                onChange={(e) => setTimeframe(e.target.value)}
                className="mt-1 h-9 w-full rounded-lg border border-line bg-inset px-2.5 text-[13px] text-ink focus:border-brand focus:outline-none"
              >
                {["15m", "1h", "4h", "1d"].map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <p className="rounded-lg bg-inset px-3 py-2 text-[11.5px] leading-relaxed text-ink-2">
            Kararlar seçilen bar kapandığında alınır. Kapanmamış bir barın verisi karara
            girmez — bu, geçmiş testlerin dürüst kalması için zorunludur.
          </p>

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" size="sm" variant="ghost" shape="rect" onClick={onClose}>
              Vazgeç
            </Button>
            <Button
              type="submit"
              size="sm"
              variant="amber"
              shape="rect"
              disabled={!valid || create.isPending}
            >
              {create.isPending ? "Kuruluyor…" : "Botu kur"}
            </Button>
          </div>
        </form>
      </div>
    </Modal>
  );
}
