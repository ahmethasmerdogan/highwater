"use client";

/**
 * Yönetim › Kullanıcılar (DESIGN-V3 §4.9) — hesap defteri + düzenleme çekmecesi.
 * Açık kayıt yoktur; hesaplar yalnızca buradan oluşur. Her işlem denetim kaydına yazılır.
 */

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Field as UiField, StatusPill, Switch, Table, TBody, Td, Th, THead, Tr } from "uicean";
import { api, type Role, type User } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { toast } from "@/lib/toast";
import { ROLE_HINT, ROLE_LABEL } from "@/lib/humanize";
import { dateTime, relative } from "@/lib/format";
import { GuideSection } from "@/shell/page";
import { Async, Button, Drawer, DrawerSection, KeyValue, Modal, NumText, Panel, RolePill, Select, TextInput } from "@/design";

const ROLES: Role[] = ["ADMIN", "TRADER", "VIEWER"];

export const KULLANICILAR = {
  summary: "Panel hesapları, yetkileri ve oturumları. Açık kayıt yoktur — hesaplar yalnızca buradan oluşturulur.",
  guide: (
    <>
      <GuideSection title="Nasıl okunur">
        <p>
          <strong>Yönetici</strong> her şeyi yapar. <strong>İşlemci</strong> bot ve strateji yönetir; yönetim sayfalarını
          göremez. <strong>İzleyici</strong> yalnızca görüntüler.
        </p>
      </GuideSection>
      <GuideSection title="Ne yapabilirim">
        <p>
          Şüpheli kullanım varsa oturumları iptal edin; kullanıcı yeniden giriş yapar. İki adımlı doğrulama sıfırlama,
          telefonunu kaybeden kullanıcı içindir.
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

  const rows = useMemo(
    () => [...(query.data ?? [])].sort((a, b) => (a.display_name || a.email).localeCompare(b.display_name || b.email, "tr")),
    [query.data],
  );

  return (
    <>
      <Panel
        title="Hesaplar"
        description="Satıra tıklayınca düzenleme açılır."
        padded={false}
        actions={<Button size="sm" variant="primary" onClick={() => setCreateOpen(true)}>Yeni kullanıcı</Button>}
      >
        <Async query={query} empty={{ title: "Kullanıcı yok", hint: "Henüz hiç hesap oluşturulmamış." }}>
          {() => (
            <Table minWidth={760}>
              <THead>
                <tr>
                  <Th>Kullanıcı</Th>
                  <Th>Yetki</Th>
                  <Th>2FA</Th>
                  <Th>Durum</Th>
                  <Th align="right">Son giriş</Th>
                </tr>
              </THead>
              <TBody>
                {rows.map((row) => (
                  <Tr key={row.id} selected={row.id === selected?.id} onClick={() => setSelected(row)}>
                    <Td>
                      <span className="block text-ink">{row.display_name || "—"}</span>
                      <span className="block text-[12px] text-ink-3">{row.email}</span>
                    </Td>
                    <Td><RolePill role={row.role} /></Td>
                    <Td><StatusPill tone={row.totp_enabled ? "green" : "amber"} size="sm">{row.totp_enabled ? "Kurulu" : "Kurulmadı"}</StatusPill></Td>
                    <Td><StatusPill tone={row.is_active ? "green" : "gray"} size="sm">{row.is_active ? "Aktif" : "Pasif"}</StatusPill></Td>
                    <Td align="right"><span className="sn-num text-[12px] text-ink-3">{relative(row.last_login_at)}</span></Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          )}
        </Async>
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
      toast.success("İki adımlı doğrulama sıfırlandı", "Kullanıcı bir sonraki girişinde yeniden kurulum yapacak.");
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
          <Button size="sm" variant="quiet" onClick={onClose}>Vazgeç</Button>
          <Button size="sm" variant="primary" disabled={save.isPending} onClick={() => save.mutate()}>Kaydet</Button>
        </>
      }
    >
      <DrawerSection title="Hesap bilgileri">
        <div className="flex flex-col gap-4">
          <UiField label="Görünen ad">
            {(p) => <TextInput {...p} value={displayName} onChange={(event) => setDisplayName(event.target.value)} />}
          </UiField>

          <UiField label="Yetki" hint={ROLE_HINT[role]}>
            {(p) => (
              <Select {...p} value={role} onChange={(event) => setRole(event.target.value as Role)}>
                {ROLES.map((option) => <option key={option} value={option}>{ROLE_LABEL[option]}</option>)}
              </Select>
            )}
          </UiField>

          <div className="flex items-center justify-between gap-4">
            <span className="text-[13px] text-ink">
              Hesap aktif
              {isSelf && <span className="block text-[12px] text-ink-3">Kendi hesabınızı pasife alamazsınız.</span>}
            </span>
            <span className={isSelf ? "pointer-events-none opacity-45" : undefined}>
              <Switch checked={isActive} onChange={setIsActive} label="Hesap aktif" />
            </span>
          </div>

          <UiField label="Yeni parola" hint="Değiştirmeyecekseniz boş bırakın.">
            {(p) => <TextInput {...p} type="password" value={password} onChange={(event) => setPassword(event.target.value)} />}
          </UiField>
        </div>
      </DrawerSection>

      <DrawerSection title="Güvenlik işlemleri" hint="Anında etkili olur ve denetim kaydına yazılır.">
        <div className="flex flex-col gap-2">
          <SecurityAction
            title="İki adımlı doğrulamayı sıfırla"
            description="Kullanıcı telefonunu kaybettiyse. Bir sonraki girişinde yeniden kurulum yapar."
            label="Sıfırla"
            busy={reset2fa.isPending}
            onClick={() => reset2fa.mutate()}
          />
          <SecurityAction
            title="Tüm oturumları iptal et"
            description="Açık tüm oturumlar kapanır; kullanıcı yeniden giriş yapar."
            label="İptal et"
            busy={revoke.isPending}
            onClick={() => revoke.mutate()}
          />
        </div>
      </DrawerSection>

      <DrawerSection title="Künye">
        <KeyValue
          rows={[
            { label: "Kullanıcı no", value: <NumText text={`#${user.id}`} size="sm" /> },
            { label: "Oluşturulma", value: <NumText text={dateTime(user.created_at)} size="sm" /> },
            { label: "Son giriş", value: <NumText text={dateTime(user.last_login_at)} size="sm" /> },
            { label: "İki adımlı doğrulama", value: user.totp_enabled ? "Kurulu" : "Kurulmadı" },
          ]}
        />
      </DrawerSection>
    </Drawer>
  );
}

function SecurityAction({ title, description, label, busy, onClick }: { title: string; description: string; label: string; busy: boolean; onClick: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-line px-3.5 py-2.5">
      <div className="min-w-0">
        <div className="text-[12.5px] text-ink">{title}</div>
        <p className="text-[12px] leading-[1.45] text-ink-3">{description}</p>
      </div>
      <Button size="sm" variant="neutral" disabled={busy} onClick={onClick}>{label}</Button>
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
      description="Kullanıcı ilk girişinde iki adımlı doğrulama kurulumunu tamamlar; bu adım atlanamaz."
      footer={
        <>
          <Button variant="quiet" onClick={onClose}>Vazgeç</Button>
          <Button variant="primary" disabled={!valid || create.isPending} onClick={() => create.mutate()}>Oluştur</Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <UiField label="E-posta" required>
          {(p) => <TextInput {...p} type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoFocus />}
        </UiField>
        <UiField label="Görünen ad" hint="Boş bırakılırsa e-postadan türetilir.">
          {(p) => <TextInput {...p} value={displayName} onChange={(event) => setDisplayName(event.target.value)} />}
        </UiField>
        <UiField label="Geçici parola" required hint="En az 8 karakter. Kullanıcıya güvenli bir kanaldan iletin.">
          {(p) => <TextInput {...p} type="password" value={password} onChange={(event) => setPassword(event.target.value)} />}
        </UiField>
        <UiField label="Yetki" hint={ROLE_HINT[role]}>
          {(p) => (
            <Select {...p} value={role} onChange={(event) => setRole(event.target.value as Role)}>
              {ROLES.map((option) => <option key={option} value={option}>{ROLE_LABEL[option]}</option>)}
            </Select>
          )}
        </UiField>
      </div>
    </Modal>
  );
}
