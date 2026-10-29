/**
 * Referral program.
 *
 * Everyone (requesters and runners) has a short referral code. A new person
 * can enter one at signup; that records a "pending" referral. When the new
 * person completes their first *qualifying* errand — delivered, paid through
 * the app, and worth at least REFERRAL_MIN_ERRAND_NAIRA — the referral
 * qualifies and both sides earn a reward:
 *
 *  - a requester's reward is credit taken off a later errand at checkout
 *    (reserveCredit / settleCredit below, used by routes/wallet.ts);
 *  - a runner's reward is cash added to their next payout
 *    (reserveRunnerBonus / settleRunnerBonus, used by routes/runners.ts and
 *    the Paystack webhook).
 *
 * Rewards are rows in referral_rewards that move available -> reserved ->
 * used, so a failed payment or transfer simply puts them back.
 *
 * Amounts and limits are env-configurable (see .env.example). Only referral
 * codes typed at signup count, and the reward needs a real paid delivery, so
 * fake signups earn nothing.
 */
import { randomInt } from "node:crypto";
import { and, asc, count, eq, sql } from "drizzle-orm";
import { db } from "../db/client";
import { referralRewards, referrals, requesters, runners } from "../db/schema";
import { sendPushToUser } from "./push";
import { getNumberSetting } from "./settings";

export type ReferralRole = "requester" | "runner";

export function referralConfig() {
  return {
    referrerReward: getNumberSetting("REFERRAL_REFERRER_NAIRA"),
    refereeReward: getNumberSetting("REFERRAL_REFEREE_NAIRA"),
    minErrandNaira: getNumberSetting("REFERRAL_MIN_ERRAND_NAIRA"),
    maxRewardedPerReferrer: getNumberSetting("REFERRAL_MAX_REWARDED_PER_REFERRER"),
  };
}

/** Smallest part of the delivery fee a requester still pays after credit. */
export const MIN_FEE_AFTER_CREDIT_NAIRA = 100;

// ---------------------------------------------------------------------
// Codes
// ---------------------------------------------------------------------

// No 0/O/1/I so codes survive being read out or typed from a screenshot.
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 6;

function randomCode(): string {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return code;
}

export function normalizeReferralCode(raw: string | undefined | null): string | undefined {
  const code = raw?.trim().toUpperCase().replace(/\s+/g, "");
  return code ? code : undefined;
}

/** Who owns this code, if anyone. */
export async function findCodeOwner(code: string): Promise<{ role: ReferralRole; id: string } | null> {
  const [requester] = await db.select({ id: requesters.id }).from(requesters).where(eq(requesters.referralCode, code)).limit(1);
  if (requester) return { role: "requester", id: requester.id };
  const [runner] = await db.select({ id: runners.id }).from(runners).where(eq(runners.referralCode, code)).limit(1);
  if (runner) return { role: "runner", id: runner.id };
  return null;
}

/** The account's referral code, creating one the first time it's asked for. */
export async function ensureReferralCode(role: ReferralRole, id: string): Promise<string> {
  const table = role === "requester" ? requesters : runners;
  const [row] = await db.select({ code: table.referralCode }).from(table).where(eq(table.id, id)).limit(1);
  if (!row) throw new Error("Account not found");
  if (row.code) return row.code;

  for (let attempt = 0; attempt < 10; attempt++) {
    const candidate = randomCode();
    if (await findCodeOwner(candidate)) continue;
    try {
      const updated = await db
        .update(table)
        .set({ referralCode: candidate })
        .where(and(eq(table.id, id), sql`${table.referralCode} is null`))
        .returning({ code: table.referralCode });
      if (updated[0]?.code) return updated[0].code;
      // Someone else (a parallel request) set it first — use theirs.
      const [again] = await db.select({ code: table.referralCode }).from(table).where(eq(table.id, id)).limit(1);
      if (again?.code) return again.code;
    } catch {
      // Unique-constraint clash on the candidate: try another.
    }
  }
  throw new Error("Couldn't create a referral code");
}

/**
 * Records that `referredId` signed up with `code`. Returns false when the
 * code doesn't exist. (Callers check the code first so a bad one stops the
 * signup before an account exists.)
 */
export async function recordReferral(code: string, referredRole: ReferralRole, referredId: string): Promise<boolean> {
  const owner = await findCodeOwner(code);
  if (!owner) return false;
  if (owner.role === referredRole && owner.id === referredId) return false;
  await db
    .insert(referrals)
    .values({ referrerRole: owner.role, referrerId: owner.id, referredRole, referredId })
    .onConflictDoNothing();
  return true;
}

// ---------------------------------------------------------------------
// Qualifying + rewarding
// ---------------------------------------------------------------------

const NAIRA = (amount: number) => `₦${amount.toLocaleString("en-NG")}`;

/**
 * Called after an errand is delivered. `paid` says whether the requester's
 * payment was in escrow and has now been released to the runner. If the
 * requester or the runner on this errand has a pending referral and this
 * errand qualifies, the referral is completed and rewards are created.
 * Never throws — rewards must not get in the way of delivering an errand.
 */
export async function qualifyReferralsForDelivery(errand: {
  requesterId: string;
  runnerId: string | null;
  estimatedCost: number;
  paid: boolean;
}): Promise<void> {
  try {
    const config = referralConfig();
    if (!errand.paid || errand.estimatedCost < config.minErrandNaira) return;

    const parties: { role: ReferralRole; id: string }[] = [{ role: "requester", id: errand.requesterId }];
    if (errand.runnerId) parties.push({ role: "runner", id: errand.runnerId });

    for (const party of parties) {
      // Compare-and-swap so a referral can only ever qualify once, even if
      // two deliveries race.
      const [qualified] = await db
        .update(referrals)
        .set({ status: "qualified", qualifiedAt: new Date() })
        .where(and(eq(referrals.referredRole, party.role), eq(referrals.referredId, party.id), eq(referrals.status, "pending")))
        .returning();
      if (!qualified) continue;

      const [{ value: alreadyRewarded }] = await db
        .select({ value: count() })
        .from(referrals)
        .where(
          and(
            eq(referrals.referrerRole, qualified.referrerRole),
            eq(referrals.referrerId, qualified.referrerId),
            eq(referrals.status, "qualified")
          )
        );
      const referrerCapped = alreadyRewarded > config.maxRewardedPerReferrer;

      const rewards: { role: ReferralRole; id: string; amount: number; message: string }[] = [];
      if (config.refereeReward > 0) {
        rewards.push({
          role: party.role,
          id: party.id,
          amount: config.refereeReward,
          message:
            party.role === "requester"
              ? `You've got ${NAIRA(config.refereeReward)} credit off your next errand for joining with a referral.`
              : `${NAIRA(config.refereeReward)} bonus added to your earnings for joining with a referral.`,
        });
      }
      if (config.referrerReward > 0 && !referrerCapped) {
        rewards.push({
          role: qualified.referrerRole,
          id: qualified.referrerId,
          amount: config.referrerReward,
          message:
            qualified.referrerRole === "requester"
              ? `A friend you referred completed their first errand — ${NAIRA(config.referrerReward)} credit off your next errand.`
              : `A friend you referred completed their first errand — ${NAIRA(config.referrerReward)} bonus added to your earnings.`,
        });
      }

      for (const reward of rewards) {
        await db.insert(referralRewards).values({
          referralId: qualified.id,
          beneficiaryRole: reward.role,
          beneficiaryId: reward.id,
          amount: reward.amount,
        });
        void sendPushToUser(reward.role, reward.id, {
          title: "Referral reward unlocked",
          body: reward.message,
          data: { type: "referral_reward" },
          channelId: "errands",
          ttl: 24 * 3600,
        });
      }
    }
  } catch (err) {
    console.error("[referrals] couldn't process referral for a delivery", err instanceof Error ? err.message : err);
  }
}

// ---------------------------------------------------------------------
// Requester credit at checkout
// ---------------------------------------------------------------------

/**
 * Holds as many of the requester's available rewards as fit under `cap`
 * (whole rewards only, oldest first) for escrow transaction `transactionId`,
 * and returns the total credit held. Each reward is claimed with a
 * compare-and-swap, so two checkouts can't both spend the same one.
 */
export async function reserveCredit(requesterId: string, cap: number, transactionId: string): Promise<number> {
  if (cap <= 0) return 0;
  const available = await db
    .select({ id: referralRewards.id, amount: referralRewards.amount })
    .from(referralRewards)
    .where(
      and(
        eq(referralRewards.beneficiaryRole, "requester"),
        eq(referralRewards.beneficiaryId, requesterId),
        eq(referralRewards.status, "available")
      )
    )
    .orderBy(asc(referralRewards.createdAt));

  let total = 0;
  for (const reward of available) {
    if (total + reward.amount > cap) continue;
    const claimed = await db
      .update(referralRewards)
      .set({ status: "reserved", reservedForTransactionId: transactionId })
      .where(and(eq(referralRewards.id, reward.id), eq(referralRewards.status, "available")))
      .returning({ id: referralRewards.id });
    if (claimed.length > 0) total += reward.amount;
  }
  return total;
}

/** Puts a checkout's held credit back (payment failed, was replaced, or never started). */
export async function releaseCredit(transactionId: string): Promise<void> {
  await db
    .update(referralRewards)
    .set({ status: "available", reservedForTransactionId: null })
    .where(and(eq(referralRewards.reservedForTransactionId, transactionId), eq(referralRewards.status, "reserved")));
}

/** The payment went through: the held credit is now spent. */
export async function consumeCredit(transactionId: string): Promise<void> {
  await db
    .update(referralRewards)
    .set({ status: "used", usedAt: new Date() })
    .where(and(eq(referralRewards.reservedForTransactionId, transactionId), eq(referralRewards.status, "reserved")));
}

/** A paid errand was cancelled and refunded: give the credit it had used back. */
export async function restoreCredit(transactionId: string): Promise<void> {
  await db
    .update(referralRewards)
    .set({ status: "available", reservedForTransactionId: null, usedAt: null })
    .where(and(eq(referralRewards.reservedForTransactionId, transactionId), eq(referralRewards.status, "used")));
}

// ---------------------------------------------------------------------
// Runner cash bonus in payouts
// ---------------------------------------------------------------------

/** Claims all of the runner's available bonuses for payout `payoutId`; returns the total. */
export async function reserveRunnerBonus(runnerId: string, payoutId: string): Promise<number> {
  const claimed = await db
    .update(referralRewards)
    .set({ status: "reserved", reservedForPayoutId: payoutId })
    .where(
      and(
        eq(referralRewards.beneficiaryRole, "runner"),
        eq(referralRewards.beneficiaryId, runnerId),
        eq(referralRewards.status, "available")
      )
    )
    .returning({ amount: referralRewards.amount });
  return claimed.reduce((sum, row) => sum + row.amount, 0);
}

export async function releaseRunnerBonus(payoutId: string): Promise<void> {
  await db
    .update(referralRewards)
    .set({ status: "available", reservedForPayoutId: null })
    .where(and(eq(referralRewards.reservedForPayoutId, payoutId), eq(referralRewards.status, "reserved")));
}

export async function settleRunnerBonus(payoutId: string, success: boolean): Promise<void> {
  if (!success) return releaseRunnerBonus(payoutId);
  await db
    .update(referralRewards)
    .set({ status: "used", usedAt: new Date() })
    .where(and(eq(referralRewards.reservedForPayoutId, payoutId), eq(referralRewards.status, "reserved")));
}

/** Reward money a runner could withdraw right now. */
export async function availableRunnerBonus(runnerId: string): Promise<number> {
  const rows = await db
    .select({ amount: referralRewards.amount })
    .from(referralRewards)
    .where(
      and(
        eq(referralRewards.beneficiaryRole, "runner"),
        eq(referralRewards.beneficiaryId, runnerId),
        eq(referralRewards.status, "available")
      )
    );
  return rows.reduce((sum, row) => sum + row.amount, 0);
}

// ---------------------------------------------------------------------
// What the apps show
// ---------------------------------------------------------------------

export interface ReferralSummary {
  code: string;
  /** Ready-to-share text for the share sheet. */
  shareMessage: string;
  invited: number;
  qualified: number;
  /** What each side earns, so the app can say it. */
  rewardNaira: { referrer: number; referee: number };
  /** Rewards not yet spent: credit for a requester, cash bonus for a runner. */
  availableNaira: number;
  /** Everything earned from referrals so far (available + in use + used). */
  earnedNaira: number;
  /** Smallest errand fee that counts toward a friend's first reward. */
  minErrandNaira: number;
}

export async function getReferralSummary(role: ReferralRole, id: string): Promise<ReferralSummary> {
  const code = await ensureReferralCode(role, id);
  const config = referralConfig();

  const [referralRows, rewardRows] = await Promise.all([
    db
      .select({ status: referrals.status })
      .from(referrals)
      .where(and(eq(referrals.referrerRole, role), eq(referrals.referrerId, id))),
    db
      .select({ amount: referralRewards.amount, status: referralRewards.status })
      .from(referralRewards)
      .where(and(eq(referralRewards.beneficiaryRole, role), eq(referralRewards.beneficiaryId, id))),
  ]);

  return {
    code,
    shareMessage: `Join me on Gracerandly — get errands done or earn as a runner. Use my code ${code} when you sign up.`,
    invited: referralRows.length,
    qualified: referralRows.filter((row) => row.status === "qualified").length,
    rewardNaira: { referrer: config.referrerReward, referee: config.refereeReward },
    availableNaira: rewardRows.filter((row) => row.status === "available").reduce((sum, row) => sum + row.amount, 0),
    earnedNaira: rewardRows.reduce((sum, row) => sum + row.amount, 0),
    minErrandNaira: config.minErrandNaira,
  };
}
