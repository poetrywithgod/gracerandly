import { useEffect, useRef } from "react";
import { Animated, StyleSheet, View, ViewStyle } from "react-native";
import { getTheme } from "@gracerandly/theme";

const theme = getTheme("light");

interface SkeletonBlockProps {
  width?: number | `${number}%`;
  height?: number;
  radius?: number;
  style?: ViewStyle;
}

export function SkeletonBlock({ width = "100%", height = 16, radius, style }: SkeletonBlockProps) {
  const opacity = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 650, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.4, duration: 650, useNativeDriver: true }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[
        styles.block,
        { width, height, borderRadius: radius ?? theme.radius.sm, opacity },
        style,
      ]}
    />
  );
}

/** Skeleton placeholder shaped like a single ErrandCard row. */
export function ErrandCardSkeleton() {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <SkeletonBlock width={90} height={20} radius={theme.radius.pill} />
        <SkeletonBlock width={60} height={14} />
      </View>
      <SkeletonBlock width="70%" height={14} style={styles.cardLine} />
      <SkeletonBlock width="45%" height={14} style={styles.cardLine} />
    </View>
  );
}

const styles = StyleSheet.create({
  block: { backgroundColor: theme.colors.border },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.sm,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: theme.spacing.sm,
  },
  cardLine: { marginTop: 8 },
});
