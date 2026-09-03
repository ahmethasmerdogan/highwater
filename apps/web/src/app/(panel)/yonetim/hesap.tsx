"use client";

/**
 * Yönetim › Hesap — kendi kullanıcı bilgileri ve arayüz tercihleri.
 *
 * Yetki burada değiştirilemez; kendi yetkisini yükseltebilen bir kullanıcı
 * yetki sisteminin kendisini anlamsız kılar. Değişiklik için yöneticiye
 * başvurulur ve bu ekranda böyle yazar.
 */

import { useAuth } from "@/lib/auth";
import { ROLE_HINT, ROLE_LABEL } from "@/lib/humanize";
import { dateTime, relative } from "@/lib/format";
import {
  Button,
  Field,
  InfoDot,
  Panel,
  RolePill,
  Tag,
  useTheme,
  type ThemeMode,
} from "@/design";
import { cx } from "@/design/cx";

const THEMES: { id: ThemeMode; label: string; hint: string }[] = [
  { id: "light", label: "Açık", hint: "Her zaman açık tema." },
  { id: "dark", label: "Koyu", hint: "Her zaman koyu tema." },
  {
    id: "system",
    label: "Sistem",
    hint: "İşletim sisteminizin tercihini izler ve otomatik değişir.",
  },
];

export const HESAP = {
  summary: "Kimlik bilgileriniz, yetkiniz ve arayüz tercihleriniz.",
  guide: null,
};

export function HesapTab() {
  const { user, logout } = useAuth();
  const { mode, setMode } = useTheme();

  if (!user) return null;

  return (
    <>
      <Panel title="Kimlik">
        <div className="flex flex-col">
          <Field label="Görünen ad" value={user.display_name || "—"} />
          <Field label="E-posta" value={user.email} />
          <Field label="Yetki" term="rol" value={<RolePill role={user.role} />} />
          <Field
            label="İki adımlı doğrulama"
            hint="Girişte parolaya ek olarak istenen tek kullanımlık kod. Bu sistemde zorunludur."
            value={
              <Tag tone={user.totp_enabled ? "up" : "warn"}>
                {user.totp_enabled ? "Kurulu" : "Kurulmadı"}
              </Tag>
            }
          />
          <Field label="Hesap açılışı" value={dateTime(user.created_at)} />
          <Field
            label="Son giriş"
            value={`${dateTime(user.last_login_at)} (${relative(user.last_login_at)})`}
          />
        </div>

        <p
          className="mt-3 rounded-[var(--sn-r-sm)] px-3 py-2"
          style={{
            background: "var(--sn-sunken)",
            fontSize: "var(--sn-t-caption)",
            color: "var(--sn-ink-2)",
            lineHeight: 1.55,
          }}
        >
          <strong style={{ color: "var(--sn-ink)", fontWeight: 550 }}>
            {ROLE_LABEL[user.role] ?? user.role}:
          </strong>{" "}
          {ROLE_HINT[user.role]}
        </p>

        <p
          className="mt-2"
          style={{ fontSize: "var(--sn-t-caption)", color: "var(--sn-ink-3)", lineHeight: 1.55 }}
        >
          Yetkinizi kendiniz değiştiremezsiniz. Değişiklik gerekiyorsa bir yöneticiye başvurun —
          her yetki değişikliği denetim kaydına yazılır.
        </p>
      </Panel>

      <Panel
        title="Görünüm"
        description="Açık ve koyu tema bu üründe eşit destekleniyor; hangisini kullanacağınıza siz karar verin."
      >
        <div className="flex flex-wrap gap-2">
          {THEMES.map((theme) => {
            const active = mode === theme.id;
            return (
              <button
                key={theme.id}
                type="button"
                onClick={() => setMode(theme.id)}
                className={cx(
                  "sn-focus flex min-w-[168px] flex-col items-start gap-0.5 rounded-[var(--sn-r-sm)] px-3 py-2.5 text-left",
                  "transition-colors duration-[var(--sn-dur-1)]",
                )}
                style={{
                  border: `1px solid ${active ? "var(--sn-brand-line)" : "var(--sn-border)"}`,
                  background: active ? "var(--sn-brand-bg)" : "transparent",
                }}
              >
                <span
                  className="font-medium"
                  style={{
                    fontSize: "var(--sn-t-body)",
                    color: active ? "var(--sn-brand)" : "var(--sn-ink)",
                  }}
                >
                  {theme.label}
                </span>
                <span
                  style={{ fontSize: "var(--sn-t-caption)", color: "var(--sn-ink-3)", lineHeight: 1.4 }}
                >
                  {theme.hint}
                </span>
              </button>
            );
          })}
        </div>
      </Panel>

      <Panel
        title="Oturum"
        description="Bu tarayıcıdaki oturumunuzu kapatır. Botlar ve çalışan işlemler etkilenmez."
      >
        <div className="flex items-center gap-3">
          <Button size="sm" variant="neutral" onClick={() => void logout()}>
            Çıkış yap
          </Button>
          <span
            className="flex items-center gap-1"
            style={{ fontSize: "var(--sn-t-caption)", color: "var(--sn-ink-3)" }}
          >
            Çıkış yapmak botları durdurmaz
            <InfoDot text="Bot sunucuda çalışan bağımsız bir servistir. Paneli kapatmak, tarayıcıyı kapatmak ya da çıkış yapmak işlemleri durdurmaz." />
          </span>
        </div>
      </Panel>
    </>
  );
}
