/**
 * WebSocket chat server — the WhatsApp-style delivery model discussed for
 * this feature: a message is stored just long enough to reach the other
 * device, then deleted. There is no permanent chat history on the server;
 * each app keeps its own copy locally (see apps/runner's lib/chatDb.ts).
 *
 * Attach with attachChatServer(httpServer) once, alongside Express — see
 * server.ts. Runs on the same port, path /ws/chat.
 *
 * --- Protocol ---
 * Connect to `${WS_URL}/ws/chat?token=<jwt>&errandId=<uuid>`. The token is
 * the same requester/runner auth JWT used for REST calls. A known,
 * pragmatic trade-off: putting it in the query string means it can end up
 * in server access logs, unlike an Authorization header — fine for an
 * MVP over TLS, but worth revisiting (e.g. a short-lived one-time ticket
 * fetched over a normal authenticated REST call first) before this goes
 * to real production traffic.
 *
 * The connection is rejected (closed immediately) unless: the token is
 * valid, the errand exists, the token's owner is a party to it (the
 * requester, or the accepted runner), and the errand is in a status where
 * chat makes sense (accepted through delivered — not before a runner's
 * assigned, not after cancellation).
 *
 * Client -> server messages (JSON):
 *   { type: "message", content: string }
 *     Sends a new message as this connection's role. Server persists it,
 *     and replies to the SENDER with { type: "stored", id, createdAt } so
 *     they can reconcile their optimistic local copy. If the recipient is
 *     currently connected to the same errand's room, the server also
 *     immediately forwards it to them as a "message" event (below).
 *     An optional clientId (any string the client makes up) is echoed
 *     back verbatim in the "stored" reply — since responses aren't
 *     strictly guaranteed to resolve in send order if a client fires off
 *     several messages back-to-back, this lets the client match a
 *     "stored" reply to the specific send that triggered it without
 *     relying on ordering.
 *   { type: "ack", id: string }
 *     "I received and persisted this message locally" — only valid for a
 *     message sent by the *other* party. Deletes the row server-side.
 *
 * Server -> client messages (JSON):
 *   { type: "message", id, errandId, senderRole, senderId, content, createdAt }
 *     A message from the other party — sent live on arrival, or flushed
 *     from the queue on connect if it arrived while this device was away.
 *   { type: "stored", id, createdAt, clientId? }
 *     Acknowledges a message this connection just sent.
 *   { type: "error", message }
 *     Something about the last client message was invalid; connection
 *     stays open.
 */
import type { Server as HttpServer } from "node:http";
import type { IncomingMessage } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client";
import { chatMessages, errands } from "../db/schema";
import { verifyAuthToken } from "./jwt";

const CHAT_ALLOWED_STATUSES = new Set(["accepted", "en_route_to_pickup", "in_progress", "en_route_to_delivery", "delivered"]);

const clientMessageSchema = z.union([
  z.object({ type: z.literal("message"), content: z.string().trim().min(1).max(2000), clientId: z.string().optional() }),
  z.object({ type: z.literal("ack"), id: z.string().uuid() }),
]);

interface Connection {
  ws: WebSocket;
  role: "requester" | "runner";
  userId: string;
  errandId: string;
}

// errandId -> role -> Connection. At most one live connection per
// role per errand — a reconnect (new tab/app restart) replaces the old
// one rather than stacking up dead sockets.
const rooms = new Map<string, Partial<Record<"requester" | "runner", Connection>>>();

function joinRoom(conn: Connection) {
  let room = rooms.get(conn.errandId);
  if (!room) {
    room = {};
    rooms.set(conn.errandId, room);
  }
  // A previous connection for the same role that's still technically open
  // (e.g. the app was killed without a clean close) loses its slot to the
  // new one — it'll get a close frame if it's still alive, harmlessly.
  const existing = room[conn.role];
  if (existing && existing.ws !== conn.ws) existing.ws.close(4000, "Replaced by a new connection");
  room[conn.role] = conn;
}

function leaveRoom(conn: Connection) {
  const room = rooms.get(conn.errandId);
  if (!room) return;
  if (room[conn.role]?.ws === conn.ws) delete room[conn.role];
  if (!room.requester && !room.runner) rooms.delete(conn.errandId);
}

function otherRole(role: "requester" | "runner"): "requester" | "runner" {
  return role === "requester" ? "runner" : "requester";
}

function send(ws: WebSocket, payload: unknown) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload));
}

/** Sends every message still queued for `conn` (i.e. sent by the other
 * party while this device wasn't connected) — called right after a
 * successful join, mirroring what happens when WhatsApp reconnects. */
async function flushQueuedMessages(conn: Connection) {
  const rows = await db
    .select()
    .from(chatMessages)
    .where(and(eq(chatMessages.errandId, conn.errandId), ne(chatMessages.senderRole, conn.role)))
    .orderBy(chatMessages.createdAt);

  for (const row of rows) {
    send(conn.ws, {
      type: "message",
      id: row.id,
      errandId: row.errandId,
      senderRole: row.senderRole,
      senderId: row.senderId,
      content: row.content,
      createdAt: row.createdAt.toISOString(),
    });
  }
}

async function handleClientMessage(conn: Connection, raw: unknown) {
  const parsed = clientMessageSchema.safeParse(raw);
  if (!parsed.success) {
    send(conn.ws, { type: "error", message: "Malformed message" });
    return;
  }
  const data = parsed.data;

  if (data.type === "ack") {
    // Only the recipient of a message can ack it — you can't have the
    // sender's own client accidentally delete something it just sent
    // before the real recipient ever saw it.
    await db
      .delete(chatMessages)
      .where(
        and(
          eq(chatMessages.id, data.id),
          eq(chatMessages.errandId, conn.errandId),
          ne(chatMessages.senderRole, conn.role)
        )
      );
    return;
  }

  // data.type === "message"
  const [row] = await db
    .insert(chatMessages)
    .values({
      errandId: conn.errandId,
      senderRole: conn.role,
      senderId: conn.userId,
      content: data.content,
    })
    .returning();

  send(conn.ws, { type: "stored", id: row.id, createdAt: row.createdAt.toISOString(), clientId: data.clientId });

  const room = rooms.get(conn.errandId);
  const recipient = room?.[otherRole(conn.role)];
  if (recipient) {
    send(recipient.ws, {
      type: "message",
      id: row.id,
      errandId: row.errandId,
      senderRole: row.senderRole,
      senderId: row.senderId,
      content: row.content,
      createdAt: row.createdAt.toISOString(),
    });
  }
  // If the recipient isn't connected right now, the row just stays in
  // chat_messages — flushQueuedMessages delivers it next time they join.
}

async function authenticateConnection(req: IncomingMessage): Promise<Connection | { error: string }> {
  const url = new URL(req.url ?? "", "http://localhost");
  const token = url.searchParams.get("token");
  const errandId = url.searchParams.get("errandId");
  if (!token || !errandId) return { error: "Missing token or errandId" };

  let payload: { sub: string; role: "requester" | "runner" };
  try {
    payload = verifyAuthToken(token);
  } catch {
    return { error: "Invalid or expired token" };
  }

  const [errand] = await db.select().from(errands).where(eq(errands.id, errandId)).limit(1);
  if (!errand) return { error: "Errand not found" };

  const isParty =
    (payload.role === "requester" && errand.requesterId === payload.sub) ||
    (payload.role === "runner" && errand.runnerId === payload.sub);
  if (!isParty) return { error: "Not a party to this errand" };

  if (!CHAT_ALLOWED_STATUSES.has(errand.status)) {
    return { error: "Chat isn't available for this errand right now" };
  }

  return { ws: undefined as unknown as WebSocket, role: payload.role, userId: payload.sub, errandId };
}

export function attachChatServer(server: HttpServer): void {
  const wss = new WebSocketServer({ server, path: "/ws/chat" });

  wss.on("connection", async (ws, req) => {
    const result = await authenticateConnection(req);
    if ("error" in result) {
      ws.close(4001, result.error);
      return;
    }

    const conn: Connection = { ...result, ws };
    joinRoom(conn);
    await flushQueuedMessages(conn);

    ws.on("message", (raw) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw.toString());
      } catch {
        send(ws, { type: "error", message: "Invalid JSON" });
        return;
      }
      handleClientMessage(conn, parsed).catch(() => {
        send(ws, { type: "error", message: "Couldn't process that message" });
      });
    });

    ws.on("close", () => leaveRoom(conn));

    // Basic liveness check — a mobile connection can go dark (backgrounded
    // app, lost signal) without ever sending a close frame. Ping every 30s
    // and drop anything that didn't pong since the last check, so a dead
    // socket doesn't sit in the room map pretending to be a valid
    // delivery target.
    let isAlive = true;
    ws.on("pong", () => {
      isAlive = true;
    });
    const interval = setInterval(() => {
      if (!isAlive) {
        ws.terminate();
        return;
      }
      isAlive = false;
      ws.ping();
    }, 30_000);
    ws.on("close", () => clearInterval(interval));
  });
}
