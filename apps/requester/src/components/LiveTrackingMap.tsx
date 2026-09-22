import { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, ActivityIndicator } from "react-native";
import { WebView } from "react-native-webview";
import { getTheme } from "@gracerandly/theme";
import type { GeoPoint, ErrandStatus } from "@gracerandly/shared-types";
import { LEAFLET_JS, LEAFLET_CSS } from "../lib/leafletAssets";
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

function buildLiveMapHtml(pickup: GeoPoint, dropoff: GeoPoint, routeCoordinates: [number, number][]): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <style>${LEAFLET_CSS}</style>
  <style>
    html, body, #map { height: 100%; width: 100%; margin: 0; padding: 0; }
    .leaflet-control-attribution { font-size: 8px; }
    .runner-icon-inner {
      width: 22px; height: 22px; border-radius: 11px;
      background: ${theme.colors.primaryDark};
      border: 3px solid #fff;
      box-shadow: 0 2px 6px rgba(0,0,0,0.4);
      transition: transform 0.15s linear;
    }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>${LEAFLET_JS}</script>
  <script>
    var map = L.map('map', { zoomControl: false });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);

    function dot(color) {
      return L.divIcon({
        className: '',
        html: '<div style="background:' + color + ';width:14px;height:14px;border-radius:7px;border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,0.4);"></div>',
        iconSize: [14, 14]
      });
    }

    var pickupMarker = L.marker([${pickup.lat}, ${pickup.lng}], { icon: dot('${theme.colors.primary}') }).addTo(map);
    var dropoffMarker = L.marker([${dropoff.lat}, ${dropoff.lng}], { icon: dot('${theme.colors.primaryDark}') }).addTo(map);
    var routeLine = L.polyline(${JSON.stringify(routeCoordinates)}, {
      color: '${theme.colors.primary}',
      weight: 4,
      opacity: 0.6
    }).addTo(map);

    map.fitBounds(routeLine.getBounds(), { padding: [32, 32] });

    // Icon is a plain div wrapping an inner ".runner-icon-inner" — Leaflet
    // manages the outer element's own transform (translate3d) for
    // positioning on every setLatLng call, so rotating heading has to be
    // applied to a separate inner element or it fights Leaflet's own
    // position updates every frame.
    var runnerIcon = L.divIcon({ className: '', html: '<div class="runner-icon-inner"></div>', iconSize: [22, 22] });
    var runnerMarker = null;
    var currentLatLng = null;
    var animationFrame = null;

    function easeInOutQuad(t) { return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t; }

    // Called from React Native via injectJavaScript on every broadcast
    // position. Glides the marker from its last spot to the new one over
    // ~1.8s (roughly the fake-runner's tick interval) instead of snapping,
    // so movement reads as continuous rather than jump-cut.
    window.moveRunnerTo = function (lat, lng, heading) {
      var target = L.latLng(lat, lng);

      if (!runnerMarker) {
        runnerMarker = L.marker(target, { icon: runnerIcon, zIndexOffset: 1000 }).addTo(map);
        currentLatLng = target;
        map.panTo(target, { animate: true });
        return;
      }

      var start = currentLatLng;
      var startTime = performance.now();
      var durationMs = 1800;
      if (animationFrame) cancelAnimationFrame(animationFrame);

      function step(now) {
        var t = Math.min(1, (now - startTime) / durationMs);
        var eased = easeInOutQuad(t);
        runnerMarker.setLatLng([
          start.lat + (target.lat - start.lat) * eased,
          start.lng + (target.lng - start.lng) * eased
        ]);
        if (t < 1) {
          animationFrame = requestAnimationFrame(step);
        } else {
          currentLatLng = target;
        }
      }
      animationFrame = requestAnimationFrame(step);

      var el = runnerMarker.getElement();
      var inner = el && el.querySelector('.runner-icon-inner');
      if (inner) inner.style.transform = 'rotate(' + heading + 'deg)';

      map.panTo(target, { animate: true, duration: 1.5 });
    };
  </script>
</body>
</html>`;
}

interface LiveTrackingMapProps {
  errandId: string;
  pickup: GeoPoint;
  dropoff: GeoPoint;
  status: ErrandStatus;
}

export default function LiveTrackingMap({ errandId, pickup, dropoff, status }: LiveTrackingMapProps) {
  const webviewRef = useRef<WebView>(null);
  const [mapHtml, setMapHtml] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [hasFirstPosition, setHasFirstPosition] = useState(false);
  const [eta, setEta] = useState<{ distanceMeters: number; durationSeconds: number } | null>(null);

  const lastEtaFetchRef = useRef(0);
  const etaAbortRef = useRef<AbortController | null>(null);

  const legTarget = ACTIVE_LEG_TARGET[status];

  // Fetch the overall pickup->dropoff road route once, purely as static
  // context on the map — the runner marker moves independently on top of
  // it as positions arrive, it isn't recomputed per-tick.
  useEffect(() => {
    let cancelled = false;
    getFastestRouteWithEstimates(
      { latitude: pickup.lat, longitude: pickup.lng },
      { latitude: dropoff.lat, longitude: dropoff.lng }
    )
      .then((result) => {
        if (cancelled) return;
        setMapHtml(
          buildLiveMapHtml(
            pickup,
            dropoff,
            result.route.coordinates.map((c) => [c.latitude, c.longitude] as [number, number])
          )
        );
      })
      .catch(() => !cancelled && setLoadError(true));
    return () => {
      cancelled = true;
    };
  }, [pickup.lat, pickup.lng, dropoff.lat, dropoff.lng]);

  const handlePosition = useCallback(
    (position: RunnerPosition) => {
      setHasFirstPosition(true);
      webviewRef.current?.injectJavaScript(
        `window.moveRunnerTo && window.moveRunnerTo(${position.latitude}, ${position.longitude}, ${position.heading ?? 0}); true;`
      );

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
    [legTarget, pickup, dropoff]
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

  if (loadError) {
    return (
      <View style={[styles.card, styles.centered]}>
        <Text style={styles.helperText}>Couldn't load the live map right now.</Text>
      </View>
    );
  }

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
        <WebView ref={webviewRef} style={styles.map} originWhitelist={["*"]} source={{ html: mapHtml }} />
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
  etaText: {
    fontFamily: theme.fonts.uiSemibold,
    fontSize: 14,
    color: theme.colors.primaryDark,
  },
});
