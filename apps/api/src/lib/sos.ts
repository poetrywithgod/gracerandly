/**
 * SOS / panic button logic, shared by the requester routes (routes/errands.ts)
 * and the runner routes (routes/runners.ts).
 *
 * What an SOS does:
 *  1. Records an alert (sos_alerts) with the triggering person's location.
 *  2. Texts every number in SOS_ALERT_PHONES and emails every address in
 *     SOS_ALERT_EMAILS (both comma-separated) with who, where, and the
 *     errand — Gracerandly's own safety contacts. Either list can be used
 *     on its own; the two channels go out at the same time.
 *
 *  3. While the alert stays active and the person moves, sends the safety
 *     team follow-up locations (rate-limited and capped — see UPDATE_* below)
 *     so they aren't chasing a stale first position.
 *  4. Closes alerts that went stale (a long time after the errand ended, or
 *     simply too old) and tells the safety team it was NOT confirmed safe.
 *
 * What it deliberately does NOT do: tell the other party on the errand.
 * If the person who feels unsafe is unsafe because of the other party,
 * alerting them would make things worse.
 *
 * Honest delivery reporting: notifiedCount only counts messages (texts and
 * emails) that could really have reached someone. With SMS_PROVIDER=console
 * and EMAIL_PROVIDER=console (the dev defaults) nothing leaves the server,
 * so the count stays 0 and the apps tell the user to call emergency
 * services themselves rather than implying help has been summoned. See the
 * SOS_ALERT_PHONES / SOS_ALERT_EMAILS notes in .env.example.
 */
import { and, eq, isNull, lt, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client";
import { errands, requesters, runners, sosAlerts } from "../db/schema";
import { AppErrors } from "./errors";
import { smsProvider } from "./sms";
import { emailProvider } from "./email";
import type { SosAlert } from "@gracerandly/shared-types";

type Role = "requester" | "runner";

// Follow-up locations to the safety team: at most one per 2 minutes, only
// once the person has moved at least 100 m since the last one, and at most
// 30 per alert (about an hour of continuous movement) — texts cost money
// and a flood of near-identical messages is hard to act on.
const UPDATE_MIN_INTERVAL_MS = 2 * 60 * 1000;
const UPDATE_MIN_DISTANCE_M = 100;
const MAX_UPDATES = 30;

// SOS can still be raised for 2 hours after delivery (an incident can
// happen at hand-off or right after). Errands have no separate delivered-at
// column, so the errand's updatedAt — last touched by the delivery — stands in.
const POST_DELIVERY_WINDOW_MS = 2 * 60 * 60 * 1000;
// An alert still "active" after this long is closed by the server.
const ALERT_MAX_AGE_MS = 8 * 60 * 60 * 1000;

// Same window as chat: a runner's attached, through delivery (an incident
// can still happen at hand-off, so "delivered" counts).
const SOS_ALLOWED_STATUSES = new Set(["accepted", "en_route_to_pickup", "in_progress", "en_route_to_delivery", "delivered"]);

export function toSosAlert(row: typeof sosAlerts.$inferSelect): SosAlert {
  return {
    id: row.id,
    errandId: row.errandId,
    triggeredByRole: row.triggeredByRole,
    triggeredById: row.triggeredById,
    location: row.location,
    status: row.status,
    notifiedCount: row.notifiedCount,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    resolvedAt: row.resolvedAt?.toISOString() ?? undefined,
  };
}

function alertPhones(): string[] {
  return (process.env.SOS_ALERT_PHONES ?? "")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
}

function alertEmails(): string[] {
  return (process.env.SOS_ALERT_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean);
}

function smsIsReal(): boolean {
  return (process.env.SMS_PROVIDER ?? "console") !== "console";
}

function emailIsReal(): boolean {
  return (process.env.EMAIL_PROVIDER ?? "console") !== "console";
}

/** What goes to the safety team: a short version for texts and a fuller one
 * (with a subject line) for email. */
interface SafetyMessage {
  sms: string;
  emailSubject: string;
  emailBody: string;
}

/** Sends `message` to every safety contact, by text and by email at the same
 * time. Returns how many sends succeeded *and* could plausibly reach a real
 * person. Never throws — a failing provider must not stop the alert from
 * being recorded. */
async function notifySafetyTeam(message: SafetyMessage): Promise<number> {
  const phones = alertPhones();
  const emails = alertEmails();
  if (phones.length === 0 && emails.length === 0) {
    console.warn("[sos] SOS_ALERT_PHONES and SOS_ALERT_EMAILS are both empty — alert recorded but nobody was notified");
    return 0;
  }

  // All at once, not one after another: a slow or failing provider must
  // not make the person holding the panic button wait N times as long.
  const [smsResults, emailResults] = await Promise.all([
    Promise.allSettled(phones.map((phone) => smsProvider.send(phone, message.sms))),
    Promise.allSettled(emails.map((email) => emailProvider.send(email, message.emailSubject, message.emailBody))),
  ]);

  let delivered = 0;
  smsResults.forEach((result, index) => {
    if (result.status === "fulfilled") {
      if (smsIsReal()) delivered += 1;
    } else {
      console.error(`[sos] failed to text ${phones[index]}`, result.reason);
    }
  });
  emailResults.forEach((result, index) => {
    if (result.status === "fulfilled") {
      if (emailIsReal()) delivered += 1;
    } else {
      console.error(`[sos] failed to email ${emails[index]}`, result.reason);
    }
  });
  return delivered;
}

/** Loads the errand and checks `userId` is really a party to it in `role`.
 * Reports "not found" for a non-party, same as the other own-errand loaders,
 * so this can't be used to probe which errand ids exist. */
async function loadErrandForParty(rawErrandId: unknown, role: Role, userId: string) {
  // A malformed id would otherwise reach Postgres and come back as a 500.
  const parsedId = z.uuid().safeParse(rawErrandId);
  if (!parsedId.success) throw AppErrors.notFound("Errand not found");
  const errandId = parsedId.data;
  const [errand] = await db.select().from(errands).where(eq(errands.id, errandId)).limit(1);
  const isParty = errand && (role === "requester" ? errand.requesterId === userId : errand.runnerId === userId);
  if (!errand || !isParty) throw AppErrors.notFound("Errand not found");
  return errand;
}

async function findActiveAlert(errandId: string, role: Role) {
  const [row] = await db
    .select()
    .from(sosAlerts)
    .where(and(eq(sosAlerts.errandId, errandId), eq(sosAlerts.triggeredByRole, role), eq(sosAlerts.status, "active")))
    .limit(1);
  return row;
}

function mapsLink(location: { lat: number; lng: number }): string {
  return `https://maps.google.com/?q=${location.lat},${location.lng}`;
}

/** One line per party, the person who pressed SOS first so the most
 * important line of a short text leads. */
async function partyLines(errand: typeof errands.$inferSelect, role: Role): Promise<string[]> {
  const [requester] = await db.select().from(requesters).where(eq(requesters.id, errand.requesterId)).limit(1);
  const runner = errand.runnerId
    ? (await db.select().from(runners).where(eq(runners.id, errand.runnerId)).limit(1))[0]
    : undefined;

  const describe = (label: string, p?: { fullName: string; phone: string }) =>
    p ? `${label} ${p.fullName} ${p.phone}` : `${label} unknown`;

  const requesterText = describe("Requester", requester);
  const runnerText = describe("Runner", runner);
  return role === "requester" ? [requesterText, runnerText] : [runnerText, requesterText];
}

/** Wall-clock time in Nigeria, for the email. The text message carries no
 * time: it arrives when it's sent. */
function lagosTime(date: Date): string {
  return date.toLocaleString("en-NG", { timeZone: "Africa/Lagos", dateStyle: "medium", timeStyle: "short" });
}

async function buildSosMessage(
  errand: typeof errands.$inferSelect,
  role: Role,
  location: { lat: number; lng: number }
): Promise<SafetyMessage> {
  const lines = await partyLines(errand, role);
  const shortId = errand.id.slice(0, 8);
  return {
    sms: `Gracerandly SOS from the ${role} on errand ${shortId}. ${lines.join(". ")}. Location: ${mapsLink(location)}`,
    emailSubject: `SOS: ${role} needs help (errand ${shortId})`,
    emailBody: [
      `A Gracerandly ${role} pressed the SOS button.`,
      "",
      `Time: ${lagosTime(new Date())} (Lagos)`,
      `Errand: ${errand.id}`,
      ...lines,
      `Location: ${mapsLink(location)}`,
      "",
      "The other person on the errand has not been told about this alert.",
    ].join("\n"),
  };
}

function buildAllClearMessage(errand: typeof errands.$inferSelect, role: Role): SafetyMessage {
  const shortId = errand.id.slice(0, 8);
  const sms = `Gracerandly SOS on errand ${shortId} was marked SAFE by the ${role}.`;
  return {
    sms,
    emailSubject: `SAFE: ${role} cleared the SOS (errand ${shortId})`,
    emailBody: `${sms}\n\nTime: ${lagosTime(new Date())} (Lagos)\nErrand: ${errand.id}`,
  };
}

function buildUpdateMessage(errand: typeof errands.$inferSelect, role: Role, location: { lat: number; lng: number }): SafetyMessage {
  const shortId = errand.id.slice(0, 8);
  const sms = `Gracerandly SOS UPDATE, errand ${shortId}: the ${role} has moved. Now: ${mapsLink(location)}`;
  return {
    sms,
    emailSubject: `SOS update: ${role} moved (errand ${shortId})`,
    emailBody: `${sms}\n\nTime: ${lagosTime(new Date())} (Lagos)\nErrand: ${errand.id}\n\nThe SOS is still active — the ${role} has not marked themselves safe.`,
  };
}

function buildAutoClosedMessage(errand: typeof errands.$inferSelect, role: Role): SafetyMessage {
  const shortId = errand.id.slice(0, 8);
  const sms = `Gracerandly SOS on errand ${shortId} was closed automatically. The ${role} did NOT confirm they are safe — please check on them.`;
  return {
    sms,
    emailSubject: `SOS closed automatically, not confirmed safe (errand ${shortId})`,
    emailBody: `${sms}\n\nTime: ${lagosTime(new Date())} (Lagos)\nErrand: ${errand.id}`,
  };
}

function distanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** True once the errand was delivered more than POST_DELIVERY_WINDOW_MS ago. */
function deliveryWindowEnded(errand: typeof errands.$inferSelect, now: number): boolean {
  return errand.status === "delivered" && now - errand.updatedAt.getTime() >= POST_DELIVERY_WINDOW_MS;
}

function isStale(alert: typeof sosAlerts.$inferSelect, errand: typeof errands.$inferSelect, now: number): boolean {
  return now - alert.createdAt.getTime() >= ALERT_MAX_AGE_MS || deliveryWindowEnded(errand, now);
}

/** Closes a stale alert. The status condition makes it safe if two requests
 * (or the sweep) get here together: only the one that really closes it tells
 * the safety team. Returns whether this call closed it. */
async function autoCloseAlert(errand: typeof errands.$inferSelect, alert: typeof sosAlerts.$inferSelect): Promise<boolean> {
  const [closed] = await db
    .update(sosAlerts)
    .set({ status: "resolved", resolvedAt: new Date(), resolvedBy: "auto" })
    .where(and(eq(sosAlerts.id, alert.id), eq(sosAlerts.status, "active")))
    .returning();
  if (!closed) return false;
  // Only worth telling the team about if they were told about the alert.
  if (alert.notifiedCount > 0) void notifySafetyTeam(buildAutoClosedMessage(errand, alert.triggeredByRole));
  return true;
}

/** Sends a follow-up location if the person has moved and enough time has
 * passed. Claims the slot in the database first, so two simultaneous
 * refreshes can't both send. Never throws. */
async function maybeSendLocationUpdate(
  errand: typeof errands.$inferSelect,
  role: Role,
  existing: typeof sosAlerts.$inferSelect,
  location: { lat: number; lng: number }
): Promise<void> {
  try {
    if (existing.updateCount >= MAX_UPDATES) return;
    const lastSent = existing.lastUpdateLocation ?? existing.location;
    if (distanceMeters(lastSent, location) < UPDATE_MIN_DISTANCE_M) return;

    const now = new Date();
    const cutoff = new Date(now.getTime() - UPDATE_MIN_INTERVAL_MS);
    const [claimed] = await db
      .update(sosAlerts)
      .set({ lastUpdateSentAt: now, lastUpdateLocation: location, updateCount: sql`${sosAlerts.updateCount} + 1` })
      .where(
        and(
          eq(sosAlerts.id, existing.id),
          eq(sosAlerts.status, "active"),
          lt(sosAlerts.updateCount, MAX_UPDATES),
          or(isNull(sosAlerts.lastUpdateSentAt), lt(sosAlerts.lastUpdateSentAt, cutoff))
        )
      )
      .returning();
    if (!claimed) return;
    await notifySafetyTeam(buildUpdateMessage(errand, role, location));
  } catch (err) {
    console.error("[sos] couldn't send a location update", err);
  }
}

/** Closes every active alert that has gone stale. Run on a timer (see
 * server.ts); requests also close stale alerts as they touch them, which
 * covers a server that was asleep. */
export async function expireStaleAlerts(): Promise<number> {
  const rows = await db
    .select({ alert: sosAlerts, errand: errands })
    .from(sosAlerts)
    .innerJoin(errands, eq(errands.id, sosAlerts.errandId))
    .where(eq(sosAlerts.status, "active"));
  const now = Date.now();
  let closed = 0;
  for (const { alert, errand } of rows) {
    if (isStale(alert, errand, now) && (await autoCloseAlert(errand, alert))) closed += 1;
  }
  return closed;
}

/** Raises (or refreshes) an SOS for `userId` on `errandId`. Idempotent per
 * (errand, person): pressing again while an alert is active just refreshes
 * its location and does not re-text the safety team — unless nobody was
 * reached the first time, in which case it tries the texts again. */
export async function triggerSos(params: {
  errandId: unknown;
  role: Role;
  userId: string;
  location: { lat: number; lng: number };
}): Promise<SosAlert> {
  const { role, userId, location } = params;
  const errand = await loadErrandForParty(params.errandId, role, userId);
  const errandId = errand.id;
  if (!SOS_ALLOWED_STATUSES.has(errand.status)) {
    throw AppErrors.conflict("SOS is only available while a runner is attached to the errand");
  }

  // An alert that went stale is closed first; a stale one on an errand
  // delivered long ago also means a new SOS can't be raised.
  let existing: typeof sosAlerts.$inferSelect | undefined = await findActiveAlert(errandId, role);
  if (existing && isStale(existing, errand, Date.now())) {
    await autoCloseAlert(errand, existing);
    existing = undefined;
  }
  if (deliveryWindowEnded(errand, Date.now())) {
    throw AppErrors.conflict("SOS is only available during the errand and for 2 hours after delivery");
  }

  const refresh = async (existingId: string) => {
    const [row] = await db.update(sosAlerts).set({ location }).where(eq(sosAlerts.id, existingId)).returning();
    return toSosAlert(row);
  };

  const sosMessage = () => buildSosMessage(errand, role, location);

  if (existing) {
    const refreshed = await refresh(existing.id);
    // Someone was reached last time: a repeat press is a location refresh,
    // plus a follow-up to the safety team if the person has moved (no
    // repeat of the original alert).
    if (existing.notifiedCount > 0) {
      void maybeSendLocationUpdate(errand, role, existing, location);
      return refreshed;
    }
    // Nobody was reached (the text provider was down, or no safety numbers
    // were set up yet). The apps re-send every 30 seconds while an alert is
    // active, so try the texts and emails again now rather than leaving the
    // alert stuck at "nobody was told".
    const retried = await notifySafetyTeam(await sosMessage());
    if (retried === 0) return refreshed;
    const [updated] = await db
      .update(sosAlerts)
      .set({ notifiedCount: retried, lastUpdateSentAt: new Date(), lastUpdateLocation: location })
      .where(eq(sosAlerts.id, existing.id))
      .returning();
    return toSosAlert(updated);
  }

  let created: typeof sosAlerts.$inferSelect;
  try {
    [created] = await db
      .insert(sosAlerts)
      .values({ errandId, triggeredByRole: role, triggeredById: userId, location })
      .returning();
  } catch (err) {
    // Lost a race with a concurrent press — the partial unique index
    // rejected the second insert. Treat it as a refresh of the winner.
    if ((err as { code?: string }).code === "23505") {
      const winner = await findActiveAlert(errandId, role);
      if (winner) return refresh(winner.id);
    }
    throw err;
  }

  const notifiedCount = await notifySafetyTeam(await sosMessage());
  if (notifiedCount === 0) return toSosAlert(created);

  const [updated] = await db
    .update(sosAlerts)
    .set({ notifiedCount, lastUpdateSentAt: new Date(), lastUpdateLocation: location })
    .where(eq(sosAlerts.id, created.id))
    .returning();
  return toSosAlert(updated);
}

/** The caller's own active alert on this errand, or null. */
export async function getActiveSos(rawErrandId: unknown, role: Role, userId: string): Promise<SosAlert | null> {
  const errand = await loadErrandForParty(rawErrandId, role, userId);
  const row = await findActiveAlert(errand.id, role);
  if (!row) return null;
  if (isStale(row, errand, Date.now())) {
    await autoCloseAlert(errand, row);
    return null;
  }
  return toSosAlert(row);
}

/** "I'm safe" — closes the caller's active alert. Only the person who
 * raised it can close it from the apps. */
export async function resolveSos(rawErrandId: unknown, role: Role, userId: string): Promise<SosAlert> {
  const errand = await loadErrandForParty(rawErrandId, role, userId);
  const existing = await findActiveAlert(errand.id, role);
  if (!existing) throw AppErrors.notFound("No active SOS on this errand");

  const [row] = await db
    .update(sosAlerts)
    .set({ status: "resolved", resolvedAt: new Date(), resolvedBy: "self" })
    .where(eq(sosAlerts.id, existing.id))
    .returning();

  // Fire-and-forget all-clear so the safety team isn't left chasing an
  // alert the person has already closed.
  if (existing.notifiedCount > 0) {
    void notifySafetyTeam(buildAllClearMessage(errand, role));
  }
  return toSosAlert(row);
}
