// Identical to apps/runner/src/components/SosButton.tsx — see
// GlassCard.tsx's header comment for why it's duplicated rather than shared.
//
// The panic button. Press-and-hold (not a tap) so a stray touch in a pocket
// can't raise a false alarm. An SOS is sent to Gracerandly's own safety team
// with the user's location — deliberately NOT to the other party on the
// errand (see apps/api's lib/sos.ts for why). If the server reports nobody
// could actually be reached (notifiedCount === 0), the panel says so plainly
// and points at emergency services instead of implying help is on the way.
import { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, Pressable, Animated, Easing, Linking, StyleSheet } from "react-native";
import { ShieldAlert, Phone } from "lucide-react-native";
import { getTheme } from "@gracerandly/theme";
import type { SosAlert } from "@gracerandly/shared-types";
import Button from "./Button";
import ConfirmModal from "./ConfirmModal";
import { apiFetch, ApiError } from "../lib/apiClient";
import { getCurrentCoordinate } from "../lib/location";

const theme = getTheme("light");

// Nigeria's national emergency number.
const EMERGENCY_NUMBER = "112";
const HOLD_MS = 2000;
// While an alert is active, keep the safety team's copy of the location
// fresh. The server treats a repeat press as a location refresh (no repeat
// texts or emails), so this is cheap.
const LOCATION_REFRESH_MS = 30_000;

interface SosButtonProps {
  errandId: string;
  token: string;
  /** "/errands" for the requester app, "/runners/errands" for the runner app. */
  apiBasePath: string;
  /** Only used in the hint copy: who the SOS is NOT sent to. */
  otherPartyLabel: "runner" | "requester";
}

function callEmergency() {
  Linking.openURL(`tel:${EMERGENCY_NUMBER}`).catch(() => {});
}

export default function SosButton({ errandId, token, apiBasePath, otherPartyLabel }: SosButtonProps) {
  const path = `${apiBasePath}/${errandId}/sos`;
  const authHeaders = { Authorization: `Bearer ${token}` };

  const [alert, setAlert] = useState<SosAlert | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [isResolving, setIsResolving] = useState(false);
  const [showSafeConfirm, setShowSafeConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const progress = useRef(new Animated.Value(0)).current;
  const holdAnimation = useRef<Animated.CompositeAnimation | null>(null);

  // Pick up an alert that's already active (e.g. the screen was reopened).
  useEffect(() => {
    let cancelled = false;
    apiFetch<{ alert: SosAlert | null }>(path, { headers: { Authorization: `Bearer ${token}` } })
      .then((response) => {
        if (!cancelled) setAlert(response.alert);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [path, token]);

  // Keep the location fresh while an alert is active.
  useEffect(() => {
    if (alert?.status !== "active") return;
    const interval = setInterval(async () => {
      try {
        const coordinate = await getCurrentCoordinate();
        const response = await apiFetch<{ alert: SosAlert }>(path, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: JSON.stringify({ lat: coordinate.latitude, lng: coordinate.longitude }),
        });
        setAlert(response.alert);
      } catch {
        // Best effort — the original alert is already recorded.
      }
    }, LOCATION_REFRESH_MS);
    return () => clearInterval(interval);
  }, [alert?.status, path, token]);

  const send = useCallback(async () => {
    setError(null);
    setIsSending(true);
    try {
      const coordinate = await getCurrentCoordinate();
      const response = await apiFetch<{ alert: SosAlert }>(path, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({ lat: coordinate.latitude, lng: coordinate.longitude }),
      });
      setAlert(response.alert);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? `${err.message}. If you're in danger, call ${EMERGENCY_NUMBER} now.`
          : `Couldn't get your location to send the SOS. Turn on location, or call ${EMERGENCY_NUMBER} now.`
      );
    } finally {
      setIsSending(false);
      progress.setValue(0);
    }
  }, [path, token, progress]);

  function handlePressIn() {
    if (isSending) return;
    holdAnimation.current = Animated.timing(progress, {
      toValue: 1,
      duration: HOLD_MS,
      easing: Easing.linear,
      useNativeDriver: false,
    });
    holdAnimation.current.start(({ finished }) => {
      if (finished) send();
    });
  }

  function handlePressOut() {
    holdAnimation.current?.stop();
    if (!isSending) progress.setValue(0);
  }

  async function handleResolve() {
    setIsResolving(true);
    try {
      await apiFetch<{ alert: SosAlert }>(`${path}/resolve`, { method: "POST", headers: authHeaders });
      setAlert(null);
      setShowSafeConfirm(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't close the SOS. Try again.");
      setShowSafeConfirm(false);
    } finally {
      setIsResolving(false);
    }
  }

  if (alert?.status === "active") {
    const reached = alert.notifiedCount > 0;
    return (
      <View style={[styles.card, styles.activeCard]}>
        <View style={styles.titleRow}>
          <ShieldAlert size={20} color={theme.colors.danger} />
          <Text style={styles.activeTitle}>SOS sent</Text>
        </View>
        <Text style={styles.body}>
          {reached
            ? "Gracerandly's safety team has been alerted with your location."
            : `Your SOS was recorded, but we couldn't reach our safety team. Call ${EMERGENCY_NUMBER} now.`}
        </Text>
        <Button label={`Call ${EMERGENCY_NUMBER}`} variant="danger" onPress={callEmergency} />
        <Button label="I'm safe" variant="ghost" onPress={() => setShowSafeConfirm(true)} />
        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <ConfirmModal
          visible={showSafeConfirm}
          title="Are you safe now?"
          body="This closes your SOS. You can send a new one any time."
          confirmLabel="I'm safe"
          cancelLabel="Keep SOS active"
          isConfirming={isResolving}
          onConfirm={handleResolve}
          onCancel={() => setShowSafeConfirm(false)}
        />
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <Pressable
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={isSending}
        accessibilityRole="button"
        accessibilityLabel="Send SOS"
        accessibilityHint="Press and hold for two seconds to send an SOS to Gracerandly's safety team"
        style={styles.holdButton}
      >
        <Animated.View
          style={[styles.fill, { width: progress.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] }) }]}
        />
        <View style={styles.holdContent}>
          <ShieldAlert size={20} color={theme.colors.danger} />
          <Text style={styles.holdLabel}>{isSending ? "Sending…" : "Hold to send SOS"}</Text>
        </View>
      </Pressable>
      <Text style={styles.hint}>
        Press and hold for 2 seconds. This alerts Gracerandly's safety team with your location — not the {otherPartyLabel}.
      </Text>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      <Pressable onPress={callEmergency} style={styles.callRow} accessibilityRole="button">
        <Phone size={14} color={theme.colors.textMuted} />
        <Text style={styles.callText}>Call emergency services ({EMERGENCY_NUMBER})</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    gap: theme.spacing.sm,
  },
  activeCard: { borderColor: theme.colors.danger, borderWidth: 2 },
  holdButton: {
    borderRadius: theme.radius.md,
    borderWidth: 1.5,
    borderColor: theme.colors.danger,
    overflow: "hidden",
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  // Semi-transparent so the label stays readable as it fills.
  fill: { position: "absolute", left: 0, top: 0, bottom: 0, backgroundColor: "rgba(192,57,43,0.28)" },
  holdContent: { flexDirection: "row", alignItems: "center", gap: 8 },
  holdLabel: { fontFamily: theme.fonts.uiSemibold, fontSize: 16, color: theme.colors.danger },
  hint: { fontFamily: theme.fonts.ui, fontSize: 12, color: theme.colors.textMuted, lineHeight: 17 },
  callRow: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", paddingVertical: 4 },
  callText: { fontFamily: theme.fonts.uiMedium, fontSize: 13, color: theme.colors.textMuted },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  activeTitle: { fontFamily: theme.fonts.uiSemibold, fontSize: 18, color: theme.colors.danger },
  body: { fontFamily: theme.fonts.ui, fontSize: 14, color: theme.colors.text, lineHeight: 20 },
  errorText: { fontFamily: theme.fonts.uiMedium, fontSize: 13, color: theme.colors.danger },
});
