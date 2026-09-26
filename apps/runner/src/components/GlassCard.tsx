/**
 * Identical to apps/requester/src/components/GlassCard.tsx — there's no
 * shared UI package in this monorepo (each app's components are its own
 * copy, same as apps/requester/src/lib/realtime.ts's counterpart in this
 * app), so this is duplicated rather than imported cross-app. Keep the
 * two in sync by hand if the glass-card look changes.
 */
import { Platform, StyleSheet, View, ViewStyle } from "react-native";
import type { RefObject } from "react";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { getTheme } from "@gracerandly/theme";

const theme = getTheme("light");

interface GlassCardProps {
  children: React.ReactNode;
  style?: ViewStyle;
  intensity?: number;
  /**
   * Ref to the BlurTargetView wrapping whatever should show through the
   * glass (the screen's gradient/background). Required on Android — SDK 57's
   * BlurView only blurs there when given an explicit target; without it,
   * Android silently falls back to a flat semi-transparent tint instead of
   * a real blur (that's the "muddy gray box" look instead of frosted glass).
   * No-op on iOS/web, where BlurView blurs whatever's behind it natively.
   */
  blurTarget?: RefObject<View | null>;
}

export default function GlassCard({ children, style, intensity = 55, blurTarget }: GlassCardProps) {
  return (
    <View style={[styles.shadowWrap, style]}>
      <BlurView
        intensity={intensity}
        tint="light"
        style={styles.blur}
        blurTarget={blurTarget}
        blurMethod={Platform.OS === "android" ? "dimezisBlurView" : undefined}
      >
        <LinearGradient
          colors={["rgba(255,255,255,0.30)", "rgba(255,255,255,0.10)"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.sheen}
        />
        <View style={styles.content}>{children}</View>
      </BlurView>
    </View>
  );
}

const styles = StyleSheet.create({
  shadowWrap: {
    borderRadius: theme.radius.lg + 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.3,
    shadowRadius: 24,
    elevation: 12,
  },
  blur: {
    borderRadius: theme.radius.lg + 4,
    overflow: "hidden",
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.45)",
  },
  sheen: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  content: {
    padding: theme.spacing.xl,
  },
});
