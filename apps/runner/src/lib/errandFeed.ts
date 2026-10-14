// A tiny signal bus so something outside the Home screen (a push that just
// arrived while the app is open) can tell it "re-check for errands now"
// instead of waiting for the next poll. Same shape as lib/liveLocation.ts's
// refresh request.
const listeners = new Set<() => void>();

export function requestErrandFeedRefresh(): void {
  listeners.forEach((listener) => listener());
}

/** Calls `listener` whenever a refresh is requested. Returns the unsubscribe function. */
export function onErrandFeedRefreshRequested(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
