"use client";

/**
 * KANIT — "Puanlamanın öngörü gücü var mı, hangi kesitte, kaç satırla?"
 *
 * Sistemin birincil çıktısı ölçümdür (anayasa: "Bu proje ne DEĞİL"). Bu ekran
 * o ölçümü basar ve dürüst basmak zorundadır.
 *
 * **Kesit seçici zorunludur; "tümü" seçeneği yoktur.** Her IC/kalibrasyon
 * rakamı tek `config_hash` + dilim üzerinden okunur. Bu, 8. arızayı — beş
 * ayrı ölçeği ve KISA yön puanlarını tek dağılım sayma hatasını — yapısal
 * olarak imkânsız kılar. Ölçüldü (2026-09-05, 4 saatlik ufuk): havuz Spearman
 * +0,026 iken kollar tek tek +0,006 / +0,015 / +0,045 / +0,043 ve kısa kol
 * −0,031; üst desilin %59'u tek bir kolun puanıydı.
 */

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, type Calibration, type Gecersizlik, type ScoreConfig } from "@/lib/api";
import { Bolum, Etiket, Izgara, Muhakeme } from "@/v4/kutu";
import { adet, Damga, Olcum, sayi, Sessizlik } from "@/v4/olcum";

const UFUKLAR = ["4h", "24h", "72h"];

/** Desil çubuğu — ortalama değil MEDYAN; kripto dağılımı çarpık. */
function DesilCubugu({ veri }: { veri: Calibration }) {
  const degerler = veri.deciles.map((d) => d.median_return);
  const enBuyuk = Math.max(...degerler.map(Math.abs), 0.0001);
  return (
    <table className="v4-tablo">
      <thead>
        <tr>
          <th style={{ width: 54 }}>desil</th>
          <th className="sayi" style={{ width: 74 }}>
            n
          </th>
          <th className="sayi" style={{ width: 92 }}>
            ortalama puan
          </th>
          <th className="sayi" style={{ width: 96 }}>
            medyan getiri
          </th>
          <th>dağılım</th>
        </tr>
      </thead>
      <tbody>
        {veri.deciles.map((d) => {
          const oran = d.median_return / enBuyuk;
          const negatif = d.median_return < 0;
          return (
            <tr key={d.decile}>
              <td className="sayi" style={{ textAlign: "left" }}>
                D{d.decile}
              </td>
              <td className="sayi">{adet(d.count)}</td>
              <td className="sayi">{sayi(d.mean_score, 1)}</td>
              <td className="sayi" style={{ color: negatif ? "var(--v4-kirmizi)" : undefined }}>
                {sayi(d.median_return * 10000, 0)} bps
              </td>
              <td>
                <div style={{ position: "relative", height: 8 }}>
                  <div
                    style={{
                      position: "absolute",
                      left: "50%",
                      top: 0,
                      bottom: 0,
                      width: 1,
                      background: "var(--v4-cizgi-koyu)",
                    }}
                  />
                  <div
                    style={{
                      position: "absolute",
                      top: 1,
                      height: 6,
                      left: negatif ? `${50 + oran * 50}%` : "50%",
                      width: `${Math.abs(oran) * 50}%`,
                      background: negatif ? "var(--v4-kirmizi)" : "var(--v4-civit)",
                      transition: "background var(--v4-gecis)",
                    }}
                  />
                </div>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export default function KanitEkrani() {
  const [ufuk, setUfuk] = useState("24h");
  const [kesit, setKesit] = useState<{ hash: string; dilim: string } | null>(null);

  const configs = useQuery({
    queryKey: ["kesitler"],
    queryFn: () => api.get<ScoreConfig[]>("/scores/configs"),
  });

  // Kesit seçici zorunlu: seçim yapılmadan hiçbir rakam basılmaz.
  useEffect(() => {
    if (!kesit && configs.data?.length) {
      setKesit({ hash: configs.data[0].config_hash, dilim: configs.data[0].timeframe });
    }
  }, [kesit, configs.data]);

  // Geçersizlik geriye işler: bu kesit için bir ilan varsa rakamlar üstü
  // çizili basılır ve sebebi yanlarında durur (§2 kural 4).
  const gecersizlik = useQuery({
    queryKey: ["gecersizlik", "kalibrasyon", kesit?.hash],
    queryFn: () =>
      api.get<Gecersizlik[]>("/kontrol/gecersizlik", { scope: "kalibrasyon", key: kesit?.hash }),
    enabled: Boolean(kesit),
  });

  const kalibrasyon = useQuery({
    queryKey: ["kalibrasyon", ufuk, kesit?.hash],
    queryFn: () => api.get<Calibration>("/calibration", { horizon: ufuk, config_hash: kesit?.hash }),
    enabled: Boolean(kesit),
  });

  const secili = configs.data?.find(
    (c) => c.config_hash === kesit?.hash && c.timeframe === kesit?.dilim,
  );
  const k = kalibrasyon.data;
  const iptal = gecersizlik.data?.[0] ?? null;
  const iptalSebebi = iptal ? iptal.reason : null;

  return (
    <>
      <Bolum
        baslik="kesit"
        soru="Hangi puanlama ayarı, hangi karar dilimi? Bu seçim yapılmadan hiçbir kanıt rakamı basılmaz."
        sag={
          <div className="flex items-center gap-2">
            {UFUKLAR.map((u) => (
              <button
                key={u}
                type="button"
                onClick={() => setUfuk(u)}
                className="v4-etiket"
                style={{
                  padding: "2px 8px",
                  borderRadius: 2,
                  border: "1px solid var(--v4-cizgi-koyu)",
                  background: ufuk === u ? "var(--v4-oyuk)" : "var(--v4-kagit)",
                  color: ufuk === u ? "var(--v4-murekkep)" : "var(--v4-ikincil)",
                }}
              >
                {u} ufuk
              </button>
            ))}
          </div>
        }
      >
        {configs.isLoading ? (
          <div className="v4-kunye px-4 py-3">kesitler okunuyor…</div>
        ) : !configs.data?.length ? (
          <Sessizlik beklenen="Hiçbir puanlama kesiti yok. Koşan bir kol varken bu beklenen bir durum değildir: puan yazılmıyorsa kanıt da birikmez." />
        ) : (
          <table className="v4-tablo">
            <thead>
              <tr>
                <th style={{ width: 34 }} />
                <th>kesit</th>
                <th style={{ width: 74 }}>pazar</th>
                <th style={{ width: 62 }}>dilim</th>
                <th className="sayi" style={{ width: 78 }}>
                  sembol
                </th>
                <th className="sayi" style={{ width: 84 }}>
                  en yüksek
                </th>
                <th style={{ width: 150 }}>son bar</th>
              </tr>
            </thead>
            <tbody>
              {configs.data.map((c) => {
                const aktif = c.config_hash === kesit?.hash && c.timeframe === kesit?.dilim;
                return (
                  <tr
                    key={`${c.config_hash}-${c.timeframe}`}
                    onClick={() => setKesit({ hash: c.config_hash, dilim: c.timeframe })}
                    style={{
                      cursor: "pointer",
                      background: aktif ? "var(--v4-civit-zemin)" : undefined,
                      transition: "background var(--v4-gecis)",
                    }}
                  >
                    <td className="sayi" style={{ color: "var(--v4-civit)" }}>
                      {aktif ? "▸" : ""}
                    </td>
                    <td>
                      {c.label}
                      <span className="v4-kunye" style={{ marginLeft: 8 }}>
                        {c.config_hash.slice(0, 10)}
                      </span>
                    </td>
                    <td className="v4-kunye">{c.market}</td>
                    <td className="sayi">{c.timeframe}</td>
                    <td className="sayi">{adet(c.symbols)}</td>
                    <td className="sayi">{sayi(c.top_score, 1)}</td>
                    <td className="v4-kunye">
                      {new Date(c.bar_time).toLocaleString("tr-TR")}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Bolum>

      {!kesit ? null : kalibrasyon.isLoading ? (
        <div className="v4-kunye" style={{ padding: 16 }}>
          kanıt okunuyor…
        </div>
      ) : !k ? (
        <Sessizlik beklenen="Kalibrasyon okunamadı." />
      ) : (
        <>
          <Bolum
            baslik="öngörü gücü"
            soru="Puan ile ileri getiri arasında ölçülebilir bir ilişki var mı?"
            sag={
              iptal ? (
                <Damga tur="bozuk">geçersiz ilan edildi</Damga>
              ) : k.sufficient ? (
                <Damga tur="kanit">örneklem yeterli</Damga>
              ) : (
                <Damga tur="supheli">örneklem yetersiz</Damga>
              )
            }
          >
            <Izgara sutun={4}>
              <Olcum
                etiket="Spearman"
                deger={sayi(k.spearman, 4)}
                kunye={`n=${adet(k.n)} · ${adet(k.span_days)} gün · ${secili?.timeframe ?? "?"} · ${kesit.hash.slice(0, 8)}`}
                durum="kanit"
                olcek="duvar"
                gecersiz={iptalSebebi}
              />
              <Olcum
                etiket="kapı kenarı"
                deger={k.gate_edge === null ? "—" : `${sayi(k.gate_edge * 10000, 0)} bps`}
                kunye={`n=${adet(k.gate_n)} · ${adet(k.gate_days)} gün · havuza göre fark`}
                durum="kanit"
                olcek="duvar"
                gecersiz={iptalSebebi}
              />
              <Olcum
                etiket="kapı kenarı t (gün-kümelenmiş)"
                deger={sayi(k.gate_edge_t_daily, 2)}
                kunye="ham t bağımsızlık varsayar, ≈%70 şişkin"
                durum={
                  k.gate_edge_t_daily !== null && Math.abs(k.gate_edge_t_daily) >= 2
                    ? "kanit"
                    : "olu"
                }
                olcek="duvar"
              />
              <Olcum
                etiket="üst − alt desil"
                deger={
                  k.top_minus_bottom === null ? "—" : `${sayi(k.top_minus_bottom * 10000, 0)} bps`
                }
                kunye={`p=${sayi(k.top_minus_bottom_p, 3)} · ${k.monotonic ? "monoton" : "monoton değil"}`}
                durum="kanit"
                olcek="duvar"
              />
            </Izgara>
            <div className="px-4 pb-4">
              <Muhakeme>{k.verdict}</Muhakeme>
            </div>
            {iptal ? (
              <div
                className="px-4 py-3"
                style={{
                  borderTop: "1px solid var(--v4-cizgi)",
                  background: "var(--v4-kirmizi-zemin)",
                }}
              >
                <Etiket>geçersizlik ilanı</Etiket>
                <Muhakeme>{iptal.reason}</Muhakeme>
                <div className="v4-kunye mt-1">
                  ilan {new Date(iptal.created_at).toLocaleString("tr-TR")}
                  {iptal.period_end
                    ? ` · kapsam ${new Date(iptal.period_end).toLocaleDateString("tr-TR")} öncesi`
                    : " · tüm geçmiş"}
                  {" · kayıt silinmedi, üstü çizildi"}
                </div>
              </div>
            ) : null}
          </Bolum>

          <Bolum
            baslik="desiller"
            soru="Yüksek puan gerçekten yüksek getiri mi getiriyor?"
            sag={<span className="v4-kunye">medyan · piyasa-nötr değil · {ufuk} ufuk</span>}
          >
            {k.deciles.length ? (
              <DesilCubugu veri={k} />
            ) : (
              <Sessizlik
                beklenen="Bu kesitte desil kurulacak kadar gözlem yok. Gözlemler saatte bir yazılır; kesit yeni açıldıysa beklemek gerekir."
                bulunan={`n=${adet(k.n)}`}
              />
            )}
          </Bolum>

          <Bolum baslik="aile IC" soru="Kenar hangi özellik ailesinden geliyor?">
            <table className="v4-tablo">
              <thead>
                <tr>
                  <th>aile</th>
                  <th className="sayi" style={{ width: 110 }}>
                    IC
                  </th>
                  <th>güç</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(k.family_ic).map(([aile, ic]) => (
                  <tr key={aile}>
                    <td>{aile}</td>
                    <td
                      className="sayi"
                      style={{
                        color:
                          ic === null
                            ? "var(--v4-olu)"
                            : ic < 0
                              ? "var(--v4-kirmizi)"
                              : "var(--v4-civit)",
                      }}
                    >
                      {sayi(ic, 4)}
                    </td>
                    <td>
                      <div
                        style={{
                          height: 6,
                          width: `${Math.min(100, Math.abs(ic ?? 0) * 400)}%`,
                          background: (ic ?? 0) < 0 ? "var(--v4-kirmizi)" : "var(--v4-civit)",
                        }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="px-4 py-3" style={{ borderTop: "1px solid var(--v4-cizgi)" }}>
              <Muhakeme>
                Negatif IC&apos;li bir aile puana pozitif ağırlıkla giriyorsa, o ağırlık kenarı
                azaltıyor demektir. Ölçüldü (2026-09-04): formasyon ve mum düzelticilerinin
                IC&apos;si negatif; D1 kolu bunu canlıda sınıyor.
              </Muhakeme>
            </div>
          </Bolum>
        </>
      )}
    </>
  );
}
