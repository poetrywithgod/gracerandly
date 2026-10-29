/**
 * Runner payouts: one Paystack bank transfer that bundles everything a
 * runner has earned and not yet been paid. Used by the runner's own
 * "Request payout" button (routes/runners.ts) and by staff retrying a failed
 * payout from the admin dashboard (routes/admin.ts).
 *
 * Bundles every escrow transaction currently "released" for the runner. The
 * transactions stay "released" (not yet "disbursed") until Paystack's
 * transfer.success webhook confirms the money moved (routes/wallet.ts). A
 * failed transfer leaves them "released", so starting a payout again simply
 * picks them up. Needs a verified payout account: an unverified one means
 * Paystack couldn't confirm the account number is real, and sending money
 * there would be a mistake, not a retry-able failure.
 */
import { randomUUID } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "../db/client";
import { escrowTransactions, runnerPayouts, runners } from "../db/schema";
import { AppErrors } from "./errors";
import { alertStaff } from "./admin-alerts";
import { createTransferRecipient, initiateTransfer } from "./payments";
import { heldTransactionIds } from "./disputes";
import { releaseRunnerBonus, reserveRunnerBonus } from "./referrals";

export async function startRunnerPayout(runnerId: string) {
  const [runner] = await db.select().from(runners).where(eq(runners.id, runnerId)).limit(1);
  if (!runner) throw AppErrors.notFound("Runner not found");

  if (!runner.bankName || !runner.bankAccountNumber || !runner.bankAccountName || !runner.bankCode) {
    throw AppErrors.validation("Add a payout account before requesting a payout");
  }
  if (!runner.bankAccountVerified) {
    throw AppErrors.validation("Your payout account couldn't be verified — check the details and re-save it");
  }

  // Pay for errands with an open dispute stays put until staff decide (lib/disputes.ts).
  const held = await heldTransactionIds(runnerId);
  const releasedRows = (
    await db
      .select({ id: escrowTransactions.id, runnerPayout: escrowTransactions.runnerPayout })
      .from(escrowTransactions)
      .where(and(eq(escrowTransactions.runnerId, runnerId), eq(escrowTransactions.status, "released")))
  ).filter((row) => !held.has(row.id));

  // Referral bonuses ride along with the earnings: claim them for this
  // payout up front (so two payout requests can't both take them) and put
  // them back if anything below fails.
  const payoutId = randomUUID();
  const bonus = await reserveRunnerBonus(runner.id, payoutId);
  const amount = releasedRows.reduce((sum, row) => sum + row.runnerPayout, 0) + bonus;
  if (amount <= 0) {
    throw AppErrors.validation(held.size > 0 ? "Your remaining earnings are on hold while a problem report is reviewed" : "Nothing to pay out yet");
  }

  let recipientCode = runner.paystackRecipientCode;
  if (!recipientCode) {
    try {
      recipientCode = await createTransferRecipient({
        accountNumber: runner.bankAccountNumber,
        bankCode: runner.bankCode,
        accountName: runner.bankAccountName,
      });
    } catch (err) {
      await releaseRunnerBonus(payoutId);
      throw err;
    }
    await db.update(runners).set({ paystackRecipientCode: recipientCode }).where(eq(runners.id, runner.id));
  }

  const reference = `gracerandly-payout-${randomUUID()}`;
  const transactionIds = releasedRows.map((row) => row.id);

  const [payoutRow] = await db
    .insert(runnerPayouts)
    .values({
      id: payoutId,
      runnerId: runner.id,
      amount,
      status: "pending",
      transactionIds,
      providerReference: reference,
    })
    .returning();

  try {
    await initiateTransfer({
      amountNaira: amount,
      recipientCode,
      reference,
      reason: `Gracerandly earnings payout — ${transactionIds.length} errand${transactionIds.length === 1 ? "" : "s"}`,
    });
  } catch (err) {
    await db
      .update(runnerPayouts)
      .set({ status: "failed", failureReason: err instanceof Error ? err.message : "Transfer failed" })
      .where(eq(runnerPayouts.id, payoutRow.id));
    await releaseRunnerBonus(payoutId);
    void alertStaff("payout_failed", "A runner payout failed", `A \u20a6${amount.toLocaleString("en-NG")} payout to ${runner.fullName} could not be started. Check the Payouts page and retry once the problem is fixed.`);
    throw AppErrors.validation("Couldn't start the transfer — try again in a moment");
  }

  return payoutRow;
}

// ---------------------------------------------------------------------
// Staff view (admin dashboard, Payouts page)
// ---------------------------------------------------------------------

async function rows<T>(query: ReturnType<typeof sql>): Promise<T[]> {
  return Array.from((await db.execute(query)) as unknown as T[]);
}
const num = (v: unknown) => Number(v ?? 0);

export async function adminListPayouts(status: string | undefined) {
  const filter = status === "pending" || status === "failed" || status === "success" ? status : null;
  const list = await rows<any>(sql`select p.id, p.runner_id, p.amount, p.status::text status, p.failure_reason,
      p.provider_reference, p.created_at, p.completed_at, r.full_name, r.phone, r.bank_name, r.bank_account_verified
    from runner_payouts p join runners r on r.id = p.runner_id
    ${filter ? sql`where p.status = ${filter}::runner_payout_status` : sql``}
    order by p.created_at desc limit 100`);
  const [summary] = await rows<any>(sql`select
      (select count(*) from runner_payouts where status = 'failed') failed,
      (select count(*) from runner_payouts where status = 'pending') pending,
      (select coalesce(sum(amount), 0) from runner_payouts where status = 'success') paid_total,
      (select coalesce(sum(runner_payout), 0) from escrow_transactions where status = 'released') owed`);
  return {
    summary: {
      failed: num(summary.failed),
      pending: num(summary.pending),
      paidTotal: num(summary.paid_total),
      owedToRunners: num(summary.owed),
    },
    payouts: list.map((p) => ({
      id: p.id,
      runnerId: p.runner_id,
      runnerName: p.full_name,
      phone: p.phone,
      bank: p.bank_name ?? null,
      bankVerified: !!p.bank_account_verified,
      amount: num(p.amount),
      status: p.status,
      failureReason: p.failure_reason ?? null,
      reference: p.provider_reference,
      createdAt: new Date(p.created_at).toISOString(),
      completedAt: p.completed_at ? new Date(p.completed_at).toISOString() : null,
    })),
  };
}

/** Staff retry: pays the runner everything currently owed, as a fresh transfer. */
export async function adminRetryPayout(runnerId: string) {
  const [inFlight] = await db
    .select({ id: runnerPayouts.id })
    .from(runnerPayouts)
    .where(and(eq(runnerPayouts.runnerId, runnerId), eq(runnerPayouts.status, "pending")))
    .orderBy(desc(runnerPayouts.createdAt))
    .limit(1);
  if (inFlight) {
    throw AppErrors.conflict("This runner already has a payout on its way. Wait for it to settle before retrying.");
  }
  return startRunnerPayout(runnerId);
}
