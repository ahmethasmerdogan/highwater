"use client";

/**
 * Sağlayıcılar.
 *
 * v3'te beş sağlayıcı vardı (tema, vurgu, bildirim kutusu, sorgu, kimlik,
 * soket). Panel artık salt okunur — elle emir verme, bot başlatma ve ayar
 * düzenleme bilinçli olarak kaldırıldı (DESIGN-V4 §9: 30 gün müdahale
 * edilmeyecek bir sistemde bu düğmeler yalnızca deneyin bozulma yoludur).
 * Mutation olmayınca bildirim kutusu da gereksizdir; üçe indi.
 */

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "@/lib/auth";
import { WebSocketProvider } from "@/lib/ws";

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Sessizce eski veri göstermeyiz; her ekran kendi tazeleme
            // aralığını belirler ve üretim zamanını künyede basar.
            staleTime: 10_000,
            refetchOnWindowFocus: true,
            retry: 1,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={client}>
      <AuthProvider>
        <WebSocketProvider>{children}</WebSocketProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
