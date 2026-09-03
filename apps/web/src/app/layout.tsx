import type { Metadata } from "next";
/*
 * HashUI kuralı 4: sans Geist, mono Geist Mono, istisnasız.
 * Paketler node_modules'tan gelir ve derlemeye gömülür — panel çevrimdışı
 * çalışmak zorunda, CDN'e bağlanılmaz. `latin-ext` alt kümesi Türkçe
 * karakterleri (ğ ş ı İ Ğ Ş) kapsıyor.
 */
import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";
import "dockview-react/dist/styles/dockview.css";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "HIGHWATER",
  description:
    "Havuz tabanlı kesitsel puanlama ve kağıt üstü işlem sistemi. Canlı para yoktur.",
};

/*
 * Tema sayfa boyanmadan önce kararlaştırılır (uicean'ın betiği, aynı
 * depolama anahtarı). Vurgu: uicean "blue" — sakin, kurumsal; yeşil ve
 * kırmızı yalnız yön içindir (DESIGN-V3 §2).
 */
/*
 * uicean'ın boyama-öncesi betiğiyle aynı mantık ve aynı depolama anahtarı
 * ("uicean-theme"). Buraya kopyalandı çünkü root layout sunucu bileşeni;
 * "uicean" paketi istemci modülü (createContext) ve sunucuda içe
 * aktarılamaz.
 */
const THEME_SCRIPT = `(function(){try{var s=localStorage.getItem("uicean-theme");if(s==="dark"||((s===null||s==="system")&&matchMedia("(prefers-color-scheme: dark)").matches))document.documentElement.classList.add("dark");}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr" data-accent="blue" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-screen antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
