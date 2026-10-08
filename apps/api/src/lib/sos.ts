/**
 * SOS / panic button logic, shared by the requester routes (routes/errands.ts)
 * and the runner routes (routes/runners.ts).
 *
 * What an SOS does:
 *  1. Records an alert (sos_alerts) with the triggering person's location.
 *  2. Texts every number in SOS_ALERT_PHONES (comma-separated) with who,
 *     where, and the errand — Gracerandly's own safety contacts.
 *
 * What it deliberately does NOT do: tell the other party on the errand.
 * If the person who feels unsafe is unsafe because of the other party,
 * alerting them would make things worse.
 *
 * Honest delivery reporting: notifiedCount only counts texts that could
 * really have reached a phone. With SMS_PROVIDER=console (the dev default)
 * nothing leaves the server, so the count stays 0 and the apps tell the
 * user to call emergency services themselves rather than implying help
 * has been summoned. See the SOS_ALERT_PHONES notes in .env.example.
 */
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client";
import { errands, requesters, runners, sosAlerts } from "../db/schema";
import { AppErrors } from "./errors";
import { smsProvider } from "./sms";
import type { SosAlert } from "@gracerandly/shared-types";

type Role = "requester" | "runner";

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

function smsIsReal(): boolean {
  return (process.env.SMS_PROVIDER ?? "console") !== "console";
}

/** Sends `message` to every safety contact. Returns how many sends
 * succeeded *and* could plausibly reach a real phone. Never throws — a
 * failing SMS provider must not stop the alert from being recorded. */
async function notifySafetyTeam(message: string): Promise<number> {
  const phones = alertPhones();
  if (phones.length === 0) {
    console.warn("[sos] SOS_ALERT_PHONES is empty — alert recorded but nobody was notified");
    return 0;
  }

  // All at once, not one after another: a slow or failing text provider must
  // not make the person holding the panic button wait N times as long.
  const results = await Promise.allSettled(phones.map((phone) => smsProvider.send(phone, message)));
  let delivered = 0;
  results.forEach((result, index) => {
    if (result.status === "fulfilled") {
      if (smsIsReal()) delivered += 1;
    } else {
      console.error(`[sos] failed to text ${phones[index]}`, result.reason);
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

async function describeParties(errand: typeof errands.$inferSelect, role: Role) {
  const [requester] = await db.select().from(requesters).where(eq(requesters.id, errand.requesterId)).limit(1);
  const runner = errand.runnerId
    ? (await db.select().from(runners).where(eq(runners.id, errand.runnerId)).limit(1))[0]
    : undefined;

  const describe = (label: string, p?: { fullName: string; phone: string }) =>
    p ? `${label} ${p.fullName} ${p.phone}` : `${label} unknown`;

  const requesterText = describe("Requester", requester);
  const runnerText = describe("Runner", runner);
  // Triggerer first, so the most important line of a short SMS leads.
  return role === "requester" ? `${requesterText}. ${runnerText}` : `${runnerText}. ${requesterText}`;
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

  const refresh = async (existingId: string) => {
    const [row] = await db.update(sosAlerts).set({ location }).where(eq(sosAlerts.id, existingId)).returning();
    return toSosAlert(row);
  };

  const sosText = async () =>
    `Gracerandly SOS from the ${role} on errand ${errandId.slice(0, 8)}. ${await describeParties(errand, role)}. Location: ${mapsLink(location)}`;

  const existing = await findActiveAlert(errandId, role);
  if (existing) {
    const refreshed = await refresh(existing.id);
    // Someone was reached last time: a repeat press is just a location
    // refresh (no repeat texts).
    if (existing.notifiedCount > 0) return refreshed;
    // Nobody was reached (the text provider was down, or no safety numbers
    // were set up yet). The apps re-send every 30 seconds while an alert is
    // active, so try the texts again now rather than leaving the alert
    // stuck at "nobody was told".
    const retried = await notifySafetyTeam(await sosText());
    if (retried === 0) return refreshed;
    const [updated] = await db.update(sosAlerts).set({ notifiedCount: retried }).where(eq(sosAlerts.id, existing.id)).returning();
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

  const notifiedCount = await notifySafetyTeam(await sosText());
  if (notifiedCount === 0) return toSosAlert(created);

  const [updated] = await db.update(sosAlerts).set({ notifiedCount }).where(eq(sosAlerts.id, created.id)).returning();
  return toSosAlert(updated);
}

/** The caller's own active alert on this errand, or null. */
export async function getActiveSos(rawErrandId: unknown, role: Role, userId: string): Promise<SosAlert | null> {
  const errand = await loadErrandForParty(rawErrandId, role, userId);
  const row = await findActiveAlert(errand.id, role);
  return row ? toSosAlert(row) : null;
}

/** "I'm safe" — closes the caller's active alert. Only the person who
 * raised it can close it from the apps. */
export async function resolveSos(rawErrandId: unknown, role: Role, userId: string): Promise<SosAlert> {
  const errand = await loadErrandForParty(rawErrandId, role, userId);
  const existing = await findActiveAlert(errand.id, role);
  if (!existing) throw AppErrors.notFound("No active SOS on this errand");

  const [row] = await db
    .update(sosAlerts)
    .set({ status: "resolved", resolvedAt: new Date() })
    .where(eq(sosAlerts.id, existing.id))
    .returning();

  // Fire-and-forget all-clear so the safety team isn't left chasing an
  // alert the person has already closed.
  if (existing.notifiedCount > 0) {
    void notifySafetyTeam(`Gracerandly SOS on errand ${errand.id.slice(0, 8)} was marked SAFE by the ${role}.`);
  }
  return toSosAlert(row);
}
