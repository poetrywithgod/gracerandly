import { useCallback } from "react";
import { View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import * as SplashScreen from "expo-splash-screen";
import {
  useFonts,
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
} from "@expo-google-fonts/poppins";
import { StatusBar } from "expo-status-bar";
import RootNavigator from "./src/navigation/RootNavigator";
import { AuthProvider } from "./src/context/AuthContext";

SplashScreen.preventAutoHideAsync();

// Only Poppins is loaded here (unlike the Requester app, which also
// bundles Sagace + Merriweather) — the Runner app doesn't use the
// display/serif font tokens, so there's no need to ship those assets
// again. `@gracerandly/theme`'s `fonts.display` token still resolves to
// "Sagace-Bold" for any shared component that reads it; React Native just
// falls back to the platform default font when that family isn't
// registered, so nothing breaks — it just won't look brand-exact.
export default function App() {
  const [fontsLoaded] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
  });

  const onLayoutRootView = useCallback(async () => {
    if (fontsLoaded) {
      await SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

  if (!fontsLoaded) {
    return null;
  }

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <View style={{ flex: 1 }} onLayout={onLayoutRootView}>
          <StatusBar style="light" />
          <RootNavigator />
        </View>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
