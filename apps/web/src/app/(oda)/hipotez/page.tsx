"use client";

/**
 * HİPOTEZ — "Hangi soru soruluyor, kanıt ne durumda, karar ne zaman?"
 *
 * Bu ekran v3'ün "Botlar" sayfasının yerini alır ama aynı şey değildir: bot
 * bir nesne değil, bir hipotezin taşıyıcısıdır. Kart bot adını değil **iddiayı**
 * öne çıkarır; iddia serif, ölçüm mono.
 *
 * Her kart iki ölçü taşır (§5):
 *   · **Mekanizma** — yüksek güçlü, kesitsel, saatler. Hüküm buradan okunur.
 *   · **Sonuç** — R beklentisi. Düşük güçlü, birikir, hüküm vermez, kalın
 *     yazılmaz, belirsizlik aralığıyla basılır.
 *
 * Gerekçe ölçüldü (MEYDAN-OKUMA 2026-09-05): R std 2,474R, hız 0,70
 * işlem/gün/kol. +0,05R'yi ayırt etmek kol başına 38.424 işlem, yani 149 yıl
 * ister. 14 günlük belirsizlik ±2,18R, eşik +0,05R — eşiğin %2'si. Kol defteri
 * hüküm veremez; mekanizma verir.
 */

import { useQuery } from "@tanstack/react-query";
import { api, type HipotezKarti, type HipotezTahtasi } from "@/lib/api";
import { Bolum, Etiket, Muhakeme } from "@/v4/kutu";
import { adet, Damga, type Durum, Olcum, sayi, Sessizlik } from "@/v4/olcum";

const DAMGA_TURU: Record<string, Durum> = {
  KONTROL: "saglikli",
  ARŞİV: "olu",
  "ÖN-KAYIT YOK": "bozuk",
  GÜÇSÜZ: "olu",
  "KANIT TOPLUYOR": "saglikli",
  "HEDEFE ULAŞTI": "kanit",
  ÇÜRÜTÜLDÜ: "supheli",
};

function Kart({ kart }: { kart: HipotezKarti }) {
  const ok = kart.on_kayit;
  const m = kart.mekanizma;
  const s = kart.sonuc;
  const arsiv = kart.damga === "ARŞİV";

  return (
    <article className="v4-bolum" style={{ opacity: arsiv ? 0.6 : 1 }}>
      <header
        className="flex items-start justify-between gap-3 px-4 pt-3 pb-2"
        style={{ borderBottom: "1px solid var(--v4-cizgi)" }}
      >
        <div className="min-w-0">
          <div className="v4-etiket" style={{ color: "var(--v4-murekkep)" }}>
            kol {kart.bot_id} · {kart.ad}
          </div>
          {ok?.hipotez ? (
            <p className="v4-muhakeme mt-2" style={{ maxWidth: "62ch" }}>
              {ok.hipotez}
            </p>
          ) : (
            <p className="v4-muhakeme mt-2" style={{ color: "var(--v4-kirmizi)" }}>
              Bu kol koşuyor ama hangi soruyu sorduğu hiçbir yerde kayıtlı değil. Ön-kaydı
              olmayan bir kolun topladığı kanıt, sonradan yazılacak her hipotezi
              doğrulayabilir.
            </p>
          )}
        </div>
        <Damga tur={DAMGA_TURU[kart.damga] ?? "saglikli"}>{kart.damga}</Damga>
      </header>

      {ok ? (
        <div className="px-4 py-3" style={{ borderBottom: "1px solid var(--v4-cizgi)" }}>
          <div className="grid gap-x-6 gap-y-2" style={{ gridTemplateColumns: "auto 1fr" }}>
            <Etiket>tek değişken</Etiket>
            <span className="v4-olcum">{ok.tek_degisken ?? "—"}</span>
            <Etiket>kontrol kolu</Etiket>
            <span className="v4-olcum">{ok.kontrol_bot_id ?? "—"}</span>
            <Etiket>çürütme</Etiket>
            <span style={{ fontSize: 12.5, color: "var(--v4-ikincil)" }}>{ok.curutme ?? "—"}</span>
            <Etiket>karar günü</Etiket>
            <span className="v4-olcum">{ok.karar_gunu ?? "—"}</span>
            <Etiket>mühür</Etiket>
            <span
              className="v4-olcum"
              style={{ color: ok.muhur_kirik ? "var(--v4-kirmizi)" : "var(--v4-ikincil)" }}
            >
              {ok.muhur_hash}
              {ok.muhur_kirik ? " · KIRIK — toplanan kanıt geçersiz" : ""}
            </span>
          </div>
        </div>
      ) : null}

      <div
        className="grid gap-x-8 gap-y-4 px-4 py-4"
        style={{ gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}
      >
        {m ? (
          <>
            <Olcum
              etiket={m.ad}
              deger={sayi(m.deger, 1)}
              kunye={`n=${adet(m.n)} / ${adet(m.gereken_n)} gereken · kesitsel`}
              durum={m.deger === null ? "olu" : "kanit"}
            />
            <Olcum
              etiket="hedef"
              deger={`${m.yon === "artis" ? "≥" : "≤"} ${sayi(m.hedef, 1)}`}
              kunye="ön-kayıtta mühürlendi"
            />
            <Olcum
              etiket="kontrol kolu"
              deger={sayi(m.kontrol_deger, 1)}
              kunye={`n=${adet(m.kontrol_n)}`}
            />
            <Olcum
              etiket="fark (Welch t)"
              deger={sayi(m.t, 2)}
              kunye={
                m.t === null
                  ? "iki grup da ≥ 3 gözlem ister"
                  : Math.abs(m.t) >= 2
                    ? "|t| ≥ 2"
                    : "|t| < 2 · gürültüden ayrışmıyor"
              }
              durum={m.t !== null && Math.abs(m.t) >= 2 ? "kanit" : "olu"}
            />
          </>
        ) : (
          <div style={{ gridColumn: "1 / -1" }}>
            <Etiket>mekanizma ölçüsü yok</Etiket>
            <Muhakeme>
              Bu kolun yaptığı değişiklik seçimi değil ölçeği etkiliyor; kesitsel bir ölçü
              tanımlanamıyor. Hüküm ancak kol defterinden okunabilir ve o kanal bugünkü hızda
              149 yıl ister. Kol sonuçlanamayacağını baştan ilan ediyor.
            </Muhakeme>
          </div>
        )}
      </div>

      {/* Sonuç ölçüsü: kalın değil, belirsizlik aralığıyla. */}
      <div
        className="flex flex-wrap items-baseline gap-x-6 gap-y-2 px-4 py-2"
        style={{ borderTop: "1px solid var(--v4-cizgi)", background: "var(--v4-oyuk)" }}
      >
        <Etiket>sonuç ölçüsü</Etiket>
        <span className="v4-olcum" style={{ color: "var(--v4-ikincil)" }}>
          {s.deger === null
            ? "işlem yok"
            : `${sayi(s.deger, 3, { isaret: true })} R${
                s.belirsizlik !== null ? ` ± ${sayi(s.belirsizlik, 3)}` : ""
              }`}
        </span>
        <span className="v4-kunye">n={adet(s.n)} işlem · %95 aralık · hüküm vermez</span>
      </div>
    </article>
  );
}

export default function HipotezEkrani() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["hipotez"],
    queryFn: () => api.get<HipotezTahtasi>("/kontrol/hipotez", { gun: 30 }),
    refetchInterval: 120_000,
  });

  if (isLoading)
    return (
      <div className="v4-kunye" style={{ padding: 16 }}>
        hipotez tahtası okunuyor…
      </div>
    );
  if (error || !data)
    return (
      <Bolum baslik="hipotez" soru="Hangi soru soruluyor?">
        <Sessizlik beklenen="Hipotez tahtası okunamadı." bulunan={String(error)} />
      </Bolum>
    );

  const deneyler = data.kartlar.filter((k) => !["KONTROL", "ARŞİV"].includes(k.damga));
  const kontroller = data.kartlar.filter((k) => k.damga === "KONTROL");
  const arsiv = data.kartlar.filter((k) => k.damga === "ARŞİV");
  const kayitsiz = deneyler.filter((k) => k.damga === "ÖN-KAYIT YOK");
  const gucsuz = deneyler.filter((k) => k.damga === "GÜÇSÜZ");

  return (
    <>
      <Bolum
        baslik="hipotez tahtası"
        soru="Hüküm mekanizma ölçüsünden okunur; kol defteri yalnız birikir."
        sag={
          <div className="flex items-center gap-3">
            {kayitsiz.length ? (
              <Damga tur="bozuk">{kayitsiz.length} ön-kayıtsız</Damga>
            ) : (
              <Damga tur="saglikli">ön-kayıtsız yok</Damga>
            )}
            <Damga tur="olu">{gucsuz.length} güçsüz</Damga>
            <span className="v4-kunye">{adet(deneyler.length)} deney kolu · 30 gün</span>
          </div>
        }
      >
        <div className="px-4 py-3">
          <Muhakeme>
            Ölçüldü: R standart sapması 2,474R, hız 0,70 işlem/gün/kol. Kontrol koluna göre
            +0,05R&apos;lik bir farkı ayırt etmek kol başına 38.424 işlem ister — bugünkü hızda
            149 yıl. 14 günlük belirsizlik ±2,18R, yani eşiğin 43 katı. Bu yüzden her ön-kayıt
            ikinci bir ölçü taşır: günde yüzlerce karar üreten, kesitsel, yüksek güçlü bir
            mekanizma ölçüsü. Mekanizma ölçüsü tanımlanamayan kol GÜÇSÜZ damgası alır.
          </Muhakeme>
        </div>
      </Bolum>

      <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(460px, 1fr))" }}>
        {deneyler.map((k) => (
          <Kart key={k.bot_id} kart={k} />
        ))}
      </div>

      <Bolum baslik="kontrol kolları" soru="Deneyler neye karşı ölçülüyor?">
        <table className="v4-tablo">
          <thead>
            <tr>
              <th style={{ width: 46 }}>#</th>
              <th>kol</th>
              <th style={{ width: 110 }}>durum</th>
              <th className="sayi" style={{ width: 78 }}>
                işlem
              </th>
              <th className="sayi" style={{ width: 150 }}>
                R beklentisi
              </th>
            </tr>
          </thead>
          <tbody>
            {[...kontroller, ...arsiv].map((k) => (
              <tr key={k.bot_id} style={{ opacity: k.damga === "ARŞİV" ? 0.55 : 1 }}>
                <td className="sayi" style={{ color: "var(--v4-ikincil)" }}>
                  {k.bot_id}
                </td>
                <td>{k.ad}</td>
                <td>
                  <span className="v4-etiket">{k.damga}</span>
                </td>
                <td className="sayi">{adet(k.sonuc.n)}</td>
                <td className="sayi" style={{ color: "var(--v4-ikincil)" }}>
                  {k.sonuc.deger === null
                    ? "—"
                    : `${sayi(k.sonuc.deger, 3, { isaret: true })} ± ${sayi(k.sonuc.belirsizlik, 3)}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Bolum>
    </>
  );
}
