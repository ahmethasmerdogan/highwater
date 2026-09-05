"use client";

/**
 * Künye şeridi — her ekranın üstünde, kalıcı.
 *
 * Sayfa değil bir **katman**: hangi ekranda olursanız olun, ekrandaki
 * sayıların hangi ana ait olduğunu ve sistemin o an sağlam olup olmadığını
 * söyler. Kullanıcı günde birkaç kez birkaç dakika bakıyor; ilk bakışta
 * cevaplanması gereken soru "bugün benden habersiz ne bozuldu?".
 *
 * Şerit üç şey taşır: üretim zamanı (veri ne kadar taze), donuk kol sayısı
 * (sessizlik bir durumdur) ve kesici payı (birinci arızanın kalıcı organı).
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { api, type Nobet } from "@/lib/api";
import { adet, sayi } from "./olcum";

const EKRANLAR = [
  { yol: "/", ad: "Nöbet", soru: "Sistem şu an sağlam mı?" },
  { yol: "/zincir", ad: "Zincir", soru: "Karar nasıl alındı, aday nerede öldü?" },
  { yol: "/kanit", ad: "Kanıt", soru: "Puanlamanın öngörü gücü var mı?" },
  { yol: "/hipotez", ad: "Hipotez", soru: "Hangi soru soruluyor, kanıt ne durumda?" },
  { yol: "/defter", ad: "Defter", soru: "Ne kazandık, hangi koşulda, kaç işlemle?" },
];

function yas(iso: string | undefined): string {
  if (!iso) return "—";
  const saniye = (Date.now() - new Date(iso).getTime()) / 1000;
  if (saniye < 90) return `${Math.round(saniye)} sn önce`;
  if (saniye < 5400) return `${Math.round(saniye / 60)} dk önce`;
  return `${Math.round(saniye / 3600)} sa önce`;
}

export function KunyeSeridi({ onKutuk }: { onKutuk: () => void }) {
  const yol = usePathname();
  const { data } = useQuery({
    queryKey: ["nobet", 24],
    queryFn: () => api.get<Nobet>("/kontrol/nobet", { saat: 24 }),
    refetchInterval: 30_000,
  });

  const donuk = data?.donuk.length ?? 0;
  const pay = data?.kesici_payi.pay ?? null;
  const kuralIhlali = pay !== null && pay < (data?.kesici_payi.kural ?? 1.5);

  return (
    <header
      style={{
        position: "sticky",
        top: 0,
        zIndex: 30,
        background: "var(--v4-oyuk)",
        borderBottom: "1px solid var(--v4-cizgi-koyu)",
      }}
    >
      <div className="flex items-center gap-6 px-4" style={{ height: 34 }}>
        <Link href="/" className="v4-etiket" style={{ color: "var(--v4-murekkep)", letterSpacing: "0.14em" }}>
          HIGHWATER
        </Link>

        <nav className="flex items-center gap-1">
          {EKRANLAR.map((e) => {
            const aktif = e.yol === "/" ? yol === "/" : yol.startsWith(e.yol);
            return (
              <Link
                key={e.yol}
                href={e.yol}
                title={e.soru}
                className="v4-etiket"
                style={{
                  padding: "3px 9px",
                  borderRadius: 2,
                  color: aktif ? "var(--v4-murekkep)" : "var(--v4-ikincil)",
                  background: aktif ? "var(--v4-kagit)" : "transparent",
                  border: `1px solid ${aktif ? "var(--v4-cizgi-koyu)" : "transparent"}`,
                  transition: "color var(--v4-gecis), background var(--v4-gecis)",
                }}
              >
                {e.ad}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-5">
          {/* Sessizlik bir durumdur: donuk kol sayısı sıfır da olsa yer kaplar. */}
          <span className="v4-kunye" style={{ color: donuk ? "var(--v4-kirmizi)" : undefined }}>
            donuk kol {adet(donuk)}
          </span>
          <span className="v4-kunye" style={{ color: kuralIhlali ? "var(--v4-kirmizi)" : undefined }}>
            kesici payı {pay === null ? "—" : `${sayi(pay, 2)}×`}
          </span>
          <span className="v4-kunye">veri {yas(data?.uretim)}</span>
          <button
            type="button"
            onClick={onKutuk}
            className="v4-etiket"
            style={{
              padding: "2px 8px",
              border: "1px solid var(--v4-cizgi-koyu)",
              borderRadius: 2,
              background: "var(--v4-kagit)",
              color: "var(--v4-ikincil)",
            }}
            title="Kütük çekmecesi (~)"
          >
            kütük ~
          </button>
        </div>
      </div>
    </header>
  );
}

export { EKRANLAR };
