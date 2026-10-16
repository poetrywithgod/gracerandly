import { useCallback, useState } from "react";
import { View, Text, ScrollView, StyleSheet, RefreshControl } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { getTheme } from "@gracerandly/theme";
import type { RecurrenceFrequency, RecurringErrand } from "@gracerandly/shared-types";
import Button from "../components/Button";
import ConfirmModal from "../components/ConfirmModal";
import LoadingScreen from "../components/LoadingScreen";
import { useAuth } from "../context/AuthContext";
import { apiFetch, ApiError } from "../lib/apiClient";

const theme = getTheme("light");

const FREQUENCY_LABELS: Record<RecurrenceFrequency, string> = {
  daily: "Every day",
  weekly: "Every week",
  biweekly: "Every 2 weeks",
  monthly: "Every month",
};

const CATEGORY_LABELS: Record<RecurringErrand["category"], string> = {
  grocery: "Grocery",
  pharmacy: "Pharmacy",
  food: "Food",
  parcel: "Parcel",
  miscellaneous: "Other",
};

function formatNaira(amount: number): string {
  return `₦${amount.toLocaleString("en-NG")}`;
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

export default function RecurringErrandsScreen() {
  const { token } = useAuth();
  const [items, setItems] = useState<RecurringErrand[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stopping, setStopping] = useState<RecurringErrand | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await apiFetch<{ recurring: RecurringErrand[] }>("/recurring", {
        headers: { Authorization: `Bearer ${token}` },
      });
      setItems(response.recurring);
      setLoadFailed(false);
    } catch {
      setLoadFailed(true);
    }
  }, [token]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  async function setActive(item: RecurringErrand, active: boolean) {
    setBusyId(item.id);
    setError(null);
    try {
      const response = await apiFetch<{ recurring: RecurringErrand }>(`/recurring/${item.id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({ active }),
      });
      setItems((prev) => prev?.map((r) => (r.id === item.id ? response.recurring : r)) ?? prev);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setBusyId(null);
    }
  }

  async function confirmStop() {
    if (!stopping) return;
    setBusyId(stopping.id);
    setError(null);
    try {
      await apiFetch(`/recurring/${stopping.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      setItems((prev) => prev?.filter((r) => r.id !== stopping.id) ?? prev);
      setStopping(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
      setStopping(null);
    } finally {
      setBusyId(null);
    }
  }

  if (items === null && !loadFailed) return <LoadingScreen message="Loading…" />;

  return (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {loadFailed && items === null ? (
        <View style={styles.empty}>
          <Text style={styles.errorText}>Couldn't load your repeating errands.</Text>
          <Button label="Try again" variant="ghost" onPress={load} />
        </View>
      ) : null}

      {items && items.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>Nothing repeating yet</Text>
          <Text style={styles.emptyText}>
            When you post an errand, choose “Repeats” to have it posted for you on a schedule —
            weekly groceries, a daily lunch run, and so on.
          </Text>
        </View>
      ) : null}

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      {items?.map((item) => (
        <View key={item.id} style={styles.card}>
          <View style={styles.cardTop}>
            <Text style={styles.category}>{CATEGORY_LABELS[item.category]}</Text>
            <View style={[styles.pill, { backgroundColor: item.active ? theme.colors.success : theme.colors.textMuted }]}>
              <Text style={styles.pillText}>{item.active ? "Active" : "Paused"}</Text>
            </View>
          </View>
          <Text style={styles.frequency}>
            {FREQUENCY_LABELS[item.frequency]} · {formatNaira(item.estimatedCost)}
          </Text>
          <Text style={styles.address} numberOfLines={1}>
            {item.pickup.address ?? "Pickup"} → {item.dropoff.address ?? "Drop-off"}
          </Text>
          <Text style={styles.meta}>
            {item.items.map((i) => `${i.quantity}× ${i.name}`).join(", ")}
            {item.stops.length > 0 ? ` · ${item.stops.length} extra stop${item.stops.length > 1 ? "s" : ""}` : ""}
          </Text>
          {item.active && item.nextRunAt ? (
            <Text style={styles.next}>Next: {formatDateTime(item.nextRunAt)}</Text>
          ) : null}
          <View style={styles.actions}>
            <Button
              label={item.active ? "Pause" : "Resume"}
              variant="ghost"
              loading={busyId === item.id}
              onPress={() => setActive(item, !item.active)}
              style={styles.actionButton}
            />
            <Button
              label="Stop"
              variant="ghost"
              disabled={busyId === item.id}
              onPress={() => setStopping(item)}
              style={styles.actionButton}
            />
          </View>
        </View>
      ))}

      <ConfirmModal
        visible={stopping !== null}
        title="Stop this repeating errand?"
        body="No more errands will be posted from it. Errands already posted aren't affected."
        confirmLabel="Stop repeating"
        cancelLabel="Keep it"
        destructive
        isConfirming={busyId !== null && busyId === stopping?.id}
        onConfirm={confirmStop}
        onCancel={() => setStopping(null)}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: theme.colors.background },
  content: { padding: theme.spacing.lg, paddingBottom: theme.spacing.xxl, gap: theme.spacing.md },
  empty: { alignItems: "center", paddingVertical: theme.spacing.xxl, gap: theme.spacing.sm },
  emptyTitle: { fontFamily: theme.fonts.uiSemibold, fontSize: 17, color: theme.colors.text },
  emptyText: {
    fontFamily: theme.fonts.ui,
    fontSize: 14,
    color: theme.colors.textMuted,
    textAlign: "center",
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    gap: 4,
  },
  cardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  category: { fontFamily: theme.fonts.display, fontSize: 20, color: theme.colors.text },
  pill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: theme.radius.pill },
  pillText: { fontFamily: theme.fonts.uiSemibold, fontSize: 12, color: theme.colors.textOnPrimary },
  frequency: { fontFamily: theme.fonts.uiMedium, fontSize: 14, color: theme.colors.primaryDark },
  address: { fontFamily: theme.fonts.ui, fontSize: 13, color: theme.colors.text },
  meta: { fontFamily: theme.fonts.ui, fontSize: 13, color: theme.colors.textMuted },
  next: { fontFamily: theme.fonts.uiMedium, fontSize: 13, color: theme.colors.text, marginTop: 2 },
  actions: { flexDirection: "row", gap: theme.spacing.sm, marginTop: theme.spacing.sm },
  actionButton: { flex: 1 },
  errorText: { fontFamily: theme.fonts.ui, fontSize: 13, color: theme.colors.danger, textAlign: "center" },
});
