"use client";

/**
 * Kontrol odasının kabuğu: sol kenarda gezinme, üstte künye şeridi.
 *
 * Künye şeridi kalıcıdır: hangi ekranda olursanız olun, ekrandaki sayıların
 * hangi ana ait olduğunu ve sistemin o an sağlam olup olmadığını söyler.
 * Kullanıcı günde birkaç kez birkaç dakika bakıyor; ilk bakışta cevaplanması
 * gereken soru "bugün benden habersiz ne bozuldu?".
 */

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  RiAlarmWarningLine,
  RiBookOpenLine,
  RiChat3Line,
  RiDashboardLine,
  RiFileList3Line,
  RiFlagLine,
  RiFlaskLine,
  RiLineChartLine,
  RiLogoutBoxRLine,
  RiNodeTree,
  RiPulseLine,
  RiRobot2Line,
  RiSearchLine,
  RiSettings4Line,
  RiShieldCheckLine,
  RiStockLine,
  RiTerminalBoxLine,
  RiTestTubeLine,
  RiWalletLine,
} from "@remixicon/react";
import {
  DashboardSidebar,
  NavItem,
  type DashboardNavItem,
} from "@/components/application/dashboard/dashboard-sidebar";
import { Chip } from "@/components/base/badges/chip";
import { api, type Nobet } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Badge } from "@/components/base/badges/badge";
import { useAttention } from "@/shell/attention";
import { TooltipHost } from "@/design/primitives";
import { CelebrationWatcher } from "@/design/celebration";
import { CommandPalette } from "@/shell/command-palette";
import { AttentionSheet } from "@/shell/attention";
import { KutukCekmecesi } from "./cekmece";
import { MONO, sayi } from "./olcum";
import { TemaDugmesi } from "./tema";

/**
 * Gezinme iki kümeye ayrılır.
 *
 * **İşletim** — sistemi çalıştıran ekranlar: para, kollar, havuz, araştırma,
 * yönetim. Bunlar panelin var oluş sebebi ve hiçbiri kaldırılamaz.
 *
 * **Kontrol odası** — 2026-09-05'te eklenen ölçüm ekranları (DESIGN-V4). Bunlar
 * işletim ekranlarının YERİNE değil, YANINA gelir: sekiz sessiz arıza günlük
 * işletim ekranlarında görünmüyordu, o boşluğu bunlar kapatıyor.
 */
export const ISLETIM: (DashboardNavItem & { yol: string; soru: string })[] = [
  { key: "kopru", yol: "/", label: "Köprü", icon: RiDashboardLine, href: "/", soru: "Tek bakışta: filo, para, dikkat isteyenler." },
  { key: "maraton", yol: "/maraton", label: "Maraton", icon: RiFlagLine, href: "/maraton", soru: "30 günlük komutsuz koşu — sıralama ve yarış eğrisi." },
  { key: "piyasa", yol: "/piyasa", label: "Piyasa", icon: RiStockLine, href: "/piyasa", soru: "Havuz, puanlar ve sembol ayrıntısı — üç pazar tek ekranda." },
  { key: "botlar", yol: "/botlar", label: "Botlar", icon: RiRobot2Line, href: "/botlar", soru: "Kollar, durumları, kesicileri ve neden yaptıkları." },
  { key: "pozisyonlar", yol: "/pozisyonlar", label: "Pozisyonlar", icon: RiWalletLine, href: "/pozisyonlar", soru: "Açık pozisyonlar, kapanmış işlemler, emirler." },
  { key: "arastirma", yol: "/arastirma", label: "Araştırma", icon: RiFlaskLine, href: "/arastirma", soru: "Stratejiler, backtest ve kalibrasyon." },
  { key: "gunluk", yol: "/gunluk", label: "Günlük", icon: RiFileList3Line, href: "/gunluk", soru: "Olay akışı, bildirimler, veri kalitesi, denetim." },
  { key: "terminal", yol: "/terminal", label: "Terminal", icon: RiTerminalBoxLine, href: "/terminal", soru: "Çok panelli çalışma alanı — komut satırıyla." },
  { key: "sohbet", yol: "/sohbet", label: "Sohbet", icon: RiChat3Line, href: "/sohbet", soru: "Ekip içi mesajlaşma." },
  { key: "yonetim", yol: "/yonetim", label: "Yönetim", icon: RiSettings4Line, href: "/yonetim", soru: "Kullanıcılar, entegrasyonlar, ayarlar, hesap." },
];

export const KONTROL: (DashboardNavItem & { yol: string; soru: string })[] = [
  { key: "nobet", yol: "/nobet", label: "Nöbet", icon: RiPulseLine, href: "/nobet", soru: "Sistem şu an sağlam mı, dün geceden beri ne bozuldu?" },
  { key: "zincir", yol: "/zincir", label: "Zincir", icon: RiNodeTree, href: "/zincir", soru: "Karar nasıl alındı, aday nerede öldü?" },
  { key: "kanit", yol: "/kanit", label: "Kanıt", icon: RiLineChartLine, href: "/kanit", soru: "Puanlamanın öngörü gücü var mı, hangi kesitte?" },
  { key: "hipotez", yol: "/hipotez", label: "Hipotez", icon: RiTestTubeLine, href: "/hipotez", soru: "Hangi soru soruluyor, kanıt ne durumda?" },
  { key: "defter", yol: "/defter", label: "Defter", icon: RiBookOpenLine, href: "/defter", soru: "Ne kazandık, hangi koşulda, kaç işlemle?" },
];

export const EKRANLAR = [...ISLETIM, ...KONTROL];

function yas(iso: string | undefined): string {
  if (!iso) return "—";
  const sn = (Date.now() - new Date(iso).getTime()) / 1000;
  if (sn < 90) return `${Math.round(sn)} sn önce`;
  if (sn < 5400) return `${Math.round(sn / 60)} dk önce`;
  return `${Math.round(sn / 3600)} sa önce`;
}

/** Üst şerit: veri tazeliği, donuk kol ve kesici payı — üçü de kalıcı. */
/**
 * Durum şeridi — başlık değil.
 *
 * Sayfanın kendi başlığı var; kabuk onu tekrar basmaz. Burada yalnızca her
 * ekranda geçerli olan üç ölçü durur: veri ne kadar taze, kaç kol donuk,
 * kesici payı kuralın altında mı.
 */
function KunyeSeridi({ ekran }: { ekran?: (typeof EKRANLAR)[number] }) {
  const { data } = useQuery({
    queryKey: ["nobet", 24],
    queryFn: () => api.get<Nobet>("/kontrol/nobet", { saat: 24 }),
    refetchInterval: 30_000,
  });

  const donuk = data?.donuk.length ?? 0;
  const pay = data?.kesici_payi.pay ?? null;
  const ihlal = pay !== null && pay < (data?.kesici_payi.kural ?? 1.5);

  return (
    <header
      className="sticky top-0 z-30 -mx-1 flex flex-wrap items-center justify-end gap-2 border-b border-separator-border bg-background-full/85 px-4 py-1.5 backdrop-blur"
    >
      <span className="mr-auto truncate text-body-2-medium text-text-secondary">
        {ekran?.label ?? "Kontrol odası"}
      </span>
      <div className="flex flex-wrap items-center gap-2">
        <Chip variant="subtle" color={donuk ? "rose" : "soft"}>
          <span className={MONO}>{donuk}</span>
          <span className="ml-1.5">donuk kol</span>
        </Chip>
        <Chip variant="subtle" color={ihlal ? "rose" : "soft"}>
          <span className="mr-1.5">kesici payı</span>
          <span className={MONO}>{pay === null ? "—" : `${sayi(pay, 2)}×`}</span>
        </Chip>
        <Chip variant="subtle" color="soft">
          <span className="mr-1.5">veri</span>
          <span className={MONO}>{yas(data?.uretim)}</span>
        </Chip>
      </div>
    </header>
  );
}

export function Kabuk({ children }: { children: React.ReactNode }) {
  const yol = usePathname();
  const { user, logout } = useAuth();
  const [kutuk, setKutuk] = useState(false);
  const [palet, setPalet] = useState(false);
  const [dikkat, setDikkat] = useState(false);
  const dikkatSayisi = useAttention().data?.items.length ?? 0;

  const ekran = EKRANLAR.find((e) => (e.yol === "/" ? yol === "/" : yol.startsWith(e.yol)));

  // `~` kütüğü açar; yazı alanındayken değil.
  useEffect(() => {
    const tus = (e: KeyboardEvent) => {
      const h = e.target as HTMLElement | null;
      const yaziyor =
        h && (h.tagName === "INPUT" || h.tagName === "TEXTAREA" || h.isContentEditable);
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalet((a) => !a);
        return;
      }
      if (yaziyor || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "~") {
        e.preventDefault();
        setKutuk((a) => !a);
      }
      if (e.key === ".") {
        e.preventDefault();
        setDikkat((a) => !a);
      }
    };
    window.addEventListener("keydown", tus);
    return () => window.removeEventListener("keydown", tus);
  }, []);

  return (
    <TooltipHost>
      <div className="sn-root flex min-h-screen w-full bg-background-full">
      <div className="sticky top-0 hidden h-screen shrink-0 p-3 lg:block">
        <DashboardSidebar
          selected={ekran?.key ?? "kopru"}
          items={ISLETIM}
          ikinciBaslik="Kontrol odası"
          ikinciItems={KONTROL}
          showSearch={false}
          showThemeToggle={false}
          brand={
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-text-primary text-background-primary-default">
                <RiPulseLine className="size-4" aria-hidden />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-body-medium text-text-primary">
                  HIGHWATER
                </span>
                <span className="block truncate text-caption-1-regular text-text-tertiary">
                  kontrol odası
                </span>
              </span>
            </div>
          }
          secondary={
            <nav className="flex w-full flex-col gap-1">
              <TemaDugmesi />
              <NavItem
                icon={RiFileList3Line}
                label="Kütük"
                collapsed={false}
                onClick={() => setKutuk(true)}
              />
              <NavItem
                icon={RiSearchLine}
                label="Komut paleti"
                collapsed={false}
                onClick={() => setPalet(true)}
              />
              <NavItem
                icon={RiAlarmWarningLine}
                label="Dikkat"
                collapsed={false}
                onClick={() => setDikkat(true)}
                badge={
                  dikkatSayisi ? <Badge color="neutral">{dikkatSayisi}</Badge> : undefined
                }
              />
            </nav>
          }
          footer={
            <div className="flex w-full items-center gap-2 rounded-2xl border border-border-button-default bg-background-primary-default p-2">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-background-tertiary-default text-foreground-icon-secondary">
                <RiShieldCheckLine className="size-4" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-body-2-medium text-text-primary">
                  {user?.display_name ?? "—"}
                </span>
                <span className="block truncate text-caption-1-regular text-text-tertiary">
                  kağıt üstü · canlı para yok
                </span>
              </span>
              <button
                type="button"
                onClick={logout}
                aria-label="Çıkış"
                className="shrink-0 cursor-pointer rounded-lg p-1.5 text-foreground-icon-tertiary hover:bg-background-tertiary-hover"
              >
                <RiLogoutBoxRLine className="size-4" aria-hidden />
              </button>
            </div>
          }
        />
      </div>

        <main className="flex min-w-0 flex-1 flex-col lg:pr-3 lg:pl-0">
          <KunyeSeridi ekran={ekran} />
          <div className="min-w-0 flex-1">{children}</div>
        </main>

      <KutukCekmecesi acik={kutuk} kapat={() => setKutuk(false)} />
      <CommandPalette open={palet} onOpenChange={setPalet} />
      <AttentionSheet open={dikkat} onClose={() => setDikkat(false)} />
        <CelebrationWatcher />
      </div>
    </TooltipHost>
  );
}
