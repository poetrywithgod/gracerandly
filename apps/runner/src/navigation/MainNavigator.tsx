import { createNativeStackNavigator } from "@react-navigation/native-stack";
import TabNavigator from "./TabNavigator";
import ErrandDetailScreen from "../screens/ErrandDetailScreen";
import SupportListScreen from "../screens/SupportListScreen";
import SupportNewScreen from "../screens/SupportNewScreen";
import SupportThreadScreen from "../screens/SupportThreadScreen";
import VerificationScreen from "../screens/VerificationScreen";
import ChatScreen from "../screens/ChatScreen";
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
      <Stack.Screen
        name="Verification"
        component={VerificationScreen}
        options={{ headerShown: true, title: "Identity verification" }}
      />
      <Stack.Screen name="Chat" component={ChatScreen} options={{ headerShown: true, title: "Chat" }} />
      <Stack.Screen name="Support" component={SupportListScreen} options={{ headerShown: true, title: "Help & support" }} />
      <Stack.Screen name="SupportNew" component={SupportNewScreen} options={{ headerShown: true, title: "Contact support" }} />
      <Stack.Screen name="SupportThread" component={SupportThreadScreen} options={{ headerShown: true, title: "Support" }} />
    </Stack.Navigator>
  );
}

