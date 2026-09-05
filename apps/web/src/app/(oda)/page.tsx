"use client";

/**
 * NÖBET — "Sistem şu an sağlam mı, dün geceden beri ne bozuldu?"
 *
 * Duvar ölçeği: sayılar 20–26px, uzaktan okunur. Kullanıcı günde birkaç kez
 * birkaç dakika bakıyor ve 30 gün komut vermeyecek; bu ekranın birinci işi
 * sistemin doğru çalıştığını **kanıtlamak**, iyi haber vermek değil.
 *
 * Yeşil yoktur. Sağlıklı durum renksizdir: 2026-09-04/05'te sekiz arıza
 * bulundu, hiçbiri hata vermedi, hiçbiri panelde görünmedi. "Her şey yolunda"
 * duygusu tam olarak o sekiz arızanın verdiği sahte güvendi.
 */

import { useQuery } from "@tanstack/react-query";
import { api, type Nobet } from "@/lib/api";
import { Bolum, Izgara, Muhakeme } from "@/v4/kutu";
import { adet, Damga, Olcum, Oran, sayi, Sayac, Sessizlik } from "@/v4/olcum";

function Yukleniyor() {
  return (
    <div className="v4-kunye" style={{ padding: 16 }}>
      nöbet defteri okunuyor…
    </div>
  );
}

export default function NobetEkrani() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["nobet", 24],
    queryFn: () => api.get<Nobet>("/kontrol/nobet", { saat: 24 }),
    refetchInterval: 30_000,
  });

  if (isLoading) return <Yukleniyor />;
  if (error || !data)
    return (
      <Bolum baslik="nöbet" soru="Sistem şu an sağlam mı?">
        <Sessizlik
          beklenen="Nöbet defteri okunamadı. API ayakta değilse panelin gösterdiği hiçbir sayı güvenilir değildir; bu ekran boş kalmak yerine bunu söyler."
          bulunan={String(error)}
        />
      </Bolum>
    );

  const kesici = data.kesici_payi;
  const kesiciIhlal = kesici.pay !== null && kesici.pay < kesici.kural;
  const bozukSayac = data.sayaclar.beklendi_olmadi.filter((s) => s.adet > 0);
  const sessizSayac = data.sayaclar.beklendi_olmadi.filter((s) => s.adet === 0);

  return (
    <>
      {/* --- Zaman bütçesi: 1. arızanın kalıcı organı --------------- */}
      <Bolum
        baslik="kesici payı"
        duvar
        soru="Supervisor bir kolu, o kol kararını bitirmeden öldürüyor mu?"
        sag={
          kesiciIhlal ? (
            <Damga tur="bozuk">kural altında</Damga>
          ) : (
            <Damga tur="saglikli">kural üstünde</Damga>
          )
        }
      >
        <Izgara sutun={4}>
          <Oran
            etiket="nabız eşiği ÷ p90 karar süresi"
            pay={kesici.esik_s}
            payda={kesici.p90_s}
            birim="saniye"
            kural={kesici.kural}
            kunye={`n=${adet(kesici.n)} karar · ${data.pencere_saat} saat`}
            olcek="duvar"
          />
          <Olcum
            etiket="karar süresi p50"
            deger={`${sayi(kesici.p50_s, 1)} sn`}
            kunye={`n=${adet(kesici.n)} · scores.updated`}
            olcek="duvar"
          />
          <Olcum
            etiket="karar süresi p90"
            deger={`${sayi(kesici.p90_s, 1)} sn`}
            kunye="en kötü onda bir"
            olcek="duvar"
            durum={kesiciIhlal ? "supheli" : "saglikli"}
          />
          <Olcum
            etiket="açık pozisyon"
            deger={adet(data.acik_pozisyon)}
            kunye="filo geneli · anlık"
            olcek="duvar"
          />
        </Izgara>
        <div className="px-4 pb-4">
          <Muhakeme>
            2026-09-04&apos;te bu oran 35 ÷ 270 = 0,13× idi: supervisor kolları kararlarının
            ortasında öldürüyordu ve filo günde 1697 kez yeniden doğdu. Hiçbir hata mesajı
            yoktu. Kural, eşiğin ölçülen en kötü karar süresinin en az 1,5 katı olmasıdır.
          </Muhakeme>
        </div>
      </Bolum>

      {/* --- Bütçeler: payda gizlenmez ------------------------------ */}
      <Bolum
        baslik="bütçeler"
        soru="Beklenen iş ile yapılan iş arasındaki fark ne kadar?"
      >
        <Izgara sutun={3}>
          {data.butceler.map((b) => (
            <Oran
              key={b.ad}
              etiket={b.ad}
              pay={b.olculen}
              payda={b.payda}
              birim={b.birim}
              kunye={b.aciklama}
              kural={b.ad === "bağlantı bütçesi" ? 0.8 : 0.9}
              ters={b.ad === "bağlantı bütçesi"}
              olcek="duvar"
            />
          ))}
        </Izgara>
        <div className="px-4 pb-4">
          <Muhakeme>
            Sekiz arızanın altısı paydası gizlendiği için görünmezdi. Bağlantı bütçesi 300&apos;ün
            tavanı 100&apos;ken 32 test sessizce atlanıyordu; sembol bütçesi 121&apos;in 115&apos;i
            puanlandığında kalan 6 sembol hiçbir yerde raporlanmıyordu.
          </Muhakeme>
        </div>
      </Bolum>

      {/* --- Sayaçlar: üç sınıf ------------------------------------- */}
      <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))" }}>
        <Bolum baslik="olmadı — bekleniyordu" soru="Sıfır olması gereken ne sıfır değil?">
          <div className="px-4 py-3">
            {bozukSayac.length === 0 ? (
              <div className="v4-kunye">hepsi sıfır — aşağıdaki listede duruyorlar</div>
            ) : (
              bozukSayac.map((s) => (
                <Sayac key={s.ad} ad={s.ad} deger={s.adet} sinif="beklendi_olmadi" not={s.esik} />
              ))
            )}
            <div style={{ borderTop: "1px solid var(--v4-cizgi)", marginTop: 8, paddingTop: 6 }}>
              {sessizSayac.map((s) => (
                <Sayac key={s.ad} ad={s.ad} deger={s.adet} sinif="oldu" not={s.esik} />
              ))}
            </div>
          </div>
        </Bolum>

        <Bolum baslik="oldu" soru="Son 24 saatte sistem ne yaptı?">
          <div className="px-4 py-3">
            {data.sayaclar.oldu.map((s) => (
              <Sayac key={s.ad} ad={s.ad} deger={s.adet} sinif="oldu" />
            ))}
          </div>
        </Bolum>

        <Bolum
          baslik="hiç olmadı"
          soru="Hangi kural yapılandırıldı ama ömrü boyunca bir kez bile iş görmedi?"
        >
          <div className="px-4 py-3">
            {data.sayaclar.hic_olmadi.map((s) => (
              <Sayac key={s.ad} ad={s.ad} deger={s.adet} sinif="hic_olmadi" not={s.kapsam} />
            ))}
            <div style={{ marginTop: 8 }}>
              <Muhakeme dar>
                Hiç tetiklenmemiş bir koruma, koruma değil yanılsamadır. Ölü rozetli her satır
                ya silinmeli ya da neden hiç çalışmadığı ölçülmelidir.
              </Muhakeme>
            </div>
          </div>
        </Bolum>
      </div>

      {/* --- Kollar: sessizlik bir durumdur ------------------------- */}
      <Bolum
        baslik="kollar"
        soru="Hangi kol son barını tüketmedi?"
        sag={
          data.donuk.length ? (
            <Damga tur="bozuk">{data.donuk.length} donuk</Damga>
          ) : (
            <Damga tur="saglikli">donuk yok</Damga>
          )
        }
      >
        <table className="v4-tablo">
          <thead>
            <tr>
              <th style={{ width: 46 }}>#</th>
              <th>kol</th>
              <th style={{ width: 96 }}>durum</th>
              <th style={{ width: 56 }}>dilim</th>
              <th className="sayi" style={{ width: 92 }}>
                bar geride
              </th>
              <th className="sayi" style={{ width: 78 }}>
                nabız sn
              </th>
              <th>engel</th>
            </tr>
          </thead>
          <tbody>
            {data.kollar.map((k) => {
              const donuk = data.donuk.includes(k.id);
              const durdu = k.durum === "STOPPED";
              return (
                <tr key={k.id} style={{ opacity: durdu ? 0.55 : 1 }}>
                  <td className="sayi" style={{ color: "var(--v4-ikincil)" }}>
                    {k.id}
                  </td>
                  <td style={{ color: durdu ? "var(--v4-olu)" : "var(--v4-murekkep)" }}>
                    {k.ad}
                    {k.deney ? (
                      <span className="v4-kunye" style={{ marginLeft: 8 }}>
                        deney
                      </span>
                    ) : null}
                  </td>
                  <td>
                    <span
                      className="v4-etiket"
                      style={{ color: durdu ? "var(--v4-olu)" : "var(--v4-ikincil)" }}
                    >
                      {k.durum}
                    </span>
                  </td>
                  <td className="sayi">{k.dilim}</td>
                  <td
                    className="sayi"
                    style={{ color: donuk ? "var(--v4-kirmizi)" : undefined }}
                  >
                    {sayi(k.bar_gecikmesi_bar, 1)}
                  </td>
                  <td className="sayi" style={{ color: "var(--v4-ikincil)" }}>
                    {adet(k.nabiz_s)}
                  </td>
                  <td style={{ color: k.halt ? "var(--v4-amber)" : "var(--v4-olu)" }}>
                    {k.halt ?? "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Bolum>
    </>
  );
}
