"use client";

/**
 * HİPOTEZ — "Hangi soru soruluyor, kanıt ne durumda, karar ne zaman?"
 *
 * Bot bir nesne değil, bir hipotezin taşıyıcısıdır; kart bot adını değil
 * **iddiayı** öne çıkarır. Her kart iki ölçü taşır (DESIGN-V4 §5):
 *
 *   · Mekanizma — kesitsel, yüksek güçlü, saatler. Hüküm buradan okunur.
 *   · Sonuç — R beklentisi. Birikir, belirsizlik aralığıyla basılır, hüküm vermez.
 *
 * Ölçüldü (MEYDAN-OKUMA 2026-09-05): R std 2,474R, hız 0,70 işlem/gün/kol.
 * +0,05R'yi ayırt etmek kol başına 38.424 işlem, yani 149 yıl ister.
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, type HipotezKarti, type HipotezTahtasi } from "@/lib/api";
import { Kart, Not } from "@/panel/kart";
import { adet, Damga, type Durum, Kunye, MONO, sayi, Sessizlik } from "@/panel/olcum";
import { Secim } from "@/panel/secim";
import { Chip } from "@/components/base/badges/chip";
import { cx } from "@/utils/cx";

const DAMGA_DURUMU: Record<string, Durum> = {
  KONTROL: "notr",
  ARŞİV: "olu",
  "ÖN-KAYIT YOK": "bozuk",
  GÜÇSÜZ: "olu",
  "KANIT TOPLUYOR": "notr",
  "HEDEFE ULAŞTI": "kanit",
  ÇÜRÜTÜLDÜ: "uyari",
};

const SUZGECLER = [
  { id: "deney", ad: "Deney kolları" },
  { id: "kontrol", ad: "Kontrol ve arşiv" },
] as const;

/** İlerleme çubuğu: kanıt bütçesi — gereken n'in kaçta kaçı toplandı. */
function KanitBütcesi({ n, gereken }: { n: number; gereken: number }) {
  const oran = gereken ? Math.min(1, n / gereken) : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-caption-1-medium text-text-tertiary">kanıt bütçesi</span>
        <span className={cx(MONO, "text-caption-1-regular text-text-secondary")}>
          {adet(n)} / {adet(gereken)}
        </span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-chart-track">
        <div
          className={cx(
            "h-full rounded-full transition-[width] duration-500 ease-out",
            oran >= 1 ? "bg-chart-6-active" : "bg-chart-neutral",
          )}
          style={{ width: `${oran * 100}%` }}
        />
      </div>
    </div>
  );
}

function HipotezKartBileseni({ kart }: { kart: HipotezKarti }) {
  const ok = kart.on_kayit;
  const m = kart.mekanizma;
  const s = kart.sonuc;
  const arsiv = kart.damga === "ARŞİV";

  return (
    <article
      className={cx(
        "flex min-w-0 flex-col overflow-hidden rounded-3xl border border-border-button-default bg-background-primary-default",
        arsiv && "opacity-60",
      )}
    >
      <header className="flex items-start justify-between gap-3 px-5 pt-4 pb-3">
        <div className="min-w-0">
          <Kunye>
            kol {kart.bot_id} · {kart.ad}
          </Kunye>
          {ok?.hipotez ? (
            <p className="mt-1.5 text-body-regular text-text-primary">{ok.hipotez}</p>
          ) : (
            <p className="mt-1.5 text-body-regular text-status-rose-text">
              Bu kol koşuyor ama hangi soruyu sorduğu hiçbir yerde kayıtlı değil. Ön-kaydı olmayan
              bir kolun topladığı kanıt, sonradan yazılacak her hipotezi doğrulayabilir.
            </p>
          )}
        </div>
        <Damga durum={DAMGA_DURUMU[kart.damga] ?? "notr"}>{kart.damga}</Damga>
      </header>

      {ok ? (
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 border-t border-separator-border px-5 py-3">
          <dt className="text-caption-1-medium text-text-tertiary">tek değişken</dt>
          <dd className={cx(MONO, "text-body-2-regular text-text-primary")}>
            {ok.tek_degisken ?? "—"}
          </dd>
          <dt className="text-caption-1-medium text-text-tertiary">kontrol kolu</dt>
          <dd className={cx(MONO, "text-body-2-regular text-text-primary")}>
            {ok.kontrol_bot_id ?? "—"}
          </dd>
          <dt className="text-caption-1-medium text-text-tertiary">çürütme</dt>
          <dd className="text-body-2-regular text-text-secondary">{ok.curutme ?? "—"}</dd>
          <dt className="text-caption-1-medium text-text-tertiary">karar günü</dt>
          <dd className={cx(MONO, "text-body-2-regular text-text-primary")}>
            {ok.karar_gunu ?? "—"}
          </dd>
          <dt className="text-caption-1-medium text-text-tertiary">mühür</dt>
          <dd
            className={cx(
              MONO,
              "text-body-2-regular",
              ok.muhur_kirik ? "text-status-rose-text" : "text-text-tertiary",
            )}
          >
            {ok.muhur_hash}
            {ok.muhur_kirik ? " · KIRIK — toplanan kanıt geçersiz" : ""}
          </dd>
        </dl>
      ) : null}

      <div className="flex-1 border-t border-separator-border px-5 py-4">
        {m ? (
          <>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="min-w-0">
                <p className="text-body-2-medium text-text-secondary">{m.ad}</p>
                <div className="mt-0.5 flex items-baseline gap-2">
                  <span className={cx(MONO, "text-title-3-semibold text-text-primary")}>
                    {sayi(m.deger, 1)}
                  </span>
                  <span className={cx(MONO, "text-body-2-regular text-text-tertiary")}>
                    hedef {m.yon === "artis" ? "≥" : "≤"} {sayi(m.hedef, 1)}
                  </span>
                </div>
                <Kunye className="mt-0.5">
                  kontrol {sayi(m.kontrol_deger, 1)} (n={adet(m.kontrol_n)}) · kesitsel ölçü
                </Kunye>
              </div>
              <Chip
                variant="bold"
                color={m.t !== null && Math.abs(m.t) >= 2 ? "blue" : "gray"}
              >
                <span className={MONO}>t {sayi(m.t, 2)}</span>
              </Chip>
            </div>
            <div className="mt-3">
              <KanitBütcesi n={m.n} gereken={m.gereken_n} />
            </div>
          </>
        ) : (
          <>
            <Chip variant="caption" color="gray">
              mekanizma ölçüsü yok
            </Chip>
            <Not className="mt-2">
              Bu kolun yaptığı değişiklik seçimi değil ölçeği etkiliyor; kesitsel bir ölçü
              tanımlanamıyor. Hüküm ancak kol defterinden okunabilir ve o kanal bugünkü hızda 149
              yıl ister. Kol sonuçlanamayacağını baştan ilan ediyor.
            </Not>
          </>
        )}
      </div>

      <footer className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-t border-separator-border bg-background-secondary-default px-5 py-2.5">
        <span className="text-caption-1-medium text-text-tertiary">sonuç ölçüsü</span>
        <span className={cx(MONO, "text-body-2-regular text-text-secondary")}>
          {s.deger === null
            ? "işlem yok"
            : `${sayi(s.deger, 3, { isaret: true })} R${
                s.belirsizlik !== null ? ` ± ${sayi(s.belirsizlik, 3)}` : ""
              }`}
        </span>
        <Kunye className="ml-auto">n={adet(s.n)} işlem · %95 aralık · hüküm vermez</Kunye>
      </footer>
    </article>
  );
}

export default function HipotezEkrani() {
  const [suzgec, setSuzgec] = useState<"deney" | "kontrol">("deney");
  const { data, isLoading, error } = useQuery({
    queryKey: ["hipotez"],
    queryFn: () => api.get<HipotezTahtasi>("/kontrol/hipotez", { gun: 30 }),
    refetchInterval: 120_000,
  });

  if (isLoading)
    return (
      <div className="grid gap-4 xl:grid-cols-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-64 animate-pulse rounded-3xl bg-background-secondary-default" />
        ))}
      </div>
    );
  if (error || !data)
    return (
      <Kart baslik="Hipotez" soru="Hangi soru soruluyor?" govdeSiz>
        <Sessizlik beklenen="Hipotez tahtası okunamadı." bulunan={String(error)} />
      </Kart>
    );

  const deneyler = data.kartlar.filter((k) => !["KONTROL", "ARŞİV"].includes(k.damga));
  const digerleri = data.kartlar.filter((k) => ["KONTROL", "ARŞİV"].includes(k.damga));
  const kayitsiz = deneyler.filter((k) => k.damga === "ÖN-KAYIT YOK");
  const gucsuz = deneyler.filter((k) => k.damga === "GÜÇSÜZ");
  const gosterilen = suzgec === "deney" ? deneyler : digerleri;

  return (
    <>
      <Kart
        baslik="Hipotez tahtası"
        soru="Hüküm mekanizma ölçüsünden okunur; kol defteri yalnız birikir."
        sag={
          <>
            <Damga durum={kayitsiz.length ? "bozuk" : "notr"}>
              {kayitsiz.length ? `${kayitsiz.length} ön-kayıtsız` : "ön-kayıtsız yok"}
            </Damga>
            <Damga durum="olu">{gucsuz.length} güçsüz</Damga>
            <Secim
              ariaLabel="Kol süzgeci"
              secenekler={[...SUZGECLER]}
              deger={suzgec}
              degistir={setSuzgec}
            />
          </>
        }
      >
        <Not>
          Ölçüldü: R standart sapması 2,474R, hız 0,70 işlem/gün/kol. Kontrol koluna göre
          +0,05R&apos;lik bir farkı ayırt etmek kol başına 38.424 işlem ister — bugünkü hızda 149
          yıl. 14 günlük belirsizlik ±2,18R, yani eşiğin 43 katı. Bu yüzden her ön-kayıt ikinci bir
          ölçü taşır: günde yüzlerce karar üreten, kesitsel, yüksek güçlü bir mekanizma ölçüsü.
          Mekanizma ölçüsü tanımlanamayan kol GÜÇSÜZ damgası alır.
        </Not>
        <Kunye className="mt-2">
          {adet(deneyler.length)} deney kolu · {adet(digerleri.length)} kontrol/arşiv · 30 gün ·
          üretim {new Date(data.uretim).toLocaleString("tr-TR")}
        </Kunye>
      </Kart>

      <div className="grid gap-4 xl:grid-cols-2">
        {gosterilen.map((k) => (
          <HipotezKartBileseni key={k.bot_id} kart={k} />
        ))}
      </div>
    </>
  );
}
