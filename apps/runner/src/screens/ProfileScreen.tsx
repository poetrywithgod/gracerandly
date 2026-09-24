import { View, Text, StyleSheet, ScrollView } from "react-native";
import { ShieldCheck, ShieldAlert } from "lucide-react-native";
import { getTheme } from "@gracerandly/theme";
import { useAuth } from "../context/AuthContext";
import Button from "../components/Button";

const theme = getTheme("light");

const TIER_LABELS: Record<string, string> = {
  probationary: "Probationary",
  bronze: "Bronze",
  silver: "Silver",
  gold: "Gold",
};

export default function ProfileScreen() {
  const { user, signOut } = useAuth();

  if (!user) return null;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.card}>
        <Text style={styles.name}>{user.fullName}</Text>
        <Text style={styles.phone}>{user.phone}</Text>
        {user.email ? <Text style={styles.email}>{user.email}</Text> : null}

        <View style={styles.badgeRow}>
          {user.identityVerified ? (
            <ShieldCheck size={16} color={theme.colors.success} />
          ) : (
            <ShieldAlert size={16} color={theme.colors.warning} />
          )}
          <Text style={styles.badgeLabel}>
            {user.identityVerified ? "Identity verified" : "Verification pending"}
          </Text>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Trust tier</Text>
        <Text style={styles.tierValue}>{TIER_LABELS[user.trustTierId] ?? user.trustTierId}</Text>
        <Text style={styles.tierHint}>
          Higher tiers unlock higher-value errands as you complete more clean, on-time deliveries.
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Active errands</Text>
        <Text style={styles.tierValue}>{user.activeErrandCount} / 3</Text>
      </View>

      <Button label="Log out" onPress={signOut} variant="ghost" />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: theme.spacing.lg, gap: theme.spacing.md },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  name: { fontFamily: theme.fonts.uiSemibold, fontSize: 18, color: theme.colors.text },
  phone: { fontFamily: theme.fonts.ui, fontSize: 14, color: theme.colors.textMuted, marginTop: 2 },
  email: { fontFamily: theme.fonts.ui, fontSize: 14, color: theme.colors.textMuted },
  badgeRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: theme.spacing.sm },
  badgeLabel: { fontFamily: theme.fonts.uiMedium, fontSize: 13, color: theme.colors.text },
  sectionTitle: { fontFamily: theme.fonts.uiMedium, fontSize: 13, color: theme.colors.textMuted, textTransform: "uppercase" },
  tierValue: { fontFamily: theme.fonts.uiSemibold, fontSize: 20, color: theme.colors.primaryDark, marginTop: 4 },
  tierHint: { fontFamily: theme.fonts.ui, fontSize: 12, color: theme.colors.textMuted, marginTop: 6 },
});
