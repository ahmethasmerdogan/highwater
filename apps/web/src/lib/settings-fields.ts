/**
 * Ayar alanlarının sözlüğü — panelde her eşiğin ne yaptığı yazılı olsun diye.
 *
 * Kaynak: `apps/engine/sarnic/universe/filters.py::UniverseConfig`. Alan adları
 * birebir oradan gelir; API tanınmayan alanı reddeder.
 *
 * Havuz filtreleri sistemin en sessiz ama en etkili düğmeleridir: bir eşiği
 * yanlış kısmak havuzu 100'den 30'a düşürür ve bunu kimse fark etmez —
 * huni raporuna bakılmadıkça.
 */

export interface SettingFieldSpec {
  key: string;
  label: string;
  kind: "number" | "integer" | "text";
  unit?: string;
  step?: number;
  description: string;
  warning?: string;
}

export interface SettingGroupSpec {
  key: string;
  title: string;
  description: string;
  fields: SettingFieldSpec[];
}

export const SETTING_GROUPS: SettingGroupSpec[] = [
  {
    key: "universe",
    title: "Havuz filtreleri",
    description:
      "12 filtrenin eşikleri. Değişiklik bir sonraki havuz yenilemesinde devreye girer ve yeni bir config_hash üretir — yani eski snapshot'larla karıştırılmaz.",
    fields: [
      {
        key: "quote_asset",
        label: "Kote varlık",
        kind: "text",
        description: "Havuz bu varlığa karşı işlem gören çiftlerden kurulur (varsayılan USDT).",
      },
      {
        key: "volume_prefilter_n",
        label: "Hacim ön elemesi (N)",
        kind: "integer",
        step: 10,
        description:
          "24 saatlik hacimde ilk N sembol pahalı filtrelere sokulur. Ön eleme olmadan her yenilemede yüzlerce sembol için spread ve oynaklık hesaplanırdı.",
        warning: "Çok küçük tutmak, havuza girebilecek sembolleri daha bakmadan eler.",
      },
      {
        key: "min_age_days",
        label: "Asgari yaş",
        kind: "integer",
        unit: "gün",
        description:
          "Listelenme tarihinden bu yana geçmesi gereken gün. Yeni listelenen coinlerde fiyat oluşumu güvenilmez ve geçmiş veri indikatör için yetersizdir.",
      },
      {
        key: "max_spread_pct",
        label: "Azami spread",
        kind: "number",
        unit: "%",
        step: 0.05,
        description:
          "Alış-satış farkı bu değeri aşan sembol havuza girmez. Spread her işlemde peşin ödenen bir maliyettir.",
        warning: "Gevşetmek, kağıt üstünde kazanan ama gerçekte maliyete yenilen işlemler üretir.",
      },
      {
        key: "min_spread_samples",
        label: "Asgari spread örneği",
        kind: "integer",
        description:
          "Spread kararı için gereken en az ölçüm sayısı. Tek ölçüme bakmak, o anki anlık boşluğa bakmak demektir.",
      },
      {
        key: "max_tick_ratio_pct",
        label: "Azami tick / fiyat oranı",
        kind: "number",
        unit: "%",
        step: 0.01,
        description:
          "Fiyat adımının fiyata oranı. Bu oran, ulaşılabilecek en dar spread'in alt sınırıdır: bir sembolün spread'i bir tick'ten küçük olamaz.",
        warning:
          "Spread eşiğinden çok sıkı tutulursa aynı riski ikinci kez uygular ve havuzun en büyük kesimini burada yaparsınız.",
      },
      {
        key: "min_volatility_pct",
        label: "Asgari oynaklık",
        kind: "number",
        unit: "%",
        step: 5,
        description:
          "Yıllıklandırılmış oynaklık. Bunun altındaki bir coin hareket etmiyordur; komisyonu çıkarmaya yetecek bir hareket beklenemez.",
      },
      {
        key: "max_volatility_pct",
        label: "Azami oynaklık",
        kind: "number",
        unit: "%",
        step: 10,
        description:
          "Üst sınır. Aşırı oynak semboller stop mesafesini anlamsız büyütür ve pozisyon boyutunu iğne ucuna indirir.",
      },
      {
        key: "min_range_3d_pct",
        label: "Asgari 3 günlük aralık",
        kind: "number",
        unit: "%",
        step: 0.5,
        description: "Son 3 günün en yüksek/en düşük aralığı. Yatay kalmış sembolleri eler.",
      },
      {
        key: "max_range_3d_pct",
        label: "Azami 3 günlük aralık",
        kind: "number",
        unit: "%",
        step: 10,
        description:
          "Üst sınır. Üç günde birkaç katına çıkmış bir sembol genelde bir haber/pump olayıdır, tekrarlanabilir bir örüntü değil.",
      },
      {
        key: "top_n",
        label: "Havuz boyutu",
        kind: "integer",
        step: 10,
        description: "Filtrelerden geçenlerin ilk kaçı havuza alınır. Sistemin tasarım hedefi 100.",
        warning:
          "Büyütmek daha az likit semboller getirir; küçültmek çeşitlendirmeyi ve rotasyon alanını daraltır.",
      },
      {
        key: "hysteresis_band",
        label: "Histerezis bandı",
        kind: "integer",
        step: 5,
        description:
          "Havuzda olan bir sembol, sıralaması bu bandın içinde kaldığı sürece çıkarılmaz. 100. ile 101. sıra arasında gidip gelen bir sembolün her saat girip çıkmasını engeller — her giriş çıkış maliyet demektir.",
      },
    ],
  },
];
