import { View, Text, StyleSheet, ScrollView, Pressable } from "react-native";
import { useNavigation, type CompositeNavigationProp } from "@react-navigation/native";
import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ShieldCheck, ShieldAlert, ChevronRight } from "lucide-react-native";
import { getTheme } from "@gracerandly/theme";
import { useAuth } from "../context/AuthContext";
import Button from "../components/Button";
import type { MainStackParamList, TabParamList } from "../navigation/types";

const theme = getTheme("light");

type ProfileNavigationProp = CompositeNavigationProp<
  BottomTabNavigationProp<TabParamList, "Profile">,
  NativeStackNavigationProp<MainStackParamList>
>;

const TIER_LABELS: Record<string, string> = {
  probationary: "Probationary",
  bronze: "Bronze",
  silver: "Silver",
  gold: "Gold",
};

export default function ProfileScreen() {
  const navigation = useNavigation<ProfileNavigationProp>();
  const { user, signOut } = useAuth();

  if (!user) return null;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.card}>
        <Text style={styles.name}>{user.fullName}</Text>
        <Text style={styles.phone}>{user.phone}</Text>
        {user.email ? <Text style={styles.email}>{user.email}</Text> : null}
      </View>

      <Pressable
        style={[styles.card, styles.verificationCard]}
        onPress={() => navigation.navigate("Verification")}
      >
        <View style={styles.verificationLeft}>
          {user.identityVerified ? (
            <ShieldCheck size={20} color={theme.colors.success} />
          ) : (
            <ShieldAlert size={20} color={theme.colors.warning} />
          )}
          <View>
            <Text style={styles.badgeLabel}>
              {user.identityVerified ? "Identity verified" : "Verification required"}
            </Text>
            {!user.identityVerified ? (
              <Text style={styles.verificationHint}>
                Submit your NIN, BVN and a guarantor to go online
              </Text>
            ) : null}
          </View>
        </View>
        <ChevronRight size={18} color={theme.colors.textMuted} />
      </Pressable>

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
  verificationCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  verificationLeft: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
  badgeLabel: { fontFamily: theme.fonts.uiMedium, fontSize: 14, color: theme.colors.text },
  verificationHint: {
    fontFamily: theme.fonts.ui,
    fontSize: 12,
    color: theme.colors.textMuted,
    marginTop: 2,
  },
  sectionTitle: {
    fontFamily: theme.fonts.uiMedium,
    fontSize: 13,
    color: theme.colors.textMuted,
    textTransform: "uppercase",
  },
  tierValue: { fontFamily: theme.fonts.uiSemibold, fontSize: 20, color: theme.colors.primaryDark, marginTop: 4 },
  tierHint: { fontFamily: theme.fonts.ui, fontSize: 12, color: theme.colors.textMuted, marginTop: 6 },
});
