import { NavigationContainer } from "@react-navigation/native";
import AuthNavigator from "./AuthNavigator";
import MainNavigator from "./MainNavigator";
import { useAuth } from "../context/AuthContext";

// TODO: swap AuthProvider's mock sign-in/sign-up for real apps/api calls
// once auth endpoints exist. Until then this reflects the mock state so
// Login/Signup are testable end-to-end.
export default function RootNavigator() {
  const { isAuthenticated } = useAuth();

  return (
    <NavigationContainer>
      {isAuthenticated ? <MainNavigator /> : <AuthNavigator />}
    </NavigationContainer>
  );
}
