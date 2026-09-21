import { createNativeStackNavigator } from "@react-navigation/native-stack";
import TabNavigator from "./TabNavigator";
import CreateErrandScreen from "../screens/CreateErrandScreen";
import type { MainStackParamList } from "./types";

// ErrandTracking lands in later work. Tabs (Home/Profile) is the base of
// the stack; CreateErrand pushes on top full-screen, hiding the tab bar
// automatically, which is the standard nested tab-inside-stack pattern.
const Stack = createNativeStackNavigator<MainStackParamList>();

export default function MainNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Tabs" component={TabNavigator} />
      <Stack.Screen
        name="CreateErrand"
        component={CreateErrandScreen}
        options={{ headerShown: true, title: "Post an errand" }}
      />
    </Stack.Navigator>
  );
}
