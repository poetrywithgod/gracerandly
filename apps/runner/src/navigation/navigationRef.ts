import { createNavigationContainerRef } from "@react-navigation/native";
import type { MainStackParamList } from "./types";

// Lets code outside a screen (e.g. components/PushHost.tsx, reacting to a
// tapped notification) navigate. Passed to NavigationContainer in
// RootNavigator.tsx.
export const navigationRef = createNavigationContainerRef<MainStackParamList>();
