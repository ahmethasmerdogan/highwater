/**
 * Sınıf birleştirici.
 *
 * `tailwind-merge` bilerek yok: yeni sistem görsel kararları Tailwind
 * yardımcı sınıflarıyla değil token'lı CSS ile veriyor, dolayısıyla
 * çakışan yardımcı sınıf çifti üretecek bir yüzey yok. Çakışma
 * çözücüsü olmayan 6 satır, olan 4 kB'a yeğdir.
 */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
