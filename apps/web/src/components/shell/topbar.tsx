"use client";

/**
 * Üst çubuk.
 *
 * Kullanıcı hangi sayfada olursa olsun sistemin canlı olup olmadığını
 * bilmek zorundadır. Bu yüzden üst çubuk dört sistem sinyalini her sayfada
 * taşır: havuz boyutu, çalışan bot, aktif uyarı, okunmamış bildirim.
 *
 * Bağlantı koparsa çubuk amber bir şeride döner ve bunu **yazar**. Sessizce
 * eski veriyi göstermek yasaktır — kullanıcı baktığı sayının canlı mı yoksa
 * donmuş mu olduğunu bilmeli.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  IBell,
  ICommand,
  IContrast,
  IMenu,
  IMoon,
  ISun,
  IWarning,
  Kbd,
  cx,
  useTheme,
} from "@/ui";
import { api, type LivePnl, type SystemStatus } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useLive } from "@/lib/ws";
import { InfoTip } from "@/components/common/explain";
import { AmountText, Signed } from "@/components/common/amount";
import { money, pctSigned, relative } from "@/lib/format";
import { findNavItem } from "./nav";
import { ProfileMenu } from "./profile-menu";

export function Topbar({
  onOpenCommand,
  onOpenMenu,
}: {
  onOpenCommand: () => void;
  onOpenMenu: () => void;
}) {
  const pathname = usePathname();
  const { state: wsState, lastMessageAt } = useLive();
  const { can } = useAuth();
  const current = findNavItem(pathname);

  const { data: status } = useQuery({
    queryKey: ["system-status"],
    queryFn: () => api.get<SystemStatus>("/system/status"),
    refetchInterval: 15_000,
  });

  const { data: unread } = useQuery({
    queryKey: ["unread-count"],
    queryFn: () => api.get<{ count: number }>("/notifications/unread-count"),
    refetchInterval: 30_000,
  });

  const { data: live } = useQuery({
    queryKey: ["live-pnl"],
    queryFn: () => api.get<LivePnl>("/portfolio/live"),
    refetchInterval: 10_000,
    enabled: can("VIEWER", "TRADER"),
  });

  const offline = wsState === "reconnecting" || wsState === "closed";

  return (
    <div className="sticky top-0 z-30">
      {/* Bağlantı uyarısı — kopukken her sayfada görünür */}
      {offline && (
        <div className="flex items-center gap-2 bg-warn-soft px-4 py-1.5 text-[12.5px] text-ink">
          <IWarning size={14} className="shrink-0 text-warn" />
          <span className="font-medium">Canlı veri kesildi</span>
          <span className="text-ink-2">
            · yeniden bağlanılıyor. Ekrandaki sayılar
            {lastMessageAt ? ` ${relative(new Date(lastMessageAt).toISOString())}` : ""} durumunu
            gösteriyor, güncel olmayabilir.
          </span>
        </div>
      )}

      <header className="flex h-[52px] items-center gap-3 border-b border-line bg-surface px-3 md:px-4">
        {/* Mobil menü */}
        <button
          type="button"
          onClick={onOpenMenu}
          aria-label="Menüyü aç"
          className="rounded-lg p-1.5 text-ink-2 hover:bg-inset md:hidden"
        >
          <IMenu size={18} />
        </button>

        {/* Sayfa adı */}
        <div className="hidden min-w-0 md:block">
          <div className="truncate text-[13.5px] font-medium text-ink">
            {current?.label ?? "Panel"}
          </div>
        </div>

        {/* Komut paleti */}
        <button
          type="button"
          onClick={onOpenCommand}
          className="ml-auto flex h-8 items-center gap-2 rounded-lg border border-line bg-inset px-2.5 text-[12.5px] text-ink-3 hover:border-line-strong hover:text-ink-2 md:ml-0"
        >
          <ICommand size={13} />
          <span className="hidden sm:inline">Ara ya da komut çalıştır</span>
          <Kbd className="hidden md:inline">⌘K</Kbd>
        </button>

        <div className="ml-auto flex items-center gap-1 md:gap-2">
          {/* Canlı kâr/zarar */}
          {live && (
            <InfoTip
              title="Bugünkü sonuç"
              body={`Tüm botların toplam özsermayesi ${money(live.equity)} USD. Bugün kapanan işlemlerden ${money(live.realized_today)} USD gerçekleşti; açık pozisyonlarda ${money(live.unrealized_pnl)} USD henüz cebe girmemiş kâr/zarar var.`}
              side="bottom"
              align="end"
              width={300}
            >
              <span className="hidden items-center gap-2 rounded-lg border border-line px-2.5 py-1 lg:flex">
                <span className="text-[11px] text-ink-3">Özsermaye</span>
                <AmountText text={money(live.equity)} size="sm" />
                <Signed
                  value={live.total_return}
                  text={pctSigned(live.total_return)}
                  size="sm"
                  arrow
                />
              </span>
            </InfoTip>
          )}

          <StatusSignals status={status} wsOffline={offline} />

          {/* Bildirimler */}
          <Link
            href="/bildirimler"
            aria-label="Bildirimler"
            className="relative rounded-lg p-1.5 text-ink-2 hover:bg-inset hover:text-ink"
          >
            <IBell size={17} />
            {(unread?.count ?? 0) > 0 && (
              <span className="num absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-down px-1 text-[10px] font-semibold text-white">
                {unread!.count > 99 ? "99+" : unread!.count}
              </span>
            )}
          </Link>

          <ThemeToggle />
          <ProfileMenu />
        </div>
      </header>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Sistem sinyalleri                                                  */
/* ------------------------------------------------------------------ */

function StatusSignals({
  status,
  wsOffline,
}: {
  status: SystemStatus | undefined;
  wsOffline: boolean;
}) {
  if (!status) return null;

  const dataStale = status.market_data_stale;

  return (
    <div className="hidden items-center gap-1 md:flex">
      <Signal
        label="Havuz"
        value={String(status.universe_size)}
        tone={status.universe_size === 0 ? "down" : "neutral"}
        tip={
          status.universe_size === 0
            ? "Havuz boş. Hiçbir coin işlem için uygun bulunmadı ya da havuz henüz kurulmadı — bu durumda hiçbir bot pozisyon açamaz."
            : `İşlem yapılabilir ${status.universe_size} coin var. Son yenileme: ${relative(status.universe_taken_at)}.`
        }
        href="/havuz"
      />
      <Signal
        label="Bot"
        value={`${status.running_bots}/${status.total_bots}`}
        tone={status.total_bots > 0 && status.running_bots === 0 ? "warn" : "neutral"}
        tip={
          status.total_bots === 0
            ? "Henüz hiç bot kurulmamış."
            : `${status.total_bots} bottan ${status.running_bots} tanesi çalışıyor. Çalışmayan botlar karar almaz ve pozisyon açmaz.`
        }
        href="/botlar"
      />
      <Signal
        label="Uyarı"
        value={String(status.alarms)}
        tone={status.alarms > 0 ? "warn" : "neutral"}
        tip={
          status.alarms > 0
            ? `${status.alarms} açık uyarı var. Ayrıntı için Loglar sayfasına bakın.`
            : "Açık uyarı yok."
        }
        href="/loglar"
      />
      {(dataStale || wsOffline) && (
        <Signal
          label="Veri"
          value="bayat"
          tone="down"
          tip="Piyasa verisi belirlenen süredir yenilenmiyor. Kararlar durduruldu; eski fiyatla işlem yapmak kör işlemdir."
          href="/loglar"
        />
      )}
    </div>
  );
}

function Signal({
  label,
  value,
  tone,
  tip,
  href,
}: {
  label: string;
  value: string;
  tone: "neutral" | "warn" | "down";
  tip: string;
  href: string;
}) {
  return (
    <InfoTip title={label} body={tip} side="bottom" align="center" width={260}>
      <Link
        href={href}
        className={cx(
          "flex items-center gap-1.5 rounded-lg px-2 py-1 text-[12px] hover:bg-inset",
          tone === "neutral" && "text-ink-2",
          tone === "warn" && "text-warn",
          tone === "down" && "text-down",
        )}
      >
        <span
          aria-hidden
          className={cx(
            "size-1.5 rounded-full",
            tone === "neutral" && "bg-up",
            tone === "warn" && "bg-warn",
            tone === "down" && "bg-down",
          )}
        />
        <span className="text-ink-3">{label}</span>
        <span className="num text-[12px] text-inherit">{value}</span>
      </Link>
    </InfoTip>
  );
}

/* ------------------------------------------------------------------ */
/*  Tema                                                               */
/* ------------------------------------------------------------------ */

/**
 * Açık / koyu / sistem üçlüsü.
 *
 * İki tema da birinci sınıf vatandaş; bu düğme bir "koyu mod anahtarı"
 * değil, üç durumlu bir tercih.
 */
function ThemeToggle() {
  const { mode, setMode } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const next = mode === "light" ? "dark" : mode === "dark" ? "system" : "light";
  const label =
    mode === "light" ? "Açık tema" : mode === "dark" ? "Koyu tema" : "Sistem teması";

  return (
    <InfoTip
      title={label}
      body="Tıklayınca açık → koyu → sistem sırasıyla değişir. Sistem seçiliyken işletim sisteminin tercihi uygulanır."
      side="bottom"
      align="end"
      width={240}
    >
      <button
        type="button"
        onClick={() => setMode(next)}
        aria-label={label}
        className="rounded-lg p-1.5 text-ink-2 hover:bg-inset hover:text-ink"
      >
        {/* Sunucuda tema bilinmez; ilk çizimde nötr ikon basılır. */}
        {!mounted ? (
          <IContrast size={17} />
        ) : mode === "light" ? (
          <ISun size={17} />
        ) : mode === "dark" ? (
          <IMoon size={17} />
        ) : (
          <IContrast size={17} />
        )}
      </button>
    </InfoTip>
  );
}
