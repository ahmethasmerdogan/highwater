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
  title: "SARNIÇ",
  description:
    "Havuz tabanlı kesitsel puanlama ve kağıt üstü işlem sistemi. Canlı para yoktur.",
};

/*
 * Tema sayfa boyanmadan önce kararlaştırılır; yoksa panel bir kare yanlış
 * temada çizilip diğerine atlar.
 *
 * Varsayılan **sistem**: açık ve koyu bu üründe eşit vatandaş, hangisinin
 * geleceğine işletim sistemi karar verir. `ui/theme.tsx` içindeki
 * `DEFAULT_MODE` ile aynı olmak zorunda — ayrışırlarsa yanıp sönme geri gelir.
 */
const THEME_SCRIPT = `(function(){try{
  var s=localStorage.getItem("hashui-theme");
  var sys=matchMedia("(prefers-color-scheme: dark)").matches;
  var dark = s==="dark" || ((s===null||s==="system") && sys);
  document.documentElement.classList.toggle("dark", dark);
}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-screen antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
