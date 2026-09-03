"use client";

/**
 * Sembol sayfası — sağdan açılan ayrıntı.
 *
 * Havuz ölçütleri, puan kartı, mum grafiği + destek/direnç, formasyonlar,
 * 7 günlük puan seyri ve (yetkiliye) strateji atölyesi. Kapatınca URL'den
 * `?sembol` düşer; içerik sembol değişince sıfırdan kurulur (`key`).
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Collapsible, Sheet } from "uicean";
import {
  api,
  type Candle,
  type PatternInfo,
  type ScoreConfig,
  type ScoreDetail,
  type SRLevels,
  type UniverseSymbol,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { compact, dateTime, num, pct, price } from "@/lib/format";
import { DrawerSection, Empty, Field, InfoDot, NumText, Segmented, Tag } from "@/design";
import { CurveChart } from "@/design/chart";
import { PriceChart } from "@/design/price-chart";
import { ScoreCard } from "@/design/score-card";
import { SimpleTable, type SimpleColumn } from "@/grid/simple-table";
import { Atolye } from "./atolye";
import type { Market } from "./ortak";

const TIMEFRAMES = ["15m", "1h", "4h", "1d"].map((value) => ({ value, label: value }));

/* Uç dört tür döndürür (`features/sr.py LevelKind`). */
const SR_TUR: Record<string, string> = {
  support: "Destek",
  resistance: "Direnç",
  poc: "POC",
  value_area: "Değer alanı",
};

const LEVEL_COLUMNS: SimpleColumn<SRLevels["levels"][number]>[] = [
  { header: "Tür", cell: (row) => <span style={{ fontSize: "var(--sn-t-caption)" }}>{SR_TUR[row.kind] ?? row.kind}</span> },
  { header: "Fiyat", num: true, cell: (row) => <NumText text={price(row.price)} size="sm" /> },
  { header: "Güç", num: true, cell: (row) => <NumText text={num(row.strength, 2)} size="sm" /> },
  { header: "Dokunuş", num: true, cell: (row) => <NumText text={String(row.touches)} size="sm" /> },
];

export function SembolSheet({
  symbol,
  market,
  pool,
  config,
  onClose,
}: {
  symbol: string;
  market: Market;
  /** Havuz satırı — sembol havuzda değilse (ör. eski puan) boş. */
  pool: UniverseSymbol | undefined;
  config: ScoreConfig | undefined;
  onClose: () => void;
}) {
  const { can } = useAuth();
  /* Hisse pazarları günlük barla çalışır; kripto karar barı 1 saattir. */
  const [tf, setTf] = useState(market === "CRYPTO" ? "1h" : "1d");

  const score = useQuery({
    queryKey: ["score", symbol],
    queryFn: () => api.get<ScoreDetail>(`/scores/${symbol}`),
    retry: false,
  });
  const history = useQuery({
    queryKey: ["score-history", symbol, config?.config_hash],
    queryFn: () =>
      api.get<{ bar_time: string; score: number }[]>(`/scores/${symbol}/history`, {
        days: 7,
        config_hash: config!.config_hash,
      }),
    enabled: Boolean(config),
  });
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

  return (
    <Sheet
      open
      onClose={onClose}
      side="right"
      className="max-w-[760px]!"
      title={
        <span className="flex items-center gap-2">
          <span className="sn-num">{symbol}</span>
          {pool?.protected && <Tag tone="brand">korumalı</Tag>}
          {pool?.placeholder && <Tag tone="warn">ölçüm alınamadı</Tag>}
        </span>
      }
      description={
        pool
          ? `Havuz sırası ${pool.rank}${config ? ` · ${config.label} · ${config.timeframe}` : ""}`
          : "Bu sembol güncel havuzda değil."
      }
    >
      <div className="flex flex-col gap-5">
        {/* ---- Grafik ------------------------------------------------ */}
        <section>
          <div className="mb-2 flex items-center justify-between gap-3">
            <span className="sn-label flex items-center gap-1">
              Grafik ve seviyeler
              <InfoDot id="karar_bari" />
            </span>
            <Segmented size="sm" value={tf} onChange={setTf} options={TIMEFRAMES} />
          </div>
          {candles.isLoading ? (
            <div className="flex h-[320px] items-center justify-center" style={{ fontSize: "var(--sn-t-body)", color: "var(--sn-ink-3)" }}>
              Grafik yükleniyor…
            </div>
          ) : candles.isError ? (
            <Empty
              title="Grafik getirilemedi"
              hint={candles.error instanceof Error ? candles.error.message : "API'ye ulaşılamıyor — bağlantı sorunu."}
            />
          ) : (candles.data ?? []).length === 0 ? (
            <Empty title="Bu sembol için veri yok" hint={`${symbol} sembolünün ${tf} verisi henüz indirilmemiş olabilir.`} />
          ) : (
            <PriceChart candles={candles.data ?? []} sr={sr.data} height={320} />
          )}
          <p className="mt-1.5" style={{ fontSize: "var(--sn-t-micro)", color: "var(--sn-ink-3)" }}>
            Kesikli çizgiler hesaplanan seviyeler: kırmızı direnç, yeşil destek, amber en çok hacmin geçtiği fiyat.
          </p>
        </section>

        {/* ---- Puan kartı ------------------------------------------- */}
        {score.data?.rationale ? (
          <ScoreCard rationale={score.data.rationale} />
        ) : (
          <p
            className="rounded-[var(--sn-r-sm)] px-3.5 py-3"
            style={{ border: "1px dashed var(--sn-border)", fontSize: "var(--sn-t-caption)", color: "var(--sn-ink-3)" }}
          >
            Bu sembol için henüz puan hesaplanmamış. Puanlar karar barı kapandığında üretilir — havuza yeni girmiş
            bir sembol ilk barını bekliyor olabilir.
          </p>
        )}

        {history.data && history.data.length > 1 && (
          <DrawerSection title="Son 7 gün" hint="Aynı puanlama ayarının puan geçmişi. Eğri “bu puan yeni mi yükseldi?” sorusuna cevap verir.">
            <CurveChart
              series={[
                {
                  label: "Puan",
                  color: "var(--sn-brand-solid)",
                  points: history.data.map((h) => ({ at: h.bar_time, value: h.score })),
                },
              ]}
              height={130}
              legend={false}
              valueFormat={(v) => num(v, 1)}
              labelFormat={(at) => dateTime(at)}
            />
          </DrawerSection>
        )}

        {/* ---- Destek / direnç + formasyon --------------------------- */}
        <div className="grid gap-5 md:grid-cols-2">
          <DrawerSection title="Destek ve direnç">
            {sr.data ? (
              <>
                <div className="flex flex-col">
                  <Field label="Güncel fiyat" value={<NumText text={price(sr.data.price)} size="sm" />} />
                  <Field label="Direnç" value={<NumText text={price(sr.data.resistance)} size="sm" />} />
                  <Field label="Destek" value={<NumText text={price(sr.data.support)} size="sm" />} />
                  <Field label="Ödül/risk" term="rr" value={<NumText text={num(sr.data.rr_geometry, 2)} size="sm" />} />
                  <Field label="POC" term="poc" value={<NumText text={price(sr.data.poc)} size="sm" />} />
                  <Field label="ATR" term="atr" value={<NumText text={price(sr.data.atr)} size="sm" />} />
                </div>
                {sr.data.levels.length > 0 && (
                  <div className="sn-scroll mt-3 max-h-[200px] overflow-y-auto">
                    <SimpleTable rows={sr.data.levels} columns={LEVEL_COLUMNS} rowKey={(row) => `${row.kind}-${row.price}`} dense />
                  </div>
                )}
              </>
            ) : (
              <p style={{ fontSize: "var(--sn-t-caption)", color: "var(--sn-ink-3)" }}>
                Destek/direnç hesaplanamadı — yeterli fiyat geçmişi yok.
              </p>
            )}
          </DrawerSection>

          <DrawerSection title="Formasyonlar" hint="Formasyon bir tetikleyici değil, çarpandır; puana katkısı bilinçli olarak küçüktür.">
            <Formasyonlar data={patterns.data} />
          </DrawerSection>
        </div>

        {/* ---- Havuz ölçütleri -------------------------------------- */}
        {pool && (
          <DrawerSection title="Havuza girme ölçütleri" hint="Bu sembolün filtrelerden geçerken ölçülen değerleri.">
            <div className="grid gap-x-6 md:grid-cols-2">
              <Field label="Fiyat" value={<NumText text={price(pool.price)} size="sm" />} />
              <Field label="24 saatlik hacim" value={<NumText text={compact(pool.quote_volume)} size="sm" />} />
              <Field
                label="Spread"
                term="spread"
                value={<NumText text={pool.spread_pct === null ? "—" : pct(pool.spread_pct / 100, 3)} size="sm" />}
              />
              <Field
                label="Volatilite (yıllık)"
                value={<NumText text={pool.volatility_ann_pct === null ? "—" : `%${num(pool.volatility_ann_pct, 1)}`} size="sm" />}
              />
              <Field
                label="3 günlük aralık"
                value={<NumText text={pool.range_3d_pct === null ? "—" : `%${num(pool.range_3d_pct, 1)}`} size="sm" />}
              />
              <Field label="Yaş" value={<NumText text={pool.age_days === null ? "—" : `${num(pool.age_days, 0)} gün`} size="sm" />} />
            </div>
          </DrawerSection>
        )}

        {/* ---- Atölye ----------------------------------------------- */}
        {can("TRADER") && (
          <Collapsible
            trigger={
              <span className="flex items-center gap-1.5">
                Strateji kurgu atölyesi
                <InfoDot id="strateji_surum" />
              </span>
            }
          >
            <Atolye />
          </Collapsible>
        )}
      </div>
    </Sheet>
  );
}

/* ------------------------------------------------------------------ */

function Formasyonlar({ data }: { data: PatternInfo | undefined }) {
  if (!data) {
    return (
      <p style={{ fontSize: "var(--sn-t-caption)", color: "var(--sn-ink-3)" }}>
        Formasyon hesaplanamadı — yeterli fiyat geçmişi yok.
      </p>
    );
  }
  return (
    <>
      {data.matches.length === 0 ? (
        <p style={{ fontSize: "var(--sn-t-caption)", color: "var(--sn-ink-3)" }}>
          Tespit edilmiş formasyon yok. Bu normaldir — formasyonlar seyrek görülür.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {data.matches.map((match, index) => (
            <li key={index} className="rounded-[var(--sn-r-sm)] px-3 py-2" style={{ border: "1px solid var(--sn-border)" }}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium" style={{ fontSize: "var(--sn-t-caption)", color: "var(--sn-ink)" }}>
                  {match.kind.replace(/_/g, " ")}
                </span>
                <Tag tone={match.direction > 0 ? "up" : "down"}>{match.direction > 0 ? "yukarı" : "aşağı"}</Tag>
                {match.volume_confirmed ? (
                  <Tag tone="brand">hacim doğruladı</Tag>
                ) : (
                  <Tag tone="neutral">hacim doğrulamadı</Tag>
                )}
              </div>
              <div className="mt-1 flex flex-wrap gap-x-4" style={{ fontSize: "var(--sn-t-caption)", color: "var(--sn-ink-2)" }}>
                <span>
                  güven <NumText text={num(match.confidence, 2)} size="sm" />
                </span>
                {match.neckline !== null && (
                  <span>
                    boyun <NumText text={price(match.neckline)} size="sm" />
                  </span>
                )}
                {match.target !== null && (
                  <span>
                    hedef <NumText text={price(match.target)} size="sm" />
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 flex flex-col pt-1" style={{ borderTop: "1px solid var(--sn-hairline)" }}>
        <Field label="Formasyon katkısı" value={<NumText text={num(data.pattern_modifier, 2)} size="sm" />} />
        <Field label="Mum sinyali katkısı" value={<NumText text={num(data.candle_modifier, 2)} size="sm" />} />
      </div>

      {data.candle_signals.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {data.candle_signals.map((signal) => (
            <Tag key={signal} tone="neutral">
              {signal.replace(/_/g, " ")}
            </Tag>
          ))}
        </div>
      )}
      <p className="mt-2" style={{ fontSize: "var(--sn-t-micro)", color: "var(--sn-ink-3)", lineHeight: 1.5 }}>
        {data.note}
      </p>
    </>
  );
}
