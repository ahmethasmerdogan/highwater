"use client";

/**
 * Kullanıcılar — hesap ve yetki yönetimi.
 *
 * Açık kayıt yoktur; hesaplar yalnızca buradan oluşur. Her yönetimsel işlem
 * denetim kaydına yazılır.
 */

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Modal, StatusPill } from "@/ui";
import { api, type Role, type User } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { toast } from "@/lib/toast";
import { ROLE_HINT, ROLE_LABEL } from "@/lib/humanize";
import { Page, Section, Async } from "@/components/common/page";
import { Field, InfoDot } from "@/components/common/explain";
import { RolePill } from "@/components/common/pills";
import { DataTable, type Column } from "@/components/data/data-table";
import { Drawer, DrawerSection } from "@/components/data/drawer";
import { dateTime, relative } from "@/lib/format";

const ROLES: Role[] = ["ADMIN", "TRADER", "VIEWER"];

export default function UsersPage() {
  const [selected, setSelected] = useState<User | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const query = useQuery({
    queryKey: ["users"],
    queryFn: () => api.get<User[]>("/users"),
  });

  const columns: Column<User>[] = [
    {
      key: "display_name",
      header: "Kullanıcı",
      sort: (r) => r.display_name || r.email,
      cell: (r) => (
        <span className="flex flex-col leading-tight">
          <span className="text-[13px] text-ink">{r.display_name || "—"}</span>
          <span className="text-[11.5px] text-ink-3">{r.email}</span>
        </span>
      ),
    },
    {
      key: "role",
      header: "Yetki",
      width: "180px",
      term: "rol",
      sort: (r) => r.role,
      cell: (r) => <RolePill role={r.role} />,
    },
    {
      key: "totp_enabled",
      header: "İki adımlı doğrulama",
      width: "180px",
      hint: "Kapalıysa kullanıcı bir sonraki girişinde kurulum yapar. Panel dışarı açıksa kapalı 2FA ciddi bir risktir.",
      sort: (r) => (r.totp_enabled ? 1 : 0),
      cell: (r) => (
        <StatusPill size="sm" tone={r.totp_enabled ? "green" : "orange"}>
          {r.totp_enabled ? "Kurulu" : "Kurulmadı"}
        </StatusPill>
      ),
    },
    {
      key: "is_active",
      header: "Durum",
      width: "110px",
      sort: (r) => (r.is_active ? 1 : 0),
      cell: (r) => (
        <StatusPill size="sm" tone={r.is_active ? "green" : "gray"}>
          {r.is_active ? "Aktif" : "Pasif"}
        </StatusPill>
      ),
    },
    {
      key: "last_login_at",
      header: "Son giriş",
      width: "140px",
      sort: (r) => (r.last_login_at ? new Date(r.last_login_at).getTime() : null),
      cell: (r) => <span className="text-[12px] text-ink-2">{relative(r.last_login_at)}</span>,
    },
  ];

  return (
    <Page
      title="Kullanıcılar"
      description="Panel hesapları, yetkileri ve oturumları."
      intro={{
        storageKey: "kullanicilar",
        what: "Panele erişebilen hesaplar. **Açık kayıt yoktur** — hesaplar yalnızca buradan oluşturulur ve iki adımlı doğrulama zorunludur.",
        how: "**Yönetici** her şeyi yapabilir: kullanıcı yönetimi, ayarlar, entegrasyonlar, acil durdurma.\n**İşlemci** bot ve strateji yönetir, işlem açar; yönetim sayfalarını göremez.\n**İzleyici** yalnızca görüntüler, hiçbir şeyi değiştiremez.",
        action: "Bir hesabın şüpheli kullanıldığını düşünüyorsanız oturumlarını iptal edin; kullanıcı yeniden giriş yapmak zorunda kalır. İki adımlı doğrulamayı sıfırlamak, kullanıcının telefonunu kaybettiği durumlar içindir.",
        terms: ["rol", "denetim_kaydi"],
      }}
      actions={
        <Button size="sm" variant="amber" shape="rect" onClick={() => setCreateOpen(true)}>
          Yeni kullanıcı
        </Button>
      }
    >
      <Section padded={false}>
        <Async
          query={query}
          empty={{ title: "Kullanıcı yok", description: "Henüz hiç hesap oluşturulmamış." }}
        >
          {(rows) => (
            <DataTable
              rows={rows}
              columns={columns}
              rowKey={(r) => r.id}
              onRowClick={setSelected}
              searchText={(r) => `${r.display_name} ${r.email} ${r.role}`}
              searchPlaceholder="Ad ya da e-posta ara…"
              defaultSort={{ key: "display_name", dir: "asc" }}
            />
          )}
        </Async>
      </Section>

      <Section title="Yetkiler ne anlama geliyor">
        <div className="grid gap-3 md:grid-cols-3">
          {ROLES.map((r) => (
            <div key={r} className="rounded-lg border border-line px-3.5 py-3">
              <div className="mb-1 text-[13px] font-medium text-ink">{ROLE_LABEL[r]}</div>
              <p className="text-[12.5px] leading-relaxed text-ink-2">{ROLE_HINT[r]}</p>
            </div>
          ))}
        </div>
      </Section>

      {selected && <UserDrawer user={selected} onClose={() => setSelected(null)} />}
      {createOpen && <CreateUserModal onClose={() => setCreateOpen(false)} />}
    </Page>
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
    onError: (e: Error) => toast.error("Güncellenemedi", e.message),
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
    onError: (e: Error) => toast.error("Sıfırlanamadı", e.message),
  });

  const revoke = useMutation({
    mutationFn: () => api.post(`/users/${user.id}/revoke-sessions`),
    onSuccess: () => {
      toast.success("Oturumlar iptal edildi", "Kullanıcı yeniden giriş yapmak zorunda.");
      invalidate();
    },
    onError: (e: Error) => toast.error("İptal edilemedi", e.message),
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
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="ghost" shape="rect" onClick={onClose}>
            Vazgeç
          </Button>
          <Button
            size="sm"
            variant="amber"
            shape="rect"
            disabled={save.isPending}
            onClick={() => save.mutate()}
          >
            Kaydet
          </Button>
        </div>
      }
    >
      <DrawerSection title="Hesap bilgileri">
        <div className="space-y-3">
          <label className="block">
            <span className="text-[12px] font-medium text-ink-2">Görünen ad</span>
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="mt-1 h-9 w-full rounded-lg border border-line bg-inset px-2.5 text-[13px] text-ink focus:border-brand focus:outline-none"
            />
          </label>

          <label className="block">
            <span className="flex items-center gap-1 text-[12px] font-medium text-ink-2">
              Yetki
              <InfoDot id="rol" align="start" />
            </span>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
              className="mt-1 h-9 w-full rounded-lg border border-line bg-inset px-2.5 text-[13px] text-ink focus:border-brand focus:outline-none"
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]}
                </option>
              ))}
            </select>
            <span className="mt-1 block text-[11.5px] leading-relaxed text-ink-3">
              {ROLE_HINT[role]}
            </span>
          </label>

          <label className="flex items-center gap-2 text-[12.5px] text-ink">
            <input
              type="checkbox"
              checked={isActive}
              disabled={isSelf}
              onChange={(e) => setIsActive(e.target.checked)}
              className="accent-[var(--brand)]"
            />
            Hesap aktif
            {isSelf && (
              <span className="text-[11.5px] text-ink-3">
                (kendi hesabınızı pasife alamazsınız)
              </span>
            )}
          </label>

          <label className="block">
            <span className="text-[12px] font-medium text-ink-2">Yeni parola</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Değiştirmeyecekseniz boş bırakın"
              className="mt-1 h-9 w-full rounded-lg border border-line bg-inset px-2.5 text-[13px] text-ink placeholder:text-ink-3 focus:border-brand focus:outline-none"
            />
          </label>
        </div>
      </DrawerSection>

      <DrawerSection
        title="Güvenlik işlemleri"
        description="Bu işlemler anında etkili olur ve denetim kaydına yazılır."
      >
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3 rounded-lg border border-line px-3.5 py-2.5">
            <div className="min-w-0">
              <div className="text-[12.5px] text-ink">İki adımlı doğrulamayı sıfırla</div>
              <p className="text-[11.5px] leading-snug text-ink-2">
                Kullanıcı telefonunu kaybettiyse kullanın. Bir sonraki girişinde yeniden kurulum
                yapar.
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              shape="rect"
              disabled={reset2fa.isPending}
              onClick={() => reset2fa.mutate()}
            >
              Sıfırla
            </Button>
          </div>

          <div className="flex items-center justify-between gap-3 rounded-lg border border-line px-3.5 py-2.5">
            <div className="min-w-0">
              <div className="text-[12.5px] text-ink">Tüm oturumları iptal et</div>
              <p className="text-[11.5px] leading-snug text-ink-2">
                Açık tüm oturumlar kapanır; kullanıcı yeniden giriş yapmak zorunda kalır.
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              shape="rect"
              disabled={revoke.isPending}
              onClick={() => revoke.mutate()}
            >
              İptal et
            </Button>
          </div>
        </div>
      </DrawerSection>

      <DrawerSection title="Künye">
        <div className="divide-y divide-line rounded-lg border border-line px-3.5">
          <Field label="Kullanıcı no" value={`#${user.id}`} />
          <Field label="Oluşturulma" value={dateTime(user.created_at)} />
          <Field label="Son giriş" value={dateTime(user.last_login_at)} />
          <Field
            label="İki adımlı doğrulama"
            value={user.totp_enabled ? "Kurulu" : "Kurulmadı"}
          />
        </div>
      </DrawerSection>
    </Drawer>
  );
}

/* ------------------------------------------------------------------ */

function CreateUserModal({ onClose }: { onClose: () => void }) {
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
      toast.success(
        "Kullanıcı oluşturuldu",
        "İlk girişinde iki adımlı doğrulama kurulumu yapacak.",
      );
      void qc.invalidateQueries({ queryKey: ["users"] });
      onClose();
    },
    onError: (e: Error) => toast.error("Oluşturulamadı", e.message),
  });

  const valid = email.includes("@") && password.length >= 8;

  return (
    <Modal open onClose={onClose} label="Yeni kullanıcı" width="max-w-md">
      <div className="p-5">
        <h2 className="text-[15px] font-semibold text-ink">Yeni kullanıcı</h2>
        <p className="mt-1 text-[12.5px] leading-relaxed text-ink-2">
          Hesap oluşturulduktan sonra kullanıcı ilk girişinde iki adımlı doğrulama kurulumunu
          tamamlar. Bu adım atlanamaz.
        </p>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (valid) create.mutate();
          }}
          className="mt-4 space-y-3.5"
        >
          <label className="block">
            <span className="text-[12px] font-medium text-ink-2">E-posta</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoFocus
              className="mt-1 h-9 w-full rounded-lg border border-line bg-inset px-2.5 text-[13px] text-ink focus:border-brand focus:outline-none"
            />
          </label>

          <label className="block">
            <span className="text-[12px] font-medium text-ink-2">Görünen ad</span>
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Boş bırakılırsa e-postadan türetilir"
              className="mt-1 h-9 w-full rounded-lg border border-line bg-inset px-2.5 text-[13px] text-ink placeholder:text-ink-3 focus:border-brand focus:outline-none"
            />
          </label>

          <label className="block">
            <span className="text-[12px] font-medium text-ink-2">Geçici parola</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 h-9 w-full rounded-lg border border-line bg-inset px-2.5 text-[13px] text-ink focus:border-brand focus:outline-none"
            />
            <span className="mt-1 block text-[11.5px] text-ink-3">
              En az 8 karakter. Kullanıcıya güvenli bir kanaldan iletin.
            </span>
          </label>

          <label className="block">
            <span className="flex items-center gap-1 text-[12px] font-medium text-ink-2">
              Yetki
              <InfoDot id="rol" align="start" />
            </span>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
              className="mt-1 h-9 w-full rounded-lg border border-line bg-inset px-2.5 text-[13px] text-ink focus:border-brand focus:outline-none"
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]}
                </option>
              ))}
            </select>
            <span className="mt-1 block text-[11.5px] leading-relaxed text-ink-3">
              {ROLE_HINT[role]}
            </span>
          </label>

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" size="sm" variant="ghost" shape="rect" onClick={onClose}>
              Vazgeç
            </Button>
            <Button
              type="submit"
              size="sm"
              variant="amber"
              shape="rect"
              disabled={!valid || create.isPending}
            >
              Oluştur
            </Button>
          </div>
        </form>
      </div>
    </Modal>
  );
}
