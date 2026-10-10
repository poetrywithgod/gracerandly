/**
 * Where each party to an errand last said they were — kept in memory only.
 *
 * Both people's positions travel through THIS store: each phone POSTs its
 * position (requester: POST /errands/:id/location, runner: POST
 * /runners/errands/:id/location) and reads the other person's (requester:
 * GET /errands/:id/runner-location, runner: GET
 * /runners/errands/:id/requester-location). Every read and write is an
 * authenticated API call that checks the caller is a party to that errand.
 * (The runner's position used to go over a public Supabase Realtime channel
 * named after the errand id — and every runner can see the ids of open
 * errands, so anyone with the public key could have listened in.)
 *
 * Positions are deliberately not stored in the database: they're only
 * useful for a minute or two, a restart simply means the next update (a few
 * seconds later) refills them, and nothing about where someone was is kept
 * after the errand.
 */
export type PositionRole = "requester" | "runner";

export interface LivePosition {
  lat: number;
  lng: number;
  heading?: number;
  /** ms since epoch, set by the server when the update arrives. */
  updatedAt: number;
}

/** Older than this and the person has probably closed the app — treat as unknown. */
export const POSITION_MAX_AGE_MS = 2 * 60 * 1000;

/** Errand statuses in which both parties share their position. */
export const LIVE_SHARING_STATUSES = new Set(["accepted", "en_route_to_pickup", "in_progress", "en_route_to_delivery"]);

const positions = new Map<string, Partial<Record<PositionRole, LivePosition>>>();

export function setLivePosition(errandId: string, role: PositionRole, position: Omit<LivePosition, "updatedAt">): void {
  const entry = positions.get(errandId) ?? {};
  entry[role] = { ...position, updatedAt: Date.now() };
  positions.set(errandId, entry);
}

export function getLivePosition(errandId: string, role: PositionRole): LivePosition | null {
  const position = positions.get(errandId)?.[role];
  if (!position) return null;
  if (Date.now() - position.updatedAt > POSITION_MAX_AGE_MS) return null;
  return position;
}

export function clearLivePositions(errandId: string): void {
  positions.delete(errandId);
}

// Drop entries nobody has refreshed for a while so the map can't grow
// forever (e.g. an errand abandoned mid-way).
const sweeper = setInterval(() => {
  const cutoff = Date.now() - 10 * POSITION_MAX_AGE_MS;
  for (const [errandId, entry] of positions) {
    const newest = Math.max(entry.requester?.updatedAt ?? 0, entry.runner?.updatedAt ?? 0);
    if (newest < cutoff) positions.delete(errandId);
  }
}, 5 * 60 * 1000);
sweeper.unref();
