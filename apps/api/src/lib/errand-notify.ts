/**
 * Push notifications for an errand's progress, so people don't have to keep
 * the app open to know what's happening:
 *  - the requester hears each step the runner completes
 *  - the runner hears if the requester cancels an errand they'd accepted
 *
 * Best-effort like all push (see lib/push.ts): nothing here ever throws or
 * blocks the request that triggered it.
 */
import { eq } from "drizzle-orm";
import type { ErrandStatus } from "@gracerandly/shared-types";
import { db } from "../db/client";
import { runners } from "../db/schema";
import { sendPushToUser } from "./push";

interface ErrandRef {
  id: string;
  requesterId: string;
  runnerId: string | null;
}

function firstName(fullName: string | undefined): string {
  return fullName?.trim().split(/\s+/)[0] || "Your runner";
}

/** What the requester is told when the errand reaches each status. Unlisted statuses (pending_match, cancelled) stay quiet. */
function progressMessage(status: ErrandStatus, runner: string): { title: string; body: string } | null {
  switch (status) {
    case "accepted":
      return { title: "A runner accepted your errand", body: `${runner} is on it and will head to the pickup soon.` };
    case "en_route_to_pickup":
      return { title: "Runner on the way", body: `${runner} is heading to the pickup.` };
    case "in_progress":
      return { title: "Runner at the pickup", body: `${runner} has arrived and is getting your order.` };
    case "en_route_to_delivery":
      return {
        title: "Your order is on its way",
        body: `${runner} is heading to you. Have your 4-digit delivery PIN ready — only share it when you have your order.`,
      };
    case "delivered":
      return { title: "Delivered!", body: `${runner} has delivered your errand. Tap to rate how it went.` };
    default:
      return null;
  }
}

export async function notifyRequesterOfProgress(errand: ErrandRef, status: ErrandStatus): Promise<void> {
  try {
    let runnerName: string | undefined;
    if (errand.runnerId) {
      const [runner] = await db.select({ fullName: runners.fullName }).from(runners).where(eq(runners.id, errand.runnerId)).limit(1);
      runnerName = runner?.fullName;
    }
    const message = progressMessage(status, firstName(runnerName));
    if (!message) return;
    await sendPushToUser("requester", errand.requesterId, {
      ...message,
      data: { type: "errand_status", errandId: errand.id, status },
      channelId: "errands",
      ttl: 6 * 3600,
    });
  } catch (err) {
    console.error("[errand-notify] requester push failed", err instanceof Error ? err.message : err);
  }
}

/** Tells the runner an errand they had accepted was cancelled, so they stop heading to it. */
export async function notifyRunnerOfCancellation(errand: ErrandRef, feeNaira = 0): Promise<void> {
  if (!errand.runnerId) return;
  try {
    await sendPushToUser("runner", errand.runnerId, {
      title: "Errand cancelled",
      body:
        feeNaira > 0
          ? `The requester cancelled this errand. You'll get a \u20a6${feeNaira.toLocaleString("en-NG")} cancellation fee in your earnings.`
          : "The requester cancelled this errand. You're free to take another one.",
      data: { type: "errand_cancelled", errandId: errand.id },
      channelId: "errands",
      ttl: 6 * 3600,
    });
  } catch (err) {
    console.error("[errand-notify] runner push failed", err instanceof Error ? err.message : err);
  }
}
