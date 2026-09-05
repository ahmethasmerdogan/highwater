"use client";

/**
 * Kontrol odasının çerçevesi — kimlik denetimi ve kabuk.
 *
 * Sayfa listesi beş tanedir ve sabittir. Özelleştirilebilir düzen bilinçli
 * olarak yapılmadı: sabit düzen = sabit göz alışkanlığı = eksikliğin fark
 * edilmesi (DESIGN-V4 §9).
 */

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { Kabuk } from "@/panel/kabuk";

export default function OdaLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.replace("/giris");
  }, [loading, user, router]);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background-full">
        <p className="text-body-regular text-text-tertiary">oturum denetleniyor…</p>
      </div>
    );
  }

  return <Kabuk>{children}</Kabuk>;
}
