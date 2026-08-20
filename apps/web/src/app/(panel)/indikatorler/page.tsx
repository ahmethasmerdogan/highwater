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
import { Button, StatusPill, cx } from "@/ui";
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
import { Page, Section, Empty } from "@/components/common/page";
import { Field, InfoDot } from "@/components/common/explain";
import { PriceChart } from "@/components/viz/price-chart";
import { ScoreCard } from "@/components/viz/score-card";
import { SimpleTable } from "@/components/data/data-table";
import {
  STRATEGY_GROUPS,
  readPath,
  writePath,
  type FieldSpec,
} from "@/lib/strategy-fields";
import { num, price } from "@/lib/format";

const TIMEFRAMES = ["15m", "1h", "4h", "1d"];

/*
 * `useSearchParams` bir Suspense sınırı ister; yoksa derleme sırasında
 * uyarı verir ve sayfa tamamen istemci tarafına kaçar.
 */
export default function IndicatorsPage() {
  return (
    <Suspense
      fallback={
        <div className="px-6 py-8 text-[13px] text-ink-3">Yükleniyor…</div>
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
      api.get<Score[]>("/scores", {
        config_hash: configs.data?.[0]?.config_hash,
        limit: 300,
      }),
    enabled: Boolean(configs.data?.[0]?.config_hash),
  });

  const universe = useQuery({
    queryKey: ["universe-current"],
    queryFn: () => api.get<SnapshotDetail>("/universe/current"),
  });

  const symbols = useMemo(() => {
    if ((scores.data ?? []).length > 0) return scores.data!.map((s) => s.symbol);
    return (universe.data?.symbols ?? []).map((s) => s.symbol);
  }, [scores.data, universe.data]);

  useEffect(() => {
    if (!symbol && symbols.length > 0) setSymbol(symbols[0]);
  }, [symbols, symbol]);

  return (
    <Page
      title="İndikatörler"
      description="Bir coinin grafiği, destek/direnç seviyeleri, tespit edilen formasyonlar ve puan kartı."
      wide
      intro={{
        storageKey: "indikatorler",
        what: "Seçtiğiniz coinin mum grafiği ve üzerine çizilmiş destek/direnç seviyeleri. Altında tespit edilen formasyonlar ve o coinin güncel puan kartı durur.\n\nSayfanın alt kısmında **strateji kurgu atölyesi** var: puan ağırlıklarını, giriş eşiklerini ve çıkış kurallarını buradan düzenleyip yeni bir sürüm olarak kaydedebilirsiniz.",
        how: "Grafikteki kesikli çizgiler hesaplanan seviyelerdir: kırmızı direnç, yeşil destek, amber en çok hacmin geçtiği fiyat.\n\n**Formasyonlar bir tetikleyici değil, çarpandır.** Puana katkıları bilinçli olarak küçük tutulmuştur — formasyon tespiti öznelliğe en açık parçadır ve ağırlığı büyük olsaydı ölçümü bulandırırdı.",
        action: "Atölyede bir ayarı değiştirip kaydettiğinizde **yeni bir strateji sürümü** doğar; çalışan botlar etkilenmez. Yeni sürümü kullanmak için botu ona geçirmeniz gerekir.",
        terms: ["aile_sr", "formasyon", "puan", "atr", "poc", "rr", "strateji_surum"],
      }}
    >
      {/* Sembol ve zaman dilimi seçimi */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-elev px-4 py-2.5">
        <label className="flex items-center gap-2">
          <span className="text-[12px] text-ink-2">Sembol</span>
          <select
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
            className="h-8 rounded-lg border border-line bg-surface px-2.5 font-mono text-[12.5px] text-ink focus:border-brand focus:outline-none"
          >
            {symbols.length === 0 && <option value="">— liste boş —</option>}
            {symbols.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>

        <div className="flex items-center gap-1.5">
          <span className="flex items-center gap-1 text-[12px] text-ink-2">
            Zaman dilimi
            <InfoDot id="karar_bari" align="start" />
          </span>
          <div className="flex rounded-lg border border-line p-0.5">
            {TIMEFRAMES.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTf(t)}
                className={cx(
                  "rounded-md px-2 py-0.5 font-mono text-[12px] transition-colors",
                  tf === t ? "bg-brand-soft font-medium text-brand" : "text-ink-2 hover:text-ink",
                )}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {symbols.length === 0 && (
          <span className="text-[12px] text-warn">
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

  return (
    <>
      <Section
        title={`${symbol} · ${tf}`}
        description="Kesikli çizgiler hesaplanan seviyeler: kırmızı direnç, yeşil destek, amber en çok hacmin geçtiği fiyat."
      >
        {candles.isLoading ? (
          <div className="flex h-[420px] items-center justify-center text-[13px] text-ink-3">
            Grafik yükleniyor…
          </div>
        ) : (candles.data ?? []).length === 0 ? (
          <Empty
            title="Bu sembol için veri yok"
            description={`${symbol} sembolünün ${tf} verisi henüz indirilmemiş olabilir. Veri kalitesi bulguları için Loglar sayfasına bakın.`}
          />
        ) : (
          <PriceChart candles={candles.data ?? []} sr={sr.data} height={420} />
        )}
      </Section>

      <div className="grid gap-4 lg:grid-cols-3">
        <Section title="Destek ve direnç" term="aile_sr" className="lg:col-span-1">
          {sr.data ? (
            <>
              <div className="divide-y divide-line">
                <Field
                  label="Güncel fiyat"
                  value={<span className="num">{price(sr.data.price)}</span>}
                />
                <Field
                  label="Direnç"
                  hint="Fiyatın yukarı hareketinde karşılaşması beklenen seviye."
                  value={<span className="num">{price(sr.data.resistance)}</span>}
                />
                <Field
                  label="Destek"
                  hint="Fiyatın aşağı hareketinde tutunması beklenen seviye."
                  value={<span className="num">{price(sr.data.support)}</span>}
                />
                <Field
                  label="Ödül/risk"
                  term="rr"
                  value={<span className="num">{num(sr.data.rr_geometry, 2)}</span>}
                />
                <Field
                  label="POC"
                  term="poc"
                  value={<span className="num">{price(sr.data.poc)}</span>}
                />
                <Field
                  label="ATR"
                  term="atr"
                  value={<span className="num">{price(sr.data.atr)}</span>}
                />
              </div>

              {sr.data.levels.length > 0 && (
                <div className="mt-3">
                  <div className="mb-1.5 text-[12px] text-ink-3">
                    Tespit edilen tüm seviyeler
                  </div>
                  <SimpleTable
                    dense
                    maxHeight="220px"
                    head={
                      <>
                        <th>Tür</th>
                        <th className="col-num">Fiyat</th>
                        <th className="col-num">Güç</th>
                        <th className="col-num">Dokunuş</th>
                      </>
                    }
                  >
                    {sr.data.levels.map((lv, i) => (
                      <tr key={i}>
                        <td className="text-[12px]">
                          {lv.kind === "support" ? "Destek" : "Direnç"}
                        </td>
                        <td className="col-num">{price(lv.price)}</td>
                        <td className="col-num">{num(lv.strength, 2)}</td>
                        <td className="col-num">{lv.touches}</td>
                      </tr>
                    ))}
                  </SimpleTable>
                </div>
              )}
            </>
          ) : (
            <p className="text-[13px] text-ink-3">
              Bu sembol için destek/direnç hesaplanamadı — yeterli fiyat geçmişi yok.
            </p>
          )}
        </Section>

        <Section title="Formasyonlar" term="formasyon" className="lg:col-span-1">
          {patterns.data ? (
            <>
              <p className="mb-3 rounded-lg bg-inset px-3 py-2 text-[11.5px] leading-relaxed text-ink-2">
                {patterns.data.note}
              </p>

              {patterns.data.matches.length === 0 ? (
                <p className="text-[13px] text-ink-3">
                  Şu an tespit edilmiş bir formasyon yok. Bu normaldir — formasyonlar seyrek
                  görülür.
                </p>
              ) : (
                <ul className="space-y-2">
                  {patterns.data.matches.map((m, i) => (
                    <li key={i} className="rounded-lg border border-line px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span className="text-[12.5px] font-medium text-ink">
                          {m.kind.replace(/_/g, " ")}
                        </span>
                        <StatusPill size="sm" tone={m.direction > 0 ? "green" : "red"}>
                          {m.direction > 0 ? "yukarı" : "aşağı"}
                        </StatusPill>
                        {m.volume_confirmed ? (
                          <StatusPill size="sm" tone="amber">
                            hacim doğruladı
                          </StatusPill>
                        ) : (
                          <span
                            className="text-[11px] text-ink-3"
                            title="Hacim doğrulaması olmayan formasyon daha az katkı verir."
                          >
                            hacim doğrulamadı
                          </span>
                        )}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-x-4 text-[11.5px] text-ink-2">
                        <span>güven {num(m.confidence, 2)}</span>
                        {m.neckline !== null && <span>boyun {price(m.neckline)}</span>}
                        {m.target !== null && <span>hedef {price(m.target)}</span>}
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              <div className="mt-3 divide-y divide-line border-t border-line pt-2">
                <Field
                  label="Formasyon katkısı"
                  hint="Formasyonların puana eklediği ya da çıkardığı düzeltme."
                  value={<span className="num">{num(patterns.data.pattern_modifier, 2)}</span>}
                />
                <Field
                  label="Mum sinyali katkısı"
                  hint="Tek mum formasyonlarının katkısı."
                  value={<span className="num">{num(patterns.data.candle_modifier, 2)}</span>}
                />
              </div>

              {patterns.data.candle_signals.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {patterns.data.candle_signals.map((s) => (
                    <span
                      key={s}
                      className="rounded bg-inset px-1.5 py-0.5 text-[11px] text-ink-2"
                    >
                      {s.replace(/_/g, " ")}
                    </span>
                  ))}
                </div>
              )}
            </>
          ) : (
            <p className="text-[13px] text-ink-3">
              Bu sembol için formasyon hesaplanamadı — yeterli fiyat geçmişi yok.
            </p>
          )}
        </Section>

        <Section title="Puan kartı" term="puan" padded={false} className="lg:col-span-1">
          {score.data?.rationale ? (
            <ScoreCard rationale={score.data.rationale} className="border-0" />
          ) : (
            <p className="px-5 py-4 text-[13px] text-ink-3">
              Bu sembol için henüz puan hesaplanmamış. Puanlar karar barı kapandığında üretilir.
            </p>
          )}
        </Section>
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
    strategies.data?.find((s) => s.id === strategyId) ?? strategies.data?.[0] ?? null;

  /* En yüksek sürüm numarası taban alınır. */
  const latest = strategy
    ? [...strategy.versions].sort((a, b) => b.version - a.version)[0]
    : null;

  useEffect(() => {
    if (latest && draft === null) setDraft(structuredClone(latest.definition));
  }, [latest, draft]);

  const save = useMutation({
    mutationFn: () =>
      api.post(`/strategies/${strategy!.id}/versions`, { definition: draft }),
    onSuccess: () => {
      toast.success(
        "Yeni sürüm oluşturuldu",
        "Çalışan botlar etkilenmedi. Kullanmak için botu bu sürüme geçirin.",
      );
      void qc.invalidateQueries({ queryKey: ["strategies"] });
      setDraft(null);
    },
    onError: (e: Error) => toast.error("Kaydedilemedi", e.message),
  });

  if (!can("TRADER")) return null;

  return (
    <Section
      title="Strateji kurgu atölyesi"
      term="strateji_surum"
      description="Ayarları düzenleyin ve yeni sürüm olarak kaydedin. Mevcut sürüm değişmez, çalışan botlar etkilenmez."
      actions={
        <div className="flex items-center gap-2">
          {(strategies.data?.length ?? 0) > 1 && (
            <select
              value={strategy?.id ?? ""}
              onChange={(e) => {
                setStrategyId(Number(e.target.value));
                setDraft(null);
              }}
              className="h-8 rounded-lg border border-line bg-inset px-2.5 text-[12.5px] text-ink focus:border-brand focus:outline-none"
            >
              {strategies.data!.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          )}
          <Button
            size="sm"
            variant="amber"
            shape="rect"
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
          description="Önce Stratejiler sayfasından bir strateji oluşturun."
        />
      ) : (
        <>
          <p className="mb-4 rounded-lg border border-line bg-elev px-3.5 py-2.5 text-[12.5px] leading-relaxed text-ink-2">
            <strong className="font-medium text-ink">{strategy.name}</strong> · sürüm{" "}
            {latest.version} taban alınıyor. Kaydettiğinizde sürüm{" "}
            {latest.version + 1} oluşur.
          </p>

          <div className="space-y-5">
            {STRATEGY_GROUPS.filter((g) => g.key !== "temel").map((group) => (
              <div key={group.key}>
                <h3 className="text-[13px] font-semibold text-ink">{group.title}</h3>
                <p className="mt-0.5 mb-2 max-w-3xl text-[12px] leading-relaxed text-ink-2">
                  {group.description}
                </p>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {group.fields.map((field) => (
                    <EditableField
                      key={field.path}
                      field={field}
                      value={readPath(draft, field.path)}
                      onChange={(v) =>
                        setDraft((d) => (d ? writePath({ ...d }, field.path, v) : d))
                      }
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </Section>
  );
}

function EditableField({
  field,
  value,
  onChange,
}: {
  field: FieldSpec;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  return (
    <div className="rounded-lg border border-line px-3 py-2.5">
      <label className="block">
        <span className="text-[12px] font-medium text-ink">{field.label}</span>

        {field.kind === "boolean" ? (
          <span className="mt-1.5 flex items-center gap-2">
            <input
              type="checkbox"
              checked={Boolean(value)}
              onChange={(e) => onChange(e.target.checked)}
              className="accent-[var(--brand)]"
            />
            <span className="text-[12px] text-ink-2">{value ? "Açık" : "Kapalı"}</span>
          </span>
        ) : field.kind === "text" ? (
          <input
            value={String(value ?? "")}
            onChange={(e) => onChange(e.target.value)}
            className="mt-1 h-8 w-full rounded-lg border border-line bg-inset px-2.5 text-[12.5px] text-ink focus:border-brand focus:outline-none"
          />
        ) : (
          <span className="mt-1 flex items-center gap-1.5">
            <input
              type="number"
              value={typeof value === "number" ? value : ""}
              min={field.min}
              max={field.max}
              step={field.step ?? (field.kind === "integer" ? 1 : 0.01)}
              onChange={(e) =>
                onChange(e.target.value === "" ? null : Number(e.target.value))
              }
              className="num h-8 w-full rounded-lg border border-line bg-inset px-2.5 text-[12.5px] text-ink focus:border-brand focus:outline-none"
            />
            {field.unit && <span className="text-[11px] text-ink-3">{field.unit}</span>}
          </span>
        )}
      </label>

      <p className="mt-1.5 text-[11.5px] leading-relaxed text-ink-2">{field.description}</p>
      {field.warning && (
        <p className="mt-1 border-l-2 border-warn pl-2 text-[11.5px] leading-relaxed text-ink-3">
          {field.warning}
        </p>
      )}
    </div>
  );
}
