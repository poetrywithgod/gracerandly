import * as Location from "expo-location";
import { ensurePermission } from "./permissions";

export interface Coordinate {
  latitude: number;
  longitude: number;
  heading?: number;
}

export class LocationPermissionDeniedError extends Error {
  constructor() {
    super("Location permission is required to go online and accept errands.");
    this.name = "LocationPermissionDeniedError";
  }
}

/** Permission is fine but no position could be read (location switched off,
 * or no GPS fix yet). The message is safe to show the user. */
export class LocationUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LocationUnavailableError";
  }
}

export async function requestLocationPermission(): Promise<void> {
  // Shows the app's own explainer card first, then the OS dialog (see
  // lib/permissions.ts).
  const outcome = await ensurePermission("location");
  if (outcome !== "granted") {
    throw new LocationPermissionDeniedError();
  }
}

const FRESH_FIX_MAX_AGE_MS = 2 * 60 * 1000;
const ANY_FIX_MAX_AGE_MS = 30 * 60 * 1000;
const FIX_TIMEOUT_MS = 10_000;

// getCurrentPositionAsync has no timeout of its own: with no GPS fix
// (indoors, weak signal, location switched off) it never resolves.
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
  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    heading: position.coords.heading ?? undefined,
  };
}

/**
 * The device's current position, or a clear error — never a hang.
 * Order: a recent cached fix (instant) → a fresh fix (up to 10s) → any
 * cached fix up to 30 minutes old → a LocationUnavailableError.
 */
export async function getCurrentCoordinate(): Promise<Coordinate> {
  await requestLocationPermission();

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
    "Couldn't get a GPS fix. Try again near a window or outside."
  );
}

// How often the app pushes a fresh position while the runner is online —
// used both for the "keep the server's currentLocation fresh" PATCH
// /runners/me/status call and for reporting to the API for each active
// errand (components/LiveLocationHost.tsx). 8s balances battery use against
// the requester wanting to see reasonably live movement.
export const LOCATION_UPDATE_INTERVAL_MS = 8000;

/**
 * Starts watching the device's position and invokes `onUpdate` on every
 * fix (subject to the interval/distance filters below). Returns a cleanup
 * function — call it on unmount or when going offline.
 */
export async function watchPosition(onUpdate: (coordinate: Coordinate) => void): Promise<() => void> {
  await requestLocationPermission();

  const subscription = await Location.watchPositionAsync(
    {
      accuracy: Location.Accuracy.Balanced,
      timeInterval: LOCATION_UPDATE_INTERVAL_MS,
      distanceInterval: 15, // meters
    },
    (position) => {
      onUpdate({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        heading: position.coords.heading ?? undefined,
      });
    }
  );

  return () => subscription.remove();
}
