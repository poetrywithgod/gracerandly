import { Router } from "express";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client";
import { recurringErrands } from "../db/schema";
import { AppErrors } from "../lib/errors";
import { asyncHandler } from "../lib/asyncHandler";
import { requireAuth } from "../middleware/requireAuth";
import { nextOccurrence } from "../lib/recurring";
import type { RecurringErrand } from "@gracerandly/shared-types";

// The requester's repeating errands. They're created by posting an errand
// with "Repeats" on (routes/errands.ts); this is just for looking after them.
const router: Router = Router();
router.use(requireAuth);

function toRecurringErrand(row: typeof recurringErrands.$inferSelect): RecurringErrand {
  return {
    id: row.id,
    category: row.category,
    frequency: row.frequency,
    pickup: row.pickup,
    dropoff: row.dropoff,
    stops: row.stops ?? [],
    items: row.items,
    instructions: row.instructions ?? undefined,
    estimatedCost: row.estimatedCost,
    itemsBudget: row.itemsBudget,
    active: row.active,
    nextRunAt: row.nextRunAt.toISOString(),
    lastRunAt: row.lastRunAt?.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}

async function loadOwn(id: unknown, requesterId: string) {
  const parsed = z.uuid().safeParse(id);
  if (!parsed.success) throw AppErrors.notFound("Repeating errand not found");
  const [row] = await db
    .select()
    .from(recurringErrands)
    .where(and(eq(recurringErrands.id, parsed.data), eq(recurringErrands.requesterId, requesterId)))
    .limit(1);
  if (!row) throw AppErrors.notFound("Repeating errand not found");
  return row;
}

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const rows = await db
      .select()
      .from(recurringErrands)
      .where(eq(recurringErrands.requesterId, req.requesterId!))
      .orderBy(desc(recurringErrands.createdAt));
    res.json({ recurring: rows.map(toRecurringErrand) });
  })
);

// Pause or resume. Resuming skips any occurrences that went by while it was
// paused, so it carries on from the next one in the future rather than
// posting a backlog.
router.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const { active } = z.object({ active: z.boolean() }).parse(req.body);
    const existing = await loadOwn(req.params.id, req.requesterId!);

    let nextRunAt = existing.nextRunAt;
    if (active) {
      const now = Date.now();
      let guard = 0;
      while (nextRunAt.getTime() <= now && guard++ < 1000) {
        nextRunAt = nextOccurrence(nextRunAt, existing.frequency);
      }
    }

    const [row] = await db
      .update(recurringErrands)
      .set({ active, nextRunAt })
      .where(eq(recurringErrands.id, existing.id))
      .returning();
    res.json({ recurring: toRecurringErrand(row) });
  })
);

// Stops it for good. Errands it already posted are left alone.
router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const existing = await loadOwn(req.params.id, req.requesterId!);
    await db.delete(recurringErrands).where(eq(recurringErrands.id, existing.id));
    res.status(204).end();
  })
);

export default router;
