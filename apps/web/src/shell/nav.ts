/**
 * Menü haritası — tek kaynak (v2).
 *
 * 21 rotadan 9 hedefe: her hedef bir NİYET. "Ne oluyor?" → Köprü,
 * "yarış nerede?" → Maraton, "piyasa ne diyor?" → Piyasa, "botlar ne
 * yapıyor?" → Botlar, "para nerede?" → Pozisyonlar, "sınayalım" →
 * Araştırma, "ne oldu?" → Günlük, "elimle bakayım" → Terminal, "nasıl
 * davransın?" → Yönetim. Eski üç Havuz girdisi, Puanlar ve İndikatörler tek
 * Piyasa'da; Stratejiler/Backtest/Kalibrasyon tek Araştırma'da; Loglar ve
 * Bildirimler tek Günlük'te. Eski adresler yönlendirir (LEGACY).
 */

import type { ComponentType } from "react";
import type { Role } from "@/lib/api";
import {
  IBacktest,
  IBot,
  IChat,
  ILog,
  IPanel,
  IPool,
  IPosition,
  ISettings,
  ITarget,
  ITerminal,
  type IconProps,
} from "@/design/icons";

export interface NavItem {
  href: string;
  label: string;
  /** Komut paletinde ve ray ipucunda görünen tek cümle. */
  hint: string;
  icon: ComponentType<IconProps>;
  /** Bu sayfayı görebilecek roller. Verilmezse herkes görür; ADMIN daima görür. */
  roles?: Role[];
  /** Klavye kısayolu (g + harf). */
  key?: string;
}

export const NAV: NavItem[] = [
  { href: "/", label: "Köprü", hint: "Tek bakışta: filo, para, dikkat isteyenler.", icon: IPanel, key: "k" },
  { href: "/nobet", label: "Nöbet", hint: "Sistem şu an sağlam mı, dün geceden beri ne bozuldu?", icon: IPanel, key: "n" },
  { href: "/zincir", label: "Zincir", hint: "Karar nasıl alındı, aday nerede öldü?", icon: IPool, key: "c" },
  { href: "/kanit", label: "Kanıt", hint: "Puanlamanın öngörü gücü var mı, hangi kesitte?", icon: IBacktest, key: "d" },
  { href: "/hipotez", label: "Hipotez", hint: "Hangi soru soruluyor, kanıt ne durumda?", icon: ITarget, key: "h" },
  { href: "/defter", label: "Defter", hint: "Ne kazandık, hangi koşulda, kaç işlemle?", icon: IPosition, key: "f" },
  { href: "/maraton", label: "Maraton", hint: "30 günlük komutsuz koşu — sıralama ve yarış eğrisi.", icon: ITarget, key: "m" },
  { href: "/piyasa", label: "Piyasa", hint: "Havuz, puanlar ve sembol ayrıntısı — üç pazar tek ekranda.", icon: IPool, key: "p" },
  { href: "/botlar", label: "Botlar", hint: "Kollar, durumları, kesicileri ve neden yaptıkları.", icon: IBot, roles: ["TRADER"], key: "b" },
  { href: "/pozisyonlar", label: "Pozisyonlar", hint: "Açık pozisyonlar, kapanmış işlemler, emirler.", icon: IPosition, key: "z" },
  { href: "/arastirma", label: "Araştırma", hint: "Stratejiler, backtest ve kalibrasyon — ölçüm organı.", icon: IBacktest, roles: ["TRADER"], key: "a" },
  { href: "/gunluk", label: "Günlük", hint: "Olay akışı, bildirimler, veri kalitesi, denetim.", icon: ILog, key: "g" },
  { href: "/terminal", label: "Terminal", hint: "Çok panelli çalışma alanı — komut satırıyla.", icon: ITerminal, roles: ["TRADER"], key: "t" },
  { href: "/sohbet", label: "Sohbet", hint: "Ekip içi mesajlaşma.", icon: IChat },
  { href: "/yonetim", label: "Yönetim", hint: "Kullanıcılar, entegrasyonlar, ayarlar, hesap.", icon: ISettings, roles: [], key: "y" },
];

/** Eski adresler → yeni hedefler. Yer imleri ve Discord linkleri kırılmasın. */
export const LEGACY: Record<string, string> = {
  "/havuz": "/piyasa",
  "/puanlar": "/piyasa?gorunum=puanlar",
  "/indikatorler": "/piyasa",
  "/kalibrasyon": "/arastirma?tab=kalibrasyon",
  "/stratejiler": "/arastirma?tab=stratejiler",
  "/backtest": "/arastirma?tab=backtest",
  "/loglar": "/gunluk",
  "/bildirimler": "/gunluk?tab=bildirimler",
  "/kullanicilar": "/yonetim?tab=kullanicilar",
  "/entegrasyonlar": "/yonetim?tab=entegrasyonlar",
  "/ayarlar": "/yonetim?tab=ayarlar",
  "/hesap": "/yonetim?tab=hesap",
  "/meydan-okuma": "/maraton",
};

/** Yolun hangi menü öğesine denk geldiğini bulur — başlık ve ipucu için. */
export function findNavItem(pathname: string): NavItem | undefined {
  return NAV.filter((item) => (item.href === "/" ? pathname === "/" : pathname.startsWith(item.href)))
    .sort((a, b) => b.href.length - a.href.length)[0];
}
