import { Router } from "express";
import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray, or } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "../db/client";
import { runners, errands, escrowTransactions, runnerPayouts, vendorDisbursements, requesters } from "../db/schema";
import {
  runnerSignupSchema,
  runnerLoginSchema,
  updateRunnerStatusSchema,
  availableErrandsQuerySchema,
  updateErrandStatusSchema,
  submitVerificationSchema,
  updateRunnerProfileSchema,
  updateRunnerAvatarSchema,
  updatePayoutAccountSchema,
} from "../schemas/runner";
import { createVendorDisbursementSchema } from "../schemas/vendor-disbursement";
import { LIVE_SHARING_STATUSES, getLivePosition } from "../lib/live-positions";
import { signAuthToken } from "../lib/jwt";
import { AppErrors } from "../lib/errors";
import { asyncHandler } from "../lib/asyncHandler";
import { requireRunnerAuth } from "../middleware/requireAuth";
import {
  MATCHING_RADIUS_STEPS_MILES,
  MAX_CONCURRENT_ERRANDS,
  haversineMeters,
  isWithinGeofence,
  milesToMeters,
} from "../lib/matching";
import { resolveBankCode, resolveAccountNumber, createTransferRecipient, initiateTransfer } from "../lib/payments";
import { getAgoraJoinInfo } from "../lib/agora";
import { triggerSos, getActiveSos, resolveSos } from "../lib/sos";
import { triggerSosSchema } from "../schemas/sos";
import type { Errand, ErrandStatus, Runner, RunnerPayout, VendorDisbursement } from "@gracerandly/shared-types";

const router: Router = Router();

const BCRYPT_SALT_ROUNDS = 12;

// Statuses that count against a runner's 3-concurrent-errand cap (PRD 6.6)
// and that make a runner unavailable for a *new* assignment of the same
// errand — everything between being matched and actually finishing.
const ACTIVE_STATUSES: ErrandStatus[] = [
  "accepted",
  "en_route_to_pickup",
  "in_progress",
  "en_route_to_delivery",
];

// The order status transitions must follow. Each PATCH can only move an
// errand to the status directly after its current one.
const STATUS_SEQUENCE: ErrandStatus[] = [
  "accepted",
  "en_route_to_pickup",
  "in_progress",
  "en_route_to_delivery",
  "delivered",
];

function toRunner(row: typeof runners.$inferSelect): Runner {
  return {
    id: row.id,
    fullName: row.fullName,
    phone: row.phone,
    email: row.email ?? undefined,
    role: "runner",
    avatarUrl: row.avatarUrl ?? undefined,
    vehicleType: row.vehicleType ?? undefined,
    nin: row.nin ?? undefined,
    bvn: row.bvn ?? undefined,
    identityVerified: row.identityVerified,
    guarantor: row.guarantor ?? undefined,
    payoutAccount:
      row.bankName && row.bankAccountNumber && row.bankAccountName
        ? {
            bankName: row.bankName,
            accountNumber: row.bankAccountNumber,
            accountName: row.bankAccountName,
            verified: row.bankAccountVerified,
          }
        : undefined,
    trustTierId: row.trustTierLevel,
    isOnline: row.isOnline,
    // Computed per-request in handlers that need it (see /me); a plain
    // signup/login response has no reason to run that extra query.
    activeErrandCount: 0,
    currentLocation: row.currentLocation ?? undefined,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// Same as routes/errands.ts's toErrand, minus deliveryPin — a runner must
// never see the PIN through the API; its whole job is to be a code only
// the requester can read out at the door, so it's dropped here even
// though the DB column has no per-role access control.
function toErrand(row: typeof errands.$inferSelect): Errand {
  return {
    id: row.id,
    requesterId: row.requesterId,
    runnerId: row.runnerId ?? undefined,
    category: row.category,
    urgency: row.urgency,
    scheduledFor: row.scheduledFor?.toISOString() ?? undefined,
    status: row.status,
    pickup: row.pickup,
    dropoff: row.dropoff,
    items: row.items,
    instructions: row.instructions ?? undefined,
    isRecurring: row.isRecurring,
    recurrenceRule: row.recurrenceRule ?? undefined,
    estimatedCost: row.estimatedCost,
    itemsBudget: row.itemsBudget,
    finalCost: row.finalCost ?? undefined,
    sequenceOrder: row.sequenceOrder ?? undefined,
    deliveryPin: undefined,
    aiParsed: row.aiParsed,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toRunnerPayout(row: typeof runnerPayouts.$inferSelect): RunnerPayout {
  return {
    id: row.id,
    runnerId: row.runnerId,
    amount: row.amount,
    status: row.status,
    transactionIds: row.transactionIds,
    failureReason: row.failureReason ?? undefined,
    createdAt: row.createdAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? undefined,
  };
}

function toVendorDisbursement(row: typeof vendorDisbursements.$inferSelect): VendorDisbursement {
  return {
    id: row.id,
    errandId: row.errandId,
    runnerId: row.runnerId,
    vendorName: row.vendorName,
    method: row.method,
    amount: row.amount,
    status: row.status,
    bankDetails:
      row.bankName && row.bankAccountNumber && row.bankAccountName
        ? { bankName: row.bankName, accountNumber: row.bankAccountNumber, accountName: row.bankAccountName }
        : undefined,
    receiptPhotoUrl: row.receiptPhotoUrl ?? undefined,
    geoVerified: row.geoVerified,
    failureReason: row.failureReason ?? undefined,
    createdAt: row.createdAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? undefined,
  };
}

/** Validates a route param as a UUID, throwing 404 (not a validation
 * error) on anything else — matches routes/errands.ts's loadOwnErrand. */
function parseErrandId(id: unknown): string {
  const result = z.uuid().safeParse(id);
  if (!result.success) throw AppErrors.notFound("Errand not found");
  return result.data;
}

async function loadOwnRunner(runnerId: string) {
  const [row] = await db.select().from(runners).where(eq(runners.id, runnerId)).limit(1);
  if (!row) throw AppErrors.notFound("Runner not found");
  return row;
}

async function countActiveErrands(runnerId: string): Promise<number> {
  const rows = await db
    .select({ id: errands.id })
    .from(errands)
    .where(and(eq(errands.runnerId, runnerId), inArray(errands.status, ACTIVE_STATUSES)));
  return rows.length;
}

// ---------------------------------------------------------------------
// Auth — deliberately not sharing routes/auth.ts's handlers even though
// the shape is near-identical, so requester and runner auth can keep
// diverging (NIN/BVN/guarantor today, verification/tiering rules later)
// without one accidentally breaking the other.
// ---------------------------------------------------------------------

router.post(
  "/auth/signup",
  asyncHandler(async (req, res) => {
    const input = runnerSignupSchema.parse(req.body);

    const existing = await db
      .select({ id: runners.id, phone: runners.phone, email: runners.email })
      .from(runners)
      .where(input.email ? or(eq(runners.phone, input.phone), eq(runners.email, input.email)) : eq(runners.phone, input.phone))
      .limit(1);

    if (existing.length > 0) {
      const clash = existing[0];
      const field = clash.phone === input.phone ? "phone number" : "email";
      throw AppErrors.conflict(`An account with this ${field} already exists`);
    }

    const passwordHash = await bcrypt.hash(input.password, BCRYPT_SALT_ROUNDS);

    const [row] = await db
      .insert(runners)
      .values({
        fullName: input.fullName,
        phone: input.phone,
        email: input.email,
        passwordHash,
      })
      .returning();

    const token = signAuthToken({ sub: row.id, role: "runner" });
    res.status(201).json({ token, user: toRunner(row) });
  })
);

router.post(
  "/auth/login",
  asyncHandler(async (req, res) => {
    const input = runnerLoginSchema.parse(req.body);

    const [row] = await db.select().from(runners).where(eq(runners.phone, input.phone)).limit(1);
    if (!row) throw AppErrors.unauthorized("Incorrect phone number or password");

    const passwordMatches = await bcrypt.compare(input.password, row.passwordHash);
    if (!passwordMatches) throw AppErrors.unauthorized("Incorrect phone number or password");

    const token = signAuthToken({ sub: row.id, role: "runner" });
    res.json({ token, user: toRunner(row) });
  })
);

router.get(
  "/me",
  requireRunnerAuth,
  asyncHandler(async (req, res) => {
    const row = await loadOwnRunner(req.runnerId!);
    const activeErrandCount = await countActiveErrands(row.id);
    res.json({ user: { ...toRunner(row), activeErrandCount } });
  })
);

// Profile fields a runner can change any time — name/email/vehicle type.
// Unlike requesters (routes/auth.ts's PATCH /me), there's no email
// re-verification flow for runners yet, so an email change here just
// takes effect immediately.
router.patch(
  "/me",
  requireRunnerAuth,
  asyncHandler(async (req, res) => {
    const input = updateRunnerProfileSchema.parse(req.body);
    if (Object.keys(input).length === 0) {
      throw AppErrors.validation("Nothing to update");
    }

    if (input.email) {
      const clash = await db
        .select({ id: runners.id })
        .from(runners)
        .where(eq(runners.email, input.email))
        .limit(1);
      if (clash.length > 0 && clash[0].id !== req.runnerId) {
        throw AppErrors.conflict("An account with this email already exists");
      }
    }

    const [row] = await db
      .update(runners)
      .set({
        ...(input.fullName !== undefined && { fullName: input.fullName }),
        ...(input.email !== undefined && { email: input.email }),
        ...(input.vehicleType !== undefined && { vehicleType: input.vehicleType }),
      })
      .where(eq(runners.id, req.runnerId!))
      .returning();

    const activeErrandCount = await countActiveErrands(row.id);
    res.json({ user: { ...toRunner(row), activeErrandCount } });
  })
);

// Same base64-data-URI approach as routes/auth.ts's PATCH /me/avatar —
// see updateRunnerAvatarSchema's comment for the size cap.
router.patch(
  "/me/avatar",
  requireRunnerAuth,
  asyncHandler(async (req, res) => {
    const input = updateRunnerAvatarSchema.parse(req.body);

    const [row] = await db
      .update(runners)
      .set({ avatarUrl: input.image })
      .where(eq(runners.id, req.runnerId!))
      .returning();

    const activeErrandCount = await countActiveErrands(row.id);
    res.json({ user: { ...toRunner(row), activeErrandCount } });
  })
);

// Where a runner's payout lands (PRD 6.7). Resolves the typed bank name
// against Paystack's bank list (fails the whole save if it's not
// recognized — no bank code means we could never pay out to this account
// anyway) and, when that succeeds, verifies the account number actually
// belongs to that bank. A resolve failure at that second step doesn't
// block the save — Paystack's resolve endpoint has real, legitimate
// misses — but the account is stored unverified, and POST /me/payout
// refuses to run until it's verified. A resolved account's name (the
// bank's record, not what the runner typed) overwrites accountName, since
// that's the name that has to match for a transfer to succeed.
router.patch(
  "/me/payout-account",
  requireRunnerAuth,
  asyncHandler(async (req, res) => {
    const input = updatePayoutAccountSchema.parse(req.body);

    const bank = await resolveBankCode(input.bankName);
    if (!bank) {
      throw AppErrors.validation(
        `We don't recognize "${input.bankName}" as a bank — check the spelling and try again`
      );
    }

    let accountName = input.accountName;
    let verified = false;
    try {
      const resolved = await resolveAccountNumber(input.accountNumber, bank.code);
      accountName = resolved.accountName;
      verified = true;
    } catch {
      // Left unverified — see comment above. The runner can still see and
      // edit what they saved; they just can't be paid out until this
      // resolves (or they fix a typo and re-save).
    }

    const [row] = await db
      .update(runners)
      .set({
        bankName: bank.name,
        bankAccountNumber: input.accountNumber,
        bankAccountName: accountName,
        bankCode: bank.code,
        bankAccountVerified: verified,
        // Any change to the account invalidates a previously-cached
        // recipient — POST /me/payout recreates one lazily.
        paystackRecipientCode: null,
      })
      .where(eq(runners.id, req.runnerId!))
      .returning();

    const activeErrandCount = await countActiveErrands(row.id);
    res.json({ user: { ...toRunner(row), activeErrandCount } });
  })
);

// Bundles every currently-"released" escrow transaction for this runner
// into one Paystack bank transfer. Requires a verified payout account
// (see PATCH /me/payout-account) — an unverified one means Paystack
// couldn't confirm the account number is real, and sending money to it
// would be a mistake, not a retry-able failure. The escrow transactions
// swept into this run stay "released" (not yet "disbursed") until the
// transfer.success webhook confirms the money actually moved — see
// routes/wallet.ts's paystack webhook handler for that leg.
router.post(
  "/me/payout",
  requireRunnerAuth,
  asyncHandler(async (req, res) => {
    const runner = await loadOwnRunner(req.runnerId!);

    if (!runner.bankName || !runner.bankAccountNumber || !runner.bankAccountName || !runner.bankCode) {
      throw AppErrors.validation("Add a payout account before requesting a payout");
    }
    if (!runner.bankAccountVerified) {
      throw AppErrors.validation("Your payout account couldn't be verified — check the details and re-save it");
    }

    const releasedRows = await db
      .select({ id: escrowTransactions.id, runnerPayout: escrowTransactions.runnerPayout })
      .from(escrowTransactions)
      .where(and(eq(escrowTransactions.runnerId, req.runnerId!), eq(escrowTransactions.status, "released")));

    const amount = releasedRows.reduce((sum, row) => sum + row.runnerPayout, 0);
    if (amount <= 0) {
      throw AppErrors.validation("Nothing to pay out yet");
    }

    let recipientCode = runner.paystackRecipientCode;
    if (!recipientCode) {
      recipientCode = await createTransferRecipient({
        accountNumber: runner.bankAccountNumber,
        bankCode: runner.bankCode,
        accountName: runner.bankAccountName,
      });
      await db.update(runners).set({ paystackRecipientCode: recipientCode }).where(eq(runners.id, runner.id));
    }

    const reference = `gracerandly-payout-${randomUUID()}`;
    const transactionIds = releasedRows.map((row) => row.id);

    const [payoutRow] = await db
      .insert(runnerPayouts)
      .values({
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
      throw AppErrors.validation("Couldn't start the transfer — try again in a moment");
    }

    res.status(201).json({ payout: toRunnerPayout(payoutRow) });
  })
);

// Payout history for the Profile page — most recent first.
router.get(
  "/me/payouts",
  requireRunnerAuth,
  asyncHandler(async (req, res) => {
    const rows = await db
      .select()
      .from(runnerPayouts)
      .where(eq(runnerPayouts.runnerId, req.runnerId!))
      .orderBy(desc(runnerPayouts.createdAt));

    res.json({ payouts: rows.map(toRunnerPayout) });
  })
);

// Lifetime earnings summary for the Profile page's stats row.
// totalEarned sums runnerPayout from escrow_transactions rows this
// runner's deliveries have been linked to (see the "delivered" branch of
// PATCH /errands/:id/status below, where a transaction moves to
// "released" — that's the only status this sums, so an errand delivered
// before the requester ever paid contributes 0, which is correct: there's
// nothing to have paid out). completedErrandsCount comes from the
// errands table directly rather than the transaction count, since not
// every completed errand necessarily has a transaction row.
router.get(
  "/me/earnings",
  requireRunnerAuth,
  asyncHandler(async (req, res) => {
    const [completedRows, earnedRows, pendingPayouts, successPayouts] = await Promise.all([
      db
        .select({ id: errands.id })
        .from(errands)
        .where(and(eq(errands.runnerId, req.runnerId!), eq(errands.status, "delivered"))),
      // Lifetime earnings = every escrow transaction that ever became
      // "released" (an errand delivered), whether or not it's since been
      // paid out — "released" rows haven't been disbursed yet, "disbursed"
      // rows have. availableBalance below is the released-only subset.
      db
        .select({ id: escrowTransactions.id, runnerPayout: escrowTransactions.runnerPayout, status: escrowTransactions.status })
        .from(escrowTransactions)
        .where(
          and(
            eq(escrowTransactions.runnerId, req.runnerId!),
            or(eq(escrowTransactions.status, "released"), eq(escrowTransactions.status, "disbursed"))
          )
        ),
      db
        .select({ transactionIds: runnerPayouts.transactionIds })
        .from(runnerPayouts)
        .where(and(eq(runnerPayouts.runnerId, req.runnerId!), eq(runnerPayouts.status, "pending"))),
      db
        .select({ amount: runnerPayouts.amount })
        .from(runnerPayouts)
        .where(and(eq(runnerPayouts.runnerId, req.runnerId!), eq(runnerPayouts.status, "success"))),
    ]);

    // "released" transactions already swept into a pending transfer
    // aren't available to request again — see POST /me/payout.
    const inFlightIds = new Set(pendingPayouts.flatMap((p) => p.transactionIds));
    const totalEarned = earnedRows.reduce((sum, row) => sum + row.runnerPayout, 0);
    const availableBalance = earnedRows
      .filter((row) => row.status === "released" && !inFlightIds.has(row.id))
      .reduce((sum, row) => sum + row.runnerPayout, 0);
    const totalPaidOut = successPayouts.reduce((sum, row) => sum + row.amount, 0);

    res.json({ totalEarned, availableBalance, totalPaidOut, completedErrandsCount: completedRows.length });
  })
);

// Submits NIN/BVN/guarantor from the Runner app's Settings screen — see
// submitVerificationSchema's comment for why this is separate from
// signup. Sets identityVerified true immediately on submission: there's
// no Trust & Safety admin review flow or NIMC/bank registry check yet
// (schema.ts's identityVerified comment), so for now "submitted the
// form" *is* "verified". Revisit once real verification/admin review
// exists — this should gate on an admin approving it, not on submission.
// Once verified, this locks — there's no re-submission flow yet (would
// need to decide whether changing NIN/BVN should un-verify the account,
// which is really an admin-review decision, not a self-serve one).
router.patch(
  "/me/verification",
  requireRunnerAuth,
  asyncHandler(async (req, res) => {
    const existing = await loadOwnRunner(req.runnerId!);
    if (existing.identityVerified) {
      throw AppErrors.conflict("Your identity is already verified");
    }

    const input = submitVerificationSchema.parse(req.body);

    const [row] = await db
      .update(runners)
      .set({
        nin: input.nin,
        bvn: input.bvn,
        guarantor: input.guarantor,
        identityVerified: true,
      })
      .where(eq(runners.id, req.runnerId!))
      .returning();

    const activeErrandCount = await countActiveErrands(row.id);
    res.json({ user: { ...toRunner(row), activeErrandCount } });
  })
);

// One endpoint for both "go online/offline" and "here's my current
// position" since the Runner app sends them together on every location
// tick while online (see apps/runner/src/lib/location.ts).
router.patch(
  "/me/status",
  requireRunnerAuth,
  asyncHandler(async (req, res) => {
    const input = updateRunnerStatusSchema.parse(req.body);
    if (input.isOnline && !input.location) {
      throw AppErrors.validation("Location is required to go online");
    }

    if (input.isOnline) {
      const existing = await loadOwnRunner(req.runnerId!);
      if (!existing.identityVerified) {
        throw AppErrors.validation("Complete identity verification before going online");
      }
    }

    const [row] = await db
      .update(runners)
      .set({
        isOnline: input.isOnline,
        ...(input.location && {
          currentLocation: { ...input.location, updatedAt: new Date().toISOString() },
        }),
      })
      .where(eq(runners.id, req.runnerId!))
      .returning();

    const activeErrandCount = await countActiveErrands(row.id);
    res.json({ user: { ...toRunner(row), activeErrandCount } });
  })
);

// ---------------------------------------------------------------------
// Matching (PRD 6.3) + errand execution (6.4, 6.6)
// ---------------------------------------------------------------------

// Returns open errands near the runner, using the first radius step (see
// MATCHING_RADIUS_STEPS_MILES) that has any matches — the response says
// which step it landed on, so the client can show "widening search..."
// when it had to go past the first one.
router.get(
  "/errands/available",
  requireRunnerAuth,
  asyncHandler(async (req, res) => {
    const { lat, lng } = availableErrandsQuerySchema.parse(req.query);

    const activeCount = await countActiveErrands(req.runnerId!);
    if (activeCount >= MAX_CONCURRENT_ERRANDS) {
      res.json({ errands: [], radiusMiles: null, atCapacity: true });
      return;
    }

    const openRows = await db.select().from(errands).where(eq(errands.status, "pending_match"));

    const withDistance = openRows
      .map((row) => ({ row, distanceMeters: haversineMeters({ lat, lng }, row.pickup) }))
      .sort((a, b) => a.distanceMeters - b.distanceMeters);

    for (const radiusMiles of MATCHING_RADIUS_STEPS_MILES) {
      const withinStep = withDistance.filter((x) => x.distanceMeters <= milesToMeters(radiusMiles));
      if (withinStep.length > 0) {
        res.json({
          errands: withinStep.map((x) => toErrand(x.row)),
          radiusMiles,
          atCapacity: false,
        });
        return;
      }
    }

    // Nothing even at the widest step — say so explicitly rather than
    // silently returning an empty list at radius 3, which would read as
    // "still searching" instead of "nothing in the city right now."
    res.json({
      errands: [],
      radiusMiles: MATCHING_RADIUS_STEPS_MILES[MATCHING_RADIUS_STEPS_MILES.length - 1],
      atCapacity: false,
    });
  })
);

// GET /errands/mine — the runner's own active + recently-completed
// errands, for the "My errands" section of the Runner app's home screen.
router.get(
  "/errands/mine",
  requireRunnerAuth,
  asyncHandler(async (req, res) => {
    const rows = await db.select().from(errands).where(eq(errands.runnerId, req.runnerId!));
    res.json({ errands: rows.map(toErrand) });
  })
);

router.post(
  "/errands/:id/accept",
  requireRunnerAuth,
  asyncHandler(async (req, res) => {
    // Defense in depth: going online already requires identityVerified
    // (see PATCH /me/status), but accept doesn't itself require being
    // online, so check again here rather than relying on that alone.
    const runner = await loadOwnRunner(req.runnerId!);
    if (!runner.identityVerified) {
      throw AppErrors.validation("Complete identity verification before accepting errands");
    }

    const activeCount = await countActiveErrands(req.runnerId!);
    if (activeCount >= MAX_CONCURRENT_ERRANDS) {
      throw AppErrors.conflict(`You already have ${MAX_CONCURRENT_ERRANDS} active errands`);
    }

    // Accept is a compare-and-swap: only succeeds if the errand is still
    // pending_match, so two runners racing to accept the same errand can't
    // both win — the loser's UPDATE just matches zero rows.
    const [row] = await db
      .update(errands)
      .set({ runnerId: req.runnerId!, status: "accepted" })
      .where(and(eq(errands.id, parseErrandId(req.params.id)), eq(errands.status, "pending_match")))
      .returning();

    if (!row) {
      throw AppErrors.conflict("This errand was already taken or no longer exists");
    }

    // Link this runner to whatever escrowed payment already exists for the
    // errand, if any — accept can happen before or after the requester
    // pays (see errands.ts: creation doesn't require payment first), so
    // this is best-effort. Not gating accept on it: an unpaid errand is
    // still a real errand a runner can go do, payment/payout is a
    // separate concern from the errand-execution flow.
    await db
      .update(escrowTransactions)
      .set({ runnerId: req.runnerId! })
      .where(and(eq(escrowTransactions.errandId, row.id), eq(escrowTransactions.status, "escrowed")));

    res.json({ errand: toErrand(row) });
  })
);

async function loadOwnActiveErrand(id: string, runnerId: string) {
  const [row] = await db
    .select()
    .from(errands)
    .where(and(eq(errands.id, id), eq(errands.runnerId, runnerId)))
    .limit(1);
  if (!row) throw AppErrors.notFound("Errand not found");
  return row;
}

// Advances an errand exactly one step through STATUS_SEQUENCE.
// - en_route_to_pickup: no gate — the runner has just accepted and is
//   heading over, nothing to verify yet.
// - in_progress: requires `location` within GEOFENCE_RADIUS_METERS of
//   pickup (PRD 6.4's pickup geofence).
// - en_route_to_delivery: no gate — items in hand, heading to drop-off.
// - delivered: requires `location` within the drop-off geofence AND a
//   matching `pin` (the code the requester reads out at handoff, PRD 6.7).
router.patch(
  "/errands/:id/status",
  requireRunnerAuth,
  asyncHandler(async (req, res) => {
    const input = updateErrandStatusSchema.parse(req.body);
    const existing = await loadOwnActiveErrand(parseErrandId(req.params.id), req.runnerId!);

    const currentIndex = STATUS_SEQUENCE.indexOf(existing.status);
    const targetIndex = STATUS_SEQUENCE.indexOf(input.status);
    if (currentIndex === -1 || targetIndex !== currentIndex + 1) {
      throw AppErrors.conflict(
        `Can't move from "${existing.status}" to "${input.status}" — errands only advance one step at a time`
      );
    }

    if (input.status === "in_progress") {
      if (!input.location) throw AppErrors.validation("Location is required to confirm pickup");
      if (!isWithinGeofence(input.location, existing.pickup)) {
        throw AppErrors.validation("You need to be at the pickup location to confirm this");
      }
    }

    if (input.status === "delivered") {
      if (!input.location) throw AppErrors.validation("Location is required to confirm delivery");
      if (!isWithinGeofence(input.location, existing.dropoff)) {
        throw AppErrors.validation("You need to be at the drop-off location to confirm this");
      }
      if (!existing.deliveryPin) {
        throw AppErrors.conflict("This errand has no delivery PIN on file");
      }
      if (!input.pin || input.pin !== existing.deliveryPin) {
        throw AppErrors.unauthorized("That PIN doesn't match — ask the requester to read it out again");
      }
    }

    const [row] = await db
      .update(errands)
      .set({ status: input.status })
      .where(eq(errands.id, existing.id))
      .returning();

    if (input.status === "delivered") {
      // Best-effort, same reasoning as the accept handler: an errand can
      // be delivered with no escrow transaction at all if the requester
      // never paid through the app. When one does exist, this is the
      // moment the payout amount is considered earned (GET /me/earnings
      // counts it toward totalEarned/availableBalance) — actual bank
      // disbursement is a separate step the runner requests themselves
      // (POST /me/payout), which is what moves this row from "released" to
      // "disbursed".
      await db
        .update(escrowTransactions)
        .set({ status: "released", releasedAt: new Date() })
        .where(
          and(
            eq(escrowTransactions.errandId, row.id),
            eq(escrowTransactions.runnerId, req.runnerId!),
            eq(escrowTransactions.status, "escrowed")
          )
        );
    }

    res.json({ errand: toErrand(row) });
  })
);

// Money the runner spends at a vendor while shopping this errand — drawn
// from the errand's itemsBudget, not the runner's own earnings (see
// schema.ts's escrowTransactions comment). Only available while the
// errand is "in_progress" (pickup confirmed, items not yet delivered) —
// PRD 6.7's other three methods aren't wired up yet, so anything but
// "bank_transfer" is rejected here rather than silently accepted and
// never actually paid.
router.post(
  "/errands/:id/vendor-disbursements",
  requireRunnerAuth,
  asyncHandler(async (req, res) => {
    const input = createVendorDisbursementSchema.parse(req.body);
    const existing = await loadOwnActiveErrand(parseErrandId(req.params.id), req.runnerId!);

    if (input.method !== "bank_transfer") {
      throw AppErrors.validation(`${input.method.replace("_", " ")} isn't available yet — use bank transfer for now`);
    }
    if (existing.status !== "in_progress") {
      throw AppErrors.conflict("You can only pay a vendor while an errand is in progress");
    }

    const [transaction] = await db
      .select()
      .from(escrowTransactions)
      .where(and(eq(escrowTransactions.errandId, existing.id), eq(escrowTransactions.status, "escrowed")))
      .limit(1);
    if (!transaction) {
      throw AppErrors.conflict("This errand doesn't have a funded items budget to spend from");
    }

    const pendingRows = await db
      .select({ amount: vendorDisbursements.amount })
      .from(vendorDisbursements)
      .where(and(eq(vendorDisbursements.errandId, existing.id), eq(vendorDisbursements.status, "pending")));
    const pendingTotal = pendingRows.reduce((sum, row) => sum + row.amount, 0);
    const remaining = transaction.itemsBudget - transaction.itemsSpent - pendingTotal;
    if (input.amount > remaining) {
      throw AppErrors.validation(`Only ₦${remaining.toLocaleString()} left of this errand's items budget`);
    }

    // Unlike a runner's own payout account, there's no "save unverified,
    // retry later" here — this is a one-off transfer of the requester's
    // money to a third party, so an unresolved bank name or account
    // number rejects the request outright rather than being stored.
    const bank = await resolveBankCode(input.bankName!);
    if (!bank) {
      throw AppErrors.validation(`We don't recognize "${input.bankName}" as a bank — check the spelling`);
    }
    let resolvedAccountName: string;
    try {
      const resolved = await resolveAccountNumber(input.accountNumber!, bank.code);
      resolvedAccountName = resolved.accountName;
    } catch {
      throw AppErrors.validation("Couldn't verify the vendor's account — check the account number and bank");
    }

    const recipientCode = await createTransferRecipient({
      accountNumber: input.accountNumber!,
      bankCode: bank.code,
      accountName: resolvedAccountName,
    });

    const reference = `gracerandly-vendor-${randomUUID()}`;
    const geoVerified = input.location ? isWithinGeofence(input.location, existing.pickup) : false;

    const [disbursementRow] = await db
      .insert(vendorDisbursements)
      .values({
        errandId: existing.id,
        runnerId: req.runnerId!,
        vendorName: input.vendorName,
        method: "bank_transfer",
        amount: input.amount,
        bankName: bank.name,
        bankCode: bank.code,
        bankAccountNumber: input.accountNumber!,
        bankAccountName: resolvedAccountName,
        status: "pending",
        providerReference: reference,
        geoVerified,
      })
      .returning();

    try {
      await initiateTransfer({
        amountNaira: input.amount,
        recipientCode,
        reference,
        reason: `Gracerandly vendor payment — ${input.vendorName}`,
      });
    } catch (err) {
      await db
        .update(vendorDisbursements)
        .set({ status: "failed", failureReason: err instanceof Error ? err.message : "Transfer failed" })
        .where(eq(vendorDisbursements.id, disbursementRow.id));
      throw AppErrors.validation("Couldn't start the transfer to the vendor — try again in a moment");
    }

    res.status(201).json({ disbursement: toVendorDisbursement(disbursementRow) });
  })
);

router.get(
  "/errands/:id/vendor-disbursements",
  requireRunnerAuth,
  asyncHandler(async (req, res) => {
    const existing = await loadOwnActiveErrand(parseErrandId(req.params.id), req.runnerId!);
    const rows = await db
      .select()
      .from(vendorDisbursements)
      .where(eq(vendorDisbursements.errandId, existing.id))
      .orderBy(desc(vendorDisbursements.createdAt));

    res.json({ disbursements: rows.map(toVendorDisbursement) });
  })
);

// Same "active chat window" as lib/chat-server.ts's CHAT_ALLOWED_STATUSES —
// duplicated rather than imported, same reasoning as toErrand() being
// duplicated across route files already.
const CHAT_ALLOWED_STATUSES = new Set(["accepted", "en_route_to_pickup", "in_progress", "en_route_to_delivery", "delivered"]);

// Who the runner is chatting/calling with on this errand — requester's
// equivalent is GET /errands/:id/chat-participant.
router.get(
  "/errands/:id/chat-participant",
  requireRunnerAuth,
  asyncHandler(async (req, res) => {
    const existing = await loadOwnActiveErrand(parseErrandId(req.params.id), req.runnerId!);

    const [requester] = await db.select().from(requesters).where(eq(requesters.id, existing.requesterId)).limit(1);
    if (!requester) throw AppErrors.notFound("Requester not found");

    res.json({ participant: { id: requester.id, name: requester.fullName, avatarUrl: requester.avatarUrl ?? undefined } });
  })
);

// Mints a short-lived Agora token so this runner can join the call channel
// for this errand — see lib/agora.ts and lib/chat-server.ts's call-invite
// signaling for the rest of how calling works.
router.post(
  "/errands/:id/agora-token",
  requireRunnerAuth,
  asyncHandler(async (req, res) => {
    const existing = await loadOwnActiveErrand(parseErrandId(req.params.id), req.runnerId!);
    if (!CHAT_ALLOWED_STATUSES.has(existing.status)) {
      throw AppErrors.conflict("Calling isn't available for this errand right now");
    }

    const info = getAgoraJoinInfo(existing.id, req.runnerId!);
    res.json(info);
  })
);

// SOS / panic button — see lib/sos.ts. Requester equivalents live in
// routes/errands.ts. Uses lib/sos.ts's own party check rather than
// loadOwnActiveErrand, since an SOS should still work on a just-delivered
// errand (incidents happen at hand-off).
router.post(
  "/errands/:id/sos",
  requireRunnerAuth,
  asyncHandler(async (req, res) => {
    const location = triggerSosSchema.parse(req.body);
    const alert = await triggerSos({ errandId: parseErrandId(req.params.id), role: "runner", userId: req.runnerId!, location });
    res.status(201).json({ alert });
  })
);

router.get(
  "/errands/:id/sos",
  requireRunnerAuth,
  asyncHandler(async (req, res) => {
    const alert = await getActiveSos(parseErrandId(req.params.id), "runner", req.runnerId!);
    res.json({ alert });
  })
);

router.post(
  "/errands/:id/sos/resolve",
  requireRunnerAuth,
  asyncHandler(async (req, res) => {
    const alert = await resolveSos(parseErrandId(req.params.id), "runner", req.runnerId!);
    res.json({ alert });
  })
);

// Where the requester is right now, for the runner's live map. null until
// the requester's app has reported a position (or if it's gone quiet).
router.get(
  "/errands/:id/requester-location",
  requireRunnerAuth,
  asyncHandler(async (req, res) => {
    const existing = await loadOwnActiveErrand(parseErrandId(req.params.id), req.runnerId!);
    if (!LIVE_SHARING_STATUSES.has(existing.status)) {
      res.json({ position: null });
      return;
    }
    const position = getLivePosition(existing.id, "requester");
    res.json({
      position: position ? { lat: position.lat, lng: position.lng, heading: position.heading, updatedAt: position.updatedAt } : null,
    });
  })
);

export default router;
