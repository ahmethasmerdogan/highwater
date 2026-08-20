"use client";

/**
 * Komut paleti (⌘K).
 *
 * İki iş yapar: sayfaya git, sembol ara. Her satırın altında ne yapacağını
 * anlatan bir cümle durur — palet bir kısayol listesi değil, keşif aracıdır.
 * Kullanıcı hangi sayfanın ne işe yaradığını buradan da öğrenebilir.
 */

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ISearch, IX, cx } from "@/ui";
import { api, type ScoreConfig, type Score } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { NAV } from "./nav";

interface Choice {
  id: string;
  label: string;
  hint: string;
  group: string;
  run: () => void;
}

export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const { can } = useAuth();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  /* Sembol araması için güncel puan listesi — palet açıkken çekilir. */
  const { data: configs = [] } = useQuery({
    queryKey: ["score-configs"],
    queryFn: () => api.get<ScoreConfig[]>("/scores/configs"),
    enabled: open,
    staleTime: 60_000,
  });

  const configHash = configs[0]?.config_hash ?? null;

  const { data: scores = [] } = useQuery({
    queryKey: ["scores", configHash],
    queryFn: () => api.get<Score[]>("/scores", { config_hash: configHash, limit: 200 }),
    enabled: open && Boolean(configHash),
    staleTime: 60_000,
  });

  useEffect(() => {
    if (open) {
      setQuery("");
      setActive(0);
      // Odak bir kare sonra verilir; panel henüz DOM'a girmemiş olabiliyor.
      const t = setTimeout(() => inputRef.current?.focus(), 0);
      return () => clearTimeout(t);
    }
  }, [open]);

  const choices = useMemo<Choice[]>(() => {
    const go = (href: string) => () => {
      onOpenChange(false);
      router.push(href);
    };

    const pages: Choice[] = NAV.flatMap((group) =>
      group.items
        .filter((i) => !i.roles || can(...i.roles))
        .map((i) => ({
          id: `nav:${i.href}`,
          label: i.label,
          hint: i.hint,
          group: group.label,
          run: go(i.href),
        })),
    );

    const symbols: Choice[] = scores.slice(0, 60).map((s) => ({
      id: `sym:${s.symbol}`,
      label: s.symbol,
      hint: `Puan ${s.score.toFixed(1)} — göstergeler, destek/direnç ve formasyonlar için aç.`,
      group: "Sembol",
      run: go(`/indikatorler?symbol=${encodeURIComponent(s.symbol)}`),
    }));

    return [...pages, ...symbols];
  }, [scores, can, router, onOpenChange]);

  const filtered = useMemo(() => {
    if (!query.trim()) return choices.slice(0, 40);
    const q = query.toLocaleLowerCase("tr");
    return choices
      .filter(
        (c) =>
          c.label.toLocaleLowerCase("tr").includes(q) ||
          c.hint.toLocaleLowerCase("tr").includes(q),
      )
      .slice(0, 40);
  }, [choices, query]);

  useEffect(() => setActive(0), [query]);

  if (!open) return null;

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      filtered[active]?.run();
    } else if (e.key === "Escape") {
      onOpenChange(false);
    }
  };

  /* Grupları sırayla bas — aynı grubun başlığı bir kez görünsün. */
  let lastGroup = "";

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center p-4 pt-[12vh]">
      <div
        className="fade-in absolute inset-0 bg-black/45"
        onClick={() => onOpenChange(false)}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Komut paleti"
        className="relative flex max-h-[60vh] w-full max-w-xl flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-pop"
      >
        <div className="flex items-center gap-2.5 border-b border-line px-3.5 py-2.5">
          <ISearch size={15} className="shrink-0 text-ink-3" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Sayfa ara ya da sembol yaz…"
            className="w-full bg-transparent text-[14px] text-ink placeholder:text-ink-3 focus:outline-none"
          />
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            aria-label="Kapat"
            className="shrink-0 rounded p-1 text-ink-3 hover:bg-inset hover:text-ink"
          >
            <IX size={15} />
          </button>
        </div>

        <div className="thin-scroll flex-1 overflow-y-auto p-1.5">
          {filtered.length === 0 ? (
            <div className="px-3 py-8 text-center text-[13px] text-ink-3">
              &ldquo;{query}&rdquo; için sonuç yok. Sayfa adı ya da sembol deneyin.
            </div>
          ) : (
            filtered.map((c, i) => {
              const showGroup = c.group !== lastGroup;
              lastGroup = c.group;
              return (
                <div key={c.id}>
                  {showGroup && (
                    <div className="px-2.5 pt-2 pb-1 text-[10.5px] font-semibold tracking-wider text-ink-3 uppercase">
                      {c.group}
                    </div>
                  )}
                  <button
                    type="button"
                    onMouseEnter={() => setActive(i)}
                    onClick={c.run}
                    className={cx(
                      "flex w-full flex-col items-start gap-0.5 rounded-lg px-2.5 py-2 text-left",
                      i === active ? "bg-inset" : "hover:bg-inset",
                    )}
                  >
                    <span className="text-[13px] font-medium text-ink">{c.label}</span>
                    <span className="text-[12px] leading-snug text-ink-2">{c.hint}</span>
                  </button>
                </div>
              );
            })
          )}
        </div>

        <div className="flex items-center gap-3 border-t border-line px-3.5 py-2 text-[11.5px] text-ink-3">
          <span>↑↓ gez</span>
          <span>↵ aç</span>
          <span>esc kapat</span>
        </div>
      </div>
    </div>
  );
}
