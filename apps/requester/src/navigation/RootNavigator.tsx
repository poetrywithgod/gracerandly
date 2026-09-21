import { NavigationContainer } from "@react-navigation/native";
import AuthNavigator from "./AuthNavigator";
import MainNavigator from "./MainNavigator";
import LoadingScreen from "../components/LoadingScreen";
import { useAuth } from "../context/AuthContext";

export default function RootNavigator() {
  const { isAuthenticated, isRestoring } = useAuth();

  // isRestoring covers the one-time check for a saved session on launch —
  // show a branded loading state instead of flashing the login screen
  // before we know whether the user is already signed in.
  if (isRestoring) {
    return <LoadingScreen />;
  }

  return (
    <NavigationContainer>
      {isAuthenticated ? <MainNavigator /> : <AuthNavigator />}
    </NavigationContainer>
  );
}
