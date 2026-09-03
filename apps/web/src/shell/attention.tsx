"use client";

/**
 * Dikkat yüzeyi — "sistem benden bir şey istiyor mu?" sorusunun tek cevabı.
 *
 * Veri /system/attention'dan aynen gelir; panel sayaç TÜRETMEZ. Seviyeler
 * sunucuda sıralı: CRITICAL, WARN, INFO. Boş liste de bir cevaptır ve öyle
 * gösterilir — "her şey yolunda" yazısı, sessizlikten daha güven verir.
 */

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Sheet, StatusPill } from "uicean";
import { api, type Attention, type AttentionItem, type FeedStatus } from "@/lib/api";
import { relative } from "@/lib/format";
import { Dot } from "@/design/primitives";

export function useAttention() {
  return useQuery({
    queryKey: ["attention"],
    queryFn: () => api.get<Attention>("/system/attention"),
    refetchInterval: 20_000,
  });
}

const TONE: Record<AttentionItem["level"], "red" | "amber" | "blue"> = {
  CRITICAL: "red",
  WARN: "amber",
  INFO: "blue",
};

const LEVEL_LABEL: Record<AttentionItem["level"], string> = {
  CRITICAL: "kritik",
  WARN: "uyarı",
  INFO: "bilgi",
};

export function AttentionSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data, isLoading } = useAttention();
  const items = data?.items ?? [];

  return (
    <Sheet
      open={open}
      onClose={onClose}
      side="right"
      title="Dikkat"
      description={
        data
          ? `${data.fleet.running}/${data.fleet.total} bot koşuyor · ${relative(data.at)} tazelendi`
          : "yükleniyor…"
      }
    >
      <div className="flex flex-col gap-4">
        <section>
          <div className="sn-label mb-2">Akışlar</div>
          <div className="flex flex-col gap-1.5">
            {(data?.feeds ?? []).map((f) => (
              <FeedRow key={f.market} feed={f} />
            ))}
          </div>
        </section>

        <section>
          <div className="sn-label mb-2">İstenenler</div>
          {isLoading && (
            <p style={{ fontSize: "var(--sn-t-caption)", color: "var(--sn-ink-3)" }}>Yükleniyor…</p>
          )}
          {!isLoading && items.length === 0 && (
            <div
              className="rounded-[var(--sn-r-md)] px-3 py-3"
              style={{ background: "var(--sn-up-bg)", color: "var(--sn-up)", fontSize: "var(--sn-t-body)" }}
            >
              Her şey yolunda — dikkat isteyen bir şey yok.
            </div>
          )}
          <ul className="flex flex-col gap-1.5">
            {items.map((item) => (
              <li key={item.id}>
                <Link
                  href={item.href}
                  onClick={onClose}
                  className="sn-focus block rounded-[var(--sn-r-md)] px-3 py-2.5 transition-colors hover:bg-[var(--sn-sunken)]"
                  style={{ border: "1px solid var(--sn-hairline)" }}
                >
                  <div className="flex items-center gap-2">
                    <StatusPill tone={TONE[item.level]} size="sm" dot>
                      {LEVEL_LABEL[item.level]}
                    </StatusPill>
                    <span className="truncate font-medium" style={{ fontSize: "var(--sn-t-body)", color: "var(--sn-ink)" }}>
                      {item.title}
                    </span>
                  </div>
                  <p className="mt-1" style={{ fontSize: "var(--sn-t-caption)", color: "var(--sn-ink-3)", lineHeight: 1.45 }}>
                    {item.detail}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </Sheet>
  );
}

const MARKET_LABEL: Record<FeedStatus["market"], string> = { CRYPTO: "Kripto", BIST: "BIST", US: "ABD" };

function FeedRow({ feed }: { feed: FeedStatus }) {
  return (
    <div
      className="flex items-center gap-2 rounded-[var(--sn-r-sm)] px-2.5 py-1.5"
      style={{ background: "var(--sn-sunken)" }}
    >
      <Dot tone={feed.ok ? "up" : "warn"} pulse={feed.ok} />
      <span className="w-12 shrink-0 font-medium" style={{ fontSize: "var(--sn-t-caption)", color: "var(--sn-ink)" }}>
        {MARKET_LABEL[feed.market]}
      </span>
      <span className="truncate" style={{ fontSize: "var(--sn-t-caption)", color: "var(--sn-ink-3)" }}>
        {feed.detail}
      </span>
      <span className="sn-num ml-auto shrink-0" style={{ fontSize: "var(--sn-t-caption)", color: "var(--sn-ink-2)" }}>
        {feed.last_bar_at ? relative(feed.last_bar_at) : "—"}
      </span>
    </div>
  );
}
