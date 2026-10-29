/**
 * Staff side of safety: SOS alerts and trust incidents (admin dashboard,
 * Safety page).
 *
 * SOS: staff see who pressed the button, where, on which errand, and whether
 * the safety team was actually reached (notifiedCount). They can close an
 * alert once it has been dealt with.
 *
 * Trust incidents: a runner's tier only counts an incident once it is
 * confirmed (lib/trust.ts). Staff confirm or dismiss flagged ones, and can
 * record one themselves (for example after a dispute or a theft report).
 * Every change re-works the runner's tier straight away.
 */
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client";
import { sosAlerts, trustIncidents, runners } from "../db/schema";
import { AppErrors } from "./errors";
import { refreshRunnerTier } from "./trust";

async function rows<T>(query: ReturnType<typeof sql>): Promise<T[]> {
  return Array.from((await db.execute(query)) as unknown as T[]);
}
const num = (v: unknown) => Number(v ?? 0);
const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null);

// ---------------------------------------------------------------------
// SOS
// ---------------------------------------------------------------------

export async function listSos() {
  const list = await rows<any>(sql`select a.id, a.errand_id, a.triggered_by_role::text role, a.status::text status,
      a.location, a.notified_count, a.update_count, a.created_at, a.updated_at, a.resolved_at, a.resolved_by,
      e.category::text category, e.status::text errand_status,
      rq.full_name rq_name, rq.phone rq_phone, rn.full_name rn_name, rn.phone rn_phone
    from sos_alerts a
    join errands e on e.id = a.errand_id
    join requesters rq on rq.id = e.requester_id
    left join runners rn on rn.id = e.runner_id
    order by (a.status = 'active') desc, a.created_at desc limit 100`);
  return list.map((a) => {
    const byRunner = a.role === "runner";
    return {
      id: a.id,
      errandId: a.errand_id,
      status: a.status,
      category: a.category,
      errandStatus: a.errand_status,
      triggeredBy: { role: a.role, name: byRunner ? a.rn_name : a.rq_name, phone: byRunner ? a.rn_phone : a.rq_phone },
      otherParty: {
        role: byRunner ? "requester" : "runner",
        name: byRunner ? a.rq_name : a.rn_name,
        phone: byRunner ? a.rq_phone : a.rn_phone,
      },
      location: a.location as { lat: number; lng: number },
      notifiedCount: num(a.notified_count),
      updateCount: num(a.update_count),
      createdAt: iso(a.created_at),
      updatedAt: iso(a.updated_at),
      resolvedAt: iso(a.resolved_at),
      resolvedBy: a.resolved_by ?? null,
    };
  });
}

export async function staffResolveSos(id: string) {
  const [row] = await db
    .update(sosAlerts)
    .set({ status: "resolved", resolvedAt: new Date(), resolvedBy: "staff" })
    .where(and(eq(sosAlerts.id, id), eq(sosAlerts.status, "active")))
    .returning({ id: sosAlerts.id });
  if (!row) throw AppErrors.conflict("That alert is already closed");
  return { id: row.id };
}

// ---------------------------------------------------------------------
// Trust incidents
// ---------------------------------------------------------------------

export const INCIDENT_TYPES = [
  "geofence_mismatch",
  "route_deviation",
  "theft_confirmed",
  "dispute_lost",
  "sos_triggered",
  "other",
] as const;

export const createIncidentSchema = z.object({
  runnerId: z.uuid("Pick a runner"),
  errandId: z.uuid("The errand id isn't valid").optional().or(z.literal("").transform(() => undefined)),
  type: z.enum(INCIDENT_TYPES),
  description: z.string().trim().min(5, "Describe what happened (at least 5 characters)").max(500),
});

export async function listIncidents(view: string | undefined) {
  const where =
    view === "confirmed"
      ? sql`i.confirmed = true`
      : view === "dismissed"
        ? sql`i.dismissed = true`
        : sql`i.confirmed = false and i.dismissed = false`;
  const list = await rows<any>(sql`select i.id, i.runner_id, i.errand_id, i.type::text type, i.description, i.confirmed,
      i.dismissed, i.created_at, i.reviewed_at, r.full_name, r.phone, r.trust_tier_level::text tier
    from trust_incidents i join runners r on r.id = i.runner_id
    where ${where} order by i.created_at desc limit 100`);
  const [counts] = await rows<any>(sql`select
      count(*) filter (where confirmed = false and dismissed = false) pending,
      count(*) filter (where confirmed = true) confirmed,
      count(*) filter (where dismissed = true) dismissed from trust_incidents`);
  return {
    counts: { pending: num(counts.pending), confirmed: num(counts.confirmed), dismissed: num(counts.dismissed) },
    incidents: list.map((i) => ({
      id: i.id,
      runnerId: i.runner_id,
      runnerName: i.full_name,
      phone: i.phone,
      tier: i.tier,
      errandId: i.errand_id ?? null,
      type: i.type,
      description: i.description,
      confirmed: !!i.confirmed,
      dismissed: !!i.dismissed,
      createdAt: iso(i.created_at),
      reviewedAt: iso(i.reviewed_at),
    })),
  };
}

async function review(id: string, patch: { confirmed: boolean; dismissed: boolean }, by: string) {
  const [row] = await db
    .update(trustIncidents)
    .set({ ...patch, reviewedByAdminId: by, reviewedAt: new Date() })
    .where(eq(trustIncidents.id, id))
    .returning({ runnerId: trustIncidents.runnerId });
  if (!row) throw AppErrors.notFound("No incident with that id");
  // A confirmed incident can lower the runner's tier; dismissing one can restore it.
  await refreshRunnerTier(row.runnerId);
  return { id };
}

export const confirmIncident = (id: string, by = "staff") => review(id, { confirmed: true, dismissed: false }, by);
export const dismissIncident = (id: string, by = "staff") => review(id, { confirmed: false, dismissed: true }, by);

export async function createIncident(input: z.infer<typeof createIncidentSchema>, by = "staff") {
  const [runner] = await db.select({ id: runners.id }).from(runners).where(eq(runners.id, input.runnerId)).limit(1);
  if (!runner) throw AppErrors.notFound("No runner with that id");
  const [row] = await db
    .insert(trustIncidents)
    .values({
      runnerId: input.runnerId,
      errandId: input.errandId || null,
      type: input.type,
      description: input.description,
      confirmed: true,
      reviewedByAdminId: by,
      reviewedAt: new Date(),
    })
    .returning({ id: trustIncidents.id });
  await refreshRunnerTier(input.runnerId);
  return { id: row.id };
}

/** Numbers for the sidebar badge and the dashboard's "needs attention" card. */
export async function safetyCounts() {
  const [c] = await rows<any>(sql`select
      (select count(*) from sos_alerts where status = 'active') active_sos,
      (select count(*) from trust_incidents where confirmed = false and dismissed = false) pending_incidents`);
  return { activeSos: num(c.active_sos), pendingIncidents: num(c.pending_incidents) };
}
