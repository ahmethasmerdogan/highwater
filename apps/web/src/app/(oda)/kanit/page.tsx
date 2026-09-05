"use client";

/**
 * KANIT — "Puanlamanın öngörü gücü var mı, hangi kesitte, kaç satırla?"
 *
 * Sistemin birincil çıktısı ölçümdür (anayasa: "Bu proje ne DEĞİL"). Bu ekran
 * o ölçümü basar ve dürüst basmak zorundadır.
 *
 * **Kesit seçici zorunludur; "tümü" seçeneği yoktur.** Her IC/kalibrasyon
 * rakamı tek `config_hash` + dilim üzerinden okunur. Bu, 8. arızayı — beş ayrı
 * ölçeği ve KISA yön puanlarını tek dağılım sayma hatasını — yapısal olarak
 * imkânsız kılar.
 */

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { RiCheckboxCircleLine, RiFocus3Line, RiScales3Line, RiStackLine } from "@remixicon/react";
import { api, type Calibration, type Gecersizlik, type ScoreConfig } from "@/lib/api";
import { Izgara, Kart, Not, Serit } from "@/panel/kart";
import { adet, Damga, Kunye, MONO, Olcum, sayi, Sessizlik } from "@/panel/olcum";
import { SutunGrafik } from "@/panel/grafik";
import { Secim } from "@/panel/secim";
import { Chip } from "@/components/base/badges/chip";
import { cx } from "@/utils/cx";

const UFUKLAR = [
  { id: "4h", ad: "4 saat" },
  { id: "24h", ad: "24 saat" },
  { id: "72h", ad: "72 saat" },
] as const;

type Kesit = { hash: string; dilim: string };

export default function KanitEkrani() {
  const [ufuk, setUfuk] = useState<"4h" | "24h" | "72h">("24h");
  const [kesit, setKesit] = useState<Kesit | null>(null);

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
  const iptalSebebi = iptal?.reason ?? null;

  return (
    <>
      <Kart
        baslik="Kesit"
        soru="Hangi puanlama ayarı, hangi karar dilimi? Bu seçim yapılmadan hiçbir kanıt rakamı basılmaz."
        sag={<Secim ariaLabel="Ufuk" secenekler={[...UFUKLAR]} deger={ufuk} degistir={setUfuk} />}
        govdeSiz
      >
        {configs.isLoading ? (
          <p className="px-5 py-6 text-body-2-regular text-text-tertiary">kesitler okunuyor…</p>
        ) : !configs.data?.length ? (
          <Sessizlik beklenen="Hiçbir puanlama kesiti yok. Koşan bir kol varken bu beklenen bir durum değildir: puan yazılmıyorsa kanıt da birikmez." />
        ) : (
          <ul className="divide-y divide-separator-border">
            {configs.data.map((c) => {
              const aktif = c.config_hash === kesit?.hash && c.timeframe === kesit?.dilim;
              return (
                <li key={`${c.config_hash}-${c.timeframe}`}>
                  <button
                    type="button"
                    onClick={() => setKesit({ hash: c.config_hash, dilim: c.timeframe })}
                    className={cx(
                      "flex w-full cursor-pointer items-center gap-3 px-5 py-3 text-left transition-colors",
                      aktif
                        ? "bg-status-blue-background/50"
                        : "hover:bg-background-secondary-hover",
                    )}
                  >
                    <span
                      className={cx(
                        "size-2 shrink-0 rounded-full",
                        aktif ? "bg-chart-6-active" : "bg-chart-track",
                      )}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-body-2-regular text-text-primary">
                        {c.label}
                      </span>
                      <Kunye>
                        {c.config_hash.slice(0, 10)} · son bar{" "}
                        {new Date(c.bar_time).toLocaleString("tr-TR")}
                      </Kunye>
                    </span>
                    <Chip variant="caption" color="soft">
                      {c.market}
                    </Chip>
                    <span className={cx(MONO, "w-10 text-right text-body-2-medium text-text-secondary")}>
                      {c.timeframe}
                    </span>
                    <span className={cx(MONO, "w-14 text-right text-body-2-regular text-text-tertiary")}>
                      {adet(c.symbols)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Kart>

      {!kesit ? null : kalibrasyon.isLoading ? (
        <div className="h-40 animate-pulse rounded-3xl bg-background-secondary-default" />
      ) : !k ? (
        <Kart baslik="Öngörü gücü" govdeSiz>
          <Sessizlik beklenen="Kalibrasyon okunamadı." />
        </Kart>
      ) : (
        <>
          <Kart
            baslik="Öngörü gücü"
            soru="Puan ile ileri getiri arasında ölçülebilir bir ilişki var mı?"
            sag={
              iptal ? (
                <Damga durum="bozuk">geçersiz ilan edildi</Damga>
              ) : (
                <Damga durum={k.sufficient ? "kanit" : "uyari"}>
                  {k.sufficient ? "örneklem yeterli" : "örneklem yetersiz"}
                </Damga>
              )
            }
            govdeSiz
          >
            <div className="px-5 pb-4">
              <Izgara min={185}>
                <Olcum
                  etiket="Spearman"
                  ikon={RiScales3Line}
                  deger={sayi(k.spearman, 4)}
                  kunye={`n=${adet(k.n)} · ${adet(k.span_days)} gün · ${secili?.timeframe ?? "?"} · ${kesit.hash.slice(0, 8)}`}
                  durum="kanit"
                  buyuk
                  gecersiz={iptalSebebi}
                />
                <Olcum
                  etiket="kapı kenarı"
                  ikon={RiFocus3Line}
                  deger={k.gate_edge === null ? "—" : `${sayi(k.gate_edge * 10000, 0)} bps`}
                  kunye={`n=${adet(k.gate_n)} · ${adet(k.gate_days)} gün · havuza göre fark`}
                  durum="kanit"
                  buyuk
                  gecersiz={iptalSebebi}
                />
                <Olcum
                  etiket="kapı kenarı t"
                  ikon={RiCheckboxCircleLine}
                  deger={sayi(k.gate_edge_t_daily, 2)}
                  kunye="gün-kümelenmiş · ham t ≈%70 şişkin"
                  durum={
                    k.gate_edge_t_daily !== null && Math.abs(k.gate_edge_t_daily) >= 2
                      ? "kanit"
                      : "olu"
                  }
                  rozet={
                    k.gate_edge_t_daily !== null && Math.abs(k.gate_edge_t_daily) >= 2
                      ? "|t| ≥ 2"
                      : "|t| < 2"
                  }
                  rozetDurum={
                    k.gate_edge_t_daily !== null && Math.abs(k.gate_edge_t_daily) >= 2
                      ? "kanit"
                      : "olu"
                  }
                  buyuk
                />
                <Olcum
                  etiket="üst − alt desil"
                  ikon={RiStackLine}
                  deger={
                    k.top_minus_bottom === null
                      ? "—"
                      : `${sayi(k.top_minus_bottom * 10000, 0)} bps`
                  }
                  kunye={`p=${sayi(k.top_minus_bottom_p, 3)}`}
                  rozet={k.monotonic ? "monoton" : "monoton değil"}
                  rozetDurum={k.monotonic ? "kanit" : "olu"}
                  buyuk
                />
              </Izgara>
            </div>
            <Serit>
              <Not>{k.verdict}</Not>
            </Serit>
            {iptal ? (
              <Serit ton="bozuk">
                <Damga durum="bozuk">geçersizlik ilanı</Damga>
                <Not className="mt-1.5">{iptal.reason}</Not>
                <Kunye className="mt-1">
                  ilan {new Date(iptal.created_at).toLocaleString("tr-TR")}
                  {iptal.period_end
                    ? ` · kapsam ${new Date(iptal.period_end).toLocaleDateString("tr-TR")} öncesi`
                    : " · tüm geçmiş"}{" "}
                  · kayıt silinmedi, üstü çizildi
                </Kunye>
              </Serit>
            ) : null}
          </Kart>

          <div className="grid gap-4 xl:grid-cols-2">
            <Kart
              baslik="Desiller"
              soru="Yüksek puan gerçekten yüksek getiri mi getiriyor?"
              sag={<Kunye>medyan · {ufuk} ufuk</Kunye>}
            >
              {k.deciles.length ? (
                <>
                  <SutunGrafik
                    veri={k.deciles.map((d) => ({
                      ad: `D${d.decile}`,
                      deger: d.median_return,
                      n: d.count,
                    }))}
                    carpan={10000}
                    birim=" bps"
                    yukseklik={220}
                  />
                  <Kunye className="mt-2">
                    n={adet(k.n)} gözlem · her desil {adet(k.deciles[0]?.count ?? null)} satır ·
                    ortalama değil medyan (kripto dağılımı çarpık)
                  </Kunye>
                </>
              ) : (
                <Sessizlik
                  beklenen="Bu kesitte desil kurulacak kadar gözlem yok. Gözlemler saatte bir yazılır; kesit yeni açıldıysa beklemek gerekir."
                  bulunan={`n=${adet(k.n)}`}
                />
              )}
            </Kart>

            <Kart baslik="Aile IC" soru="Kenar hangi özellik ailesinden geliyor?">
              <SutunGrafik
                veri={Object.entries(k.family_ic).map(([aile, ic]) => ({ ad: aile, deger: ic }))}
                basamak={3}
                yukseklik={220}
              />
              <Not className="mt-2">
                Negatif IC&apos;li bir aile puana pozitif ağırlıkla giriyorsa, o ağırlık kenarı
                azaltıyor demektir. Ölçüldü (2026-09-04): formasyon ve mum düzelticilerinin
                IC&apos;si negatif; D1 kolu bunu canlıda sınıyor.
              </Not>
            </Kart>
          </div>
        </>
      )}
    </>
  );
}
