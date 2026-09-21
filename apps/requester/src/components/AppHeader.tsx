import { View, Image, Text, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getTheme } from "@gracerandly/theme";

const theme = getTheme("light");

export default function AppHeader() {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { paddingTop: insets.top + theme.spacing.sm }]}>
      <Image
        source={require("../../assets/brand-icon-badge.png")}
        style={styles.badge}
        resizeMode="contain"
      />
      <Text style={styles.wordmark}>Gracerandly</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: theme.spacing.lg,
    paddingBottom: theme.spacing.sm,
    backgroundColor: theme.colors.background,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  badge: {
    width: 32,
    height: 32,
    borderRadius: theme.radius.sm,
  },
  wordmark: {
    fontFamily: theme.fonts.display,
    fontSize: 20,
    color: theme.colors.primaryDark,
  },
});
