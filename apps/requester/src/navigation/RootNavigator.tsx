import { ActivityIndicator, View, StyleSheet } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { getTheme } from "@gracerandly/theme";
import AuthNavigator from "./AuthNavigator";
import MainNavigator from "./MainNavigator";
import { useAuth } from "../context/AuthContext";

const theme = getTheme("light");

export default function RootNavigator() {
  const { isAuthenticated, isRestoring } = useAuth();

  // isRestoring covers the one-time check for a saved session on launch —
  // show a blank/branded loading state instead of flashing the login
  // screen before we know whether the user is already signed in.
  if (isRestoring) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={theme.colors.primary} size="large" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      {isAuthenticated ? <MainNavigator /> : <AuthNavigator />}
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.background,
  },
});
