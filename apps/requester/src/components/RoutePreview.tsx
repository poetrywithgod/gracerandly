import { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, ActivityIndicator } from "react-native";
import { WebView } from "react-native-webview";
import { Bike, Car, Footprints, TrainFront, type LucideIcon } from "lucide-react-native";
import { getTheme } from "@gracerandly/theme";
import type { GeoPoint } from "@gracerandly/shared-types";
import { LEAFLET_JS, LEAFLET_CSS } from "../lib/leafletAssets";
import {
  getFastestRouteWithEstimates,
  formatDistance,
  formatDuration,
  type FastestRoute,
  type RouteEstimate,
  type TravelMode,
} from "../lib/routing";

const theme = getTheme("light");

// Static preview map: draws the fastest road route between two fixed
// points. No live pan/zoom/interaction — this isn't the picker, it's a
// summary — so tile/gesture handlers from LocationPickerModal's map are
// deliberately left out.
function buildRouteHtml(
  pickup: { lat: number; lng: number },
  dropoff: { lat: number; lng: number },
  routeCoordinates: [number, number][]
): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <style>${LEAFLET_CSS}</style>
  <style>
    html, body, #map { height: 100%; width: 100%; margin: 0; padding: 0; }
    .leaflet-control-attribution { font-size: 8px; }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>${LEAFLET_JS}</script>
  <script>
    var map = L.map('map', {
      zoomControl: false,
      dragging: false,
      scrollWheelZoom: false,
      doubleClickZoom: false,
      touchZoom: false,
      attributionControl: true
    });

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

    L.marker([${pickup.lat}, ${pickup.lng}], { icon: dot('${theme.colors.primary}') }).addTo(map);
    L.marker([${dropoff.lat}, ${dropoff.lng}], { icon: dot('${theme.colors.primaryDark}') }).addTo(map);

    var line = L.polyline(${JSON.stringify(routeCoordinates)}, {
      color: '${theme.colors.primary}',
      weight: 4,
      opacity: 0.85
    }).addTo(map);

    map.fitBounds(line.getBounds(), { padding: [28, 28] });
  </script>
</body>
</html>`;
}

const MODE_META: Record<TravelMode, { label: string; Icon: LucideIcon }> = {
  foot: { label: "Walk", Icon: Footprints },
  motorcycle: { label: "Okada", Icon: Bike },
  car: { label: "Car", Icon: Car },
  train: { label: "Train", Icon: TrainFront },
};

interface RoutePreviewProps {
  pickup: GeoPoint;
  dropoff: GeoPoint;
}

export default function RoutePreview({ pickup, dropoff }: RoutePreviewProps) {
  const [result, setResult] = useState<FastestRoute | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setIsLoading(true);
    setError(null);
    setResult(null);

    getFastestRouteWithEstimates(
      { latitude: pickup.lat, longitude: pickup.lng },
      { latitude: dropoff.lat, longitude: dropoff.lng },
      controller.signal
    )
      .then(setResult)
      .catch((err) => {
        if (err instanceof Error && err.name === "AbortError") return;
        setError("Couldn't calculate a route for these locations.");
      })
      .finally(() => setIsLoading(false));

    return () => controller.abort();
  }, [pickup.lat, pickup.lng, dropoff.lat, dropoff.lng]);

  const mapHtml = useMemo(() => {
    if (!result) return null;
    return buildRouteHtml(
      { lat: pickup.lat, lng: pickup.lng },
      { lat: dropoff.lat, lng: dropoff.lng },
      result.route.coordinates.map((c) => [c.latitude, c.longitude] as [number, number])
    );
  }, [result, pickup.lat, pickup.lng, dropoff.lat, dropoff.lng]);

  if (isLoading) {
    return (
      <View style={[styles.card, styles.centered]}>
        <ActivityIndicator color={theme.colors.primary} />
        <Text style={styles.helperText}>Calculating route…</Text>
      </View>
    );
  }

  if (error || !result || !mapHtml) {
    return (
      <View style={[styles.card, styles.centered]}>
        <Text style={styles.helperText}>{error ?? "Route unavailable right now."}</Text>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <Text style={styles.sectionLabel}>Route & travel time</Text>

      <View style={styles.mapWrapper}>
        <WebView style={styles.map} originWhitelist={["*"]} source={{ html: mapHtml }} scrollEnabled={false} />
      </View>

      <Text style={styles.distanceText}>{formatDistance(result.route.distanceMeters)} · fastest route by road</Text>

      <View style={styles.modesRow}>
        {result.estimates.map((estimate) => (
          <ModeChip key={estimate.mode} estimate={estimate} />
        ))}
      </View>

      <Text style={styles.trainNote}>Train isn't available as an option here yet.</Text>
    </View>
  );
}

function ModeChip({ estimate }: { estimate: RouteEstimate }) {
  const { label, Icon } = MODE_META[estimate.mode];
  const hasValue = estimate.available && estimate.durationSeconds != null;
  return (
    <View style={styles.modeChip}>
      <Icon size={18} color={hasValue ? theme.colors.primary : theme.colors.textMuted} />
      <Text style={styles.modeLabel}>{label}</Text>
      <Text style={[styles.modeValue, !hasValue && styles.modeValueMuted]}>
        {hasValue ? formatDuration(estimate.durationSeconds as number) : "N/A"}
      </Text>
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
    marginBottom: theme.spacing.md,
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
    height: 160,
    borderRadius: theme.radius.md,
    overflow: "hidden",
  },
  map: { flex: 1 },
  distanceText: {
    fontFamily: theme.fonts.ui,
    fontSize: 12,
    color: theme.colors.textMuted,
  },
  modesRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 4,
  },
  modeChip: {
    flex: 1,
    alignItems: "center",
    gap: 2,
  },
  modeLabel: {
    fontFamily: theme.fonts.ui,
    fontSize: 11,
    color: theme.colors.textMuted,
  },
  modeValue: {
    fontFamily: theme.fonts.uiSemibold,
    fontSize: 13,
    color: theme.colors.text,
  },
  modeValueMuted: {
    color: theme.colors.textMuted,
  },
  trainNote: {
    fontFamily: theme.fonts.ui,
    fontSize: 11,
    color: theme.colors.textMuted,
    fontStyle: "italic",
  },
});
