// Runner-side live map: where the runner (you) and the requester are, as
// round profile pictures, with the pickup and drop-off pins. The requester's
// position comes from the API (it's only released to the runner on the
// errand — see apps/api's lib/live-positions.ts); your own comes from this
// phone's GPS via components/LiveLocationHost.tsx.
import { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import { WebView } from "react-native-webview";
import { getTheme } from "@gracerandly/theme";
import type { GeoPoint, ErrandStatus } from "@gracerandly/shared-types";
import { useAuth } from "../context/AuthContext";
import { apiFetch } from "../lib/apiClient";
import { buildLiveMapHtml } from "../lib/liveMapHtml";
import { fetchChatParticipant } from "../lib/chatApi";
import { getOwnPosition, subscribeToOwnPosition, type OwnPosition } from "../lib/liveLocation";

const theme = getTheme("light");

const REQUESTER_POLL_INTERVAL_MS = 5000;

interface LiveTrackingMapProps {
  errandId: string;
  pickup: GeoPoint;
  dropoff: GeoPoint;
  status: ErrandStatus;
}

interface RequesterLocationResponse {
  position: { lat: number; lng: number } | null;
}

export default function LiveTrackingMap({ errandId, pickup, dropoff, status }: LiveTrackingMapProps) {
  const { token, user } = useAuth();
  const webviewRef = useRef<WebView>(null);
  // The page only depends on the pins, so it's built once per errand.
  const [mapHtml] = useState(() => buildLiveMapHtml({ pickup, dropoff }));
  const [requesterName, setRequesterName] = useState<string | null>(null);
  const [hasRequesterPosition, setHasRequesterPosition] = useState(false);
  const [hasOwnPosition, setHasOwnPosition] = useState(!!getOwnPosition());

  const pageReady = useRef(false);
  const requesterPerson = useRef({ name: "Requester", uri: "" });
  const lastRequester = useRef<{ lat: number; lng: number } | null>(null);
  const lastMe = useRef<OwnPosition | null>(getOwnPosition());

  const inject = useCallback((js: string) => {
    webviewRef.current?.injectJavaScript(`${js}; true;`);
  }, []);

  const sendAvatars = useCallback(() => {
    if (!pageReady.current) return;
    const me = { name: user?.fullName ?? "Me", uri: user?.avatarUrl ?? "" };
    inject(
      `window.setAvatar('requester', ${JSON.stringify(requesterPerson.current.name)}, ${JSON.stringify(requesterPerson.current.uri)});` +
        `window.setAvatar('runner', ${JSON.stringify(me.name)}, ${JSON.stringify(me.uri)})`
    );
  }, [inject, user?.fullName, user?.avatarUrl]);

  const sendRequester = useCallback(() => {
    const p = lastRequester.current;
    if (pageReady.current && p) inject(`window.setPerson('requester', ${p.lat}, ${p.lng})`);
  }, [inject]);

  const sendMe = useCallback(() => {
    const p = lastMe.current;
    if (pageReady.current && p) inject(`window.setPerson('runner', ${p.lat}, ${p.lng})`);
  }, [inject]);

  const handlePageLoaded = useCallback(() => {
    pageReady.current = true;
    sendAvatars();
    sendRequester();
    sendMe();
  }, [sendAvatars, sendRequester, sendMe]);

  useEffect(() => {
    sendAvatars(); // e.g. the runner changed their own picture
  }, [sendAvatars]);

  // Who the requester is, for their avatar.
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    fetchChatParticipant("runner", errandId, token)
      .then((participant) => {
        if (cancelled) return;
        requesterPerson.current = { name: participant.name, uri: participant.avatarUrl ?? "" };
        setRequesterName(participant.name);
        sendAvatars();
      })
      .catch(() => {
        // No avatar yet — their marker just shows an initial.
      });
    return () => {
      cancelled = true;
    };
  }, [errandId, token, sendAvatars]);

  // This phone's own position, shown as the runner's avatar.
  useEffect(() => {
    return subscribeToOwnPosition((position) => {
      lastMe.current = position;
      setHasOwnPosition(true);
      sendMe();
    });
  }, [sendMe]);

  // The requester's position, refreshed every few seconds.
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const { position } = await apiFetch<RequesterLocationResponse>(`/runners/errands/${errandId}/requester-location`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (cancelled) return;
        setHasRequesterPosition(!!position);
        if (position) {
          lastRequester.current = position;
          sendRequester();
        }
      } catch {
        // Offline or the server is waking up — the next poll tries again.
      }
    };
    poll();
    const interval = setInterval(poll, REQUESTER_POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [errandId, token, sendRequester]);

  const heading =
    status === "accepted" || status === "en_route_to_pickup" ? "On the way to pickup" : "On the way to drop-off";

  return (
    <View style={styles.card}>
      <Text style={styles.sectionLabel}>{heading}</Text>
      <View style={styles.mapWrapper}>
        <WebView
          ref={webviewRef}
          style={styles.map}
          originWhitelist={["*"]}
          source={{ html: mapHtml }}
          onLoadEnd={handlePageLoaded}
        />
      </View>
      {!hasOwnPosition ? <Text style={styles.note}>Finding your location…</Text> : null}
      {!hasRequesterPosition ? (
        <Text style={styles.note}>Waiting for {requesterName ?? "the requester"}'s location…</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.md,
    gap: 8,
  },
  sectionLabel: { fontFamily: theme.fonts.uiMedium, fontSize: 14, color: theme.colors.text },
  mapWrapper: { height: 220, borderRadius: theme.radius.md, overflow: "hidden" },
  map: { flex: 1 },
  note: { fontFamily: theme.fonts.ui, fontSize: 12, color: theme.colors.textMuted },
});
