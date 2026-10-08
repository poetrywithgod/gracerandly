// Renders nothing. While the requester has an errand a runner is working on,
// it keeps one GPS watcher running and (1) records where this phone is for
// the live map (lib/liveLocation.ts) and (2) reports that position to the
// API so the runner can see the requester on their map. It works for every
// active errand at once and doesn't depend on which screen is open.
// Sharing stops by itself when the errand is delivered or cancelled.
// Mount once, near the root (App.tsx), inside AuthProvider.
import { useEffect, useRef } from "react";
import { AppState } from "react-native";
import type { Errand } from "@gracerandly/shared-types";
import { useAuth } from "../context/AuthContext";
import { apiFetch } from "../lib/apiClient";
import { watchPosition } from "../lib/location";
import {
  clearOwnPosition,
  getOwnPosition,
  onLiveLocationRefreshRequested,
  setOwnPosition,
  type OwnPosition,
} from "../lib/liveLocation";

// Same set as apps/api's LIVE_SHARING_STATUSES.
const SHARING_STATUSES = new Set(["accepted", "en_route_to_pickup", "in_progress", "en_route_to_delivery"]);
const POLL_INTERVAL_MS = 20_000;

export default function LiveLocationHost() {
  const { token } = useAuth();
  const activeIds = useRef<string[]>([]);

  useEffect(() => {
    if (!token) return;

    let cancelled = false;
    let stopWatching: (() => void) | null = null;
    let watchStarting = false;
    let permissionRefused = false;

    const share = (errandId: string, position: OwnPosition) => {
      apiFetch(`/errands/${errandId}/location`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({ lat: position.lat, lng: position.lng }),
      }).catch(() => {
        // A missed update just means the runner sees the last one a little
        // longer — the next fix (a few seconds on) replaces it.
      });
    };

    const startWatching = () => {
      if (stopWatching || watchStarting || permissionRefused) return;
      watchStarting = true;
      watchPosition((coordinate) => {
        const position = { lat: coordinate.latitude, lng: coordinate.longitude };
        setOwnPosition(position);
        activeIds.current.forEach((id) => share(id, position));
      })
        .then((stop) => {
          if (cancelled || activeIds.current.length === 0) stop();
          else stopWatching = stop;
        })
        .catch(() => {
          permissionRefused = true; // don't re-prompt every 20 seconds
        })
        .finally(() => {
          watchStarting = false;
        });
    };

    const sync = async () => {
      try {
        const { errands } = await apiFetch<{ errands: Errand[] }>("/errands", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (cancelled) return;
        const previous = new Set(activeIds.current);
        activeIds.current = errands.filter((e) => !!e.runnerId && SHARING_STATUSES.has(e.status)).map((e) => e.id);

        if (activeIds.current.length > 0) {
          startWatching();
          // A newly active errand shouldn't wait for the next GPS fix.
          const here = getOwnPosition();
          if (here) activeIds.current.filter((id) => !previous.has(id)).forEach((id) => share(id, here));
        } else if (stopWatching) {
          stopWatching();
          stopWatching = null;
        }
      } catch {
        // Offline or the server is waking up — try again at the next poll.
      }
    };

    sync();
    const interval = setInterval(sync, POLL_INTERVAL_MS);
    const appState = AppState.addEventListener("change", (state) => {
      if (state === "active") sync();
    });
    const unsubscribeRefresh = onLiveLocationRefreshRequested(sync);

    return () => {
      cancelled = true;
      clearInterval(interval);
      appState.remove();
      unsubscribeRefresh();
      stopWatching?.();
      activeIds.current = [];
      clearOwnPosition();
    };
  }, [token]);

  return null;
}
