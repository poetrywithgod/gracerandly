import { Pressable, Text, StyleSheet, ViewStyle, ActivityIndicator } from "react-native";
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
}

export default function Button({ label, onPress, variant = "primary", style, disabled, loading }: ButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        variantStyles[variant],
        isDisabled && styles.disabled,
        pressed && !isDisabled && styles.pressed,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={variant === "ghost" ? theme.colors.primary : theme.colors.textOnPrimary} />
      ) : (
        <Text style={[styles.label, variant === "ghost" && { color: theme.colors.primary }]}>{label}</Text>
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
  label: {
    fontFamily: theme.fonts.uiSemibold,
    fontSize: 16,
    color: theme.colors.textOnPrimary,
  },
  pressed: {
    opacity: 0.85,
  },
  disabled: {
    opacity: 0.5,
  },
});

const variantStyles: Record<Variant, ViewStyle> = {
  primary: { backgroundColor: theme.colors.primary },
  secondary: { backgroundColor: theme.colors.accent },
  ghost: { backgroundColor: "transparent" },
  danger: { backgroundColor: theme.colors.danger },
};
