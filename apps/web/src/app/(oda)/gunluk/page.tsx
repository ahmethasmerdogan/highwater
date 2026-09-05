"use client";

/**
 * Günlük — olay akışı, bildirimler, veri kalitesi ve denetim tek çatıda.
 *
 * Sekme durumu URL'de yaşar:
 *
 *   ?tab=akis|bildirimler|kalite|denetim   (varsayılan akis)
 *
 * Olay akışı ve denetim kaydı yalnızca yöneticiye açıktır; yönetici
 * olmayan kullanıcı bildirimlerde açılır ve o sekmeleri görmez.
 *
 * `useSearchParams` bir Suspense sınırı ister; yoksa derleme uyarır ve
 * sayfa tamamen istemci tarafına kaçar.
 */

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { UnderlineTabs } from "uicean";
import { useAuth } from "@/lib/auth";
import { Page } from "@/shell/page";
import AkisTab, { AKIS_SUMMARY, AkisGuide } from "./akis";
import BildirimlerTab, { BILDIRIMLER_SUMMARY, BildirimlerGuide } from "./bildirimler";
import KaliteTab, { KALITE_SUMMARY, KaliteGuide } from "./kalite";
import DenetimTab, { DENETIM_SUMMARY, DenetimGuide } from "./denetim";

type Tab = "akis" | "bildirimler" | "kalite" | "denetim";

const TABS: { id: Tab; label: string; admin: boolean }[] = [
  { id: "akis", label: "Olay akışı", admin: true },
  { id: "bildirimler", label: "Bildirimler", admin: false },
  { id: "kalite", label: "Veri kalitesi", admin: false },
  { id: "denetim", label: "Denetim kaydı", admin: true },
];

const SUMMARY: Record<Tab, string> = {
  akis: AKIS_SUMMARY,
  bildirimler: BILDIRIMLER_SUMMARY,
  kalite: KALITE_SUMMARY,
  denetim: DENETIM_SUMMARY,
};

export default function JournalPage() {
  return (
    <Suspense
      fallback={
        <div className="px-6 py-8" style={{ fontSize: "var(--sn-t-body)", color: "var(--sn-ink-3)" }}>
          Yükleniyor…
        </div>
      }
    >
      <JournalContent />
    </Suspense>
  );
}

function JournalContent() {
  const { can } = useAuth();
  const isAdmin = can();
  const params = useSearchParams();
  const router = useRouter();

  const visible = TABS.filter((entry) => !entry.admin || isAdmin);
  const requested = params.get("tab");
  const istenen = TABS.find((entry) => entry.id === requested);
  /* Yetkisiz ya da bilinmeyen sekme, görünür ilk sekmeye düşer. */
  const tab: Tab =
    visible.find((entry) => entry.id === requested)?.id ??
    (isAdmin ? "akis" : "bildirimler");

  const setTab = (next: string) =>
    router.replace(next === "akis" ? "/gunluk" : `/gunluk?tab=${next}`, { scroll: false });

  return (
    <Page
      title="Günlük"
      summary={SUMMARY[tab]}
      guide={
        tab === "akis" ? (
          <AkisGuide />
        ) : tab === "bildirimler" ? (
          <BildirimlerGuide />
        ) : tab === "kalite" ? (
          <KaliteGuide />
        ) : (
          <DenetimGuide />
        )
      }
    >
      <UnderlineTabs accent="var(--brand)" items={visible} value={tab} onChange={setTab} />

      {tab === "akis" && isAdmin && <AkisTab />}
      {tab === "bildirimler" && <BildirimlerTab />}
      {tab === "kalite" && <KaliteTab />}
      {tab === "denetim" && isAdmin && <DenetimTab />}

      {/* Not yalnızca yönetici sekmesi istenip düşürüldüğünde; bildirim ve
          kalite sekmelerinde gürültü. */}
      {!isAdmin && istenen?.admin && (
        <p style={{ fontSize: "var(--sn-t-caption)", color: "var(--sn-ink-3)" }}>
          Olay akışı ve denetim kaydı yalnızca yöneticilere açıktır.
        </p>
      )}
    </Page>
  );
}
