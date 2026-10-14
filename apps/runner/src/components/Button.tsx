import type { ComponentType } from "react";
import { Pressable, Text, View, StyleSheet, ViewStyle, ActivityIndicator } from "react-native";
import { getTheme } from "@gracerandly/theme";

const theme = getTheme("light");

type Variant = "primary" | "secondary" | "ghost" | "danger";

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: Variant;
  style?: ViewStyle;
  disabled?: boolean;
  loading?: boolean;
  /** A lucide icon shown before the label. Makes a button read as an action at a glance. */
  icon?: ComponentType<{ size?: number; color?: string }>;
  /** "large" is the full-width, taller call-to-action used for the main action on a screen. */
  size?: "regular" | "large";
}

export default function Button({
  label,
  onPress,
  variant = "primary",
  style,
  disabled,
  loading,
  icon: Icon,
  size = "regular",
}: ButtonProps) {
  const isDisabled = disabled || loading;
  const labelColor =
    variant === "ghost" ? theme.colors.primary : variant === "secondary" ? theme.colors.primaryDark : theme.colors.textOnPrimary;

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.base,
        size === "large" && styles.large,
        variantStyles[variant],
        isDisabled && styles.disabled,
        pressed && !isDisabled && styles.pressed,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={variant === "ghost" || variant === "secondary" ? theme.colors.primary : theme.colors.textOnPrimary} />
      ) : (
        <View style={styles.content}>
          {Icon ? <Icon size={size === "large" ? 22 : 18} color={labelColor} /> : null}
          <Text style={[styles.label, size === "large" && styles.largeLabel, { color: labelColor }]}>{label}</Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    paddingVertical: 14,
    paddingHorizontal: theme.spacing.lg,
    borderRadius: theme.radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  large: {
    paddingVertical: 17,
    borderRadius: theme.radius.lg,
    alignSelf: "stretch",
    // A soft lift so the main action stands apart from the cards around it.
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  content: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 },
  label: {
    fontFamily: theme.fonts.uiSemibold,
    fontSize: 16,
  },
  largeLabel: { fontSize: 18 },
  pressed: {
    opacity: 0.85,
  },
  disabled: {
    opacity: 0.5,
  },
});

const variantStyles: Record<Variant, ViewStyle> = {
  primary: { backgroundColor: theme.colors.primary },
  // Tinted background with a solid outline and dark text — clearly a button,
  // and readable (the previous white-on-peach was washed out).
  secondary: { backgroundColor: theme.colors.accent, borderWidth: 1.5, borderColor: theme.colors.primary },
  ghost: { backgroundColor: "transparent" },
  danger: { backgroundColor: theme.colors.danger },
};
