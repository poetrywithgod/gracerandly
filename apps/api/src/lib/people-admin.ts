/**
 * Staff view of people and errands (admin dashboard: People page, errand
 * detail page).
 *
 *  - People: search requesters and runners, open a profile (numbers, recent
 *    errands, tickets, refunds, payouts, incidents), suspend or reinstate.
 *  - Errands: everything about one errand on one page (who, money, refunds,
 *    reviews, SOS, tickets) with a merged timeline, plus the two things staff
 *    can do to a stuck errand: cancel it with a full refund, or take the
 *    runner off it so it goes back to the pool.
 */
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client";
import { errands, requesters, runners } from "../db/schema";
import { cancelErrandByRequester, dropErrandByRunner } from "./cancellation";
import { AppErrors } from "./errors";
import { sendPushToUser } from "./push";
import { forgetSuspension } from "./suspension";

async function rows<T>(query: ReturnType<typeof sql>): Promise<T[]> {
  return Array.from((await db.execute(query)) as unknown as T[]);
}
const num = (v: unknown) => Number(v ?? 0);
const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null);
const PAID = sql`('escrowed','released','disbursed')`;

// ---------------------------------------------------------------------
// People
// ---------------------------------------------------------------------

export async function listPeople(opts: { role?: string; q?: string; suspended?: boolean }) {
  const role = opts.role === "requester" || opts.role === "runner" ? opts.role : null;
  const q = (opts.q ?? "").trim();
  const like = `%${q.replace(/[\\%_]/g, (c) => "\\" + c)}%`;
  const search = (alias: string) =>
    q ? sql`and (${sql.raw(alias)}.full_name ilike ${like} or ${sql.raw(alias)}.phone ilike ${like} or coalesce(${sql.raw(alias)}.email,'') ilike ${like})` : sql``;
  const susp = (alias: string) => (opts.suspended ? sql`and ${sql.raw(alias)}.suspended_at is not null` : sql``);

  const parts = [];
  if (role !== "runner") {
    parts.push(sql`select 'requester' role, r.id, r.full_name, r.phone, r.email, r.created_at, r.suspended_at,
        (select count(*) from errands e where e.requester_id = r.id) errands,
        null::text tier, null::text verification
      from requesters r where true ${search("r")} ${susp("r")}`);
  }
  if (role !== "requester") {
    parts.push(sql`select 'runner' role, r.id, r.full_name, r.phone, r.email, r.created_at, r.suspended_at,
        (select count(*) from errands e where e.runner_id = r.id and e.status = 'delivered') errands,
        r.trust_tier_level::text tier, r.verification_status::text verification
      from runners r where true ${search("r")} ${susp("r")}`);
  }
  const query = parts.length === 2 ? sql`${parts[0]} union all ${parts[1]}` : parts[0];
  const list = await rows<any>(sql`select * from (${query}) p order by created_at desc limit 100`);
  const [c] = await rows<any>(sql`select
      (select count(*) from requesters) requesters, (select count(*) from runners) runners,
      (select count(*) from requesters where suspended_at is not null) + (select count(*) from runners where suspended_at is not null) suspended`);
  return {
    counts: { requesters: num(c.requesters), runners: num(c.runners), suspended: num(c.suspended) },
    people: list.map((p) => ({
      role: p.role as "requester" | "runner",
      id: p.id as string,
      fullName: p.full_name as string,
      phone: p.phone as string,
      email: (p.email as string | null) ?? null,
      joinedAt: iso(p.created_at),
      suspended: !!p.suspended_at,
      errands: num(p.errands),
      tier: (p.tier as string | null) ?? null,
      verification: (p.verification as string | null) ?? null,
    })),
  };
}

export async function getPerson(role: string, id: string) {
  if (role !== "requester" && role !== "runner") throw AppErrors.notFound("Unknown account type");
  const isRunner = role === "runner";
  const [base] = isRunner
    ? await rows<any>(sql`select * from runners where id = ${id}`)
    : await rows<any>(sql`select * from requesters where id = ${id}`);
  if (!base) throw AppErrors.notFound("No account with that id");

  const side = sql.raw(isRunner ? "e.runner_id" : "e.requester_id");
  const [counts] = await rows<any>(sql`select count(*) total,
      count(*) filter (where e.status = 'delivered') delivered,
      count(*) filter (where e.status = 'cancelled') cancelled,
      count(*) filter (where e.status not in ('delivered','cancelled','pending_match')) active,
      count(*) filter (where e.status = 'pending_match') waiting
    from errands e where ${side} = ${id}`);
  const [rating] = await rows<any>(sql`select avg(rating)::float avg, count(*) n from errand_reviews where reviewee_id = ${id}`);
  const recent = await rows<any>(sql`select e.id, e.category::text category, e.status::text status, e.estimated_cost, e.created_at,
      rq.full_name rq_name, rn.full_name rn_name
    from errands e join requesters rq on rq.id = e.requester_id left join runners rn on rn.id = e.runner_id
    where ${side} = ${id} order by e.created_at desc limit 10`);
  const tickets = await rows<any>(sql`select id, subject, status::text status, category::text category, updated_at
    from support_tickets where user_id = ${id} order by updated_at desc limit 5`);

  let money: Record<string, number> = {};
  let extra: Record<string, unknown> = {};
  if (isRunner) {
    const [m] = await rows<any>(sql`select
        coalesce(sum(runner_payout) filter (where status in ('released','disbursed')), 0) earned,
        coalesce(sum(runner_payout) filter (where status = 'released'), 0) owed
      from escrow_transactions where runner_id = ${id}`);
    money = { earned: num(m.earned), owedNow: num(m.owed) };
    const payouts = await rows<any>(sql`select id, amount, status::text status, failure_reason, created_at from runner_payouts
      where runner_id = ${id} order by created_at desc limit 5`);
    const incidents = await rows<any>(sql`select id, type::text type, description, confirmed, dismissed, errand_id, created_at
      from trust_incidents where runner_id = ${id} order by created_at desc limit 10`);
    extra = {
      runner: {
        tier: base.trust_tier_level,
        verificationStatus: base.verification_status,
        online: !!base.is_online,
        bank: base.bank_name ? { name: base.bank_name, verified: !!base.bank_account_verified } : null,
        vehicle: base.vehicle_type ?? null,
      },
      payouts: payouts.map((p) => ({ id: p.id, amount: num(p.amount), status: p.status, failureReason: p.failure_reason ?? null, createdAt: iso(p.created_at) })),
      incidents: incidents.map((i) => ({
        id: i.id,
        type: i.type,
        description: i.description,
        confirmed: !!i.confirmed,
        dismissed: !!i.dismissed,
        errandId: i.errand_id ?? null,
        createdAt: iso(i.created_at),
      })),
    };
  } else {
    const [m] = await rows<any>(sql`select coalesce(sum(amount + items_budget - credit_applied) filter (where status in ${PAID}), 0) spent
      from escrow_transactions where requester_id = ${id}`);
    const [rf] = await rows<any>(sql`select coalesce(sum(amount) filter (where status <> 'failed'), 0) refunded from refunds where requester_id = ${id}`);
    money = { spent: num(m.spent), refunded: num(rf.refunded) };
    const refundList = await rows<any>(sql`select id, errand_id, amount, reason::text reason, status::text status, created_at
      from refunds where requester_id = ${id} order by created_at desc limit 5`);
    extra = {
      refunds: refundList.map((r) => ({ id: r.id, errandId: r.errand_id, amount: num(r.amount), reason: r.reason, status: r.status, createdAt: iso(r.created_at) })),
    };
  }

  return {
    person: {
      role: role as "requester" | "runner",
      id: base.id as string,
      fullName: base.full_name as string,
      phone: base.phone as string,
      email: (base.email as string | null) ?? null,
      joinedAt: iso(base.created_at),
      suspended: !!base.suspended_at,
      suspendedAt: iso(base.suspended_at),
      suspendedReason: (base.suspended_reason as string | null) ?? null,
      referralCode: (base.referral_code as string | null) ?? null,
    },
    stats: {
      errands: num(counts.total),
      delivered: num(counts.delivered),
      cancelled: num(counts.cancelled),
      inProgress: num(counts.active),
      waiting: num(counts.waiting),
      rating: rating.n > 0 ? Math.round(rating.avg * 10) / 10 : null,
      ratings: num(rating.n),
      ...money,
    },
    recentErrands: recent.map((e) => ({
      id: e.id,
      category: e.category,
      status: e.status,
      estimatedCost: num(e.estimated_cost),
      requester: e.rq_name,
      runner: e.rn_name ?? null,
      createdAt: iso(e.created_at),
    })),
    tickets: tickets.map((t) => ({ id: t.id, subject: t.subject, status: t.status, category: t.category, updatedAt: iso(t.updated_at) })),
    ...extra,
  };
}

export const suspendSchema = z.object({
  reason: z.string().trim().min(5, "Give a reason of at least 5 characters (the person sees it)").max(300),
});

export async function setSuspended(role: string, id: string, reason: string | null) {
  if (role !== "requester" && role !== "runner") throw AppErrors.notFound("Unknown account type");
  const table = role === "requester" ? requesters : runners;
  const patch =
    role === "runner" && reason
      ? { suspendedAt: new Date(), suspendedReason: reason, isOnline: false } // a suspended runner stops receiving offers
      : { suspendedAt: reason ? new Date() : null, suspendedReason: reason };
  const [row] = await db
    .update(table)
    .set(patch as never)
    .where(eq(table.id, id))
    .returning({ id: table.id });
  if (!row) throw AppErrors.notFound("No account with that id");
  forgetSuspension(role, id);
  return { id };
}

// ---------------------------------------------------------------------
// Errand detail
// ---------------------------------------------------------------------

export async function getErrandDetail(id: string) {
  const [e] = await rows<any>(sql`select e.*, e.category::text cat, e.status::text st, e.urgency::text urg,
      rq.full_name rq_name, rq.phone rq_phone, rq.suspended_at rq_susp,
      rn.full_name rn_name, rn.phone rn_phone, rn.suspended_at rn_susp
    from errands e join requesters rq on rq.id = e.requester_id left join runners rn on rn.id = e.runner_id
    where e.id = ${id}`);
  if (!e) throw AppErrors.notFound("No errand with that id");

  const [payments, refundRows, reviews, sos, tickets, incidents, disb, chat] = await Promise.all([
    rows<any>(sql`select id, status::text status, amount, items_budget, items_spent, credit_applied, commission_amount, runner_payout,
        created_at, released_at from escrow_transactions where errand_id = ${id} order by created_at`),
    rows<any>(sql`select id, amount, reason::text reason, note, status::text status, failure_reason, created_at from refunds where errand_id = ${id} order by created_at`),
    rows<any>(sql`select reviewer_role::text role, rating, comment, created_at from errand_reviews where errand_id = ${id} order by created_at`),
    rows<any>(sql`select id, triggered_by_role::text role, status::text status, notified_count, created_at, resolved_at, resolved_by from sos_alerts where errand_id = ${id} order by created_at`),
    rows<any>(sql`select id, subject, status::text status, created_at from support_tickets where errand_id = ${id} order by created_at`),
    rows<any>(sql`select id, type::text type, confirmed, dismissed, created_at from trust_incidents where errand_id = ${id} order by created_at`),
    rows<any>(sql`select vendor_name, amount, status::text status, created_at from vendor_disbursements where errand_id = ${id} order by created_at`),
    rows<any>(sql`select count(*) n from chat_messages where errand_id = ${id}`),
  ]);

  const status = e.st as string;
  const paid = payments.find((p) => ["escrowed", "released", "disbursed", "refunded"].includes(p.status));
  const charged = paid ? num(paid.amount) + num(paid.items_budget) - num(paid.credit_applied) : 0;
  const refunded = refundRows.filter((r) => r.status !== "failed").reduce((t, r) => t + num(r.amount), 0);

  type Ev = { at: string; text: string; tone: "good" | "bad" | "warn" | "info" };
  const events: Ev[] = [{ at: iso(e.created_at)!, text: `Posted by ${e.rq_name}`, tone: "info" }];
  for (const p of payments) {
    events.push({ at: iso(p.created_at)!, text: `Payment started (${p.status})`, tone: "info" });
    if (p.released_at) events.push({ at: iso(p.released_at)!, text: "Payment released to the runner", tone: "good" });
  }
  for (const d of disb) events.push({ at: iso(d.created_at)!, text: `Runner paid ${d.vendor_name} (${d.status})`, tone: d.status === "failed" ? "bad" : "info" });
  for (const r of refundRows) events.push({ at: iso(r.created_at)!, text: `Refund of \u20a6${num(r.amount).toLocaleString("en-NG")} ${r.status}${r.note ? ` — ${r.note}` : ""}`, tone: r.status === "failed" ? "bad" : "good" });
  for (const s of sos) {
    events.push({ at: iso(s.created_at)!, text: `SOS pressed by the ${s.role}`, tone: "bad" });
    if (s.resolved_at) events.push({ at: iso(s.resolved_at)!, text: `SOS closed by ${s.resolved_by === "self" ? "the person" : s.resolved_by === "auto" ? "the system" : "staff"}`, tone: "good" });
  }
  for (const t of tickets) events.push({ at: iso(t.created_at)!, text: `Support ticket: ${t.subject}`, tone: "warn" });
  for (const i of incidents) events.push({ at: iso(i.created_at)!, text: `Runner incident flagged (${i.type})`, tone: "warn" });
  for (const r of reviews) events.push({ at: iso(r.created_at)!, text: `${r.role === "requester" ? "Requester" : "Runner"} left a ${r.rating}-star review`, tone: "info" });
  // There is no status history table, so the last status change is shown from updated_at.
  if (iso(e.updated_at) !== iso(e.created_at)) {
    events.push({ at: iso(e.updated_at)!, text: `Last update: ${status.replace(/_/g, " ")}`, tone: status === "cancelled" ? "bad" : status === "delivered" ? "good" : "info" });
  }
  events.sort((a, b) => a.at.localeCompare(b.at));

  const canCancel = ["pending_match", "accepted", "en_route_to_pickup"].includes(status);
  const canUnassign = ["accepted", "en_route_to_pickup"].includes(status);

  return {
    errand: {
      id: e.id as string,
      category: e.cat as string,
      status,
      urgency: e.urg as string,
      createdAt: iso(e.created_at),
      updatedAt: iso(e.updated_at),
      scheduledFor: iso(e.scheduled_for),
      estimatedCost: num(e.estimated_cost),
      itemsBudget: num(e.items_budget),
      finalCost: e.final_cost == null ? null : num(e.final_cost),
      pickup: e.pickup,
      dropoff: e.dropoff,
      stops: Array.isArray(e.stops) ? e.stops.length : 0,
      items: Array.isArray(e.items) ? e.items : [],
      instructions: e.instructions ?? null,
      isRecurring: !!e.is_recurring,
    },
    requester: { id: e.requester_id as string, name: e.rq_name as string, phone: e.rq_phone as string, suspended: !!e.rq_susp },
    runner: e.runner_id ? { id: e.runner_id as string, name: e.rn_name as string, phone: e.rn_phone as string, suspended: !!e.rn_susp } : null,
    money: {
      charged,
      refunded,
      refundable: Math.max(0, charged - refunded),
      payments: payments.map((p) => ({
        id: p.id,
        status: p.status,
        amount: num(p.amount),
        itemsBudget: num(p.items_budget),
        itemsSpent: num(p.items_spent),
        credit: num(p.credit_applied),
        commission: num(p.commission_amount),
        runnerPayout: num(p.runner_payout),
        createdAt: iso(p.created_at),
      })),
      refunds: refundRows.map((r) => ({ id: r.id, amount: num(r.amount), reason: r.reason, note: r.note ?? null, status: r.status, failureReason: r.failure_reason ?? null, createdAt: iso(r.created_at) })),
    },
    reviews: reviews.map((r) => ({ role: r.role, rating: num(r.rating), comment: r.comment ?? null })),
    sos: sos.map((s) => ({ id: s.id, role: s.role, status: s.status, notified: num(s.notified_count), createdAt: iso(s.created_at) })),
    tickets: tickets.map((t) => ({ id: t.id, subject: t.subject, status: t.status })),
    chatMessages: num(chat[0]?.n),
    timeline: events,
    actions: { canCancel, canUnassign },
  };
}

// ---------------------------------------------------------------------
// Staff actions on an errand
// ---------------------------------------------------------------------

export const staffCancelSchema = z.object({
  reason: z.string().trim().min(5, "Give a reason of at least 5 characters (both people see it)").max(200),
  waiveFee: z.boolean().optional().default(false),
});

/** Cancels an errand that hasn't been picked up, refunds the requester, tells both people. */
export async function staffCancelErrand(id: string, input: z.infer<typeof staffCancelSchema>) {
  const [existing] = await db.select().from(errands).where(eq(errands.id, id)).limit(1);
  if (!existing) throw AppErrors.notFound("No errand with that id");
  if (existing.status !== "delivered" && existing.status !== "cancelled" && !["pending_match", "accepted", "en_route_to_pickup"].includes(existing.status)) {
    throw AppErrors.conflict(
      "The runner has already picked this up, so money has been spent. Use a partial refund from the Refunds page instead of cancelling."
    );
  }
  const outcome = await cancelErrandByRequester(existing, { waiveFee: input.waiveFee });
  void sendPushToUser("requester", existing.requesterId, {
    title: "Your errand was cancelled by support",
    body: `${input.reason}${outcome.refundedNaira > 0 ? ` We're refunding ₦${outcome.refundedNaira.toLocaleString("en-NG")}.` : ""}`,
    data: { type: "errand_cancelled", errandId: id },
    channelId: "errands",
    ttl: 6 * 3600,
  });
  return { refundedNaira: outcome.refundedNaira, feeNaira: outcome.feeNaira };
}

export const staffUnassignSchema = z.object({
  reason: z.string().trim().min(5, "Give a reason of at least 5 characters (the runner sees it)").max(200),
});

/** Takes the runner off an errand that hasn't been picked up; it goes back to other runners. */
export async function staffUnassignRunner(id: string, input: z.infer<typeof staffUnassignSchema>) {
  const [existing] = await db.select().from(errands).where(eq(errands.id, id)).limit(1);
  if (!existing) throw AppErrors.notFound("No errand with that id");
  if (!existing.runnerId) throw AppErrors.conflict("No runner is assigned to this errand");
  const runnerId = existing.runnerId;
  await dropErrandByRunner(existing, runnerId);
  void sendPushToUser("runner", runnerId, {
    title: "You were taken off an errand",
    body: input.reason,
    data: { type: "errand_cancelled", errandId: id },
    channelId: "errands",
    ttl: 6 * 3600,
  });
  return { id };
}
