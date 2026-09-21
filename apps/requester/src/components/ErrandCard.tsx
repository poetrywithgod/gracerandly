import { View, Text, StyleSheet } from "react-native";
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

export default function ErrandCard({ errand }: { errand: Errand }) {
  return (
    <View style={styles.card}>
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
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.sm,
  },
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
});
