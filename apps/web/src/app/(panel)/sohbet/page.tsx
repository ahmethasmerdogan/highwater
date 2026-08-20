"use client";

/**
 * Sohbet — ekip içi mesajlaşma.
 *
 * Basit tutuldu: oda listesi, mesaj akışı, gönderme. Bir işlem panelinde
 * sohbet yardımcı bir araçtır; asıl işi yapan yer değildir.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Modal, cx } from "@/ui";
import { api, type ChatMessage, type ChatRoom, type User } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useLiveChannel } from "@/lib/ws";
import { toast } from "@/lib/toast";
import { Page, Empty } from "@/components/common/page";
import { dateTime, time } from "@/lib/format";

export default function ChatPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [roomId, setRoomId] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const rooms = useQuery({
    queryKey: ["chat-rooms"],
    queryFn: () => api.get<ChatRoom[]>("/chat/rooms"),
    refetchInterval: 60_000,
  });

  useEffect(() => {
    if (roomId === null && rooms.data?.length) setRoomId(rooms.data[0].id);
  }, [rooms.data, roomId]);

  const messages = useQuery({
    queryKey: ["chat-messages", roomId],
    queryFn: () => api.get<ChatMessage[]>(`/chat/rooms/${roomId}/messages`, { limit: 200 }),
    enabled: roomId !== null,
    refetchInterval: 15_000,
  });

  /* Canlı mesaj gelince akışı tazele — 15 saniye beklemek sohbeti öldürür. */
  useLiveChannel(["chat"], () => {
    void qc.invalidateQueries({ queryKey: ["chat-messages", roomId] });
    void qc.invalidateQueries({ queryKey: ["chat-rooms"] });
  });

  const send = useMutation({
    mutationFn: (body: string) => api.post(`/chat/rooms/${roomId}/messages`, { body }),
    onSuccess: () => {
      setDraft("");
      void qc.invalidateQueries({ queryKey: ["chat-messages", roomId] });
    },
    onError: (e: Error) => toast.error("Mesaj gönderilemedi", e.message),
  });

  /* Yeni mesajda en alta kaydır. */
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages.data]);

  const ordered = useMemo(
    () =>
      [...(messages.data ?? [])].sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      ),
    [messages.data],
  );

  const activeRoom = rooms.data?.find((r) => r.id === roomId);

  return (
    <Page
      title="Sohbet"
      description="Ekip içi mesajlaşma."
      intro={{
        storageKey: "sohbet",
        what: "Panele erişimi olan kullanıcılar arasında birebir ve grup mesajlaşması.",
        how: "Soldaki listeden bir oda seçin. Yeni mesaj geldiğinde akış kendiliğinden tazelenir.",
        action: "Yeni bir oda açmak için sağ üstteki düğmeyi kullanın ve katılacak kişileri seçin.",
      }}
      actions={
        <Button size="sm" variant="outline" shape="rect" onClick={() => setCreateOpen(true)}>
          Yeni oda
        </Button>
      }
    >
      {(rooms.data ?? []).length === 0 ? (
        <Empty
          title="Hiç sohbet odası yok"
          description="Bir oda açıp ekip arkadaşlarınızı ekleyin."
          action={
            <Button size="sm" variant="amber" shape="rect" onClick={() => setCreateOpen(true)}>
              İlk odayı aç
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
          {/* Oda listesi */}
          <div className="rounded-xl border border-line bg-surface p-1.5">
            {(rooms.data ?? []).map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setRoomId(r.id)}
                className={cx(
                  "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px]",
                  r.id === roomId ? "bg-inset font-medium text-ink" : "text-ink-2 hover:bg-inset",
                )}
              >
                <span className="min-w-0 flex-1 truncate">{r.name}</span>
                {r.unread > 0 && (
                  <span className="num rounded-full bg-brand px-1.5 text-[10px] font-semibold text-accent-ink">
                    {r.unread}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Mesajlar */}
          <div className="flex h-[calc(100vh-19rem)] min-h-96 flex-col overflow-hidden rounded-xl border border-line bg-surface">
            <div className="border-b border-line px-4 py-2.5">
              <div className="text-[13.5px] font-medium text-ink">
                {activeRoom?.name ?? "—"}
              </div>
              <div className="text-[11.5px] text-ink-3">
                {activeRoom ? `${activeRoom.members.length} kişi` : ""}
              </div>
            </div>

            <div className="thin-scroll flex-1 space-y-2 overflow-y-auto px-4 py-3">
              {ordered.length === 0 ? (
                <p className="py-8 text-center text-[13px] text-ink-3">
                  Bu odada henüz mesaj yok. İlk mesajı siz yazın.
                </p>
              ) : (
                ordered.map((m) => {
                  const mine = m.user_id === user?.id;
                  return (
                    <div
                      key={m.id}
                      className={cx("flex", mine ? "justify-end" : "justify-start")}
                    >
                      <div
                        className={cx(
                          "max-w-[72%] rounded-lg px-3 py-2",
                          mine ? "bg-brand-soft" : "bg-inset",
                        )}
                      >
                        <div className="text-[13px] leading-relaxed break-words text-ink">
                          {m.body}
                        </div>
                        <div
                          className="mt-0.5 text-[10.5px] text-ink-3"
                          title={dateTime(m.created_at)}
                        >
                          {mine ? "siz" : `#${m.user_id ?? "?"}`} · {time(m.created_at)}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={endRef} />
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (draft.trim()) send.mutate(draft.trim());
              }}
              className="flex items-center gap-2 border-t border-line px-3 py-2.5"
            >
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Mesaj yazın…"
                disabled={roomId === null}
                className="h-9 flex-1 rounded-lg border border-line bg-inset px-3 text-[13px] text-ink placeholder:text-ink-3 focus:border-brand focus:outline-none"
              />
              <Button
                type="submit"
                size="sm"
                variant="amber"
                shape="rect"
                disabled={!draft.trim() || send.isPending}
              >
                Gönder
              </Button>
            </form>
          </div>
        </div>
      )}

      {createOpen && <CreateRoomModal onClose={() => setCreateOpen(false)} />}
    </Page>
  );
}

/* ------------------------------------------------------------------ */

function CreateRoomModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const { can } = useAuth();
  const [name, setName] = useState("");
  const [members, setMembers] = useState<number[]>([]);

  /* Kullanıcı listesi yalnızca yöneticiye açık; diğerleri odayı adıyla kurar
     ve üyeleri sonradan yönetici ekler. */
  const users = useQuery({
    queryKey: ["users"],
    queryFn: () => api.get<User[]>("/users"),
    enabled: can(),
    retry: false,
  });

  const create = useMutation({
    mutationFn: () =>
      api.post<ChatRoom>("/chat/rooms", {
        name: name.trim(),
        kind: members.length > 1 ? "group" : "direct",
        member_ids: members,
      }),
    onSuccess: () => {
      toast.success("Oda oluşturuldu");
      void qc.invalidateQueries({ queryKey: ["chat-rooms"] });
      onClose();
    },
    onError: (e: Error) => toast.error("Oda oluşturulamadı", e.message),
  });

  return (
    <Modal open onClose={onClose} label="Yeni sohbet odası" width="max-w-md">
      <div className="p-5">
        <h2 className="text-[15px] font-semibold text-ink">Yeni sohbet odası</h2>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) create.mutate();
          }}
          className="mt-4 space-y-3.5"
        >
          <label className="block">
            <span className="text-[12px] font-medium text-ink-2">Oda adı</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              className="mt-1 h-9 w-full rounded-lg border border-line bg-inset px-2.5 text-[13px] text-ink focus:border-brand focus:outline-none"
            />
          </label>

          {can() && (users.data ?? []).length > 0 && (
            <div>
              <span className="text-[12px] font-medium text-ink-2">Katılacaklar</span>
              <div className="thin-scroll mt-1 max-h-40 space-y-1 overflow-y-auto rounded-lg border border-line p-2">
                {(users.data ?? []).map((u) => (
                  <label
                    key={u.id}
                    className="flex cursor-pointer items-center gap-2 text-[12.5px] text-ink"
                  >
                    <input
                      type="checkbox"
                      checked={members.includes(u.id)}
                      onChange={(e) =>
                        setMembers((prev) =>
                          e.target.checked
                            ? [...prev, u.id]
                            : prev.filter((id) => id !== u.id),
                        )
                      }
                      className="accent-[var(--brand)]"
                    />
                    {u.display_name || u.email}
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" size="sm" variant="ghost" shape="rect" onClick={onClose}>
              Vazgeç
            </Button>
            <Button
              type="submit"
              size="sm"
              variant="amber"
              shape="rect"
              disabled={!name.trim() || create.isPending}
            >
              Oluştur
            </Button>
          </div>
        </form>
      </div>
    </Modal>
  );
}
