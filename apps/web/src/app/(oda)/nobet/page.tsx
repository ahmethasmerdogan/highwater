"use client";

/**
 * NÖBET — "Sistem şu an sağlam mı, dün geceden beri ne bozuldu?"
 *
 * Bu ekranın birinci işi sistemin doğru çalıştığını **kanıtlamak**, iyi haber
 * vermek değil: 2026-09-04/05'te sekiz arıza bulundu, hiçbiri hata vermedi,
 * hiçbiri panelde görünmedi. Sağlıklı durum bu yüzden kutlanmaz; sayının
 * kendisi ve paydası gösterilir.
 */

import { useQuery } from "@tanstack/react-query";
import {
  RiAlarmWarningLine,
  RiDatabase2Line,
  RiGitBranchLine,
  RiPlugLine,
  RiStackLine,
  RiTimerFlashLine,
} from "@remixicon/react";
import { api, type Nobet } from "@/lib/api";
import { Izgara, Kart, Not, Serit } from "@/panel/kart";
import { adet, Damga, Kunye, MONO, Olcum, Oran, sayi, Sayac, Sessizlik } from "@/panel/olcum";
import { Chip } from "@/components/base/badges/chip";
import { cx } from "@/utils/cx";

const BUTCE_IKON: Record<string, typeof RiStackLine> = {
  "bar bütçesi": RiStackLine,
  "sembol bütçesi": RiDatabase2Line,
  "bağlantı bütçesi": RiPlugLine,
};

function Iskelet() {
  return (
    <div className="grid gap-4">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-32 animate-pulse rounded-3xl bg-background-secondary-default" />
      ))}
    </div>
  );
}

export default function NobetEkrani() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["nobet", 24],
    queryFn: () => api.get<Nobet>("/kontrol/nobet", { saat: 24 }),
    refetchInterval: 30_000,
  });

  if (isLoading) return <Iskelet />;
  if (error || !data)
    return (
      <Kart baslik="Nöbet" soru="Sistem şu an sağlam mı?" govdeSiz>
        <Sessizlik
          beklenen="Nöbet defteri okunamadı. API ayakta değilse panelin gösterdiği hiçbir sayı güvenilir değildir; bu ekran boş kalmak yerine bunu söyler."
          bulunan={String(error)}
        />
      </Kart>
    );

  const kesici = data.kesici_payi;
  const ihlal = kesici.pay !== null && kesici.pay < kesici.kural;
  const bozuk = data.sayaclar.beklendi_olmadi.filter((s) => s.adet > 0);
  const sessiz = data.sayaclar.beklendi_olmadi.filter((s) => s.adet === 0);
  const koşan = data.kollar.filter((k) => k.durum !== "STOPPED");

  return (
    <>
      {/* --- Üst sıra: dört ana ölçü, duvar ölçeğinde ---------------- */}
      <div className="grid gap-4 xl:grid-cols-[2fr_1fr]">
        <Kart
          baslik="Kesici payı"
          soru="Supervisor bir kolu, o kol kararını bitirmeden öldürüyor mu?"
          sag={
            <Damga durum={ihlal ? "bozuk" : "notr"}>
              {ihlal ? "kural altında" : "kural üstünde"}
            </Damga>
          }
          govdeSiz
        >
          <div className="px-5 pb-4">
            <Izgara min={160}>
              <Oran
                etiket="nabız eşiği ÷ p90 karar süresi"
                ikon={RiTimerFlashLine}
                pay={kesici.esik_s}
                payda={kesici.p90_s}
                birim="sn"
                kural={kesici.kural}
                kunye={`n=${adet(kesici.n)} karar · ${data.pencere_saat} saat`}
                buyuk
                ipucu="2026-09-04'te bu oran 0,13× idi ve filo günde 1697 kez yeniden doğdu."
              />
              <Olcum
                etiket="karar süresi p50"
                deger={`${sayi(kesici.p50_s, 1)} sn`}
                kunye={`n=${adet(kesici.n)} · scores.updated`}
                buyuk
              />
              <Olcum
                etiket="karar süresi p90"
                deger={`${sayi(kesici.p90_s, 1)} sn`}
                kunye="en kötü onda bir"
                durum={ihlal ? "uyari" : "notr"}
                buyuk
              />
            </Izgara>
          </div>
          <Serit ton={ihlal ? "uyari" : "notr"}>
            <Not>
              2026-09-04&apos;te bu oran 35 ÷ 270 = 0,13× idi: supervisor kolları kararlarının
              ortasında öldürüyordu ve filo günde 1697 kez yeniden doğdu. Hiçbir hata mesajı
              yoktu. Kural, eşiğin ölçülen en kötü karar süresinin en az 1,5 katı olmasıdır.
            </Not>
          </Serit>
        </Kart>

        <Kart baslik="Filo" soru="Kaç kol koşuyor, kaç pozisyon açık?">
          <Izgara min={130}>
            <Olcum
              etiket="koşan kol"
              ikon={RiGitBranchLine}
              deger={adet(koşan.length)}
              kunye={`${adet(data.kollar.length)} kol tanımlı`}
              buyuk
            />
            <Olcum
              etiket="açık pozisyon"
              ikon={RiStackLine}
              deger={adet(data.acik_pozisyon)}
              kunye="filo geneli · anlık"
              buyuk
            />
            <Olcum
              etiket="donuk kol"
              ikon={RiAlarmWarningLine}
              deger={adet(data.donuk.length)}
              kunye="son barı bir tam bar geciken"
              durum={data.donuk.length ? "bozuk" : "notr"}
              buyuk
            />
          </Izgara>
        </Kart>
      </div>

      {/* --- Bütçeler: payda gizlenmez ------------------------------- */}
      <Kart
        baslik="Bütçeler"
        soru="Beklenen iş ile yapılan iş arasındaki fark ne kadar?"
        govdeSiz
      >
        <div className="px-5 pb-4">
          <Izgara min={210}>
            {data.butceler.map((b) => (
              <Oran
                key={b.ad}
                etiket={b.ad}
                ikon={BUTCE_IKON[b.ad]}
                pay={b.olculen}
                payda={b.payda}
                birim={b.birim}
                kunye={b.aciklama}
                kural={b.ad === "bağlantı bütçesi" ? 0.8 : 0.9}
                ters={b.ad === "bağlantı bütçesi"}
                buyuk
              />
            ))}
          </Izgara>
        </div>
        <Serit>
          <Not>
            Sekiz arızanın altısı paydası gizlendiği için görünmezdi. Bağlantı bütçesi 300&apos;ün
            tavanı 100&apos;ken 32 test sessizce atlanıyordu; sembol bütçesi 121&apos;in 115&apos;i
            puanlandığında kalan 6 sembol hiçbir yerde raporlanmıyordu.
          </Not>
        </Serit>
      </Kart>

      {/* --- Üç sayaç sınıfı ----------------------------------------- */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Kart baslik="Olmadı — bekleniyordu" soru="Sıfır olması gereken ne sıfır değil?">
          {bozuk.length === 0 ? (
            <Kunye>hepsi sıfır — listede aşağıda duruyorlar</Kunye>
          ) : (
            bozuk.map((s) => (
              <Sayac key={s.ad} ad={s.ad} deger={s.adet} sinif="beklendi_olmadi" not={s.esik} />
            ))
          )}
          <div className="mt-2 border-t border-separator-border pt-2">
            {sessiz.map((s) => (
              <Sayac key={s.ad} ad={s.ad} deger={s.adet} sinif="oldu" not={s.esik} />
            ))}
          </div>
        </Kart>

        <Kart baslik="Oldu" soru="Son 24 saatte sistem ne yaptı?">
          {data.sayaclar.oldu.map((s) => (
            <Sayac key={s.ad} ad={s.ad} deger={s.adet} sinif="oldu" />
          ))}
        </Kart>

        <Kart
          baslik="Hiç olmadı"
          soru="Hangi kural yapılandırıldı ama ömrü boyunca bir kez bile iş görmedi?"
        >
          {data.sayaclar.hic_olmadi.map((s) => (
            <Sayac key={s.ad} ad={s.ad} deger={s.adet} sinif="hic_olmadi" not={s.kapsam} />
          ))}
          <Not className="mt-3">
            Hiç tetiklenmemiş bir koruma, koruma değil yanılsamadır. Ölü rozetli her satır ya
            silinmeli ya da neden hiç çalışmadığı ölçülmelidir.
          </Not>
        </Kart>
      </div>

      {/* --- Kollar --------------------------------------------------- */}
      <Kart
        baslik="Kollar"
        soru="Hangi kol son barını tüketmedi?"
        sag={
          <Damga durum={data.donuk.length ? "bozuk" : "notr"}>
            {data.donuk.length ? `${data.donuk.length} donuk` : "donuk yok"}
          </Damga>
        }
        govdeSiz
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left">
            <thead>
              <tr className="border-y border-separator-border bg-background-secondary-default text-caption-1-medium text-text-tertiary">
                <th className="w-12 px-5 py-2 font-medium">#</th>
                <th className="px-3 py-2 font-medium">Kol</th>
                <th className="w-28 px-3 py-2 font-medium">Durum</th>
                <th className="w-16 px-3 py-2 font-medium">Dilim</th>
                <th className="w-28 px-3 py-2 text-right font-medium">Bar geride</th>
                <th className="w-24 px-3 py-2 text-right font-medium">Nabız sn</th>
                <th className="px-3 py-2 pr-5 font-medium">Engel</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-separator-border">
              {data.kollar.map((k) => {
                const donuk = data.donuk.includes(k.id);
                const durdu = k.durum === "STOPPED";
                return (
                  <tr
                    key={k.id}
                    className={cx(
                      "text-body-2-regular hover:bg-background-secondary-hover",
                      durdu && "opacity-55",
                    )}
                  >
                    <td className={cx(MONO, "px-5 py-2 text-text-tertiary")}>{k.id}</td>
                    <td className="px-3 py-2 text-text-primary">
                      {k.ad}
                      {k.deney ? (
                        <span className="ml-2">
                          <Chip variant="caption" color="soft">
                            deney
                          </Chip>
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2">
                      <Chip variant="caption" color={durdu ? "gray" : "soft"}>
                        {durdu ? "durdu" : "koşuyor"}
                      </Chip>
                    </td>
                    <td className={cx(MONO, "px-3 py-2 text-text-secondary")}>{k.dilim}</td>
                    <td
                      className={cx(
                        MONO,
                        "px-3 py-2 text-right",
                        donuk ? "text-status-rose-text" : "text-text-primary",
                      )}
                    >
                      {sayi(k.bar_gecikmesi_bar, 1)}
                    </td>
                    <td className={cx(MONO, "px-3 py-2 text-right text-text-tertiary")}>
                      {adet(k.nabiz_s)}
                    </td>
                    <td className="px-3 py-2 pr-5">
                      {k.halt ? (
                        <Chip variant="caption" color="yellow">
                          {k.halt}
                        </Chip>
                      ) : (
                        <span className="text-text-quaternary">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Kart>
    </>
  );
}
