import { Router } from "express";
import { randomUUID, randomInt } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client";
import { errands, vendorDisbursements, runners } from "../db/schema";
import { createErrandSchema, updateErrandSchema, parseErrandTextSchema } from "../schemas/errand";
import { AppErrors } from "../lib/errors";
import { asyncHandler } from "../lib/asyncHandler";
import { requireAuth } from "../middleware/requireAuth";
import { parseErrandFromText } from "../lib/ai";
import { getAgoraJoinInfo } from "../lib/agora";
import { triggerSos, getActiveSos, resolveSos } from "../lib/sos";
import { triggerSosSchema } from "../schemas/sos";
import { sharePositionSchema } from "../schemas/location";
import { submitReviewSchema } from "../schemas/review";
import { getReviewState, listReviewsAbout, submitReview } from "../lib/reviews";
import { LIVE_SHARING_STATUSES, setLivePosition } from "../lib/live-positions";
import type { Errand, VendorDisbursement } from "@gracerandly/shared-types";

const router: Router = Router();

router.use(requireAuth);

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
    deliveryPin: row.deliveryPin ?? undefined,
    aiParsed: row.aiParsed,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * A 4-digit code the requester reads aloud to the runner at handoff to
 * confirm they're at the right person/door — like Uber/Bolt's delivery
 * PIN. Generated once at creation (there's no "runner accepts" endpoint
 * yet to hook this to instead) and only meaningful once matched; the
 * requester app only surfaces it from that point on.
 */
function generateDeliveryPin(): string {
  return randomInt(0, 10000).toString().padStart(4, "0");
}

/** Loads an errand by id, scoped to the current requester, or throws 404. */
async function loadOwnErrand(id: unknown, requesterId: string) {  const idResult = z.uuid().safeParse(id);
  if (!idResult.success) {
    throw AppErrors.notFound("Errand not found");
  }

  const [row] = await db
    .select()
    .from(errands)
    .where(and(eq(errands.id, idResult.data), eq(errands.requesterId, requesterId)))
    .limit(1);

  if (!row) {
    throw AppErrors.notFound("Errand not found");
  }
  return row;
}

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const input = createErrandSchema.parse(req.body);

    const [row] = await db
      .insert(errands)
      .values({
        requesterId: req.requesterId!,
        category: input.category,
        urgency: input.urgency,
        scheduledFor: input.scheduledFor ? new Date(input.scheduledFor) : undefined,
        pickup: input.pickup,
        dropoff: input.dropoff,
        items: input.items.map((item) => ({ ...item, id: randomUUID() })),
        instructions: input.instructions,
        isRecurring: input.isRecurring,
        recurrenceRule: input.recurrenceRule,
        estimatedCost: input.estimatedCost,
        itemsBudget: input.itemsBudget,
        aiParsed: input.aiParsed ?? false,
        deliveryPin: generateDeliveryPin(),
      })
      .returning();

    res.status(201).json({ errand: toErrand(row) });
  })
);

// Free-text -> a draft the client pre-fills the create form with. Doesn't
// touch the database — the requester still reviews/edits and submits
// through the normal POST / afterward, so a bad or unavailable parse never
// blocks posting an errand, only the AI shortcut to it.
router.post(
  "/parse",
  asyncHandler(async (req, res) => {
    const { text } = parseErrandTextSchema.parse(req.body);
    const draft = await parseErrandFromText(text);
    res.json({ draft });
  })
);

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const rows = await db
      .select()
      .from(errands)
      .where(eq(errands.requesterId, req.requesterId!))
      .orderBy(desc(errands.createdAt));

    res.json({ errands: rows.map(toErrand) });
  })
);

router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const row = await loadOwnErrand(req.params.id, req.requesterId!);
    res.json({ errand: toErrand(row) });
  })
);

// Editing is only allowed while nothing has happened yet — once a runner
// has accepted, changing pickup/items/cost out from under them isn't safe
// without a whole re-negotiation flow this MVP doesn't have yet.
router.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const existing = await loadOwnErrand(req.params.id, req.requesterId!);
    if (existing.status !== "pending_match") {
      throw AppErrors.conflict("This errand can no longer be edited");
    }

    const input = updateErrandSchema.parse(req.body);
    if (Object.keys(input).length === 0) {
      throw AppErrors.validation("Nothing to update");
    }

    const [row] = await db
      .update(errands)
      .set({
        ...(input.category !== undefined && { category: input.category }),
        ...(input.urgency !== undefined && { urgency: input.urgency }),
        ...(input.urgency !== undefined && {
          scheduledFor: input.scheduledFor ? new Date(input.scheduledFor) : null,
        }),
        ...(input.pickup !== undefined && { pickup: input.pickup }),
        ...(input.dropoff !== undefined && { dropoff: input.dropoff }),
        ...(input.items !== undefined && {
          items: input.items.map((item) => ({ ...item, id: randomUUID() })),
        }),
        ...(input.instructions !== undefined && { instructions: input.instructions }),
        ...(input.isRecurring !== undefined && { isRecurring: input.isRecurring }),
        ...(input.recurrenceRule !== undefined && { recurrenceRule: input.recurrenceRule }),
        ...(input.estimatedCost !== undefined && { estimatedCost: input.estimatedCost }),
        ...(input.itemsBudget !== undefined && { itemsBudget: input.itemsBudget }),
      })
      .where(eq(errands.id, existing.id))
      .returning();

    res.json({ errand: toErrand(row) });
  })
);

// A soft cancel (status flip) rather than a hard delete, so the requester
// keeps a record of it and any runner mid-flow can be notified. Blocked
// once already delivered or cancelled.
router.patch(
  "/:id/cancel",
  asyncHandler(async (req, res) => {
    const existing = await loadOwnErrand(req.params.id, req.requesterId!);
    if (existing.status === "delivered" || existing.status === "cancelled") {
      throw AppErrors.conflict(`This errand is already ${existing.status}`);
    }

    const [row] = await db
      .update(errands)
      .set({ status: "cancelled" })
      .where(eq(errands.id, existing.id))
      .returning();

    res.json({ errand: toErrand(row) });
  })
);

// Read-only for the requester — a transparency view of what's actually
// been spent at vendors on their behalf so far (see routes/runners.ts's
// POST /errands/:id/vendor-disbursements, where these rows are created).
router.get(
  "/:id/vendor-disbursements",
  asyncHandler(async (req, res) => {
    const existing = await loadOwnErrand(req.params.id, req.requesterId!);
    const rows = await db
      .select()
      .from(vendorDisbursements)
      .where(eq(vendorDisbursements.errandId, existing.id))
      .orderBy(desc(vendorDisbursements.createdAt));

    res.json({ disbursements: rows.map(toVendorDisbursement) });
  })
);

// Same "active chat window" as lib/chat-server.ts's CHAT_ALLOWED_STATUSES —
// duplicated rather than imported since it's a tiny, stable set and this
// keeps the route files independent of each other's internals (same
// reasoning as toErrand() being duplicated across routes/errands.ts and
// routes/runners.ts already).
const CHAT_ALLOWED_STATUSES = new Set(["accepted", "en_route_to_pickup", "in_progress", "en_route_to_delivery", "delivered"]);

// Who the requester is chatting/calling with on this errand — just enough
// (name + avatar) for the chat header and incoming-call banner. Runner's
// own equivalent is GET /runners/errands/:id/chat-participant.
router.get(
  "/:id/chat-participant",
  asyncHandler(async (req, res) => {
    const existing = await loadOwnErrand(req.params.id, req.requesterId!);
    if (!existing.runnerId) throw AppErrors.notFound("No runner assigned to this errand yet");

    const [runner] = await db.select().from(runners).where(eq(runners.id, existing.runnerId)).limit(1);
    if (!runner) throw AppErrors.notFound("Runner not found");

    res.json({ participant: { id: runner.id, name: runner.fullName, avatarUrl: runner.avatarUrl ?? undefined } });
  })
);

// Mints a short-lived Agora token so this requester can join the call
// channel for this errand — see lib/agora.ts for what the token actually
// authorizes, and lib/chat-server.ts's call-invite/accept messages for how
// the two parties actually find out a call is happening in the first
// place (this endpoint only hands out the credential to join, once they
// already know to).
router.post(
  "/:id/agora-token",
  asyncHandler(async (req, res) => {
    const existing = await loadOwnErrand(req.params.id, req.requesterId!);
    if (!existing.runnerId || !CHAT_ALLOWED_STATUSES.has(existing.status)) {
      throw AppErrors.conflict("Calling isn't available for this errand right now");
    }

    const info = getAgoraJoinInfo(existing.id, req.requesterId!);
    res.json(info);
  })
);

// SOS / panic button — see lib/sos.ts for what it does (and deliberately
// doesn't do: it never alerts the runner). Runner equivalents live in
// routes/runners.ts.
router.post(
  "/:id/sos",
  asyncHandler(async (req, res) => {
    const location = triggerSosSchema.parse(req.body);
    const alert = await triggerSos({ errandId: req.params.id, role: "requester", userId: req.requesterId!, location });
    res.status(201).json({ alert });
  })
);

router.get(
  "/:id/sos",
  asyncHandler(async (req, res) => {
    const alert = await getActiveSos(req.params.id, "requester", req.requesterId!);
    res.json({ alert });
  })
);

router.post(
  "/:id/sos/resolve",
  asyncHandler(async (req, res) => {
    const alert = await resolveSos(req.params.id, "requester", req.requesterId!);
    res.json({ alert });
  })
);

// The requester's phone reports where they are while a runner is on the
// errand, so the runner can see them on the map. Read by the runner through
// GET /runners/errands/:id/requester-location (lib/live-positions.ts says
// why this isn't a public Realtime channel).
router.post(
  "/:id/location",
  asyncHandler(async (req, res) => {
    const existing = await loadOwnErrand(req.params.id, req.requesterId!);
    if (!existing.runnerId || !LIVE_SHARING_STATUSES.has(existing.status)) {
      throw AppErrors.conflict("Location sharing is only on while a runner is on this errand");
    }
    const position = sharePositionSchema.parse(req.body);
    setLivePosition(existing.id, "requester", position);
    res.json({ shared: true });
  })
);

// Rating the runner once the errand is delivered (one rating per errand).
router.get(
  "/:id/review",
  asyncHandler(async (req, res) => {
    const existing = await loadOwnErrand(req.params.id, req.requesterId!);
    res.json(await getReviewState(existing, "requester"));
  })
);

router.post(
  "/:id/review",
  asyncHandler(async (req, res) => {
    const existing = await loadOwnErrand(req.params.id, req.requesterId!);
    const { rating, comment } = submitReviewSchema.parse(req.body);
    await submitReview(existing, "requester", req.requesterId!, rating, comment);
    res.status(201).json(await getReviewState(existing, "requester"));
  })
);

// What others have written about the runner on this errand.
router.get(
  "/:id/counterpart-reviews",
  asyncHandler(async (req, res) => {
    const existing = await loadOwnErrand(req.params.id, req.requesterId!);
    if (!existing.runnerId) throw AppErrors.notFound("No runner on this errand yet");
    res.json(await listReviewsAbout("runner", existing.runnerId));
  })
);

export default router;
