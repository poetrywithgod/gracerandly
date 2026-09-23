import { Router } from "express";
import { randomUUID, randomInt } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client";
import { errands } from "../db/schema";
import { createErrandSchema, updateErrandSchema, parseErrandTextSchema } from "../schemas/errand";
import { AppErrors } from "../lib/errors";
import { asyncHandler } from "../lib/asyncHandler";
import { requireAuth } from "../middleware/requireAuth";
import { parseErrandFromText } from "../lib/ai";
import type { Errand } from "@gracerandly/shared-types";

const router: Router = Router();

router.use(requireAuth);

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

export default router;
