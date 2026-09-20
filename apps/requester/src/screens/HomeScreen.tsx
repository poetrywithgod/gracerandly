import { View, Text, StyleSheet } from "react-native";
import { getTheme } from "@gracerandly/theme";

const theme = getTheme("light");

export default function HomeScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Gracerandly</Text>
      <Text style={styles.subtitle}>Get it done without leaving.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
    alignItems: "center",
    justifyContent: "center",
    padding: theme.spacing.lg,
  },
  title: {
    fontSize: 36,
    fontFamily: theme.fonts.display,
    color: theme.colors.primaryDark,
    marginBottom: theme.spacing.sm,
  },
  subtitle: {
    fontSize: 16,
    fontFamily: theme.fonts.ui,
    color: theme.colors.textMuted,
  },
});
