/**
 * WebSocket client for apps/api's lib/chat-server.ts — shared shape between
 * the Runner and Requester apps (identical apart from the `role` passed in).
 *
 * Owns the connection lifecycle (connect, reconnect with backoff, clean
 * disconnect), keeps the on-screen message list in sync with local SQLite
 * (see chatDb.ts — that's the real chat history; this hook's in-memory
 * state is just what's currently rendered), handles the ack handshake so
 * the server can drop its copy of a message once this device has it, and
 * tracks call state (ringing / incoming / active) driven by the same
 * socket's call-* signaling messages.
 *
 * Calls only ring while this hook is mounted (i.e. the chat screen is
 * open) — there's no app-wide socket yet, so an app that isn't on the chat
 * screen can't be rung. Worth revisiting alongside push notifications.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { API_BASE_URL } from "./apiClient";
import { applyEdit, getMessages, saveMessage, type LocalChatMessage } from "./chatDb";

export type ChatRole = "requester" | "runner";
export type ChatConnectionState = "connecting" | "open" | "closed";
export type CallMode = "audio" | "video";
export type CallState = "idle" | "outgoing" | "incoming" | "active";

const RECONNECT_DELAYS_MS = [1000, 2000, 4000, 8000, 10000]; // caps at 10s

function wsUrl(errandId: string, token: string): string {
  const wsBase = API_BASE_URL.replace(/^http/, "ws");
  return `${wsBase}/ws/chat?token=${encodeURIComponent(token)}&errandId=${encodeURIComponent(errandId)}`;
}

interface ServerMessage {
  type: "message" | "stored" | "error" | "call-invite" | "call-accept" | "call-decline" | "call-end" | "call-unavailable";
  id?: string;
  errandId?: string;
  senderRole?: ChatRole;
  senderId?: string;
  kind?: "message" | "edit";
  contentType?: "text" | "audio";
  targetMessageId?: string;
  content?: string;
  createdAt?: string;
  clientId?: string;
  mode?: CallMode;
}

interface UseChatArgs {
  errandId: string;
  token: string | null;
  ownUserId: string | null;
  role: ChatRole;
}

export function useChat({ errandId, token, ownUserId, role }: UseChatArgs) {
  const [messages, setMessages] = useState<LocalChatMessage[]>(() => getMessages(errandId));
  const [connectionState, setConnectionState] = useState<ChatConnectionState>("connecting");
  const [callState, setCallState] = useState<CallState>("idle");
  const [callMode, setCallMode] = useState<CallMode>("audio");
  const [callUnavailable, setCallUnavailable] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttempt = useRef(0);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Sent but not yet confirmed with a "stored" reply, keyed by a
  // client-made id — see chat-server.ts's protocol doc for why a client
  // id is used instead of relying on response order.
  const pendingSends = useRef<Map<string, { content: string; contentType: "text" | "audio" }>>(new Map());
  const closedByUs = useRef(false);

  const addMessage = useCallback((message: Omit<LocalChatMessage, "kind" | "edited">) => {
    saveMessage(message);
    setMessages((prev) =>
      prev.some((m) => m.id === message.id) ? prev : [...prev, { ...message, kind: "message", edited: false }]
    );
  }, []);

  const editLocal = useCallback((targetMessageId: string, content: string) => {
    applyEdit(targetMessageId, content);
    setMessages((prev) => prev.map((m) => (m.id === targetMessageId ? { ...m, content, edited: true } : m)));
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

        switch (data.type) {
          case "message": {
            if (!data.id || !data.senderRole || !data.senderId || !data.content || !data.createdAt) return;
            if (data.kind === "edit" && data.targetMessageId) {
              editLocal(data.targetMessageId, data.content);
            } else {
              addMessage({
                id: data.id,
                errandId,
                senderRole: data.senderRole,
                senderId: data.senderId,
                contentType: data.contentType ?? "text",
                content: data.content,
                createdAt: data.createdAt,
              });
            }
            ws.send(JSON.stringify({ type: "ack", id: data.id }));
            break;
          }
          case "stored": {
            const pending = data.clientId ? pendingSends.current.get(data.clientId) : undefined;
            if (pending && data.id && data.createdAt) {
              pendingSends.current.delete(data.clientId!);
              addMessage({
                id: data.id,
                errandId,
                senderRole: role,
                senderId: ownUserId ?? "",
                contentType: pending.contentType,
                content: pending.content,
                createdAt: data.createdAt,
              });
            }
            break;
          }
          case "call-invite":
            setCallMode(data.mode ?? "audio");
            setCallState("incoming");
            break;
          case "call-accept":
            setCallState((s) => (s === "outgoing" ? "active" : s));
            break;
          case "call-decline":
          case "call-end":
            setCallState("idle");
            break;
          case "call-unavailable":
            setCallState("idle");
            setCallUnavailable(true);
            break;
        }
      };

      ws.onclose = () => {
        setConnectionState("closed");
        setCallState("idle"); // a dropped socket can't carry a call's signaling
        if (closedByUs.current) return;
        const delay = RECONNECT_DELAYS_MS[Math.min(reconnectAttempt.current, RECONNECT_DELAYS_MS.length - 1)];
        reconnectAttempt.current += 1;
        reconnectTimer.current = setTimeout(connect, delay);
      };

      ws.onerror = () => {
        // onclose fires right after — reconnect is scheduled there.
      };
    }

    connect();

    return () => {
      closedByUs.current = true;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [errandId, token, role, ownUserId, addMessage, editLocal]);

  const rawSend = useCallback((payload: unknown): boolean => {
    if (wsRef.current?.readyState !== WebSocket.OPEN) return false;
    wsRef.current.send(JSON.stringify(payload));
    return true;
  }, []);

  const sendContent = useCallback(
    (content: string, contentType: "text" | "audio") => {
      const trimmed = content.trim();
      if (!trimmed) return false;
      const clientId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      if (!rawSend({ type: "message", content: trimmed, contentType, clientId })) return false;
      pendingSends.current.set(clientId, { content: trimmed, contentType });
      return true;
    },
    [rawSend]
  );

  const sendText = useCallback((content: string) => sendContent(content, "text"), [sendContent]);
  /** `base64Audio` is the recorded voice note's file contents, base64-encoded. */
  const sendAudio = useCallback((base64Audio: string) => sendContent(base64Audio, "audio"), [sendContent]);

  /** Edits one of this user's own text messages — applied locally right
   * away, then sent so the other device can update its copy too. */
  const sendEdit = useCallback(
    (targetMessageId: string, content: string) => {
      const trimmed = content.trim();
      if (!trimmed) return false;
      if (!rawSend({ type: "edit", targetMessageId, content: trimmed })) return false;
      editLocal(targetMessageId, trimmed);
      return true;
    },
    [rawSend, editLocal]
  );

  const startCall = useCallback(
    (mode: CallMode) => {
      setCallUnavailable(false);
      if (rawSend({ type: "call-invite", mode })) {
        setCallMode(mode);
        setCallState("outgoing");
      } else {
        setCallUnavailable(true);
      }
    },
    [rawSend]
  );
  const acceptCall = useCallback(() => {
    if (rawSend({ type: "call-accept" })) setCallState("active");
  }, [rawSend]);
  const declineCall = useCallback(() => {
    rawSend({ type: "call-decline" });
    setCallState("idle");
  }, [rawSend]);
  const endCall = useCallback(() => {
    rawSend({ type: "call-end" });
    setCallState("idle");
  }, [rawSend]);
  const dismissCallUnavailable = useCallback(() => setCallUnavailable(false), []);

  return {
    messages,
    connectionState,
    sendText,
    sendAudio,
    sendEdit,
    callState,
    callMode,
    callUnavailable,
    dismissCallUnavailable,
    startCall,
    acceptCall,
    declineCall,
    endCall,
  };
}
