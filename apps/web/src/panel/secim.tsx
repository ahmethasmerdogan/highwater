"use client";

/**
 * Seçiciler — BoardUI'nin segmented control'ü üzerine ince sarmalayıcı.
 *
 * `Secim` tek seçimli bir düğme grubudur; React Aria'nın `Set` tabanlı
 * seçim API'sini tek bir dizeye indirger. Boş seçime izin verilmez: kesit
 * seçici zorunludur ve "tümü" seçeneği yoktur (DESIGN-V4 §7) — bu, ölçek
 * karışımı arızasını yapısal olarak imkânsız kılan kuraldır.
 */

import {
  SegmentedControl,
  SegmentedControlItem,
} from "@/components/base/segmented-control/segmented-control";

export function Secim<T extends string>({
  secenekler,
  deger,
  degistir,
  ariaLabel,
}: {
  secenekler: { id: T; ad: string }[];
  deger: T;
  degistir: (yeni: T) => void;
  ariaLabel: string;
}) {
  return (
    <SegmentedControl
      aria-label={ariaLabel}
      selectedKeys={[deger]}
      onSelectionChange={(keys) => {
        const ilk = [...keys][0];
        if (ilk !== undefined) degistir(String(ilk) as T);
      }}
    >
      {secenekler.map((s) => (
        <SegmentedControlItem key={s.id} id={s.id}>
          {s.ad}
        </SegmentedControlItem>
      ))}
    </SegmentedControl>
  );
}
