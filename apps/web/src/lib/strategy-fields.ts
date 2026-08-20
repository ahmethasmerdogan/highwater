/**
 * Strateji tanımının alan sözlüğü.
 *
 * Kullanıcı kurguyu buradan yapacak; bu yüzden her alanın **ne olduğu, hangi
 * birimde olduğu ve yanlış ayarlanırsa ne olacağı** yazılı. Bir sayı kutusunun
 * yanında açıklama yoksa kullanıcı onu değiştirmez — ya da körlemesine
 * değiştirir; ikisi de kötüdür.
 *
 * Kaynak: `apps/engine/sarnic/strategy/definition.py` — alan adları birebir
 * oradan gelir. Değiştirirken iki tarafı birlikte değiştir.
 */

export type FieldKind = "number" | "percent" | "integer" | "boolean" | "text";

export interface FieldSpec {
  /** Tanım içindeki yol: `exit.trail_atr` gibi. */
  path: string;
  label: string;
  kind: FieldKind;
  unit?: string;
  min?: number;
  max?: number;
  step?: number;
  /** Ne işe yarar. */
  description: string;
  /** Yanlış ayarlanırsa ne olur. */
  warning?: string;
}

export interface FieldGroup {
  key: string;
  title: string;
  description: string;
  fields: FieldSpec[];
}

export const STRATEGY_GROUPS: FieldGroup[] = [
  {
    key: "temel",
    title: "Temel",
    description:
      "Stratejinin kimliği ve karar birimi. Karar birimi bir bar kapanışıdır; bar kapanmadan o barın verisi karara giremez.",
    fields: [
      {
        path: "name",
        label: "Ad",
        kind: "text",
        description: "Panelde ve bildirimlerde görünen ad. Sonuçları bununla ayırt edeceksiniz.",
      },
      {
        path: "timeframe",
        label: "Zaman dilimi",
        kind: "text",
        description:
          "Karar birimi. `1h` bir saatlik mum kapanışında karar verilir demektir. Sistem yüksek frekanslı değildir.",
        warning:
          "Kısa zaman dilimi devir hızını artırır; komisyon ve kayma getirinin tamamını yiyebilir.",
      },
    ],
  },
  {
    key: "scoring",
    title: "Puanlama ağırlıkları",
    description:
      "Beş özellik ailesinin taban puana katkı payı. Toplamları 1 olacak şekilde normalize edilir; bir aileyi büyütmek diğerlerini küçültür.",
    fields: [
      {
        path: "scoring.weights.trend",
        label: "Trend",
        kind: "number",
        min: 0,
        max: 1,
        step: 0.05,
        description:
          "Fiyatın yönü ve yönün gücü (EMA dizilimi, ADX). Yükselen bir piyasada en açıklayıcı aile budur.",
      },
      {
        path: "scoring.weights.momentum",
        label: "Momentum",
        kind: "number",
        min: 0,
        max: 1,
        step: 0.05,
        description: "Hareketin hızı ve ivmesi (RSI, MACD histogramı, getiri sıralaması).",
        warning: "Tek başına yüksek tutulursa tepe noktalarında alım yapılır.",
      },
      {
        path: "scoring.weights.flow",
        label: "Akış",
        kind: "number",
        min: 0,
        max: 1,
        step: 0.05,
        description:
          "Hacim ve para akışı (OBV, hacim patlaması). Fiyat hareketinin arkasında gerçek talep var mı?",
      },
      {
        path: "scoring.weights.vol",
        label: "Volatilite",
        kind: "number",
        min: 0,
        max: 1,
        step: 0.05,
        description:
          "Oynaklık rejimi (ATR%, Bollinger genişliği). Aşırı oynak bir coin aynı riskle daha küçük alınır.",
      },
      {
        path: "scoring.weights.sr",
        label: "Destek / direnç",
        kind: "number",
        min: 0,
        max: 1,
        step: 0.05,
        description:
          "Fiyatın destek ve dirence göre konumu, geometrik risk/ödül. Dirence yapışmış bir coin düşük puan alır.",
      },
      {
        path: "scoring.modifiers.pattern",
        label: "Formasyon değiştiricisi",
        kind: "boolean",
        description:
          "Grafik formasyonları taban puanı artırır veya düşürür. Sistemin en zayıf halkası; kapatmak meşru bir seçimdir.",
      },
      {
        path: "scoring.modifiers.candle",
        label: "Mum sinyalleri",
        kind: "boolean",
        description: "Tek/çift mum sinyalleri (yutan mum, çekiç) küçük bir düzeltme uygular.",
      },
      {
        path: "scoring.modifiers.crowding",
        label: "Kalabalık cezası",
        kind: "boolean",
        description:
          "Aynı anda çok sayıda coin yüksek puan alıyorsa puanlar kırpılır — piyasa geneli yükseliyordur, seçim değer katmıyordur.",
      },
    ],
  },
  {
    key: "entry",
    title: "Giriş",
    description:
      "Ne zaman pozisyon açılır. Göreli sıralama hangi coinin seçileceğini, mutlak kapı hiç işlem yapılıp yapılmayacağını belirler.",
    fields: [
      {
        path: "entry.min_score",
        label: "Mutlak kapı (min. puan)",
        kind: "number",
        min: 0,
        max: 100,
        step: 1,
        description:
          "Bu puanın altındaki hiçbir coine pozisyon açılmaz — havuzun en iyisi olsa bile. Piyasa kötüyken sistemin nakitte kalmasını bu sağlar.",
        warning: "Düşürmek, kötü piyasada da işlem yapılmasına yol açar.",
      },
      {
        path: "entry.max_positions",
        label: "Azami eşzamanlı pozisyon",
        kind: "integer",
        min: 1,
        max: 20,
        step: 1,
        description: "Aynı anda kaç coin tutulabilir. Sermaye bu sayıya bölünerek dağıtılır.",
        warning: "Artırmak çeşitlendirir ama pozisyon başına etkiyi küçültür ve maliyeti artırır.",
      },
    ],
  },
  {
    key: "sizing",
    title: "Boyutlandırma",
    description:
      "Bir pozisyona ne kadar sermaye ayrılacağı. Risk tabanlıdır: kaç lot değil, kaç para riske edildiği sabitlenir.",
    fields: [
      {
        path: "sizing.risk_pct",
        label: "İşlem başına risk",
        kind: "percent",
        min: 0.001,
        max: 0.05,
        step: 0.001,
        description:
          "Stop'a takılırsa özsermayenin yüzde kaçı kaybedilir. %1 = 10.000 USD sermayede 100 USD risk.",
        warning:
          "Bu tek sayı sistemin en tehlikeli düğmesidir. Canlıya geçişte yarıya indirilmesi şart koşulmuştur.",
      },
      {
        path: "sizing.vol_target",
        label: "Oynaklık hedefi",
        kind: "number",
        min: 0.1,
        max: 2,
        step: 0.05,
        description:
          "Yıllıklandırılmış hedef oynaklık. Oynak coinler bu hedefe göre küçültülür, sakin olanlar büyütülür.",
      },
    ],
  },
  {
    key: "exit",
    title: "Çıkış",
    description:
      "Pozisyon nasıl kapanır. Girişten çok çıkış kuralları belirler sonucu; sistemin kârı burada korunur.",
    fields: [
      {
        path: "exit.stop_atr_multiple",
        label: "Stop mesafesi (ATR katı)",
        kind: "number",
        min: 0.1,
        max: 5,
        step: 0.1,
        description:
          "İlk stop, girişin kaç ATR altına konur. ATR oynaklık ölçüsüdür; sabit yüzde yerine kullanılır ki her coin kendi ritmine göre yer bulsun.",
        warning: "Çok dar stop, normal dalgalanmada boşuna kapanmaya yol açar.",
      },
      {
        path: "exit.breakeven_r",
        label: "Başabaş kilidi (R)",
        kind: "number",
        min: 0.5,
        max: 5,
        step: 0.1,
        description:
          "Kâr bu kadar R'ye ulaşınca stop girişe çekilir; pozisyon artık zarar edemez. 1R = girişte riske edilen tutar.",
      },
      {
        path: "exit.trail_atr",
        label: "Takip eden stop (ATR katı)",
        kind: "number",
        min: 0.5,
        max: 8,
        step: 0.1,
        description: "Başabaş kilidinden sonra stop, fiyatın kaç ATR gerisinden takip eder.",
        warning: "Çok sıkı takip, büyük trendleri erken keser.",
      },
      {
        path: "exit.score_exit",
        label: "Puan çıkışı",
        kind: "number",
        min: 0,
        max: 100,
        step: 1,
        description:
          "Coinin puanı bu değerin altına düşerse pozisyon kapanır — tez bozulmuştur, fiyat henüz stop'a gelmemiş olsa bile.",
      },
      {
        path: "exit.max_hold_hours",
        label: "Azami elde tutma",
        kind: "integer",
        unit: "saat",
        min: 4,
        max: 720,
        step: 4,
        description:
          "Bu süre dolunca pozisyon kapanır. Yatay kalan bir pozisyon sermayeyi meşgul eder; zaman da bir maliyettir.",
      },
    ],
  },
  {
    key: "rotation",
    title: "Rotasyon",
    description:
      "Elde tutulandan belirgin biçimde daha iyi bir aday çıkarsa yer değiştirilir. Her değişim komisyon ve kayma demektir; bu yüzden eşik vardır.",
    fields: [
      {
        path: "rotation.enabled",
        label: "Rotasyon açık",
        kind: "boolean",
        description: "Kapalıysa pozisyonlar yalnızca çıkış kurallarıyla kapanır.",
      },
      {
        path: "rotation.min_score_gap",
        label: "Asgari puan farkı",
        kind: "number",
        min: 1,
        max: 40,
        step: 1,
        description:
          "Yeni aday, mevcut pozisyondan en az bu kadar yüksek puan almalı. Küçük fark, maliyeti karşılamayan gereksiz devirdir.",
        warning: "Düşürmek devir hızını patlatır; maliyet raporunu kontrol edin.",
      },
    ],
  },
];

/** `exit.trail_atr` gibi bir yolu nesneden okur. */
export function readPath(source: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object") return (acc as Record<string, unknown>)[key];
    return undefined;
  }, source);
}

/** `exit.trail_atr` gibi bir yola yazar; aradaki nesneleri kopyalayarak oluşturur. */
export function writePath<T extends Record<string, unknown>>(
  source: T,
  path: string,
  value: unknown,
): T {
  const [head, ...rest] = path.split(".");
  if (rest.length === 0) return { ...source, [head]: value };
  const child = (source[head] ?? {}) as Record<string, unknown>;
  return { ...source, [head]: writePath(child, rest.join("."), value) };
}
