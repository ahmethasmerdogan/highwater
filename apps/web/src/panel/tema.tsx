"use client";

/**
 * Tema düğmesi — tek sahip.
 *
 * Panelde iki stil katmanı var (BoardUI ve 2. nesil `design/*`) ve ikisi de
 * `<html>` üzerindeki `.dark` sınıfını okuyor. İki ayrı tema sağlayıcısı
 * olsaydı ikisi de o sınıfı yazar ve hangisinin kazandığı yükleme sırasına
 * kalırdı. Tek sahip uicean'ın `ThemeProvider`'ıdır; bu düğme onun `setMode`
 * çağrısını BoardUI'nin kenar çubuğu satır görünümüyle sarar.
 */

import { RiMoonLine, RiSunLine } from "@remixicon/react";
import { useTheme } from "@/design/theme";
import { NavItem } from "@/components/application/dashboard/dashboard-sidebar";

export function TemaDugmesi() {
  const { resolved, setMode } = useTheme();
  const koyu = resolved === "dark";
  return (
    <NavItem
      icon={koyu ? RiSunLine : RiMoonLine}
      label={koyu ? "Açık tema" : "Koyu tema"}
      collapsed={false}
      onClick={() => setMode(koyu ? "light" : "dark")}
    />
  );
}
