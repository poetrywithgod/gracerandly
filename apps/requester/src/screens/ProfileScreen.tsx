import { View, Text, StyleSheet } from "react-native";
import { getTheme } from "@gracerandly/theme";
import Button from "../components/Button";
import { useAuth } from "../context/AuthContext";

const theme = getTheme("light");

const GENDER_LABELS: Record<string, string> = {
  female: "Female",
  male: "Male",
  unspecified: "Prefer not to say",
};

export default function ProfileScreen() {
  const { user, signOut } = useAuth();

  return (
    <View style={styles.container}>
      <View style={styles.avatar}>
        <Text style={styles.avatarInitial}>{user?.fullName.charAt(0).toUpperCase() ?? "?"}</Text>
      </View>

      <Text style={styles.name}>{user?.fullName}</Text>

      <View style={styles.infoCard}>
        <InfoRow label="Phone" value={user?.phone ?? "—"} />
        <InfoRow label="Email" value={user?.email ?? "Not provided"} />
        <InfoRow label="Gender" value={user ? GENDER_LABELS[user.gender] : "—"} />
        <InfoRow label="Phone verified" value={user?.phoneVerified ? "Yes" : "Not yet"} />
      </View>

      <Button label="Sign out" variant="ghost" onPress={signOut} style={styles.signOutButton} />
    </View>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
    padding: theme.spacing.lg,
    alignItems: "center",
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: theme.colors.primary,
    alignItems: "center",
    justifyContent: "center",
    marginTop: theme.spacing.lg,
    marginBottom: theme.spacing.sm,
  },
  avatarInitial: {
    fontFamily: theme.fonts.display,
    fontSize: 28,
    color: theme.colors.textOnPrimary,
  },
  name: {
    fontFamily: theme.fonts.uiSemibold,
    fontSize: 18,
    color: theme.colors.text,
    marginBottom: theme.spacing.lg,
  },
  infoCard: {
    alignSelf: "stretch",
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.xl,
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  infoLabel: {
    fontFamily: theme.fonts.ui,
    fontSize: 14,
    color: theme.colors.textMuted,
  },
  infoValue: {
    fontFamily: theme.fonts.uiMedium,
    fontSize: 14,
    color: theme.colors.text,
  },
  signOutButton: { alignSelf: "stretch" },
});
