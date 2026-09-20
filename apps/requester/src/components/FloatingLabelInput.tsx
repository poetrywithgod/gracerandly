import { useRef, useState } from "react";
import { View, TextInput, Animated, StyleSheet, TextInputProps, Text, Pressable } from "react-native";
import { Eye, EyeOff } from "lucide-react-native";
import { getTheme } from "@gracerandly/theme";

const theme = getTheme("light");

interface FloatingLabelInputProps extends TextInputProps {
  label: string;
  error?: string;
  /**
   * Renders a reveal/hide eye icon and manages the masking state itself.
   * Use this instead of passing `secureTextEntry` directly for password
   * fields — any `secureTextEntry` passed alongside it is ignored.
   */
  isPassword?: boolean;
}

export default function FloatingLabelInput({
  label,
  value,
  error,
  onFocus,
  onBlur,
  style,
  isPassword,
  secureTextEntry,
  ...rest
}: FloatingLabelInputProps) {
  const [isFocused, setIsFocused] = useState(false);
  const [isRevealed, setIsRevealed] = useState(false);
  const anim = useRef(new Animated.Value(value ? 1 : 0)).current;

  const handleFocus: TextInputProps["onFocus"] = (e) => {
    setIsFocused(true);
    Animated.timing(anim, { toValue: 1, duration: 160, useNativeDriver: false }).start();
    onFocus?.(e);
  };

  const handleBlur: TextInputProps["onBlur"] = (e) => {
    setIsFocused(false);
    if (!value) {
      Animated.timing(anim, { toValue: 0, duration: 160, useNativeDriver: false }).start();
    }
    onBlur?.(e);
  };

  const labelTop = anim.interpolate({ inputRange: [0, 1], outputRange: [18, -10] });
  const labelFontSize = anim.interpolate({ inputRange: [0, 1], outputRange: [16, 12] });

  const iconColor = isFocused ? theme.colors.accent : "rgba(255,255,255,0.7)";

  return (
    <View style={styles.wrapper}>
      <View
        style={[
          styles.inputContainer,
          isFocused && styles.inputContainerFocused,
          !!error && styles.inputContainerError,
        ]}
      >
        <Animated.Text
          pointerEvents="none"
          style={[
            styles.label,
            {
              top: labelTop,
              fontSize: labelFontSize,
              color: isFocused ? theme.colors.accent : "rgba(255,255,255,0.88)",
            },
          ]}
        >
          {label}
        </Animated.Text>
        <TextInput
          value={value}
          onFocus={handleFocus}
          onBlur={handleBlur}
          secureTextEntry={isPassword ? !isRevealed : secureTextEntry}
          style={[styles.input, isPassword && styles.inputWithIcon, style]}
          placeholderTextColor="transparent"
          selectionColor={theme.colors.accent}
          {...rest}
        />
        {isPassword ? (
          <Pressable
            onPress={() => setIsRevealed((prev) => !prev)}
            hitSlop={12}
            style={styles.eyeButton}
            accessibilityRole="button"
            accessibilityLabel={isRevealed ? "Hide password" : "Show password"}
          >
            {isRevealed ? (
              <EyeOff size={20} color={iconColor} />
            ) : (
              <Eye size={20} color={iconColor} />
            )}
          </Pressable>
        ) : null}
      </View>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { marginBottom: theme.spacing.md },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.5)",
    borderRadius: theme.radius.md,
    backgroundColor: "rgba(255,255,255,0.22)",
    paddingHorizontal: theme.spacing.md,
    paddingTop: 22,
    paddingBottom: 12,
  },
  inputContainerFocused: {
    borderColor: theme.colors.accent,
    backgroundColor: "rgba(255,255,255,0.32)",
  },
  inputContainerError: {
    borderColor: "#FFB4A8",
  },
  label: {
    position: "absolute",
    left: theme.spacing.md,
    fontFamily: theme.fonts.ui,
  },
  input: {
    flex: 1,
    fontFamily: theme.fonts.uiMedium,
    fontSize: 16,
    color: theme.colors.textOnPrimary,
    padding: 0,
    margin: 0,
  },
  inputWithIcon: {
    marginRight: theme.spacing.sm,
  },
  eyeButton: {
    padding: 2,
  },
  errorText: {
    fontFamily: theme.fonts.ui,
    fontSize: 12,
    color: "#FFB4A8",
    marginTop: 4,
    marginLeft: 4,
  },
});
