"use client";

/**
 * ZİNCİR — "Karar nasıl alındı, aday nerede öldü, veri sağlam mı?"
 *
 * Karar zinciri dört basamaktır: veri → havuz → puan → boyut → emir. Bu ekran
 * o zinciri tek sayfada gösterir. v3'te aynı bilgi üç sayfaya dağılmıştı
 * (Piyasa, Botlar, Günlük) ve sentez kullanıcıya kalıyordu.
 *
 * Merkezi bileşen karar hunisidir (§4). Sağında havuz hunisi (likidite
 * filtresi) ve veri kalitesi durur; ikisi de zincirin daha erken basamakları.
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, type DataQualityEntry, type FunnelStep, type Huni, type Nobet } from "@/lib/api";
import { Bolum, Etiket, Muhakeme } from "@/v4/kutu";
import { adet, Damga, Sessizlik } from "@/v4/olcum";
import { KararHunisi, OZELLIK_ADI } from "@/v4/huni";

const OZELLIKLER = ["atr_pct", "bb_width", "trend_1d", "ret_168h_skip6", "taker_buy_ratio"];
const PENCERELER = [
  { saat: 24, ad: "24 saat" },
  { saat: 72, ad: "3 gün" },
  { saat: 168, ad: "7 gün" },
];

export default function ZincirEkrani() {
  const [ozellik, setOzellik] = useState("atr_pct");
  const [saat, setSaat] = useState(24);
  const [botId, setBotId] = useState<number | null>(null);

  const nobet = useQuery({
    queryKey: ["nobet", 24],
    queryFn: () => api.get<Nobet>("/kontrol/nobet", { saat: 24 }),
  });
  const huni = useQuery({
    queryKey: ["huni", saat, ozellik, botId],
    queryFn: () => api.get<Huni>("/kontrol/huni", { saat, ozellik, bot_id: botId }),
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

  return (
    <>
      <Bolum
        baslik="karar hunisi"
        soru="Kapıyı geçen aday nerede öldü ve ölenlerin ölçülen kenarı neydi?"
        sag={
          <div className="flex items-center gap-2">
            <select
              className="v4-olcum"
              value={botId ?? ""}
              onChange={(e) => setBotId(e.target.value ? Number(e.target.value) : null)}
              style={{
                border: "1px solid var(--v4-cizgi-koyu)",
                borderRadius: 2,
                padding: "2px 6px",
                background: "var(--v4-kagit)",
              }}
            >
              <option value="">tüm kollar</option>
              {(nobet.data?.kollar ?? []).map((k) => (
                <option key={k.id} value={k.id}>
                  {k.id} · {k.ad}
                </option>
              ))}
            </select>
            <select
              className="v4-olcum"
              value={ozellik}
              onChange={(e) => setOzellik(e.target.value)}
              style={{
                border: "1px solid var(--v4-cizgi-koyu)",
                borderRadius: 2,
                padding: "2px 6px",
                background: "var(--v4-kagit)",
              }}
            >
              {OZELLIKLER.map((o) => (
                <option key={o} value={o}>
                  {OZELLIK_ADI[o]}
                </option>
              ))}
            </select>
            {PENCERELER.map((p) => (
              <button
                key={p.saat}
                type="button"
                onClick={() => setSaat(p.saat)}
                className="v4-etiket"
                style={{
                  padding: "2px 7px",
                  borderRadius: 2,
                  border: "1px solid var(--v4-cizgi-koyu)",
                  background: saat === p.saat ? "var(--v4-oyuk)" : "var(--v4-kagit)",
                  color: saat === p.saat ? "var(--v4-murekkep)" : "var(--v4-ikincil)",
                }}
              >
                {p.ad}
              </button>
            ))}
          </div>
        }
      >
        {huni.isLoading ? (
          <div className="v4-kunye px-4 py-3">huni okunuyor…</div>
        ) : huni.data ? (
          <>
            <div className="v4-kunye px-4 pt-2">
              {adet(huni.data.bar_sayisi)} bar · {huni.data.pencere_saat} saat ·{" "}
              {botId ? `kol ${botId}` : "tüm kollar"} · üretim{" "}
              {new Date(huni.data.uretim).toLocaleString("tr-TR")}
            </div>
            <KararHunisi veri={huni.data} ozellik={ozellik} />
          </>
        ) : (
          <Sessizlik beklenen="Karar izi okunamadı." />
        )}
      </Bolum>

      <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(420px, 1fr))" }}>
        <Bolum
          baslik="havuz hunisi"
          soru="Kesit kurulurken hangi filtre kaç sembol düşürdü?"
          sag={
            havuz.data?.taken_at ? (
              <span className="v4-kunye">
                {new Date(havuz.data.taken_at).toLocaleString("tr-TR")}
              </span>
            ) : null
          }
        >
          {havuz.data?.funnel?.length ? (
            <table className="v4-tablo">
              <thead>
                <tr>
                  <th style={{ width: 34 }}>#</th>
                  <th>filtre</th>
                  <th className="sayi" style={{ width: 74 }}>
                    kalan
                  </th>
                  <th className="sayi" style={{ width: 74 }}>
                    düşen
                  </th>
                  <th>örnek</th>
                </tr>
              </thead>
              <tbody>
                {havuz.data.funnel.map((f) => (
                  <tr key={f.index}>
                    <td className="sayi" style={{ color: "var(--v4-ikincil)" }}>
                      {f.index}
                    </td>
                    <td>{f.name}</td>
                    <td className="sayi">{adet(f.kept)}</td>
                    <td className="sayi" style={{ color: f.dropped ? undefined : "var(--v4-olu)" }}>
                      {adet(f.dropped)}
                    </td>
                    <td className="v4-kunye">{f.examples.slice(0, 3).join(" ") || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <Sessizlik beklenen="Havuz anlık görüntüsü yok. Havuz her yenilemede DB'ye snapshot'lanır (bozulmaz kural 3); snapshot yoksa dürüst backtest imkânsızdır." />
          )}
        </Bolum>

        <Bolum
          baslik="veri kalitesi"
          soru="Zincirin ilk basamağında ne bozuk?"
          sag={
            kalite.data?.length ? (
              <Damga tur="supheli">{kalite.data.filter((k) => !k.resolved).length} açık</Damga>
            ) : (
              <Damga tur="saglikli">açık kayıt yok</Damga>
            )
          }
        >
          {kalite.data?.length ? (
            <table className="v4-tablo">
              <thead>
                <tr>
                  <th>tür</th>
                  <th>sembol</th>
                  <th style={{ width: 56 }}>dilim</th>
                  <th style={{ width: 82 }}>ağırlık</th>
                  <th style={{ width: 74 }}>durum</th>
                </tr>
              </thead>
              <tbody>
                {kalite.data.slice(0, 14).map((k) => (
                  <tr key={k.id}>
                    <td>{k.kind}</td>
                    <td className="sayi" style={{ textAlign: "left" }}>
                      {k.symbol}
                    </td>
                    <td className="sayi">{k.timeframe}</td>
                    <td>
                      <span
                        className="v4-etiket"
                        style={{
                          color:
                            k.severity === "CRITICAL" || k.severity === "ERROR"
                              ? "var(--v4-kirmizi)"
                              : "var(--v4-amber)",
                        }}
                      >
                        {k.severity}
                      </span>
                    </td>
                    <td className="v4-kunye">{k.resolved ? "kapandı" : "açık"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="px-4 py-4">
              <Etiket>kayıt yok</Etiket>
              <Muhakeme>
                Kalite raporu boş. Bu iyi haber değil, bir ölçüm yokluğudur: denetimin
                koştuğunu ve hiçbir şey bulmadığını ayırt eden bir sayaç henüz yok.
              </Muhakeme>
            </div>
          )}
        </Bolum>
      </div>
    </>
  );
}
