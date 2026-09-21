import { Pressable, View, Text, StyleSheet } from "react-native";
import { getTheme } from "@gracerandly/theme";
import type { Errand, ErrandStatus } from "@gracerandly/shared-types";

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

function itemsSummary(errand: Errand): string {
  const names = errand.items.map((item) => item.name).join(", ");
  return names.length > 0 ? names : "No items listed";
}

// Short relative-ish timestamp: "Just now" / "12m ago" / "3h ago", falling
// back to a compact date once it's more than a day old.
function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(iso).toLocaleDateString("en-NG", { day: "numeric", month: "short" });
}

interface ErrandCardProps {
  errand: Errand;
  onPress?: () => void;
}

export default function ErrandCard({ errand, onPress }: ErrandCardProps) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
      <View style={styles.header}>
        <View style={[styles.statusPill, { backgroundColor: STATUS_COLORS[errand.status] }]}>
          <Text style={styles.statusText}>{STATUS_LABELS[errand.status]}</Text>
        </View>
        <Text style={styles.cost}>{formatNaira(errand.estimatedCost)}</Text>
      </View>
      <Text style={styles.category}>{CATEGORY_LABELS[errand.category]}</Text>
      <Text style={styles.items} numberOfLines={1}>
        {itemsSummary(errand)}
      </Text>
      <Text style={styles.dropoff} numberOfLines={1}>
        To: {errand.dropoff.address ?? `${errand.dropoff.lat.toFixed(4)}, ${errand.dropoff.lng.toFixed(4)}`}
      </Text>
      <Text style={styles.timestamp}>{formatRelativeTime(errand.createdAt)}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.sm,
  },
  pressed: { opacity: 0.85 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: theme.spacing.sm,
  },
  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: theme.radius.pill,
  },
  statusText: {
    fontFamily: theme.fonts.uiSemibold,
    fontSize: 12,
    color: theme.colors.textOnPrimary,
  },
  cost: {
    fontFamily: theme.fonts.uiSemibold,
    fontSize: 14,
    color: theme.colors.primaryDark,
  },
  category: {
    fontFamily: theme.fonts.uiSemibold,
    fontSize: 15,
    color: theme.colors.text,
    marginBottom: 2,
  },
  items: {
    fontFamily: theme.fonts.ui,
    fontSize: 13,
    color: theme.colors.textMuted,
    marginBottom: 2,
  },
  dropoff: {
    fontFamily: theme.fonts.ui,
    fontSize: 12,
    color: theme.colors.textMuted,
  },
  timestamp: {
    fontFamily: theme.fonts.ui,
    fontSize: 11,
    color: theme.colors.textMuted,
    marginTop: 6,
  },
});
