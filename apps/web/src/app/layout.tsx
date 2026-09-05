import type { Metadata } from "next";
/*
 * Sans Geist, mono Geist Mono. Paketler node_modules'tan gelir ve derlemeye
 * gömülür — panel çevrimdışı çalışmak zorunda, CDN'e bağlanılmaz.
 */
import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "HIGHWATER — kontrol odası",
  description:
    "Otuz kollu bir ölçüm deneyinin kontrol odası. Canlı para yoktur; tüm emirler kağıt motorundan geçer.",
};

/*
 * Tema seçici yoktur. Açık tema tek temadır (DESIGN-V4 §6): koyu zeminde her
 * şey biraz alarm gibi görünür ve bu tasarımda alarm nadir, pahalı olmalı.
 * Renk bütçesi ikiye bölünmemeli.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr">
      <body className="min-h-screen antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
