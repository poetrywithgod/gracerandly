// Renders nothing. While the runner is online it watches GPS and tells the
// API where they are every ~30 seconds (PATCH /runners/me/status), so that:
//  - the server knows which new errands are "nearby" and can push an alert
//    (apps/api's lib/errand-alerts.ts only notifies runners with a recent position), and
//  - the Home screen's list of available errands follows the runner as they
//    move, instead of staying anchored to wherever they went online.
// (Delivering an active errand has its own, faster watcher —
// components/LiveLocationHost.tsx.)
// Mount once, near the root (App.tsx), inside AuthProvider.
import { useEffect, useRef } from "react";
import { useAuth } from "../context/AuthContext";
import { watchPosition } from "../lib/location";
import { haversineMeters } from "../lib/geo";

const REPORT_INTERVAL_MS = 30_000;
// Don't bother the server again if the runner hasn't really moved.
const MIN_MOVE_METERS = 75;

export default function OnlineLocationHost() {
  const { token, user, setOnlineStatus } = useAuth();
  const isOnline = !!user?.isOnline;
  const last = useRef<{ lat: number; lng: number; at: number } | null>(null);
  // setOnlineStatus changes identity with the token only, but keep a ref so
  // the watcher never has to restart because of it.
  const report = useRef(setOnlineStatus);
  report.current = setOnlineStatus;

  useEffect(() => {
    if (!token || !isOnline) {
      last.current = null;
      return;
    }

    let cancelled = false;
    let stop: (() => void) | null = null;

    watchPosition((coordinate) => {
      const now = Date.now();
      const here = { lat: coordinate.latitude, lng: coordinate.longitude };
      const previous = last.current;
      if (previous) {
        const waited = now - previous.at;
        if (waited < REPORT_INTERVAL_MS) return;
        if (waited < REPORT_INTERVAL_MS * 4 && haversineMeters(previous, here) < MIN_MOVE_METERS) return;
      }
      last.current = { ...here, at: now };
      const heading =
        typeof coordinate.heading === "number" && coordinate.heading >= 0 && coordinate.heading <= 360
          ? coordinate.heading
          : undefined;
      // Best-effort: a missed report is replaced by the next one.
      report.current(true, { ...here, heading }).catch(() => {});
    })
      .then((unsubscribe) => {
        if (cancelled) unsubscribe();
        else stop = unsubscribe;
      })
      .catch(() => {
        // No location permission — the Home screen already explains that.
      });

    return () => {
      cancelled = true;
      stop?.();
    };
  }, [token, isOnline]);

  return null;
}
