import { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, ActivityIndicator } from "react-native";
import { WebView } from "react-native-webview";
import { getTheme } from "@gracerandly/theme";
import type { GeoPoint, ErrandStatus } from "@gracerandly/shared-types";
import { useAuth } from "../context/AuthContext";
import { buildLiveMapHtml } from "../lib/liveMapHtml";
import { fetchChatParticipant } from "../lib/chatApi";
import { getOwnPosition, subscribeToOwnPosition, type OwnPosition } from "../lib/liveLocation";
import { subscribeToRunnerLocation, type RunnerPosition } from "../lib/realtime";
import { getFastestRouteWithEstimates, getEtaToPoint, formatDistance, formatDuration } from "../lib/routing";

const theme = getTheme("light");

// OSRM's public router asks for ~1 req/sec fair use — recalculating the
// "distance/time to next waypoint" on every ~2s position broadcast would
// eat that budget fast, so only refresh it this often regardless of how
// frequently positions arrive.
const ETA_RECALC_MIN_INTERVAL_MS = 10000;

// Which waypoint is the runner currently heading toward, by errand status.
// Statuses not listed here (pending_match, delivered, cancelled) mean
// "don't show live tracking" — handled by the caller, not this map.
const ACTIVE_LEG_TARGET: Partial<Record<ErrandStatus, "pickup" | "dropoff">> = {
  accepted: "pickup",
  en_route_to_pickup: "pickup",
  in_progress: "dropoff",
  en_route_to_delivery: "dropoff",
};

const LEG_LABEL: Record<"pickup" | "dropoff", string> = {
  pickup: "Runner heading to pickup",
  dropoff: "Runner heading to you",
};

interface LiveTrackingMapProps {
  errandId: string;
  pickup: GeoPoint;
  dropoff: GeoPoint;
  status: ErrandStatus;
}

interface Person {
  name: string;
  uri: string;
}

export default function LiveTrackingMap({ errandId, pickup, dropoff, status }: LiveTrackingMapProps) {
  const { token, user } = useAuth();
  const webviewRef = useRef<WebView>(null);
  const [mapHtml, setMapHtml] = useState<string | null>(null);
  const [hasFirstPosition, setHasFirstPosition] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [runnerName, setRunnerName] = useState<string | null>(null);
  const [eta, setEta] = useState<{ distanceMeters: number; durationSeconds: number } | null>(null);

  const lastEtaFetchRef = useRef(0);
  const etaAbortRef = useRef<AbortController | null>(null);

  // What the map page needs to be told. Kept in refs so that, whenever the
  // page (re)loads, everything known so far can be replayed into it —
  // positions that arrive before the page is ready aren't lost.
  const pageReady = useRef(false);
  const runnerPerson = useRef<Person>({ name: "Runner", uri: "" });
  const lastRunner = useRef<RunnerPosition | null>(null);
  const lastMe = useRef<OwnPosition | null>(getOwnPosition());

  const legTarget = ACTIVE_LEG_TARGET[status];

  const inject = useCallback((js: string) => {
    webviewRef.current?.injectJavaScript(`${js}; true;`);
  }, []);

  const sendAvatars = useCallback(() => {
    if (!pageReady.current) return;
    const me = { name: user?.fullName ?? "Me", uri: user?.avatarUrl ?? "" };
    inject(
      `window.setAvatar('runner', ${JSON.stringify(runnerPerson.current.name)}, ${JSON.stringify(runnerPerson.current.uri)});` +
        `window.setAvatar('requester', ${JSON.stringify(me.name)}, ${JSON.stringify(me.uri)})`
    );
  }, [inject, user?.fullName, user?.avatarUrl]);

  const sendRunner = useCallback(() => {
    const p = lastRunner.current;
    if (pageReady.current && p) inject(`window.setPerson('runner', ${p.latitude}, ${p.longitude})`);
  }, [inject]);

  const sendMe = useCallback(() => {
    const p = lastMe.current;
    if (pageReady.current && p) inject(`window.setPerson('requester', ${p.lat}, ${p.lng})`);
  }, [inject]);

  // Fetch the overall pickup->dropoff road route once, purely as static
  // context on the map — the people move independently on top of it as
  // positions arrive, it isn't recomputed per-tick. If the public routing
  // service is busy or unreachable the map still opens, just without the
  // road line (before, one failed lookup meant no map at all).
  useEffect(() => {
    let cancelled = false;
    pageReady.current = false;
    getFastestRouteWithEstimates(
      { latitude: pickup.lat, longitude: pickup.lng },
      { latitude: dropoff.lat, longitude: dropoff.lng }
    )
      .then((result) => {
        if (cancelled) return;
        setMapHtml(
          buildLiveMapHtml({
            pickup,
            dropoff,
            routeCoordinates: result.route.coordinates.map((c) => [c.latitude, c.longitude] as [number, number]),
          })
        );
      })
      .catch(() => {
        if (!cancelled) setMapHtml(buildLiveMapHtml({ pickup, dropoff }));
      });
    return () => {
      cancelled = true;
    };
  }, [pickup.lat, pickup.lng, dropoff.lat, dropoff.lng]);

  // Who the runner is, for their avatar.
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    fetchChatParticipant("requester", errandId, token)
      .then((participant) => {
        if (cancelled) return;
        runnerPerson.current = { name: participant.name, uri: participant.avatarUrl ?? "" };
        setRunnerName(participant.name);
        sendAvatars();
      })
      .catch(() => {
        // No avatar yet — the runner's marker just shows an initial.
      });
    return () => {
      cancelled = true;
    };
  }, [errandId, token, sendAvatars]);

  // The page may finish loading before or after the data above arrives.
  const handlePageLoaded = useCallback(() => {
    pageReady.current = true;
    sendAvatars();
    sendRunner();
    sendMe();
  }, [sendAvatars, sendRunner, sendMe]);

  useEffect(() => {
    sendAvatars(); // e.g. the requester changed their own picture
  }, [sendAvatars]);

  // This phone's own position, shown as the requester's avatar.
  useEffect(() => {
    if (getOwnPosition()) setSharing(true);
    return subscribeToOwnPosition((position) => {
      lastMe.current = position;
      setSharing(true);
      sendMe();
    });
  }, [sendMe]);

  const handlePosition = useCallback(
    (position: RunnerPosition) => {
      setHasFirstPosition(true);
      lastRunner.current = position;
      sendRunner();

      if (!legTarget) return;
      const now = Date.now();
      if (now - lastEtaFetchRef.current < ETA_RECALC_MIN_INTERVAL_MS) return;
      lastEtaFetchRef.current = now;

      const target = legTarget === "pickup" ? pickup : dropoff;
      etaAbortRef.current?.abort();
      const controller = new AbortController();
      etaAbortRef.current = controller;
      getEtaToPoint(
        { latitude: position.latitude, longitude: position.longitude },
        { latitude: target.lat, longitude: target.lng },
        controller.signal
      )
        .then(setEta)
        .catch(() => {
          // A missed tick just means the ETA label goes stale for a beat —
          // the next successful tick corrects it, so silently drop errors
          // here rather than surfacing a scary banner over a live map.
        });
    },
    [legTarget, pickup, dropoff, sendRunner]
  );

  useEffect(() => {
    const unsubscribe = subscribeToRunnerLocation(errandId, handlePosition);
    return unsubscribe;
  }, [errandId, handlePosition]);

  // Reset the ETA once the leg changes (e.g. pickup -> dropoff) so a stale
  // "to pickup" estimate doesn't linger under the "heading to you" label.
  useEffect(() => {
    setEta(null);
    lastEtaFetchRef.current = 0;
  }, [legTarget]);

  if (!mapHtml) {
    return (
      <View style={[styles.card, styles.centered]}>
        <ActivityIndicator color={theme.colors.primary} />
        <Text style={styles.helperText}>Loading map…</Text>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <Text style={styles.sectionLabel}>{legTarget ? LEG_LABEL[legTarget] : "Runner location"}</Text>

      <View style={styles.mapWrapper}>
        <WebView
          ref={webviewRef}
          style={styles.map}
          originWhitelist={["*"]}
          source={{ html: mapHtml }}
          onLoadEnd={handlePageLoaded}
        />
        {!hasFirstPosition ? (
          <View style={styles.waitingOverlay} pointerEvents="none">
            <ActivityIndicator color={theme.colors.primary} />
            <Text style={styles.waitingText}>Waiting for the runner's location…</Text>
          </View>
        ) : null}
      </View>

      {eta ? (
        <Text style={styles.etaText}>
          {formatDistance(eta.distanceMeters)} away · about {formatDuration(eta.durationSeconds)}
        </Text>
      ) : null}
      {sharing ? (
        <Text style={styles.shareNote}>
          Your location is shared with {runnerName ?? "your runner"} while this errand is active.
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    padding: theme.spacing.md,
    marginTop: theme.spacing.lg,
    gap: 8,
  },
  centered: { alignItems: "center", justifyContent: "center", paddingVertical: theme.spacing.lg, gap: 8 },
  sectionLabel: {
    fontFamily: theme.fonts.uiMedium,
    fontSize: 14,
    color: theme.colors.text,
  },
  helperText: {
    fontFamily: theme.fonts.ui,
    fontSize: 13,
    color: theme.colors.textMuted,
  },
  mapWrapper: {
    height: 220,
    borderRadius: theme.radius.md,
    overflow: "hidden",
  },
  map: { flex: 1 },
  waitingOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(255,255,255,0.75)",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  waitingText: {
    fontFamily: theme.fonts.uiMedium,
    fontSize: 13,
    color: theme.colors.text,
  },
  shareNote: {
    fontFamily: theme.fonts.ui,
    fontSize: 12,
    color: theme.colors.textMuted,
  },
  etaText: {
    fontFamily: theme.fonts.uiSemibold,
    fontSize: 14,
    color: theme.colors.primaryDark,
  },
});
