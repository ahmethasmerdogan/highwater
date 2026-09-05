"use client";

/**
 * Kontrol odasının kabuğu.
 *
 * Üç kalıcı katman: künye şeridi (üstte, her ekranda), kütük çekmecesi
 * (sağdan, `~`) ve kimlik denetimi. Sayfa listesi beş tanedir ve sabittir —
 * özelleştirilebilir düzen bilinçli olarak yapılmadı: sabit düzen = sabit
 * göz alışkanlığı = eksikliğin fark edilmesi (DESIGN-V4 §9).
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { KunyeSeridi } from "@/v4/serit";
import { KutukCekmecesi } from "@/v4/cekmece";

export default function OdaLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [kutuk, setKutuk] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.replace("/giris");
  }, [loading, user, router]);

  // `~` kütüğü açar. Yazı alanındayken değil.
  useEffect(() => {
    const tus = (e: KeyboardEvent) => {
      const hedef = e.target as HTMLElement | null;
      const yaziyor =
        hedef &&
        (hedef.tagName === "INPUT" ||
          hedef.tagName === "TEXTAREA" ||
          hedef.isContentEditable);
      if (e.key === "~" && !yaziyor) {
        e.preventDefault();
        setKutuk((a) => !a);
      }
    };
    window.addEventListener("keydown", tus);
    return () => window.removeEventListener("keydown", tus);
  }, []);

  if (loading || !user) {
    return (
      <div className="v4-kunye" style={{ padding: 16 }}>
        oturum denetleniyor…
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--v4-zemin)" }}>
      <KunyeSeridi onKutuk={() => setKutuk(true)} />
      <main className="mx-auto flex max-w-[1440px] flex-col gap-4 px-4 py-4">{children}</main>
      <KutukCekmecesi acik={kutuk} kapat={() => setKutuk(false)} />
    </div>
  );
}
