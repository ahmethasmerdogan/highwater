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
import { api, type Calibration } from "@/lib/api";
import { num, pct, pctSigned, signed } from "@/lib/format";
import { Page, GuideSection } from "@/shell/page";
import {
  Async,
  Explain,
  InfoDot,
  Metric,
  NumText,
  Panel,
  RichText,
  Segmented,
  Term,
  TextMetric,
} from "@/design";
import { ChartLegend, CurveChart, DecileChart } from "@/design/chart";
import { FAMILY_BY_ID } from "@/design/series";
import { SimpleTable, type SimpleColumn } from "@/grid/simple-table";
import { cx } from "@/design/cx";

const HORIZONS = [
  { value: "4h", label: "4 saat" },
  { value: "24h", label: "24 saat" },
  { value: "72h", label: "72 saat" },
];

const WINDOWS = [
  { value: "90", label: "90 gün" },
  { value: "180", label: "180 gün" },
  { value: "365", label: "1 yıl" },
  { value: "730", label: "2 yıl" },
];

export default function CalibrationPage() {
  const [horizon, setHorizon] = useState("24h");
  const [days, setDays] = useState("180");

  const query = useQuery({
    queryKey: ["calibration", horizon, days],
    queryFn: () => api.get<Calibration>("/calibration", { horizon, days: Number(days) }),
    refetchInterval: 300_000,
  });

  return (
    <Page
      title="Kalibrasyon"
      summary="Puanlama gerçekten işe yarıyor mu? Bu sayfa cevabı ölçer ve cevap olumsuz olabilir."
      actions={
        <div className="flex flex-wrap items-center gap-3">
          <span
            className="flex items-center gap-1"
            style={{ fontSize: "var(--sn-t-caption)", color: "var(--sn-ink-3)" }}
          >
            Ufuk
            <InfoDot text="Puan hesaplandıktan kaç saat sonraki getiriye bakılacağı." />
          </span>
          <Segmented size="sm" value={horizon} onChange={setHorizon} options={HORIZONS} />
          <span
            className="flex items-center gap-1"
            style={{ fontSize: "var(--sn-t-caption)", color: "var(--sn-ink-3)" }}
          >
            Pencere
            <InfoDot text="Kaç günlük gözlem kullanılacağı. Kısa pencere daha güncel ama daha gürültülüdür." />
          </span>
          <Segmented size="sm" value={days} onChange={setDays} options={WINDOWS} />
        </div>
      }
      guide={
        <>
          <GuideSection title="Ne gösteriyor">
            <p>
              Sistem her puanı hesapladığında kaydeder, sonra o coinin ileriki getirisiyle
              eşleştirir. Bu sayfa o eşleşmeleri toplar ve tek bir soruyu sorar: yüksek puan alan
              coinler gerçekten daha iyi getiri sağladı mı?
            </p>
          </GuideSection>
          <GuideSection title="Nasıl okunur">
            <p>
              <strong>Desil grafiği</strong> ana görseldir. Puanlar en düşükten en yükseğe on
              dilime bölünür ve her dilimin ortalama getirisi çizilir. Puanlama çalışıyorsa
              çubuklar soldan sağa artmalıdır.
            </p>
            <p>
              Çubukların üstündeki ince çizgiler <strong>güven aralığıdır</strong>. Aralıklar
              birbirini bolca kesiyorsa fark gürültü olabilir — gerçek bir sinyal değil.
            </p>
            <p>
              <strong>Sıra korelasyonu</strong> puan sıralamasıyla getiri sıralamasının uyumunu
              tek sayıya indirir. Finansal veride 0,03–0,05 bile anlamlıdır; büyük değerler
              genellikle bir hata işaretidir.
            </p>
          </GuideSection>
          <GuideSection title="Ne yapabilirim">
            <p>
              İlişki düzse ağırlıkları değiştirip yeniden denemeyin — aynı veri üzerinde arama
              yapmak, sonunda o veriye uyan bir kombinasyon bulmanızı sağlar ve bu bir keşif
              değil ezberdir. Bunun yerine hipotezi değiştirin ve kilitli döneme dokunmadan
              yeniden test edin.
            </p>
          </GuideSection>
        </>
      }
    >
      <Async query={query}>
        {(cal) => (
          <>
            <Verdict cal={cal} />
            <GateEdge cal={cal} />

            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Metric
                label="Gözlem sayısı"
                value={cal.n}
                format={(value) => num(value, 0)}
                accent={cal.sufficient ? undefined : "var(--sn-warn)"}
                sub={`${num(cal.span_days, 0)} günlük aralık · en az 500 gözlem ve 30 gün gerekir`}
              />
              <Metric
                label="Sıra korelasyonu"
                value={cal.spearman}
                format={(value) => num(value, 3)}
                accent={
                  cal.spearman === null
                    ? undefined
                    : cal.spearman > 0
                      ? "var(--sn-up)"
                      : "var(--sn-down)"
                }
                sub={
                  cal.spearman_p !== null
                    ? `şansa bağlı olma ihtimali ${num(cal.spearman_p, 3)}`
                    : undefined
                }
              />
              <Metric
                label="Üst − alt dilim"
                value={cal.top_minus_bottom}
                format={(value) => pct(value, 2)}
                accent={
                  cal.top_minus_bottom === null
                    ? undefined
                    : cal.top_minus_bottom > 0
                      ? "var(--sn-up)"
                      : "var(--sn-down)"
                }
                sub={
                  cal.top_minus_bottom_p !== null
                    ? `şansa bağlı olma ihtimali ${num(cal.top_minus_bottom_p, 3)}`
                    : undefined
                }
              />
              <TextMetric
                label="Monotonluk"
                info={<InfoDot id="monotonluk" />}
                value={cal.monotonic ? "Artıyor" : "Artmıyor"}
                tone={cal.monotonic ? "var(--sn-up)" : "var(--sn-down)"}
                sub={
                  cal.monotonic
                    ? "dilim ortalamaları sürekli yükseliyor"
                    : "dilim ortalamaları düzensiz"
                }
              />
            </div>

            <Panel
              title={
                <span className="flex items-center gap-1.5">
                  Puan dilimi → ortalama getiri
                  <InfoDot id="desil" />
                </span>
              }
              description="Puanlar en düşükten en yükseğe on dilime bölünür. Puanlama çalışıyorsa çubuklar soldan sağa artmalıdır."
            >
              <p
                className="mb-3 max-w-3xl"
                style={{ fontSize: "var(--sn-t-caption)", color: "var(--sn-ink-3)", lineHeight: 1.55 }}
              >
                Ortalama ile medyan ayrışıyorsa o dilimi birkaç aşırı getiri taşıyor demektir. En
                düşük dilimde bu sık görülür: ortalama pozitif çıkar ama tipik gözlem zarardadır.
                Karar verirken medyana bakın.
              </p>

              <DecileChart data={cal.deciles} />

              {/* İki ölçü var; renk disiplini açıklama şeridini zorunlu kılıyor. */}
              <div className="mt-2">
                <ChartLegend
                  items={[
                    { label: "Ortalama getiri (çubuk)", color: "var(--sn-ink-3)" },
                    { label: "Medyan getiri (kesik çizgi)", color: "var(--sn-ink-2)", dashed: true },
                  ]}
                />
              </div>

              <div className="mt-4">
                <DecileTable cal={cal} />
              </div>
            </Panel>

            <div className="grid gap-4 lg:grid-cols-2">
              <Panel
                title={
                  <span className="flex items-center gap-1.5">
                    Aile bazında öngörü gücü
                    <InfoDot id="ic" />
                  </span>
                }
                description="Her ailenin ileri getiriyle ilişkisi. Uzun süre sıfır civarında gezen bir ailenin ağırlığı sorgulanmalıdır."
              >
                <FamilyIc familyIc={cal.family_ic} />
                <p
                  className="mt-3"
                  style={{ fontSize: "var(--sn-t-caption)", color: "var(--sn-ink-3)", lineHeight: 1.55 }}
                >
                  Ölçek ±0,10. Finansal veride 0,03–0,05 bandı bile anlamlı sayılır; belirgin
                  biçimde büyük değerler genellikle bir hesap hatasını gösterir.
                </p>
              </Panel>

              <Panel
                title="Sıra korelasyonunun seyri"
                description="30 günlük kayan pencerede puan–getiri ilişkisi. Sürekli pozitif kalması, ilişkinin tek bir döneme bağlı olmadığını gösterir."
              >
                <CurveChart
                  height={200}
                  series={[
                    {
                      label: "Sıra korelasyonu",
                      color: "var(--sn-series-1)",
                      points: (cal.rolling_spearman ?? [])
                        .filter((point) => point.value !== null)
                        .map((point) => ({ at: point.at, value: point.value as number })),
                    },
                  ]}
                  valueFormat={(value) => num(value, 3)}
                  emptyText="Kayan pencere için yeterli gözlem yok."
                />
                <p
                  className="mt-2"
                  style={{ fontSize: "var(--sn-t-caption)", color: "var(--sn-ink-3)", lineHeight: 1.55 }}
                >
                  Sıfır çizgisinin üstünde geçirdiği süre, altında geçirdiğinden belirgin biçimde
                  fazla olmalıdır. Sürekli sıfır etrafında salınıyorsa puanlama bilgi taşımıyor.
                </p>
              </Panel>
            </div>

            <IcSeries cal={cal} />

            <Panel title="Bu sayfa neden var">
              <div className="grid gap-4 md:grid-cols-2">
                <Explain id="kalibrasyon" />
                <div className="flex flex-col gap-4">
                  <Explain id="desil" />
                  <Explain id="out_of_sample" />
                </div>
              </div>
            </Panel>
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
 * Kullanıcı grafikleri yorumlamak zorunda kalmamalı: sistemin kendi hükmü
 * en üstte durur.
 */
function Verdict({ cal }: { cal: Calibration }) {
  const insufficient = !cal.sufficient;
  const positive = cal.monotonic && (cal.spearman ?? 0) > 0;

  /* Dağılım geneli düz olsa bile sistemin ALDIĞI bölge ayrışıyor olabilir.
     Başlık yalnızca Spearman'a bakınca gövdedeki kapı cümlesiyle çelişen bir
     hüküm veriyordu: "öngörü gücü gösteremiyor" yazarken hemen altında
     "kapının üstü havuzu anlamlı biçimde geçiyor" diyordu. */
  const gateWorks =
    cal.gate_n >= 20 &&
    (cal.gate_edge ?? 0) > 0 &&
    Math.abs(cal.gate_edge_t_daily ?? cal.gate_edge_t ?? 0) >= 2;

  const tone = insufficient ? "warn" : positive || gateWorks ? "up" : "down";
  const title = insufficient
    ? "Karar vermek için henüz erken"
    : positive
      ? "Puanlama şu ana kadar öngörü gücü gösteriyor"
      : gateWorks
        ? "Dağılım geneli düz, ama sistemin aldığı bölge ayrışıyor"
        : "Puanlama öngörü gücü gösteremiyor";

  const color =
    tone === "up" ? "var(--sn-up)" : tone === "down" ? "var(--sn-down)" : "var(--sn-warn)";
  const background =
    tone === "up" ? "var(--sn-up-bg)" : tone === "down" ? "var(--sn-down-bg)" : "var(--sn-warn-bg)";

  return (
    <div
      className="rounded-[var(--sn-r-md)] px-5 py-4"
      style={{ background, border: `1px solid color-mix(in oklab, ${color} 30%, transparent)` }}
    >
      <h2 className="font-semibold" style={{ fontSize: "var(--sn-t-title)", color: "var(--sn-ink)" }}>
        {title}
      </h2>
      <div
        className="mt-1.5 max-w-3xl"
        style={{ fontSize: "var(--sn-t-body)", color: "var(--sn-ink-2)", lineHeight: 1.55 }}
      >
        <RichText text={cal.verdict || fallbackVerdict(cal)} />
      </div>
      {!insufficient && !positive && !gateWorks && (
        <p
          className="mt-2.5 max-w-3xl pl-3"
          style={{
            borderLeft: "2px solid var(--sn-down)",
            fontSize: "var(--sn-t-caption)",
            color: "var(--sn-ink-2)",
            lineHeight: 1.55,
          }}
        >
          <strong style={{ color: "var(--sn-ink)", fontWeight: 550 }}>Ne yapmamalı: </strong>
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
/*  Desil tablosu                                                      */
/* ------------------------------------------------------------------ */

function DecileTable({ cal }: { cal: Calibration }) {
  type Row = Calibration["deciles"][number];

  const columns: SimpleColumn<Row>[] = [
    { header: "Dilim", num: true, width: "70px", cell: (row) => <NumText text={String(row.decile)} size="sm" /> },
    { header: "Ortalama puan", num: true, cell: (row) => <NumText text={num(row.mean_score, 1)} size="sm" /> },
    { header: "Gözlem", num: true, cell: (row) => <NumText text={num(row.count, 0)} size="sm" /> },
    {
      header: "Ortalama getiri",
      num: true,
      cell: (row) => (
        <NumText
          text={pct(row.mean_return, 2)}
          size="sm"
          tone={row.mean_return >= 0 ? "var(--sn-up)" : "var(--sn-down)"}
        />
      ),
    },
    {
      header: "Medyan getiri",
      num: true,
      hint: "Ortalama birkaç aşırı getiriyle sürüklenir; medyan tipik gözlemi gösterir.",
      cell: (row) => (
        <NumText
          text={pct(row.median_return, 2)}
          size="sm"
          tone={row.median_return >= 0 ? "var(--sn-up)" : "var(--sn-down)"}
        />
      ),
    },
    {
      header: "Güven aralığı",
      num: true,
      term: "guven_araligi",
      cell: (row) => (
        <span style={{ fontSize: "var(--sn-t-caption)", color: "var(--sn-ink-2)" }}>
          {pct(row.ci_low, 2)} … {pct(row.ci_high, 2)}
        </span>
      ),
    },
    {
      header: "Gürültüden ayrılıyor mu",
      hint: "Güven aralığı sıfırı içermiyorsa fark gürültüden ayrışmış demektir.",
      cell: (row) => {
        const separated = row.ci_low > 0 || row.ci_high < 0;
        return (
          <span
            style={{
              fontSize: "var(--sn-t-caption)",
              color: separated ? "var(--sn-ink)" : "var(--sn-ink-3)",
            }}
          >
            {separated ? "Evet" : "Hayır — sıfırı içeriyor"}
          </span>
        );
      },
    },
  ];

  return (
    <div className="sn-scroll overflow-x-auto">
      <SimpleTable rows={cal.deciles} columns={columns} rowKey={(row) => row.decile} dense />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Aile IC çubukları                                                  */
/* ------------------------------------------------------------------ */

/**
 * Sıfır ortada; sola negatif, sağa pozitif.
 *
 * Ölçek ±0,10'a sabit: her ailenin kendi ölçeğine göre çizilmesi, 0,002'lik
 * bir katsayıyı 0,08'lik bir katsayı kadar uzun gösterirdi.
 */
function FamilyIc({ familyIc }: { familyIc: Record<string, number | null> }) {
  const SCALE = 0.1;

  return (
    <div className="flex flex-col gap-2.5">
      {Object.entries(familyIc).map(([id, ic]) => {
        const family = FAMILY_BY_ID.get(id);
        const width = ic === null ? 0 : Math.min(100, (Math.abs(ic) / SCALE) * 100);
        return (
          <div key={id} className="flex items-center gap-2.5">
            <span className="w-28 shrink-0">
              <Term id={`aile_${id}`}>
                <span style={{ fontSize: "var(--sn-t-caption)", color: "var(--sn-ink-2)" }}>
                  {family?.label ?? id}
                </span>
              </Term>
            </span>
            <div
              className="relative h-2 flex-1 rounded-full"
              style={{ background: "var(--sn-sunken)" }}
            >
              <span
                aria-hidden
                className="absolute top-0 bottom-0 left-1/2 w-px"
                style={{ background: "var(--sn-border-strong)" }}
              />
              {ic !== null && (
                <span
                  className={cx("absolute top-0 h-full rounded-full", ic >= 0 ? "left-1/2" : "right-1/2")}
                  style={{
                    width: `${width / 2}%`,
                    background: ic >= 0 ? "var(--sn-up)" : "var(--sn-down)",
                  }}
                />
              )}
            </div>
            <NumText text={num(ic, 3)} size="sm" className="w-14 text-right" />
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Kapının üstü                                                       */
/* ------------------------------------------------------------------ */

/**
 * Spearman ve üst−alt dilim farkı **tüm dağılıma** bakar. Sistem ise
 * yalnızca giriş kapısının üstünü alır; alt dilimleri hiç satın almaz. Bu
 * iki ölçüm farklı şeyler söyleyebilir ve söylüyor da.
 */
function GateEdge({ cal }: { cal: Calibration }) {
  if (cal.gate === null || cal.gate_n < 20 || cal.gate_edge === null) return null;

  const edge = cal.gate_edge;
  const t = cal.gate_edge_t;
  /* Karar KÜMELENMİŞ t'ye göre: aynı günün barları aynı piyasa dalgasını
     paylaşır; ham t bağımsızlık varsayıp ~%70 şişkin çıkıyordu (ölçüldü:
     2,61 → 1,52). Kümelenmiş değer yoksa ham t'ye düşülür. */
  const tDaily = cal.gate_edge_t_daily ?? null;
  const tKarar = tDaily ?? t;
  const strong = tKarar !== null && Math.abs(tKarar) >= 2;

  return (
    <Panel
      title="Kapının üstü — sistemin fiilen işlem yaptığı bölge"
      description={`Puanı ${num(cal.gate, 0)} ve üstünde olanların ileri getirisi, aynı barlardaki havuz ortalamasıyla karşılaştırılır. Karşılaştırma bar bazındadır: dönem ortalamalarını kıyaslamak, sinyalin sık çıktığı günler piyasanın da iyi olduğu günlerse sahte kenar üretir.`}
    >
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric
          animateOnMount
          label="Kapının üstü"
          value={cal.gate_return}
          format={(value) => pct(value, 2)}
          accent={(cal.gate_return ?? 0) >= 0 ? "var(--sn-up)" : "var(--sn-down)"}
          sub={`${num(cal.gate_n, 0)} bar`}
        />
        <Metric
          animateOnMount
          label="Havuz"
          value={cal.pool_return}
          format={(value) => pct(value, 2)}
          accent={(cal.pool_return ?? 0) >= 0 ? "var(--sn-up)" : "var(--sn-down)"}
          sub="aynı barlar — karşılaştırma tabanı"
        />
        <Metric
          animateOnMount
          label="Fark"
          value={edge}
          format={(value) => pctSigned(value, 2)}
          accent={edge > 0 ? "var(--sn-up)" : "var(--sn-down)"}
          sub={
            tDaily !== null
              ? `t = ${signed(tDaily, 1)} (gün-kümeli, ${num(cal.gate_days, 0)} gün) · ham ${signed(t ?? 0, 1)}`
              : t !== null
                ? `t = ${signed(t, 1)} (ham — kümelenmiş henüz yok)`
                : "sistemin seçiciliğinin tek ölçüsü"
          }
        />
        <TextMetric
          label="Gürültüden ayrılıyor mu"
          info={<InfoDot text="|t| ≥ 2 kabaca %95 güven demektir. Ölçü GÜN-KÜMELENMİŞ t'dir: aynı günün barları bağımsız değildir, ham t şişkin çıkar." />}
          value={strong ? "Evet" : "Hayır"}
          tone={strong ? "var(--sn-ink)" : "var(--sn-ink-3)"}
          sub={strong ? "|t| ≥ 2" : "|t| < 2 — tesadüf olabilir"}
        />
      </div>

      <p
        className="mt-3 max-w-3xl pl-3"
        style={{
          borderLeft: "2px solid var(--sn-border-strong)",
          fontSize: "var(--sn-t-caption)",
          color: "var(--sn-ink-3)",
          lineHeight: 1.55,
        }}
      >
        <strong style={{ color: "var(--sn-ink-2)", fontWeight: 550 }}>Dikkat: </strong>
        bu ölçüm, eşiğin seçildiği veriyle aynı veri üzerinde yapılıyor. Kapının üstü iyi
        görünüyorsa bu, kenarın gerçek olduğunun değil, <em>henüz çürütülmediğinin</em>{" "}
        kanıtıdır. Eşiği bu sayıya bakarak oynatmak, ölçümü tamamen anlamsız kılar.
      </p>
    </Panel>
  );
}

/* ------------------------------------------------------------------ */

function IcSeries({ cal }: { cal: Calibration }) {
  const ids = Array.from(new Set((cal.ic_series ?? []).map((point) => point.family)));
  if (ids.length === 0) return null;

  const series = ids.map((id) => ({
    label: FAMILY_BY_ID.get(id)?.label ?? id,
    color: FAMILY_BY_ID.get(id)?.color ?? "var(--sn-ink-3)",
    points: (cal.ic_series ?? [])
      .filter((point) => point.family === id && point.ic !== null)
      .map((point) => ({ at: point.at, value: point.ic as number })),
  }));

  return (
    <Panel
      title={
        <span className="flex items-center gap-1.5">
          Aile öngörü gücünün zaman içindeki seyri
          <InfoDot id="ic" />
        </span>
      }
      description="Bir ailenin katsayısı uzun süre sıfır civarında geziyorsa, o aileye verilen ağırlık puana katkı veriyor ama öngörü katmıyor demektir."
    >
      <CurveChart height={240} series={series} valueFormat={(value) => num(value, 3)} />
      <div className="mt-2">
        <ChartLegend items={series.map((one) => ({ label: one.label, color: one.color }))} />
      </div>
    </Panel>
  );
}
