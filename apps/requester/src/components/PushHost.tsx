// Identical to apps/runner/src/components/PushHost.tsx — see GlassCard.tsx's
// header comment for why it's duplicated.
//
// Renders nothing. While someone is signed in it (1) registers the phone for
// push notifications and (2) opens the right screen (a chat, or the Wallet for a
// just-posted repeating errand) when a notification is
// tapped — including when the tap is what launched the app from closed.
// Mount once, near the root (App.tsx), inside AuthProvider.
import { useEffect, useRef } from "react";
import * as Notifications from "expo-notifications";
import { useAuth } from "../context/AuthContext";
import { registerForPush } from "../lib/push";
import { navigationRef } from "../navigation/navigationRef";

// Cold start: the tap can be handled before the navigator has mounted, so
// retry briefly instead of dropping it.
function whenNavigatorReady(go: () => void, attemptsLeft = 40) {
  if (navigationRef.isReady()) {
    go();
    return;
  }
  if (attemptsLeft > 0) setTimeout(() => whenNavigatorReady(go, attemptsLeft - 1), 250);
}

// A "someone is calling" push while the app is open: jump to that chat, where
// the call screen shows (the server delivers the ringing invite as soon as the
// chat connects). Ignored if the ring has already run out.
function openRingingCall(data: Record<string, unknown> | undefined) {
  if (data?.type !== "incoming_call" || typeof data.errandId !== "string") return;
  if (typeof data.expiresAt === "number" && data.expiresAt < Date.now()) return;
  const errandId = data.errandId;
  whenNavigatorReady(() => navigationRef.navigate("Chat", { errandId }));
}

export default function PushHost() {
  const { token } = useAuth();
  const lastResponse = Notifications.useLastNotificationResponse();
  const handledId = useRef<string | null>(null);

  useEffect(() => {
    if (token) void registerForPush(token);
  }, [token]);

  // A call push arriving while the app is open: go straight to the call.
  useEffect(() => {
    if (!token) return;
    const subscription = Notifications.addNotificationReceivedListener((notification) => {
      openRingingCall(notification.request.content.data);
    });
    return () => subscription.remove();
  }, [token]);

  useEffect(() => {
    if (!lastResponse) return;
    const id = lastResponse.notification.request.identifier;
    // The hook keeps returning the same last tap — act on each one once.
    if (handledId.current === id) return;
    handledId.current = id;
    if (!token) return;
    if (lastResponse.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
    const data = lastResponse.notification.request.content.data;
    if (data?.type === "support_reply" && typeof data?.ticketId === "string") {
      const ticketId = data.ticketId;
      whenNavigatorReady(() => navigationRef.navigate("SupportThread", { ticketId }));
      return;
    }
    if (data?.type === "errand_status" && typeof data?.errandId === "string") {
      const statusErrandId = data.errandId;
      whenNavigatorReady(() => navigationRef.navigate("ErrandDetail", { errandId: statusErrandId }));
      return;
    }
    if (data?.type === "referral_reward") {
      whenNavigatorReady(() => navigationRef.navigate("Tabs", { screen: "Profile" }));
      return;
    }
    const errandId = data?.errandId;
    if (typeof errandId !== "string") return;
    if (data?.type === "recurring_posted") {
      // A repeating errand was just posted and is waiting for payment — the
      // Wallet tab lists unpaid errands with a "Pay now" button.
      whenNavigatorReady(() => navigationRef.navigate("Tabs", { screen: "Wallet" }));
    } else {
      whenNavigatorReady(() => navigationRef.navigate("Chat", { errandId }));
    }
  }, [lastResponse, token]);

  return null;
}
