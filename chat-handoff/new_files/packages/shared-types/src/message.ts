// A message exchanged between a requester and their runner on a specific
// errand, over the WebSocket chat server (see apps/api's lib/chat-server.ts).
//
// There is no permanent server-side chat history — this shape describes a
// message in flight (still queued for delivery) or freshly delivered, not
// a row in a long-lived table. Each app persists its own copy locally
// (see apps/runner's lib/chatDb.ts) once received; the server drops its
// copy as soon as the recipient acknowledges it.
export interface ChatMessage {
  id: string;
  errandId: string;
  senderRole: "requester" | "runner";
  senderId: string;
  content: string;
  createdAt: string;
}
