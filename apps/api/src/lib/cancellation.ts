/**
 * Cancelling and dropping out of errands, with the money handled properly.
 *
 * Requester cancels (cancelErrandByRequester):
 *  - Before a runner accepts: everything paid is refunded, no fee.
 *  - After a runner accepted but before they've picked up: the runner keeps a
 *    small cancellation fee (CANCELLATION_FEE_NAIRA, default ₦500) for the
 *    wasted trip and the rest is refunded.
 *  - Once the runner has picked up (or is buying/delivering): not allowed
 *    here — real money has been spent, so it goes through support.
 *  Referral credit the payment had used is given back either way.
 *
 * Runner drops out (dropErrandByRunner): only before pickup. The errand goes
 * back to the pool for other runners and the requester is told.
 */
import { and, eq, inArray } from "drizzle-orm";
import { db } from "../db/client";
import { errands, escrowTransactions } from "../db/schema";
import { AppErrors } from "./errors";
import { notifyNearbyRunners } from "./errand-alerts";
import { notifyRunnerOfCancellation } from "./errand-notify";
import { sendPushToUser } from "./push";
import { restoreCredit, releaseCredit } from "./referrals";
import { amountCharged, issueRefund } from "./refunds";
import { getNumberSetting } from "./settings";

type ErrandRow = typeof errands.$inferSelect;

const CANCELLABLE = ["pending_match", "accepted", "en_route_to_pickup"] as const;

export function cancellationFeeNaira(): number {
  return getNumberSetting("CANCELLATION_FEE_NAIRA");
}

export interface CancelOutcome {
  errand: ErrandRow;
  /** Naira going back to the requester (may take a few days to arrive). */
  refundedNaira: number;
  /** Naira the runner keeps for the wasted trip. */
  feeNaira: number;
}

export async function cancelErrandByRequester(
  existing: ErrandRow,
  opts: { waiveFee?: boolean } = {}
): Promise<CancelOutcome> {
  if (existing.status === "delivered" || existing.status === "cancelled") {
    throw AppErrors.conflict(`This errand is already ${existing.status}`);
  }
  if (!(CANCELLABLE as readonly string[]).includes(existing.status)) {
    throw AppErrors.conflict(
      "Your runner has already picked up this errand, so it can't be cancelled here. Please contact support from your profile and we'll sort it out."
    );
  }

  // Only cancels if nothing moved in the meantime (the runner may have just
  // reached the pickup).
  const [row] = await db
    .update(errands)
    .set({ status: "cancelled" })
    .where(and(eq(errands.id, existing.id), eq(errands.status, existing.status)))
    .returning();
  if (!row) throw AppErrors.conflict("This errand just changed — refresh and try again");

  const hadRunner = existing.status !== "pending_match" && !!existing.runnerId;
  // Staff can cancel without the runner's fee (when it wasn't the requester's fault).
  const chargeFee = hadRunner && !opts.waiveFee;
  let refundedNaira = 0;
  let feeNaira = 0;

  const payments = await db.select().from(escrowTransactions).where(eq(escrowTransactions.errandId, existing.id));
  for (const tx of payments) {
    if (tx.status === "pending") {
      // Not paid (yet). Close it; if the requester pays the old link anyway,
      // the webhook refunds it (see routes/wallet.ts).
      await db
        .update(escrowTransactions)
        .set({ status: "failed" })
        .where(and(eq(escrowTransactions.id, tx.id), eq(escrowTransactions.status, "pending")));
      await releaseCredit(tx.id);
      continue;
    }
    if (tx.status !== "escrowed") continue;

    const charged = amountCharged(tx);
    if (chargeFee) {
      const fee = Math.min(cancellationFeeNaira(), charged);
      const [claimed] = await db
        .update(escrowTransactions)
        .set({ status: "released", releasedAt: new Date(), runnerId: existing.runnerId, runnerPayout: fee, commissionAmount: 0 })
        .where(and(eq(escrowTransactions.id, tx.id), eq(escrowTransactions.status, "escrowed")))
        .returning({ id: escrowTransactions.id });
      if (!claimed) continue;
      feeNaira += fee;
      refundedNaira += charged - fee;
      await issueRefund({ tx, amount: charged - fee, reason: "cancelled", note: "Cancelled after a runner accepted" });
    } else {
      const [claimed] = await db
        .update(escrowTransactions)
        .set({ status: "refunded" })
        .where(and(eq(escrowTransactions.id, tx.id), eq(escrowTransactions.status, "escrowed")))
        .returning({ id: escrowTransactions.id });
      if (!claimed) continue;
      refundedNaira += charged;
      await issueRefund({ tx, amount: charged, reason: "cancelled", note: hadRunner ? "Cancelled by staff, no fee charged" : "Cancelled before a runner accepted" });
    }
    await restoreCredit(tx.id);
  }

  void notifyRunnerOfCancellation(existing, feeNaira);
  return { errand: row, refundedNaira, feeNaira };
}

/** A runner pulling out before pickup. The errand is offered to other runners again. */
export async function dropErrandByRunner(existing: ErrandRow, runnerId: string): Promise<ErrandRow> {
  if (existing.runnerId !== runnerId) throw AppErrors.notFound("Errand not found");
  if (existing.status !== "accepted" && existing.status !== "en_route_to_pickup") {
    throw AppErrors.conflict("You can only drop out before you've picked up — contact support if there's a problem");
  }

  const [row] = await db
    .update(errands)
    .set({ status: "pending_match", runnerId: null })
    .where(and(eq(errands.id, existing.id), eq(errands.runnerId, runnerId), inArray(errands.status, ["accepted", "en_route_to_pickup"])))
    .returning();
  if (!row) throw AppErrors.conflict("This errand just changed — refresh and try again");

  // The paid money stays held; it attaches to whoever accepts next.
  await db
    .update(escrowTransactions)
    .set({ runnerId: null })
    .where(and(eq(escrowTransactions.errandId, existing.id), eq(escrowTransactions.status, "escrowed")));

  void sendPushToUser("requester", existing.requesterId, {
    title: "Your runner dropped out",
    body: "Don't worry — we're offering your errand to other runners now. Your payment is still safe.",
    data: { type: "errand_status", errandId: existing.id, status: "pending_match" },
    channelId: "errands",
    ttl: 6 * 3600,
  });
  void notifyNearbyRunners(row);
  return row;
}
