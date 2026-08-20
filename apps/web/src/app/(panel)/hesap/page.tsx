"use client";

/**
 * Hesap — kendi kullanıcı bilgileri ve arayüz tercihleri.
 *
 * Yetki burada değiştirilemez; kendi yetkisini yükseltebilen bir kullanıcı
 * yetki sisteminin kendisini anlamsız kılar. Değişiklik için yöneticiye
 * başvurulur ve bu ekranda böyle yazar.
 */

import { Button, StatusPill, cx, useTheme, type ThemeMode } from "@/ui";
import { useAuth } from "@/lib/auth";
import { ROLE_HINT, ROLE_LABEL } from "@/lib/humanize";
import { Page, Section } from "@/components/common/page";
import { Field, InfoDot } from "@/components/common/explain";
import { RolePill } from "@/components/common/pills";
import { dateTime, relative } from "@/lib/format";

const THEMES: { id: ThemeMode; label: string; hint: string }[] = [
  { id: "light", label: "Açık", hint: "Her zaman açık tema." },
  { id: "dark", label: "Koyu", hint: "Her zaman koyu tema." },
  {
    id: "system",
    label: "Sistem",
    hint: "İşletim sisteminizin tercihini izler ve otomatik değişir.",
  },
];

export default function AccountPage() {
  const { user, logout } = useAuth();
  const { mode, setMode } = useTheme();

  if (!user) return null;

  return (
    <Page
      title="Hesabım"
      description="Kimlik bilgileriniz, yetkiniz ve arayüz tercihleriniz."
    >
      <Section title="Kimlik">
        <div className="divide-y divide-line">
          <Field label="Görünen ad" value={user.display_name || "—"} />
          <Field label="E-posta" value={user.email} />
          <Field
            label="Yetki"
            term="rol"
            value={<RolePill role={user.role} />}
          />
          <Field
            label="İki adımlı doğrulama"
            hint="Girişte parolaya ek olarak istenen tek kullanımlık kod. Bu sistemde zorunludur."
            value={
              <StatusPill size="sm" tone={user.totp_enabled ? "green" : "orange"}>
                {user.totp_enabled ? "Kurulu" : "Kurulmadı"}
              </StatusPill>
            }
          />
          <Field label="Hesap açılışı" value={dateTime(user.created_at)} />
          <Field
            label="Son giriş"
            value={`${dateTime(user.last_login_at)} (${relative(user.last_login_at)})`}
          />
        </div>

        <p className="mt-3 rounded-lg bg-inset px-3 py-2 text-[12px] leading-relaxed text-ink-2">
          <strong className="font-medium text-ink">
            {ROLE_LABEL[user.role] ?? user.role}:
          </strong>{" "}
          {ROLE_HINT[user.role]}
        </p>

        <p className="mt-2 text-[12px] leading-relaxed text-ink-3">
          Yetkinizi kendiniz değiştiremezsiniz. Değişiklik gerekiyorsa bir yöneticiye
          başvurun — her yetki değişikliği denetim kaydına yazılır.
        </p>
      </Section>

      <Section
        title="Görünüm"
        description="Açık ve koyu tema bu üründe eşit destekleniyor; hangisini kullanacağınıza siz karar verin."
      >
        <div className="flex flex-wrap gap-2">
          {THEMES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setMode(t.id)}
              title={t.hint}
              className={cx(
                "flex min-w-36 flex-col items-start gap-0.5 rounded-lg border px-3 py-2.5 text-left transition-colors",
                mode === t.id
                  ? "border-brand bg-brand-soft"
                  : "border-line hover:border-line-strong",
              )}
            >
              <span
                className={cx(
                  "text-[13px] font-medium",
                  mode === t.id ? "text-brand" : "text-ink",
                )}
              >
                {t.label}
              </span>
              <span className="text-[11.5px] leading-snug text-ink-2">{t.hint}</span>
            </button>
          ))}
        </div>
      </Section>

      <Section
        title="Oturum"
        description="Bu tarayıcıdaki oturumunuzu kapatır. Botlar ve çalışan işlemler etkilenmez."
      >
        <div className="flex items-center gap-3">
          <Button size="sm" variant="outline" shape="rect" onClick={() => void logout()}>
            Çıkış yap
          </Button>
          <span className="flex items-center gap-1 text-[12px] text-ink-3">
            Çıkış yapmak botları durdurmaz
            <InfoDot
              text="Bot sunucuda çalışan bağımsız bir servistir. Paneli kapatmak, tarayıcıyı kapatmak ya da çıkış yapmak işlemleri durdurmaz."
              align="start"
            />
          </span>
        </div>
      </Section>
    </Page>
  );
}
