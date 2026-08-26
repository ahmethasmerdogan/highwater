"use client";

import { useEffect, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "@/design/theme";
import { ToastProvider, useToast } from "@/design/toast";
import { registerToastSink } from "@/lib/toast";
import { AuthProvider } from "@/lib/auth";
import { WebSocketProvider } from "@/lib/ws";

/** Bildirim sağlayıcısının `push`'unu modül köprüsüne bağlar (`lib/toast.ts`). */
function ToastBridge() {
  const { push } = useToast();
  useEffect(() => {
    registerToastSink(push);
    return () => registerToastSink(null);
  }, [push]);
  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Sessizce eski veri göstermeyiz; tazeleme sık ve görünür.
            staleTime: 10_000,
            refetchOnWindowFocus: true,
            retry: 1,
          },
        },
      }),
  );

  return (
    <ThemeProvider>
      <ToastProvider>
        <ToastBridge />
        <QueryClientProvider client={client}>
          <AuthProvider>
            <WebSocketProvider>{children}</WebSocketProvider>
          </AuthProvider>
        </QueryClientProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}
