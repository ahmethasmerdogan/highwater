"use client";

/**
 * Kalibrasyon — sistemin dürüstlük organı.
 *
 * Bu sayfa tek bir soruya cevap verir: **puanlama gerçekten ileri getiriyi
 * öngörüyor mu?** Cevap "hayır" olabilir ve sayfa bunu büyük puntoyla
 * yazar; süslemez, yumuşatmaz.
 *
 * Bir puanlama sisteminin var olma gerekçesi buradaki grafiklerdir. İlişki
 * düz çıkıyorsa sistem değer katmıyordur ve bunu saklamak, sistemi
 * kullanmaktan daha zararlıdır.
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { cx } from "@/ui";
import { api, type Calibration } from "@/lib/api";
import { Page, Section, StatGrid, Async } from "@/components/common/page";
import { Stat, AmountText } from "@/components/common/amount";
import { Explain, InfoDot, RichText, Term } from "@/components/common/explain";
import { DecileChart, CurveChart, Legend } from "@/components/viz/charts";
import { SimpleTable } from "@/components/data/data-table";
import {
  FAMILY_COLORS,
  FAMILY_LABELS,
  FAMILY_TERMS,
  num,
  pct,
  pctSigned,
  signed,
} from "@/lib/format";

const HORIZONS = [
  { id: "4h", label: "4 saat" },
  { id: "24h", label: "24 saat" },
  { id: "72h", label: "72 saat" },
];

const WINDOWS = [
  { days: 90, label: "90 gün" },
  { days: 180, label: "180 gün" },
  { days: 365, label: "1 yıl" },
  { days: 730, label: "2 yıl" },
];

export default function CalibrationPage() {
  const [horizon, setHorizon] = useState("24h");
  const [days, setDays] = useState(180);

  const query = useQuery({
    queryKey: ["calibration", horizon, days],
    queryFn: () => api.get<Calibration>("/calibration", { horizon, days }),
    refetchInterval: 300_000,
  });

  return (
    <Page
      title="Kalibrasyon"
      description="Puanlama gerçekten işe yarıyor mu? Bu sayfa cevabı ölçer ve cevap olumsuz olabilir."
      intro={{
        storageKey: "kalibrasyon",
        what: "Sistem her puanı hesapladığında kaydeder, sonra o coinin ileriki getirisiyle eşleştirir. Bu sayfa o eşleşmeleri toplar ve tek bir soruyu sorar: yüksek puan alan coinler gerçekten daha iyi getiri sağladı mı?",
        how: "**Desil grafiği** ana görseldir. Puanlar en düşükten en yükseğe on dilime bölünür ve her dilimin ortalama getirisi çizilir. Puanlama çalışıyorsa çubuklar soldan sağa artmalıdır.\n\nÇubukların üstündeki ince çizgiler **güven aralığıdır**. Aralıklar birbirini bolca kesiyorsa fark gürültü olabilir — gerçek bir sinyal değil.\n\n**Sıra korelasyonu** puan sıralamasıyla getiri sıralamasının uyumunu tek sayıya indirir. Finansal veride 0,03–0,05 bile anlamlıdır; büyük değerler genellikle bir hata işaretidir.",
        action: "İlişki düzse ağırlıkları değiştirip yeniden denemeyin — aynı veri üzerinde arama yapmak, sonunda o veriye uyan bir kombinasyon bulmanızı sağlar ve bu bir keşif değil ezberdir. Bunun yerine hipotezi değiştirin ve kilitli döneme dokunmadan yeniden test edin.",
        terms: ["kalibrasyon", "desil", "monotonluk", "spearman", "ic", "guven_araligi", "out_of_sample"],
      }}
      actions={
        <div className="flex flex-wrap items-center gap-3">
          <Selector
            label="Ufuk"
            hint="Puan hesaplandıktan kaç saat sonraki getiriye bakılacağı."
            options={HORIZONS.map((h) => ({ value: h.id, label: h.label }))}
            value={horizon}
            onChange={setHorizon}
          />
          <Selector
            label="Pencere"
            hint="Kaç günlük gözlem kullanılacağı. Kısa pencere daha güncel ama daha gürültülüdür."
            options={WINDOWS.map((w) => ({ value: String(w.days), label: w.label }))}
            value={String(days)}
            onChange={(v) => setDays(Number(v))}
          />
        </div>
      }
    >
      <Async query={query}>
        {(cal) => (
          <>
            <Verdict cal={cal} />

            <GateEdge cal={cal} />

            <StatGrid cols={4}>
              <Stat
                label="Gözlem sayısı"
                hint="Puan–getiri eşleşmesi sayısı. Sistem en az 500 gözlem ve 30 gün olmadan bir sonucu anlamlı saymaz."
                value={<AmountText text={num(cal.n, 0)} size="xl" />}
                sub={`${num(cal.span_days, 0)} günlük aralık`}
                tone={cal.sufficient ? "neutral" : "warn"}
              />
              <Stat
                label="Sıra korelasyonu"
                term="spearman"
                value={<AmountText text={num(cal.spearman, 3)} size="xl" />}
                sub={
                  cal.spearman_p !== null
                    ? `şansa bağlı olma ihtimali ${num(cal.spearman_p, 3)}`
                    : null
                }
                tone={
                  cal.spearman === null ? "neutral" : cal.spearman > 0 ? "up" : "down"
                }
              />
              <Stat
                label="Üst − alt dilim"
                hint="En yüksek puanlı dilimin ortalama getirisi eksi en düşüğünkü. Pozitif ve anlamlıysa sıralama işe yarıyor."
                value={<AmountText text={pct(cal.top_minus_bottom, 2)} size="xl" />}
                sub={
                  cal.top_minus_bottom_p !== null
                    ? `şansa bağlı olma ihtimali ${num(cal.top_minus_bottom_p, 3)}`
                    : null
                }
                tone={
                  cal.top_minus_bottom === null
                    ? "neutral"
                    : cal.top_minus_bottom > 0
                      ? "up"
                      : "down"
                }
              />
              <Stat
                label="Monotonluk"
                term="monotonluk"
                value={
                  <span className={cx("text-[20px]", cal.monotonic ? "text-up" : "text-down")}>
                    {cal.monotonic ? "Artıyor" : "Artmıyor"}
                  </span>
                }
                sub={
                  cal.monotonic
                    ? "dilim ortalamaları sürekli yükseliyor"
                    : "dilim ortalamaları düzensiz"
                }
                tone={cal.monotonic ? "up" : "down"}
              />
            </StatGrid>

            <Section
              title="Puan dilimi → ortalama getiri"
              term="desil"
              description="Puanlar en düşükten en yükseğe on dilime bölünür. Puanlama çalışıyorsa çubuklar soldan sağa artmalıdır."
            >
              <p className="mb-3 max-w-3xl text-[11.5px] leading-relaxed text-ink-3">
                Ortalama ile medyan ayrışıyorsa o dilimi birkaç aşırı getiri taşıyor demektir.
                En düşük dilimde bu sık görülür: ortalama pozitif çıkar ama tipik gözlem
                zarardadır. Karar verirken medyana bakın.
              </p>
              <DecileChart data={cal.deciles} />
              {/* İki ölçü var; renk disiplini açıklama şeridi zorunlu kılıyor. */}
              <Legend
                className="mt-2"
                items={[
                  { label: "Ortalama getiri (çubuk)", color: "var(--ink3)" },
                  { label: "Medyan getiri (kesik çizgi)", color: "var(--ink2)" },
                ]}
              />

              <div className="mt-4">
                <SimpleTable
                  dense
                  head={
                    <>
                      <th>Dilim</th>
                      <th className="col-num">Ortalama puan</th>
                      <th className="col-num">Gözlem</th>
                      <th className="col-num">Ortalama getiri</th>
                      <th className="col-num">Medyan getiri</th>
                      <th className="col-num">Güven aralığı</th>
                      <th>Gürültüden ayrılıyor mu</th>
                    </>
                  }
                >
                  {cal.deciles.map((d) => {
                    /* Aralık sıfırı içermiyorsa fark gürültüden ayrışmış demektir. */
                    const separated = d.ci_low > 0 || d.ci_high < 0;
                    return (
                      <tr key={d.decile}>
                        <td className="num">{d.decile}</td>
                        <td className="col-num">{num(d.mean_score, 1)}</td>
                        <td className="col-num">{num(d.count, 0)}</td>
                        <td className="col-num">
                          <span className={d.mean_return >= 0 ? "text-up" : "text-down"}>
                            {pct(d.mean_return, 2)}
                          </span>
                        </td>
                        <td className="col-num">
                          <span className={d.median_return >= 0 ? "text-up" : "text-down"}>
                            {pct(d.median_return, 2)}
                          </span>
                        </td>
                        <td className="col-num text-ink-2">
                          {pct(d.ci_low, 2)} … {pct(d.ci_high, 2)}
                        </td>
                        <td
                          className={cx("text-[12px]", separated ? "text-ink" : "text-ink-3")}
                        >
                          {separated ? "Evet" : "Hayır — sıfırı içeriyor"}
                        </td>
                      </tr>
                    );
                  })}
                </SimpleTable>
              </div>
            </Section>

            <div className="grid gap-4 lg:grid-cols-2">
              <Section
                title="Aile bazında öngörü gücü"
                term="ic"
                description="Her ailenin ileri getiriyle ilişkisi. Uzun süre sıfır civarında gezen bir ailenin ağırlığı sorgulanmalıdır."
              >
                <div className="space-y-2.5">
                  {Object.entries(cal.family_ic).map(([family, ic]) => {
                    /* IC değerleri küçüktür; ±0,1 bandı görsel ölçek olarak yeterli. */
                    const scale = 0.1;
                    const width = ic === null ? 0 : Math.min(100, (Math.abs(ic) / scale) * 100);
                    return (
                      <div key={family} className="flex items-center gap-2.5">
                        <span className="w-28 shrink-0">
                          <Term
                            id={FAMILY_TERMS[family] ?? ""}
                            className="text-[12.5px] text-ink-2"
                          >
                            {FAMILY_LABELS[family] ?? family}
                          </Term>
                        </span>
                        {/* Sıfır ortada; sola negatif, sağa pozitif */}
                        <div className="relative h-2 flex-1 rounded-full bg-inset">
                          <span
                            aria-hidden
                            className="absolute top-0 bottom-0 left-1/2 w-px bg-line-strong"
                          />
                          {ic !== null && (
                            <span
                              className={cx(
                                "absolute top-0 h-full rounded-full",
                                ic >= 0 ? "left-1/2 bg-up" : "right-1/2 bg-down",
                              )}
                              style={{ width: `${width / 2}%` }}
                            />
                          )}
                        </div>
                        <span className="num w-14 text-right text-[12px] text-ink">
                          {num(ic, 3)}
                        </span>
                      </div>
                    );
                  })}
                </div>
                <p className="mt-3 text-[11.5px] leading-relaxed text-ink-3">
                  Ölçek ±0,10. Finansal veride 0,03–0,05 bandı bile anlamlı sayılır; belirgin
                  biçimde büyük değerler genellikle bir hesap hatasını gösterir.
                </p>
              </Section>

              <Section
                title="Sıra korelasyonunun seyri"
                description="30 günlük kayan pencerede puan–getiri ilişkisi. Sürekli pozitif kalması, ilişkinin tek bir döneme bağlı olmadığını gösterir."
              >
                <CurveChart
                  height={200}
                  series={[
                    {
                      label: "Sıra korelasyonu",
                      color: "var(--series-1)",
                      points: (cal.rolling_spearman ?? [])
                        .filter((p) => p.value !== null)
                        .map((p) => ({ at: p.at, value: p.value as number })),
                    },
                  ]}
                  valueFormat={(v) => num(v, 3)}
                  emptyText="Kayan pencere için yeterli gözlem yok."
                />
                <p className="mt-2 text-[11.5px] leading-relaxed text-ink-3">
                  Sıfır çizgisinin üstünde geçirdiği süre, altında geçirdiğinden belirgin biçimde
                  fazla olmalıdır. Sürekli sıfır etrafında salınıyorsa puanlama bilgi taşımıyor.
                </p>
              </Section>
            </div>

            <IcSeries cal={cal} />

            <Section title="Bu sayfa neden var">
              <div className="grid gap-5 md:grid-cols-2">
                <Explain id="kalibrasyon" showTitle={false} />
                <div className="space-y-4">
                  <Explain id="desil" showTitle />
                  <Explain id="out_of_sample" showTitle />
                </div>
              </div>
            </Section>
          </>
        )}
      </Async>
    </Page>
  );
}

/* ------------------------------------------------------------------ */
/*  Karar kutusu                                                       */
/* ------------------------------------------------------------------ */

/**
 * Sonucu tek cümleyle, büyük puntoyla söyler.
 *
 * Kullanıcı grafikleri yorumlamak zorunda kalmamalı: sistemin kendi
 * hükmü en üstte durur.
 */
function Verdict({ cal }: { cal: Calibration }) {
  const insufficient = !cal.sufficient;
  const positive = cal.monotonic && (cal.spearman ?? 0) > 0;
  /*
   * Dağılım geneli düz olsa bile sistemin **aldığı** bölge ayrışıyor olabilir.
   * Başlık yalnızca Spearman'a bakınca, gövdedeki kapı cümlesiyle çelişen bir
   * hüküm veriyordu: "öngörü gücü gösteremiyor" yazarken hemen altında
   * "kapının üstü havuzu anlamlı biçimde geçiyor" diyordu.
   */
  const gateWorks =
    cal.gate_n >= 20 &&
    (cal.gate_edge ?? 0) > 0 &&
    Math.abs(cal.gate_edge_t ?? 0) >= 2;

  const tone = insufficient ? "warn" : positive || gateWorks ? "up" : "down";
  const title = insufficient
    ? "Karar vermek için henüz erken"
    : positive
      ? "Puanlama şu ana kadar öngörü gücü gösteriyor"
      : gateWorks
        ? "Dağılım geneli düz, ama sistemin aldığı bölge ayrışıyor"
        : "Puanlama öngörü gücü gösteremiyor";

  return (
    <div
      className={cx(
        "rounded-xl border px-5 py-4",
        tone === "up" && "border-up/30 bg-up-soft",
        tone === "down" && "border-down/30 bg-down-soft",
        tone === "warn" && "border-warn/30 bg-warn-soft",
      )}
    >
      <h2 className="text-[16px] font-semibold text-ink">{title}</h2>
      <div className="mt-1.5 max-w-3xl text-[13px] leading-relaxed text-ink-2">
        <RichText text={cal.verdict || fallbackVerdict(cal)} />
      </div>
      {!insufficient && !positive && !gateWorks && (
        <p className="mt-2.5 max-w-3xl border-l-2 border-down pl-3 text-[12.5px] leading-relaxed text-ink-2">
          <strong className="font-medium text-ink">Ne yapmamalı: </strong>
          ağırlıkları değiştirip aynı veriyle yeniden denemek. Bu, sonunda o veriye uyan bir
          kombinasyon bulmanızı sağlar ve bulduğunuz şey bir keşif değil ezberdir. Hipotezi
          değiştirin, kilitli döneme dokunmayın ve kaç deneme yaptığınızı kaydedin.
        </p>
      )}
    </div>
  );
}

function fallbackVerdict(cal: Calibration): string {
  if (!cal.sufficient) {
    return `Şu an ${cal.n} gözlem var ve bunlar ${num(cal.span_days, 0)} güne yayılıyor. Sistem en az 500 gözlem ve 30 gün olmadan bir sonucu anlamlı saymaz — bu sayılar dolana kadar buradaki grafikler yön gösterir ama karar vermez.`;
  }
  return cal.monotonic
    ? "Puan dilimleri yükseldikçe ortalama getiri de yükseliyor."
    : "Puan dilimleri ile getiri arasında tutarlı bir artış görünmüyor.";
}

/* ------------------------------------------------------------------ */
/*  Kapının üstü — sistemin fiilen işlem yaptığı bölge                 */
/* ------------------------------------------------------------------ */

/**
 * Spearman ve üst−alt dilim farkı **tüm dağılıma** bakar. Sistem ise yalnızca
 * giriş kapısının üstünü alır; alt dilimleri hiç satın almaz. Bu iki ölçüm
 * farklı şeyler söyleyebilir ve söylüyor da.
 *
 * Arka uç bunu bar bazında hesaplıyordu ama panel yalnızca karar cümlesinin
 * içinde metin olarak gösteriyordu — sayılar hiçbir yerde yoktu. Sistemin tek
 * kullandığı bölgenin ölçüsü, en görünür yerde durmalı.
 */
function GateEdge({ cal }: { cal: Calibration }) {
  if (cal.gate === null || cal.gate_n < 20 || cal.gate_edge === null) return null;

  const edge = cal.gate_edge;
  const t = cal.gate_edge_t;
  const strong = t !== null && Math.abs(t) >= 2;

  return (
    <Section
      title="Kapının üstü — sistemin fiilen işlem yaptığı bölge"
      description={`Puanı ${num(cal.gate, 0)} ve üstünde olanların ileri getirisi, aynı barlardaki havuz ortalamasıyla karşılaştırılır. Karşılaştırma bar bazındadır: dönem ortalamalarını kıyaslamak, sinyalin sık çıktığı günler piyasanın da iyi olduğu günlerse sahte kenar üretir.`}
    >
      <StatGrid cols={4}>
        <Stat
          label="Kapının üstü"
          hint="Puanı giriş eşiğini geçen gözlemlerin ortalama ileri getirisi."
          value={<AmountText text={pct(cal.gate_return, 2)} size="xl" />}
          sub={`${num(cal.gate_n, 0)} bar`}
          tone={(cal.gate_return ?? 0) >= 0 ? "up" : "down"}
        />
        <Stat
          label="Havuz"
          hint="Aynı barlardaki tüm havuzun ortalama ileri getirisi — karşılaştırma tabanı."
          value={<AmountText text={pct(cal.pool_return, 2)} size="xl" />}
          sub="aynı barlar"
          tone={(cal.pool_return ?? 0) >= 0 ? "up" : "down"}
        />
        <Stat
          label="Fark"
          hint="Kapının üstü eksi havuz. Sistemin seçiciliğinin tek ölçüsü budur."
          value={<AmountText text={pctSigned(edge, 2)} size="xl" />}
          sub={t !== null ? `t = ${signed(t, 1)}` : null}
          tone={edge > 0 ? "up" : "down"}
        />
        <Stat
          label="Gürültüden ayrılıyor mu"
          hint="|t| ≥ 2 kabaca %95 güven demektir. Altındaysa fark tesadüf olabilir."
          value={
            <span className={cx("text-[20px]", strong ? "text-ink" : "text-ink-3")}>
              {strong ? "Evet" : "Hayır"}
            </span>
          }
          sub={strong ? "|t| ≥ 2" : "|t| < 2 — tesadüf olabilir"}
          tone={strong ? (edge > 0 ? "up" : "down") : "neutral"}
        />
      </StatGrid>
      <p className="mt-3 max-w-3xl border-l-2 border-line-strong pl-3 text-[11.5px] leading-relaxed text-ink-3">
        <strong className="font-medium text-ink-2">Dikkat: </strong>
        bu ölçüm, eşiğin seçildiği veriyle aynı veri üzerinde yapılıyor. Kapının üstü iyi
        görünüyorsa bu, kenarın gerçek olduğunun değil, <em>henüz çürütülmediğinin</em>
        kanıtıdır. Eşiği bu sayıya bakarak oynatmak, ölçümü tamamen anlamsız kılar.
      </p>
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/*  Aile IC zaman serisi                                               */
/* ------------------------------------------------------------------ */

function IcSeries({ cal }: { cal: Calibration }) {
  const families = Array.from(new Set((cal.ic_series ?? []).map((p) => p.family)));
  if (families.length === 0) return null;

  const series = families.map((f) => ({
    label: FAMILY_LABELS[f] ?? f,
    color: FAMILY_COLORS[f] ?? "var(--ink3)",
    points: (cal.ic_series ?? [])
      .filter((p) => p.family === f && p.ic !== null)
      .map((p) => ({ at: p.at, value: p.ic as number })),
  }));

  return (
    <Section
      title="Aile öngörü gücünün zaman içindeki seyri"
      term="ic"
      description="Bir ailenin katsayısı uzun süre sıfır civarında geziyorsa, o aileye verilen ağırlık puana katkı veriyor ama öngörü katmıyor demektir."
    >
      <CurveChart height={240} series={series} valueFormat={(v) => num(v, 3)} />
      <Legend
        className="mt-2"
        items={series.map((s) => ({ label: s.label, color: s.color }))}
      />
    </Section>
  );
}

/* ------------------------------------------------------------------ */

function Selector({
  label,
  hint,
  options,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="flex items-center gap-1 text-[12px] text-ink-2">
        {label}
        {hint && <InfoDot text={hint} align="start" />}
      </span>
      <div className="flex rounded-lg border border-line p-0.5">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={cx(
              "rounded-md px-2 py-0.5 text-[12px] transition-colors",
              value === o.value
                ? "bg-brand-soft font-medium text-brand"
                : "text-ink-2 hover:text-ink",
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
