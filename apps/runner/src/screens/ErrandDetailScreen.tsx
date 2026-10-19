import { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { getTheme } from "@gracerandly/theme";
import type { Errand, ErrandStatus, VendorDisbursement } from "@gracerandly/shared-types";
import { useAuth } from "../context/AuthContext";
import { apiFetch, ApiError } from "../lib/apiClient";
import { getCurrentCoordinate } from "../lib/location";
import { requestLiveLocationRefresh } from "../lib/liveLocation";
import LiveTrackingMap from "../components/LiveTrackingMap";
import ReviewCard from "../components/ReviewCard";
import { MessageCircle } from "lucide-react-native";
import Button from "../components/Button";
import ConfirmModal from "../components/ConfirmModal";
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
  const [pinError, setPinError] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [showDropConfirm, setShowDropConfirm] = useState(false);
  const [isDropping, setIsDropping] = useState(false);
  const [confirmingStopId, setConfirmingStopId] = useState<string | null>(null);
  // Cash float: purchases the runner paid for from their own pocket on this errand.
  const [floatPayments, setFloatPayments] = useState<VendorDisbursement[]>([]);
  const [vendorName, setVendorName] = useState("");
  const [vendorAmount, setVendorAmount] = useState("");
  const [vendorErrors, setVendorErrors] = useState<{ vendorName?: string; amount?: string }>({});
  const [vendorError, setVendorError] = useState<string | null>(null);
  const [isLoggingPayment, setIsLoggingPayment] = useState(false);

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

  const loadFloatPayments = useCallback(async () => {
    if (!token) return;
    try {
      const response = await apiFetch<{ disbursements: VendorDisbursement[] }>(
        `/runners/errands/${errandId}/vendor-disbursements`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setFloatPayments(response.disbursements.filter((d) => d.method === "cash_float"));
    } catch {
      // Nice-to-have list — the rest of the screen still works without it.
    }
  }, [token, errandId]);

  useEffect(() => {
    loadFloatPayments();
  }, [loadFloatPayments]);

  const handleLogCashPayment = useCallback(async () => {
    if (!token) return;
    setVendorError(null);
    const amount = Math.round(Number(vendorAmount));
    const nextErrors: { vendorName?: string; amount?: string } = {};
    if (!vendorName.trim()) nextErrors.vendorName = "Enter the shop or vendor's name";
    if (!Number.isFinite(amount) || amount <= 0) nextErrors.amount = "Enter how much you paid, in Naira";
    setVendorErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setIsLoggingPayment(true);
    try {
      // Where you are is only used as a trust signal (were you at the shop?) — never blocks the payment.
      const location = await getCurrentCoordinate()
        .then((c) => ({ lat: c.latitude, lng: c.longitude }))
        .catch(() => undefined);
      await apiFetch(`/runners/errands/${errandId}/vendor-disbursements`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({ vendorName: vendorName.trim(), method: "cash_float", amount, location }),
      });
      setVendorName("");
      setVendorAmount("");
      setVendorErrors({});
      await loadFloatPayments();
    } catch (err) {
      if (err instanceof ApiError && err.fields?.amount) {
        setVendorErrors({ amount: err.fields.amount });
      } else {
        setVendorError(err instanceof ApiError ? err.message : "Couldn't log this payment");
      }
    } finally {
      setIsLoggingPayment(false);
    }
  }, [token, errandId, vendorName, vendorAmount, loadFloatPayments]);

  const handleAdvance = useCallback(async () => {
    if (!errand || !token) return;
    const step = NEXT_STEP[errand.status];
    if (!step) return;

    setError(null);
    setPinError(undefined);
    if (step.needsPin && !/^\d{4}$/.test(pin)) {
      setPinError("Enter the 4-digit delivery PIN the requester gives you");
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
      // A wrong PIN is about the PIN box, so say it there; everything else
      // (wrong place, no signal, ...) is about the errand as a whole.
      if (err instanceof ApiError && err.fields?.pin) {
        setPinError(err.fields.pin);
      } else {
        setError(err instanceof ApiError ? err.message : "Couldn't update this errand");
      }
    } finally {
      setIsSubmitting(false);
    }
  }, [errand, token, errandId, pin]);

  const handleDrop = useCallback(async () => {
    if (!token) return;
    setIsDropping(true);
    try {
      await apiFetch(`/runners/errands/${errandId}/drop`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      setShowDropConfirm(false);
      requestLiveLocationRefresh();
      navigation.goBack();
    } catch (err) {
      setShowDropConfirm(false);
      setError(err instanceof ApiError ? err.message : "Couldn't drop this errand");
    } finally {
      setIsDropping(false);
    }
  }, [token, errandId, navigation]);

  // Extra stops are visited in order while the errand is in progress; each is
  // confirmed on arrival (the API checks the runner is actually there).
  const handleConfirmStop = useCallback(
    async (stopId: string) => {
      if (!token) return;
      setError(null);
      setConfirmingStopId(stopId);
      try {
        const coordinate = await getCurrentCoordinate();
        const response = await apiFetch<{ errand: Errand }>(`/runners/errands/${errandId}/stops/${stopId}/complete`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: JSON.stringify({ location: { lat: coordinate.latitude, lng: coordinate.longitude } }),
        });
        setErrand(response.errand);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Couldn't confirm this stop");
      } finally {
        setConfirmingStopId(null);
      }
    },
    [token, errandId]
  );

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
  const pendingStops = errand.stops.filter((stop) => !stop.completedAt);
  const nextStopId = pendingStops[0]?.id;
  // The drop-off leg can't start until every extra stop is done.
  const blockedByStops = errand.status === "in_progress" && pendingStops.length > 0;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.card}>
        <Text style={styles.status}>{errand.status.replace(/_/g, " ")}</Text>
        <Text style={styles.cost}>₦{errand.estimatedCost.toLocaleString()}</Text>
      </View>

      {CHAT_ALLOWED_STATUSES.includes(errand.status) ? (
        <Button
          label="Message requester"
          icon={MessageCircle}
          size="large"
          onPress={() => navigation.navigate("Chat", { errandId: errand.id })}
        />
      ) : null}

      {LIVE_MAP_STATUSES.includes(errand.status) ? (
        <LiveTrackingMap errandId={errand.id} pickup={errand.pickup} dropoff={errand.dropoff} status={errand.status} />
      ) : null}

      {errand.status === "delivered" ? <ReviewCard errandId={errand.id} /> : null}

      <View style={styles.card}>
        <Text style={styles.sectionLabel}>Pickup</Text>
        <Text style={styles.address}>{errand.pickup.address ?? `${errand.pickup.lat}, ${errand.pickup.lng}`}</Text>
        <Text style={styles.sectionLabel}>Drop-off</Text>
        <Text style={styles.address}>{errand.dropoff.address ?? `${errand.dropoff.lat}, ${errand.dropoff.lng}`}</Text>
      </View>

      {errand.stops.length > 0 ? (
        <View style={styles.card}>
          <Text style={styles.sectionLabel}>
            Extra stops ({errand.stops.length - pendingStops.length}/{errand.stops.length} done)
          </Text>
          {errand.stops.map((stop, index) => (
            <View key={stop.id} style={styles.stopRow}>
              <Text style={styles.address}>
                {stop.completedAt ? "\u2713 " : `${index + 1}. `}
                {stop.address ?? `${stop.lat}, ${stop.lng}`}
              </Text>
              {stop.note ? <Text style={styles.stopNote}>{stop.note}</Text> : null}
              {errand.status === "in_progress" && stop.id === nextStopId ? (
                <Button
                  label="I'm here \u2014 confirm stop"
                  variant="secondary"
                  loading={confirmingStopId === stop.id}
                  onPress={() => handleConfirmStop(stop.id)}
                />
              ) : null}
            </View>
          ))}
          {errand.status === "in_progress" && pendingStops.length > 0 ? (
            <Text style={styles.stopNote}>Visit the stops in order, then head to the drop-off.</Text>
          ) : null}
        </View>
      ) : null}

      {(errand.status === "in_progress" && errand.itemsBudget > 0) || floatPayments.length > 0 ? (
        <View style={styles.card}>
          <Text style={styles.sectionLabel}>Paid from your own cash</Text>
          {errand.status === "in_progress" && errand.itemsBudget > 0 ? (
            <>
              <Text style={styles.stopNote}>
                Paying a shop with your own cash? Log it here — you'll be paid back with your errand payout once it's
                delivered, up to the ₦{errand.itemsBudget.toLocaleString()} items budget. How much you can have out at once
                depends on your trust tier.
              </Text>
              <TextField
                label="Shop / vendor"
                value={vendorName}
                onChangeText={(next) => {
                  setVendorName(next);
                  setVendorErrors((prev) => ({ ...prev, vendorName: undefined }));
                }}
                placeholder="e.g. Mama Put, Shoprite"
                error={vendorErrors.vendorName}
              />
              <TextField
                label="Amount you paid (₦)"
                value={vendorAmount}
                onChangeText={(next) => {
                  setVendorAmount(next);
                  setVendorErrors((prev) => ({ ...prev, amount: undefined }));
                }}
                keyboardType="number-pad"
                placeholder="e.g. 3000"
                error={vendorErrors.amount}
              />
              {vendorError ? <Text style={styles.errorText}>{vendorError}</Text> : null}
              <Button label="Log cash payment" variant="secondary" loading={isLoggingPayment} onPress={handleLogCashPayment} />
            </>
          ) : null}
          {floatPayments.map((payment) => (
            <Text key={payment.id} style={styles.itemLine}>
              • {payment.vendorName} — ₦{payment.amount.toLocaleString()}
              {payment.status === "success" ? " (paid back)" : " (paid back on delivery)"}
            </Text>
          ))}
        </View>
      ) : null}

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
          onChangeText={(next) => {
            setPin(next);
            setPinError(undefined);
          }}
          placeholder="4-digit code from the requester"
          keyboardType="number-pad"
          maxLength={4}
          error={pinError}
        />
      ) : null}

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      {step ? (
        <Button label={step.label} onPress={handleAdvance} loading={isSubmitting} disabled={blockedByStops} />
      ) : (
        <Text style={styles.emptyText}>This errand is complete.</Text>
      )}

      {errand.status === "accepted" || errand.status === "en_route_to_pickup" ? (
        <Button label="Can't do this errand" variant="secondary" onPress={() => setShowDropConfirm(true)} />
      ) : null}

      <ConfirmModal
        visible={showDropConfirm}
        title="Drop this errand?"
        body="It goes back to the feed for other runners and the requester is told. Please only do this if you really can't make it."
        confirmLabel="Drop errand"
        cancelLabel="Keep it"
        destructive
        isConfirming={isDropping}
        onConfirm={handleDrop}
        onCancel={() => setShowDropConfirm(false)}
      />
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
  sectionLabel: { fontFamily: theme.fonts.uiMedium, fontSize: 12, color: theme.colors.textMuted, textTransform: "uppercase", marginTop: 6 },
  address: { fontFamily: theme.fonts.ui, fontSize: 14, color: theme.colors.text },
  stopRow: { gap: 6, marginTop: 4 },
  stopNote: { fontFamily: theme.fonts.ui, fontSize: 12, color: theme.colors.textMuted },
  itemLine: { fontFamily: theme.fonts.ui, fontSize: 14, color: theme.colors.text },
  errorText: { fontFamily: theme.fonts.uiMedium, fontSize: 13, color: theme.colors.danger },
  emptyText: { fontFamily: theme.fonts.ui, fontSize: 14, color: theme.colors.textMuted, textAlign: "center" },
});
