import * as Location from "expo-location";
import { ensurePermission } from "./permissions";

export interface Coordinate {
  latitude: number;
  longitude: number;
}

export class LocationPermissionDeniedError extends Error {
  constructor() {
    super("Location permission was denied. You can still drop a pin manually on the map.");
    this.name = "LocationPermissionDeniedError";
  }
}

/** Permission is fine but no position could be read (location switched off,
 * or no GPS fix yet, e.g. indoors). The message is safe to show the user. */
export class LocationUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LocationUnavailableError";
  }
}

const FRESH_FIX_MAX_AGE_MS = 2 * 60 * 1000;
const ANY_FIX_MAX_AGE_MS = 30 * 60 * 1000;
const FIX_TIMEOUT_MS = 10_000;

// getCurrentPositionAsync has no timeout of its own: with no GPS fix (indoors,
// weak signal, location switched off) it just never resolves. That left the
// map's locating spinner going forever.
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve(null), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

function toCoordinate(position: Location.LocationObject): Coordinate {
  return { latitude: position.coords.latitude, longitude: position.coords.longitude };
}

/**
 * The device's current position, or a clear error — never a hang.
 * Order: a recent cached fix (instant) → a fresh fix (up to 10s) → any
 * cached fix up to 30 minutes old → a LocationUnavailableError.
 */
export async function getCurrentCoordinate(): Promise<Coordinate> {
  const outcome = await ensurePermission("location");
  if (outcome !== "granted") throw new LocationPermissionDeniedError();

  if (!(await Location.hasServicesEnabledAsync())) {
    throw new LocationUnavailableError("Location is switched off on your phone. Turn it on, then try again.");
  }

  const recent = await Location.getLastKnownPositionAsync({
    maxAge: FRESH_FIX_MAX_AGE_MS,
    requiredAccuracy: 200,
  }).catch(() => null);
  if (recent) return toCoordinate(recent);

  try {
    const fresh = await withTimeout(
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
      FIX_TIMEOUT_MS
    );
    if (fresh) return toCoordinate(fresh);
  } catch {
    // fall through to the cached fix below
  }

  const stale = await Location.getLastKnownPositionAsync({ maxAge: ANY_FIX_MAX_AGE_MS }).catch(() => null);
  if (stale) return toCoordinate(stale);

  throw new LocationUnavailableError(
    "Couldn't get a GPS fix. Try again near a window or outside, or drop a pin manually."
  );
}

const NOMINATIM_REVERSE = "https://nominatim.openstreetmap.org/reverse";
const NOMINATIM_HEADERS = { "User-Agent": "Gracerandly/1.0 (+https://github.com/poetrywithgod/gracerandly)" };
const GEOCODE_TIMEOUT_MS = 6000;

async function fetchJsonWithTimeout<T>(url: string, ms: number): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    const response = await fetch(url, { headers: NOMINATIM_HEADERS, signal: controller.signal });
    if (!response.ok) throw new Error(`Reverse geocoding failed (${response.status})`);
    return (await response.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

async function reverseGeocodeOsm(coordinate: Coordinate): Promise<string | undefined> {
  const params = new URLSearchParams({
    format: "jsonv2",
    lat: String(coordinate.latitude),
    lon: String(coordinate.longitude),
    zoom: "18",
    addressdetails: "1",
  });
  const data = await fetchJsonWithTimeout<{
    name?: string;
    display_name?: string;
    address?: Record<string, string | undefined>;
  }>(`${NOMINATIM_REVERSE}?${params.toString()}`, GEOCODE_TIMEOUT_MS);

  const a = data.address ?? {};
  const street = [a.house_number, a.road].filter(Boolean).join(" ");
  const area = a.suburb ?? a.neighbourhood ?? a.quarter ?? a.village ?? a.town;
  const city = a.city ?? a.county ?? a.state_district;
  const parts = [data.name && data.name !== a.road ? data.name : undefined, street || undefined, area, city].filter(
    (part, index, all): part is string => !!part && all.indexOf(part) === index
  );
  if (parts.length > 0) return parts.slice(0, 3).join(", ");
  return data.display_name?.split(",").slice(0, 3).join(",").trim();
}

// The phone's own geocoder: on Android it depends on Google Play services
// and is missing or slow on some devices, so it's only the fallback.
async function reverseGeocodeDevice(coordinate: Coordinate): Promise<string | undefined> {
  const [result] = (await withTimeout(Location.reverseGeocodeAsync(coordinate), 4000)) ?? [];
  if (!result) return undefined;

  const parts = [
    [result.streetNumber, result.street].filter(Boolean).join(" "),
    result.district,
    result.city,
  ].filter((part): part is string => !!part && part.length > 0);
  return parts.length > 0 ? parts.join(", ") : undefined;
}

/**
 * Turns a lat/lng into a short human-readable address, e.g.
 * "12 Aba Road, Rumuola, Port Harcourt". Returns undefined if nothing
 * usable turns up — callers should fall back to raw coordinates rather than
 * blocking on this. Never hangs: every lookup has a timeout.
 */
export async function reverseGeocode(coordinate: Coordinate): Promise<string | undefined> {
  try {
    const fromOsm = await reverseGeocodeOsm(coordinate);
    if (fromOsm) return fromOsm;
  } catch {
    // fall back to the device geocoder
  }
  try {
    return await reverseGeocodeDevice(coordinate);
  } catch {
    return undefined;
  }
}
