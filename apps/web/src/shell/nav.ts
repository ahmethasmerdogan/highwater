/**
 * Menü haritası — tek kaynak.
 *
 * Yan menü, komut paleti ve sayfa başlığı buradan okur. İki yerde tutulan
 * bir menü kaçınılmaz olarak ayrışır.
 *
 * Gruplama **kullanıcının niyetine** göre, veri modeline göre değil:
 * "şu an ne oluyor?" (İzleme), "para nerede?" (İşlem), "kim ne yaptı?"
 * (Ekip), "nasıl davransın?" (Yönetim).
 */

import type { ComponentType } from "react";
import type { Role } from "@/lib/api";
import {
  IBacktest,
  IBell,
  IBot,
  IChat,
  IIndicator,
  ILog,
  IPanel,
  IPlug,
  IPool,
  IPosition,
  IPulse,
  IScore,
  ISettings,
  IStrategy,
  ITarget,
  ITerminal,
  IUsers,
  type IconProps,
} from "@/design/icons";

export interface NavItem {
  href: string;
  label: string;
  /** Komut paletinde ve menü ipucunda görünen tek cümle. */
  hint: string;
  icon: ComponentType<IconProps>;
  /** Bu sayfayı görebilecek roller. Verilmezse herkes görür; ADMIN daima görür. */
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
        icon: IPanel,
      },
      {
        href: "/meydan-okuma",
        label: "Meydan Okuma",
        hint: "20.000 ₺ → 100.000 ₺ hedefi: ilerleme, denemeler ve kontrol grubuyla karşılaştırma.",
        icon: ITarget,
      },
      {
        href: "/havuz",
        label: "Havuz",
        hint: "İşlem yapılabilir coin listesi ve hangi filtrenin neyi elediği.",
        icon: IPool,
      },
      {
        href: "/puanlar",
        label: "Puanlar",
        hint: "Havuzdaki coinlerin 0–100 puanı ve her puanın gerekçesi.",
        icon: IScore,
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
        icon: ILog,
      },
      {
        href: "/terminal",
        label: "Terminal",
        hint: "Çok panelli çalışma alanı: grafik, puan kartı, tarama.",
        icon: ITerminal,
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
        icon: IBot,
        roles: ["TRADER"],
      },
      {
        href: "/pozisyonlar",
        label: "Pozisyonlar",
        hint: "Açık pozisyonlar, kapanmış işlemler ve emir defteri.",
        icon: IPosition,
      },
      {
        href: "/stratejiler",
        label: "Stratejiler",
        hint: "Kural kümeleri ve sürümleri.",
        icon: IStrategy,
        roles: ["TRADER"],
      },
      {
        href: "/backtest",
        label: "Backtest",
        hint: "Stratejiyi geçmiş veride sına ve kıyaslarla karşılaştır.",
        icon: IBacktest,
        roles: ["TRADER"],
      },
      {
        href: "/indikatorler",
        label: "İndikatörler",
        hint: "Sembol bazında göstergeler, destek/direnç ve formasyonlar.",
        icon: IIndicator,
        roles: ["TRADER"],
      },
    ],
  },
  {
    label: "Ekip",
    items: [
      { href: "/sohbet", label: "Sohbet", hint: "Ekip içi mesajlaşma.", icon: IChat },
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
        icon: IPlug,
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
  return NAV.flatMap((group) => group.items)
    /* En uzun eşleşme kazanır: "/botlar/3" → "/botlar", "/" değil. */
    .filter((item) => (item.href === "/" ? pathname === "/" : pathname.startsWith(item.href)))
    .sort((a, b) => b.href.length - a.href.length)[0];
}
