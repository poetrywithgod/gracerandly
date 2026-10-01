import { useCallback, useEffect, useRef, useState } from "react";
import {
  Modal,
  View,
  Text,
  TextInput,
  FlatList,
  Pressable,
  ActivityIndicator,
  Keyboard,
  StyleSheet,
  Platform,
} from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import { LocateFixed, MapPin, Search, X } from "lucide-react-native";
import { getTheme } from "@gracerandly/theme";
import type { GeoPoint } from "@gracerandly/shared-types";
import Button from "./Button";
import {
  getCurrentCoordinate,
  reverseGeocode,
  LocationPermissionDeniedError,
  LocationUnavailableError,
} from "../lib/location";
import { searchAddress, type PlaceSuggestion } from "../lib/routing";
import { LEAFLET_JS, LEAFLET_CSS } from "../lib/leafletAssets";

const SEARCH_DEBOUNCE_MS = 400;

const theme = getTheme("light");

interface Coordinate {
  latitude: number;
  longitude: number;
}

// Port Harcourt city center — used as a sane default map center when we
// have no better starting point (no `initial` prop and location
// permission hasn't been granted/resolved yet).
const DEFAULT_COORDINATE: Coordinate = { latitude: 4.8156, longitude: 7.0498 };
const DEFAULT_ZOOM = 13;
const FOCUSED_ZOOM = 16;

function toCoordinate(point: GeoPoint | undefined): Coordinate {
  return point ? { latitude: point.lat, longitude: point.lng } : DEFAULT_COORDINATE;
}

// Self-contained page: Leaflet + OpenStreetMap tiles, both free and
// keyless (unlike react-native-maps, which wraps the native Google Maps
// SDK on Android and needs a billed API key to render anything at all —
// that's what was causing the blank map originally, not a config mistake).
// Leaflet itself is bundled inline (see leafletAssets.ts) rather than
// fetched from a CDN, so the map still renders even when that CDN request
// fails on a given device/network — only the OpenStreetMap tile images
// still need a live network request, same as any online map.
function buildMapHtml(center: Coordinate, zoom: number): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <style>${LEAFLET_CSS}</style>
  <style>
    html, body, #map { height: 100%; width: 100%; margin: 0; padding: 0; }
    .leaflet-control-attribution { font-size: 9px; }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>${LEAFLET_JS}</script>
  <script>
    window.map = L.map('map', { zoomControl: false }).setView([${center.latitude}, ${center.longitude}], ${zoom});

    var tiles = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    });
    tiles.addTo(window.map);

    function post(type, payload) {
      window.ReactNativeWebView.postMessage(JSON.stringify(Object.assign({ type: type }, payload || {})));
    }

    // Blue "you are here" dot, updated from the app via setMe().
    var meMarker = null;
    var meRing = null;
    window.setMe = function (lat, lng) {
      if (meMarker) { meMarker.setLatLng([lat, lng]); meRing.setLatLng([lat, lng]); return; }
      meRing = L.circle([lat, lng], { radius: 40, color: '#3b82f6', weight: 1, fillColor: '#3b82f6', fillOpacity: 0.12, interactive: false }).addTo(window.map);
      meMarker = L.marker([lat, lng], {
        interactive: false,
        icon: L.divIcon({
          className: '',
          html: '<div style="background:#3b82f6;width:16px;height:16px;border-radius:8px;border:3px solid #fff;box-shadow:0 0 0 1px rgba(0,0,0,0.2),0 1px 4px rgba(0,0,0,0.4);"></div>',
          iconSize: [16, 16],
          iconAnchor: [8, 8]
        })
      }).addTo(window.map);
    };

    // Tapping the map moves the pin there (the pin sits at the map centre).
    window.map.on('click', function (e) {
      window.map.panTo(e.latlng);
    });

    // Tell the app if map tiles can't be fetched, instead of showing a
    // silently blank grey map.
    var tileErrors = 0;
    tiles.on('tileerror', function () {
      tileErrors += 1;
      if (tileErrors === 4) post('tileError');
    });
    tiles.on('tileload', function () { tileErrors = 0; post('tilesOk'); });

    window.map.on('moveend', function () {
      var c = window.map.getCenter();
      post('regionChange', { lat: c.lat, lng: c.lng });
    });

    post('ready');
  </script>
</body>
</html>`;
}

interface LocationPickerModalProps {
  visible: boolean;
  title: string;
  initial?: GeoPoint;
  onCancel: () => void;
  onConfirm: (point: GeoPoint) => void;
}

export default function LocationPickerModal({
  visible,
  title,
  initial,
  onCancel,
  onConfirm,
}: LocationPickerModalProps) {
  const webviewRef = useRef<WebView>(null);
  const [mapHtml] = useState(() => buildMapHtml(toCoordinate(initial), initial ? FOCUSED_ZOOM : DEFAULT_ZOOM));
  const [isMapReady, setIsMapReady] = useState(false);
  const [region, setRegion] = useState<Coordinate>(() => toCoordinate(initial));
  const [address, setAddress] = useState<string | undefined>(initial?.address);
  const [isResolvingAddress, setIsResolvingAddress] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [tilesFailed, setTilesFailed] = useState(false);
  // Ignore address lookups that finish after a newer one was started —
  // otherwise a slow answer for an old pin position overwrites the current one.
  const addressRequestId = useRef(0);
  const addressDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const searchAbortRef = useRef<AbortController | null>(null);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const recenterMap = useCallback((coordinate: Coordinate, zoom = FOCUSED_ZOOM) => {
    webviewRef.current?.injectJavaScript(
      `if (window.map) { window.map.setView([${coordinate.latitude}, ${coordinate.longitude}], ${zoom}); }
       true;`
    );
  }, []);

  const showMyLocation = useCallback((coordinate: Coordinate) => {
    webviewRef.current?.injectJavaScript(
      `if (window.setMe) { window.setMe(${coordinate.latitude}, ${coordinate.longitude}); }
       true;`
    );
  }, []);

  const resolveAddressFor = useCallback((latitude: number, longitude: number) => {
    // Wait for the pin to settle (a drag fires several moves), then look up
    // the address; only the newest lookup is allowed to update the screen.
    if (addressDebounce.current) clearTimeout(addressDebounce.current);
    const requestId = ++addressRequestId.current;
    setIsResolvingAddress(true);
    addressDebounce.current = setTimeout(async () => {
      const resolved = await reverseGeocode({ latitude, longitude });
      if (requestId !== addressRequestId.current) return;
      setAddress(resolved);
      setIsResolvingAddress(false);
    }, 450);
  }, []);

  // This picker is one shared instance reused for both the pickup and
  // drop-off fields (see CreateErrandScreen) — every time it opens, re-sync
  // to whichever GeoPoint it's editing now rather than whatever was left
  // over from the last time it was open for the other field.
  useEffect(() => {
    if (!visible) return;
    const coordinate = toCoordinate(initial);
    setRegion(coordinate);
    setAddress(initial?.address);
    setLocationError(null);
    setSearchQuery("");
    setSuggestions([]);
    if (isMapReady) {
      recenterMap(coordinate, initial ? FOCUSED_ZOOM : DEFAULT_ZOOM);
    }
    // isMapReady/recenterMap intentionally excluded: this effect keys off
    // `visible`/`initial` changing, not the map's readiness — the
    // "auto-locate on first open" effect below handles the ready-yet case.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, initial]);

  async function handleUseCurrentLocation() {
    setIsLocating(true);
    setLocationError(null);
    try {
      const coordinate = await getCurrentCoordinate();
      setRegion(coordinate);
      showMyLocation(coordinate);
      recenterMap(coordinate);
      resolveAddressFor(coordinate.latitude, coordinate.longitude);
    } catch (err) {
      setLocationError(
        err instanceof LocationPermissionDeniedError || err instanceof LocationUnavailableError
          ? err.message
          : "Couldn't get your current location. Drop a pin manually instead."
      );
    } finally {
      setIsLocating(false);
    }
  }

  // Jump to the device's current location the first time the modal opens
  // with no pre-existing pin, so the picker doesn't always start in the
  // same default spot for every requester.
  useEffect(() => {
    if (!visible || initial || !isMapReady) return;
    handleUseCurrentLocation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, isMapReady]);

  // Debounced address-as-you-type search. Nominatim's fair-use policy is
  // ~1 request/second, so we wait for a pause in typing and cancel any
  // still-in-flight request before firing the next one, rather than
  // firing on every keystroke.
  useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchAbortRef.current?.abort();

    const trimmed = searchQuery.trim();
    if (trimmed.length < 3) {
      setSuggestions([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    searchDebounceRef.current = setTimeout(() => {
      const controller = new AbortController();
      searchAbortRef.current = controller;
      searchAddress(trimmed, region, controller.signal)
        .then(setSuggestions)
        .catch((err) => {
          if (err instanceof Error && err.name === "AbortError") return;
          setSuggestions([]);
        })
        .finally(() => setIsSearching(false));
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
    // `region` intentionally excluded — search should bias toward wherever
    // the pin is when the user *starts* typing, not refire as it moves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery]);

  function handleSelectSuggestion(suggestion: PlaceSuggestion) {
    const coordinate = { latitude: suggestion.latitude, longitude: suggestion.longitude };
    setRegion(coordinate);
    setAddress(suggestion.label);
    recenterMap(coordinate);
    setSuggestions([]);
    setSearchQuery("");
    setLocationError(null);
    Keyboard.dismiss();
  }

  const handleMessage = useCallback(
    (event: WebViewMessageEvent) => {
      let data: unknown;
      try {
        data = JSON.parse(event.nativeEvent.data);
      } catch {
        return;
      }
      if (typeof data !== "object" || data === null) return;
      const message = data as { type?: string; lat?: number; lng?: number };

      if (message.type === "ready") {
        setIsMapReady(true);
      } else if (message.type === "tileError") {
        setTilesFailed(true);
      } else if (message.type === "tilesOk") {
        setTilesFailed(false);
      } else if (
        message.type === "regionChange" &&
        typeof message.lat === "number" &&
        typeof message.lng === "number"
      ) {
        setRegion({ latitude: message.lat, longitude: message.lng });
        resolveAddressFor(message.lat, message.lng);
      }
    },
    [resolveAddressFor]
  );

  function handleConfirm() {
    onConfirm({ lat: region.latitude, lng: region.longitude, address });
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen">
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>{title}</Text>
          <Button label="" onPress={onCancel} variant="ghost" style={styles.closeButton} />
          {/* Overlaying the icon on the ghost Button above keeps hit-slop
              consistent with the rest of the app's tappable controls. */}
          <View style={styles.closeIconOverlay} pointerEvents="none">
            <X size={22} color={theme.colors.primaryDark} />
          </View>
        </View>

        <View style={styles.mapContainer}>
          <WebView
            ref={webviewRef}
            style={styles.map}
            originWhitelist={["*"]}
            source={{ html: mapHtml }}
            onMessage={handleMessage}
          />

          <View style={styles.searchWrapper} pointerEvents="box-none">
            <View style={styles.searchBar}>
              <Search size={18} color={theme.colors.textMuted} />
              <TextInput
                style={styles.searchInput}
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="Search for an address"
                placeholderTextColor={theme.colors.textMuted}
                returnKeyType="search"
              />
              {isSearching ? <ActivityIndicator size="small" color={theme.colors.primary} /> : null}
            </View>
            {suggestions.length > 0 ? (
              <FlatList
                style={styles.suggestionsList}
                data={suggestions}
                keyExtractor={(item) => item.id}
                keyboardShouldPersistTaps="handled"
                renderItem={({ item }) => (
                  <Pressable style={styles.suggestionRow} onPress={() => handleSelectSuggestion(item)}>
                    <MapPin size={16} color={theme.colors.primary} />
                    <Text style={styles.suggestionText} numberOfLines={2}>
                      {item.label}
                    </Text>
                  </Pressable>
                )}
              />
            ) : null}
          </View>

          <View style={styles.centerPin} pointerEvents="none">
            <MapPin size={36} color={theme.colors.primary} fill={theme.colors.accent} />
          </View>

          {tilesFailed ? (
            <View style={styles.tileWarning} pointerEvents="none">
              <Text style={styles.tileWarningText}>Map images aren't loading. Check your internet connection.</Text>
            </View>
          ) : null}

          <Pressable
            style={styles.locateButton}
            onPress={handleUseCurrentLocation}
            disabled={isLocating}
            accessibilityRole="button"
            accessibilityLabel="Go to my current location"
          >
            {isLocating ? (
              <ActivityIndicator size="small" color={theme.colors.primary} />
            ) : (
              <LocateFixed size={22} color={theme.colors.primary} />
            )}
          </Pressable>
        </View>

        <View style={styles.bottomSheet}>
          <Text style={styles.addressLabel} numberOfLines={2}>
            {isResolvingAddress
              ? "Finding address…"
              : address ?? `${region.latitude.toFixed(5)}, ${region.longitude.toFixed(5)}`}
          </Text>
          {locationError ? <Text style={styles.errorText}>{locationError}</Text> : null}

          <Button label={`Confirm ${title.toLowerCase()}`} onPress={handleConfirm} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: theme.spacing.md,
    paddingTop: Platform.OS === "ios" ? 56 : theme.spacing.lg,
    paddingBottom: theme.spacing.sm,
    backgroundColor: theme.colors.surface,
  },
  headerTitle: {
    fontFamily: theme.fonts.uiSemibold,
    fontSize: 18,
    color: theme.colors.text,
  },
  closeButton: {
    width: 40,
    height: 40,
    paddingHorizontal: 0,
    paddingVertical: 0,
    borderRadius: theme.radius.md,
  },
  closeIconOverlay: {
    position: "absolute",
    right: theme.spacing.md,
    top: Platform.OS === "ios" ? 56 : theme.spacing.lg,
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  mapContainer: { flex: 1 },
  map: { flex: 1 },
  searchWrapper: {
    position: "absolute",
    top: theme.spacing.md,
    left: theme.spacing.md,
    right: theme.spacing.md,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 10,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  searchInput: {
    flex: 1,
    fontFamily: theme.fonts.uiMedium,
    fontSize: 15,
    color: theme.colors.text,
  },
  suggestionsList: {
    marginTop: 6,
    maxHeight: 220,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  suggestionRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  suggestionText: {
    flex: 1,
    fontFamily: theme.fonts.uiMedium,
    fontSize: 14,
    color: theme.colors.text,
  },
  centerPin: {
    position: "absolute",
    top: "50%",
    left: "50%",
    marginLeft: -18,
    marginTop: -36,
  },
  bottomSheet: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: theme.radius.lg,
    borderTopRightRadius: theme.radius.lg,
    padding: theme.spacing.lg,
    gap: theme.spacing.sm,
  },
  addressLabel: {
    fontFamily: theme.fonts.uiMedium,
    fontSize: 15,
    color: theme.colors.text,
    minHeight: 40,
  },
  errorText: {
    fontFamily: theme.fonts.ui,
    fontSize: 13,
    color: theme.colors.danger,
  },
  locateButton: {
    position: "absolute",
    right: theme.spacing.md,
    bottom: theme.spacing.md,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: theme.colors.surface,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  tileWarning: {
    position: "absolute",
    left: theme.spacing.md,
    right: 80,
    bottom: theme.spacing.md,
    backgroundColor: "rgba(26,16,19,0.85)",
    borderRadius: theme.radius.md,
    padding: theme.spacing.sm,
  },
  tileWarningText: { fontFamily: theme.fonts.ui, fontSize: 12, color: "#fff" },
});
