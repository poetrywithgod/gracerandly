import { createNativeStackNavigator } from "@react-navigation/native-stack";
import HomeScreen from "../screens/HomeScreen";
import CreateErrandScreen from "../screens/CreateErrandScreen";
import type { MainStackParamList } from "./types";

// ErrandTracking / Profile screens land in later work - this stack
// carries Home and CreateErrand for now.
const Stack = createNativeStackNavigator<MainStackParamList>();

export default function MainNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Home" component={HomeScreen} />
      <Stack.Screen
        name="CreateErrand"
        component={CreateErrandScreen}
        options={{ headerShown: true, title: "Post an errand" }}
      />
    </Stack.Navigator>
  );
}
