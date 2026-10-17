import { useCallback, useState } from "react";
import { View, Text, StyleSheet, Share } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Gift } from "lucide-react-native";
import { getTheme } from "@gracerandly/theme";
import type { ReferralSummary } from "@gracerandly/shared-types";
import Button from "./Button";
import { useAuth } from "../context/AuthContext";
import { apiFetch } from "../lib/apiClient";
import { REFERRAL_PATH } from "../lib/supportBase";

const theme = getTheme("light");
const naira = (n: number) => `₦${n.toLocaleString("en-NG")}`;

/** "Invite friends" card: the user's code, a share button and how it's going. */
export default function ReferralCard({ rewardKind }: { rewardKind: "credit" | "bonus" }) {
  const { token } = useAuth();
  const [summary, setSummary] = useState<ReferralSummary | null>(null);

  useFocusEffect(
    useCallback(() => {
      apiFetch<ReferralSummary>(REFERRAL_PATH, { headers: { Authorization: `Bearer ${token}` } })
        .then(setSummary)
        .catch(() => {});
    }, [token])
  );

  if (!summary) return null;

  async function share() {
    if (!summary) return;
    try {
      await Share.share({ message: summary.shareMessage });
    } catch {
      // Closing the share sheet isn't an error.
    }
  }

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Gift size={18} color={theme.colors.primary} />
        <Text style={styles.title}>Invite friends, earn {naira(summary.rewardNaira.referrer)}</Text>
      </View>
      <Text style={styles.body}>
        When a friend signs up with your code and finishes their first errand (worth at least{" "}
        {naira(summary.minErrandNaira)}), you both get {naira(summary.rewardNaira.referrer)}{" "}
        {rewardKind === "credit" ? "off your next errand" : "added to your earnings"}.
      </Text>
      <Text style={styles.code} selectable>
        {summary.code}
      </Text>
      <Text style={styles.stats}>
        {summary.invited} joined · {summary.qualified} completed an errand
        {summary.availableNaira > 0 ? ` · ${naira(summary.availableNaira)} ready to use` : ""}
      </Text>
      <Button label="Share my code" onPress={share} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    alignSelf: "stretch",
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  header: { flexDirection: "row", alignItems: "center", gap: 8 },
  title: { fontFamily: theme.fonts.uiSemibold, fontSize: 15, color: theme.colors.text, flex: 1 },
  body: { fontFamily: theme.fonts.ui, fontSize: 13, color: theme.colors.textMuted },
  code: {
    fontFamily: theme.fonts.display,
    fontSize: 28,
    letterSpacing: 4,
    color: theme.colors.primaryDark,
    textAlign: "center",
  },
  stats: { fontFamily: theme.fonts.ui, fontSize: 12, color: theme.colors.textMuted, textAlign: "center" },
});
