"use client";

/**
 * Yönetim › Kullanıcılar — hesap ve yetki yönetimi.
 *
 * Açık kayıt yoktur; hesaplar yalnızca buradan oluşur. Her yönetimsel işlem
 * denetim kaydına yazılır.
 */

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type Role, type User } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { toast } from "@/lib/toast";
import { ROLE_HINT, ROLE_LABEL } from "@/lib/humanize";
import { dateTime, relative } from "@/lib/format";
import { GuideSection } from "@/shell/page";
import {
  Async,
  Button,
  Drawer,
  DrawerSection,
  Field,
  FormField,
  Modal,
  Panel,
  RolePill,
  Select,
  Tag,
  TextInput,
  Toggle,
} from "@/design";
import { DataGrid } from "@/grid/data-grid";
import type { GridColumn } from "@/grid/types";

const ROLES: Role[] = ["ADMIN", "TRADER", "VIEWER"];

export const KULLANICILAR = {
  summary:
    "Panel hesapları, yetkileri ve oturumları. Açık kayıt yoktur — hesaplar yalnızca buradan oluşturulur.",
  guide: (
    <>
      <GuideSection title="Ne gösteriyor">
        <p>
          Panele erişebilen hesaplar. <strong>Açık kayıt yoktur</strong> — hesaplar yalnızca
          buradan oluşturulur ve iki adımlı doğrulama zorunludur.
        </p>
      </GuideSection>
      <GuideSection title="Nasıl okunur">
        <p>
          <strong>Yönetici</strong> her şeyi yapabilir: kullanıcı yönetimi, ayarlar,
          entegrasyonlar, acil durdurma.
        </p>
        <p>
          <strong>İşlemci</strong> bot ve strateji yönetir, işlem açar; yönetim sayfalarını
          göremez.
        </p>
        <p>
          <strong>İzleyici</strong> yalnızca görüntüler, hiçbir şeyi değiştiremez.
        </p>
      </GuideSection>
      <GuideSection title="Ne yapabilirim">
        <p>
          Bir hesabın şüpheli kullanıldığını düşünüyorsanız oturumlarını iptal edin; kullanıcı
          yeniden giriş yapmak zorunda kalır. İki adımlı doğrulamayı sıfırlamak, kullanıcının
          telefonunu kaybettiği durumlar içindir.
        </p>
      </GuideSection>
    </>
  ),
};

export function KullanicilarTab() {
  const [selected, setSelected] = useState<User | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const query = useQuery({
    queryKey: ["users"],
    queryFn: () => api.get<User[]>("/users"),
  });

  const columns = useMemo<GridColumn<User>[]>(
    () => [
      {
        id: "display_name",
        header: "Kullanıcı",
        width: 260,
        pin: true,
        value: (row) => row.display_name || row.email,
        search: (row) => `${row.display_name} ${row.email} ${row.role}`,
        cell: (row) => (
          <span className="flex flex-col leading-tight">
            <span style={{ fontSize: "var(--sn-t-body)", color: "var(--sn-ink)" }}>
              {row.display_name || "—"}
            </span>
            <span style={{ fontSize: "var(--sn-t-caption)", color: "var(--sn-ink-3)" }}>
              {row.email}
            </span>
          </span>
        ),
      },
      {
        id: "role",
        header: "Yetki",
        width: 190,
        hint: "Yönetici her şeyi yapar; işlemci bot ve strateji yönetir; izleyici yalnızca görüntüler.",
        value: (row) => row.role,
        cell: (row) => <RolePill role={row.role} />,
      },
      {
        id: "totp_enabled",
        header: "İki adımlı doğrulama",
        width: 178,
        hint: "Kapalıysa kullanıcı bir sonraki girişinde kurulum yapar. Panel dışarı açıksa kapalı 2FA ciddi bir risktir.",
        value: (row) => (row.totp_enabled ? 1 : 0),
        cell: (row) => (
          <Tag tone={row.totp_enabled ? "up" : "warn"}>
            {row.totp_enabled ? "Kurulu" : "Kurulmadı"}
          </Tag>
        ),
      },
      {
        id: "is_active",
        header: "Durum",
        width: 110,
        value: (row) => (row.is_active ? 1 : 0),
        cell: (row) => (
          <Tag tone={row.is_active ? "up" : "neutral"}>{row.is_active ? "Aktif" : "Pasif"}</Tag>
        ),
      },
      {
        id: "last_login_at",
        header: "Son giriş",
        width: 140,
        value: (row) => (row.last_login_at ? new Date(row.last_login_at).getTime() : null),
        cell: (row) => (
          <span style={{ fontSize: "var(--sn-t-caption)", color: "var(--sn-ink-2)" }}>
            {relative(row.last_login_at)}
          </span>
        ),
      },
    ],
    [],
  );

  return (
    <>
      <Panel
        title="Hesaplar"
        padded={false}
        actions={
          <Button size="sm" variant="primary" onClick={() => setCreateOpen(true)}>
            Yeni kullanıcı
          </Button>
        }
      >
        <Async query={query} empty={{ title: "Kullanıcı yok", hint: "Henüz hiç hesap oluşturulmamış." }}>
          {(rows) => (
            <DataGrid
              rows={rows}
              columns={columns}
              rowKey={(row) => String(row.id)}
              onRowClick={setSelected}
              storageKey="kullanicilar"
              searchPlaceholder="Ad ya da e-posta ara…"
              defaultSort={[{ id: "display_name", desc: false }]}
            />
          )}
        </Async>
      </Panel>

      <Panel title="Yetkiler ne anlama geliyor">
        <div className="grid gap-3 md:grid-cols-3">
          {ROLES.map((role) => (
            <div
              key={role}
              className="rounded-[var(--sn-r-sm)] px-3.5 py-3"
              style={{ border: "1px solid var(--sn-border)" }}
            >
              <div
                className="mb-1 font-medium"
                style={{ fontSize: "var(--sn-t-body)", color: "var(--sn-ink)" }}
              >
                {ROLE_LABEL[role]}
              </div>
              <p
                style={{ fontSize: "var(--sn-t-caption)", color: "var(--sn-ink-2)", lineHeight: 1.55 }}
              >
                {ROLE_HINT[role]}
              </p>
            </div>
          ))}
        </div>
      </Panel>

      {selected && <UserDrawer user={selected} onClose={() => setSelected(null)} />}
      <CreateUserModal open={createOpen} onClose={() => setCreateOpen(false)} />
    </>
  );
}

/* ------------------------------------------------------------------ */

function UserDrawer({ user, onClose }: { user: User; onClose: () => void }) {
  const qc = useQueryClient();
  const { user: me } = useAuth();
  const [displayName, setDisplayName] = useState(user.display_name);
  const [role, setRole] = useState<Role>(user.role);
  const [isActive, setIsActive] = useState(user.is_active);
  const [password, setPassword] = useState("");

  const invalidate = () => void qc.invalidateQueries({ queryKey: ["users"] });

  const save = useMutation({
    mutationFn: () =>
      api.patch(`/users/${user.id}`, {
        display_name: displayName,
        role,
        is_active: isActive,
        ...(password ? { password } : {}),
      }),
    onSuccess: () => {
      toast.success("Kullanıcı güncellendi");
      invalidate();
      onClose();
    },
    onError: (error: Error) => toast.error("Güncellenemedi", error.message),
  });

  const reset2fa = useMutation({
    mutationFn: () => api.post(`/users/${user.id}/reset-2fa`),
    onSuccess: () => {
      toast.success(
        "İki adımlı doğrulama sıfırlandı",
        "Kullanıcı bir sonraki girişinde yeniden kurulum yapacak.",
      );
      invalidate();
    },
    onError: (error: Error) => toast.error("Sıfırlanamadı", error.message),
  });

  const revoke = useMutation({
    mutationFn: () => api.post(`/users/${user.id}/revoke-sessions`),
    onSuccess: () => {
      toast.success("Oturumlar iptal edildi", "Kullanıcı yeniden giriş yapmak zorunda.");
      invalidate();
    },
    onError: (error: Error) => toast.error("İptal edilemedi", error.message),
  });

  const isSelf = me?.id === user.id;

  return (
    <Drawer
      open
      onClose={onClose}
      title={user.display_name || user.email}
      subtitle={user.email}
      badge={<RolePill role={user.role} />}
      footer={
        <>
          <Button size="sm" variant="quiet" onClick={onClose}>
            Vazgeç
          </Button>
          <Button size="sm" variant="primary" disabled={save.isPending} onClick={() => save.mutate()}>
            Kaydet
          </Button>
        </>
      }
    >
      <DrawerSection title="Hesap bilgileri">
        <div className="flex flex-col gap-3">
          <FormField label="Görünen ad">
            <TextInput value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
          </FormField>

          <FormField label="Yetki" term="rol" hint={ROLE_HINT[role]}>
            <Select value={role} onChange={(event) => setRole(event.target.value as Role)}>
              {ROLES.map((option) => (
                <option key={option} value={option}>
                  {ROLE_LABEL[option]}
                </option>
              ))}
            </Select>
          </FormField>

          <Toggle
            checked={isActive}
            disabled={isSelf}
            onChange={setIsActive}
            label="Hesap aktif"
            hint={isSelf ? "Kendi hesabınızı pasife alamazsınız." : undefined}
          />

          <FormField label="Yeni parola">
            <TextInput
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Değiştirmeyecekseniz boş bırakın"
            />
          </FormField>
        </div>
      </DrawerSection>

      <DrawerSection
        title="Güvenlik işlemleri"
        hint="Bu işlemler anında etkili olur ve denetim kaydına yazılır."
      >
        <div className="flex flex-col gap-2">
          <SecurityAction
            title="İki adımlı doğrulamayı sıfırla"
            description="Kullanıcı telefonunu kaybettiyse kullanın. Bir sonraki girişinde yeniden kurulum yapar."
            label="Sıfırla"
            busy={reset2fa.isPending}
            onClick={() => reset2fa.mutate()}
          />
          <SecurityAction
            title="Tüm oturumları iptal et"
            description="Açık tüm oturumlar kapanır; kullanıcı yeniden giriş yapmak zorunda kalır."
            label="İptal et"
            busy={revoke.isPending}
            onClick={() => revoke.mutate()}
          />
        </div>
      </DrawerSection>

      <DrawerSection title="Künye">
        <div className="flex flex-col">
          <Field label="Kullanıcı no" value={`#${user.id}`} />
          <Field label="Oluşturulma" value={dateTime(user.created_at)} />
          <Field label="Son giriş" value={dateTime(user.last_login_at)} />
          <Field label="İki adımlı doğrulama" value={user.totp_enabled ? "Kurulu" : "Kurulmadı"} />
        </div>
      </DrawerSection>
    </Drawer>
  );
}

function SecurityAction({
  title,
  description,
  label,
  busy,
  onClick,
}: {
  title: string;
  description: string;
  label: string;
  busy: boolean;
  onClick: () => void;
}) {
  return (
    <div
      className="flex items-center justify-between gap-3 rounded-[var(--sn-r-sm)] px-3.5 py-2.5"
      style={{ border: "1px solid var(--sn-border)" }}
    >
      <div className="min-w-0">
        <div style={{ fontSize: "var(--sn-t-caption)", color: "var(--sn-ink)" }}>{title}</div>
        <p style={{ fontSize: "var(--sn-t-caption)", color: "var(--sn-ink-2)", lineHeight: 1.45 }}>
          {description}
        </p>
      </div>
      <Button size="sm" variant="neutral" disabled={busy} onClick={onClick}>
        {label}
      </Button>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function CreateUserModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<Role>("VIEWER");

  const create = useMutation({
    mutationFn: () =>
      api.post<User>("/users", {
        email: email.trim().toLowerCase(),
        password,
        display_name: displayName.trim() || undefined,
        role,
      }),
    onSuccess: () => {
      toast.success("Kullanıcı oluşturuldu", "İlk girişinde iki adımlı doğrulama kurulumu yapacak.");
      void qc.invalidateQueries({ queryKey: ["users"] });
      onClose();
    },
    onError: (error: Error) => toast.error("Oluşturulamadı", error.message),
  });

  const valid = email.includes("@") && password.length >= 8;

  return (
    <Modal
      open={open}
      onOpenChange={(next) => !next && onClose()}
      title="Yeni kullanıcı"
      description="Hesap oluşturulduktan sonra kullanıcı ilk girişinde iki adımlı doğrulama kurulumunu tamamlar. Bu adım atlanamaz."
      footer={
        <>
          <Button variant="quiet" onClick={onClose}>
            Vazgeç
          </Button>
          <Button
            variant="primary"
            disabled={!valid || create.isPending}
            onClick={() => create.mutate()}
          >
            Oluştur
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3.5">
        <FormField label="E-posta">
          <TextInput
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoFocus
          />
        </FormField>

        <FormField label="Görünen ad">
          <TextInput
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            placeholder="Boş bırakılırsa e-postadan türetilir"
          />
        </FormField>

        <FormField
          label="Geçici parola"
          hint="En az 8 karakter. Kullanıcıya güvenli bir kanaldan iletin."
        >
          <TextInput
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </FormField>

        <FormField label="Yetki" term="rol" hint={ROLE_HINT[role]}>
          <Select value={role} onChange={(event) => setRole(event.target.value as Role)}>
            {ROLES.map((option) => (
              <option key={option} value={option}>
                {ROLE_LABEL[option]}
              </option>
            ))}
          </Select>
        </FormField>
      </div>
    </Modal>
  );
}
