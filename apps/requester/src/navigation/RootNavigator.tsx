import { NavigationContainer } from "@react-navigation/native";
import AuthNavigator from "./AuthNavigator";
import MainNavigator from "./MainNavigator";

// TODO: wire to real auth state once apps/api auth is built.
// Hardcoded to the Auth flow for now so Login/Signup are what you see on launch.
const isAuthenticated = false;

export default function RootNavigator() {
  return (
    <NavigationContainer>
      {isAuthenticated ? <MainNavigator /> : <AuthNavigator />}
    </NavigationContainer>
  );
}
