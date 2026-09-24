import * as Location from "expo-location";

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

export async function requestLocationPermission(): Promise<void> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== "granted") {
    throw new LocationPermissionDeniedError();
  }
}

export async function getCurrentCoordinate(): Promise<Coordinate> {
  await requestLocationPermission();
  const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    heading: position.coords.heading ?? undefined,
  };
}

// How often the app pushes a fresh position while the runner is online —
// used both for the "keep the server's currentLocation fresh" PATCH
// /runners/me/status call and for broadcasting to an active errand's
// Realtime channel (see lib/realtime.ts). 8s balances battery use against
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
