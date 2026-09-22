import { useCallback, useEffect, useState } from "react";
import { View, Text, ScrollView, StyleSheet } from "react-native";
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { getTheme } from "@gracerandly/theme";
import type { Errand, ErrandStatus } from "@gracerandly/shared-types";
import Button from "../components/Button";
import LoadingScreen from "../components/LoadingScreen";
import ErrandPostedModal from "../components/ErrandPostedModal";
import LiveTrackingMap from "../components/LiveTrackingMap";
import ConfirmModal from "../components/ConfirmModal";
import { useAuth } from "../context/AuthContext";
import { apiFetch, ApiError } from "../lib/apiClient";
import type { MainStackParamList } from "../navigation/types";

const theme = getTheme("light");

const CATEGORY_LABELS: Record<Errand["category"], string> = {
  grocery: "Grocery",
  pharmacy: "Pharmacy",
  food: "Food",
  parcel: "Parcel",
  miscellaneous: "Other",
};

const STATUS_LABELS: Record<ErrandStatus, string> = {
  pending_match: "Finding a runner",
  accepted: "Accepted",
  en_route_to_pickup: "Heading to pickup",
  in_progress: "In progress",
  en_route_to_delivery: "On the way",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

const STATUS_COLORS: Record<ErrandStatus, string> = {
  pending_match: theme.colors.warning,
  accepted: theme.colors.info,
  en_route_to_pickup: theme.colors.info,
  in_progress: theme.colors.info,
  en_route_to_delivery: theme.colors.info,
  delivered: theme.colors.success,
  cancelled: theme.colors.danger,
};

function formatNaira(amount: number): string {
  return `\u20a6${amount.toLocaleString("en-NG")}`;
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-NG", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

// Statuses where a runner is actively out on the errand and live tracking
// is meaningful to show. pending_match (no runner yet), delivered and
// cancelled are all "nothing to track" states.
const TRACKED_STATUSES: ReadonlySet<ErrandStatus> = new Set([
  "accepted",
  "en_route_to_pickup",
  "in_progress",
  "en_route_to_delivery",
]);

// How often to re-fetch the errand while it's in an actively-tracked
// status, so the status pill (and the leg LiveTrackingMap is tracking)
// updates without the requester needing to leave and return to this
// screen. Status transitions themselves come from polling, not realtime —
// only the runner's position is pushed live; that's a reasonable split for
// now since transitions are infrequent compared to position updates.
const STATUS_POLL_INTERVAL_MS = 5000;

type DetailRouteProp = RouteProp<MainStackParamList, "ErrandDetail">;

export default function ErrandDetailScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const route = useRoute<DetailRouteProp>();
  const { token } = useAuth();
  const { errandId } = route.params;

  const [errand, setErrand] = useState<Errand | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [showCancelledModal, setShowCancelledModal] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await apiFetch<{ errand: Errand }>(`/errands/${errandId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setErrand(response.errand);
      setLoadFailed(false);
    } catch {
      setLoadFailed(true);
    }
  }, [errandId, token]);

  // Refetch on focus too, so returning here after an edit (or once a
  // runner accepts, later) shows the current state rather than a stale one.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  // Light polling while a runner is actively out on the errand, so the
  // status pill (and which leg the live map tracks) updates on its own.
  useEffect(() => {
    if (!errand || !TRACKED_STATUSES.has(errand.status)) return;
    const interval = setInterval(load, STATUS_POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [errand?.status, load]);

  function confirmCancel() {
    setCancelError(null);
    setShowCancelConfirm(true);
  }

  async function handleCancel() {
    setIsCancelling(true);
    setCancelError(null);
    try {
      const response = await apiFetch<{ errand: Errand }>(`/errands/${errandId}/cancel`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
      });
      setErrand(response.errand);
      setShowCancelConfirm(false);
      setShowCancelledModal(true);
    } catch (err) {
      setCancelError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setIsCancelling(false);
    }
  }

  if (loadFailed) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>Couldn't load this errand.</Text>
        <Button label="Go back" variant="ghost" onPress={() => navigation.goBack()} />
      </View>
    );
  }

  if (!errand) {
    return <LoadingScreen message="Loading errand…" />;
  }

  const canModify = errand.status === "pending_match";

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <View style={[styles.statusPill, { backgroundColor: STATUS_COLORS[errand.status] }]}>
          <Text style={styles.statusText}>{STATUS_LABELS[errand.status]}</Text>
        </View>
        <Text style={styles.cost}>{formatNaira(errand.estimatedCost)}</Text>
      </View>

      {TRACKED_STATUSES.has(errand.status) ? (
        <LiveTrackingMap
          errandId={errand.id}
          pickup={errand.pickup}
          dropoff={errand.dropoff}
          status={errand.status}
        />
      ) : null}

      <Text style={styles.category}>{CATEGORY_LABELS[errand.category]}</Text>
      <Text style={styles.meta}>Posted {formatDateTime(errand.createdAt)}</Text>
      {errand.urgency === "scheduled" && errand.scheduledFor ? (
        <Text style={styles.meta}>Scheduled for {formatDateTime(errand.scheduledFor)}</Text>
      ) : null}

      <Section title="Pickup">
        <Text style={styles.sectionValue}>
          {errand.pickup.address ?? `${errand.pickup.lat.toFixed(5)}, ${errand.pickup.lng.toFixed(5)}`}
        </Text>
      </Section>

      <Section title="Drop-off">
        <Text style={styles.sectionValue}>
          {errand.dropoff.address ?? `${errand.dropoff.lat.toFixed(5)}, ${errand.dropoff.lng.toFixed(5)}`}
        </Text>
      </Section>

      <Section title="Items">
        {errand.items.map((item) => (
          <Text key={item.id} style={styles.sectionValue}>
            {item.quantity}× {item.name}
            {item.notes ? ` — ${item.notes}` : ""}
          </Text>
        ))}
      </Section>

      {errand.instructions ? (
        <Section title="Instructions">
          <Text style={styles.sectionValue}>{errand.instructions}</Text>
        </Section>
      ) : null}

      {canModify ? (
        <View style={styles.actions}>
          <Button
            label="Edit errand"
            variant="ghost"
            onPress={() => navigation.navigate("CreateErrand", { errandId: errand.id })}
            style={styles.actionButton}
          />
          <Button
            label="Cancel errand"
            variant="ghost"
            onPress={confirmCancel}
            loading={isCancelling}
            style={styles.actionButton}
          />
        </View>
      ) : null}

      <ErrandPostedModal
        visible={showCancelledModal}
        title="Errand cancelled"
        body="This errand has been cancelled."
        onDone={() => {
          setShowCancelledModal(false);
          navigation.goBack();
        }}
      />

      <ConfirmModal
        visible={showCancelConfirm}
        title="Cancel this errand?"
        body={cancelError ?? "This can't be undone."}
        confirmLabel="Cancel errand"
        cancelLabel="Keep errand"
        destructive
        isConfirming={isCancelling}
        onConfirm={handleCancel}
        onCancel={() => setShowCancelConfirm(false)}
      />
    </ScrollView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: theme.colors.background },
  content: { padding: theme.spacing.lg, paddingBottom: theme.spacing.xxl },
  centered: {
    flex: 1,
    backgroundColor: theme.colors.background,
    alignItems: "center",
    justifyContent: "center",
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: theme.spacing.sm,
  },
  statusPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: theme.radius.pill,
  },
  statusText: {
    fontFamily: theme.fonts.uiSemibold,
    fontSize: 13,
    color: theme.colors.textOnPrimary,
  },
  cost: {
    fontFamily: theme.fonts.uiSemibold,
    fontSize: 18,
    color: theme.colors.primaryDark,
  },
  category: {
    fontFamily: theme.fonts.display,
    fontSize: 24,
    color: theme.colors.text,
  },
  meta: {
    fontFamily: theme.fonts.ui,
    fontSize: 13,
    color: theme.colors.textMuted,
    marginTop: 2,
  },
  section: {
    marginTop: theme.spacing.lg,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
  },
  sectionTitle: {
    fontFamily: theme.fonts.uiSemibold,
    fontSize: 13,
    color: theme.colors.textMuted,
    marginBottom: 6,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  sectionValue: {
    fontFamily: theme.fonts.uiMedium,
    fontSize: 15,
    color: theme.colors.text,
    marginBottom: 2,
  },
  actions: {
    marginTop: theme.spacing.xl,
    gap: theme.spacing.sm,
  },
  actionButton: { alignSelf: "stretch" },
  errorText: {
    fontFamily: theme.fonts.ui,
    fontSize: 14,
    color: theme.colors.danger,
  },
});
