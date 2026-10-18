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
      const type = notification.request.content.data?.type;
      if (type === "new_errand") requestErrandFeedRefresh();
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
