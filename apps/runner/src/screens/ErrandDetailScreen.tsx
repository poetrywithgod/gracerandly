import { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { getTheme } from "@gracerandly/theme";
import type { Errand, ErrandStatus } from "@gracerandly/shared-types";
import { useAuth } from "../context/AuthContext";
import { apiFetch, ApiError } from "../lib/apiClient";
import { getCurrentCoordinate } from "../lib/location";
import { requestLiveLocationRefresh } from "../lib/liveLocation";
import LiveTrackingMap from "../components/LiveTrackingMap";
import Button from "../components/Button";
import SosButton from "../components/SosButton";
import TextField from "../components/TextField";
import type { MainStackParamList } from "../navigation/types";

const theme = getTheme("light");

type Props = NativeStackScreenProps<MainStackParamList, "ErrandDetail">;

// Mirrors apps/api's lib/chat-server.ts CHAT_ALLOWED_STATUSES — chat only
// makes sense once a runner's actually attached to the errand, through
// delivery.
const CHAT_ALLOWED_STATUSES: ErrandStatus[] = [
  "accepted",
  "en_route_to_pickup",
  "in_progress",
  "en_route_to_delivery",
  "delivered",
];

// Mirrors apps/api's lib/sos.ts SOS_ALLOWED_STATUSES — same window as chat.
const SOS_ALLOWED_STATUSES: ErrandStatus[] = CHAT_ALLOWED_STATUSES;

// Statuses in which the live map is shown. Position sharing itself is
// handled app-wide by components/LiveLocationHost.tsx, not by this screen.
const LIVE_MAP_STATUSES: ErrandStatus[] = ["accepted", "en_route_to_pickup", "in_progress", "en_route_to_delivery"];

// (currentStatus -> what accepting the next step is called, and which
// status it moves to). Kept as an explicit map rather than deriving from
// STATUS_SEQUENCE so the copy can be specific to what the runner is about
// to do, not just "advance to X".
const NEXT_STEP: Partial<Record<ErrandStatus, { label: string; next: ErrandStatus; needsGeofence?: "pickup" | "dropoff"; needsPin?: boolean }>> = {
  accepted: { label: "Start heading to pickup", next: "en_route_to_pickup" },
  en_route_to_pickup: { label: "Confirm arrival at pickup", next: "in_progress", needsGeofence: "pickup" },
  in_progress: { label: "Start heading to drop-off", next: "en_route_to_delivery" },
  en_route_to_delivery: { label: "Confirm delivery", next: "delivered", needsGeofence: "dropoff", needsPin: true },
};

export default function ErrandDetailScreen({ route, navigation }: Props) {
  const { errandId } = route.params;
  const { token } = useAuth();

  const [errand, setErrand] = useState<Errand | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      // There's no GET /runners/errands/:id yet — /errands/mine is cheap
      // enough at MVP scale, so this just re-filters that list rather than
      // adding a single-errand endpoint solely for this screen.
      const response = await apiFetch<{ errands: Errand[] }>("/runners/errands/mine", {
        headers: { Authorization: `Bearer ${token}` },
      });
      setErrand(response.errands.find((e) => e.id === errandId) ?? null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't load this errand");
    } finally {
      setIsLoading(false);
    }
  }, [token, errandId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleAdvance = useCallback(async () => {
    if (!errand || !token) return;
    const step = NEXT_STEP[errand.status];
    if (!step) return;

    setError(null);
    if (step.needsPin && !/^\d{4}$/.test(pin)) {
      setError("Enter the 4-digit delivery PIN the requester gives you");
      return;
    }

    setIsSubmitting(true);
    try {
      const body: { status: ErrandStatus; location?: { lat: number; lng: number }; pin?: string } = { status: step.next };
      if (step.needsGeofence) {
        const coordinate = await getCurrentCoordinate();
        body.location = { lat: coordinate.latitude, lng: coordinate.longitude };
      }
      if (step.needsPin) {
        body.pin = pin;
      }

      const response = await apiFetch<{ errand: Errand }>(`/runners/errands/${errandId}/status`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      setErrand(response.errand);
      setPin("");
      // The status changed — let the live-location host re-check which
      // errands are active instead of waiting for its next poll.
      requestLiveLocationRefresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't update this errand");
    } finally {
      setIsSubmitting(false);
    }
  }, [errand, token, errandId, pin]);

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={theme.colors.primary} />
      </View>
    );
  }

  if (!errand) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyText}>{error ?? "Errand not found"}</Text>
      </View>
    );
  }

  const step = NEXT_STEP[errand.status];

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.card}>
        <Text style={styles.status}>{errand.status.replace(/_/g, " ")}</Text>
        <Text style={styles.cost}>₦{errand.estimatedCost.toLocaleString()}</Text>
        {CHAT_ALLOWED_STATUSES.includes(errand.status) ? (
          <Text style={styles.chatLink} onPress={() => navigation.navigate("Chat", { errandId: errand.id })}>
            Message requester
          </Text>
        ) : null}
      </View>

      {LIVE_MAP_STATUSES.includes(errand.status) ? (
        <LiveTrackingMap errandId={errand.id} pickup={errand.pickup} dropoff={errand.dropoff} status={errand.status} />
      ) : null}

      <View style={styles.card}>
        <Text style={styles.sectionLabel}>Pickup</Text>
        <Text style={styles.address}>{errand.pickup.address ?? `${errand.pickup.lat}, ${errand.pickup.lng}`}</Text>
        <Text style={styles.sectionLabel}>Drop-off</Text>
        <Text style={styles.address}>{errand.dropoff.address ?? `${errand.dropoff.lat}, ${errand.dropoff.lng}`}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionLabel}>Items</Text>
        {errand.items.map((item) => (
          <Text key={item.id} style={styles.itemLine}>
            • {item.quantity}× {item.name}
            {item.notes ? ` (${item.notes})` : ""}
          </Text>
        ))}
        {errand.instructions ? (
          <>
            <Text style={styles.sectionLabel}>Instructions</Text>
            <Text style={styles.address}>{errand.instructions}</Text>
          </>
        ) : null}
      </View>

      {SOS_ALLOWED_STATUSES.includes(errand.status) && token ? (
        <SosButton errandId={errand.id} token={token} apiBasePath="/runners/errands" otherPartyLabel="requester" />
      ) : null}

      {step?.needsPin ? (
        <TextField
          label="Delivery PIN"
          value={pin}
          onChangeText={setPin}
          placeholder="4-digit code from the requester"
          keyboardType="number-pad"
          maxLength={4}
        />
      ) : null}

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      {step ? (
        <Button label={step.label} onPress={handleAdvance} loading={isSubmitting} />
      ) : (
        <Text style={styles.emptyText}>This errand is complete.</Text>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: theme.spacing.lg, gap: theme.spacing.md, backgroundColor: theme.colors.background, flexGrow: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: theme.colors.background },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    gap: 6,
  },
  status: { fontFamily: theme.fonts.uiSemibold, fontSize: 16, color: theme.colors.primaryDark, textTransform: "capitalize" },
  cost: { fontFamily: theme.fonts.uiSemibold, fontSize: 20, color: theme.colors.text },
  chatLink: { fontFamily: theme.fonts.uiMedium, fontSize: 14, color: theme.colors.primary, marginTop: 4 },
  sectionLabel: { fontFamily: theme.fonts.uiMedium, fontSize: 12, color: theme.colors.textMuted, textTransform: "uppercase", marginTop: 6 },
  address: { fontFamily: theme.fonts.ui, fontSize: 14, color: theme.colors.text },
  itemLine: { fontFamily: theme.fonts.ui, fontSize: 14, color: theme.colors.text },
  errorText: { fontFamily: theme.fonts.uiMedium, fontSize: 13, color: theme.colors.danger },
  emptyText: { fontFamily: theme.fonts.ui, fontSize: 14, color: theme.colors.textMuted, textAlign: "center" },
});
