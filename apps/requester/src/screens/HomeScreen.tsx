import { View, Text, StyleSheet } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { getTheme } from "@gracerandly/theme";
import Button from "../components/Button";
import { useAuth } from "../context/AuthContext";
import type { MainStackParamList } from "../navigation/types";

const theme = getTheme("light");

export default function HomeScreen() {
  const { user, signOut } = useAuth();
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Gracerandly</Text>
      <Text style={styles.subtitle}>Get it done without leaving.</Text>
      {user ? <Text style={styles.welcome}>Welcome, {user.fullName.split(" ")[0]}</Text> : null}
      <Button
        label="Post an errand"
        onPress={() => navigation.navigate("CreateErrand")}
        style={styles.postButton}
      />
      <Button label="Sign out" variant="ghost" onPress={signOut} style={styles.signOutButton} />
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
  postButton: {
    marginTop: theme.spacing.xl,
    alignSelf: "stretch",
  },
  signOutButton: {
    marginTop: theme.spacing.sm,
    alignSelf: "stretch",
  },
});
