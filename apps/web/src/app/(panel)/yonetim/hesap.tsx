"use client";

/**
 * Yönetim › Hesap (DESIGN-V3 §4.9) — kimlik, görünüm, oturum.
 *
 * Yetki burada değiştirilemez; kendi yetkisini yükseltebilen bir kullanıcı
 * yetki sistemini anlamsız kılar. Görünüm tercihleri uicean temasına yazılır
 * (kip · vurgu · yazı tipi) ve tarayıcıda kalır.
 */

import { SegmentedControl, StatusPill } from "uicean";
import { useAuth } from "@/lib/auth";
import { ROLE_HINT, ROLE_LABEL } from "@/lib/humanize";
import { dateTime, relative } from "@/lib/format";
import { Button, InfoDot, KeyValue, NumText, Panel, RolePill, useTheme, type ThemeMode } from "@/design";

type Accent = ReturnType<typeof useTheme>["accent"];
type Font = ReturnType<typeof useTheme>["font"];

const MODES: { value: ThemeMode; label: string }[] = [
  { value: "system", label: "Sistem" },
  { value: "light", label: "Açık" },
  { value: "dark", label: "Koyu" },
];

const ACCENTS: { value: Accent; label: string }[] = [
  { value: "blue", label: "Mavi" },
  { value: "emerald", label: "Zümrüt" },
  { value: "violet", label: "Mor" },
  { value: "amber", label: "Kehribar" },
  { value: "rose", label: "Gül" },
];

const FONTS: { value: Font; label: string }[] = [
  { value: "geist", label: "Geist" },
  { value: "inter", label: "Inter" },
  { value: "system", label: "Sistem" },
];

export const HESAP = {
  summary: "Kimlik bilgileriniz, yetkiniz ve arayüz tercihleriniz.",
  guide: null,
};

export function HesapTab() {
  const { user, logout } = useAuth();
  const { mode, setMode, accent, setAccent, font, setFont } = useTheme();

  if (!user) return null;

  return (
    <>
      <div className="grid gap-5 lg:grid-cols-[3fr_2fr]">
        <Panel title="Kimlik" description="Yetkinizi kendiniz değiştiremezsiniz; değişiklik için yöneticiye başvurun.">
          <KeyValue
            rows={[
              { label: "Görünen ad", value: user.display_name || "—" },
              { label: "E-posta", value: user.email },
              { label: "Yetki", value: <RolePill role={user.role} /> },
              {
                label: "İki adımlı doğrulama",
                value: <StatusPill tone={user.totp_enabled ? "green" : "amber"} size="sm">{user.totp_enabled ? "Kurulu" : "Kurulmadı"}</StatusPill>,
              },
              { label: "Hesap açılışı", value: <NumText text={dateTime(user.created_at)} size="sm" /> },
              {
                label: "Son giriş",
                value: <><NumText text={dateTime(user.last_login_at)} size="sm" /> <span className="text-[12px] text-ink-3">({relative(user.last_login_at)})</span></>,
              },
            ]}
          />
          <p className="mt-3 text-[12.5px] leading-[1.55] text-ink-3">
            <strong className="font-medium text-ink-2">{ROLE_LABEL[user.role] ?? user.role}:</strong> {ROLE_HINT[user.role]}
          </p>
        </Panel>

        <Panel title="Görünüm" description="Açık ve koyu eşit vatandaş; tercih bu tarayıcıda kalır.">
          <div className="flex flex-col gap-4">
            <Secim label="Kip">
              <SegmentedControl size="sm" options={MODES} value={mode} onChange={setMode} />
            </Secim>
            <Secim label="Vurgu">
              <SegmentedControl size="sm" options={ACCENTS} value={accent} onChange={setAccent} />
            </Secim>
            <Secim label="Yazı tipi">
              <SegmentedControl size="sm" options={FONTS} value={font} onChange={setFont} />
            </Secim>
          </div>
        </Panel>
      </div>

      <Panel title="Oturum" description="Bu tarayıcıdaki oturumunuzu kapatır. Botlar ve çalışan işlemler etkilenmez.">
        <div className="flex items-center gap-3">
          <Button size="sm" variant="neutral" onClick={() => void logout()}>Çıkış yap</Button>
          <span className="inline-flex items-center gap-1 text-[12px] text-ink-3">
            Çıkış yapmak botları durdurmaz
            <InfoDot text="Bot sunucuda çalışan bağımsız bir servistir. Paneli kapatmak ya da çıkış yapmak işlemleri durdurmaz." />
          </span>
        </div>
      </Panel>
    </>
  );
}

function Secim({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span className="text-[11.5px] font-semibold tracking-[0.06em] text-ink-3 uppercase">{label}</span>
      {children}
    </div>
  );
}
