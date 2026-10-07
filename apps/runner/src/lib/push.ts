// Identical to apps/requester/src/lib/push.ts — see components/GlassCard.tsx's
// header comment for why it's duplicated.
//
// Push notifications: lets the API reach this phone when the app is closed
// (a new chat message, a missed call). After login we ask permission (in the
// app's own voice, via lib/permissions.ts), get an Expo push token, and give
// it to the API (POST /push/register). Everything here is best-effort — if
// push can't be set up (no Firebase config in this build, permission
// refused, offline) the app just carries on without notifications.
import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";
import { apiFetch } from "./apiClient";
import { ensurePermission } from "./permissions";

const ASKED_KEY = "gracerandly_push_permission_asked";

// How a notification looks if it arrives while the app is open. (The API
// doesn't push to someone who's already connected to that chat, so this
// mostly shows messages for other errands / screens.)
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

async function ensureAndroidChannels() {
  if (Platform.OS !== "android") return;
  // Channel ids must match what the API sends (apps/api/src/lib/push.ts).
  await Notifications.setNotificationChannelAsync("messages", {
    name: "Messages",
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
  });
  await Notifications.setNotificationChannelAsync("calls", {
    name: "Calls",
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 500, 250, 500],
  });
}

// Only the first time: if the person said no to our explanation card we
// don't keep re-asking on every launch.
async function hasNotificationPermission(): Promise<boolean> {
  const status = await Notifications.getPermissionsAsync();
  if (status.granted) return true;
  if (!status.canAskAgain) return false;
  if (await SecureStore.getItemAsync(ASKED_KEY)) return false;
  await SecureStore.setItemAsync(ASKED_KEY, "1");
  return (await ensurePermission("notifications")) === "granted";
}

let registeredToken: string | null = null;

/** Registers this phone for push under the signed-in account. Never throws. */
export async function registerForPush(authToken: string): Promise<void> {
  try {
    await ensureAndroidChannels();
    if (!(await hasNotificationPermission())) return;

    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    if (!projectId) return;
    // Throws if this build has no Firebase config (google-services.json).
    const { data: pushToken } = await Notifications.getExpoPushTokenAsync({ projectId });

    await apiFetch("/push/register", {
      method: "POST",
      headers: { Authorization: `Bearer ${authToken}` },
      body: JSON.stringify({ token: pushToken, platform: Platform.OS === "ios" ? "ios" : "android" }),
    });
    registeredToken = pushToken;
  } catch (err) {
    console.warn("[push] couldn't register for notifications:", err instanceof Error ? err.message : err);
  }
}

/** Tells the API to stop notifying this phone for the account that's signing
 * out. Fire-and-forget; call it before the auth token is cleared. */
export function unregisterForPush(authToken: string): void {
  const pushToken = registeredToken;
  registeredToken = null;
  if (!pushToken) return;
  apiFetch("/push/unregister", {
    method: "POST",
    headers: { Authorization: `Bearer ${authToken}` },
    body: JSON.stringify({ token: pushToken }),
  }).catch(() => {});
}
