/**
 * WebSocket chat + call-signaling server — the WhatsApp-style delivery
 * model discussed for this feature: a message is stored just long enough
 * to reach the other device, then deleted. There is no permanent chat
 * history on the server; each app keeps its own copy locally (see
 * apps/runner and apps/requester's lib/chatDb.ts). Calls are pure live
 * signaling — see the call-* messages below — with no storage at all,
 * since a call that can't be delivered live can't be "queued" the way a
 * text message can.
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
 *   { type: "message", content: string, contentType?: "text"|"audio", clientId?: string }
 *     Sends a new message as this connection's role. contentType defaults
 *     to "text"; "audio" means content is base64-encoded audio (a voice
 *     note) rather than text. Server persists it, and replies to the
 *     SENDER with { type: "stored", id, createdAt, clientId? } so they can
 *     reconcile their optimistic local copy. If the recipient is
 *     currently connected to the same errand's room, the server also
 *     immediately forwards it to them as a "message" event (below).
 *     clientId (any string the client makes up) is echoed back verbatim
 *     in the "stored" reply — since responses aren't strictly guaranteed
 *     to resolve in send order if a client fires off several messages
 *     back-to-back, this lets the client match a "stored" reply to the
 *     specific send that triggered it without relying on ordering.
 *   { type: "ack", id: string }
 *     "I received and persisted this message locally" — only valid for a
 *     message sent by the *other* party. Deletes the row server-side.
 *   { type: "edit", targetMessageId: string, content: string, clientId?: string }
 *     Changes the content of a message this connection previously sent.
 *     Goes through the exact same store -> forward-if-connected ->
 *     queue-if-not -> delete-on-ack pipeline as a regular message (so an
 *     edit made while the recipient's offline still arrives once they
 *     reconnect) — the only difference is the client applies it to an
 *     existing local bubble (matched by targetMessageId) instead of
 *     rendering a new one. There's no check that targetMessageId was
 *     really sent by this connection (the original row is usually already
 *     deleted by the time an edit happens, so there's nothing left
 *     server-side to check against) — this is a convenience feature, not
 *     a security boundary; the apps only show an "edit" option on a
 *     user's own bubbles.
 *   { type: "call-invite", mode: "audio"|"video" }
 *     Requests a call. Relayed live to the recipient ONLY if they're
 *     currently connected — there is no queuing for calls, so if they're
 *     not connected the server immediately replies to the caller with
 *     { type: "call-unavailable" } instead of silently doing nothing.
 *   { type: "call-accept" } / { type: "call-decline" } / { type: "call-end" }
 *     Relayed live to the other party. No-ops (silently) if they've
 *     disconnected in the meantime — the caller's own client already
 *     handles a dropped connection as a hangup.
 *
 * Server -> client messages (JSON):
 *   { type: "message", id, errandId, senderRole, senderId, kind, contentType, targetMessageId?, content, createdAt }
 *     A message (or edit, when kind is "edit") from the other party — sent
 *     live on arrival, or flushed from the queue on connect if it arrived
 *     while this device was away.
 *   { type: "stored", id, createdAt, clientId? }
 *     Acknowledges a message/edit this connection just sent.
 *   { type: "call-invite", mode, fromRole } / "call-accept" / "call-decline" / "call-end"
 *     Forwarded from the other party — see the client-message docs above.
 *   { type: "call-unavailable" }
 *     Sent back to a caller whose call-invite couldn't be delivered
 *     because the other party isn't connected right now.
 *   { type: "error", message }
 *     Something about the last client message was invalid; connection
 *     stays open.
 */
import type { Server as HttpServer } from "node:http";
import type { IncomingMessage } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import type { RawData } from "ws";
import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client";
import { chatMessages, errands, requesters, runners } from "../db/schema";
import { verifyAuthToken } from "./jwt";
import { sendPushToUser } from "./push";

const CHAT_ALLOWED_STATUSES = new Set(["accepted", "en_route_to_pickup", "in_progress", "en_route_to_delivery", "delivered"]);

// A voice note's base64 payload is much bigger than any text message —
// roughly 1.3x the raw audio size. This caps a single message/edit
// around ~2.2MB of base64, comfortably more than a short voice note
// needs (compressed audio at a low bitrate for well under a minute), and
// well inside the WebSocketServer's maxPayload below.
const MAX_CONTENT_LENGTH = 3_000_000;

const clientMessageSchema = z.union([
  z.object({
    type: z.literal("message"),
    content: z.string().trim().min(1).max(MAX_CONTENT_LENGTH),
    contentType: z.enum(["text", "audio"]).optional(),
    clientId: z.string().optional(),
  }),
  z.object({ type: z.literal("ack"), id: z.string().uuid() }),
  z.object({
    type: z.literal("edit"),
    targetMessageId: z.string().uuid(),
    content: z.string().trim().min(1).max(MAX_CONTENT_LENGTH),
    clientId: z.string().optional(),
  }),
  z.object({ type: z.literal("call-invite"), mode: z.enum(["audio", "video"]) }),
  z.object({ type: z.literal("call-accept") }),
  z.object({ type: z.literal("call-decline") }),
  z.object({ type: z.literal("call-end") }),
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

function recipientOf(conn: Connection): Connection | undefined {
  return rooms.get(conn.errandId)?.[otherRole(conn.role)];
}

function send(ws: WebSocket, payload: unknown) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload));
}

/** Tells the other party about something that happened while they have no
 * live connection (app closed or backgrounded). Best-effort: never throws
 * and never delays the sender — callers fire it with `void`. */
async function pushToOfflineRecipient(
  conn: Connection,
  kind: "message" | "call",
  preview: { contentType?: "text" | "audio"; content?: string }
) {
  try {
    const [errand] = await db.select().from(errands).where(eq(errands.id, conn.errandId)).limit(1);
    if (!errand) return;
    const recipientRole = otherRole(conn.role);
    const recipientId = recipientRole === "requester" ? errand.requesterId : errand.runnerId;
    if (!recipientId) return;

    const [sender] =
      conn.role === "requester"
        ? await db.select({ fullName: requesters.fullName }).from(requesters).where(eq(requesters.id, conn.userId)).limit(1)
        : await db.select({ fullName: runners.fullName }).from(runners).where(eq(runners.id, conn.userId)).limit(1);
    const name = sender?.fullName?.trim().split(/\s+/)[0] || (conn.role === "runner" ? "Your runner" : "Your requester");

    if (kind === "call") {
      await sendPushToUser(recipientRole, recipientId, {
        title: "Missed call",
        body: `${name} tried to call you. Tap to open the chat.`,
        data: { type: "call", errandId: conn.errandId },
        channelId: "calls",
        ttl: 3600,
      });
      return;
    }

    const body =
      preview.contentType === "audio"
        ? "Sent you a voice note"
        : (preview.content ?? "").length > 140
          ? `${(preview.content ?? "").slice(0, 137)}...`
          : (preview.content ?? "");
    await sendPushToUser(recipientRole, recipientId, {
      title: name,
      body,
      data: { type: "message", errandId: conn.errandId },
      channelId: "messages",
      ttl: 86_400,
    });
  } catch (err) {
    console.error("[push] couldn't notify offline recipient", err instanceof Error ? err.message : err);
  }
}

function messagePayload(row: typeof chatMessages.$inferSelect) {
  return {
    type: "message" as const,
    id: row.id,
    errandId: row.errandId,
    senderRole: row.senderRole,
    senderId: row.senderId,
    kind: row.kind,
    contentType: row.contentType,
    targetMessageId: row.targetMessageId ?? undefined,
    content: row.content,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Sends every message (and edit) still queued for `conn` — i.e. sent by
 * the other party while this device wasn't connected — called right after
 * a successful join, mirroring what happens when WhatsApp reconnects. */
async function flushQueuedMessages(conn: Connection) {
  const rows = await db
    .select()
    .from(chatMessages)
    .where(and(eq(chatMessages.errandId, conn.errandId), ne(chatMessages.senderRole, conn.role)))
    .orderBy(chatMessages.createdAt);

  for (const row of rows) send(conn.ws, messagePayload(row));
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

  if (data.type === "call-invite" || data.type === "call-accept" || data.type === "call-decline" || data.type === "call-end") {
    const recipient = recipientOf(conn);
    if (!recipient) {
      if (data.type === "call-invite") {
        send(conn.ws, { type: "call-unavailable" });
        // A live call can't ring a closed app, but a "missed call"
        // notification at least tells them to open the chat.
        void pushToOfflineRecipient(conn, "call", {});
      }
      return;
    }
    send(recipient.ws, data.type === "call-invite" ? { ...data, fromRole: conn.role } : data);
    return;
  }

  // data.type is "message" or "edit" — both go through the same
  // store -> forward-if-connected -> queue-if-not pipeline.
  const [row] = await db
    .insert(chatMessages)
    .values({
      errandId: conn.errandId,
      senderRole: conn.role,
      senderId: conn.userId,
      kind: data.type === "edit" ? "edit" : "message",
      contentType: data.type === "message" ? (data.contentType ?? "text") : "text",
      targetMessageId: data.type === "edit" ? data.targetMessageId : undefined,
      content: data.content,
    })
    .returning();

  send(conn.ws, { type: "stored", id: row.id, createdAt: row.createdAt.toISOString(), clientId: data.clientId });

  const recipient = recipientOf(conn);
  if (recipient) send(recipient.ws, messagePayload(row));
  // If the recipient isn't connected right now, the row just stays in
  // chat_messages — flushQueuedMessages delivers it next time they join —
  // and (for new messages, not edits) a push notification goes out so they
  // know to open the app.
  else if (data.type === "message") {
    void pushToOfflineRecipient(conn, "message", { contentType: data.contentType ?? "text", content: data.content });
  }
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
  const wss = new WebSocketServer({ server, path: "/ws/chat", maxPayload: 5 * 1024 * 1024 });

  wss.on("connection", async (ws, req) => {
    // Authenticating and flushing the queue take a few DB round-trips. A
    // client can legitimately send the moment the socket opens (e.g. right
    // after tapping a push notification), so listen immediately and hold
    // anything that arrives early, then replay it in order once joined —
    // otherwise those first messages would be silently dropped.
    const early: RawData[] = [];
    let onMessage: ((raw: RawData) => void) | null = null;
    ws.on("message", (raw) => {
      if (onMessage) onMessage(raw);
      else early.push(raw);
    });

    const result = await authenticateConnection(req);
    if ("error" in result) {
      ws.close(4001, result.error);
      return;
    }

    const conn: Connection = { ...result, ws };
    joinRoom(conn);
    await flushQueuedMessages(conn);

    onMessage = (raw) => {
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
    };
    for (const raw of early.splice(0)) onMessage(raw);

    ws.on("close", () => {
      leaveRoom(conn);
      // A dropped connection mid-call should look like a hangup to the
      // other party — they have no other way to find out.
      const recipient = recipientOf(conn);
      if (recipient) send(recipient.ws, { type: "call-end" });
    });

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
