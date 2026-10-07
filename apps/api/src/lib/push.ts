/**
 * Push notifications through Expo's push service.
 *
 * The apps register an Expo push token after login (routes/push.ts); when
 * something happens while the person isn't connected — a chat message, a
 * call attempt — the API calls sendPushToUser(), which POSTs to Expo's
 * HTTP API, and Expo hands the notification to Google's FCM.
 *
 * Push is strictly best-effort: sendPushToUser never throws, because a
 * failed notification must never fail the chat message or call it belongs
 * to. With no tokens registered (or Expo unreachable) it just logs and
 * returns.
 */
import { and, eq, inArray } from "drizzle-orm";
import { db } from "../db/client";
import { pushTokens } from "../db/schema";

export type PushRole = "requester" | "runner";

export interface PushPayload {
  title: string;
  body: string;
  /** Delivered to the app; used to open the right screen on tap. */
  data?: Record<string, unknown>;
  /** Android notification channel created by the app (see apps/*\/src/lib/push.ts). */
  channelId?: "messages" | "calls";
  /** Seconds Expo/FCM may hold the message if the phone is offline. */
  ttl?: number;
}

const MAX_PER_REQUEST = 100;

function expoPushUrl(): string {
  return process.env.EXPO_PUSH_URL?.trim() || "https://exp.host/--/api/v2/push/send";
}

export function isExpoPushToken(token: string): boolean {
  return /^Expo(nent)?PushToken\[[^\]\s]+\]$/.test(token);
}

export async function registerPushToken(role: PushRole, userId: string, token: string, platform: string): Promise<void> {
  await db
    .insert(pushTokens)
    .values({ userRole: role, userId, token, platform })
    // The token identifies a physical install. If someone else logs in on
    // the same phone, re-point it at them instead of keeping two owners.
    .onConflictDoUpdate({
      target: pushTokens.token,
      set: { userRole: role, userId, platform, updatedAt: new Date() },
    });
}

export async function unregisterPushToken(role: PushRole, userId: string, token: string): Promise<void> {
  await db
    .delete(pushTokens)
    .where(and(eq(pushTokens.token, token), eq(pushTokens.userRole, role), eq(pushTokens.userId, userId)));
}

interface ExpoTicket {
  status: "ok" | "error";
  message?: string;
  details?: { error?: string };
}

export async function sendPushToUser(role: PushRole, userId: string, payload: PushPayload): Promise<void> {
  try {
    const rows = await db
      .select({ token: pushTokens.token })
      .from(pushTokens)
      .where(and(eq(pushTokens.userRole, role), eq(pushTokens.userId, userId)));
    const tokens = rows.map((r) => r.token).filter(isExpoPushToken);
    if (tokens.length === 0) return;

    const headers: Record<string, string> = { "Content-Type": "application/json", Accept: "application/json" };
    const accessToken = process.env.EXPO_ACCESS_TOKEN?.trim();
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

    for (let i = 0; i < tokens.length; i += MAX_PER_REQUEST) {
      const batch = tokens.slice(i, i + MAX_PER_REQUEST);
      const res = await fetch(expoPushUrl(), {
        method: "POST",
        headers,
        body: JSON.stringify(
          batch.map((to) => ({
            to,
            title: payload.title,
            body: payload.body,
            data: payload.data ?? {},
            sound: "default",
            priority: "high",
            channelId: payload.channelId ?? "messages",
            ttl: payload.ttl,
          }))
        ),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) {
        console.error(`[push] Expo push API returned HTTP ${res.status}`);
        continue;
      }
      const json = (await res.json().catch(() => ({}))) as { data?: ExpoTicket[] };
      const tickets = json.data ?? [];
      // A phone that uninstalled the app (or revoked notifications) comes
      // back as DeviceNotRegistered — drop the token so we stop trying.
      const dead = batch.filter((_, idx) => tickets[idx]?.status === "error" && tickets[idx]?.details?.error === "DeviceNotRegistered");
      if (dead.length > 0) await db.delete(pushTokens).where(inArray(pushTokens.token, dead));
      tickets.forEach((t) => {
        if (t.status === "error" && t.details?.error !== "DeviceNotRegistered") {
          console.error(`[push] Expo rejected a notification: ${t.message ?? t.details?.error ?? "unknown error"}`);
        }
      });
    }
  } catch (err) {
    console.error("[push] failed to send notification", err instanceof Error ? err.message : err);
  }
}
