import { Router } from "express";
import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client";
import { escrowTransactions, errands, requesters } from "../db/schema";
import { payForErrandSchema, verifyPaymentSchema } from "../schemas/wallet";
import { AppErrors } from "../lib/errors";
import { asyncHandler } from "../lib/asyncHandler";
import { requireAuth } from "../middleware/requireAuth";
import {
  initializeTransaction,
  verifyTransaction,
  verifyWebhookSignature,
  koboToAmount,
  splitCommission,
} from "../lib/payments";
import type { EscrowTransaction } from "@gracerandly/shared-types";

const router: Router = Router();

function toEscrowTransaction(row: typeof escrowTransactions.$inferSelect): EscrowTransaction {
  return {
    id: row.id,
    errandId: row.errandId,
    requesterId: row.requesterId,
    runnerId: row.runnerId ?? undefined,
    amount: row.amount,
    commissionAmount: row.commissionAmount,
    runnerPayout: row.runnerPayout,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    releasedAt: row.releasedAt?.toISOString() ?? undefined,
  };
}

/**
 * Applies a successful/failed verification result to a transaction row —
 * shared between the manual /verify endpoint and the webhook, so the two
 * paths (whichever fires first) behave identically and are safe to run
 * more than once for the same reference.
 */
async function settleTransaction(
  transactionId: string,
  outcome: { success: boolean; amountNaira: number },
  expectedAmount: number
) {
  if (!outcome.success) {
    await db
      .update(escrowTransactions)
      .set({ status: "failed" })
      .where(and(eq(escrowTransactions.id, transactionId), eq(escrowTransactions.status, "pending")));
    return "failed" as const;
  }

  if (outcome.amountNaira !== expectedAmount) {
    // Paid, but not the right amount — don't silently escrow a mismatched
    // payment. This needs a human, not an automatic resolution.
    await db
      .update(escrowTransactions)
      .set({ status: "failed" })
      .where(and(eq(escrowTransactions.id, transactionId), eq(escrowTransactions.status, "pending")));
    return "amount_mismatch" as const;
  }

  // The status="pending" guard makes this idempotent — whichever of
  // verify/webhook lands first wins, the second is a no-op.
  await db
    .update(escrowTransactions)
    .set({ status: "escrowed" })
    .where(and(eq(escrowTransactions.id, transactionId), eq(escrowTransactions.status, "pending")));
  return "escrowed" as const;
}

router.post(
  "/errands/:errandId/pay",
  requireAuth,
  asyncHandler(async (req, res) => {
    const input = payForErrandSchema.parse(req.body);
    const errandId = z.uuid().parse(req.params.errandId);

    const [errand] = await db
      .select()
      .from(errands)
      .where(and(eq(errands.id, errandId), eq(errands.requesterId, req.requesterId!)))
      .limit(1);
    if (!errand) {
      throw AppErrors.notFound("Errand not found");
    }
    if (errand.status !== "pending_match") {
      throw AppErrors.conflict("This errand can no longer be paid for");
    }

    const existingPaid = await db
      .select({ id: escrowTransactions.id })
      .from(escrowTransactions)
      .where(
        and(
          eq(escrowTransactions.errandId, errandId),
          eq(escrowTransactions.status, "escrowed")
        )
      )
      .limit(1);
    if (existingPaid.length > 0) {
      throw AppErrors.conflict("This errand has already been paid for");
    }

    const [requester] = await db
      .select()
      .from(requesters)
      .where(eq(requesters.id, req.requesterId!))
      .limit(1);
    if (!requester?.email) {
      throw AppErrors.validation("Add an email address to your profile before paying for an errand");
    }

    const { commissionAmount, runnerPayout } = splitCommission(errand.estimatedCost);
    const reference = `gracerandly-${randomUUID()}`;

    const { authorizationUrl } = await initializeTransaction({
      email: requester.email,
      amountNaira: errand.estimatedCost,
      reference,
      callbackUrl: input.callbackUrl,
    });

    await db.insert(escrowTransactions).values({
      errandId,
      requesterId: req.requesterId!,
      amount: errand.estimatedCost,
      commissionAmount,
      runnerPayout,
      status: "pending",
      providerReference: reference,
    });

    res.status(201).json({ authorizationUrl, reference });
  })
);

router.post(
  "/verify",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { reference } = verifyPaymentSchema.parse(req.body);

    const [transaction] = await db
      .select()
      .from(escrowTransactions)
      .where(
        and(
          eq(escrowTransactions.providerReference, reference),
          eq(escrowTransactions.requesterId, req.requesterId!)
        )
      )
      .limit(1);
    if (!transaction) {
      throw AppErrors.notFound("No payment found for that reference");
    }

    // Already settled (possibly by the webhook, which can beat this
    // endpoint to it) — just report the current state rather than
    // re-verifying with Paystack.
    if (transaction.status !== "pending") {
      res.json({ transaction: toEscrowTransaction(transaction) });
      return;
    }

    const outcome = await verifyTransaction(reference);
    const result = await settleTransaction(transaction.id, outcome, transaction.amount);

    const [updated] = await db
      .select()
      .from(escrowTransactions)
      .where(eq(escrowTransactions.id, transaction.id))
      .limit(1);

    if (result !== "escrowed") {
      throw AppErrors.validation(
        result === "amount_mismatch"
          ? "The amount paid didn't match — contact support"
          : "Payment could not be verified"
      );
    }

    res.json({ transaction: toEscrowTransaction(updated) });
  })
);

// Paystack calls this directly (no requester auth — authenticity comes
// from the signature check instead). Always acknowledges with 200 quickly
// per their docs, even when the reference is unrecognized, so they don't
// retry indefinitely for something on our end that isn't transient.
router.post(
  "/paystack/webhook",
  asyncHandler(async (req, res) => {
    const signature = req.headers["x-paystack-signature"];
    const rawBody = req.rawBody;
    if (!rawBody || !verifyWebhookSignature(rawBody, typeof signature === "string" ? signature : undefined)) {
      res.status(401).json({ error: { code: "invalid_signature", message: "Invalid signature" } });
      return;
    }

    const event = req.body as { event?: string; data?: { reference?: string; amount?: number } };
    if (event.event !== "charge.success" || !event.data?.reference) {
      res.status(200).json({ received: true });
      return;
    }

    const [transaction] = await db
      .select()
      .from(escrowTransactions)
      .where(eq(escrowTransactions.providerReference, event.data.reference))
      .limit(1);

    if (transaction && transaction.status === "pending") {
      await settleTransaction(
        transaction.id,
        { success: true, amountNaira: koboToAmount(event.data.amount ?? 0) },
        transaction.amount
      );
    }

    res.status(200).json({ received: true });
  })
);

router.get(
  "/transactions",
  requireAuth,
  asyncHandler(async (req, res) => {
    const rows = await db
      .select()
      .from(escrowTransactions)
      .where(eq(escrowTransactions.requesterId, req.requesterId!))
      .orderBy(desc(escrowTransactions.createdAt));

    res.json({ transactions: rows.map(toEscrowTransaction) });
  })
);

export default router;
