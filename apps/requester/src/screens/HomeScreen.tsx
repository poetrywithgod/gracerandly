import { View, Text, StyleSheet } from "react-native";
import { getTheme } from "@gracerandly/theme";
import Button from "../components/Button";
import { useAuth } from "../context/AuthContext";

const theme = getTheme("light");

export default function HomeScreen() {
  const { user, signOut } = useAuth();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Gracerandly</Text>
      <Text style={styles.subtitle}>Get it done without leaving.</Text>
      {user ? <Text style={styles.welcome}>Welcome, {user.fullName.split(" ")[0]}</Text> : null}
      <Button label="Sign out" onPress={signOut} style={styles.signOutButton} />
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
  welcome: {
    fontSize: 16,
    fontFamily: theme.fonts.uiMedium,
    color: theme.colors.primaryDark,
    marginTop: theme.spacing.lg,
  },
  signOutButton: {
    marginTop: theme.spacing.xl,
    alignSelf: "stretch",
  },
});
