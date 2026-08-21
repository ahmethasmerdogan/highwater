"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { api, tokens, websocketUrl } from "@/lib/api";
import { useAuth } from "@/lib/auth";

/**
 * WebSocket köprüsü.
 *
 * DESIGN §3: "WebSocket kopunca üst çubuk kehribar bir şeride döner ve
 * 'canlı veri kesildi · yeniden bağlanılıyor' yazar. **Sessizce eski veriyi
 * göstermek yasaktır.**"
 */

export type ConnectionState = "connecting" | "open" | "reconnecting" | "closed";

export interface LiveEvent {
  kind: string;
  payload: Record<string, unknown> & { message?: string };
  level: string;
  bot_id: number | null;
  symbol: string | null;
  at: string;
}

interface Envelope {
  channel: string;
  event?: LiveEvent;
  events?: LiveEvent[];
}

interface WsState {
  state: ConnectionState;
  /** Son 500 olay, en yenisi başta. */
  events: LiveEvent[];
  /** Belirli bir kanalı dinlemek isteyen bileşenler için. */
  subscribe: (handler: (channel: string, event: LiveEvent) => void) => () => void;
  lastMessageAt: number | null;
}

const WsContext = createContext<WsState | null>(null);

const MAX_EVENTS = 500;
const MAX_BACKOFF_MS = 30_000;

export function WebSocketProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [state, setState] = useState<ConnectionState>("connecting");
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const [lastMessageAt, setLastMessageAt] = useState<number | null>(null);

  const socketRef = useRef<WebSocket | null>(null);
  const backoffRef = useRef(1000);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handlersRef = useRef(new Set<(channel: string, event: LiveEvent) => void>());
  const closedRef = useRef(false);

  const push = useCallback((incoming: LiveEvent[]) => {
    if (incoming.length === 0) return;
    setEvents((previous) => [...incoming, ...previous].slice(0, MAX_EVENTS));
    setLastMessageAt(Date.now());
  }, []);

  /*
   * Bağlantı, erişim jetonuyla değil **tek kullanımlık biletle** kurulur.
   *
   * Tarayıcı WebSocket el sıkışmasında başlık gönderemez, dolayısıyla kimlik
   * sorgu dizgesinden geçmek zorunda — ve sorgu dizgeleri loglara düşer.
   * Ölçüldü: panel proxy'si hata verdiğinde `?token=eyJ...` satırın tamamıyla
   * journal'a yazılıyor, yani 30 dakikalık tam yetkili bir jeton düz metin
   * olarak duruyordu. Bilet 30 saniye yaşar ve sunucuda bir kez harcanır.
   */
  const connect = useCallback(async () => {
    if (!tokens.access() || closedRef.current) return;

    let ticket: string;
    try {
      ticket = (await api.post<{ ticket: string }>("/auth/ws-ticket")).ticket;
    } catch {
      // Bilet alınamadı (ağ, oturum). Yeniden bağlanma zamanlayıcısı devrede.
      if (closedRef.current) return;
      setState("reconnecting");
      timerRef.current = setTimeout(connect, backoffRef.current);
      backoffRef.current = Math.min(backoffRef.current * 2, MAX_BACKOFF_MS);
      return;
    }
    if (closedRef.current) return;

    const url = websocketUrl("/ws", { ticket });
    const socket = new WebSocket(url);
    socketRef.current = socket;

    socket.onopen = () => {
      backoffRef.current = 1000;
      setState("open");
    };

    socket.onmessage = (message) => {
      try {
        const envelope = JSON.parse(message.data as string) as Envelope;
        if (envelope.channel === "pong") return;
        if (envelope.channel === "history" && envelope.events) {
          push([...envelope.events].reverse());
          return;
        }
        if (envelope.event) {
          push([envelope.event]);
          handlersRef.current.forEach((handler) => handler(envelope.channel, envelope.event!));
        }
      } catch {
        /* bozuk çerçeveyi sessizce atla */
      }
    };

    socket.onclose = () => {
      if (closedRef.current) return;
      setState("reconnecting");
      timerRef.current = setTimeout(connect, backoffRef.current);
      backoffRef.current = Math.min(backoffRef.current * 2, MAX_BACKOFF_MS);
    };

    socket.onerror = () => socket.close();
  }, [push]);

  /*
   * `user?.id` bağımlılıkta olmak zorunda.
   *
   * Sağlayıcı giriş ekranında da kurulu; o anda jeton yok, `connect()`
   * bağlanmadan çıkıyor ve **hiçbir yeniden deneme planlamıyor**. Giriş
   * tamamlandığında yönlendirme istemci tarafında olduğu için sağlayıcı
   * yeniden kurulmuyordu; sonuç olarak kullanıcı sayfayı elle yenileyene
   * kadar canlı veri akmıyordu. Kimlik değiştiğinde yeniden bağlanıyoruz.
   */
  useEffect(() => {
    closedRef.current = false;
    backoffRef.current = 1000;
    connect();
    return () => {
      closedRef.current = true;
      if (timerRef.current) clearTimeout(timerRef.current);
      socketRef.current?.close();
      setState("closed");
    };
  }, [connect, user?.id]);

  const subscribe = useCallback((handler: (channel: string, event: LiveEvent) => void) => {
    handlersRef.current.add(handler);
    return () => {
      handlersRef.current.delete(handler);
    };
  }, []);

  const value = useMemo(
    () => ({ state, events, subscribe, lastMessageAt }),
    [state, events, subscribe, lastMessageAt],
  );

  return <WsContext.Provider value={value}>{children}</WsContext.Provider>;
}

export function useLive(): WsState {
  const context = useContext(WsContext);
  if (!context) {
    return {
      state: "closed",
      events: [],
      subscribe: () => () => {},
      lastMessageAt: null,
    };
  }
  return context;
}

/** Belirli kanalları dinleyip bir geri çağrı çalıştırır (ör. tabloyu tazele). */
export function useLiveChannel(
  channels: string[],
  handler: (event: LiveEvent) => void,
): void {
  const { subscribe } = useLive();
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    return subscribe((channel, event) => {
      if (channels.includes(channel)) handlerRef.current(event);
    });
  }, [channels, subscribe]);
}
