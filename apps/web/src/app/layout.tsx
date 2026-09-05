import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

/*
 * BoardUI'nin yazı tipleri: gövde Inter, ölçüm JetBrains Mono.
 * `next/font` dosyaları derlemeye gömer — panel çevrimdışı çalışmak zorunda,
 * CDN'e bağlanılmaz. `latin-ext` alt kümesi Türkçe karakterleri kapsıyor.
 */
const inter = Inter({
  subsets: ["latin", "latin-ext"],
  variable: "--font-inter",
  display: "swap",
});
const mono = JetBrains_Mono({
  subsets: ["latin", "latin-ext"],
  variable: "--font-mono-source",
  display: "swap",
});

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
    <html lang="tr" data-accent="blue" className={`${inter.variable} ${mono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: TEMA_BETIGI }} />
      </head>
      <body className="min-h-screen bg-background-full antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
