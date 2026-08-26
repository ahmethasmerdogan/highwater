"use client";

/**
 * Loglar — sistemin ne yaptığını okunur cümlelerle anlatan sayfa.
 *
 * Botun, puanlamanın ve havuzun ürettiği her olay burada toplanır. Motor bu
 * olayları `universe_input_unavailable` gibi makine kodlarıyla ve ham JSON
 * yüklerle yazar; bu sayfa hepsini `lib/humanize.ts` üzerinden Türkçe
 * cümleye çevirir.
 *
 * Uç `at`, `symbol` ve `message` değil `created_at`, `kind` ve `payload`
 * döndürür — bu ayrım bir kez gözden kaçtı ve zaman/mesaj sütunları boş
 * basıldı. Alan adları burada tek yerde eşlenir (`StreamRow`).
 */

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
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
import { dateTime, relative, time } from "@/lib/format";
import { Page, GuideSection } from "@/shell/page";
import {
  Async,
  Button,
  Chip,
  Dot,
  Drawer,
  DrawerSection,
  Empty,
  Explain,
  Field,
  InfoDot,
  NumText,
  Panel,
  RichText,
  Segmented,
  Tag,
  Term,
  type Tone,
} from "@/design";
import { DataGrid } from "@/grid/data-grid";
import type { GridColumn } from "@/grid/types";

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

const SEVERITY_TONE: Record<Severity, Tone> = {
  error: "down",
  warn: "warn",
  success: "up",
  info: "neutral",
};

/* ------------------------------------------------------------------ */
/*  Sayfa                                                              */
/* ------------------------------------------------------------------ */

export default function LogsPage() {
  const { can } = useAuth();
  const isAdmin = can();
  const [tab, setTab] = useState<Tab>(isAdmin ? "akis" : "kalite");

  const tabs = ([
    { value: "akis", label: "Olay akışı", admin: true },
    { value: "kalite", label: "Veri kalitesi", admin: false },
    { value: "denetim", label: "Denetim kaydı", admin: true },
  ] as { value: Tab; label: string; admin: boolean }[]).filter(
    (entry) => !entry.admin || isAdmin,
  );

  return (
    <Page
      title="Loglar"
      summary="Sistemin ne yaptığının kaydı: bot kararları, havuz yenilemeleri, veri sorunları ve yönetimsel işlemler."
      guide={
        <>
          <GuideSection title="Ne gösteriyor">
            <p>
              Motorun ürettiği her olay burada toplanır. Bot bir pozisyon açtığında, havuz
              yenilendiğinde, bir devre kesici tetiklendiğinde ya da veri akışı koptuğunda buraya
              bir satır düşer.
            </p>
          </GuideSection>
          <GuideSection title="Nasıl okunur">
            <p>
              Her satır <strong>ne olduğunu</strong> tek cümleyle söyler. Satıra tıklayınca{" "}
              <strong>ne anlama geldiği</strong> ve gerekiyorsa{" "}
              <strong>ne yapmanız gerektiği</strong> açılır.
            </p>
            <p>
              Önem sütunu: gri bilgi, yeşil tamamlandı, turuncu uyarı, kırmızı hata. Kategori
              etiketi olayın hangi alandan geldiğini söyler — havuz, puanlama, işlem, risk, veri,
              bağlantı, bot ya da sistem.
            </p>
          </GuideSection>
          <GuideSection title="Ne yapabilirim">
            <p>
              Bir sorun ararken önce Hata ve Uyarı süzgecini açın. Tekrarlayan bir hata
              görüyorsanız satıra tıklayıp ayrıntısına bakın; çoğu kaydın altında ne yapılması
              gerektiği yazılıdır.
            </p>
          </GuideSection>
        </>
      }
    >
      <Segmented value={tab} onChange={setTab} options={tabs} />

      {tab === "akis" && isAdmin && <EventStream />}
      {tab === "kalite" && <DataQuality />}
      {tab === "denetim" && isAdmin && <AuditTrail />}

      {!isAdmin && (
        <p style={{ fontSize: "var(--sn-t-caption)", color: "var(--sn-ink-3)" }}>
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
    const stored: StreamRow[] = (query.data ?? []).map((event) => ({
      id: `db:${event.id}`,
      at: event.created_at,
      kind: event.kind,
      level: event.level,
      botId: event.bot_id,
      symbol: (event.payload?.symbol as string) ?? null,
      payload: event.payload ?? {},
      live: false,
    }));

    const live: StreamRow[] = liveEvents.map((event: LiveEvent, index) => ({
      id: `live:${event.at}:${index}`,
      at: event.at,
      kind: event.kind,
      level: event.level,
      botId: event.bot_id,
      symbol: event.symbol,
      payload: event.payload ?? {},
      live: true,
    }));

    /* Canlı olay birazdan veritabanından da gelecek; ikisi birden
       görünmesin. Aynı (tür, saniye, sembol) üçlüsü aynı olay sayılır. */
    const seen = new Set(stored.map((row) => `${row.kind}|${row.at.slice(0, 19)}|${row.symbol ?? ""}`));
    const freshLive = live.filter(
      (row) => !seen.has(`${row.kind}|${row.at.slice(0, 19)}|${row.symbol ?? ""}`),
    );

    return [...freshLive, ...stored].sort(
      (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime(),
    );
  }, [query.data, liveEvents]);

  const filtered = useMemo(
    () =>
      rows.filter((row) => {
        const human = humanizeEvent(row.kind, row.level, row.payload);
        if (severity !== "all" && human.severity !== severity) return false;
        if (category !== "all" && human.category !== category) return false;
        return true;
      }),
    [rows, severity, category],
  );

  const counts = useMemo(() => {
    const tally = { info: 0, success: 0, warn: 0, error: 0 } as Record<Severity, number>;
    rows.forEach((row) => {
      tally[humanizeEvent(row.kind, row.level, row.payload).severity] += 1;
    });
    return tally;
  }, [rows]);

  const columns = useMemo<GridColumn<StreamRow>[]>(
    () => [
      {
        id: "at",
        header: "Zaman",
        width: 128,
        pin: true,
        value: (row) => new Date(row.at).getTime(),
        cell: (row) => (
          <span className="flex flex-col leading-tight">
            <span className="sn-num" style={{ fontSize: "var(--sn-t-caption)", color: "var(--sn-ink)" }}>
              {time(row.at)}
            </span>
            <span style={{ fontSize: 10, color: "var(--sn-ink-3)" }}>{relative(row.at)}</span>
          </span>
        ),
      },
      {
        id: "severity",
        header: "Önem",
        width: 96,
        value: (row) => humanizeEvent(row.kind, row.level, row.payload).severity,
        cell: (row) => {
          const level = humanizeEvent(row.kind, row.level, row.payload).severity;
          return <Tag tone={SEVERITY_TONE[level]}>{SEVERITY_LABEL[level]}</Tag>;
        },
      },
      {
        id: "category",
        header: "Kategori",
        width: 112,
        value: (row) => humanizeEvent(row.kind, row.level, row.payload).category,
        cell: (row) => (
          <span style={{ fontSize: "var(--sn-t-caption)", color: "var(--sn-ink-2)" }}>
            {CATEGORY_LABEL[humanizeEvent(row.kind, row.level, row.payload).category]}
          </span>
        ),
      },
      {
        id: "event",
        header: "Ne oldu",
        width: 460,
        value: (row) => humanizeEvent(row.kind, row.level, row.payload).title,
        search: (row) => {
          const human = humanizeEvent(row.kind, row.level, row.payload);
          return `${human.title} ${row.kind} ${row.symbol ?? ""} ${payloadSummary(row.payload, 8)}`;
        },
        cell: (row) => {
          const human = humanizeEvent(row.kind, row.level, row.payload);
          const message = typeof row.payload?.message === "string" ? row.payload.message : "";
          return (
            <span className="flex min-w-0 flex-col leading-tight">
              <span
                className="flex items-center gap-1.5 truncate"
                style={{ fontSize: "var(--sn-t-body)", color: "var(--sn-ink)" }}
              >
                {human.title}
                {row.live && <Tag tone="brand">canlı</Tag>}
              </span>
              <span
                className="truncate"
                style={{ fontSize: "var(--sn-t-caption)", color: "var(--sn-ink-3)" }}
              >
                {message || human.detail || payloadSummary(row.payload, 3)}
              </span>
            </span>
          );
        },
      },
      {
        id: "symbol",
        header: "Sembol",
        width: 112,
        value: (row) => row.symbol,
        cell: (row) =>
          row.symbol ? (
            <span className="sn-num" style={{ fontSize: "var(--sn-t-caption)", color: "var(--sn-ink-2)" }}>
              {row.symbol}
            </span>
          ) : (
            <span style={{ color: "var(--sn-ink-4)" }}>—</span>
          ),
      },
      {
        id: "bot",
        header: "Bot",
        width: 74,
        num: true,
        hidden: true,
        value: (row) => row.botId,
        cell: (row) => <NumText text={row.botId === null ? "—" : `#${row.botId}`} size="sm" />,
      },
      {
        id: "kind",
        header: "Olay kodu",
        width: 190,
        hidden: true,
        hint: "Motorun kullandığı makine kodu. Bir kaydı geliştiriciyle konuşurken bu kodu verin.",
        value: (row) => row.kind,
        cell: (row) => (
          <span className="sn-num" style={{ fontSize: "var(--sn-t-micro)", color: "var(--sn-ink-3)" }}>
            {row.kind}
          </span>
        ),
      },
    ],
    [],
  );

  return (
    <>
      <Panel
        padded={false}
        title="Olay akışı"
        description="En yeni olay üstte. Canlı bağlantı açıkken yeni olaylar anında düşer."
        actions={
          <span
            className="flex items-center gap-1.5"
            style={{ fontSize: "var(--sn-t-caption)", color: "var(--sn-ink-3)" }}
          >
            <Dot tone={wsState === "open" ? "up" : "warn"} pulse={wsState === "open"} />
            {wsState === "open" ? "canlı" : "bağlantı yok"}
          </span>
        }
      >
        <div
          className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2.5"
          style={{ borderBottom: "1px solid var(--sn-hairline)" }}
        >
          <div className="flex flex-wrap items-center gap-1">
            <span
              className="mr-1"
              style={{ fontSize: "var(--sn-t-caption)", color: "var(--sn-ink-3)" }}
            >
              Önem:
            </span>
            <Chip active={severity === "all"} onClick={() => setSeverity("all")}>
              Hepsi
            </Chip>
            {(["error", "warn", "success", "info"] as Severity[]).map((level) => (
              <Chip key={level} active={severity === level} onClick={() => setSeverity(level)}>
                {SEVERITY_LABEL[level]}
                <span className="sn-num" style={{ fontSize: 10, opacity: 0.65 }}>
                  {counts[level]}
                </span>
              </Chip>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-1">
            <span
              className="mr-1"
              style={{ fontSize: "var(--sn-t-caption)", color: "var(--sn-ink-3)" }}
            >
              Kategori:
            </span>
            <Chip active={category === "all"} onClick={() => setCategory("all")}>
              Hepsi
            </Chip>
            {(Object.keys(CATEGORY_LABEL) as LogCategory[]).map((key) => (
              <Chip
                key={key}
                active={category === key}
                onClick={() => setCategory(key)}
                title={CATEGORY_HINT[key]}
              >
                {CATEGORY_LABEL[key]}
              </Chip>
            ))}
          </div>
        </div>

        <Async
          query={query}
          empty={{
            title: "Henüz olay yok",
            hint: "Sistem çalışmaya başladığında bot kararları, havuz yenilemeleri ve veri olayları burada görünecek.",
          }}
        >
          {() =>
            filtered.length === 0 ? (
              <Empty
                title="Süzgece uyan olay yok"
                hint="Seçili önem ya da kategori için kayıt bulunamadı. Süzgeçleri gevşetip yeniden bakın."
              />
            ) : (
              <DataGrid
                rows={filtered}
                columns={columns}
                rowKey={(row) => row.id}
                onRowClick={setSelected}
                storageKey="loglar-akis"
                searchPlaceholder="Olay, sembol ya da mesaj ara…"
                defaultSort={[{ id: "at", desc: true }]}
                density="compact"
                maxHeight={640}
                footNote={`Son ${rows.length} olay gösteriliyor.`}
              />
            )
          }
        </Async>
      </Panel>

      <EventDrawer row={selected} onClose={() => setSelected(null)} />
    </>
  );
}

/* ------------------------------------------------------------------ */

function EventDrawer({ row, onClose }: { row: StreamRow | null; onClose: () => void }) {
  if (!row) return null;
  const human = humanizeEvent(row.kind, row.level, row.payload);
  const fields = payloadFields(row.payload);
  const message = typeof row.payload?.message === "string" ? row.payload.message : "";

  return (
    <Drawer
      open
      onClose={onClose}
      title={human.title}
      subtitle={`${dateTime(row.at)} · ${relative(row.at)}`}
      badge={<Tag tone={SEVERITY_TONE[human.severity]}>{SEVERITY_LABEL[human.severity]}</Tag>}
    >
      <DrawerSection title="Ne oldu">
        <div
          className="rounded-[var(--sn-r-sm)] px-3.5 py-3"
          style={{
            background: "var(--sn-raised)",
            border: "1px solid var(--sn-hairline)",
            fontSize: "var(--sn-t-body)",
            color: "var(--sn-ink-2)",
            lineHeight: 1.55,
          }}
        >
          {message ? <RichText text={message} /> : human.detail ? <RichText text={human.detail} /> : "—"}
        </div>
      </DrawerSection>

      {message && human.detail && (
        <DrawerSection title="Ne anlama geliyor">
          <RichText text={human.detail} className="block text-[length:var(--sn-t-body)]" />
        </DrawerSection>
      )}

      {human.action && (
        <DrawerSection title="Ne yapmalı">
          <p
            className="pl-3"
            style={{
              borderLeft: "2px solid var(--sn-brand-solid)",
              fontSize: "var(--sn-t-body)",
              color: "var(--sn-ink-2)",
              lineHeight: 1.55,
            }}
          >
            {human.action}
          </p>
        </DrawerSection>
      )}

      {human.term && (
        <DrawerSection title="İlgili kavram">
          <Explain id={human.term} />
        </DrawerSection>
      )}

      <DrawerSection title="Ayrıntılar" hint="Olayla birlikte kaydedilen değerler.">
        {fields.length === 0 ? (
          <p style={{ fontSize: "var(--sn-t-body)", color: "var(--sn-ink-3)" }}>
            Bu olay ek bir değer taşımıyor.
          </p>
        ) : (
          <div className="flex flex-col">
            {fields.map((field) => (
              <Field
                key={field.key}
                label={field.label}
                term={field.term}
                value={<span className="sn-num">{field.value}</span>}
              />
            ))}
          </div>
        )}
      </DrawerSection>

      <DrawerSection title="Künye">
        <div className="flex flex-col">
          <Field
            label="Olay kodu"
            hint="Motorun kullandığı makine kodu. Bir kaydı geliştiriciyle konuşurken bunu verin."
            value={<span className="sn-num">{row.kind}</span>}
          />
          <Field label="Kategori" value={CATEGORY_LABEL[human.category]} />
          <Field label="Kaynak" value={row.live ? "Canlı akış" : "Veritabanı"} />
          {row.botId !== null && <Field label="Bot" value={`#${row.botId}`} />}
          {row.symbol && <Field label="Sembol" value={<span className="sn-num">{row.symbol}</span>} />}
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
    () => (query.data ?? []).filter((row) => (onlyOpen ? !row.resolved : true)),
    [query.data, onlyOpen],
  );

  const columns = useMemo<GridColumn<DataQualityEntry>[]>(
    () => [
      {
        id: "created_at",
        header: "Bulunma zamanı",
        width: 162,
        pin: true,
        value: (row) => new Date(row.created_at).getTime(),
        cell: (row) => <NumText text={dateTime(row.created_at)} size="sm" />,
      },
      {
        id: "kind",
        header: "Tür",
        width: 140,
        value: (row) => row.kind,
        cell: (row) => <QualityKind kind={row.kind} />,
      },
      {
        id: "symbol",
        header: "Sembol",
        width: 122,
        value: (row) => row.symbol,
        search: (row) => `${row.symbol} ${row.kind} ${row.timeframe}`,
        cell: (row) => (
          <span className="sn-num" style={{ fontSize: "var(--sn-t-caption)" }}>
            {row.symbol || "—"}
          </span>
        ),
      },
      {
        id: "timeframe",
        header: "Zaman dilimi",
        width: 116,
        hint: "Bu bulgunun hangi mum çözünürlüğünde tespit edildiği.",
        value: (row) => row.timeframe,
        cell: (row) => (
          <span className="sn-num" style={{ fontSize: "var(--sn-t-caption)", color: "var(--sn-ink-2)" }}>
            {row.timeframe}
          </span>
        ),
      },
      {
        id: "severity",
        header: "Önem",
        width: 94,
        value: (row) => row.severity,
        cell: (row) => (
          <Tag tone={row.severity === "ERROR" ? "down" : "warn"}>
            {row.severity === "ERROR" ? "Hata" : "Uyarı"}
          </Tag>
        ),
      },
      {
        id: "resolved",
        header: "Durum",
        width: 104,
        value: (row) => (row.resolved ? 1 : 0),
        cell: (row) => (
          <Tag tone={row.resolved ? "up" : "neutral"}>{row.resolved ? "Kapandı" : "Açık"}</Tag>
        ),
      },
      {
        id: "detail",
        header: "Ayrıntı",
        width: 380,
        cell: (row) => (
          <span
            className="truncate"
            style={{ fontSize: "var(--sn-t-caption)", color: "var(--sn-ink-2)" }}
          >
            {payloadSummary(row.detail, 3)}
          </span>
        ),
      },
    ],
    [],
  );

  const openCount = (query.data ?? []).filter((row) => !row.resolved).length;

  return (
    <>
      <Panel
        padded={false}
        title={
          <span className="flex items-center gap-1.5">
            Veri kalitesi
            <InfoDot id="veri_tazeligi" />
          </span>
        }
        description="Piyasa verisindeki eksik mumlar ve alışılmadık hareketler. Boşluklar otomatik olarak yeniden çekilir."
        actions={
          <Button size="sm" variant={onlyOpen ? "neutral" : "quiet"} onClick={() => setOnlyOpen((value) => !value)}>
            {onlyOpen ? "Yalnızca açık" : "Hepsi"}
          </Button>
        }
      >
        <div
          className="px-4 py-2.5"
          style={{
            borderBottom: "1px solid var(--sn-hairline)",
            fontSize: "var(--sn-t-caption)",
            color: "var(--sn-ink-2)",
          }}
        >
          {openCount === 0 ? (
            "Açık bulgu yok — izlenen tüm zaman dilimleri güncel görünüyor."
          ) : (
            <>
              <strong style={{ color: "var(--sn-ink)", fontWeight: 550 }}>
                {openCount} açık bulgu
              </strong>{" "}
              var. Bunların çoğu <Term id="aykiri_deger" /> olabilir: küçük hacimli coinlerde
              görülen büyük günlük hareketler veri hatası değil, gerçek piyasa hareketidir ve
              kendiliğinden kapanmaz.
            </>
          )}
        </div>

        <Async
          query={query}
          empty={{
            title: "Kalite bulgusu yok",
            hint: "Veri akışında eksik mum ya da aykırı değer tespit edilmedi.",
          }}
        >
          {() =>
            rows.length === 0 ? (
              <Empty
                title="Açık bulgu yok"
                hint="Tüm veri kalitesi bulguları kapanmış durumda. Kapananları görmek için süzgeci kaldırın."
              />
            ) : (
              <DataGrid
                rows={rows}
                columns={columns}
                rowKey={(row) => String(row.id)}
                onRowClick={setSelected}
                storageKey="loglar-kalite"
                searchPlaceholder="Sembol ya da tür ara…"
                defaultSort={[{ id: "created_at", desc: true }]}
                density="compact"
                maxHeight={600}
              />
            )
          }
        </Async>
      </Panel>

      {selected && (
        <Drawer
          open
          onClose={() => setSelected(null)}
          title={`${selected.symbol || "Sistem"} · ${selected.timeframe}`}
          subtitle={dateTime(selected.created_at)}
          badge={<Tag tone={selected.resolved ? "up" : "neutral"}>{selected.resolved ? "Kapandı" : "Açık"}</Tag>}
        >
          <DrawerSection title="Ne bulundu">
            <QualityExplanation entry={selected} />
          </DrawerSection>

          <DrawerSection title="Ayrıntılar">
            <div className="flex flex-col">
              {payloadFields(selected.detail).map((field) => (
                <Field
                  key={field.key}
                  label={field.label}
                  term={field.term}
                  value={<span className="sn-num">{field.value}</span>}
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
    <span
      className="inline-flex items-center gap-1"
      style={{ fontSize: "var(--sn-t-caption)", color: "var(--sn-ink)" }}
    >
      {label}
      {term && <InfoDot id={term} />}
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

  return <RichText text={text} className="block text-[length:var(--sn-t-body)]" />;
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

  const columns = useMemo<GridColumn<AuditEntry>[]>(
    () => [
      {
        id: "created_at",
        header: "Zaman",
        width: 162,
        pin: true,
        value: (row) => new Date(row.created_at).getTime(),
        cell: (row) => <NumText text={dateTime(row.created_at)} size="sm" />,
      },
      {
        id: "user_id",
        header: "Kullanıcı",
        width: 104,
        num: true,
        value: (row) => row.user_id,
        cell: (row) => <NumText text={row.user_id === null ? "sistem" : `#${row.user_id}`} size="sm" />,
      },
      {
        id: "action",
        header: "Eylem",
        width: 200,
        value: (row) => row.action,
        search: (row) => `${row.action} ${row.target} ${row.ip}`,
        cell: (row) => (
          <span style={{ fontSize: "var(--sn-t-caption)", color: "var(--sn-ink)" }}>
            {readableCode(row.action)}
          </span>
        ),
      },
      {
        id: "target",
        header: "Hedef",
        width: 158,
        value: (row) => row.target,
        cell: (row) => (
          <span className="sn-num" style={{ fontSize: "var(--sn-t-caption)", color: "var(--sn-ink-2)" }}>
            {row.target || "—"}
          </span>
        ),
      },
      {
        id: "payload",
        header: "Ayrıntı",
        width: 360,
        cell: (row) => (
          <span
            className="truncate"
            style={{ fontSize: "var(--sn-t-caption)", color: "var(--sn-ink-2)" }}
          >
            {payloadSummary(row.payload, 4)}
          </span>
        ),
      },
      {
        id: "ip",
        header: "IP",
        width: 136,
        hidden: true,
        value: (row) => row.ip,
        cell: (row) => (
          <span className="sn-num" style={{ fontSize: "var(--sn-t-micro)", color: "var(--sn-ink-3)" }}>
            {row.ip || "—"}
          </span>
        ),
      },
    ],
    [],
  );

  return (
    <Panel
      padded={false}
      title={
        <span className="flex items-center gap-1.5">
          Denetim kaydı
          <InfoDot id="denetim_kaydi" />
        </span>
      }
      description="Her yönetimsel işlem burada tutulur: kim, ne zaman, neyi değiştirdi ve hangi IP'den."
    >
      <Async
        query={query}
        empty={{ title: "Denetim kaydı boş", hint: "Henüz kaydedilmiş bir yönetimsel işlem yok." }}
      >
        {(rows) => (
          <DataGrid
            rows={rows}
            columns={columns}
            rowKey={(row) => String(row.id)}
            storageKey="loglar-denetim"
            searchPlaceholder="Eylem, hedef ya da IP ara…"
            defaultSort={[{ id: "created_at", desc: true }]}
            density="compact"
            maxHeight={600}
          />
        )}
      </Async>
    </Panel>
  );
}
