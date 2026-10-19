/**
 * Giving a requester's money back: when they cancel, when the runner leaves
 * part of the items budget unspent, when payment arrives for an errand that
 * no longer exists, or when staff decide to (admin page).
 *
 * Every refund is a row in `refunds` first, then a call to Paystack. Cancel
 * and leftover refunds are unique per payment (see the partial index in the
 * schema), so retries and webhook replays can never refund the same money
 * twice. If Paystack rejects the call the row is kept as "failed" so staff
 * can retry it from the admin page — a requester's money is never silently
 * dropped.
 *
 * The total refunded on a payment can never exceed what was charged.
 */
import { and, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { db } from "../db/client";
import { escrowTransactions, refunds, vendorDisbursements, type RefundRow } from "../db/schema";
import { AppErrors } from "./errors";
import { refundTransaction } from "./payments";
import { sendPushToUser } from "./push";

type Tx = typeof escrowTransactions.$inferSelect;
export type RefundReason = RefundRow["reason"];

const NAIRA = (n: number) => `₦${n.toLocaleString("en-NG")}`;

/** What the requester actually paid on Paystack for this payment. */
export function amountCharged(tx: Pick<Tx, "amount" | "itemsBudget" | "creditApplied">): number {
  return tx.amount + tx.itemsBudget - tx.creditApplied;
}

async function refundedSoFar(transactionId: string): Promise<number> {
  const [row] = await db
    .select({ total: sql<number>`coalesce(sum(${refunds.amount}), 0)` })
    .from(refunds)
    .where(and(eq(refunds.escrowTransactionId, transactionId), ne(refunds.status, "failed")));
  return Number(row?.total ?? 0);
}

async function sendToPaystack(row: RefundRow, reference: string): Promise<RefundRow> {
  try {
    const result = await refundTransaction({ reference, amountNaira: row.amount });
    const [updated] = await db
      .update(refunds)
      .set({
        status: result.status,
        providerReference: result.providerReference || null,
        failureReason: result.status === "failed" ? "Paystack reported the refund as failed" : null,
        updatedAt: new Date(),
      })
      .where(eq(refunds.id, row.id))
      .returning();
    if (result.status !== "failed") {
      void sendPushToUser("requester", row.requesterId, {
        title: "Refund on its way",
        body: `${NAIRA(row.amount)} is being refunded to your card or bank. It can take a few days to show.`,
        data: { type: "refund", errandId: row.errandId },
        channelId: "errands",
        ttl: 7 * 24 * 3600,
      });
    }
    return updated;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Refund request failed";
    console.error("[refunds] Paystack refund failed", row.id, message);
    const [updated] = await db
      .update(refunds)
      .set({ status: "failed", failureReason: message.slice(0, 300), updatedAt: new Date() })
      .where(eq(refunds.id, row.id))
      .returning();
    return updated;
  }
}

/**
 * Refunds `amount` of a payment. Returns the refund row, or null when there's
 * nothing to do (amount 0, or this once-only refund was already made).
 * `chargedOverride` is for a late payment whose row never reached "escrowed".
 */
export async function issueRefund(opts: {
  tx: Tx;
  amount: number;
  reason: RefundReason;
  note?: string;
  chargedOverride?: number;
}): Promise<RefundRow | null> {
  const { tx, reason } = opts;
  const amount = Math.floor(opts.amount);
  if (amount <= 0) return null;

  const charged = opts.chargedOverride ?? amountCharged(tx);
  const already = await refundedSoFar(tx.id);
  if (already + amount > charged) {
    if (reason === "admin") {
      throw AppErrors.validation(`Only ${NAIRA(Math.max(0, charged - already))} is left to refund on this payment`);
    }
    return null; // an automatic refund never goes over what was paid
  }

  const [row] = await db
    .insert(refunds)
    .values({ escrowTransactionId: tx.id, errandId: tx.errandId, requesterId: tx.requesterId, amount, reason, note: opts.note })
    .onConflictDoNothing()
    .returning();
  if (!row) return null; // already refunded for this reason

  return sendToPaystack(row, tx.providerReference);
}

/** Staff retry of a refund Paystack rejected. */
export async function retryRefund(refundId: string): Promise<RefundRow> {
  const [row] = await db.select().from(refunds).where(eq(refunds.id, refundId)).limit(1);
  if (!row) throw AppErrors.notFound("Refund not found");
  if (row.status !== "failed") throw AppErrors.conflict("Only failed refunds can be retried");
  const [tx] = await db.select().from(escrowTransactions).where(eq(escrowTransactions.id, row.escrowTransactionId)).limit(1);
  if (!tx) throw AppErrors.notFound("Payment not found");
  await db.update(refunds).set({ status: "pending", failureReason: null, updatedAt: new Date() }).where(eq(refunds.id, row.id));
  return sendToPaystack({ ...row, status: "pending" }, tx.providerReference);
}

/** Paystack's refund.* webhook: record how it ended. */
export async function settleRefundWebhook(data: {
  id?: number | string;
  refund_reference?: string | null;
  transaction_reference?: string;
  status?: string;
  reason?: string;
}): Promise<void> {
  const status = (data.status ?? "").toLowerCase();
  const mapped = status === "processed" ? "processed" : status === "failed" ? "failed" : null;
  if (!mapped) return;

  const keys = [data.id, data.refund_reference].filter((v): v is string | number => v !== undefined && v !== null && v !== "").map(String);
  let [row] = keys.length
    ? await db.select().from(refunds).where(inArray(refunds.providerReference, keys)).limit(1)
    : [];
  if (!row && data.transaction_reference) {
    // Fall back to the newest unfinished refund on that payment.
    [row] = await db
      .select({ r: refunds })
      .from(refunds)
      .innerJoin(escrowTransactions, eq(escrowTransactions.id, refunds.escrowTransactionId))
      .where(and(eq(escrowTransactions.providerReference, data.transaction_reference), eq(refunds.status, "pending")))
      .orderBy(desc(refunds.createdAt))
      .limit(1)
      .then((rows) => rows.map((r) => r.r));
  }
  if (!row || row.status === mapped) return;
  await db
    .update(refunds)
    .set({
      status: mapped,
      failureReason: mapped === "failed" ? (data.reason ?? "Paystack could not complete the refund").slice(0, 300) : null,
      updatedAt: new Date(),
    })
    .where(eq(refunds.id, row.id));
}

/**
 * After delivery: whatever part of the items budget the runner didn't spend
 * goes back to the requester. Money for transfers still in flight is held
 * back (if one of those fails the leftover can be refunded by staff).
 */
export async function refundUnspentItems(transactionId: string): Promise<void> {
  try {
    const [tx] = await db.select().from(escrowTransactions).where(eq(escrowTransactions.id, transactionId)).limit(1);
    if (!tx || tx.itemsBudget <= 0) return;
    const [pending] = await db
      .select({ total: sql<number>`coalesce(sum(${vendorDisbursements.amount}), 0)` })
      .from(vendorDisbursements)
      .where(and(eq(vendorDisbursements.errandId, tx.errandId), eq(vendorDisbursements.status, "pending")));
    const leftover = tx.itemsBudget - tx.itemsSpent - Number(pending?.total ?? 0);
    if (leftover > 0) {
      await issueRefund({ tx, amount: leftover, reason: "items_leftover", note: "Unspent items budget" });
    }
  } catch (err) {
    console.error("[refunds] couldn't refund unspent items", err instanceof Error ? err.message : err);
  }
}

/**
 * A payment that arrived for a transaction we'd already closed (the errand
 * was cancelled, or a newer payment link replaced it): send it all back.
 */
export async function refundLatePayment(tx: Tx, paidAmountNaira: number): Promise<void> {
  try {
    await issueRefund({ tx, amount: paidAmountNaira, reason: "cancelled", note: "Payment arrived after the errand was closed", chargedOverride: paidAmountNaira });
  } catch (err) {
    console.error("[refunds] late payment refund failed", err instanceof Error ? err.message : err);
  }
}

/** Convenience for routes that want to look an errand's payment up. */
export async function findPaidTransaction(errandId: string): Promise<Tx | undefined> {
  const [tx] = await db
    .select()
    .from(escrowTransactions)
    .where(and(eq(escrowTransactions.errandId, errandId), inArray(escrowTransactions.status, ["escrowed", "released", "disbursed", "refunded"])))
    .orderBy(desc(escrowTransactions.createdAt))
    .limit(1);
  return tx;
}

