/**
 * This device's own permanent copy of chat history — the server never
 * keeps one (see apps/api's lib/chat-server.ts), so this is the only
 * place a conversation actually lives long-term. Stored in this app's
 * private SQLite database; nothing here ever leaves the device except
 * over the WebSocket at send time.
 *
 * Voice notes are stored right in `content` as base64 (same as they
 * travel over the wire) — fine for short notes; if this ever grows,
 * moving audio to files on disk with just a path here is the obvious
 * next step.
 */
import * as SQLite from "expo-sqlite";
import type { ChatMessage } from "@gracerandly/shared-types";

/** What's stored/rendered locally: always a plain message (edits are
 * applied to the original row rather than stored as their own bubble),
 * plus whether it's been edited since it was first sent. */
export type LocalChatMessage = ChatMessage & { edited: boolean };

const db = SQLite.openDatabaseSync("gracerandly_chat.db");

let initialized = false;
function ensureInitialized() {
  if (initialized) return;
  db.execSync(`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      errandId TEXT NOT NULL,
      senderRole TEXT NOT NULL,
      senderId TEXT NOT NULL,
      content TEXT NOT NULL,
      createdAt TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_messages_errand ON messages(errandId, createdAt);
  `);
  // Columns added after the first chat release — ALTER TABLE has no
  // "IF NOT EXISTS" in SQLite, so just try each and ignore "duplicate
  // column" failures on a database that already has them.
  for (const statement of [
    "ALTER TABLE messages ADD COLUMN contentType TEXT NOT NULL DEFAULT 'text'",
    "ALTER TABLE messages ADD COLUMN edited INTEGER NOT NULL DEFAULT 0",
  ]) {
    try {
      db.execSync(statement);
    } catch {
      // already exists
    }
  }
  initialized = true;
}

interface Row {
  id: string;
  errandId: string;
  senderRole: "requester" | "runner";
  senderId: string;
  content: string;
  contentType: "text" | "audio";
  edited: number;
  createdAt: string;
}

/** Insert-or-replace by id, so re-saving a message already on disk (e.g. a
 * duplicate delivery before an ack lands) is a harmless no-op rather than
 * a second row. */
export function saveMessage(message: Pick<ChatMessage, "id" | "errandId" | "senderRole" | "senderId" | "content" | "createdAt"> & { contentType: "text" | "audio" }): void {
  ensureInitialized();
  db.runSync(
    "INSERT OR REPLACE INTO messages (id, errandId, senderRole, senderId, content, contentType, edited, createdAt) VALUES (?, ?, ?, ?, ?, ?, COALESCE((SELECT edited FROM messages WHERE id = ?), 0), ?)",
    [message.id, message.errandId, message.senderRole, message.senderId, message.content, message.contentType, message.id, message.createdAt]
  );
}

/** Applies an edit to a message already in local history. No-op if the
 * message isn't found (e.g. history was cleared) — nothing to update. */
export function applyEdit(targetMessageId: string, content: string): void {
  ensureInitialized();
  db.runSync("UPDATE messages SET content = ?, edited = 1 WHERE id = ?", [content, targetMessageId]);
}

export function getMessages(errandId: string): LocalChatMessage[] {
  ensureInitialized();
  return db
    .getAllSync<Row>(
      "SELECT id, errandId, senderRole, senderId, content, contentType, edited, createdAt FROM messages WHERE errandId = ? ORDER BY createdAt ASC",
      [errandId]
    )
    .map((row) => ({
      id: row.id,
      errandId: row.errandId,
      senderRole: row.senderRole,
      senderId: row.senderId,
      kind: "message" as const,
      contentType: row.contentType,
      content: row.content,
      edited: row.edited === 1,
      createdAt: row.createdAt,
    }));
}
