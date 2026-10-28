/**
 * Errands nobody accepted. After STALE_ERRAND_HOURS (default 24) an errand
 * still waiting for a runner is cancelled and the requester gets a full
 * refund (the same path as a requester cancelling before anyone accepted:
 * lib/cancellation.ts). Scheduled errands count from the time they were
 * meant to happen, not from when they were posted.
 *
 * Runs from the server's own timer and from the /internal/recurring/run
 * ping, so it also works on a host that sleeps. Safe to run twice at once:
 * cancelErrandByRequester only cancels if the status hasn't moved.
 */
import { sql } from "drizzle-orm";
import { db } from "../db/client";
import { errands } from "../db/schema";
import { cancelErrandByRequester } from "./cancellation";
import { sendPushToUser } from "./push";

const MAX_PER_RUN = 50;

export function staleErrandHours(): number {
  const raw = Number(process.env.STALE_ERRAND_HOURS);
  return Number.isFinite(raw) && raw >= 1 ? Math.floor(raw) : 24;
}

export async function expireStaleErrands(now: Date = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - staleErrandHours() * 3600 * 1000);
  const rows = await db
    .select()
    .from(errands)
    .where(sql`${errands.status} = 'pending_match' and coalesce(${errands.scheduledFor}, ${errands.createdAt}) < ${cutoff.toISOString()}`)
    .orderBy(errands.createdAt)
    .limit(MAX_PER_RUN);

  let expired = 0;
  for (const row of rows) {
    try {
      const { refundedNaira } = await cancelErrandByRequester(row);
      expired++;
      void sendPushToUser("requester", row.requesterId, {
        title: "No runner was available",
        body:
          refundedNaira > 0
            ? `Nobody accepted your errand, so we cancelled it and are refunding ₦${refundedNaira.toLocaleString("en-NG")}.`
            : "Nobody accepted your errand, so we cancelled it. You can post it again any time.",
        data: { type: "errand_expired", errandId: row.id },
        channelId: "errands",
      });
    } catch (err) {
      // Someone accepted or cancelled it a moment ago, or a refund call failed.
      // Either way the next run picks up anything still stale.
      console.error("[expiry] could not expire errand", row.id, err instanceof Error ? err.message : err);
    }
  }
  return expired;
}
