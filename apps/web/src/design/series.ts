/**
 * Puan aileleri — etiket, renk ve tek cümlelik açıklama.
 *
 * Renk sırası **anlamlıdır**: trend → momentum → akış → volatilite → s/r.
 * Renk körlüğü ayrımı komşu çiftler üzerinden ölçüldü; sırayı değiştirmek
 * o doğrulamayı geçersiz kılar. Yeşil ve kırmızı bilinçli olarak yok —
 * o ikisi yön için rezerve.
 *
 * Deuteranopide komşu olmayan pembe↔turkuaz çifti birbirine yaklaşıyor;
 * bu yüzden her aile çubuğun yanında **adı ve sayısıyla** yazılır.
 * Kimlik hiçbir yerde yalnızca renge bırakılmaz.
 */

export interface Family {
  id: string;
  label: string;
  color: string;
  hint: string;
}

export const FAMILIES: Family[] = [
  {
    id: "trend",
    label: "Trend",
    color: "var(--sn-series-1)",
    hint: "Fiyat yönünün kararlılığı: hareketli ortalama dizilimi ve eğimi.",
  },
  {
    id: "momentum",
    label: "Momentum",
    color: "var(--sn-series-2)",
    hint: "Hareketin hızı ve ivmesi — trendin ne kadar taze olduğu.",
  },
  {
    id: "flow",
    label: "Akış",
    color: "var(--sn-series-3)",
    hint: "Hacim ve alıcı/satıcı baskısı: hareketi kim taşıyor.",
  },
  {
    id: "vol",
    label: "Volatilite",
    color: "var(--sn-series-4)",
    hint: "Oynaklık rejimi. Yüksek oynaklık hem fırsat hem risk tarafını büyütür.",
  },
  {
    id: "sr",
    label: "Destek/Direnç",
    color: "var(--sn-series-5)",
    hint: "Fiyatın destek ve dirence göre konumu — yukarı alan var mı.",
  },
];

export const FAMILY_BY_ID = new Map(FAMILIES.map((family) => [family.id, family]));
