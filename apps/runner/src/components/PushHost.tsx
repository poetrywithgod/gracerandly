// Like apps/requester/src/components/PushHost.tsx, plus the Runner-only
// notification types (new errand nearby / at the 3-errand limit) — see
// GlassCard.tsx's header comment for why the apps duplicate files.
//
// Renders nothing. While someone is signed in it (1) registers the phone for
// push notifications, (2) opens the right screen when a notification is
// tapped — including when the tap is what launched the app from closed — and
// (3) when a "new errand" push lands while the app is open, tells the Home
// screen to refresh its list right away.
// Mount once, near the root (App.tsx), inside AuthProvider.
import { useEffect, useRef } from "react";
import * as Notifications from "expo-notifications";
import { useAuth } from "../context/AuthContext";
import { registerForPush } from "../lib/push";
import { requestErrandFeedRefresh } from "../lib/errandFeed";
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

  // A new-errand push arriving while the app is open: refresh the feed now.
  useEffect(() => {
    if (!token) return;
    const subscription = Notifications.addNotificationReceivedListener((notification) => {
      const data = notification.request.content.data;
      if (data?.type === "new_errand") requestErrandFeedRefresh();
      openRingingCall(data);
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
    if (data?.type === "errand_cancelled") {
      // The errand is gone — land on Home, which lists what's still open.
      requestErrandFeedRefresh();
      whenNavigatorReady(() => navigationRef.navigate("Tabs"));
      return;
    }
    if (data?.type === "referral_reward") {
      whenNavigatorReady(() => navigationRef.navigate("Tabs"));
      return;
    }
    const errandId = data?.errandId;
    if (data?.type === "new_errand" && typeof errandId === "string") {
      requestErrandFeedRefresh();
      whenNavigatorReady(() => navigationRef.navigate("ErrandDetail", { errandId }));
    } else if (data?.type === "at_capacity") {
      // The Home screen explains the limit and lists the active errands.
      whenNavigatorReady(() => navigationRef.navigate("Tabs"));
    } else if (typeof errandId === "string") {
      whenNavigatorReady(() => navigationRef.navigate("Chat", { errandId }));
    }
  }, [lastResponse, token]);

  return null;
}
