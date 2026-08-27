"use client";

/**
 * İndikatörler — sembol bazında grafik, destek/direnç, formasyonlar ve
 * strateji kurgu atölyesi.
 *
 * İki iş yapar: bir coini incelemek ve stratejiyi ayarlamak. İkisi aynı
 * sayfada çünkü ayarları değiştirirken neyin etkileneceğini görmek gerekir.
 */

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  api,
  type Candle,
  type PatternInfo,
  type Score,
  type ScoreConfig,
  type ScoreDetail,
  type SnapshotDetail,
  type SRLevels,
  type Strategy,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { toast } from "@/lib/toast";
import { STRATEGY_GROUPS, readPath, writePath, type FieldSpec } from "@/lib/strategy-fields";
import { num, price } from "@/lib/format";
import { Page, GuideSection } from "@/shell/page";
import {
  Button,
  Empty,
  Field,
  FormField,
  InfoDot,
  NumText,
  Panel,
  Segmented,
  Select,
  Tag,
  TextInput,
  Toggle,
} from "@/design";
import { PriceChart } from "@/design/price-chart";
import { ScoreCard } from "@/design/score-card";
import { SimpleTable, type SimpleColumn } from "@/grid/simple-table";

const TIMEFRAMES = ["15m", "1h", "4h", "1d"].map((value) => ({ value, label: value }));

/* Uç dört tür döndürür (`features/sr.py:29 LevelKind`). İkiye zorlanınca
   POC ve değer alanı "Direnç" diye etiketleniyordu. */
const SR_TUR: Record<string, string> = {
  support: "Destek",
  resistance: "Direnç",
  poc: "POC",
  value_area: "Değer alanı",
};

/*
 * `useSearchParams` bir Suspense sınırı ister; yoksa derleme sırasında
 * uyarı verir ve sayfa tamamen istemci tarafına kaçar.
 */
export default function IndicatorsPage() {
  return (
    <Suspense
      fallback={
        <div className="px-6 py-8" style={{ fontSize: "var(--sn-t-body)", color: "var(--sn-ink-3)" }}>
          Yükleniyor…
        </div>
      }
    >
      <IndicatorsContent />
    </Suspense>
  );
}

function IndicatorsContent() {
  const params = useSearchParams();
  const [symbol, setSymbol] = useState<string>(params.get("symbol") ?? "");
  const [tf, setTf] = useState("1h");

  /* Sembol listesi: önce puanlardan, yoksa havuzdan. Puan henüz
     hesaplanmamışken sayfanın boş görünmemesi için ikinci kaynak şart. */
  const configs = useQuery({
    queryKey: ["score-configs"],
    queryFn: () => api.get<ScoreConfig[]>("/scores/configs"),
  });

  const scores = useQuery({
    queryKey: ["scores", configs.data?.[0]?.config_hash],
    queryFn: () =>
      api.get<Score[]>("/scores", { config_hash: configs.data?.[0]?.config_hash, limit: 300 }),
    enabled: Boolean(configs.data?.[0]?.config_hash),
  });

  const universe = useQuery({
    queryKey: ["universe-current"],
    queryFn: () => api.get<SnapshotDetail>("/universe/current"),
  });

  const symbols = useMemo(() => {
    if ((scores.data ?? []).length > 0) return scores.data!.map((entry) => entry.symbol);
    return (universe.data?.symbols ?? []).map((entry) => entry.symbol);
  }, [scores.data, universe.data]);

  useEffect(() => {
    if (!symbol && symbols.length > 0) setSymbol(symbols[0]);
  }, [symbols, symbol]);

  return (
    <Page
      title="İndikatörler"
      summary="Bir coinin grafiği, destek/direnç seviyeleri, tespit edilen formasyonlar ve puan kartı."
      wide
      guide={
        <>
          <GuideSection title="Ne gösteriyor">
            <p>
              Seçtiğiniz coinin mum grafiği ve üzerine çizilmiş destek/direnç seviyeleri. Altında
              tespit edilen formasyonlar ve o coinin güncel puan kartı durur.
            </p>
            <p>
              Sayfanın alt kısmında <strong>strateji kurgu atölyesi</strong> var: puan
              ağırlıklarını, giriş eşiklerini ve çıkış kurallarını buradan düzenleyip yeni bir
              sürüm olarak kaydedebilirsiniz.
            </p>
          </GuideSection>
          <GuideSection title="Nasıl okunur">
            <p>
              Grafikteki kesikli çizgiler hesaplanan seviyelerdir: kırmızı direnç, yeşil destek,
              amber en çok hacmin geçtiği fiyat.
            </p>
            <p>
              <strong>Formasyonlar bir tetikleyici değil, çarpandır.</strong> Puana katkıları
              bilinçli olarak küçük tutulmuştur — formasyon tespiti öznelliğe en açık parçadır ve
              ağırlığı büyük olsaydı ölçümü bulandırırdı.
            </p>
          </GuideSection>
          <GuideSection title="Ne yapabilirim">
            <p>
              Atölyede bir ayarı değiştirip kaydettiğinizde <strong>yeni bir strateji sürümü</strong>{" "}
              doğar; çalışan botlar etkilenmez. Yeni sürümü kullanmak için botu ona geçirmeniz
              gerekir.
            </p>
          </GuideSection>
        </>
      }
    >
      <div
        className="flex flex-wrap items-center gap-3 rounded-[var(--sn-r-md)] px-4 py-2.5"
        style={{ background: "var(--sn-panel)", border: "1px solid var(--sn-hairline)" }}
      >
        <label className="flex items-center gap-2">
          <span style={{ fontSize: "var(--sn-t-caption)", color: "var(--sn-ink-2)" }}>Sembol</span>
          <Select
            value={symbol}
            onChange={(event) => setSymbol(event.target.value)}
            className="sn-num w-[180px]"
          >
            {symbols.length === 0 && <option value="">— liste boş —</option>}
            {symbols.map((entry) => (
              <option key={entry} value={entry}>
                {entry}
              </option>
            ))}
          </Select>
        </label>

        <div className="flex items-center gap-1.5">
          <span
            className="flex items-center gap-1"
            style={{ fontSize: "var(--sn-t-caption)", color: "var(--sn-ink-2)" }}
          >
            Zaman dilimi
            <InfoDot id="karar_bari" />
          </span>
          <Segmented size="sm" value={tf} onChange={setTf} options={TIMEFRAMES} />
        </div>

        {symbols.length === 0 && (
          <span style={{ fontSize: "var(--sn-t-caption)", color: "var(--sn-warn)" }}>
            Ne puan ne de havuz verisi var — önce havuzun kurulması gerekiyor.
          </span>
        )}
      </div>

      {symbol && <SymbolPanels symbol={symbol} tf={tf} />}

      <StrategyWorkshop />
    </Page>
  );
}

/* ------------------------------------------------------------------ */
/*  Sembol panelleri                                                   */
/* ------------------------------------------------------------------ */

function SymbolPanels({ symbol, tf }: { symbol: string; tf: string }) {
  const candles = useQuery({
    queryKey: ["ohlcv", symbol, tf],
    queryFn: () => api.get<Candle[]>(`/symbols/${symbol}/ohlcv`, { tf, limit: 400 }),
    refetchInterval: 60_000,
  });

  const sr = useQuery({
    queryKey: ["sr", symbol, tf],
    queryFn: () => api.get<SRLevels>(`/symbols/${symbol}/sr`, { tf }),
    retry: false,
  });

  const patterns = useQuery({
    queryKey: ["patterns", symbol, tf],
    queryFn: () => api.get<PatternInfo>(`/symbols/${symbol}/patterns`, { tf }),
    retry: false,
  });

  const score = useQuery({
    queryKey: ["score", symbol],
    queryFn: () => api.get<ScoreDetail>(`/scores/${symbol}`),
    retry: false,
  });

  const levelColumns: SimpleColumn<SRLevels["levels"][number]>[] = [
    {
      header: "Tür",
      cell: (row) => (
        <span style={{ fontSize: "var(--sn-t-caption)" }}>
          {SR_TUR[row.kind] ?? row.kind}
        </span>
      ),
    },
    { header: "Fiyat", num: true, cell: (row) => <NumText text={price(row.price)} size="sm" /> },
    { header: "Güç", num: true, cell: (row) => <NumText text={num(row.strength, 2)} size="sm" /> },
    { header: "Dokunuş", num: true, cell: (row) => <NumText text={String(row.touches)} size="sm" /> },
  ];

  return (
    <>
      <Panel
        title={`${symbol} · ${tf}`}
        description="Kesikli çizgiler hesaplanan seviyeler: kırmızı direnç, yeşil destek, amber en çok hacmin geçtiği fiyat."
      >
        {candles.isLoading ? (
          <div
            className="flex h-[420px] items-center justify-center"
            style={{ fontSize: "var(--sn-t-body)", color: "var(--sn-ink-3)" }}
          >
            Grafik yükleniyor…
          </div>
        ) : candles.isError ? (
          /* API hatası "veri yok" değildir — sembolü suçlamadan söyle. */
          <Empty
            title="Grafik getirilemedi"
            hint={
              candles.error instanceof Error
                ? candles.error.message
                : "API'ye ulaşılamıyor — veri yokluğu değil, bağlantı sorunu."
            }
          />
        ) : (candles.data ?? []).length === 0 ? (
          <Empty
            title="Bu sembol için veri yok"
            hint={`${symbol} sembolünün ${tf} verisi henüz indirilmemiş olabilir. Veri kalitesi bulguları için Loglar sayfasına bakın.`}
          />
        ) : (
          <PriceChart candles={candles.data ?? []} sr={sr.data} height={420} />
        )}
      </Panel>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel
          title={
            <span className="flex items-center gap-1.5">
              Destek ve direnç
              <InfoDot id="aile_sr" />
            </span>
          }
        >
          {sr.data ? (
            <>
              <div className="flex flex-col">
                <Field label="Güncel fiyat" value={<NumText text={price(sr.data.price)} size="sm" />} />
                <Field
                  label="Direnç"
                  hint="Fiyatın yukarı hareketinde karşılaşması beklenen seviye."
                  value={<NumText text={price(sr.data.resistance)} size="sm" />}
                />
                <Field
                  label="Destek"
                  hint="Fiyatın aşağı hareketinde tutunması beklenen seviye."
                  value={<NumText text={price(sr.data.support)} size="sm" />}
                />
                <Field
                  label="Ödül/risk"
                  term="rr"
                  value={<NumText text={num(sr.data.rr_geometry, 2)} size="sm" />}
                />
                <Field label="POC" term="poc" value={<NumText text={price(sr.data.poc)} size="sm" />} />
                <Field label="ATR" term="atr" value={<NumText text={price(sr.data.atr)} size="sm" />} />
              </div>

              {sr.data.levels.length > 0 && (
                <div className="mt-3">
                  <div
                    className="mb-1.5"
                    style={{ fontSize: "var(--sn-t-caption)", color: "var(--sn-ink-3)" }}
                  >
                    Tespit edilen tüm seviyeler
                  </div>
                  <div className="sn-scroll max-h-[220px] overflow-y-auto">
                    <SimpleTable
                      rows={sr.data.levels}
                      columns={levelColumns}
                      rowKey={(row) => `${row.kind}-${row.price}`}
                      dense
                    />
                  </div>
                </div>
              )}
            </>
          ) : (
            <p style={{ fontSize: "var(--sn-t-body)", color: "var(--sn-ink-3)" }}>
              Bu sembol için destek/direnç hesaplanamadı — yeterli fiyat geçmişi yok.
            </p>
          )}
        </Panel>

        <Panel
          title={
            <span className="flex items-center gap-1.5">
              Formasyonlar
              <InfoDot id="formasyon" />
            </span>
          }
        >
          {patterns.data ? (
            <>
              <p
                className="mb-3 rounded-[var(--sn-r-sm)] px-3 py-2"
                style={{
                  background: "var(--sn-sunken)",
                  fontSize: "var(--sn-t-caption)",
                  color: "var(--sn-ink-2)",
                  lineHeight: 1.5,
                }}
              >
                {patterns.data.note}
              </p>

              {patterns.data.matches.length === 0 ? (
                <p style={{ fontSize: "var(--sn-t-body)", color: "var(--sn-ink-3)" }}>
                  Şu an tespit edilmiş bir formasyon yok. Bu normaldir — formasyonlar seyrek
                  görülür.
                </p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {patterns.data.matches.map((match, index) => (
                    <li
                      key={index}
                      className="rounded-[var(--sn-r-sm)] px-3 py-2"
                      style={{ border: "1px solid var(--sn-border)" }}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className="font-medium"
                          style={{ fontSize: "var(--sn-t-caption)", color: "var(--sn-ink)" }}
                        >
                          {match.kind.replace(/_/g, " ")}
                        </span>
                        <Tag tone={match.direction > 0 ? "up" : "down"}>
                          {match.direction > 0 ? "yukarı" : "aşağı"}
                        </Tag>
                        {match.volume_confirmed ? (
                          <Tag tone="brand">hacim doğruladı</Tag>
                        ) : (
                          <span
                            title="Hacim doğrulaması olmayan formasyon daha az katkı verir."
                            style={{ fontSize: "var(--sn-t-micro)", color: "var(--sn-ink-3)" }}
                          >
                            hacim doğrulamadı
                          </span>
                        )}
                      </div>
                      <div
                        className="mt-1 flex flex-wrap gap-x-4"
                        style={{ fontSize: "var(--sn-t-caption)", color: "var(--sn-ink-2)" }}
                      >
                        <span>güven {num(match.confidence, 2)}</span>
                        {match.neckline !== null && <span>boyun {price(match.neckline)}</span>}
                        {match.target !== null && <span>hedef {price(match.target)}</span>}
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              <div className="mt-3 flex flex-col pt-2" style={{ borderTop: "1px solid var(--sn-hairline)" }}>
                <Field
                  label="Formasyon katkısı"
                  hint="Formasyonların puana eklediği ya da çıkardığı düzeltme."
                  value={<NumText text={num(patterns.data.pattern_modifier, 2)} size="sm" />}
                />
                <Field
                  label="Mum sinyali katkısı"
                  hint="Tek mum formasyonlarının katkısı."
                  value={<NumText text={num(patterns.data.candle_modifier, 2)} size="sm" />}
                />
              </div>

              {patterns.data.candle_signals.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {patterns.data.candle_signals.map((signal) => (
                    <Tag key={signal} tone="neutral">
                      {signal.replace(/_/g, " ")}
                    </Tag>
                  ))}
                </div>
              )}
            </>
          ) : (
            <p style={{ fontSize: "var(--sn-t-body)", color: "var(--sn-ink-3)" }}>
              Bu sembol için formasyon hesaplanamadı — yeterli fiyat geçmişi yok.
            </p>
          )}
        </Panel>

        <div>
          {score.data?.rationale ? (
            <ScoreCard rationale={score.data.rationale} />
          ) : (
            <Panel
              title={
                <span className="flex items-center gap-1.5">
                  Puan kartı
                  <InfoDot id="puan" />
                </span>
              }
            >
              <p style={{ fontSize: "var(--sn-t-body)", color: "var(--sn-ink-3)" }}>
                Bu sembol için henüz puan hesaplanmamış. Puanlar karar barı kapandığında üretilir.
              </p>
            </Panel>
          )}
        </div>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Strateji kurgu atölyesi                                            */
/* ------------------------------------------------------------------ */

/**
 * Strateji ayarlarını açıklamalarıyla birlikte düzenler.
 *
 * Kaydetmek mevcut sürümü değiştirmez, **yeni bir sürüm doğurur.** Çalışan
 * botlar etkilenmez; yeni sürümü kullanmaları için bota geçirilmesi gerekir.
 */
function StrategyWorkshop() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const [strategyId, setStrategyId] = useState<number | null>(null);
  const [draft, setDraft] = useState<Record<string, unknown> | null>(null);

  const strategies = useQuery({
    queryKey: ["strategies"],
    queryFn: () => api.get<Strategy[]>("/strategies"),
  });

  const strategy =
    strategies.data?.find((entry) => entry.id === strategyId) ?? strategies.data?.[0] ?? null;

  /* En yüksek sürüm numarası taban alınır. */
  const latest = strategy ? [...strategy.versions].sort((a, b) => b.version - a.version)[0] : null;

  useEffect(() => {
    if (latest && draft === null) setDraft(structuredClone(latest.definition));
  }, [latest, draft]);

  const save = useMutation({
    mutationFn: () => api.post(`/strategies/${strategy!.id}/versions`, { definition: draft }),
    onSuccess: () => {
      toast.success(
        "Yeni sürüm oluşturuldu",
        "Çalışan botlar etkilenmedi. Kullanmak için botu bu sürüme geçirin.",
      );
      void qc.invalidateQueries({ queryKey: ["strategies"] });
      setDraft(null);
    },
    onError: (error: Error) => toast.error("Kaydedilemedi", error.message),
  });

  if (!can("TRADER")) return null;

  return (
    <Panel
      title={
        <span className="flex items-center gap-1.5">
          Strateji kurgu atölyesi
          <InfoDot id="strateji_surum" />
        </span>
      }
      description="Ayarları düzenleyin ve yeni sürüm olarak kaydedin. Mevcut sürüm değişmez, çalışan botlar etkilenmez."
      actions={
        <div className="flex items-center gap-2">
          {(strategies.data?.length ?? 0) > 1 && (
            <Select
              value={strategy?.id ?? ""}
              onChange={(event) => {
                setStrategyId(Number(event.target.value));
                setDraft(null);
              }}
              className="w-[200px]"
            >
              {strategies.data!.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.name}
                </option>
              ))}
            </Select>
          )}
          <Button
            size="sm"
            variant="primary"
            disabled={!draft || !strategy || save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? "Kaydediliyor…" : "Yeni sürüm olarak kaydet"}
          </Button>
        </div>
      }
    >
      {!strategy || !latest || !draft ? (
        <Empty
          title="Düzenlenecek strateji yok"
          hint="Önce Stratejiler sayfasından bir strateji oluşturun."
        />
      ) : (
        <>
          <p
            className="mb-4 rounded-[var(--sn-r-sm)] px-3.5 py-2.5"
            style={{
              background: "var(--sn-raised)",
              border: "1px solid var(--sn-hairline)",
              fontSize: "var(--sn-t-caption)",
              color: "var(--sn-ink-2)",
              lineHeight: 1.55,
            }}
          >
            <strong style={{ color: "var(--sn-ink)", fontWeight: 550 }}>{strategy.name}</strong> ·
            sürüm {latest.version} taban alınıyor. Kaydettiğinizde sürüm {latest.version + 1}{" "}
            oluşur.
          </p>

          <div className="flex flex-col gap-5">
            {STRATEGY_GROUPS.filter((group) => group.key !== "temel").map((group) => (
              <div key={group.key}>
                <h3
                  className="font-semibold"
                  style={{ fontSize: "var(--sn-t-body)", color: "var(--sn-ink)" }}
                >
                  {group.title}
                </h3>
                <p
                  className="mt-0.5 mb-2 max-w-3xl"
                  style={{ fontSize: "var(--sn-t-caption)", color: "var(--sn-ink-2)", lineHeight: 1.5 }}
                >
                  {group.description}
                </p>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {group.fields.map((field) => (
                    <EditableField
                      key={field.path}
                      field={field}
                      value={readPath(draft, field.path)}
                      onChange={(next) =>
                        setDraft((current) =>
                          current ? writePath({ ...current }, field.path, next) : current,
                        )
                      }
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </Panel>
  );
}

function EditableField({
  field,
  value,
  onChange,
}: {
  field: FieldSpec;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  return (
    <div
      className="rounded-[var(--sn-r-sm)] px-3 py-2.5"
      style={{ border: "1px solid var(--sn-border)" }}
    >
      {field.kind === "tiers" ? (
        /* Kademe listesi bu formda düzenlenmez: sayı kutusuna zorlamak
           [[80,0.75]] yapısını bozardı. Görünür ama salt okunur. */
        <>
          <FormField label={field.label}>
            <span className="sn-num" style={{ fontSize: "var(--sn-t-body)", color: "var(--sn-ink)" }}>
              {Array.isArray(value)
                ? (value as [number, number][])
                    .map(([esik, carpan]) => `${esik}→×${carpan}`)
                    .join(" · ")
                : "—"}
            </span>
          </FormField>
          <p
            className="mt-1.5"
            style={{ fontSize: "var(--sn-t-caption)", color: "var(--sn-ink-2)", lineHeight: 1.5 }}
          >
            {field.description} Bu listeyi düzenlemek için strateji tanımını JSON olarak kaydedin.
          </p>
        </>
      ) : field.kind === "boolean" ? (
        <Toggle
          checked={Boolean(value)}
          onChange={onChange}
          label={field.label}
          hint={field.description}
        />
      ) : (
        <>
          <FormField label={field.label}>
            <span className="flex items-center gap-1.5">
              {field.kind === "text" ? (
                <TextInput
                  value={String(value ?? "")}
                  onChange={(event) => onChange(event.target.value)}
                />
              ) : (
                <>
                  <TextInput
                    type="number"
                    numeric
                    value={typeof value === "number" ? value : ""}
                    min={field.min}
                    max={field.max}
                    step={field.step ?? (field.kind === "integer" ? 1 : 0.01)}
                    onChange={(event) =>
                      onChange(event.target.value === "" ? null : Number(event.target.value))
                    }
                  />
                  {field.unit && (
                    <span
                      className="shrink-0"
                      style={{ fontSize: "var(--sn-t-micro)", color: "var(--sn-ink-3)" }}
                    >
                      {field.unit}
                    </span>
                  )}
                </>
              )}
            </span>
          </FormField>
          <p
            className="mt-1.5"
            style={{ fontSize: "var(--sn-t-caption)", color: "var(--sn-ink-2)", lineHeight: 1.5 }}
          >
            {field.description}
          </p>
        </>
      )}

      {field.warning && (
        <p
          className="mt-1 pl-2"
          style={{
            borderLeft: "2px solid var(--sn-warn)",
            fontSize: "var(--sn-t-caption)",
            color: "var(--sn-ink-3)",
            lineHeight: 1.5,
          }}
        >
          {field.warning}
        </p>
      )}
    </div>
  );
}
