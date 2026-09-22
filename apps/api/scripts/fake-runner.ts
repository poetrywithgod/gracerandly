/**
 * Fake Runner — simulates a Runner's GPS + status updates for one errand,
 * so the requester-side live tracking map can be built and tested before
 * a real Runner app exists.
 *
 * Usage:
 *   pnpm --filter @gracerandly/api fake-runner -- --errand <errandId>
 *
 * What it does:
 *   1. Loads the errand's pickup/dropoff from the DB.
 *   2. Picks a starting point ~1.5km from pickup (a stand-in for "wherever
 *      the runner currently is") and fetches real road routes — start to
 *      pickup, then pickup to dropoff — from the same OSRM public router
 *      apps/requester/src/lib/routing.ts uses.
 *   3. Walks both legs at a simulated pace, updating the errand's `status`
 *      column directly (there's no real Runner auth/accept flow yet) and
 *      broadcasting {lat, lng, heading} on the Supabase Realtime channel
 *      `runner-location:<errandId>` every tick.
 *
 * This is a dev-only stand-in — nothing here should ship as-is. A real
 * version needs: an authenticated Runner app sending its own GPS, and
 * status transitions gated by actual pickup verification (geofence-
 * unlocked photo confirm, not a timer — see the pickup-proof discussion
 * this was built alongside) rather than walking the route unconditionally.
 */
import "dotenv/config";
import { createClient, type RealtimeChannel } from "@supabase/supabase-js";
import { eq } from "drizzle-orm";
import { db } from "../src/db/client";
import { errands } from "../src/db/schema";

const OSRM_BASE = "https://router.project-osrm.org";
const TICK_MS = 2000;
const SIMULATED_SPEED_KMH = 28; // rough okada/city-traffic pace

interface LatLng {
  lat: number;
  lng: number;
}

type ErrandStatus = typeof errands.$inferSelect.status;

function parseArgs(): { errandId: string } {
  const args = process.argv.slice(2);
  const idx = args.indexOf("--errand");
  const errandId = idx !== -1 ? args[idx + 1] : undefined;
  if (!errandId) {
    console.error("Usage: pnpm --filter @gracerandly/api fake-runner -- --errand <errandId>");
    process.exit(1);
  }
  return { errandId };
}

async function fetchOsrmRoute(from: LatLng, to: LatLng): Promise<LatLng[]> {
  const coords = `${from.lng},${from.lat};${to.lng},${to.lat}`;
  const url = `${OSRM_BASE}/route/v1/driving/${coords}?overview=full&geometries=geojson`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`OSRM route failed (${res.status})`);
  const data = (await res.json()) as {
    code: string;
    routes?: Array<{ geometry: { coordinates: [number, number][] } }>;
  };
  if (data.code !== "Ok" || !data.routes?.length) throw new Error("No route found");
  return data.routes[0].geometry.coordinates.map(([lng, lat]) => ({ lat, lng }));
}

// A rough "wherever the runner starts from" for the first leg — offset
// ~1.5km northeast of pickup so there's a real road route to animate
// before the runner "arrives."
function fakeStartPoint(pickup: LatLng): LatLng {
  return { lat: pickup.lat + 0.0135, lng: pickup.lng + 0.0135 };
}

function headingBetween(a: LatLng, b: LatLng): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const toDeg = (rad: number) => (rad * 180) / Math.PI;
  const y = Math.sin(toRad(b.lng - a.lng)) * Math.cos(toRad(b.lat));
  const x =
    Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat)) -
    Math.sin(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.cos(toRad(b.lng - a.lng));
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

function distanceMeters(a: LatLng, b: LatLng): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

async function setStatus(errandId: string, status: ErrandStatus) {
  await db.update(errands).set({ status }).where(eq(errands.id, errandId));
  console.log(`  status -> ${status}`);
}

async function walkRoute(route: LatLng[], channel: RealtimeChannel) {
  const metersPerTick = ((SIMULATED_SPEED_KMH * 1000) / 3600) * (TICK_MS / 1000);
  let segmentIndex = 0;
  let position = route[0];

  while (segmentIndex < route.length - 1) {
    const target = route[segmentIndex + 1];
    const segmentDistance = distanceMeters(position, target);

    if (segmentDistance <= metersPerTick) {
      position = target;
      segmentIndex += 1;
    } else {
      const fraction = metersPerTick / segmentDistance;
      position = {
        lat: position.lat + (target.lat - position.lat) * fraction,
        lng: position.lng + (target.lng - position.lng) * fraction,
      };
    }

    const heading = headingBetween(position, target);
    await channel.send({
      type: "broadcast",
      event: "position",
      payload: { lat: position.lat, lng: position.lng, heading, timestamp: Date.now() },
    });
    process.stdout.write(`\r  ${position.lat.toFixed(5)}, ${position.lng.toFixed(5)}  `);
    await new Promise((resolve) => setTimeout(resolve, TICK_MS));
  }
  console.log("");
}

async function main() {
  const { errandId } = parseArgs();

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    console.error(
      "SUPABASE_URL and SUPABASE_ANON_KEY must be set — copy apps/api/.env.example to apps/api/.env and fill them in."
    );
    process.exit(1);
  }

  const [errand] = await db.select().from(errands).where(eq(errands.id, errandId));
  if (!errand) {
    console.error(`No errand found with id ${errandId}`);
    process.exit(1);
  }

  const pickup: LatLng = { lat: errand.pickup.lat, lng: errand.pickup.lng };
  const dropoff: LatLng = { lat: errand.dropoff.lat, lng: errand.dropoff.lng };
  const start = fakeStartPoint(pickup);

  const supabase = createClient(supabaseUrl, supabaseAnonKey);
  const channel = supabase.channel(`runner-location:${errandId}`);
  await new Promise<void>((resolve) => {
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") resolve();
    });
  });

  console.log(`Simulating a runner for errand ${errandId}`);

  await setStatus(errandId, "accepted");
  await new Promise((resolve) => setTimeout(resolve, 1500));

  console.log("Leg 1: heading to pickup");
  await setStatus(errandId, "en_route_to_pickup");
  const toPickup = await fetchOsrmRoute(start, pickup);
  await walkRoute(toPickup, channel);

  console.log("Arrived at pickup (pickup-verification gate skipped in this prototype)");
  await setStatus(errandId, "in_progress");
  await new Promise((resolve) => setTimeout(resolve, 2000));

  console.log("Leg 2: heading to drop-off");
  await setStatus(errandId, "en_route_to_delivery");
  const toDropoff = await fetchOsrmRoute(pickup, dropoff);
  await walkRoute(toDropoff, channel);

  console.log("Arrived at drop-off");
  await setStatus(errandId, "delivered");

  await supabase.removeChannel(channel);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
