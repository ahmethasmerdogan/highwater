"use client";

/**
 * Tema.
 *
 * Açık ve koyu bu üründe **eşit vatandaş**; hangisinin geleceğine ürün
 * değil kullanıcının işletim sistemi karar verir, bu yüzden varsayılan
 * `system`. `app/layout.tsx` içindeki boyama öncesi betik de aynı kuralı
 * uygular — ikisi ayrışırsa panel bir kare yanlış temada çizilir ve
 * diğerine atlar.
 *
 * Saklama anahtarı (`hashui-theme`) bilerek korundu: değiştirmek, mevcut
 * kullanıcıların kayıtlı tercihini sıfırlardı.
 *
 * Yazı tipi seçici kaldırıldı. HashUI'dan devralınmıştı ve üç seçenek
 * sunuyordu; tipografi ölçeği artık token'larla tanımlı ve tek bir aileye
 * (Geist) göre ayarlandı — ölçek başka bir aileyle yeniden doğrulanmadan
 * seçenek sunmak, ayarlanmış satır yüksekliklerini bozmak demekti.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type ThemeMode = "system" | "light" | "dark";

interface ThemeCtx {
  mode: ThemeMode;
  resolved: "light" | "dark";
  setMode: (mode: ThemeMode) => void;
}

const Ctx = createContext<ThemeCtx>({
  mode: "system",
  resolved: "light",
  setMode: () => {},
});

const STORAGE_KEY = "hashui-theme";
const DEFAULT_MODE: ThemeMode = "system";

const isBrowser = typeof window !== "undefined";

function systemDark(): boolean {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(() => {
    if (!isBrowser) return DEFAULT_MODE;
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved === "light" || saved === "dark" || saved === "system" ? saved : DEFAULT_MODE;
  });

  /* İlk değer boyama öncesi betiğin bıraktığı sınıftan okunur; tahmin
     etmek bir kare yanlış temayla çizmek demek. */
  const [resolved, setResolved] = useState<"light" | "dark">(() =>
    isBrowser && document.documentElement.classList.contains("dark") ? "dark" : "light",
  );

  const apply = useCallback((next: ThemeMode) => {
    const dark = next === "dark" || (next === "system" && systemDark());
    document.documentElement.classList.toggle("dark", dark);
    setResolved(dark ? "dark" : "light");
  }, []);

  const setMode = useCallback(
    (next: ThemeMode) => {
      setModeState(next);
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {
        /* Özel mod ya da dolu kota — tema çalışır, tercih saklanmaz. */
      }
      apply(next);
    },
    [apply],
  );

  useEffect(() => {
    apply(mode);
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      /* Yalnızca "sistem" modundayken işletim sistemini izle. */
      if ((localStorage.getItem(STORAGE_KEY) ?? DEFAULT_MODE) === "system") apply("system");
    };
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, [apply, mode]);

  const value = useMemo(() => ({ mode, resolved, setMode }), [mode, resolved, setMode]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTheme() {
  return useContext(Ctx);
}
