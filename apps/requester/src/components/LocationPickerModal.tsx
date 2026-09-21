import { useCallback, useEffect, useRef, useState } from "react";
import { Modal, View, Text, StyleSheet, Platform } from "react-native";
import MapView, { type Region } from "react-native-maps";
import { MapPin, X } from "lucide-react-native";
import { getTheme } from "@gracerandly/theme";
import type { GeoPoint } from "@gracerandly/shared-types";
import Button from "./Button";
import { getCurrentCoordinate, reverseGeocode, LocationPermissionDeniedError } from "../lib/location";

const theme = getTheme("light");

// Port Harcourt city center — used as a sane default map center when we
// have no better starting point (no `initial` prop and location
// permission hasn't been granted/resolved yet).
const DEFAULT_REGION: Region = {
  latitude: 4.8156,
  longitude: 7.0498,
  latitudeDelta: 0.05,
  longitudeDelta: 0.05,
};

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
  const mapRef = useRef<MapView>(null);
  const [region, setRegion] = useState<Region>(
    initial
      ? { ...DEFAULT_REGION, latitude: initial.lat, longitude: initial.lng }
      : DEFAULT_REGION
  );
  const [address, setAddress] = useState<string | undefined>(initial?.address);
  const [isResolvingAddress, setIsResolvingAddress] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);

  const resolveAddressFor = useCallback(async (latitude: number, longitude: number) => {
    setIsResolvingAddress(true);
    const resolved = await reverseGeocode({ latitude, longitude });
    setAddress(resolved);
    setIsResolvingAddress(false);
  }, []);

  async function handleUseCurrentLocation() {
    setIsLocating(true);
    setLocationError(null);
    try {
      const coordinate = await getCurrentCoordinate();
      const nextRegion: Region = {
        latitude: coordinate.latitude,
        longitude: coordinate.longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      };
      mapRef.current?.animateToRegion(nextRegion, 400);
      setRegion(nextRegion);
      resolveAddressFor(coordinate.latitude, coordinate.longitude);
    } catch (err) {
      setLocationError(
        err instanceof LocationPermissionDeniedError
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
    if (!visible || initial) return;
    handleUseCurrentLocation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const handleRegionChangeComplete = useCallback(
    (nextRegion: Region) => {
      setRegion(nextRegion);
      resolveAddressFor(nextRegion.latitude, nextRegion.longitude);
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

        <MapView
          ref={mapRef}
          style={styles.map}
          initialRegion={region}
          onRegionChangeComplete={handleRegionChangeComplete}
          showsUserLocation
          showsMyLocationButton={false}
        />

        <View style={styles.centerPin} pointerEvents="none">
          <MapPin size={36} color={theme.colors.primary} fill={theme.colors.accent} />
        </View>

        <View style={styles.bottomSheet}>
          <Text style={styles.addressLabel} numberOfLines={2}>
            {isResolvingAddress
              ? "Finding address…"
              : address ?? `${region.latitude.toFixed(5)}, ${region.longitude.toFixed(5)}`}
          </Text>
          {locationError ? <Text style={styles.errorText}>{locationError}</Text> : null}

          <Button
            label="Use current location"
            variant="ghost"
            onPress={handleUseCurrentLocation}
            loading={isLocating}
            style={styles.currentLocationButton}
          />

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
  map: { flex: 1 },
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
  currentLocationButton: {
    alignSelf: "flex-start",
    paddingHorizontal: 0,
  },
});
