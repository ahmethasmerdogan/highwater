"use client";

/**
 * Sohbet — ekip içi mesajlaşma. Yardımcı bir araç; iki ledger bloğu:
 * odalar ve akış. Mantık değişmedi (v3 yalnız görünüm).
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Checkbox, Field as UiField } from "uicean";
import { api, type ChatMessage, type ChatRoom, type User } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useLiveChannel } from "@/lib/ws";
import { toast } from "@/lib/toast";
import { dateTime, num, time } from "@/lib/format";
import { Page } from "@/shell/page";
import { Button, Empty, Modal, NumText, Panel, TextInput } from "@/design";
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

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages.data]);

  const ordered = useMemo(
    () => [...(messages.data ?? [])].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()),
    [messages.data],
  );

  const activeRoom = rooms.data?.find((room) => room.id === roomId);

  return (
    <Page
      title="Sohbet"
      summary="Panele erişimi olan kullanıcılar arasında birebir ve grup mesajlaşması."
      actions={<Button size="sm" variant="neutral" onClick={() => setCreateOpen(true)}>Yeni oda</Button>}
    >
      {rooms.isError ? (
        <ErrorBox message={rooms.error instanceof Error ? rooms.error.message : "Odalar getirilemedi."} />
      ) : (rooms.data ?? []).length === 0 ? (
        <Panel padded={false}>
          <Empty
            title="Hiç sohbet odası yok"
            hint="Bir oda açıp ekip arkadaşlarınızı ekleyin."
            action={<Button size="sm" variant="primary" onClick={() => setCreateOpen(true)}>İlk odayı aç</Button>}
          />
        </Panel>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[240px_1fr]">
          <Panel title="Odalar" padded={false}>
            <ul>
              {(rooms.data ?? []).map((room) => {
                const active = room.id === roomId;
                return (
                  <li key={room.id} className="border-b border-line last:border-0">
                    <button
                      type="button"
                      onClick={() => setRoomId(room.id)}
                      className={cx(
                        "flex w-full items-center gap-2 px-5 py-2.5 text-left text-[13px]",
                        active ? "bg-brand-soft/60 font-medium text-ink" : "text-ink-2 hover:bg-inset/60",
                      )}
                    >
                      <span className="min-w-0 flex-1 truncate">{room.name}</span>
                      {room.unread > 0 && <NumText text={num(room.unread, 0)} size="xs" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          </Panel>

          <Panel
            title={activeRoom?.name ?? "—"}
            description={activeRoom ? <><NumText text={num(activeRoom.members.length, 0)} size="sm" /> kişi</> : undefined}
            padded={false}
            footer={
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  if (draft.trim()) send.mutate(draft.trim());
                }}
                className="flex items-center gap-2"
              >
                <TextInput value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Mesaj yazın…" disabled={roomId === null} />
                <Button type="submit" size="sm" variant="primary" disabled={!draft.trim() || send.isPending}>Gönder</Button>
              </form>
            }
          >
            <div className="scroll-thin flex h-[calc(100vh-22rem)] min-h-80 flex-col gap-2 overflow-y-auto px-5 py-3">
              {ordered.length === 0 ? (
                <p className="py-8 text-center text-[13px] text-ink-3">Bu odada henüz mesaj yok. İlk mesajı siz yazın.</p>
              ) : (
                ordered.map((message) => {
                  const mine = message.user_id === user?.id;
                  return (
                    <div key={message.id} className={cx("flex", mine ? "justify-end" : "justify-start")}>
                      <div className={cx("max-w-[72%] rounded-xl px-3 py-2", mine ? "bg-brand-soft/60" : "bg-inset")}>
                        <div className="break-words text-[13px] leading-[1.5] text-ink">{message.body}</div>
                        <div className="mt-0.5 flex items-center gap-1 text-[11px] text-ink-3" title={dateTime(message.created_at)}>
                          {mine ? "siz" : <NumText text={`#${message.user_id ?? "?"}`} size="xs" />} · <NumText text={time(message.created_at)} size="xs" />
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={endRef} />
            </div>
          </Panel>
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

  /* Kullanıcı listesi yalnızca yöneticiye açık; diğerleri odayı adıyla kurar. */
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
          <Button variant="quiet" onClick={onClose}>Vazgeç</Button>
          <Button variant="primary" disabled={!name.trim() || create.isPending} onClick={() => create.mutate()}>Oluştur</Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <UiField label="Oda adı" required>
          {(p) => <TextInput {...p} value={name} onChange={(event) => setName(event.target.value)} autoFocus />}
        </UiField>

        {can() && (users.data ?? []).length > 0 && (
          <UiField label="Katılacaklar">
            {() => (
              <div className="scroll-thin flex max-h-40 flex-col gap-1.5 overflow-y-auto rounded-xl border border-line p-2">
                {(users.data ?? []).map((member) => (
                  <label key={member.id} className="flex cursor-pointer items-center gap-2 text-[12.5px] text-ink">
                    <Checkbox
                      checked={members.includes(member.id)}
                      label={member.display_name || member.email}
                      onChange={(checked) =>
                        setMembers((previous) => (checked ? [...previous, member.id] : previous.filter((id) => id !== member.id)))
                      }
                    />
                    {member.display_name || member.email}
                  </label>
                ))}
              </div>
            )}
          </UiField>
        )}
      </div>
    </Modal>
  );
}
