import * as Location from "expo-location";

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

export async function getCurrentCoordinate(): Promise<Coordinate> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== "granted") {
    throw new LocationPermissionDeniedError();
  }

  const position = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Balanced,
  });
  return { latitude: position.coords.latitude, longitude: position.coords.longitude };
}

/**
 * Turns a lat/lng into a short human-readable address, e.g.
 * "12 Aba Road, Port Harcourt". Returns undefined if reverse geocoding
 * fails or turns up nothing usable — callers should fall back to showing
 * raw coordinates rather than blocking on this.
 */
export async function reverseGeocode(coordinate: Coordinate): Promise<string | undefined> {
  try {
    const [result] = await Location.reverseGeocodeAsync(coordinate);
    if (!result) return undefined;

    const parts = [
      [result.streetNumber, result.street].filter(Boolean).join(" "),
      result.district,
      result.city,
    ].filter((part): part is string => !!part && part.length > 0);

    return parts.length > 0 ? parts.join(", ") : undefined;
  } catch {
    return undefined;
  }
}
