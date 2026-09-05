import type { ToastInput } from "@/design/toast";

/**
 * Bildirim köprüsü — `useToast` hook'unu React dışından çağrılabilir
 * hâle getirir.
 *
 * Neden gerekli: bildirimler mutation geri çağrılarından atılıyor
 * (`onSuccess`, `onError`) ve bunlar hook kuralları açısından bileşen gövdesi
 * değildir. Yirmi çağrı yerini tek tek hook'a çevirmek yerine tek bir dikiş
 * bırakıldı — sağlayıcı `push`'u buraya kaydeder, çağrı yerleri değişmez.
 *
 * Önceden `sonner` kullanılıyordu; iki bildirim sistemi yan yana yaşarsa aynı
 * olay iki farklı kutuda, iki farklı tasarımla görünür. Bu modül `sonner`'ın
 * API yüzeyini birebir taklit ettiği için geçiş tek satırlık bir import
 * değişikliğiyle tamamlandı.
 */
type Push = (input: ToastInput) => void;

let push: Push | null = null;

/** `ToastBridge` tarafından çağrılır; başka yerden çağrılmamalı. */
export function registerToastSink(fn: Push | null): void {
  push = fn;
}

/**
 * Sağlayıcı henüz bağlanmadıysa bildirim **sessizce düşer**. Alternatif olan
 * `throw`, bir bildirimi gösterememek yüzünden asıl işlemi (bot başlatma,
 * havuz yenileme) iptal ederdi — bildirim yan etkidir, iş değil.
 */
function emit(input: ToastInput): void {
  if (push) push(input);
  else console.warn("[toast] sağlayıcı bağlı değil:", input.title);
}

export const toast = {
  success: (title: string, desc?: string) => emit({ tone: "success", title, desc }),
  error: (title: string, desc?: string) => emit({ tone: "danger", title, desc }),
  warning: (title: string, desc?: string) => emit({ tone: "warning", title, desc }),
  info: (title: string, desc?: string) => emit({ tone: "info", title, desc }),
};
