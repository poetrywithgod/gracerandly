import type { GeoPoint } from "@gracerandly/shared-types";

/**
 * Errand matching + geofencing constants and helpers for the Runner app.
 * See PRD 6.3 (matching radius) and 6.4 (geofenced pickup/delivery).
 *
 * There's no PostGIS/geospatial index set up yet — with an MVP-scale
 * number of open errands per city-zone, filtering `pending_match` rows in
 * JS with a haversine distance is simple and fast enough. Revisit with a
 * real spatial query once errand volume justifies it.
 */

/** Radius steps in miles, per PRD 6.3: "starting within a 3-mile radius,
 * automatically expanding ... if no Runner is found." GET
 * /runners/errands/available returns the *first* step with any matches
 * (or the widest step's results if the whole city has none), and reports
 * which step it used so the client can show "searching wider..." UI. */
export const MATCHING_RADIUS_STEPS_MILES = [3, 5, 8, 12] as const;

/** PRD 6.6: a runner can't hold more than 3 concurrent errands. */
export const MAX_CONCURRENT_ERRANDS = 3;

/** PRD 6.4: a pickup/delivery status change only takes effect when the
 * runner's reported GPS is within this many meters of the actual
 * pickup/drop-off point. ~120m covers normal GPS drift plus a runner
 * parking/waiting just outside a gate without being so wide it defeats
 * the point. */
export const GEOFENCE_RADIUS_METERS = 120;

const EARTH_RADIUS_METERS = 6_371_000;
const METERS_PER_MILE = 1609.344;

export function haversineMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(h));
}

export function isWithinGeofence(runnerLocation: { lat: number; lng: number }, target: GeoPoint): boolean {
  return haversineMeters(runnerLocation, target) <= GEOFENCE_RADIUS_METERS;
}

export function milesToMeters(miles: number): number {
  return miles * METERS_PER_MILE;
}
