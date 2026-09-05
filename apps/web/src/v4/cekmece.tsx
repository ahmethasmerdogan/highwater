"use client";

/**
 * Kütük çekmecesi — sağdan açılır, `~` ile.
 *
 * v3'te "Günlük" adında bir sayfa vardı ve olay akışı orada yaşıyordu.
 * Ayrı sayfa olması sentezi kullanıcıya bırakıyordu: "bot 12 donmuş"
 * Botlar'da, "BIST barı geldi" Piyasa'daydı; ikisini birleştirip "önbellek
 * bozuk" sonucuna varmak arayüzün değil insanın işiydi. Sekiz arızanın
 * sekizi de bu boşlukta yaşadı. Kütük artık her ekranın üzerinde açılır:
 * baktığınız sayının yanında, sayfayı terk etmeden.
 *
 * Hareket iki taneden biri: 260 ms kayma (§6).
 */

import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, type BotEvent } from "@/lib/api";
import { Etiket } from "./kutu";

const SEVIYE_RENK: Record<string, string> = {
  CRITICAL: "var(--v4-kirmizi)",
  ERROR: "var(--v4-kirmizi)",
  WARN: "var(--v4-amber)",
  INFO: "var(--v4-ikincil)",
};

function saat(iso: string): string {
  return new Date(iso).toLocaleTimeString("tr-TR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function KutukCekmecesi({ acik, kapat }: { acik: boolean; kapat: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ["kutuk"],
    queryFn: () => api.get<BotEvent[]>("/logs", { limit: 300 }),
    refetchInterval: acik ? 15_000 : false,
    enabled: acik,
  });

  useEffect(() => {
    if (!acik) return;
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") kapat();
    };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [acik, kapat]);

  return (
    <>
      {acik ? (
        <button
          type="button"
          aria-label="Kütüğü kapat"
          onClick={kapat}
          style={{ position: "fixed", inset: 0, zIndex: 40, background: "rgba(23,24,28,0.12)" }}
        />
      ) : null}
      <aside
        className="v4-cekmece"
        aria-hidden={!acik}
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          width: "min(560px, 92vw)",
          zIndex: 41,
          background: "var(--v4-kagit)",
          borderLeft: "1px solid var(--v4-cizgi-koyu)",
          transform: acik ? "translateX(0)" : "translateX(100%)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          className="flex items-center justify-between px-4"
          style={{ height: 34, borderBottom: "1px solid var(--v4-cizgi)", background: "var(--v4-oyuk)" }}
        >
          <Etiket>kütük · son 300 satır</Etiket>
          <button type="button" onClick={kapat} className="v4-kunye" style={{ cursor: "pointer" }}>
            kapat · esc
          </button>
        </div>
        <div style={{ overflowY: "auto", flex: 1 }}>
          {isLoading ? (
            <div className="v4-kunye px-4 py-3">okunuyor…</div>
          ) : !data?.length ? (
            <div className="px-4 py-4">
              <div className="v4-etiket" style={{ color: "var(--v4-amber)" }}>
                sessizlik
              </div>
              <p className="v4-muhakeme mt-1">
                Kütük boş. Koşan bir kol varken bu beklenen bir durum değildir; olay
                yazılmıyorsa ya kollar çalışmıyor ya da kayıt yolu kopmuş demektir.
              </p>
            </div>
          ) : (
            <table className="v4-tablo">
              <tbody>
                {data.map((olay) => (
                  <tr key={olay.id}>
                    <td className="sayi" style={{ width: 66, color: "var(--v4-ikincil)" }}>
                      {saat(olay.created_at)}
                    </td>
                    <td style={{ width: 62 }}>
                      <span
                        className="v4-etiket"
                        style={{ color: SEVIYE_RENK[olay.level] ?? "var(--v4-ikincil)" }}
                      >
                        {olay.level}
                      </span>
                    </td>
                    <td style={{ color: "var(--v4-murekkep)" }}>
                      <span className="v4-kunye" style={{ marginRight: 8 }}>
                        {olay.kind}
                      </span>
                      {String(
                        olay.payload?.message ??
                          olay.payload?.symbol ??
                          JSON.stringify(olay.payload ?? {}).slice(0, 160),
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </aside>
    </>
  );
}
