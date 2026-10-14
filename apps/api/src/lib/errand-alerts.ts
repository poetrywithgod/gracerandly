/**
 * Tells online runners about a freshly posted errand, so they don't have to
 * pull-to-refresh to find out.
 *
 * Who hears about it: runners who are online, verified, whose last reported
 * position is recent, and whose position is within the widest matching
 * radius of the errand's pickup (the same radius the "available" list uses —
 * see lib/matching.ts).
 *  - A runner with room for more errands gets "New errand nearby".
 *  - A runner already holding the maximum (3) gets a nudge instead —
 *    "quickly finish an errand so you can accept new errands" — so they know
 *    work is waiting. Those nudges are rate-limited per runner.
 *
 * Strictly best-effort: notifyNearbyRunners never throws, and callers fire it
 * with `void` so posting an errand is never slowed down or failed by it.
 */
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { db } from "../db/client";
import { errands, runners } from "../db/schema";
import { MATCHING_RADIUS_STEPS_MILES, MAX_CONCURRENT_ERRANDS, haversineMeters, milesToMeters } from "./matching";
import { sendPushToUser } from "./push";

const ACTIVE_STATUSES = ["accepted", "en_route_to_pickup", "in_progress", "en_route_to_delivery"] as const;

// A runner's position only counts if the app reported it this recently. The
// Runner app refreshes it every ~30s while online (components/OnlineLocationHost.tsx),
// so anything older means the phone went quiet and a push would likely be wasted.
const MAX_POSITION_AGE_MS = 20 * 60 * 1000;

// At most one "you're at your limit" nudge per runner in this window.
const CAPACITY_NUDGE_COOLDOWN_MS = 15 * 60 * 1000;
const lastCapacityNudge = new Map<string, number>();

const CATEGORY_LABELS: Record<string, string> = {
  grocery: "Grocery",
  pharmacy: "Pharmacy",
  food: "Food",
  parcel: "Parcel",
  miscellaneous: "Errand",
};

function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.max(50, Math.round(meters / 50) * 50)} m away`;
  return `${(meters / 1000).toFixed(1)} km away`;
}

export async function notifyNearbyRunners(errand: typeof errands.$inferSelect): Promise<void> {
  try {
    const maxRadiusMeters = milesToMeters(MATCHING_RADIUS_STEPS_MILES[MATCHING_RADIUS_STEPS_MILES.length - 1]);

    const online = await db
      .select({ id: runners.id, currentLocation: runners.currentLocation })
      .from(runners)
      .where(and(eq(runners.isOnline, true), eq(runners.identityVerified, true), isNotNull(runners.currentLocation)));

    const now = Date.now();
    const inRange = online
      .filter((r) => {
        const loc = r.currentLocation;
        if (!loc) return false;
        const reportedAt = loc.updatedAt ? Date.parse(loc.updatedAt) : NaN;
        if (Number.isFinite(reportedAt) && now - reportedAt > MAX_POSITION_AGE_MS) return false;
        return haversineMeters({ lat: loc.lat, lng: loc.lng }, errand.pickup) <= maxRadiusMeters;
      })
      .map((r) => ({ id: r.id, distanceMeters: haversineMeters({ lat: r.currentLocation!.lat, lng: r.currentLocation!.lng }, errand.pickup) }));
    if (inRange.length === 0) return;

    // Active-errand counts for everyone in range, in one query.
    const activeRows = await db
      .select({ runnerId: errands.runnerId })
      .from(errands)
      .where(
        and(
          inArray(
            errands.runnerId,
            inRange.map((r) => r.id)
          ),
          inArray(errands.status, [...ACTIVE_STATUSES])
        )
      );
    const activeCounts = new Map<string, number>();
    for (const row of activeRows) {
      if (row.runnerId) activeCounts.set(row.runnerId, (activeCounts.get(row.runnerId) ?? 0) + 1);
    }

    const label = CATEGORY_LABELS[errand.category] ?? "Errand";
    const pay = `₦${errand.estimatedCost.toLocaleString("en-NG")}`;

    await Promise.all(
      inRange.map(async (runner) => {
        const active = activeCounts.get(runner.id) ?? 0;
        if (active < MAX_CONCURRENT_ERRANDS) {
          await sendPushToUser("runner", runner.id, {
            title: "New errand nearby",
            body: `${label} · ${pay} · ${formatDistance(runner.distanceMeters)}. Tap to view.`,
            data: { type: "new_errand", errandId: errand.id },
            channelId: "errands",
            ttl: 600,
          });
          return;
        }

        const last = lastCapacityNudge.get(runner.id) ?? 0;
        if (now - last < CAPACITY_NUDGE_COOLDOWN_MS) return;
        lastCapacityNudge.set(runner.id, now);
        await sendPushToUser("runner", runner.id, {
          title: "Errands are waiting for you",
          body: "Quickly finish an errand so you can accept new errands.",
          data: { type: "at_capacity" },
          channelId: "errands",
          ttl: 900,
        });
      })
    );
  } catch (err) {
    console.error("[errand-alerts] couldn't notify nearby runners", err instanceof Error ? err.message : err);
  }
}
