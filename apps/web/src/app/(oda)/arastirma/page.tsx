"use client";

/**
 * Araştırma — stratejiler, backtest ve kalibrasyon tek çatı altında.
 *
 * Üçü de aynı soruyu farklı açılardan sorar: puanlama değer katıyor mu?
 * Sekme durumu URL'de yaşar; bağlantı paylaşıldığında aynı sekme, aynı
 * koşu, aynı sürüm açılır.
 *
 *   ?tab=stratejiler|backtest|kalibrasyon   (varsayılan backtest)
 *   ?run=<id>                               seçili backtest koşusu
 *   ?strateji=<id>&surum=<id>               seçili strateji / sürümü
 *
 * `useSearchParams` bir Suspense sınırı ister; yoksa derleme uyarır ve
 * sayfa tamamen istemci tarafına kaçar.
 */

import { Suspense, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { UnderlineTabs } from "uicean";
import { Page } from "@/shell/page";
import StratejilerTab, { STRATEJILER_SUMMARY, StratejilerGuide } from "./stratejiler";
import BacktestTab, { BACKTEST_SUMMARY, BacktestGuide } from "./backtest";
import KalibrasyonTab, { KALIBRASYON_SUMMARY, KalibrasyonGuide } from "./kalibrasyon";

type Tab = "stratejiler" | "backtest" | "kalibrasyon";

const TABS: { id: Tab; label: string }[] = [
  { id: "stratejiler", label: "Stratejiler" },
  { id: "backtest", label: "Backtest" },
  { id: "kalibrasyon", label: "Kalibrasyon" },
];

const SUMMARY: Record<Tab, string> = {
  stratejiler: STRATEJILER_SUMMARY,
  backtest: BACKTEST_SUMMARY,
  kalibrasyon: KALIBRASYON_SUMMARY,
};

function parseTab(value: string | null): Tab {
  return value === "stratejiler" || value === "kalibrasyon" ? value : "backtest";
}

function parseId(value: string | null): number | null {
  const id = Number(value);
  return value !== null && Number.isInteger(id) && id > 0 ? id : null;
}

export default function ResearchPage() {
  return (
    <Suspense
      fallback={
        <div className="px-6 py-8" style={{ fontSize: "var(--sn-t-body)", color: "var(--sn-ink-3)" }}>
          Yükleniyor…
        </div>
      }
    >
      <ResearchContent />
    </Suspense>
  );
}

function ResearchContent() {
  const params = useSearchParams();
  const router = useRouter();

  const tab = parseTab(params.get("tab"));
  const run = parseId(params.get("run"));
  const strateji = parseId(params.get("strateji"));
  const surum = parseId(params.get("surum"));

  /* URL tek doğruluk kaynağı: `null` anahtarı siler, kaydırma yeri korunur. */
  const setParams = useCallback(
    (patch: Record<string, string | number | null>) => {
      const next = new URLSearchParams(params.toString());
      Object.entries(patch).forEach(([key, value]) => {
        if (value === null) next.delete(key);
        else next.set(key, String(value));
      });
      const query = next.toString();
      router.replace(query ? `/arastirma?${query}` : "/arastirma", { scroll: false });
    },
    [params, router],
  );

  /* Sekme değişince diğer sekmelerin seçimleri temizlenir — eski koşu
     numarası kalibrasyon sekmesinin URL'sinde taşınmasın. */
  const setTab = (next: string) =>
    setParams({ tab: next === "backtest" ? null : next, run: null, strateji: null, surum: null });

  return (
    <Page
      title="Araştırma"
      summary={SUMMARY[tab]}
      guide={
        tab === "stratejiler" ? (
          <StratejilerGuide />
        ) : tab === "kalibrasyon" ? (
          <KalibrasyonGuide />
        ) : (
          <BacktestGuide />
        )
      }
    >
      <UnderlineTabs accent="var(--brand)" items={TABS} value={tab} onChange={setTab} />

      {tab === "stratejiler" && (
        <StratejilerTab
          strategyId={strateji}
          versionId={surum}
          onSelect={(strategyId, versionId) => setParams({ strateji: strategyId, surum: versionId })}
        />
      )}
      {tab === "backtest" && <BacktestTab run={run} onRun={(id) => setParams({ run: id })} />}
      {tab === "kalibrasyon" && <KalibrasyonTab />}
    </Page>
  );
}
