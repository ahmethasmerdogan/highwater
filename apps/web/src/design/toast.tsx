"use client";

/**
 * Bildirim.
 *
 * Sağ altta yığılır, kendiliğinden söner, üstüne gelince beklemeye alınır —
 * bir hata mesajı okunmadan kaybolmamalı. Hata tonundaki bildirimler
 * kendiliğinden **sönmez**: kullanıcı kapatana kadar durur.
 *
 * `lib/toast.ts` köprüsü bunu React dışından çağrılabilir kılar; çağrı
 * yerleri (mutation `onSuccess`/`onError`) hook kuralları açısından bileşen
 * gövdesi değildir.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { IClose } from "./icons";
import { IconButton, type Tone } from "./primitives";
import { ICheck, IInfo, IWarning, IZap } from "uicean";
import { cx } from "./cx";

export interface ToastInput {
  tone?: "success" | "danger" | "warning" | "info";
  title: string;
  desc?: string;
}

interface ToastItem extends ToastInput {
  id: number;
  /** Çıkış animasyonu oynuyor; süre dolunca gerçekten silinir. */
  leaving?: boolean;
}

const Ctx = createContext<{ push: (input: ToastInput) => void }>({ push: () => {} });

const TONE: Record<NonNullable<ToastInput["tone"]>, Tone> = {
  success: "up",
  danger: "down",
  warning: "warn",
  info: "info",
};

const COLOR: Record<Tone, string> = {
  up: "var(--sn-up)",
  down: "var(--sn-down)",
  warn: "var(--sn-warn)",
  info: "var(--sn-info)",
  brand: "var(--sn-brand)",
  neutral: "var(--sn-ink-3)",
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    /* POF diye silinmez: önce çıkış animasyonu (aşağı kayar, söner),
       süre dolunca DOM'dan düşer. Hareket azaltılmışsa global kural
       süreyi 1 ms'ye indirir — bekletme hissedilmez. */
    setItems((list) =>
      list.map((item) => (item.id === id ? { ...item, leaving: true } : item)),
    );
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
    setTimeout(() => {
      setItems((list) => list.filter((item) => item.id !== id));
    }, 220);
  }, []);

  const arm = useCallback(
    (id: number, tone: ToastInput["tone"]) => {
      /* Hata okunmadan kaybolmaz. */
      if (tone === "danger") return;
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), tone === "warning" ? 8000 : 5000),
      );
    },
    [dismiss],
  );

  const push = useCallback(
    (input: ToastInput) => {
      const id = nextId.current;
      nextId.current += 1;
      setItems((list) => [...list, { ...input, id }].slice(-5));
      arm(id, input.tone);
    },
    [arm],
  );

  useEffect(() => {
    const map = timers.current;
    return () => {
      map.forEach(clearTimeout);
      map.clear();
    };
  }, []);

  const value = useMemo(() => ({ push }), [push]);

  return (
    <Ctx.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed right-4 bottom-4 z-[120] flex w-[min(360px,calc(100vw-32px))] flex-col gap-2"
        role="status"
        aria-live="polite"
      >
        {items.map((item) => {
          const tone = TONE[item.tone ?? "info"];
          const zemin: Record<Tone, string> = {
            up: "var(--sn-up-bg)",
            down: "var(--sn-down-bg)",
            warn: "var(--sn-warn-bg)",
            info: "var(--sn-info-bg)",
            brand: "var(--sn-brand-bg)",
            neutral: "var(--sn-sunken)",
          };
          const Ikon =
            item.tone === "success"
              ? ICheck
              : item.tone === "danger"
                ? IZap
                : item.tone === "warning"
                  ? IWarning
                  : IInfo;
          return (
            <div
              key={item.id}
              className={cx(
                "pointer-events-auto flex gap-2.5 rounded-[var(--sn-r-md)] p-3",
                item.leaving ? "sn-toast-out" : "sn-fade-up",
              )}
              style={{ background: "var(--sn-overlay)", boxShadow: "var(--sn-shadow-pop)" }}
              onMouseEnter={() => {
                const timer = timers.current.get(item.id);
                if (timer) {
                  clearTimeout(timer);
                  timers.current.delete(item.id);
                }
              }}
              onMouseLeave={() => arm(item.id, item.tone)}
            >
              <span
                aria-hidden
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--sn-r-sm)]"
                style={{ background: zemin[tone], color: COLOR[tone] }}
              >
                <Ikon size={14} />
              </span>
              <div className="min-w-0 flex-1">
                <div
                  className="font-medium"
                  style={{ fontSize: "var(--sn-t-body)", color: "var(--sn-ink)" }}
                >
                  {item.title}
                </div>
                {item.desc && (
                  <div
                    className="mt-0.5"
                    style={{ fontSize: "var(--sn-t-caption)", color: "var(--sn-ink-2)", lineHeight: 1.45 }}
                  >
                    {item.desc}
                  </div>
                )}
              </div>
              <IconButton label="Kapat" size="sm" onClick={() => dismiss(item.id)}>
                <IClose size={13} />
              </IconButton>
            </div>
          );
        })}
      </div>
    </Ctx.Provider>
  );
}

export function useToast() {
  return useContext(Ctx);
}
