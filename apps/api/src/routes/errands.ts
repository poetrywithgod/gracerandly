import { Router } from "express";
import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client";
import { errands } from "../db/schema";
import { createErrandSchema } from "../schemas/errand";
import { AppErrors } from "../lib/errors";
import { asyncHandler } from "../lib/asyncHandler";
import { requireAuth } from "../middleware/requireAuth";
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
        pickup: input.pickup,
        dropoff: input.dropoff,
        items: input.items.map((item) => ({ ...item, id: randomUUID() })),
        instructions: input.instructions,
        isRecurring: input.isRecurring,
        recurrenceRule: input.recurrenceRule,
        estimatedCost: input.estimatedCost,
      })
      .returning();

    res.status(201).json({ errand: toErrand(row) });
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
    const idResult = z.uuid().safeParse(req.params.id);
    if (!idResult.success) {
      throw AppErrors.notFound("Errand not found");
    }

    const [row] = await db
      .select()
      .from(errands)
      .where(and(eq(errands.id, idResult.data), eq(errands.requesterId, req.requesterId!)))
      .limit(1);

    if (!row) {
      throw AppErrors.notFound("Errand not found");
    }

    res.json({ errand: toErrand(row) });
  })
);

export default router;
