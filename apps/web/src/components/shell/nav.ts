/**
 * Yan menü haritası — tek kaynak.
 *
 * Hem yan menü hem komut paleti buradan okur; iki yerde tutulan bir menü
 * kaçınılmaz olarak ayrışır.
 *
 * **Loglar "Yönetim"den "İzleme"ye taşındı.** Artık yalnızca yönetimsel
 * denetim kaydı değil, botun/puanlamanın/havuzun ne yaptığını okunur biçimde
 * anlatan ana gözlem yüzeyi. Yönetim altında dururken kimse bakmıyordu.
 */

import {
  IBell,
  ICommand,
  ICompass,
  ICube,
  IDatabase,
  IFileText,
  IGrid,
  ILayers,
  IMessage,
  IPulse,
  ISettings,
  ISliders,
  ITrendUp,
  IUsers,
  IWallet,
  IZap,
} from "@/ui";
import type { Role } from "@/lib/api";

export interface NavItem {
  href: string;
  label: string;
  /** Komut paletinde ve menü ipucunda görünen tek cümle. */
  hint: string;
  icon: React.ElementType;
  /**
   * Bu sayfayı görebilecek roller. Verilmezse herkes görür.
   * `ADMIN` her zaman görür (bkz. `useAuth().can`).
   */
  roles?: Role[];
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const NAV: NavGroup[] = [
  {
    label: "İzleme",
    items: [
      {
        href: "/",
        label: "Panel",
        hint: "Sistemin tek ekranda özeti: özsermaye, açık pozisyonlar, havuz ve uyarılar.",
        icon: IGrid,
      },
      {
        href: "/havuz",
        label: "Havuz",
        hint: "İşlem yapılabilir coin listesi ve hangi filtrenin neyi elediği.",
        icon: IDatabase,
      },
      {
        href: "/puanlar",
        label: "Puanlar",
        hint: "Havuzdaki coinlerin 0–100 puanı ve her puanın gerekçesi.",
        icon: ITrendUp,
      },
      {
        href: "/kalibrasyon",
        label: "Kalibrasyon",
        hint: "Puanlama gerçekten işe yarıyor mu? Sistemin dürüstlük organı.",
        icon: IPulse,
      },
      {
        href: "/loglar",
        label: "Loglar",
        hint: "Botun, puanlamanın ve havuzun ne yaptığı — okunur cümlelerle.",
        icon: IFileText,
      },
      {
        href: "/terminal",
        label: "Terminal",
        hint: "Çok panelli çalışma alanı: grafik, puan kartı, tarama.",
        icon: ICommand,
        roles: ["TRADER"],
      },
    ],
  },
  {
    label: "İşlem",
    items: [
      {
        href: "/botlar",
        label: "Botlar",
        hint: "Çalışan botlar, durumları ve performansları.",
        icon: ICube,
        roles: ["TRADER"],
      },
      {
        href: "/pozisyonlar",
        label: "Pozisyonlar",
        hint: "Açık pozisyonlar, kapanmış işlemler ve emir defteri.",
        icon: IWallet,
      },
      {
        href: "/stratejiler",
        label: "Stratejiler",
        hint: "Kural kümeleri ve sürümleri.",
        icon: ILayers,
        roles: ["TRADER"],
      },
      {
        href: "/backtest",
        label: "Backtest",
        hint: "Stratejiyi geçmiş veride sına ve kıyaslarla karşılaştır.",
        icon: ICompass,
        roles: ["TRADER"],
      },
      {
        href: "/indikatorler",
        label: "İndikatörler",
        hint: "Sembol bazında göstergeler, destek/direnç ve formasyonlar.",
        icon: ISliders,
        roles: ["TRADER"],
      },
    ],
  },
  {
    label: "Ekip",
    items: [
      {
        href: "/sohbet",
        label: "Sohbet",
        hint: "Ekip içi mesajlaşma.",
        icon: IMessage,
      },
      {
        href: "/bildirimler",
        label: "Bildirimler",
        hint: "Sistemin sana söylediği her şey, açıklamasıyla birlikte.",
        icon: IBell,
      },
    ],
  },
  {
    label: "Yönetim",
    items: [
      {
        href: "/kullanicilar",
        label: "Kullanıcılar",
        hint: "Hesaplar, yetkiler ve oturumlar.",
        icon: IUsers,
        roles: [],
      },
      {
        href: "/entegrasyonlar",
        label: "Entegrasyonlar",
        hint: "Discord bildirim kanalları.",
        icon: IZap,
        roles: [],
      },
      {
        href: "/ayarlar",
        label: "Ayarlar",
        hint: "Havuz filtreleri, risk sınırları ve motor parametreleri.",
        icon: ISettings,
        roles: [],
      },
    ],
  },
];

/** Yolun hangi menü öğesine denk geldiğini bulur — başlık ve ipucu için. */
export function findNavItem(pathname: string): NavItem | undefined {
  const all = NAV.flatMap((g) => g.items);
  // En uzun eşleşme kazanır: "/botlar/3" → "/botlar", "/" değil.
  return all
    .filter((i) => (i.href === "/" ? pathname === "/" : pathname.startsWith(i.href)))
    .sort((a, b) => b.href.length - a.href.length)[0];
}
