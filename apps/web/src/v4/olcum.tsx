"use client";

/**
 * Ölçüm ilkelleri — DESIGN-V4 §2 ve §7'nin makine karşılığı.
 *
 * Bu dosyanın koruduğu iki söz:
 *
 *   **Her sayının künyesi vardır.** n, pencere, kesit, üretim zamanı.
 *   Künyesi olmayan sayı basılmaz. `Olcum` bunu tip düzeyinde zorlar:
 *   `kunye` isteğe bağlı değildir; sayının nereden geldiğini yazmadan
 *   bileşeni kullanamazsınız.
 *
 *   **Payda gizlenmez.** `Oran` daima iki sayı basar. "615 test geçti"
 *   değil, "615 / 615". 2026-09-04/05'te bulunan sekiz arızanın altısı
 *   tam olarak paydası görünmediği için aylarca fark edilmedi.
 */

import type { ReactNode } from "react";

export type Durum = "saglikli" | "supheli" | "bozuk" | "olu" | "kanit";

const RENK: Record<Durum, string> = {
  saglikli: "var(--v4-murekkep)",
  supheli: "var(--v4-amber)",
  bozuk: "var(--v4-kirmizi)",
  olu: "var(--v4-olu)",
  kanit: "var(--v4-civit)",
};

/** Türkçe biçim: ondalık virgül, binlik nokta, `tabular-nums` ile hizalı. */
export function sayi(
  v: number | null | undefined,
  basamak = 2,
  opts: { isaret?: boolean; yuzde?: boolean } = {},
): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  const x = opts.yuzde ? v * 100 : v;
  const govde = x.toLocaleString("tr-TR", {
    minimumFractionDigits: basamak,
    maximumFractionDigits: basamak,
  });
  const on = opts.isaret && x > 0 ? "+" : "";
  return `${on}${govde}${opts.yuzde ? " %" : ""}`;
}

/** Tam sayı — adet, n, sayaç. */
export function adet(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return Math.round(v).toLocaleString("tr-TR");
}

/**
 * Ölçülmüş tek sayı.
 *
 * `kunye` zorunludur ve sayının altında 10,5px mono olarak durur: hangi n,
 * hangi pencere, hangi kesit. Kesit seçici zorunlu olduğu için (§7) bir
 * IC rakamı `config_hash` olmadan basılamaz — 8. arıza (ölçek karışımı)
 * bu yüzden yapısal olarak imkânsızdır.
 */
export function Olcum({
  deger,
  kunye,
  etiket,
  durum = "saglikli",
  olcek = "masa",
  gecersiz,
  supheli,
}: {
  deger: ReactNode;
  kunye: string;
  etiket?: string;
  durum?: Durum;
  olcek?: "masa" | "duvar";
  /** Geçersizlik geriye işler: üstü çizili durur ve sebebi yazılıdır (§2.4). */
  gecersiz?: string | null;
  /** Üretildiği dönemde bir bayrak açıktı. */
  supheli?: boolean;
}) {
  const sinif = ["v4-olcum", gecersiz ? "v4-gecersiz" : "", supheli ? "v4-supheli" : ""]
    .filter(Boolean)
    .join(" ");
  return (
    <div>
      {etiket ? <div className="v4-etiket mb-[3px]">{etiket}</div> : null}
      <div
        className={sinif}
        style={{
          color: gecersiz ? "var(--v4-olu)" : RENK[durum],
          fontSize: olcek === "duvar" ? "var(--v4-duvar)" : "var(--v4-olcum)",
          fontWeight: olcek === "duvar" ? 450 : 400,
          lineHeight: olcek === "duvar" ? 1.1 : 1.4,
          transition: `color var(--v4-gecis)`,
        }}
      >
        {deger}
      </div>
      <div className="v4-kunye mt-[3px]">{gecersiz ? `geçersiz · ${gecersiz}` : kunye}</div>
    </div>
  );
}

/**
 * Oran — payda daima görünür.
 *
 * `kural` verilirse kuralın altında kalan oran kırmızıya döner. Renk burada
 * bir uyarı değil bir ölçüdür: kesici payı 0,13× iken filo günde 1697 kez
 * yeniden doğuyordu ve panel bunu hiçbir yerde söylemiyordu.
 */
export function Oran({
  pay,
  payda,
  birim,
  etiket,
  kunye,
  kural,
  olcek = "masa",
  ters,
}: {
  pay: number | null;
  payda: number | null;
  birim?: string;
  etiket: string;
  kunye: string;
  /** Oranın altına düşmemesi gereken sınır (ör. kesici payı ≥ 1,5). */
  kural?: number;
  olcek?: "masa" | "duvar";
  /** Doğru yön aşağıysa (ör. bağlantı kullanımı) kuralı tersine oku. */
  ters?: boolean;
}) {
  const oran = pay !== null && payda ? pay / payda : null;
  const ihlal =
    kural !== undefined && oran !== null && (ters ? oran > kural : oran < kural);
  return (
    <div>
      <div className="v4-etiket mb-[3px]">{etiket}</div>
      <div
        className="v4-olcum"
        style={{
          color: ihlal ? "var(--v4-kirmizi)" : "var(--v4-murekkep)",
          fontSize: olcek === "duvar" ? "var(--v4-duvar)" : "var(--v4-olcum)",
          fontWeight: olcek === "duvar" ? 450 : 400,
          lineHeight: olcek === "duvar" ? 1.1 : 1.4,
          transition: "color var(--v4-gecis)",
        }}
      >
        {adet(pay)}
        <span style={{ color: "var(--v4-olu)" }}> / </span>
        <span style={{ color: ihlal ? "var(--v4-kirmizi)" : "var(--v4-ikincil)" }}>
          {adet(payda)}
        </span>
        {birim ? (
          <span
            className="v4-etiket"
            style={{ marginLeft: 6, letterSpacing: "0.06em", textTransform: "none" }}
          >
            {birim}
          </span>
        ) : null}
      </div>
      <div className="v4-kunye mt-[3px]">
        {oran !== null ? `${sayi(oran, 3)}×` : "ölçüm yok"}
        {kural !== undefined ? ` · kural ${ters ? "≤" : "≥"} ${sayi(kural, 2)}×` : ""}
        {kunye ? ` · ${kunye}` : ""}
      </div>
    </div>
  );
}

/**
 * Sayaç satırı — üç sınıftan biri.
 *
 * OLDU mürekkep, OLMADI-BEKLENİYORDU kırmızı (ve tepeye çıkar), HİÇ OLMADI
 * gri ölü rozetiyle. Üçüncüsü en pahalısı: rotasyon ömür boyu 1 kez çalıştı,
 * kalabalık cezası %0,44, korelasyon kümesi 0. Yapılandırılmış ama hiç iş
 * görmemiş bir kural koruma değil **yanılsamadır**.
 */
export function Sayac({
  ad,
  deger,
  sinif,
  not,
}: {
  ad: string;
  deger: number;
  sinif: "oldu" | "beklendi_olmadi" | "hic_olmadi";
  not?: string;
}) {
  const bozuk = sinif === "beklendi_olmadi" && deger > 0;
  const olu = sinif === "hic_olmadi" && deger === 0;
  return (
    <div className="flex items-baseline gap-3 py-[5px]">
      {olu ? (
        <span style={{ color: "var(--v4-olu)", fontSize: 10, lineHeight: 1 }} aria-hidden>
          ◼
        </span>
      ) : null}
      <span
        className="v4-olcum tabular-nums"
        style={{
          minWidth: 58,
          textAlign: "right",
          color: bozuk
            ? "var(--v4-kirmizi)"
            : olu
              ? "var(--v4-olu)"
              : "var(--v4-murekkep)",
          transition: "color var(--v4-gecis)",
        }}
      >
        {adet(deger)}
      </span>
      <span
        style={{
          fontSize: 13,
          color: olu ? "var(--v4-olu)" : "var(--v4-murekkep)",
        }}
      >
        {ad}
      </span>
      {not ? <span className="v4-kunye">{not}</span> : null}
    </div>
  );
}

/** Damga — hipotez kartlarının ve kolların durumu. Yeşil yok. */
export function Damga({ children, tur }: { children: ReactNode; tur: Durum }) {
  const zemin: Record<Durum, string> = {
    saglikli: "transparent",
    supheli: "var(--v4-amber-zemin)",
    bozuk: "var(--v4-kirmizi-zemin)",
    olu: "transparent",
    kanit: "var(--v4-civit-zemin)",
  };
  return (
    <span
      className="v4-etiket"
      style={{
        color: RENK[tur],
        background: zemin[tur],
        border: `1px solid ${tur === "saglikli" || tur === "olu" ? "var(--v4-cizgi-koyu)" : RENK[tur]}`,
        borderRadius: 2,
        padding: "1px 6px",
        whiteSpace: "nowrap",
        transition: "color var(--v4-gecis), background var(--v4-gecis)",
      }}
    >
      {children}
    </span>
  );
}

/**
 * Sessizlik bir durumdur (§2.1).
 *
 * Boş liste "veri yok" demez; **ne beklendiğini** ve **ne bulunduğunu** söyler.
 * Olmayan olay, olan olay kadar görünür olmalı.
 */
export function Sessizlik({ beklenen, bulunan }: { beklenen: string; bulunan?: string }) {
  return (
    <div className="px-4 py-6" style={{ borderTop: "1px solid var(--v4-cizgi)" }}>
      <div className="v4-etiket" style={{ color: "var(--v4-amber)" }}>
        sessizlik
      </div>
      <p className="v4-muhakeme mt-1" style={{ maxWidth: "56ch" }}>
        {beklenen}
      </p>
      <div className="v4-kunye mt-2">{bulunan ?? "hiçbir satır dönmedi"}</div>
    </div>
  );
}
