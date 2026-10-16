/**
 * Repeating errands: turns a recurring_errands template into a real errand
 * each time its next occurrence comes round.
 *
 * Timing: an errand is posted RECURRING_LEAD_MS before the time it's for, so
 * runners can see it and the requester has time to pay. Times are plain UTC
 * arithmetic — fine for Nigeria (WAT, UTC+1, no daylight saving), so "every
 * day at 8:00" stays 8:00 on the clock.
 *
 * Who runs it: a timer inside the API (server.ts) and, because a free host
 * sleeps when idle and a sleeping server has no timer, an endpoint an
 * outside pinger can hit every few minutes (routes/internal.ts). Both call
 * runDueRecurring(), which is safe to run at the same time as itself — each
 * occurrence is claimed with a compare-and-swap on next_run_at, so it can
 * only ever be posted once.
 *
 * Catching up: if the API was down for a while, occurrences that are more
 * than STALE_MS in the past are skipped rather than posted late (an errand
 * "for 8:00" appearing at 3pm helps nobody). At most one errand is posted
 * per template per run.
 */
import { randomInt, randomUUID } from "node:crypto";
import { and, eq, lte } from "drizzle-orm";
import { db } from "../db/client";
import { errands, recurringErrands } from "../db/schema";
import { notifyNearbyRunners } from "./errand-alerts";
import { sendPushToUser } from "./push";
import type { RecurrenceFrequency } from "@gracerandly/shared-types";

export const RECURRING_LEAD_MS = 2 * 60 * 60 * 1000;
export const RECURRING_STALE_MS = 6 * 60 * 60 * 1000;

const DAY_MS = 24 * 60 * 60 * 1000;

/** The occurrence after `from`. Monthly keeps the day of the month, clamped to
 * the month's length (31 Jan -> 28 Feb); once clamped it stays on that day
 * (28 Feb -> 28 Mar), which is acceptable for a first version. */
export function nextOccurrence(from: Date, frequency: RecurrenceFrequency): Date {
  switch (frequency) {
    case "daily":
      return new Date(from.getTime() + DAY_MS);
    case "weekly":
      return new Date(from.getTime() + 7 * DAY_MS);
    case "biweekly":
      return new Date(from.getTime() + 14 * DAY_MS);
    case "monthly": {
      const year = from.getUTCFullYear();
      const month = from.getUTCMonth() + 1;
      const lastDayOfTarget = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
      return new Date(
        Date.UTC(
          year,
          month,
          Math.min(from.getUTCDate(), lastDayOfTarget),
          from.getUTCHours(),
          from.getUTCMinutes(),
          from.getUTCSeconds()
        )
      );
    }
  }
}

const FREQUENCY_PHRASES: Record<RecurrenceFrequency, string> = {
  daily: "daily",
  weekly: "weekly",
  biweekly: "fortnightly",
  monthly: "monthly",
};

const CATEGORY_LABELS: Record<string, string> = {
  grocery: "grocery",
  pharmacy: "pharmacy",
  food: "food",
  parcel: "parcel",
  miscellaneous: "errand",
};

function formatWhen(date: Date): string {
  return date.toLocaleString("en-NG", {
    timeZone: "Africa/Lagos",
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Posts every errand that's due. Returns how many were posted. */
export async function runDueRecurring(now: Date = new Date()): Promise<number> {
  const horizon = new Date(now.getTime() + RECURRING_LEAD_MS);
  const due = await db
    .select()
    .from(recurringErrands)
    .where(and(eq(recurringErrands.active, true), lte(recurringErrands.nextRunAt, horizon)));

  let posted = 0;
  for (const template of due) {
    try {
      // Skip occurrences that are too far in the past to be worth posting.
      let occurrence = template.nextRunAt;
      let guard = 0;
      while (occurrence.getTime() < now.getTime() - RECURRING_STALE_MS && guard++ < 1000) {
        occurrence = nextOccurrence(occurrence, template.frequency);
      }
      const postNow = occurrence.getTime() <= horizon.getTime();
      const following = postNow ? nextOccurrence(occurrence, template.frequency) : occurrence;

      const created = await db.transaction(async (tx) => {
        // Claim this occurrence. If another run got here first, nextRunAt has
        // already moved and this matches nothing.
        const [claimed] = await tx
          .update(recurringErrands)
          .set({ nextRunAt: following, ...(postNow && { lastRunAt: now }) })
          .where(and(eq(recurringErrands.id, template.id), eq(recurringErrands.nextRunAt, template.nextRunAt)))
          .returning({ id: recurringErrands.id });
        if (!claimed || !postNow) return null;

        const [row] = await tx
          .insert(errands)
          .values({
            requesterId: template.requesterId,
            category: template.category,
            urgency: "scheduled",
            scheduledFor: occurrence,
            pickup: template.pickup,
            dropoff: template.dropoff,
            // Fresh ids, and nothing marked done, for every posted errand.
            stops: template.stops.map((stop) => ({ ...stop, id: randomUUID(), completedAt: undefined })),
            items: template.items.map((item) => ({ ...item, id: randomUUID() })),
            instructions: template.instructions,
            isRecurring: true,
            recurrenceRule: template.frequency,
            recurringId: template.id,
            estimatedCost: template.estimatedCost,
            itemsBudget: template.itemsBudget,
            deliveryPin: randomInt(0, 10000).toString().padStart(4, "0"),
          })
          .returning();
        return row;
      });

      if (!created) continue;
      posted += 1;

      // Best-effort, after the errand is safely saved.
      void sendPushToUser("requester", template.requesterId, {
        title: "Your repeating errand is ready",
        body: `Your ${FREQUENCY_PHRASES[template.frequency]} ${CATEGORY_LABELS[template.category] ?? "errand"} errand for ${formatWhen(occurrence)} has been posted. Tap to pay so a runner can take it.`,
        data: { type: "recurring_posted", errandId: created.id },
        channelId: "errands",
        ttl: 6 * 3600,
      });
      void notifyNearbyRunners(created);
    } catch (err) {
      // One broken template must not stop the others.
      console.error(`[recurring] couldn't post errand for template ${template.id}`, err instanceof Error ? err.message : err);
    }
  }
  return posted;
}
