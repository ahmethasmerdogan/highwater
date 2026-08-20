"use client";

/**
 * Loglar — sistemin ne yaptığını okunur cümlelerle anlatan sayfa.
 *
 * Botun, puanlamanın ve havuzun ürettiği her olay burada toplanır. Motor bu
 * olayları `universe_input_unavailable` gibi makine kodlarıyla ve ham JSON
 * yüklerle yazar; bu sayfa hepsini `lib/humanize.ts` üzerinden Türkçe
 * cümleye çevirir.
 *
 * **Düzeltilen kusur:** eski sayfa `/logs` yanıtından `at`, `symbol` ve
 * `message` alanlarını okuyordu — uç bu alanları hiç döndürmüyor
 * (`created_at`, `kind`, `payload` döndürüyor). Zaman ve mesaj sütunları bu
 * yüzden boş basılıyordu; tablo okunmaz olmasının sebebi buydu.
 */

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button, StatusPill, cx } from "@/ui";
import { api, type AuditEntry, type DataQualityEntry } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useLive, type LiveEvent } from "@/lib/ws";
import {
  CATEGORY_HINT,
  CATEGORY_LABEL,
  SEVERITY_LABEL,
  humanizeEvent,
  payloadFields,
  payloadSummary,
  readableCode,
  type LogCategory,
  type Severity,
} from "@/lib/humanize";
import { Page, Section, Empty, Async } from "@/components/common/page";
import { DataTable, type Column } from "@/components/data/data-table";
import { Drawer, DrawerSection } from "@/components/data/drawer";
import { Explain, Field, InfoDot, RichText, Term } from "@/components/common/explain";
import { dateTime, relative, time } from "@/lib/format";

/* ------------------------------------------------------------------ */
/*  Tipler                                                             */
/* ------------------------------------------------------------------ */

/** `/logs` ucunun gerçek yanıt gövdesi. */
interface BotEventRow {
  id: number;
  bot_id: number | null;
  kind: string;
  level: string;
  payload: Record<string, unknown>;
  created_at: string;
}

/** Akışta gösterilen birleşik satır — kayıtlı olay ya da canlı olay. */
interface StreamRow {
  id: string;
  at: string;
  kind: string;
  level: string;
  botId: number | null;
  symbol: string | null;
  payload: Record<string, unknown>;
  /** Canlı akıştan mı geldi? Kayıtlı olanla ayırt edilir. */
  live: boolean;
}

type Tab = "akis" | "kalite" | "denetim";

/* ------------------------------------------------------------------ */
/*  Sayfa                                                              */
/* ------------------------------------------------------------------ */

export default function LogsPage() {
  const { can } = useAuth();
  const isAdmin = can();
  const [tab, setTab] = useState<Tab>(isAdmin ? "akis" : "kalite");

  const tabs: { id: Tab; label: string; admin: boolean }[] = [
    { id: "akis", label: "Olay akışı", admin: true },
    { id: "kalite", label: "Veri kalitesi", admin: false },
    { id: "denetim", label: "Denetim kaydı", admin: true },
  ];
  const visibleTabs = tabs.filter((t) => !t.admin || isAdmin);

  return (
    <Page
      title="Loglar"
      description="Sistemin ne yaptığının kaydı: bot kararları, havuz yenilemeleri, veri sorunları ve yönetimsel işlemler."
      intro={{
        storageKey: "loglar",
        what: "Motorun ürettiği her olay burada toplanır. Bot bir pozisyon açtığında, havuz yenilendiğinde, bir devre kesici tetiklendiğinde ya da veri akışı koptuğunda buraya bir satır düşer.",
        how: "Her satır **ne olduğunu** tek cümleyle söyler. Satıra tıklayınca **ne anlama geldiği** ve gerekiyorsa **ne yapmanız gerektiği** açılır.\nSol taraftaki renkli işaret önem düzeyidir: gri bilgi, yeşil tamamlandı, turuncu uyarı, kırmızı hata.\nKategori etiketi olayın hangi alandan geldiğini söyler — havuz, puanlama, işlem, risk, veri, bağlantı, bot ya da sistem.",
        action: "Bir sorun ararken önce **Hata** ve **Uyarı** süzgecini açın. Tekrarlayan bir hata görüyorsanız satıra tıklayıp ayrıntısına bakın; çoğu kaydın altında ne yapılması gerektiği yazılıdır.",
        terms: ["devre_kesici", "havuz", "puan", "veri_tazeligi", "bosluk", "denetim_kaydi"],
      }}
    >
      {/* Sekmeler */}
      <div className="flex flex-wrap gap-1 border-b border-line">
        {visibleTabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cx(
              "-mb-px border-b-2 px-3 py-2 text-[13px] transition-colors",
              tab === t.id
                ? "border-brand font-medium text-ink"
                : "border-transparent text-ink-2 hover:text-ink",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "akis" && isAdmin && <EventStream />}
      {tab === "kalite" && <DataQuality />}
      {tab === "denetim" && isAdmin && <AuditTrail />}

      {!isAdmin && tab === "kalite" && (
        <p className="text-[12.5px] text-ink-3">
          Olay akışı ve denetim kaydı yalnızca yöneticilere açıktır.
        </p>
      )}
    </Page>
  );
}

/* ------------------------------------------------------------------ */
/*  Olay akışı                                                         */
/* ------------------------------------------------------------------ */

function EventStream() {
  const [severity, setSeverity] = useState<Severity | "all">("all");
  const [category, setCategory] = useState<LogCategory | "all">("all");
  const [selected, setSelected] = useState<StreamRow | null>(null);

  const { events: liveEvents, state: wsState } = useLive();

  const query = useQuery({
    queryKey: ["logs"],
    queryFn: () => api.get<BotEventRow[]>("/logs", { limit: 500 }),
    refetchInterval: 30_000,
  });

  /* Kayıtlı olaylar + canlı olaylar tek akışta birleşir. */
  const rows = useMemo<StreamRow[]>(() => {
    const stored: StreamRow[] = (query.data ?? []).map((e) => ({
      id: `db:${e.id}`,
      at: e.created_at,
      kind: e.kind,
      level: e.level,
      botId: e.bot_id,
      symbol: (e.payload?.symbol as string) ?? null,
      payload: e.payload ?? {},
      live: false,
    }));

    const live: StreamRow[] = liveEvents.map((e: LiveEvent, i) => ({
      id: `live:${e.at}:${i}`,
      at: e.at,
      kind: e.kind,
      level: e.level,
      botId: e.bot_id,
      symbol: e.symbol,
      payload: e.payload ?? {},
      live: true,
    }));

    /*
     * Canlı olay birazdan veritabanından da gelecek; ikisi birden görünmesin.
     * Aynı (tür, saniye, sembol) üçlüsü aynı olay sayılır.
     */
    const seen = new Set(stored.map((r) => `${r.kind}|${r.at.slice(0, 19)}|${r.symbol ?? ""}`));
    const freshLive = live.filter(
      (r) => !seen.has(`${r.kind}|${r.at.slice(0, 19)}|${r.symbol ?? ""}`),
    );

    return [...freshLive, ...stored].sort(
      (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime(),
    );
  }, [query.data, liveEvents]);

  const filtered = useMemo(
    () =>
      rows.filter((r) => {
        const h = humanizeEvent(r.kind, r.level, r.payload);
        if (severity !== "all" && h.severity !== severity) return false;
        if (category !== "all" && h.category !== category) return false;
        return true;
      }),
    [rows, severity, category],
  );

  const counts = useMemo(() => {
    const c = { info: 0, success: 0, warn: 0, error: 0 } as Record<Severity, number>;
    rows.forEach((r) => {
      c[humanizeEvent(r.kind, r.level, r.payload).severity] += 1;
    });
    return c;
  }, [rows]);

  const columns: Column<StreamRow>[] = [
    {
      key: "at",
      header: "Zaman",
      width: "150px",
      sort: (r) => new Date(r.at).getTime(),
      cell: (r) => (
        <span className="flex flex-col leading-tight">
          <span className="num text-[12px] text-ink">{time(r.at)}</span>
          <span className="text-[10.5px] text-ink-3">{relative(r.at)}</span>
        </span>
      ),
    },
    {
      key: "severity",
      header: "Önem",
      width: "90px",
      sort: (r) => humanizeEvent(r.kind, r.level, r.payload).severity,
      cell: (r) => <SeverityPill severity={humanizeEvent(r.kind, r.level, r.payload).severity} />,
    },
    {
      key: "category",
      header: "Kategori",
      width: "110px",
      sort: (r) => humanizeEvent(r.kind, r.level, r.payload).category,
      cell: (r) => {
        const c = humanizeEvent(r.kind, r.level, r.payload).category;
        return (
          <span className="inline-flex items-center gap-1 text-[12px] text-ink-2">
            {CATEGORY_LABEL[c]}
          </span>
        );
      },
    },
    {
      key: "event",
      header: "Ne oldu",
      cell: (r) => {
        const h = humanizeEvent(r.kind, r.level, r.payload);
        const message = typeof r.payload?.message === "string" ? r.payload.message : "";
        return (
          <span className="flex min-w-0 flex-col leading-tight">
            <span className="flex items-center gap-1.5 truncate text-[13px] text-ink">
              {h.title}
              {r.live && (
                <span className="shrink-0 rounded bg-brand-soft px-1 text-[9.5px] font-medium text-brand">
                  canlı
                </span>
              )}
            </span>
            <span className="truncate text-[11.5px] text-ink-3">
              {message || h.detail || payloadSummary(r.payload, 3)}
            </span>
          </span>
        );
      },
    },
    {
      key: "symbol",
      header: "Sembol",
      width: "110px",
      sort: (r) => r.symbol,
      cell: (r) =>
        r.symbol ? (
          <span className="font-mono text-[12px] text-ink-2">{r.symbol}</span>
        ) : (
          <span className="text-ink-3">—</span>
        ),
    },
    {
      key: "bot",
      header: "Bot",
      width: "70px",
      num: true,
      defaultHidden: true,
      sort: (r) => r.botId,
      cell: (r) => (r.botId === null ? "—" : `#${r.botId}`),
    },
    {
      key: "kind",
      header: "Olay kodu",
      width: "170px",
      defaultHidden: true,
      hint: "Motorun kullandığı makine kodu. Bir kaydı geliştiriciyle konuşurken bu kodu verin.",
      sort: (r) => r.kind,
      cell: (r) => <span className="font-mono text-[11px] text-ink-3">{r.kind}</span>,
    },
  ];

  return (
    <>
      <Section
        padded={false}
        title="Olay akışı"
        description="En yeni olay üstte. Canlı bağlantı açıkken yeni olaylar anında düşer."
        actions={
          <span className="flex items-center gap-1.5 text-[12px] text-ink-3">
            <span
              aria-hidden
              className={cx(
                "size-1.5 rounded-full",
                wsState === "open" ? "bg-up" : "bg-warn",
              )}
            />
            {wsState === "open" ? "canlı" : "bağlantı yok"}
          </span>
        }
      >
        {/* Süzgeçler */}
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2.5">
          <div className="flex flex-wrap items-center gap-1">
            <span className="mr-1 text-[11.5px] text-ink-3">Önem:</span>
            <FilterChip active={severity === "all"} onClick={() => setSeverity("all")}>
              Hepsi
            </FilterChip>
            {(["error", "warn", "success", "info"] as Severity[]).map((s) => (
              <FilterChip key={s} active={severity === s} onClick={() => setSeverity(s)}>
                {SEVERITY_LABEL[s]}
                <span className="num ml-1 text-[10.5px] opacity-60">{counts[s]}</span>
              </FilterChip>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-1">
            <span className="mr-1 ml-2 text-[11.5px] text-ink-3">Kategori:</span>
            <FilterChip active={category === "all"} onClick={() => setCategory("all")}>
              Hepsi
            </FilterChip>
            {(Object.keys(CATEGORY_LABEL) as LogCategory[]).map((c) => (
              <FilterChip
                key={c}
                active={category === c}
                onClick={() => setCategory(c)}
                title={CATEGORY_HINT[c]}
              >
                {CATEGORY_LABEL[c]}
              </FilterChip>
            ))}
          </div>
        </div>

        <Async
          query={query}
          empty={{
            title: "Henüz olay yok",
            description:
              "Sistem çalışmaya başladığında bot kararları, havuz yenilemeleri ve veri olayları burada görünecek.",
          }}
        >
          {() =>
            filtered.length === 0 ? (
              <Empty
                title="Süzgece uyan olay yok"
                description="Seçili önem ya da kategori için kayıt bulunamadı. Süzgeçleri gevşetip yeniden bakın."
                className="m-4 border-0"
              />
            ) : (
              <DataTable
                rows={filtered}
                columns={columns}
                rowKey={(r) => r.id}
                onRowClick={setSelected}
                storageKey="loglar-akis"
                searchText={(r) => {
                  const h = humanizeEvent(r.kind, r.level, r.payload);
                  return `${h.title} ${r.kind} ${r.symbol ?? ""} ${payloadSummary(r.payload, 8)}`;
                }}
                searchPlaceholder="Olay, sembol ya da mesaj ara…"
                defaultSort={{ key: "at", dir: "desc" }}
                pageSize={60}
                dense
                footNote={`Son ${rows.length} olay gösteriliyor.`}
              />
            )
          }
        </Async>
      </Section>

      <EventDrawer row={selected} onClose={() => setSelected(null)} />
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Olay detayı                                                        */
/* ------------------------------------------------------------------ */

function EventDrawer({ row, onClose }: { row: StreamRow | null; onClose: () => void }) {
  if (!row) return null;
  const h = humanizeEvent(row.kind, row.level, row.payload);
  const fields = payloadFields(row.payload);
  const message = typeof row.payload?.message === "string" ? row.payload.message : "";

  return (
    <Drawer
      open
      onClose={onClose}
      title={h.title}
      subtitle={`${dateTime(row.at)} · ${relative(row.at)}`}
      badge={<SeverityPill severity={h.severity} />}
    >
      <DrawerSection title="Ne oldu">
        <div className="rounded-lg border border-line bg-elev px-3.5 py-3 text-[13px] leading-relaxed text-ink-2">
          {message ? <RichText text={message} /> : h.detail ? <RichText text={h.detail} /> : "—"}
        </div>
      </DrawerSection>

      {message && h.detail && (
        <DrawerSection title="Ne anlama geliyor">
          <RichText text={h.detail} className="text-[13px]" />
        </DrawerSection>
      )}

      {h.action && (
        <DrawerSection title="Ne yapmalı">
          <p className="border-l-2 border-brand pl-3 text-[13px] leading-relaxed text-ink-2">
            {h.action}
          </p>
        </DrawerSection>
      )}

      {h.term && (
        <DrawerSection title="İlgili kavram">
          <div className="rounded-lg border border-line bg-elev px-3.5 py-3">
            <Explain id={h.term} />
          </div>
        </DrawerSection>
      )}

      <DrawerSection
        title="Ayrıntılar"
        description="Olayla birlikte kaydedilen değerler."
      >
        {fields.length === 0 ? (
          <p className="text-[13px] text-ink-3">Bu olay ek bir değer taşımıyor.</p>
        ) : (
          <div className="divide-y divide-line rounded-lg border border-line px-3.5">
            {fields.map((f) => (
              <Field
                key={f.key}
                label={f.label}
                term={f.term}
                value={<span className="font-mono text-[12.5px]">{f.value}</span>}
              />
            ))}
          </div>
        )}
      </DrawerSection>

      <DrawerSection title="Künye">
        <div className="divide-y divide-line rounded-lg border border-line px-3.5">
          <Field
            label="Olay kodu"
            hint="Motorun kullandığı makine kodu. Bir kaydı geliştiriciyle konuşurken bunu verin."
            value={<span className="font-mono text-[12px]">{row.kind}</span>}
          />
          <Field label="Kategori" value={CATEGORY_LABEL[h.category]} />
          <Field label="Kaynak" value={row.live ? "Canlı akış" : "Veritabanı"} />
          {row.botId !== null && <Field label="Bot" value={`#${row.botId}`} />}
          {row.symbol && (
            <Field label="Sembol" value={<span className="font-mono">{row.symbol}</span>} />
          )}
        </div>
      </DrawerSection>
    </Drawer>
  );
}

/* ------------------------------------------------------------------ */
/*  Veri kalitesi                                                      */
/* ------------------------------------------------------------------ */

function DataQuality() {
  const [onlyOpen, setOnlyOpen] = useState(true);
  const [selected, setSelected] = useState<DataQualityEntry | null>(null);

  const query = useQuery({
    queryKey: ["data-quality"],
    queryFn: () => api.get<DataQualityEntry[]>("/data-quality", { limit: 500 }),
    refetchInterval: 60_000,
  });

  const rows = useMemo(
    () => (query.data ?? []).filter((r) => (onlyOpen ? !r.resolved : true)),
    [query.data, onlyOpen],
  );

  const columns: Column<DataQualityEntry>[] = [
    {
      key: "created_at",
      header: "Bulunma zamanı",
      width: "160px",
      sort: (r) => new Date(r.created_at).getTime(),
      cell: (r) => <span className="num text-[12px]">{dateTime(r.created_at)}</span>,
    },
    {
      key: "kind",
      header: "Tür",
      width: "130px",
      sort: (r) => r.kind,
      cell: (r) => <QualityKind kind={r.kind} />,
    },
    {
      key: "symbol",
      header: "Sembol",
      width: "120px",
      sort: (r) => r.symbol,
      cell: (r) => <span className="font-mono text-[12px]">{r.symbol || "—"}</span>,
    },
    {
      key: "timeframe",
      header: "Zaman dilimi",
      width: "110px",
      term: "karar_bari",
      sort: (r) => r.timeframe,
      cell: (r) => <span className="font-mono text-[12px] text-ink-2">{r.timeframe}</span>,
    },
    {
      key: "severity",
      header: "Önem",
      width: "90px",
      sort: (r) => r.severity,
      cell: (r) => (
        <StatusPill size="sm" tone={r.severity === "ERROR" ? "red" : "orange"}>
          {r.severity === "ERROR" ? "Hata" : "Uyarı"}
        </StatusPill>
      ),
    },
    {
      key: "resolved",
      header: "Durum",
      width: "100px",
      sort: (r) => (r.resolved ? 1 : 0),
      cell: (r) => (
        <StatusPill size="sm" tone={r.resolved ? "green" : "gray"}>
          {r.resolved ? "Kapandı" : "Açık"}
        </StatusPill>
      ),
    },
    {
      key: "detail",
      header: "Ayrıntı",
      cell: (r) => (
        <span className="truncate text-[12px] text-ink-2">{payloadSummary(r.detail, 3)}</span>
      ),
    },
  ];

  const openCount = (query.data ?? []).filter((r) => !r.resolved).length;

  return (
    <>
      <Section
        padded={false}
        title="Veri kalitesi"
        term="veri_tazeligi"
        description="Piyasa verisindeki eksik mumlar ve alışılmadık hareketler. Boşluklar otomatik olarak yeniden çekilir."
        actions={
          <Button
            size="sm"
            variant={onlyOpen ? "outline" : "ghost"}
            shape="rect"
            onClick={() => setOnlyOpen((v) => !v)}
          >
            {onlyOpen ? "Yalnızca açık" : "Hepsi"}
          </Button>
        }
      >
        <div className="border-b border-line px-4 py-2.5 text-[12.5px] text-ink-2">
          {openCount === 0 ? (
            "Açık bulgu yok — izlenen tüm zaman dilimleri güncel görünüyor."
          ) : (
            <>
              <strong className="font-medium text-ink">{openCount} açık bulgu</strong> var.
              Bunların çoğu <Term id="aykiri_deger" /> olabilir: küçük hacimli coinlerde
              görülen büyük günlük hareketler veri hatası değil, gerçek piyasa hareketidir ve
              kendiliğinden kapanmaz.
            </>
          )}
        </div>

        <Async
          query={query}
          empty={{
            title: "Kalite bulgusu yok",
            description: "Veri akışında eksik mum ya da aykırı değer tespit edilmedi.",
          }}
        >
          {() =>
            rows.length === 0 ? (
              <Empty
                title="Açık bulgu yok"
                description="Tüm veri kalitesi bulguları kapanmış durumda. Kapananları görmek için süzgeci kaldırın."
                className="m-4 border-0"
              />
            ) : (
              <DataTable
                rows={rows}
                columns={columns}
                rowKey={(r) => r.id}
                onRowClick={setSelected}
                storageKey="loglar-kalite"
                searchText={(r) => `${r.symbol} ${r.kind} ${r.timeframe}`}
                searchPlaceholder="Sembol ya da tür ara…"
                defaultSort={{ key: "created_at", dir: "desc" }}
                dense
              />
            )
          }
        </Async>
      </Section>

      {selected && (
        <Drawer
          open
          onClose={() => setSelected(null)}
          title={`${selected.symbol || "Sistem"} · ${selected.timeframe}`}
          subtitle={dateTime(selected.created_at)}
          badge={
            <StatusPill size="sm" tone={selected.resolved ? "green" : "gray"}>
              {selected.resolved ? "Kapandı" : "Açık"}
            </StatusPill>
          }
        >
          <DrawerSection title="Ne bulundu">
            <QualityExplanation entry={selected} />
          </DrawerSection>

          <DrawerSection title="Ayrıntılar">
            <div className="divide-y divide-line rounded-lg border border-line px-3.5">
              {payloadFields(selected.detail).map((f) => (
                <Field
                  key={f.key}
                  label={f.label}
                  term={f.term}
                  value={<span className="font-mono text-[12.5px]">{f.value}</span>}
                />
              ))}
            </div>
          </DrawerSection>
        </Drawer>
      )}
    </>
  );
}

function QualityKind({ kind }: { kind: string }) {
  const label =
    kind === "gap" ? "Veri boşluğu" : kind === "outlier" ? "Aykırı değer" : readableCode(kind);
  const term = kind === "gap" ? "bosluk" : kind === "outlier" ? "aykiri_deger" : undefined;
  return (
    <span className="inline-flex items-center gap-1 text-[12px] text-ink">
      {label}
      {term && <InfoDot id={term} align="start" />}
    </span>
  );
}

function QualityExplanation({ entry }: { entry: DataQualityEntry }) {
  const text =
    entry.kind === "gap"
      ? "Olması gereken bazı mumlar veri akışında yok. Sistem bunları borsadan yeniden çekmeyi dener; başarılı olursa kayıt kapanır.\n\nBoşluk sürekli tekrarlıyorsa o sembolün akışında gerçek bir sorun vardır."
      : entry.kind === "outlier"
        ? "Bu mumda alışılmadık büyüklükte bir fiyat hareketi var. **Çoğu zaman bu bir veri hatası değildir** — küçük hacimli coinlerde tek günde yüzde yüzü aşan hareketler gerçekten olur.\n\nBu tür kayıtlar kendiliğinden kapanmaz: geçmişteki bir mumun özelliği sonradan düzelmez."
        : "Veri denetimi bu kaydı üretti.";

  return <RichText text={text} className="text-[13px]" />;
}

/* ------------------------------------------------------------------ */
/*  Denetim kaydı                                                      */
/* ------------------------------------------------------------------ */

function AuditTrail() {
  const query = useQuery({
    queryKey: ["audit"],
    queryFn: () => api.get<AuditEntry[]>("/audit", { limit: 500 }),
    refetchInterval: 60_000,
  });

  const columns: Column<AuditEntry>[] = [
    {
      key: "created_at",
      header: "Zaman",
      width: "160px",
      sort: (r) => new Date(r.created_at).getTime(),
      cell: (r) => <span className="num text-[12px]">{dateTime(r.created_at)}</span>,
    },
    {
      key: "user_id",
      header: "Kullanıcı",
      width: "100px",
      num: true,
      sort: (r) => r.user_id,
      cell: (r) => (r.user_id === null ? "sistem" : `#${r.user_id}`),
    },
    {
      key: "action",
      header: "Eylem",
      width: "190px",
      sort: (r) => r.action,
      cell: (r) => <span className="text-[12.5px] text-ink">{readableCode(r.action)}</span>,
    },
    {
      key: "target",
      header: "Hedef",
      width: "150px",
      sort: (r) => r.target,
      cell: (r) => <span className="font-mono text-[12px] text-ink-2">{r.target || "—"}</span>,
    },
    {
      key: "payload",
      header: "Ayrıntı",
      cell: (r) => (
        <span className="truncate text-[12px] text-ink-2">{payloadSummary(r.payload, 4)}</span>
      ),
    },
    {
      key: "ip",
      header: "IP",
      width: "130px",
      defaultHidden: true,
      sort: (r) => r.ip,
      cell: (r) => <span className="font-mono text-[11.5px] text-ink-3">{r.ip || "—"}</span>,
    },
  ];

  return (
    <Section
      padded={false}
      title="Denetim kaydı"
      term="denetim_kaydi"
      description="Her yönetimsel işlem burada tutulur: kim, ne zaman, neyi değiştirdi ve hangi IP'den."
    >
      <Async
        query={query}
        empty={{
          title: "Denetim kaydı boş",
          description: "Henüz kaydedilmiş bir yönetimsel işlem yok.",
        }}
      >
        {(rows) => (
          <DataTable
            rows={rows}
            columns={columns}
            rowKey={(r) => r.id}
            storageKey="loglar-denetim"
            searchText={(r) => `${r.action} ${r.target} ${r.ip}`}
            searchPlaceholder="Eylem, hedef ya da IP ara…"
            defaultSort={{ key: "created_at", dir: "desc" }}
            dense
          />
        )}
      </Async>
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/*  Küçük parçalar                                                     */
/* ------------------------------------------------------------------ */

function SeverityPill({ severity }: { severity: Severity }) {
  const tone =
    severity === "error"
      ? "red"
      : severity === "warn"
        ? "orange"
        : severity === "success"
          ? "green"
          : "gray";
  return (
    <StatusPill size="sm" tone={tone}>
      {SEVERITY_LABEL[severity]}
    </StatusPill>
  );
}

function FilterChip({
  active,
  onClick,
  title,
  children,
}: {
  active: boolean;
  onClick: () => void;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cx(
        "rounded-md border px-2 py-0.5 text-[11.5px] transition-colors",
        active
          ? "border-brand bg-brand-soft font-medium text-brand"
          : "border-line text-ink-2 hover:border-line-strong hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}
