import { NavigationContainer } from "@react-navigation/native";
import AuthNavigator from "./AuthNavigator";
import MainNavigator from "./MainNavigator";
import LoadingScreen from "../components/LoadingScreen";
import { useAuth } from "../context/AuthContext";

export default function RootNavigator() {
  const { isAuthenticated, isRestoring } = useAuth();

  if (isRestoring) {
    return <LoadingScreen />;
  }

  return (
    <NavigationContainer>
      {isAuthenticated ? <MainNavigator /> : <AuthNavigator />}
    </NavigationContainer>
  );
}
