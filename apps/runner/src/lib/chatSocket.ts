/**
 * Runner-side WebSocket client for apps/api's lib/chat-server.ts. Owns the
 * connection lifecycle (connect, reconnect with backoff, clean
 * disconnect), keeps the on-screen message list in sync with local SQLite
 * (see chatDb.ts — that's the real chat history; this hook's in-memory
 * state is just what's currently rendered), and handles the ack handshake
 * so the server can drop its copy of a message once this device has it.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatMessage } from "@gracerandly/shared-types";
import { API_BASE_URL } from "./apiClient";
import { getMessages, saveMessage } from "./chatDb";

export type ChatConnectionState = "connecting" | "open" | "closed";

const RECONNECT_DELAYS_MS = [1000, 2000, 4000, 8000, 10000]; // caps at 10s

function wsUrl(errandId: string, token: string): string {
  const wsBase = API_BASE_URL.replace(/^http/, "ws");
  return `${wsBase}/ws/chat?token=${encodeURIComponent(token)}&errandId=${encodeURIComponent(errandId)}`;
}

interface ServerMessage {
  type: "message" | "stored" | "error";
  id?: string;
  errandId?: string;
  senderRole?: "requester" | "runner";
  senderId?: string;
  content?: string;
  createdAt?: string;
  clientId?: string;
  message?: string;
}

export function useChat(errandId: string, token: string | null, ownUserId: string | null) {
  const [messages, setMessages] = useState<ChatMessage[]>(() => getMessages(errandId));
  const [connectionState, setConnectionState] = useState<ChatConnectionState>("connecting");

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttempt = useRef(0);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Messages sent but not yet confirmed with a "stored" reply, keyed by
  // the clientId this hook made up for them — see chat-server.ts's
  // protocol doc for why a client-supplied id is used for correlation
  // instead of relying on response order.
  const pendingSends = useRef<Map<string, { content: string }>>(new Map());
  const closedByUs = useRef(false);

  const appendMessage = useCallback((message: ChatMessage) => {
    saveMessage(message);
    setMessages((prev) => (prev.some((m) => m.id === message.id) ? prev : [...prev, message]));
  }, []);

  useEffect(() => {
    if (!token) return;
    closedByUs.current = false;

    function connect() {
      setConnectionState("connecting");
      const ws = new WebSocket(wsUrl(errandId, token!));
      wsRef.current = ws;

      ws.onopen = () => {
        reconnectAttempt.current = 0;
        setConnectionState("open");
      };

      ws.onmessage = (event) => {
        let data: ServerMessage;
        try {
          data = JSON.parse(event.data);
        } catch {
          return;
        }

        if (data.type === "message" && data.id && data.senderRole && data.senderId && data.content && data.createdAt) {
          appendMessage({
            id: data.id,
            errandId,
            senderRole: data.senderRole,
            senderId: data.senderId,
            content: data.content,
            createdAt: data.createdAt,
          });
          ws.send(JSON.stringify({ type: "ack", id: data.id }));
        } else if (data.type === "stored" && data.id && data.createdAt) {
          const pending = data.clientId ? pendingSends.current.get(data.clientId) : undefined;
          if (pending) {
            pendingSends.current.delete(data.clientId!);
            appendMessage({
              id: data.id,
              errandId,
              senderRole: "runner",
              senderId: ownUserId ?? "",
              content: pending.content,
              createdAt: data.createdAt,
            });
          }
        }
      };

      ws.onclose = () => {
        setConnectionState("closed");
        if (closedByUs.current) return;
        const delay = RECONNECT_DELAYS_MS[Math.min(reconnectAttempt.current, RECONNECT_DELAYS_MS.length - 1)];
        reconnectAttempt.current += 1;
        reconnectTimer.current = setTimeout(connect, delay);
      };

      ws.onerror = () => {
        // onclose fires right after in every browser/RN WebSocket
        // implementation — reconnect is scheduled there, not here, so
        // this is just a no-op to prevent an unhandled-error warning.
      };
    }

    connect();

    return () => {
      closedByUs.current = true;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [errandId, token, appendMessage, ownUserId]);

  const sendMessage = useCallback(
    (content: string) => {
      const trimmed = content.trim();
      if (!trimmed || wsRef.current?.readyState !== WebSocket.OPEN) return false;
      const clientId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      pendingSends.current.set(clientId, { content: trimmed });
      wsRef.current.send(JSON.stringify({ type: "message", content: trimmed, clientId }));
      return true;
    },
    []
  );

  return { messages, connectionState, sendMessage };
}
