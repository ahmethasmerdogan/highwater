"use client";

/**
 * Yönetim — kullanıcılar, entegrasyonlar, ayarlar ve hesap tek sayfada.
 *
 * Sekme durumu adres çubuğundadır (`?tab=…`): yer imi, Discord linki ve
 * kenar çubuğu aynı sekmeye düşer. Yönetici olmayanlar yalnızca kendi
 * hesaplarını görür; yönetim sekmeleri onlara hiç çizilmez.
 */

import { Suspense, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { UnderlineTabs } from "uicean";
import { useAuth } from "@/lib/auth";
import { Page } from "@/shell/page";
import { KullanicilarTab, KULLANICILAR } from "./kullanicilar";
import { EntegrasyonlarTab, ENTEGRASYONLAR } from "./entegrasyonlar";
import { AyarlarTab, AYARLAR } from "./ayarlar";
import { HesapTab, HESAP } from "./hesap";

type TabId = "kullanicilar" | "entegrasyonlar" | "ayarlar" | "hesap";

interface TabSpec {
  id: TabId;
  label: string;
  /** Yalnızca yönetici görür. */
  admin: boolean;
  summary: string;
  guide: ReactNode;
  body: () => ReactNode;
}

const TABS: TabSpec[] = [
  { id: "kullanicilar", label: "Kullanıcılar", admin: true, ...KULLANICILAR, body: () => <KullanicilarTab /> },
  { id: "entegrasyonlar", label: "Entegrasyonlar", admin: true, ...ENTEGRASYONLAR, body: () => <EntegrasyonlarTab /> },
  { id: "ayarlar", label: "Ayarlar", admin: true, ...AYARLAR, body: () => <AyarlarTab /> },
  { id: "hesap", label: "Hesabım", admin: false, ...HESAP, body: () => <HesapTab /> },
];

/*
 * `useSearchParams` bir Suspense sınırı ister; yoksa derleme sırasında
 * uyarı verir ve sayfa tamamen istemci tarafına kaçar.
 */
export default function YonetimPage() {
  return (
    <Suspense
      fallback={
        <div className="px-6 py-8" style={{ fontSize: "var(--sn-t-body)", color: "var(--sn-ink-3)" }}>
          Yükleniyor…
        </div>
      }
    >
      <YonetimContent />
    </Suspense>
  );
}

function YonetimContent() {
  const { can } = useAuth();
  const params = useSearchParams();
  const router = useRouter();

  const admin = can("ADMIN");
  const visible = TABS.filter((tab) => admin || !tab.admin);
  const requested = params.get("tab");
  const active =
    visible.find((tab) => tab.id === requested) ??
    visible.find((tab) => tab.id === (admin ? "kullanicilar" : "hesap")) ??
    visible[0];

  const setTab = (id: string) => {
    const next = new URLSearchParams(params.toString());
    next.set("tab", id);
    router.replace(`/yonetim?${next.toString()}`, { scroll: false });
  };

  return (
    <Page title="Yönetim" summary={active.summary} guide={active.guide ?? undefined}>
      <UnderlineTabs
        items={visible.map((tab) => ({ id: tab.id, label: tab.label }))}
        value={active.id}
        onChange={setTab}
        accent="var(--sn-brand)"
      />
      {active.body()}
    </Page>
  );
}
