/**
 * Disputes: a requester reports a problem with a delivered errand (item
 * missing, wrong item, overcharged...). One per errand, within
 * DISPUTE_WINDOW_HOURS (default 48) of delivery.
 *
 * While a dispute is open, the runner's pay for that errand is held back:
 * it stays out of payouts and out of the "available" balance (see
 * heldTransactionIds). Staff then decide from the admin Disputes page:
 *  - refund: send money back to the requester (never more than was paid), and
 *    optionally take the same amount out of the runner's pay when it hasn't
 *    been paid out yet, and record a confirmed "dispute_lost" incident;
 *  - reject: the runner's pay is released for the next payout.
 * Either way the requester is told what was decided, in staff's own words.
 */
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client";
import { disputes, errands, escrowTransactions, type DisputeRow } from "../db/schema";
import { alertStaff } from "./admin-alerts";
import { AppErrors } from "./errors";
import { sendPushToUser } from "./push";
import { amountCharged, findPaidTransaction, issueRefund } from "./refunds";
import { createIncident } from "./safety-admin";
import { getNumberSetting } from "./settings";

export const DISPUTE_REASONS = [
  "item_missing",
  "wrong_item",
  "damaged",
  "not_delivered",
  "overcharged",
  "rude_behavior",
  "other",
] as const;

export const DISPUTE_REASON_LABEL: Record<(typeof DISPUTE_REASONS)[number], string> = {
  item_missing: "An item was missing",
  wrong_item: "Wrong item",
  damaged: "Item damaged",
  not_delivered: "Never arrived",
  overcharged: "Charged too much",
  rude_behavior: "Rude or unsafe behaviour",
  other: "Something else",
};

const NAIRA = (n: number) => `₦${n.toLocaleString("en-NG")}`;

export function disputeWindowHours(): number {
  return getNumberSetting("DISPUTE_WINDOW_HOURS");
}

export const raiseDisputeSchema = z.object({
  reason: z.enum(DISPUTE_REASONS),
  description: z.string().trim().min(10, "Tell us what went wrong (at least 10 characters)").max(600),
});

type ErrandRow = typeof errands.$inferSelect;

export interface DisputeView {
  id: string;
  reason: string;
  description: string;
  status: "open" | "resolved";
  outcome: "refunded" | "rejected" | null;
  staffNote: string | null;
  refundAmount: number | null;
  createdAt: string;
  resolvedAt: string | null;
}

const toView = (d: DisputeRow): DisputeView => ({
  id: d.id,
  reason: d.reason,
  description: d.description,
  status: d.status,
  outcome: d.outcome,
  staffNote: d.staffNote,
  refundAmount: d.refundAmount,
  createdAt: d.createdAt.toISOString(),
  resolvedAt: d.resolvedAt ? d.resolvedAt.toISOString() : null,
});

/** When the errand was delivered: the payment release time, else the last update. */
async function deliveredAt(errand: ErrandRow): Promise<Date> {
  const [row] = await db
    .select({ at: sql<Date | null>`max(${escrowTransactions.releasedAt})` })
    .from(escrowTransactions)
    .where(eq(escrowTransactions.errandId, errand.id));
  return row?.at ? new Date(row.at) : errand.updatedAt;
}

export async function getDisputeState(errand: ErrandRow) {
  const [existing] = await db.select().from(disputes).where(eq(disputes.errandId, errand.id)).limit(1);
  if (existing) return { canDispute: false, windowEndsAt: null, dispute: toView(existing) };
  if (errand.status !== "delivered" || !errand.runnerId) return { canDispute: false, windowEndsAt: null, dispute: null };
  const endsAt = new Date((await deliveredAt(errand)).getTime() + disputeWindowHours() * 3600 * 1000);
  return { canDispute: endsAt.getTime() > Date.now(), windowEndsAt: endsAt.toISOString(), dispute: null };
}

export async function raiseDispute(errand: ErrandRow, requesterId: string, input: z.infer<typeof raiseDisputeSchema>) {
  const state = await getDisputeState(errand);
  if (state.dispute) throw AppErrors.conflict("You've already reported a problem with this errand");
  if (errand.status !== "delivered") throw AppErrors.conflict("You can report a problem once the errand has been delivered");
  if (!state.canDispute) {
    throw AppErrors.conflict(
      `Problems can be reported within ${disputeWindowHours()} hours of delivery. Please contact support from your profile instead.`
    );
  }
  const [row] = await db
    .insert(disputes)
    .values({
      errandId: errand.id,
      requesterId,
      runnerId: errand.runnerId,
      reason: input.reason,
      description: input.description,
    })
    .onConflictDoNothing()
    .returning();
  if (!row) throw AppErrors.conflict("You've already reported a problem with this errand");
  void alertStaff("dispute_new", "A problem was reported on an errand", `A requester reported: ${DISPUTE_REASON_LABEL[input.reason]}. "${input.description.slice(0, 200)}". The runner's pay is on hold until you decide (Disputes page).`);
  if (errand.runnerId) {
    void sendPushToUser("runner", errand.runnerId, {
      title: "A problem was reported on an errand",
      body: "Your pay for that errand is on hold while our team looks into it. We'll tell you the outcome.",
      data: { type: "dispute", errandId: errand.id },
      channelId: "errands",
      ttl: 7 * 24 * 3600,
    });
  }
  return toView(row);
}

/** Escrow transactions whose pay is held because of an open dispute. */
export async function heldTransactionIds(runnerId: string): Promise<Set<string>> {
  const list = await db
    .select({ id: escrowTransactions.id })
    .from(escrowTransactions)
    .innerJoin(disputes, and(eq(disputes.errandId, escrowTransactions.errandId), eq(disputes.status, "open")))
    .where(eq(escrowTransactions.runnerId, runnerId));
  return new Set(list.map((r) => r.id));
}

// ---------------------------------------------------------------------
// Staff
// ---------------------------------------------------------------------

async function rows<T>(query: ReturnType<typeof sql>): Promise<T[]> {
  return Array.from((await db.execute(query)) as unknown as T[]);
}
const num = (v: unknown) => Number(v ?? 0);
const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null);

export async function adminListDisputes(status: string | undefined) {
  const filter = status === "resolved" ? "resolved" : "open";
  const list = await rows<any>(sql`select d.id, d.errand_id, d.reason::text reason, d.description, d.status::text status, d.outcome::text outcome,
      d.created_at, d.resolved_at, rq.full_name rq_name, rn.full_name rn_name, e.category::text category
    from disputes d join requesters rq on rq.id = d.requester_id join errands e on e.id = d.errand_id
    left join runners rn on rn.id = d.runner_id
    where d.status = ${filter}::dispute_status order by d.created_at ${filter === "open" ? sql`asc` : sql`desc`} limit 100`);
  const [c] = await rows<any>(sql`select count(*) filter (where status = 'open') open, count(*) filter (where status = 'resolved') resolved from disputes`);
  return {
    counts: { open: num(c.open), resolved: num(c.resolved) },
    disputes: list.map((d) => ({
      id: d.id as string,
      errandId: d.errand_id as string,
      category: d.category as string,
      reason: d.reason as string,
      reasonLabel: DISPUTE_REASON_LABEL[d.reason as keyof typeof DISPUTE_REASON_LABEL] ?? d.reason,
      description: d.description as string,
      status: d.status as string,
      outcome: (d.outcome as string | null) ?? null,
      requester: d.rq_name as string,
      runner: (d.rn_name as string | null) ?? null,
      createdAt: iso(d.created_at),
      resolvedAt: iso(d.resolved_at),
    })),
  };
}

export async function adminGetDispute(id: string) {
  const [d] = await db.select().from(disputes).where(eq(disputes.id, id)).limit(1);
  if (!d) throw AppErrors.notFound("No dispute with that id");
  const [ctx] = await rows<any>(sql`select e.category::text category, e.status::text status, e.estimated_cost, e.items_budget,
      rq.full_name rq_name, rq.phone rq_phone, rn.full_name rn_name, rn.phone rn_phone,
      (select count(*) from disputes x where x.runner_id = d.runner_id and x.id <> d.id) runner_other_disputes,
      (select count(*) from disputes x where x.requester_id = d.requester_id and x.id <> d.id) requester_other_disputes
    from disputes d join errands e on e.id = d.errand_id join requesters rq on rq.id = d.requester_id left join runners rn on rn.id = d.runner_id
    where d.id = ${id}`);
  const tx = await findPaidTransaction(d.errandId);
  const [refunded] = tx
    ? await rows<any>(sql`select coalesce(sum(amount),0) total from refunds where escrow_transaction_id = ${tx.id} and status <> 'failed'`)
    : [{ total: 0 }];
  const charged = tx ? amountCharged(tx) : 0;
  return {
    dispute: {
      ...toView(d),
      reasonLabel: DISPUTE_REASON_LABEL[d.reason],
      errandId: d.errandId,
      requesterId: d.requesterId,
      runnerId: d.runnerId,
      runnerDeduction: d.runnerDeduction,
    },
    errand: { category: ctx.category as string, status: ctx.status as string, estimatedCost: num(ctx.estimated_cost), itemsBudget: num(ctx.items_budget) },
    requester: { name: ctx.rq_name as string, phone: ctx.rq_phone as string, otherDisputes: num(ctx.requester_other_disputes) },
    runner: d.runnerId ? { name: ctx.rn_name as string, phone: ctx.rn_phone as string, otherDisputes: num(ctx.runner_other_disputes) } : null,
    money: {
      charged,
      refunded: num(refunded.total),
      refundable: Math.max(0, charged - num(refunded.total)),
      runnerPay: tx ? tx.runnerPayout : 0,
      payStatus: tx ? tx.status : null,
      // Pay can only be taken back while it hasn't been paid out.
      canDeduct: !!tx && tx.status === "released",
    },
  };
}

export const resolveDisputeSchema = z.discriminatedUnion("outcome", [
  z.object({
    outcome: z.literal("refund"),
    amount: z.number().int().positive("Enter the refund amount in whole Naira"),
    deductFromRunner: z.boolean().optional().default(false),
    recordIncident: z.boolean().optional().default(false),
    note: z.string().trim().min(5, "Write a short note (the requester sees it)").max(300),
  }),
  z.object({
    outcome: z.literal("reject"),
    note: z.string().trim().min(5, "Write a short note (the requester sees it)").max(300),
  }),
]);

export async function resolveDispute(id: string, input: z.infer<typeof resolveDisputeSchema>, by = "staff") {
  // Claim it first so two staff clicking at once can't both act.
  const [claimed] = await db
    .update(disputes)
    .set({ status: "resolved", resolvedAt: new Date(), staffNote: input.note, outcome: input.outcome === "refund" ? "refunded" : "rejected" })
    .where(and(eq(disputes.id, id), eq(disputes.status, "open")))
    .returning();
  if (!claimed) {
    const [exists] = await db.select({ id: disputes.id }).from(disputes).where(eq(disputes.id, id)).limit(1);
    throw exists ? AppErrors.conflict("This dispute was already resolved") : AppErrors.notFound("No dispute with that id");
  }

  let deducted = 0;
  try {
    if (input.outcome === "refund") {
      const tx = await findPaidTransaction(claimed.errandId);
      if (!tx) throw AppErrors.conflict("That errand has no paid payment to refund");
      const refund = await issueRefund({ tx, amount: input.amount, reason: "admin", note: `Dispute: ${input.note}` });
      if (!refund) throw AppErrors.validation("Nothing was refunded");
      if (input.deductFromRunner && tx.status === "released") {
        deducted = Math.min(input.amount, tx.runnerPayout);
        await db
          .update(escrowTransactions)
          .set({ runnerPayout: tx.runnerPayout - deducted })
          .where(and(eq(escrowTransactions.id, tx.id), eq(escrowTransactions.status, "released")));
      }
      await db.update(disputes).set({ refundAmount: input.amount, runnerDeduction: deducted }).where(eq(disputes.id, id));
    }
  } catch (err) {
    // Put it back so staff can try again; nothing was refunded.
    await db
      .update(disputes)
      .set({ status: "open", resolvedAt: null, staffNote: null, outcome: null })
      .where(eq(disputes.id, id));
    throw err;
  }

  if (input.outcome === "refund" && input.recordIncident && claimed.runnerId) {
    await createIncident({
      runnerId: claimed.runnerId,
      errandId: claimed.errandId,
      type: "dispute_lost",
      description: `Dispute upheld (${DISPUTE_REASON_LABEL[claimed.reason]}): ${input.note}`.slice(0, 500),
    }, by);
  }

  void sendPushToUser("requester", claimed.requesterId, {
    title: input.outcome === "refund" ? "Your problem report was upheld" : "Your problem report was reviewed",
    body: input.outcome === "refund" ? `${NAIRA(input.amount)} is being refunded. ${input.note}` : input.note,
    data: { type: "dispute", errandId: claimed.errandId },
    channelId: "errands",
    ttl: 7 * 24 * 3600,
  });
  if (claimed.runnerId) {
    void sendPushToUser("runner", claimed.runnerId, {
      title: "A problem report was resolved",
      body:
        input.outcome === "refund"
          ? deducted > 0
            ? `The report was upheld and ${NAIRA(deducted)} was taken from your pay for that errand.`
            : "The report was upheld. Your pay for that errand was not changed."
          : "The report was not upheld. Your pay for that errand is back in your available balance.",
      data: { type: "dispute", errandId: claimed.errandId },
      channelId: "errands",
      ttl: 7 * 24 * 3600,
    });
  }
  return { id, outcome: input.outcome, deducted };
}

export async function openDisputeCount(): Promise<number> {
  const [r] = await rows<any>(sql`select count(*) n from disputes where status = 'open'`);
  return num(r.n);
}
