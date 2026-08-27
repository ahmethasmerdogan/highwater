"use client";

/**
 * Sohbet — ekip içi mesajlaşma.
 *
 * Basit tutuldu: oda listesi, mesaj akışı, gönderme. Bir işlem panelinde
 * sohbet yardımcı bir araçtır; asıl işi yapan yer değildir.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type ChatMessage, type ChatRoom, type User } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useLiveChannel } from "@/lib/ws";
import { toast } from "@/lib/toast";
import { dateTime, time } from "@/lib/format";
import { Page } from "@/shell/page";
import { Button, Empty, FormField, Modal, TextInput } from "@/design";
import { ErrorBox } from "@/design/state";
import { cx } from "@/design/cx";

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
    onError: (error: Error) => toast.error("Mesaj gönderilemedi", error.message),
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

  const activeRoom = rooms.data?.find((room) => room.id === roomId);

  return (
    <Page
      title="Sohbet"
      summary="Panele erişimi olan kullanıcılar arasında birebir ve grup mesajlaşması."
      actions={
        <Button size="sm" variant="neutral" onClick={() => setCreateOpen(true)}>
          Yeni oda
        </Button>
      }
    >
      {rooms.isError ? (
        /* Boş liste ile ulaşılamayan API aynı şey değil: biri "oda yok",
           öteki "bilmiyoruz" der. */
        <ErrorBox
          message={rooms.error instanceof Error ? rooms.error.message : "Odalar getirilemedi."}
        />
      ) : (rooms.data ?? []).length === 0 ? (
        <div
          className="rounded-[var(--sn-r-md)]"
          style={{ background: "var(--sn-panel)", border: "1px solid var(--sn-hairline)" }}
        >
          <Empty
            title="Hiç sohbet odası yok"
            hint="Bir oda açıp ekip arkadaşlarınızı ekleyin."
            action={
              <Button size="sm" variant="primary" onClick={() => setCreateOpen(true)}>
                İlk odayı aç
              </Button>
            }
          />
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
          <div
            className="rounded-[var(--sn-r-md)] p-1.5"
            style={{ background: "var(--sn-panel)", border: "1px solid var(--sn-hairline)" }}
          >
            {(rooms.data ?? []).map((room) => {
              const active = room.id === roomId;
              return (
                <button
                  key={room.id}
                  type="button"
                  onClick={() => setRoomId(room.id)}
                  className={cx(
                    "sn-focus flex w-full items-center gap-2 rounded-[var(--sn-r-sm)] px-2.5 py-2 text-left",
                    "transition-colors duration-[var(--sn-dur-1)]",
                    !active && "hover:bg-[var(--sn-sunken)]",
                  )}
                  style={{
                    background: active ? "var(--sn-brand-bg)" : undefined,
                    color: active ? "var(--sn-brand)" : "var(--sn-ink-2)",
                    fontSize: "var(--sn-t-body)",
                  }}
                >
                  <span className="min-w-0 flex-1 truncate">{room.name}</span>
                  {room.unread > 0 && (
                    <span
                      className="sn-num rounded-full px-1.5 font-semibold"
                      style={{
                        background: "var(--sn-brand-solid)",
                        color: "var(--sn-on-brand)",
                        fontSize: 10,
                      }}
                    >
                      {room.unread}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div
            className="flex h-[calc(100vh-16rem)] min-h-96 flex-col overflow-hidden rounded-[var(--sn-r-md)]"
            style={{ background: "var(--sn-panel)", border: "1px solid var(--sn-hairline)" }}
          >
            <div className="px-4 py-2.5" style={{ borderBottom: "1px solid var(--sn-hairline)" }}>
              <div
                className="font-medium"
                style={{ fontSize: "var(--sn-t-body-lg)", color: "var(--sn-ink)" }}
              >
                {activeRoom?.name ?? "—"}
              </div>
              <div style={{ fontSize: "var(--sn-t-caption)", color: "var(--sn-ink-3)" }}>
                {activeRoom ? `${activeRoom.members.length} kişi` : ""}
              </div>
            </div>

            <div className="sn-scroll flex flex-1 flex-col gap-2 overflow-y-auto px-4 py-3">
              {ordered.length === 0 ? (
                <p
                  className="py-8 text-center"
                  style={{ fontSize: "var(--sn-t-body)", color: "var(--sn-ink-3)" }}
                >
                  Bu odada henüz mesaj yok. İlk mesajı siz yazın.
                </p>
              ) : (
                ordered.map((message) => {
                  const mine = message.user_id === user?.id;
                  return (
                    <div key={message.id} className={cx("flex", mine ? "justify-end" : "justify-start")}>
                      <div
                        className="max-w-[72%] rounded-[var(--sn-r-sm)] px-3 py-2"
                        style={{ background: mine ? "var(--sn-brand-bg)" : "var(--sn-sunken)" }}
                      >
                        <div
                          className="break-words"
                          style={{ fontSize: "var(--sn-t-body)", color: "var(--sn-ink)", lineHeight: 1.5 }}
                        >
                          {message.body}
                        </div>
                        <div
                          className="mt-0.5"
                          title={dateTime(message.created_at)}
                          style={{ fontSize: 10, color: "var(--sn-ink-3)" }}
                        >
                          {mine ? "siz" : `#${message.user_id ?? "?"}`} · {time(message.created_at)}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={endRef} />
            </div>

            <form
              onSubmit={(event) => {
                event.preventDefault();
                if (draft.trim()) send.mutate(draft.trim());
              }}
              className="flex items-center gap-2 px-3 py-2.5"
              style={{ borderTop: "1px solid var(--sn-hairline)" }}
            >
              <TextInput
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="Mesaj yazın…"
                disabled={roomId === null}
              />
              <Button
                type="submit"
                size="sm"
                variant="primary"
                disabled={!draft.trim() || send.isPending}
              >
                Gönder
              </Button>
            </form>
          </div>
        </div>
      )}

      <CreateRoomModal open={createOpen} onClose={() => setCreateOpen(false)} />
    </Page>
  );
}

/* ------------------------------------------------------------------ */

function CreateRoomModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const { can } = useAuth();
  const [name, setName] = useState("");
  const [members, setMembers] = useState<number[]>([]);

  /* Kullanıcı listesi yalnızca yöneticiye açık; diğerleri odayı adıyla kurar
     ve üyeleri sonradan yönetici ekler. */
  const users = useQuery({
    queryKey: ["users"],
    queryFn: () => api.get<User[]>("/users"),
    enabled: can() && open,
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
    onError: (error: Error) => toast.error("Oda oluşturulamadı", error.message),
  });

  return (
    <Modal
      open={open}
      onOpenChange={(next) => !next && onClose()}
      title="Yeni sohbet odası"
      footer={
        <>
          <Button variant="quiet" onClick={onClose}>
            Vazgeç
          </Button>
          <Button
            variant="primary"
            disabled={!name.trim() || create.isPending}
            onClick={() => create.mutate()}
          >
            Oluştur
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3.5">
        <FormField label="Oda adı">
          <TextInput value={name} onChange={(event) => setName(event.target.value)} autoFocus />
        </FormField>

        {can() && (users.data ?? []).length > 0 && (
          <FormField label="Katılacaklar">
            <div
              className="sn-scroll flex max-h-40 flex-col gap-1 overflow-y-auto rounded-[var(--sn-r-sm)] p-2"
              style={{ border: "1px solid var(--sn-border)" }}
            >
              {(users.data ?? []).map((member) => (
                <label
                  key={member.id}
                  className="flex cursor-pointer items-center gap-2"
                  style={{ fontSize: "var(--sn-t-caption)", color: "var(--sn-ink)" }}
                >
                  <input
                    type="checkbox"
                    checked={members.includes(member.id)}
                    onChange={(event) =>
                      setMembers((previous) =>
                        event.target.checked
                          ? [...previous, member.id]
                          : previous.filter((id) => id !== member.id),
                      )
                    }
                    className="accent-[var(--sn-brand-solid)]"
                  />
                  {member.display_name || member.email}
                </label>
              ))}
            </div>
          </FormField>
        )}
      </div>
    </Modal>
  );
}
