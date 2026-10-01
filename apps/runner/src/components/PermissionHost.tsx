// Identical to apps/requester/src/components/PermissionHost.tsx — see
// GlassCard.tsx's header comment for why it's duplicated.
//
// Renders lib/permissions.ts's prompts in the same card style as
// ConfirmModal, so asking for location / microphone / camera / photos looks
// like the rest of the app instead of a bare system dialog. Mount once,
// near the root (App.tsx).
import { useEffect, useState } from "react";
import { Modal, View, Text, StyleSheet } from "react-native";
import { Camera, Image as ImageIcon, MapPin, Mic, type LucideIcon } from "lucide-react-native";
import { getTheme } from "@gracerandly/theme";
import Button from "./Button";
import {
  registerPermissionHost,
  type PermissionKind,
  type PermissionPrompt,
} from "../lib/permissions";

const theme = getTheme("light");

const COPY: Record<PermissionKind, { Icon: LucideIcon; title: string; why: string; settingsHint: string }> = {
  location: {
    Icon: MapPin,
    title: "Allow location access",
    why: "Gracerandly uses your location to show where you are on the map, suggest pickup points, and keep errands on track.",
    settingsHint: "Location is turned off for Gracerandly. Open Settings, then Permissions, then Location, and choose Allow.",
  },
  microphone: {
    Icon: Mic,
    title: "Allow microphone access",
    why: "The microphone is needed for voice notes and calls. It's only used while you're recording or on a call.",
    settingsHint: "Microphone access is turned off for Gracerandly. Open Settings, then Permissions, then Microphone, and choose Allow.",
  },
  camera: {
    Icon: Camera,
    title: "Allow camera access",
    why: "The camera is needed for profile photos and video calls. It's only used when you choose to.",
    settingsHint: "Camera access is turned off for Gracerandly. Open Settings, then Permissions, then Camera, and choose Allow.",
  },
  photos: {
    Icon: ImageIcon,
    title: "Allow photo access",
    why: "Gracerandly needs to see your photos so you can pick a profile picture. Nothing is shared until you choose one.",
    settingsHint: "Photo access is turned off for Gracerandly. Open Settings, then Permissions, then Photos, and choose Allow.",
  },
};

export default function PermissionHost() {
  const [prompt, setPrompt] = useState<PermissionPrompt | null>(null);

  useEffect(() => {
    registerPermissionHost(setPrompt);
    return () => registerPermissionHost(null);
  }, []);

  // Keep the last prompt's copy on screen while the fade-out finishes.
  const [last, setLast] = useState<PermissionPrompt | null>(null);
  useEffect(() => {
    if (prompt) setLast(prompt);
  }, [prompt]);

  const shown = prompt ?? last;
  if (!shown) return null;

  const { Icon, title, why, settingsHint } = COPY[shown.kind];
  const isBlocked = shown.mode === "blocked";

  return (
    <Modal visible={!!prompt} transparent animationType="fade" onRequestClose={() => prompt?.resolve(false)}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.iconCircle}>
            <Icon size={26} color={theme.colors.primary} />
          </View>
          <Text style={styles.title}>{isBlocked ? `${title.replace("Allow ", "")} is off` : title}</Text>
          <Text style={styles.body}>{isBlocked ? settingsHint : why}</Text>
          <View style={styles.actions}>
            <Button label="Not now" variant="ghost" onPress={() => prompt?.resolve(false)} style={styles.actionButton} />
            <Button
              label={isBlocked ? "Open settings" : "Continue"}
              onPress={() => prompt?.resolve(true)}
              style={styles.actionButton}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(26,16,19,0.55)",
    alignItems: "center",
    justifyContent: "center",
    padding: theme.spacing.lg,
  },
  card: {
    width: "100%",
    maxWidth: 340,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.xl,
    alignItems: "center",
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: theme.colors.background,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: theme.spacing.md,
  },
  title: {
    fontFamily: theme.fonts.display,
    fontSize: 20,
    color: theme.colors.primaryDark,
    marginBottom: theme.spacing.sm,
    textAlign: "center",
  },
  body: {
    fontFamily: theme.fonts.ui,
    fontSize: 14,
    color: theme.colors.textMuted,
    lineHeight: 20,
    marginBottom: theme.spacing.lg,
    textAlign: "center",
  },
  actions: {
    flexDirection: "row",
    gap: theme.spacing.sm,
    alignSelf: "stretch",
  },
  actionButton: { flex: 1 },
});
