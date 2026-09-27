/**
 * The runner's own permanent copy of chat history — the server never
 * keeps one (see apps/api's lib/chat-server.ts), so this is the only
 * place a conversation actually lives long-term. Stored in this app's
 * private SQLite database; nothing here ever leaves the device except
 * over the WebSocket at send time.
 */
import * as SQLite from "expo-sqlite";
import type { ChatMessage } from "@gracerandly/shared-types";

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
  initialized = true;
}

/** Insert-or-replace by id, so re-saving a message already on disk (e.g. a
 * duplicate delivery before an ack lands) is a harmless no-op rather than
 * a second row. */
export function saveMessage(message: ChatMessage): void {
  ensureInitialized();
  db.runSync(
    "INSERT OR REPLACE INTO messages (id, errandId, senderRole, senderId, content, createdAt) VALUES (?, ?, ?, ?, ?, ?)",
    [message.id, message.errandId, message.senderRole, message.senderId, message.content, message.createdAt]
  );
}

export function getMessages(errandId: string): ChatMessage[] {
  ensureInitialized();
  return db.getAllSync<ChatMessage>(
    "SELECT id, errandId, senderRole, senderId, content, createdAt FROM messages WHERE errandId = ? ORDER BY createdAt ASC",
    [errandId]
  );
}
