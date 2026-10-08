// Identical to apps/requester/src/lib/liveLocation.ts — see components/GlassCard.tsx's
// header comment for why it's duplicated.
//
// Where THIS phone is right now, shared between components. One component
// (components/LiveLocationHost.tsx) owns the GPS watcher and writes here;
// the live map reads from here, so there's only ever one watcher no matter
// how many screens want the position.
export interface OwnPosition {
  lat: number;
  lng: number;
  heading?: number;
}

let latest: OwnPosition | null = null;
const listeners = new Set<(position: OwnPosition) => void>();

export function setOwnPosition(position: OwnPosition): void {
  latest = position;
  listeners.forEach((listener) => listener(position));
}

export function getOwnPosition(): OwnPosition | null {
  return latest;
}

/** Calls `listener` on every new position. Returns the unsubscribe function. */
export function subscribeToOwnPosition(listener: (position: OwnPosition) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Forget the last position (on sign-out) so the next person on this phone doesn't inherit it. */
export function clearOwnPosition(): void {
  latest = null;
}

// Lets a screen ask the host to re-check which errands are active right
// now (e.g. straight after accepting one) instead of waiting for its next poll.
const refreshListeners = new Set<() => void>();

export function requestLiveLocationRefresh(): void {
  refreshListeners.forEach((listener) => listener());
}

export function onLiveLocationRefreshRequested(listener: () => void): () => void {
  refreshListeners.add(listener);
  return () => {
    refreshListeners.delete(listener);
  };
}
