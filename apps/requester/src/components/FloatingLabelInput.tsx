import { useRef, useState } from "react";
import { View, TextInput, Animated, StyleSheet, TextInputProps, Text } from "react-native";
import { getTheme } from "@gracerandly/theme";

const theme = getTheme("light");

interface FloatingLabelInputProps extends TextInputProps {
  label: string;
  error?: string;
}

export default function FloatingLabelInput({
  label,
  value,
  error,
  onFocus,
  onBlur,
  style,
  ...rest
}: FloatingLabelInputProps) {
  const [isFocused, setIsFocused] = useState(false);
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
          style={[styles.input, style]}
          placeholderTextColor="transparent"
          selectionColor={theme.colors.accent}
          {...rest}
        />
      </View>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { marginBottom: theme.spacing.md },
  inputContainer: {
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
    fontFamily: theme.fonts.uiMedium,
    fontSize: 16,
    color: theme.colors.textOnPrimary,
    padding: 0,
    margin: 0,
  },
  errorText: {
    fontFamily: theme.fonts.ui,
    fontSize: 12,
    color: "#FFB4A8",
    marginTop: 4,
    marginLeft: 4,
  },
});
