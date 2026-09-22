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
const OSRM_BASE = "https://router.project-osrm.org";

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

export type TravelMode = "foot" | "motorcycle" | "car" | "train";

export interface RouteEstimate {
  mode: TravelMode;
  available: boolean;
  distanceMeters?: number;
  durationSeconds?: number;
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

// OSRM ships "car" (driving), "bike" and "foot" profiles — there's no
// dedicated motorcycle profile, public or self-hosted. We approximate
// motorcycle timing off the driving route: same roads, but okada riders
// routinely thread through go-slow traffic a car can't, so real
// point-to-point times run faster than a car's in Nigerian city traffic.
// This multiplier is a rough, unvalidated estimate — replace it with a
// real one once we have Runner GPS trip data to calibrate against.
const MOTORCYCLE_DURATION_FACTOR = 0.65;

async function fetchOsrmRoute(
  from: Coordinate,
  to: Coordinate,
  profile: "driving" | "foot",
  signal?: AbortSignal
): Promise<RouteResult> {
  const coords = `${from.longitude},${from.latitude};${to.longitude},${to.latitude}`;
  const url = `${OSRM_BASE}/route/v1/${profile}/${coords}?overview=full&geometries=geojson`;

  const response = await fetch(url, { signal });
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

/**
 * Fetches the fastest road route (for drawing on the map) plus
 * approximate travel times for foot, motorcycle, car and train.
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
  const [driving, walking] = await Promise.all([
    fetchOsrmRoute(from, to, "driving", signal),
    // Foot routing can legitimately fail to resolve more often than
    // driving does (no footpath OSRM's foot profile will use) — don't
    // let that take down the whole panel.
    fetchOsrmRoute(from, to, "foot", signal).catch(() => null),
  ]);

  const estimates: RouteEstimate[] = [
    { mode: "foot", available: !!walking, distanceMeters: walking?.distanceMeters, durationSeconds: walking?.durationSeconds },
    {
      mode: "motorcycle",
      available: true,
      distanceMeters: driving.distanceMeters,
      durationSeconds: driving.durationSeconds * MOTORCYCLE_DURATION_FACTOR,
    },
    { mode: "car", available: true, distanceMeters: driving.distanceMeters, durationSeconds: driving.durationSeconds },
    { mode: "train", available: false },
  ];

  return { route: driving, estimates };
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
 * Production note: nominatim.openstreetmap.org and
 * router.project-osrm.org are shared community demo servers — rate
 * limited (~1 req/sec), no uptime SLA, and their usage policies ask that
 * anything beyond light/dev traffic move to a self-hosted instance or a
 * paid provider (e.g. LocationIQ, Geoapify, or Mapbox for geocoding;
 * self-hosted OSRM, GraphHopper, or Mapbox Directions for routing). Fine
 * for MVP/dev; revisit before this carries real Runner-matching traffic.
 */
