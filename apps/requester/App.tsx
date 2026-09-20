import { useCallback, useEffect, useState } from "react";
import { View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import * as SplashScreen from "expo-splash-screen";
import * as Font from "expo-font";
import {
  useFonts as usePoppins,
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
} from "@expo-google-fonts/poppins";
import {
  useFonts as useMerriweather,
  Merriweather_400Regular,
  Merriweather_700Bold,
} from "@expo-google-fonts/merriweather";
import { StatusBar } from "expo-status-bar";
import RootNavigator from "./src/navigation/RootNavigator";
import { AuthProvider } from "./src/context/AuthContext";

SplashScreen.preventAutoHideAsync();

export default function App() {
  const [sagaceLoaded, setSagaceLoaded] = useState(false);
  const [poppinsLoaded] = usePoppins({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
  });
  const [merriweatherLoaded] = useMerriweather({
    Merriweather_400Regular,
    Merriweather_700Bold,
  });

  useEffect(() => {
    Font.loadAsync({
      "Sagace-Regular": require("./assets/fonts/sagace/Sagace-Regular.otf"),
      "Sagace-Medium": require("./assets/fonts/sagace/Sagace-Medium.otf"),
      "Sagace-Bold": require("./assets/fonts/sagace/Sagace-Bold.otf"),
    }).then(() => setSagaceLoaded(true));
  }, []);

  const fontsReady = sagaceLoaded && poppinsLoaded && merriweatherLoaded;

  const onLayoutRootView = useCallback(async () => {
    if (fontsReady) {
      await SplashScreen.hideAsync();
    }
  }, [fontsReady]);

  if (!fontsReady) {
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
