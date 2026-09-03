"use client";

/**
 * Sembol dosyası — sağdan açılan `Sheet` (DESIGN-V3 §4.3).
 *
 * Defter anatomisi: büyük harf bölüm etiketleri, kutusuz figürler, tek
 * kutu olarak puan kartı. Grafik + S/R, formasyon, 7 günlük puan seyri,
 * havuz ölçütleri ve (yetkiliye) strateji atölyesi. Kapatınca URL'den
 * `?sembol` düşer; sembol değişince sıfırdan kurulur (`key`).
 */

import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Collapsible, SegmentedControl, Sheet } from "uicean";
import { api, type Candle, type PatternInfo, type ScoreConfig, type ScoreDetail, type SRLevels, type UniverseSymbol } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { compact, dateTime, num, pct, price } from "@/lib/format";
import { Empty, Field, InfoDot, NumText, Tag } from "@/design";
import { CurveChart } from "@/design/chart";
import { PriceChart } from "@/design/price-chart";
import { ScoreCard } from "@/design/score-card";
import { DataGrid } from "@/grid/data-grid";
import type { GridColumn } from "@/grid/types";
import { Atolye } from "./atolye";
import type { Market } from "./ortak";

const TIMEFRAMES = ["15m", "1h", "4h", "1d"].map((value) => ({ value, label: value }));

/* Uç dört tür döndürür (`features/sr.py LevelKind`). */
const SR_TUR: Record<string, string> = { support: "Destek", resistance: "Direnç", poc: "POC", value_area: "Değer alanı" };

type Level = SRLevels["levels"][number];

const LEVEL_COLUMNS: GridColumn<Level>[] = [
  { id: "kind", header: "Tür", width: 110, value: (row) => SR_TUR[row.kind] ?? row.kind, cell: (row) => <span className="text-[12px]">{SR_TUR[row.kind] ?? row.kind}</span> },
  { id: "price", header: "Fiyat", width: 110, num: true, value: (row) => row.price, cell: (row) => <NumText text={price(row.price)} size="sm" /> },
  { id: "strength", header: "Güç", width: 80, num: true, value: (row) => row.strength, cell: (row) => <NumText text={num(row.strength, 2)} size="sm" /> },
  { id: "touches", header: "Dokunuş", width: 90, num: true, value: (row) => row.touches, cell: (row) => <NumText text={String(row.touches)} size="sm" /> },
];

/** Defter bölümü: büyük harf etiket + isteğe bağlı sağ eylem + içerik. Kutu yok. */
function Bolum({ title, hint, actions, children }: { title: ReactNode; hint?: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <section>
      <div className="flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-1.5 text-[11.5px] font-semibold tracking-[0.06em] text-ink-3 uppercase">{title}</h3>
        {actions}
      </div>
      {hint && <p className="mt-1 text-[12px] leading-snug text-ink-3">{hint}</p>}
      <div className="mt-2">{children}</div>
    </section>
  );
}

const Not = ({ children }: { children: ReactNode }) => <p className="text-[12px] leading-relaxed text-ink-3">{children}</p>;

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

  const score = useQuery({ queryKey: ["score", symbol], queryFn: () => api.get<ScoreDetail>(`/scores/${symbol}`), retry: false });
  const history = useQuery({
    queryKey: ["score-history", symbol, config?.config_hash],
    queryFn: () => api.get<{ bar_time: string; score: number }[]>(`/scores/${symbol}/history`, { days: 7, config_hash: config!.config_hash }),
    enabled: Boolean(config),
  });
  const candles = useQuery({
    queryKey: ["ohlcv", symbol, tf],
    queryFn: () => api.get<Candle[]>(`/symbols/${symbol}/ohlcv`, { tf, limit: 400 }),
    refetchInterval: 60_000,
  });
  const sr = useQuery({ queryKey: ["sr", symbol, tf], queryFn: () => api.get<SRLevels>(`/symbols/${symbol}/sr`, { tf }), retry: false });
  const patterns = useQuery({ queryKey: ["patterns", symbol, tf], queryFn: () => api.get<PatternInfo>(`/symbols/${symbol}/patterns`, { tf }), retry: false });

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
        pool ? (
          <>
            Havuz sırası <NumText text={String(pool.rank)} size="sm" />
            {config && (
              <>
                {" "}· {config.label} · <NumText text={config.timeframe} size="sm" />
              </>
            )}
          </>
        ) : (
          "Bu sembol güncel havuzda değil."
        )
      }
    >
      <div className="flex flex-col gap-6">
        {/* ---- Grafik ------------------------------------------------ */}
        <Bolum
          title={
            <>
              Grafik ve seviyeler
              <InfoDot id="karar_bari" />
            </>
          }
          actions={<SegmentedControl size="sm" value={tf} onChange={setTf} options={TIMEFRAMES} />}
        >
          {candles.isLoading ? (
            <div className="flex h-[320px] items-center justify-center text-[13px] text-ink-3">Grafik yükleniyor…</div>
          ) : candles.isError ? (
            <Empty title="Grafik getirilemedi" hint={candles.error instanceof Error ? candles.error.message : "API'ye ulaşılamıyor — bağlantı sorunu."} />
          ) : (candles.data ?? []).length === 0 ? (
            <Empty title="Bu sembol için veri yok" hint={`${symbol} sembolünün ${tf} verisi henüz indirilmemiş olabilir.`} />
          ) : (
            <PriceChart candles={candles.data ?? []} sr={sr.data} height={320} />
          )}
          <p className="mt-1.5 text-[11px] text-ink-3">Kesikli çizgiler hesaplanan seviyeler: kırmızı direnç, yeşil destek, amber en çok hacmin geçtiği fiyat.</p>
        </Bolum>

        {/* ---- Puan kartı — dosyadaki tek kutu ---------------------- */}
        <Bolum title="Puan kartı">
          {score.data?.rationale ? (
            <ScoreCard rationale={score.data.rationale} />
          ) : (
            <Not>Henüz puan yok. Puanlar karar barı kapandığında üretilir — havuza yeni girmiş bir sembol ilk barını bekliyor olabilir.</Not>
          )}
        </Bolum>

        {history.data && history.data.length > 1 && (
          <Bolum title="Son 7 gün" hint="Aynı puanlama ayarının puan geçmişi: bu puan yeni mi yükseldi?">
            <CurveChart
              series={[{ label: "Puan", color: "var(--sn-brand-solid)", points: history.data.map((h) => ({ at: h.bar_time, value: h.score })) }]}
              height={130}
              legend={false}
              valueFormat={(v) => num(v, 1)}
              labelFormat={(at) => dateTime(at)}
            />
          </Bolum>
        )}

        {/* ---- Destek / direnç + formasyon --------------------------- */}
        <div className="grid gap-6 md:grid-cols-2">
          <Bolum title="Destek ve direnç">
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
                  <div className="mt-3">
                    <DataGrid
                      rows={sr.data.levels}
                      columns={LEVEL_COLUMNS}
                      rowKey={(row) => `${row.kind}-${row.price}`}
                      storageKey="piyasa-sr"
                      searchable={false}
                      density="compact"
                      defaultSort={[{ id: "price", desc: true }]}
                      maxHeight={240}
                    />
                  </div>
                )}
              </>
            ) : (
              <Not>Destek/direnç hesaplanamadı — yeterli fiyat geçmişi yok.</Not>
            )}
          </Bolum>

          <Bolum title="Formasyonlar" hint="Formasyon tetikleyici değil çarpandır; puana katkısı bilinçli olarak küçüktür.">
            <Formasyonlar data={patterns.data} />
          </Bolum>
        </div>

        {/* ---- Havuz ölçütleri -------------------------------------- */}
        {pool && (
          <Bolum title="Havuza girme ölçütleri" hint="Filtrelerden geçerken ölçülen değerler.">
            <div className="grid gap-x-6 md:grid-cols-2">
              <Field label="Fiyat" value={<NumText text={price(pool.price)} size="sm" />} />
              <Field label="24 saatlik hacim" value={<NumText text={compact(pool.quote_volume)} size="sm" />} />
              <Field label="Spread" term="spread" value={<NumText text={pool.spread_pct === null ? "—" : pct(pool.spread_pct / 100, 3)} size="sm" />} />
              <Field label="Volatilite (yıllık)" value={<NumText text={pool.volatility_ann_pct === null ? "—" : `%${num(pool.volatility_ann_pct, 1)}`} size="sm" />} />
              <Field label="3 günlük aralık" value={<NumText text={pool.range_3d_pct === null ? "—" : `%${num(pool.range_3d_pct, 1)}`} size="sm" />} />
              <Field label="Yaş" value={<NumText text={pool.age_days === null ? "—" : `${num(pool.age_days, 0)} gün`} size="sm" />} />
            </div>
          </Bolum>
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
  if (!data) return <Not>Formasyon hesaplanamadı — yeterli fiyat geçmişi yok.</Not>;
  return (
    <>
      {data.matches.length === 0 ? (
        <Not>Tespit edilmiş formasyon yok. Bu normaldir — formasyonlar seyrek görülür.</Not>
      ) : (
        /* Kutu değil hairline satırlar: kutunun içinde kutu olmaz. */
        <ul>
          {data.matches.map((match, index) => (
            <li key={index} className="border-b border-line py-2 last:border-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[12.5px] font-medium text-ink">{match.kind.replace(/_/g, " ")}</span>
                <Tag tone={match.direction > 0 ? "up" : "down"}>{match.direction > 0 ? "yukarı" : "aşağı"}</Tag>
                <Tag tone={match.volume_confirmed ? "brand" : "neutral"}>{match.volume_confirmed ? "hacim doğruladı" : "hacim doğrulamadı"}</Tag>
              </div>
              <div className="mt-1 flex flex-wrap gap-x-4 text-[12px] text-ink-2">
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

      <div className="mt-3 flex flex-col border-t border-line pt-1">
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
      <p className="mt-2 text-[11px] leading-relaxed text-ink-3">{data.note}</p>
    </>
  );
}
