import { View, Image, Text, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getTheme } from "@gracerandly/theme";
import { useAuth } from "../context/AuthContext";

const theme = getTheme("light");

export default function AppHeader() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  return (
    <View style={[styles.container, { paddingTop: insets.top + theme.spacing.sm }]}>
      <View style={styles.brand}>
        <Image source={require("../../assets/brand-icon-badge.png")} style={styles.badge} resizeMode="contain" />
        <Text style={styles.wordmark}>Gracerandly Runner</Text>
      </View>
      <View style={styles.statusPill}>
        <View style={[styles.statusDot, { backgroundColor: user?.isOnline ? theme.colors.success : theme.colors.textMuted }]} />
        <Text style={styles.statusLabel}>{user?.isOnline ? "Online" : "Offline"}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: theme.spacing.lg,
    paddingBottom: theme.spacing.sm,
    backgroundColor: theme.colors.background,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  brand: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  badge: {
    width: 32,
    height: 32,
    borderRadius: theme.radius.sm,
  },
  wordmark: {
    fontFamily: theme.fonts.display,
    fontSize: 16,
    color: theme.colors.primaryDark,
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 4,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusLabel: {
    fontFamily: theme.fonts.uiMedium,
    fontSize: 12,
    color: theme.colors.textMuted,
  },
});
