import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";
import { Providers } from "./providers";

/*
 * Yazı tipi: Vercel'in Geist ailesi (`geist` paketi, next/font ile gömülü).
 *
 * Neden Geist: panelin işi yoğun sayı tablosu okutmak. Geist Mono'nun rakam
 * genişlikleri eşit, 0 çizgili, 1'in serifi var — 56 satırlık bir pozisyon
 * tablosunda göz sütunu tarayabiliyor. Geist Sans da aynı ailenin metriklerini
 * paylaşır, yani mono sayı ile sans etiket aynı satırda hizada durur.
 *
 * Değişkenler BoardUI'nin beklediği adlarla dışa verilir (`--font-inter`,
 * `--font-mono-source`), böylece tema dosyası değişmeden aile değişebilir.
 */

export const metadata: Metadata = {
  title: "HIGHWATER — kontrol odası",
  description:
    "Otuz kollu bir ölçüm deneyinin kontrol odası. Canlı para yoktur; tüm emirler kağıt motorundan geçer.",
};

/*
 * Tema sayfa boyanmadan önce kararlaştırılır, yoksa koyu temada bir kare
 * beyaz parlar. Anahtar BoardUI'nin `applyTheme`'iyle aynı ("boardui-theme");
 * kök düzen sunucu bileşeni olduğu için betik buraya kopyalandı.
 */
const TEMA_BETIGI = `(function(){try{var t=localStorage.getItem("boardui:theme");if(t==="dark"||(t===null&&matchMedia("(prefers-color-scheme: dark)").matches))document.documentElement.classList.add("dark");}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr" data-accent="blue" className={`${GeistSans.variable} ${GeistMono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: TEMA_BETIGI }} />
      </head>
      <body className="min-h-screen bg-background-full antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
