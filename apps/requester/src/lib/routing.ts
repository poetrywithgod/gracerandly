/**
 * Address search (autocomplete) and route/ETA calculation.
 *
 * Both use free, keyless OSM-backed services — consistent with the map
 * itself (see LocationPickerModal / leafletAssets.ts), rather than a
 * billed Google API:
 *   - Nominatim (nominatim.openstreetmap.org) for forward geocoding /
 *     address suggestions
 *   - OSRM's public demo router (router.project-osrm.org) for route
 *     geometry + duration
 *
 * See the production note at the bottom of this file before this ships
 * to real user traffic — both are shared community demo servers.
 */

import type { Coordinate } from "./location";

const NOMINATIM_BASE = "https://nominatim.openstreetmap.org";
// router.project-osrm.org (the public OSRM demo) only serves the CAR
// profile: a "/route/v1/foot/..." request to it silently returns a driving
// route, which is why walking times used to match driving times. The
// routing.openstreetmap.de instances run one OSRM per profile (car, bike,
// foot), so each mode gets its own real route. Their URLs always use
// "driving" as the profile segment — the server itself picks the profile.
const ROUTE_SERVERS = {
  car: "https://routing.openstreetmap.de/routed-car",
  bike: "https://routing.openstreetmap.de/routed-bike",
  foot: "https://routing.openstreetmap.de/routed-foot",
} as const;
const OSRM_DEMO_CAR = "https://router.project-osrm.org";
const ROUTE_TIMEOUT_MS = 10_000;

// Nominatim's usage policy requires a real identifying User-Agent on
// every request — generic/default-UA traffic gets rate-limited harder
// or blocked outright.
const NOMINATIM_HEADERS = { "User-Agent": "Gracerandly/1.0 (+https://github.com/poetrywithgod/gracerandly)" };

// Biases suggestions toward Port Harcourt when we have no better
// "near" point yet — matches LocationPickerModal's DEFAULT_COORDINATE.
const DEFAULT_BIAS: Coordinate = { latitude: 4.8156, longitude: 7.0498 };

export interface PlaceSuggestion {
  id: string;
  label: string;
  latitude: number;
  longitude: number;
}

/**
 * Address-as-you-type suggestions. Callers should debounce input changes
 * (Nominatim's fair-use policy is ~1 request/second) and pass an
 * AbortSignal so a fast typist's stale requests get cancelled instead of
 * racing the latest one.
 */
export async function searchAddress(
  query: string,
  near: Coordinate = DEFAULT_BIAS,
  signal?: AbortSignal
): Promise<PlaceSuggestion[]> {
  const trimmed = query.trim();
  if (trimmed.length < 3) return [];

  // A loose box around `near` — nudges results toward wherever the user
  // is currently looking on the map without hiding a genuine match
  // elsewhere (bounded=0 below keeps this a soft bias, not a hard filter).
  const delta = 0.35;
  const viewbox = [
    near.longitude - delta,
    near.latitude + delta,
    near.longitude + delta,
    near.latitude - delta,
  ].join(",");

  const params = new URLSearchParams({
    q: trimmed,
    format: "jsonv2",
    addressdetails: "0",
    limit: "6",
    countrycodes: "ng",
    viewbox,
    bounded: "0",
  });

  const response = await fetch(`${NOMINATIM_BASE}/search?${params.toString()}`, {
    headers: NOMINATIM_HEADERS,
    signal,
  });
  if (!response.ok) throw new Error(`Address search failed (${response.status})`);

  const results = (await response.json()) as Array<{
    place_id: number;
    display_name: string;
    lat: string;
    lon: string;
  }>;

  return results.map((result) => ({
    id: String(result.place_id),
    label: result.display_name,
    latitude: parseFloat(result.lat),
    longitude: parseFloat(result.lon),
  }));
}

export type TravelMode = "foot" | "bicycle" | "motorcycle" | "car" | "train";

export interface RouteEstimate {
  mode: TravelMode;
  available: boolean;
  distanceMeters?: number;
  durationSeconds?: number;
  /** True when the time was worked out from the road distance and a typical
   * speed instead of coming from a routing engine for this mode. */
  estimated?: boolean;
}

export interface RouteResult {
  distanceMeters: number;
  durationSeconds: number;
  /** Path coordinates in order, for drawing on the map. */
  coordinates: Coordinate[];
}

export interface FastestRoute {
  /** The route to draw on the map: the fastest road route (car/motorcycle path). */
  route: RouteResult;
  estimates: RouteEstimate[];
}

// Routing engines give free-flow times: no traffic lights, no go-slows, no
// market-day gridlock. Real Port Harcourt/Lagos-style city driving is
// well slower, so car time is scaled up. Okada (motorcycle) riders filter
// through the same congestion, so they're left at roughly free-flow. There
// is no motorcycle profile in any public OSRM, so okada uses the car road
// route. These two numbers are estimates, not measurements — tune them
// against real Runner trip times once there is GPS trip data.
const CAR_CONGESTION_FACTOR = 1.5;
const MOTORCYCLE_CONGESTION_FACTOR = 1.0;

// Fallback average speeds (metres/second) used only when the foot or bike
// routing server can't be reached, so a walking or cycling time is still
// shown — marked `estimated` — instead of a blank chip.
const WALK_SPEED_MPS = 1.25; // 4.5 km/h
const BIKE_SPEED_MPS = 4.2; // 15 km/h

// fetch() with a timeout (React Native's fetch has none of its own), still
// honouring the caller's own AbortSignal.
async function fetchWithTimeout(url: string, signal?: AbortSignal): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ROUTE_TIMEOUT_MS);
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

async function fetchRoute(
  baseUrl: string,
  from: Coordinate,
  to: Coordinate,
  signal?: AbortSignal
): Promise<RouteResult> {
  const coords = `${from.longitude},${from.latitude};${to.longitude},${to.latitude}`;
  const url = `${baseUrl}/route/v1/driving/${coords}?overview=full&geometries=geojson`;

  const response = await fetchWithTimeout(url, signal);
  if (!response.ok) throw new Error(`Route lookup failed (${response.status})`);

  const data = (await response.json()) as {
    code: string;
    routes?: Array<{
      distance: number;
      duration: number;
      geometry: { coordinates: [number, number][] };
    }>;
  };

  if (data.code !== "Ok" || !data.routes?.length) {
    throw new Error("No route found between those two points");
  }

  const [route] = data.routes;
  return {
    distanceMeters: route.distance,
    durationSeconds: route.duration,
    coordinates: route.geometry.coordinates.map(([longitude, latitude]) => ({ latitude, longitude })),
  };
}

// Car route: the dedicated car server first, the OSRM demo as a backup.
async function fetchCarRoute(from: Coordinate, to: Coordinate, signal?: AbortSignal): Promise<RouteResult> {
  try {
    return await fetchRoute(ROUTE_SERVERS.car, from, to, signal);
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError" && signal?.aborted) throw err;
    return fetchRoute(OSRM_DEMO_CAR, from, to, signal);
  }
}

/**
 * Fetches the fastest road route (for drawing on the map) plus travel times
 * for walking, cycling, okada, car and train.
 *
 * Walking and cycling come from their own routing profiles (their own
 * distance and time); okada and car share the road route with different
 * congestion allowances (see the constants above).
 *
 * Train is always returned as `available: false`. None of the Nigerian
 * cities Gracerandly targets have a functioning point-to-point commuter
 * rail network, and there's no free routing API that models one — rather
 * than fabricate a duration, we surface "not available" and let the UI
 * explain why.
 */
export async function getFastestRouteWithEstimates(
  from: Coordinate,
  to: Coordinate,
  signal?: AbortSignal
): Promise<FastestRoute> {
  const car = await fetchCarRoute(from, to, signal);

  // Foot/bike failing must never take down the whole panel — each one falls
  // back to a distance-and-speed estimate off the car route.
  const [foot, bike] = await Promise.all([
    fetchRoute(ROUTE_SERVERS.foot, from, to, signal).catch(() => null),
    fetchRoute(ROUTE_SERVERS.bike, from, to, signal).catch(() => null),
  ]);

  const estimates: RouteEstimate[] = [
    foot
      ? { mode: "foot", available: true, distanceMeters: foot.distanceMeters, durationSeconds: foot.durationSeconds }
      : {
          mode: "foot",
          available: true,
          distanceMeters: car.distanceMeters,
          durationSeconds: car.distanceMeters / WALK_SPEED_MPS,
          estimated: true,
        },
    bike
      ? { mode: "bicycle", available: true, distanceMeters: bike.distanceMeters, durationSeconds: bike.durationSeconds }
      : {
          mode: "bicycle",
          available: true,
          distanceMeters: car.distanceMeters,
          durationSeconds: car.distanceMeters / BIKE_SPEED_MPS,
          estimated: true,
        },
    {
      mode: "motorcycle",
      available: true,
      distanceMeters: car.distanceMeters,
      durationSeconds: car.durationSeconds * MOTORCYCLE_CONGESTION_FACTOR,
      estimated: true,
    },
    {
      mode: "car",
      available: true,
      distanceMeters: car.distanceMeters,
      durationSeconds: car.durationSeconds * CAR_CONGESTION_FACTOR,
      estimated: true,
    },
    { mode: "train", available: false },
  ];

  return { route: car, estimates };
}

/**
 * Lighter-weight than getFastestRouteWithEstimates: just the driving ETA
 * from one point to another, with no foot/bike legs fetched alongside it.
 * Built for LiveTrackingMap's periodic "distance/time to next waypoint"
 * recalculation, where firing several requests per tick would waste budget
 * against the public routers' ~1 req/sec fair-use limit. Uses the same
 * congestion allowance as the car time in the estimates, so the two agree.
 */
export async function getEtaToPoint(
  from: Coordinate,
  to: Coordinate,
  signal?: AbortSignal
): Promise<{ distanceMeters: number; durationSeconds: number }> {
  const route = await fetchCarRoute(from, to, signal);
  return { distanceMeters: route.distanceMeters, durationSeconds: route.durationSeconds * CAR_CONGESTION_FACTOR };
}

export function formatDuration(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  if (minutes < 1) return "<1 min";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  return remaining > 0 ? `${hours}h ${remaining}m` : `${hours}h`;
}

export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

/*
 * Production note: nominatim.openstreetmap.org, routing.openstreetmap.de and
 * router.project-osrm.org are shared community servers — rate
 * limited (~1 req/sec), no uptime SLA, and their usage policies ask that
 * anything beyond light/dev traffic move to a self-hosted instance or a
 * paid provider (e.g. LocationIQ, Geoapify, or Mapbox for geocoding;
 * self-hosted OSRM, GraphHopper, or Mapbox Directions for routing). Fine
 * for MVP/dev; revisit before this carries real Runner-matching traffic.
 */
