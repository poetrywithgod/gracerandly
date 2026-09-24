import { createNativeStackNavigator } from "@react-navigation/native-stack";
import TabNavigator from "./TabNavigator";
import ErrandDetailScreen from "../screens/ErrandDetailScreen";
import type { MainStackParamList } from "./types";

const Stack = createNativeStackNavigator<MainStackParamList>();

export default function MainNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Tabs" component={TabNavigator} />
      <Stack.Screen
        name="ErrandDetail"
        component={ErrandDetailScreen}
        options={{ headerShown: true, title: "Errand" }}
      />
    </Stack.Navigator>
  );
}
