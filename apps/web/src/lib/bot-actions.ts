/**
 * Bot durumuna göre gösterilecek eylem düğmeleri.
 *
 * Panel önceden ikili bir dal kullanıyordu: `PAPER_RUNNING` ise Duraklat +
 * Durdur, değilse Başlat. Motorun geçiş tablosu (`api/routes/bots.py:26 ALLOWED`)
 * ise daha zengin: `DEGRADED` bir bot duraklatılabilir ve durdurulabilir,
 * `ERROR` bir bot durdurulabilir ama başlatılamaz. Sonuç: kısıtlı ya da hatalı
 * bir bot panelden durdurulamıyordu; `ERROR` durumunda gösterilen tek düğme
 * motordan 409 dönüyordu.
 *
 * Tablo motorun kabul ettiklerinin **alt kümesidir**: motor `DEGRADED` için
 * `start`'ı da kabul eder ama kısıtlı bir bot zaten çalışıyordur, "Başlat"
 * anlamsız bir düğme olur.
 */
export type BotVerb = "start" | "pause" | "stop";

const EYLEMLER: Record<string, BotVerb[]> = {
  DRAFT: ["start"],
  STOPPED: ["start"],
  PAUSED: ["start", "stop"],
  PAPER_RUNNING: ["pause", "stop"],
  DEGRADED: ["pause", "stop"],
  ERROR: ["stop"],
};

export const EYLEM_ETIKET: Record<BotVerb, string> = {
  start: "Başlat",
  pause: "Duraklat",
  stop: "Durdur",
};

export function botEylemleri(state: string): BotVerb[] {
  return EYLEMLER[state] ?? [];
}
