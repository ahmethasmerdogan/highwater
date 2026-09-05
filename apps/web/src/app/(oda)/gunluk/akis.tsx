"use client";

/**
 * Günlük › Olay akışı (DESIGN-V3 §4.7) — gün başlıklı defter.
 *
 * Motor olayları makine koduyla yazar; `lib/humanize.ts` cümleye çevirir.
 * Her satır: saat · bot · cümle · önem. Ayrıntı sağdan açılır.
 * Uç `created_at`, `kind`, `payload` döndürür — alanlar `StreamRow`'da eşlenir.
 */

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { SearchField, SegmentedControl, StatusPill } from "uicean";
import { api } from "@/lib/api";
import { useLive, type LiveEvent } from "@/lib/ws";
import {
  CATEGORY_HINT,
  CATEGORY_LABEL,
  SEVERITY_LABEL,
  humanizeEvent,
  payloadFields,
  payloadSummary,
  type LogCategory,
  type Severity,
} from "@/lib/humanize";
import { dateTime, relative, time } from "@/lib/format";
import { GuideSection } from "@/shell/page";
import { Async, Chip, Dot, Drawer, DrawerSection, Empty, Explain, Field, NumText, Panel, RichText } from "@/design";
import { gunlere, GunBasligi } from "./gun";

export const AKIS_SUMMARY = "Sistemin ne yaptığının kaydı: bot kararları, havuz yenilemeleri, veri sorunları, yönetimsel işlemler.";

export function AkisGuide() {
  return (
    <>
      <GuideSection title="Nasıl okunur">
        <p>
          Her satır <strong>ne olduğunu</strong> tek cümleyle söyler; tıklayınca <strong>ne anlama geldiği</strong> ve
          gerekiyorsa <strong>ne yapmanız gerektiği</strong> açılır. Önem: gri bilgi, yeşil tamamlandı, turuncu uyarı,
          kırmızı hata.
        </p>
      </GuideSection>
      <GuideSection title="Ne yapabilirim">
        <p>Bir sorun ararken önce Hata ve Uyarı süzgecini açın; tekrarlayan bir hatanın altında çoğu zaman ne yapılacağı yazılıdır.</p>
      </GuideSection>
    </>
  );
}

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
  live: boolean;
}

const SEVERITY_TONE: Record<Severity, "red" | "amber" | "green" | "gray"> = {
  error: "red",
  warn: "amber",
  success: "green",
  info: "gray",
};

export default function AkisTab() {
  const [severity, setSeverity] = useState<Severity | "all">("all");
  const [category, setCategory] = useState<LogCategory | "all">("all");
  const [search, setSearch] = useState("");
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
    /* Canlı olay birazdan veritabanından da gelecek; ikisi birden görünmesin. */
    const key = (row: StreamRow) => `${row.kind}|${row.at.slice(0, 19)}|${row.symbol ?? ""}`;
    const seen = new Set(stored.map(key));
    return [...live.filter((row) => !seen.has(key(row))), ...stored].sort(
      (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime(),
    );
  }, [query.data, liveEvents]);

  const filtered = useMemo(() => {
    const q = search.trim().toLocaleLowerCase("tr");
    return rows.filter((row) => {
      const human = humanizeEvent(row.kind, row.level, row.payload);
      if (severity !== "all" && human.severity !== severity) return false;
      if (category !== "all" && human.category !== category) return false;
      if (q && !`${human.title} ${row.kind} ${row.symbol ?? ""} ${payloadSummary(row.payload, 8)}`.toLocaleLowerCase("tr").includes(q)) return false;
      return true;
    });
  }, [rows, severity, category, search]);

  const counts = useMemo(() => {
    const tally = { info: 0, success: 0, warn: 0, error: 0 } as Record<Severity, number>;
    rows.forEach((row) => { tally[humanizeEvent(row.kind, row.level, row.payload).severity] += 1; });
    return tally;
  }, [rows]);

  const gunlu = useMemo(() => gunlere(filtered, (row) => row.at), [filtered]);

  return (
    <>
      <Panel
        padded={false}
        title="Olay akışı"
        description="En yeni olay üstte. Canlı bağlantı açıkken yeni olaylar anında düşer."
        actions={
          <span className="inline-flex items-center gap-1.5 text-[12px] text-ink-3">
            <Dot tone={wsState === "open" ? "up" : "warn"} pulse={wsState === "open"} />
            {wsState === "open" ? "canlı" : "bağlantı yok"}
          </span>
        }
      >
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line px-5 py-2.5">
          <SegmentedControl
            size="sm"
            value={severity}
            onChange={setSeverity}
            options={[
              { value: "all", label: "Hepsi" },
              ...(["error", "warn", "success", "info"] as Severity[]).map((level) => ({
                value: level,
                label: <span className="inline-flex items-center gap-1.5">{SEVERITY_LABEL[level]} <NumText text={String(counts[level])} size="xs" /></span>,
                name: SEVERITY_LABEL[level],
              })),
            ]}
          />
          <span className="flex flex-wrap items-center gap-1">
            <Chip active={category === "all"} onClick={() => setCategory("all")}>Tümü</Chip>
            {(Object.keys(CATEGORY_LABEL) as LogCategory[]).map((key) => (
              <Chip key={key} active={category === key} onClick={() => setCategory(key)} title={CATEGORY_HINT[key]}>
                {CATEGORY_LABEL[key]}
              </Chip>
            ))}
          </span>
          <SearchField className="ml-auto h-8 w-56" placeholder="Olay, sembol, mesaj…" kbd={false} value={search} onChange={setSearch} />
        </div>

        <Async query={query} empty={{ title: "Henüz olay yok", hint: "Sistem çalışmaya başladığında olaylar burada görünecek." }}>
          {() =>
            filtered.length === 0 ? (
              <Empty title="Süzgece uyan olay yok" hint="Seçili önem, kategori ya da arama için kayıt bulunamadı." />
            ) : (
              <div className="max-h-[680px] overflow-y-auto">
                {gunlu.map((grup) => (
                  <section key={grup.baslik}>
                    <GunBasligi count={grup.items.length}>{grup.baslik}</GunBasligi>
                    <ul>
                      {grup.items.map((row) => {
                        const human = humanizeEvent(row.kind, row.level, row.payload);
                        const message = typeof row.payload?.message === "string" ? row.payload.message : "";
                        return (
                          <li key={row.id} className="border-b border-line last:border-0">
                            <button
                              type="button"
                              onClick={() => setSelected(row)}
                              className="grid w-full grid-cols-[52px_48px_minmax(0,1fr)_auto] items-center gap-3 px-5 py-2.5 text-left hover:bg-inset/60"
                            >
                              <NumText text={time(row.at)} size="sm" />
                              <NumText text={row.botId === null ? "—" : `#${row.botId}`} size="sm" className="text-ink-3" />
                              <span className="min-w-0">
                                <span className="flex items-center gap-2 text-[13px] text-ink">
                                  {row.symbol && <NumText text={row.symbol} size="sm" />}
                                  <span className="truncate">{human.title}</span>
                                  {row.live && <StatusPill tone="blue" size="sm">canlı</StatusPill>}
                                </span>
                                <span className="block truncate text-[12px] text-ink-3">{message || human.detail || payloadSummary(row.payload, 3)}</span>
                              </span>
                              <StatusPill tone={SEVERITY_TONE[human.severity]} size="sm">{SEVERITY_LABEL[human.severity]}</StatusPill>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                ))}
              </div>
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
      badge={<StatusPill tone={SEVERITY_TONE[human.severity]} size="sm">{SEVERITY_LABEL[human.severity]}</StatusPill>}
    >
      <DrawerSection title="Ne oldu">
        <div className="rounded-xl border border-line bg-elev px-3.5 py-3 text-[13px] leading-[1.55] text-ink-2">
          {message ? <RichText text={message} /> : human.detail ? <RichText text={human.detail} /> : "—"}
        </div>
      </DrawerSection>

      {message && human.detail && (
        <DrawerSection title="Ne anlama geliyor">
          <RichText text={human.detail} className="block text-[13px]" />
        </DrawerSection>
      )}

      {human.action && (
        <DrawerSection title="Ne yapmalı">
          <p className="border-l-2 border-brand pl-3 text-[13px] leading-[1.55] text-ink-2">{human.action}</p>
        </DrawerSection>
      )}

      {human.term && (
        <DrawerSection title="İlgili kavram">
          <Explain id={human.term} />
        </DrawerSection>
      )}

      <DrawerSection title="Ayrıntılar" hint="Olayla birlikte kaydedilen değerler.">
        {fields.length === 0 ? (
          <p className="text-[13px] text-ink-3">Bu olay ek bir değer taşımıyor.</p>
        ) : (
          <div className="flex flex-col">
            {fields.map((field) => (
              <Field key={field.key} label={field.label} term={field.term} value={<span className="sn-num">{field.value}</span>} />
            ))}
          </div>
        )}
      </DrawerSection>

      <DrawerSection title="Künye">
        <div className="flex flex-col">
          <Field label="Olay kodu" hint="Motorun kullandığı makine kodu. Bir kaydı geliştiriciyle konuşurken bunu verin." value={<span className="sn-num">{row.kind}</span>} />
          <Field label="Kategori" value={CATEGORY_LABEL[human.category]} />
          <Field label="Kaynak" value={row.live ? "Canlı akış" : "Veritabanı"} />
          {row.botId !== null && <Field label="Bot" value={<span className="sn-num">{`#${row.botId}`}</span>} />}
          {row.symbol && <Field label="Sembol" value={<span className="sn-num">{row.symbol}</span>} />}
        </div>
      </DrawerSection>
    </Drawer>
  );
}
