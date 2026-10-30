import { Platform } from "react-native";
import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
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

const LOCATION_TASK = "gracerandly-runner-location";

// Everyone who asked for a watch (OnlineLocationHost while online,
// LiveLocationHost while an errand is active). They share one foreground
// service: it starts with the first listener and stops with the last.
const taskListeners = new Set<(coordinate: Coordinate) => void>();
let taskStarting: Promise<void> | null = null;

// Must be defined at module level so Android can re-attach it. The task only
// ever runs while the "sharing your location" notification is showing.
TaskManager.defineTask(LOCATION_TASK, async ({ data, error }) => {
  if (error || taskListeners.size === 0) return;
  const locations = (data as { locations?: Location.LocationObject[] } | undefined)?.locations;
  const position = locations?.[locations.length - 1];
  if (!position) return;
  const coordinate = {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    heading: position.coords.heading ?? undefined,
  };
  taskListeners.forEach((listener) => listener(coordinate));
});

/**
 * Starts watching the device's position and invokes `onUpdate` on every
 * fix (subject to the interval/distance filters below). Returns a cleanup
 * function — call it on unmount or when going offline.
 *
 * On Android the watch runs as a foreground service (a visible "sharing your
 * location" notification) so requesters keep seeing the runner move while the
 * phone is locked or another app is open. That needs only the normal
 * while-using-the-app location permission — no background-location permission,
 * which Google Play restricts. If the service can't start (for example the app
 * isn't on screen), it falls back to a plain foreground watch.
 */
export async function watchPosition(onUpdate: (coordinate: Coordinate) => void): Promise<() => void> {
  await requestLocationPermission();

  const options = {
    accuracy: Location.Accuracy.Balanced,
    timeInterval: LOCATION_UPDATE_INTERVAL_MS,
    distanceInterval: 15, // meters
  };

  if (Platform.OS === "android") {
    try {
      taskListeners.add(onUpdate);
      if (!taskStarting) {
        taskStarting = (async () => {
          if (await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK).catch(() => false)) return;
          await Location.startLocationUpdatesAsync(LOCATION_TASK, {
            ...options,
            foregroundService: {
              notificationTitle: "Gracerandly is sharing your location",
              notificationBody: "Your requester can follow this errand. It stops when you go offline or finish.",
              notificationColor: "#502D55",
            },
          });
        })().finally(() => {
          taskStarting = null;
        });
      }
      await taskStarting;
      return () => {
        taskListeners.delete(onUpdate);
        if (taskListeners.size === 0) {
          void Location.stopLocationUpdatesAsync(LOCATION_TASK).catch(() => undefined);
        }
      };
    } catch (err) {
      taskListeners.delete(onUpdate);
      console.warn("[location] foreground service unavailable, using a plain watch", err);
    }
  }

  const subscription = await Location.watchPositionAsync(options, (position) => {
    onUpdate({
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      heading: position.coords.heading ?? undefined,
    });
  });

  return () => subscription.remove();
}
