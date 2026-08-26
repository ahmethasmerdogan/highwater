"use client";

/**
 * Üst çubuk — bir gezinme başlığı değil, **canlı durum şeridi.**
 *
 * Panelin hangi sayfasında olursanız olun görünmesi gereken beş sayı
 * burada durur: özsermaye, günün kâr/zararı, maruziyet, havuz büyüklüğü ve
 * açık uyarı sayısı. Bunlar için sayfa değiştirmek zorunda kalmak,
 * kullanıcıyı sürekli Panel'e geri döndürür.
 *
 * **Sayılar sayarak değişir.** Özsermaye 10 saniyede bir tazeleniyor; bir
 * karede atlayan sayı yalnızca "değişti" der, sayarak giden sayı yönü ve
 * büyüklüğü çevresel görüşle bile okutur (`design/motion.ts`).
 *
 * **Bağlantı koparsa çubuk amber şeride döner ve bunu yazar.** DESIGN §3:
 * sessizce eski veriyi göstermek yasaktır. Bir işlem panelinde donmuş bir
 * sayı, yanlış bir sayıdan daha tehlikelidir — çünkü yanlış olduğu
 * anlaşılmaz.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useQuery } from "@tanstack/react-query";
import { api, type LivePnl, type SystemStatus } from "@/lib/api";
import { money, pct, relative } from "@/lib/format";
import { useLive } from "@/lib/ws";
import { Delta, Num } from "@/design/numeric";
import { IconButton, Tag, Tip } from "@/design/primitives";
import { ICaret, ILogout, IMoon, IScreen, ISearch, ISun, IWarn } from "@/design/icons";
import { useTheme } from "@/design/theme";
import { useAuth } from "@/lib/auth";
import { findNavItem } from "./nav";

export function Topbar({
  onOpenCommand,
  onOpenMenu,
}: {
  onOpenCommand: () => void;
  onOpenMenu: () => void;
}) {
  const pathname = usePathname();
  const item = findNavItem(pathname);
  const { state } = useLive();
  const offline = state === "reconnecting" || state === "closed";

  const { data: status } = useQuery({
    queryKey: ["system-status"],
    queryFn: () => api.get<SystemStatus>("/system/status"),
    refetchInterval: 15_000,
  });

  const { data: live } = useQuery({
    queryKey: ["live-pnl"],
    queryFn: () => api.get<LivePnl>("/portfolio/live"),
    refetchInterval: 10_000,
  });

  const exposurePct = live && live.equity > 0 ? live.exposure / live.equity : null;

  return (
    <header className="shrink-0" style={{ borderBottom: "1px solid var(--sn-hairline)" }}>
      {/* ---- Bağlantı şeridi --------------------------------------- */}
      {offline && (
        <div
          className="flex h-7 items-center gap-2 px-4"
          style={{ background: "var(--sn-warn-bg)", color: "var(--sn-warn)", fontSize: "var(--sn-t-caption)" }}
        >
          <IWarn size={13} />
          <span className="font-medium">Canlı veri kesildi</span>
          <span style={{ opacity: 0.8 }}>
            · yeniden bağlanılıyor. Aşağıdaki sayılar son bilinen değerlerdir.
          </span>
        </div>
      )}

      <div className="flex h-12 items-center gap-3 px-3" style={{ background: "var(--sn-panel)" }}>
        {/* Mobil menü düğmesi */}
        <IconButton label="Menü" className="md:hidden" onClick={onOpenMenu}>
          <span className="flex flex-col gap-[3px]">
            <span className="block h-[1.5px] w-4 rounded" style={{ background: "currentColor" }} />
            <span className="block h-[1.5px] w-4 rounded" style={{ background: "currentColor" }} />
            <span className="block h-[1.5px] w-4 rounded" style={{ background: "currentColor" }} />
          </span>
        </IconButton>

        {/* ---- Sayfa adı ------------------------------------------- */}
        <h1
          className="shrink-0 truncate font-medium"
          style={{ fontSize: "var(--sn-t-body-lg)", color: "var(--sn-ink)" }}
        >
          {item?.label ?? "SARNIÇ"}
        </h1>

        {/* ---- Komut tetikleyici ------------------------------------ */}
        <button
          type="button"
          onClick={onOpenCommand}
          className="sn-focus hidden h-8 items-center gap-2 rounded-[var(--sn-r-sm)] px-2.5 lg:flex"
          style={{
            background: "var(--sn-sunken)",
            color: "var(--sn-ink-4)",
            fontSize: "var(--sn-t-caption)",
            minWidth: 180,
          }}
        >
          <ISearch size={13} />
          <span>Ara ya da komut çalıştır</span>
          <kbd
            className="sn-num ml-auto rounded-[var(--sn-r-xs)] px-1"
            style={{ background: "var(--sn-panel)", color: "var(--sn-ink-3)", fontSize: 10 }}
          >
            ⌘K
          </kbd>
        </button>

        {/* ---- Canlı sayılar --------------------------------------- */}
        <div className="sn-scroll ml-auto flex items-center gap-0 overflow-x-auto">
          <LiveStat
            label="Özsermaye"
            hint="Botların toplam değeri: nakit artı açık pozisyonların güncel karşılığı. 10 saniyede bir tazelenir."
          >
            <Num value={live?.equity} format={(v) => money(v)} size="lg" animate />
          </LiveStat>

          <LiveStat
            label="Bugün"
            hint="Bugün kapanan işlemlerin toplamı (gerçekleşmiş) artı açık pozisyonların anlık kâr/zararı."
          >
            <Delta
              value={live ? live.realized_today + live.unrealized_pnl : null}
              format={(v) => money(v)}
              size="lg"
              animate
            />
          </LiveStat>

          <LiveStat
            label="Maruziyet"
            hint="Özsermayenin ne kadarı şu anda pozisyonda. Kalanı nakit bekliyor."
          >
            <Num value={exposurePct} format={(v) => pct(v, 1)} size="lg" animate />
          </LiveStat>

          <Separator />

          <LiveStat label="Havuz" hint={universeHint(status)}>
            <Num value={status?.universe_size} format={(v) => (v === null || v === undefined ? "—" : String(v))} size="lg" animate />
          </LiveStat>

          <LiveStat label="Bot" hint={botHint(status)}>
            <span className="sn-num" style={{ fontSize: "var(--sn-t-body-lg)" }}>
              <span className="sn-num-int">{status?.running_bots ?? "—"}</span>
              <span className="sn-num-frac">/{status?.total_bots ?? "—"}</span>
            </span>
          </LiveStat>

          <LiveStat label="Uyarı" hint={alarmHint(status)}>
            <span
              className="sn-num"
              style={{
                fontSize: "var(--sn-t-body-lg)",
                color: status && status.alarms > 0 ? "var(--sn-warn)" : "var(--sn-ink)",
              }}
            >
              {status?.alarms ?? "—"}
            </span>
          </LiveStat>
        </div>

        {/* ---- Sağ uç ---------------------------------------------- */}
        <div className="flex shrink-0 items-center gap-1.5 pl-1">
          {status?.market_data_stale && (
            <Tip content="Piyasa verisi akışı durdu. Botlar bayat fiyatla karar vermez; yeni giriş açılmaz.">
              <span>
                <Tag tone="warn">veri bayat</Tag>
              </span>
            </Tip>
          )}
          {status?.mode && (
            <Tip content="Sistemde canlı para yoktur. Tüm emirler dahili kağıt motorundan geçer; veriler gerçektir.">
              <span>
                <Tag tone="brand">{status.mode}</Tag>
              </span>
            </Tip>
          )}
          <ThemeToggle />
          <Profile />
        </div>
      </div>
    </header>
  );
}

/* ------------------------------------------------------------------ */

function Separator() {
  return <span className="mx-1 h-6 w-px shrink-0" style={{ background: "var(--sn-hairline)" }} />;
}

/**
 * Tek canlı sayı: etiketi üstte küçük, değeri altta büyük.
 *
 * Etiket ve değer alt alta durur çünkü yan yana dizildiklerinde göz
 * hangisinin hangi sayıya ait olduğunu her seferinde yeniden çözer.
 */
function LiveStat({
  label,
  hint,
  children,
}: {
  label: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <Tip content={hint}>
      <div className="flex shrink-0 flex-col justify-center px-2.5 leading-none">
        <span style={{ fontSize: 9.5, letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--sn-ink-3)" }}>
          {label}
        </span>
        <span className="mt-[3px]">{children}</span>
      </div>
    </Tip>
  );
}

function universeHint(status: SystemStatus | undefined): string {
  if (!status) return "Havuz büyüklüğü yükleniyor.";
  if (status.universe_size === 0) return "Havuz boş — hiçbir coin işlem yapılabilir durumda değil.";
  return `İşlem yapılabilir ${status.universe_size} coin var. Son yenileme: ${relative(status.universe_taken_at)}.`;
}

function botHint(status: SystemStatus | undefined): string {
  if (!status) return "Bot durumu yükleniyor.";
  if (status.total_bots === 0) return "Tanımlı bot yok.";
  return `${status.total_bots} bottan ${status.running_bots} tanesi çalışıyor. Çalışmayan bot karar almaz ve pozisyon açmaz.`;
}

function alarmHint(status: SystemStatus | undefined): string {
  if (!status) return "Uyarı sayısı yükleniyor.";
  return status.alarms > 0
    ? `${status.alarms} açık uyarı var. Ayrıntı için Loglar sayfasına bakın.`
    : "Açık uyarı yok.";
}

/* ------------------------------------------------------------------ */

function ThemeToggle() {
  const { mode, setMode } = useTheme();
  const next = mode === "light" ? "dark" : mode === "dark" ? "system" : "light";
  const Icon = mode === "light" ? ISun : mode === "dark" ? IMoon : IScreen;
  const label =
    mode === "light" ? "Açık tema" : mode === "dark" ? "Koyu tema" : "Sistem teması";

  return (
    <IconButton label={`${label} — değiştir`} onClick={() => setMode(next)}>
      <Icon size={15} />
    </IconButton>
  );
}

function Profile() {
  const { user, logout } = useAuth();
  if (!user) return null;
  const initials = (user.display_name || user.email)
    .split(/[\s@.]+/)
    .slice(0, 2)
    .map((part) => part[0]?.toLocaleUpperCase("tr") ?? "")
    .join("");

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          aria-label="Hesap menüsü"
          className="sn-focus flex h-8 items-center gap-1.5 rounded-[var(--sn-r-sm)] px-1.5 hover:bg-[var(--sn-sunken)]"
        >
          <span
            className="flex h-6 w-6 items-center justify-center rounded-full font-semibold"
            style={{ background: "var(--sn-sunken)", color: "var(--sn-ink-2)", fontSize: 10 }}
          >
            {initials}
          </span>
          <ICaret size={13} style={{ color: "var(--sn-ink-4)" }} />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          className="sn-fade-up z-[90] w-[212px] rounded-[var(--sn-r-md)] p-1.5"
          style={{ background: "var(--sn-overlay)", boxShadow: "var(--sn-shadow-pop)" }}
        >
          <div className="px-2 py-1.5">
            <div className="truncate font-medium" style={{ fontSize: "var(--sn-t-caption)", color: "var(--sn-ink)" }}>
              {user.display_name || user.email}
            </div>
            <div className="mt-0.5 flex items-center gap-1.5">
              <Tag tone="neutral">{user.role}</Tag>
              <span className="truncate" style={{ fontSize: 10, color: "var(--sn-ink-3)" }}>
                {user.email}
              </span>
            </div>
          </div>
          <div className="my-1 h-px" style={{ background: "var(--sn-hairline)" }} />
          <DropdownMenu.Item asChild>
            <Link
              href="/hesap"
              className="flex h-8 cursor-pointer items-center rounded-[var(--sn-r-xs)] px-2 outline-none hover:bg-[var(--sn-sunken)] data-[highlighted]:bg-[var(--sn-sunken)]"
              style={{ fontSize: "var(--sn-t-caption)", color: "var(--sn-ink-2)" }}
            >
              Hesabım
            </Link>
          </DropdownMenu.Item>
          {/* Oturum kapatma ayrı bir kalemdir ve tona sahiptir: avatarın
              kendisine tıklayınca oturumun kapanması, en sık tıklanan
              düğmeyi en yıkıcı eylem hâline getiriyordu. */}
          <DropdownMenu.Item
            onSelect={() => logout()}
            className="flex h-8 cursor-pointer items-center gap-2 rounded-[var(--sn-r-xs)] px-2 outline-none hover:bg-[var(--sn-down-bg)] data-[highlighted]:bg-[var(--sn-down-bg)]"
            style={{ fontSize: "var(--sn-t-caption)", color: "var(--sn-down)" }}
          >
            <ILogout size={14} />
            Oturumu kapat
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

