// Identical to apps/requester/src/components/PushHost.tsx — see GlassCard.tsx's
// header comment for why it's duplicated.
//
// Renders nothing. While someone is signed in it (1) registers the phone for
// push notifications and (2) opens the right chat when a notification is
// tapped — including when the tap is what launched the app from closed.
// Mount once, near the root (App.tsx), inside AuthProvider.
import { useEffect, useRef } from "react";
import * as Notifications from "expo-notifications";
import { useAuth } from "../context/AuthContext";
import { registerForPush } from "../lib/push";
import { navigationRef } from "../navigation/navigationRef";

// Cold start: the tap can be handled before the navigator has mounted, so
// retry briefly instead of dropping it.
function openChatWhenReady(errandId: string, attemptsLeft = 40) {
  if (navigationRef.isReady()) {
    navigationRef.navigate("Chat", { errandId });
    return;
  }
  if (attemptsLeft > 0) setTimeout(() => openChatWhenReady(errandId, attemptsLeft - 1), 250);
}

export default function PushHost() {
  const { token } = useAuth();
  const lastResponse = Notifications.useLastNotificationResponse();
  const handledId = useRef<string | null>(null);

  useEffect(() => {
    if (token) void registerForPush(token);
  }, [token]);

  useEffect(() => {
    if (!lastResponse) return;
    const id = lastResponse.notification.request.identifier;
    // The hook keeps returning the same last tap — act on each one once.
    if (handledId.current === id) return;
    handledId.current = id;
    if (!token) return;
    if (lastResponse.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
    const errandId = lastResponse.notification.request.content.data?.errandId;
    if (typeof errandId === "string") openChatWhenReady(errandId);
  }, [lastResponse, token]);

  return null;
}
