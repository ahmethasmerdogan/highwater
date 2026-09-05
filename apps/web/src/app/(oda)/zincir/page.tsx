"use client";

/**
 * ZİNCİR — "Karar nasıl alındı, aday nerede öldü, veri sağlam mı?"
 *
 * Karar zinciri dört basamaktır: veri → havuz → puan → boyut → emir. Bu ekran
 * o zinciri tek sayfada gösterir; v3'te aynı bilgi üç sayfaya dağılmıştı
 * (Piyasa, Botlar, Günlük) ve sentez kullanıcıya kalıyordu.
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, type DataQualityEntry, type FunnelStep, type Huni, type Nobet } from "@/lib/api";
import { Kart, Not } from "@/panel/kart";
import { adet, Damga, Kunye, MONO, Sessizlik } from "@/panel/olcum";
import { KararHunisi, OZELLIK_ADI } from "@/panel/huni";
import { Secim } from "@/panel/secim";
import { Chip } from "@/components/base/badges/chip";
import { Select, SelectItem } from "@/components/base/select/select";
import { cx } from "@/utils/cx";

const OZELLIKLER = ["atr_pct", "bb_width", "trend_1d", "ret_168h_skip6", "taker_buy_ratio"];
const PENCERELER = [
  { id: "24", ad: "24 saat" },
  { id: "72", ad: "3 gün" },
  { id: "168", ad: "7 gün" },
] as const;

export default function ZincirEkrani() {
  const [ozellik, setOzellik] = useState("atr_pct");
  const [saat, setSaat] = useState<"24" | "72" | "168">("24");
  const [botId, setBotId] = useState<string>("hepsi");

  const nobet = useQuery({
    queryKey: ["nobet", 24],
    queryFn: () => api.get<Nobet>("/kontrol/nobet", { saat: 24 }),
  });
  const huni = useQuery({
    queryKey: ["huni", saat, ozellik, botId],
    queryFn: () =>
      api.get<Huni>("/kontrol/huni", {
        saat: Number(saat),
        ozellik,
        bot_id: botId === "hepsi" ? undefined : Number(botId),
      }),
    refetchInterval: 60_000,
  });
  const havuz = useQuery({
    queryKey: ["havuz-huni"],
    queryFn: () =>
      api.get<{ taken_at: string | null; funnel: FunnelStep[]; final: number }>(
        "/universe/funnel",
      ),
  });
  const kalite = useQuery({
    queryKey: ["kalite"],
    queryFn: () => api.get<DataQualityEntry[]>("/data-quality", { limit: 40 }),
  });

  const kollar = [
    { id: "hepsi", label: "Tüm kollar" },
    ...(nobet.data?.kollar ?? []).map((k) => ({ id: String(k.id), label: `${k.id} · ${k.ad}` })),
  ];
  const acikKalite = (kalite.data ?? []).filter((k) => !k.resolved);

  return (
    <>
      <Kart
        baslik="Karar hunisi"
        soru="Kapıyı geçen aday nerede öldü ve ölenlerin ölçülen kenarı neydi?"
        sag={
          <>
            <div className="w-52">
              <Select
                aria-label="Kol"
                selectedKey={botId}
                onSelectionChange={(k) => setBotId(String(k))}
                size="sm"
              >
                {kollar.map((k) => (
                  <SelectItem key={k.id} id={k.id} textValue={k.label}>
                    {k.label}
                  </SelectItem>
                ))}
              </Select>
            </div>
            <Secim
              ariaLabel="Kenar özelliği"
              secenekler={OZELLIKLER.map((o) => ({ id: o, ad: OZELLIK_ADI[o] }))}
              deger={ozellik}
              degistir={setOzellik}
            />
            <Secim
              ariaLabel="Pencere"
              secenekler={[...PENCERELER]}
              deger={saat}
              degistir={setSaat}
            />
          </>
        }
        govdeSiz
      >
        {huni.isLoading ? (
          <p className="px-5 py-6 text-body-2-regular text-text-tertiary">huni okunuyor…</p>
        ) : huni.data ? (
          <>
            <Kunye className="px-5 pb-2">
              {adet(huni.data.bar_sayisi)} bar · {huni.data.pencere_saat} saat ·{" "}
              {botId === "hepsi" ? "tüm kollar" : `kol ${botId}`} · üretim{" "}
              {new Date(huni.data.uretim).toLocaleString("tr-TR")}
            </Kunye>
            <KararHunisi veri={huni.data} ozellik={ozellik} />
          </>
        ) : (
          <Sessizlik beklenen="Karar izi okunamadı." />
        )}
      </Kart>

      <div className="grid gap-4 xl:grid-cols-2">
        <Kart
          baslik="Havuz hunisi"
          soru="Kesit kurulurken hangi filtre kaç sembol düşürdü?"
          sag={
            havuz.data?.taken_at ? (
              <Kunye>{new Date(havuz.data.taken_at).toLocaleString("tr-TR")}</Kunye>
            ) : null
          }
          govdeSiz
        >
          {havuz.data?.funnel?.length ? (
            <ul className="divide-y divide-separator-border">
              {havuz.data.funnel.map((f) => {
                const en = havuz.data!.funnel[0]?.kept || 1;
                return (
                  <li key={f.index} className="px-5 py-2.5">
                    <div className="flex items-baseline gap-3">
                      <span className={cx(MONO, "w-6 text-caption-1-regular text-text-placeholder")}>
                        {f.index}
                      </span>
                      <span className="flex-1 truncate text-body-2-regular text-text-primary">
                        {f.name}
                      </span>
                      <span className={cx(MONO, "text-body-2-medium text-text-primary")}>
                        {adet(f.kept)}
                      </span>
                      {f.dropped ? (
                        <Chip variant="caption" color="neutral">
                          <span className={MONO}>{f.dropped > 0 ? "−" : "+"}{adet(Math.abs(f.dropped))}</span>
                        </Chip>
                      ) : (
                        <Chip variant="caption" color="gray">
                          hiç düşürmedi
                        </Chip>
                      )}
                    </div>
                    <div className="mt-1.5 ml-9 h-1 overflow-hidden rounded-full bg-chart-track">
                      <div
                        className="h-full rounded-full bg-chart-neutral"
                        style={{ width: `${Math.min(100, (f.kept / en) * 100)}%` }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <Sessizlik beklenen="Havuz anlık görüntüsü yok. Havuz her yenilemede DB'ye snapshot'lanır (bozulmaz kural 3); snapshot yoksa dürüst backtest imkânsızdır." />
          )}
        </Kart>

        <Kart
          baslik="Veri kalitesi"
          soru="Zincirin ilk basamağında ne bozuk?"
          sag={
            <Damga durum={acikKalite.length ? "uyari" : "notr"}>
              {acikKalite.length ? `${acikKalite.length} açık` : "açık kayıt yok"}
            </Damga>
          }
          govdeSiz
        >
          {kalite.data?.length ? (
            <ul className="divide-y divide-separator-border">
              {kalite.data.slice(0, 14).map((k) => (
                <li key={k.id} className="flex items-center gap-3 px-5 py-2.5">
                  <Chip
                    variant="caption"
                    color={
                      k.severity === "CRITICAL" || k.severity === "ERROR" ? "rose" : "yellow"
                    }
                  >
                    {k.severity}
                  </Chip>
                  <span className="text-body-2-regular text-text-primary">{k.kind}</span>
                  <span className={cx(MONO, "text-body-2-regular text-text-secondary")}>
                    {k.symbol}
                  </span>
                  <span className={cx(MONO, "text-caption-1-regular text-text-tertiary")}>
                    {k.timeframe}
                  </span>
                  <span className="ml-auto">
                    <Chip variant="caption" color={k.resolved ? "gray" : "yellow"}>
                      {k.resolved ? "kapandı" : "açık"}
                    </Chip>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="px-5 py-6">
              <Not>
                Kalite raporu boş. Bu iyi haber değil, bir ölçüm yokluğudur: denetimin koştuğunu
                ve hiçbir şey bulmadığını ayırt eden bir sayaç henüz yok.
              </Not>
            </div>
          )}
        </Kart>
      </div>
    </>
  );
}
