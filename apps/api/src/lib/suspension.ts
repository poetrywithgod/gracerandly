/**
 * Suspended accounts. Staff can suspend a requester or runner from the admin
 * dashboard (People). A suspended account:
 *  - can't log in or sign a new token,
 *  - is rejected on every API call, even with a token that is still valid
 *    (tokens last a week, so the check can't live in the token),
 *  - can't connect to errand chat or register for push notifications.
 * The person gets a 401 with the reason, which the apps treat as "signed out".
 *
 * Each check is a single indexed lookup; the answer is remembered for
 * CACHE_MS so a busy account doesn't hit the database on every request.
 * Suspending or reinstating clears the entry, so it takes effect at once on
 * this server.
 */
import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { requesters, runners } from "../db/schema";
import { AppErrors } from "./errors";

type Role = "requester" | "runner";
const CACHE_MS = 30_000;
const cache = new Map<string, { at: number; reason: string | null | undefined }>();

export function suspensionMessage(reason: string | null | undefined): string {
  return reason
    ? `Your account has been suspended: ${reason}. Contact support if you think this is a mistake.`
    : "Your account has been suspended. Contact support if you think this is a mistake.";
}

/** The suspension reason ("" if none was given), or undefined when the account is active. */
async function lookup(role: Role, id: string): Promise<string | undefined> {
  const key = `${role}:${id}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.reason === null ? "" : hit.reason;

  const table = role === "requester" ? requesters : runners;
  const [row] = await db
    .select({ at: table.suspendedAt, reason: table.suspendedReason })
    .from(table)
    .where(eq(table.id, id))
    .limit(1);
  const state = row?.at ? (row.reason ?? null) : undefined;
  cache.set(key, { at: Date.now(), reason: state });
  if (cache.size > 5000) cache.clear();
  return state === null ? "" : state;
}

/** Throws a 401 when the account is suspended. A missing account is left to the route to report. */
export async function assertNotSuspended(role: Role, id: string): Promise<void> {
  const state = await lookup(role, id);
  if (state !== undefined) throw AppErrors.unauthorized(suspensionMessage(state));
}

export async function isSuspended(role: Role, id: string): Promise<boolean> {
  return (await lookup(role, id)) !== undefined;
}

export function forgetSuspension(role: Role, id: string): void {
  cache.delete(`${role}:${id}`);
}

/** For login: the row is already loaded, so no lookup. */
export function assertRowNotSuspended(row: { suspendedAt: Date | null; suspendedReason: string | null }): void {
  if (row.suspendedAt) throw AppErrors.unauthorized(suspensionMessage(row.suspendedReason));
}
