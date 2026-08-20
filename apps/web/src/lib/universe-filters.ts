/**
 * Havuz filtrelerinin açıklamaları.
 *
 * Huni raporu motordan `MarketFilter`, `SpreadFilter` gibi sınıf adlarıyla
 * gelir. Bu isimler kodu okuyan için anlamlı, paneli okuyan için değil.
 * Burada her filtrenin **adı**, **ne yaptığı** ve **neden var olduğu**
 * yazılıdır.
 *
 * Kaynak: `apps/engine/sarnic/universe/filters.py`. Motora yeni bir filtre
 * eklendiğinde karşılığı buraya da yazılır; yazılmazsa panel sınıf adını
 * olduğu gibi gösterir ve kullanıcı ne elendiğini anlamaz.
 */

export interface FilterInfo {
  label: string;
  /** Ne yapar — tek cümle. */
  what: string;
  /** Neden var — bu filtre olmasa ne olurdu. */
  why?: string;
}

export const UNIVERSE_FILTERS: Record<string, FilterInfo> = {
  MarketFilter: {
    label: "Piyasa filtresi",
    what: "Yalnızca USDT çiftlerini ve işlemde olan sembolleri bırakır.",
    why: "Farklı karşı para birimleri (BTC, ETH çiftleri) fiyatı ikinci bir varlığa bağlar ve karşılaştırmayı bozar.",
  },
  LeveragedTokenFilter: {
    label: "Kaldıraçlı token filtresi",
    what: "UP/DOWN/BULL/BEAR gibi kaldıraçlı ürünleri eler.",
    why: "Bu ürünler günlük yeniden dengeleme nedeniyle dayanak varlığı takip etmez; uzun vadede taşıdıkları aşınma teknik analizle ölçülemez.",
  },
  StablecoinFilter: {
    label: "Stablecoin filtresi",
    what: "Değeri sabit tutulan coinleri eler.",
    why: "Fiyatı 1 dolar civarında tutulan bir varlıkta trend, momentum ve destek/direnç kavramları anlamsızdır.",
  },
  BlacklistFilter: {
    label: "Kara liste",
    what: "Elle engellenmiş sembolleri çıkarır.",
    why: "Filtrelerin yakalayamadığı bir sorun gördüğünüzde son sözü siz söylersiniz.",
  },
  QuoteVolumeFilter: {
    label: "Hacim filtresi",
    what: "Günlük işlem hacmi eşiğin altında kalan coinleri eler.",
    why: "İnce piyasada bir emir fiyatı kendi başına oynatır; ölçüm de kâr da güvenilmez olur.",
  },
  AgeFilter: {
    label: "Yaş filtresi",
    what: "Listelenmesi üzerinden yeterli gün geçmemiş coinleri eler.",
    why: "Yeni listelenen coinlerde göstergelerin hesaplanacağı geçmiş yoktur ve ilk günlerin oynaklığı tipik davranışı yansıtmaz.",
  },
  SpreadFilter: {
    label: "Spread filtresi",
    what: "Alış-satış farkı eşiği aşan coinleri eler.",
    why: "Spread her gidiş-dönüşün gizli maliyetidir. Geniş spreadli bir coinde strateji kâğıt üzerinde kârlı görünüp maliyetten sonra zarara döner.",
  },
  TickSizeFilter: {
    label: "Fiyat adımı filtresi",
    what: "Fiyat adımı, fiyatına oranla fazla kaba olan coinleri eler.",
    why: "Fiyatı 0,00001 olan bir coinde tek adım yüzde birkaçlık sıçrama demektir; stop seviyesi istenen yere konamaz.",
  },
  VolatilityFilter: {
    label: "Volatilite filtresi",
    what: "Yıllıklandırılmış oynaklığı alt ya da üst eşiğin dışında kalan coinleri eler.",
    why: "Çok sakin coinde hareket yoktur, çok çılgın coinde stop mesafesi makul pozisyon boyutu bırakmaz. Bu hesap günlük veriye dayanır — günlük geçmişi olmayan coin de elenir.",
  },
  RangeStabilityFilter: {
    label: "Aralık kararlılığı filtresi",
    what: "Son günlerdeki fiyat aralığı düzensiz olan coinleri eler.",
    why: "Aralığı bir gün dar bir gün çok geniş olan coinde risk hesabı tutmaz.",
  },
  DelistFilter: {
    label: "Listeden çıkma filtresi",
    what: "Borsadan kaldırılacağı duyurulmuş coinleri eler.",
    why: "Listeden kalkacak bir coine girmek, çıkışı zorunlu ve zamanı başkasının belirlediği bir pozisyon açmaktır.",
  },
  TopNSelector: {
    label: "En iyi N seçimi",
    what: "Kalan adayları hacme göre sıralar ve hedeflenen sayıda coini alır.",
    why: "Filtrelerden geçen aday sayısı hedeften fazlaysa en likit olanlar tercih edilir.",
  },
};

/** Filtre bilgisini getirir; karşılığı yoksa sınıf adını okunur hâle getirir. */
export function filterInfo(name: string): FilterInfo {
  return (
    UNIVERSE_FILTERS[name] ?? {
      label: name.replace(/([a-z])([A-Z])/g, "$1 $2"),
      what: "Bu filtrenin açıklaması henüz yazılmamış.",
    }
  );
}
