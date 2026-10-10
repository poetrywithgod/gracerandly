// Renders nothing. While the runner has any errand in progress it keeps ONE
// GPS watcher running and (1) records where this phone is for the live map
// (lib/liveLocation.ts) and (2) reports that position to the API for EVERY
// active errand — so a runner juggling two errands is visible on both
// requesters' maps, whichever screen is open. Only the requester on that
// errand can read it back (the API checks), so it isn't broadcast anywhere
// public.
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
const POLL_INTERVAL_MS = 15_000;

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
      // Phones report -1 (or nothing) when they don't know which way they're
      // facing; the API only accepts 0-360, and one rejected field would
      // drop the whole update — so only send a heading that's real.
      const heading =
        typeof position.heading === "number" && position.heading >= 0 && position.heading <= 360
          ? position.heading
          : undefined;
      apiFetch(`/runners/errands/${errandId}/location`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({ lat: position.lat, lng: position.lng, heading }),
      }).catch(() => {
        // A missed update just means the requester sees the last one a
        // little longer — the next fix (a few seconds on) replaces it. An
        // errand that has just been delivered also lands here (the API
        // stops accepting positions for it), which is fine.
      });
    };

    const startWatching = () => {
      if (stopWatching || watchStarting || permissionRefused) return;
      watchStarting = true;
      watchPosition((coordinate) => {
        const position = { lat: coordinate.latitude, lng: coordinate.longitude, heading: coordinate.heading };
        setOwnPosition(position);
        activeIds.current.forEach((id) => share(id, position));
      })
        .then((stop) => {
          if (cancelled || activeIds.current.length === 0) stop();
          else stopWatching = stop;
        })
        .catch(() => {
          permissionRefused = true; // don't re-prompt every 15 seconds
        })
        .finally(() => {
          watchStarting = false;
        });
    };

    const sync = async () => {
      try {
        const { errands } = await apiFetch<{ errands: Errand[] }>("/runners/errands/mine", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (cancelled) return;
        const previous = activeIds.current;
        activeIds.current = errands.filter((e) => SHARING_STATUSES.has(e.status)).map((e) => e.id);

        if (activeIds.current.length > 0) {
          startWatching();
          // A newly active errand shouldn't wait for the next GPS fix.
          const here = getOwnPosition();
          if (here) activeIds.current.filter((id) => !previous.includes(id)).forEach((id) => share(id, here));
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
