import { Router } from "express";
import { and, eq, inArray, or } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "../db/client";
import { runners, errands } from "../db/schema";
import {
  runnerSignupSchema,
  runnerLoginSchema,
  updateRunnerStatusSchema,
  availableErrandsQuerySchema,
  updateErrandStatusSchema,
  submitVerificationSchema,
} from "../schemas/runner";
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
import type { Errand, ErrandStatus, Runner } from "@gracerandly/shared-types";

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
    nin: row.nin ?? undefined,
    bvn: row.bvn ?? undefined,
    identityVerified: row.identityVerified,
    guarantor: row.guarantor ?? undefined,
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
    finalCost: row.finalCost ?? undefined,
    sequenceOrder: row.sequenceOrder ?? undefined,
    deliveryPin: undefined,
    aiParsed: row.aiParsed,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
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

// Submits NIN/BVN/guarantor from the Runner app's Settings screen — see
// submitVerificationSchema's comment for why this is separate from
// signup. Sets identityVerified true immediately on submission: there's
// no Trust & Safety admin review flow or NIMC/bank registry check yet
// (schema.ts's identityVerified comment), so for now "submitted the
// form" *is* "verified". Revisit once real verification/admin review
// exists — this should gate on an admin approving it, not on submission.
router.patch(
  "/me/verification",
  requireRunnerAuth,
  asyncHandler(async (req, res) => {
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

    res.json({ errand: toErrand(row) });
  })
);

export default router;
