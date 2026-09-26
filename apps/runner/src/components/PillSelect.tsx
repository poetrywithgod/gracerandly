// Identical to apps/requester/src/components/PillSelect.tsx — see
// GlassCard.tsx's header comment for why it's duplicated rather than shared.
import { View, Pressable, Text, StyleSheet } from "react-native";
import { getTheme } from "@gracerandly/theme";

const theme = getTheme("light");

interface PillSelectProps<T extends string> {
  label: string;
  options: { value: T; label: string }[];
  value: T | null;
  onChange: (value: T) => void;
  error?: string;
  disabled?: boolean;
}

export default function PillSelect<T extends string>({
  label,
  options,
  value,
  onChange,
  error,
  disabled = false,
}: PillSelectProps<T>) {
  return (
    <View style={styles.wrapper}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.row}>
        {options.map((opt) => {
          const selected = value === opt.value;
          return (
            <Pressable
              key={opt.value}
              onPress={() => onChange(opt.value)}
              disabled={disabled}
              style={[styles.pill, selected && styles.pillSelected, disabled && styles.pillDisabled]}
            >
              <Text style={[styles.pillText, selected && styles.pillTextSelected]}>
                {opt.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { marginBottom: theme.spacing.md },
  label: {
    fontFamily: theme.fonts.uiMedium,
    fontSize: 14,
    color: theme.colors.text,
    marginBottom: 8,
  },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  pill: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: theme.radius.pill,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  pillSelected: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  pillDisabled: {
    opacity: 0.5,
  },
  pillText: {
    fontFamily: theme.fonts.uiMedium,
    fontSize: 13,
    color: theme.colors.text,
  },
  pillTextSelected: {
    color: theme.colors.textOnPrimary,
  },
  errorText: {
    fontFamily: theme.fonts.ui,
    fontSize: 12,
    color: theme.colors.danger,
    marginTop: 4,
  },
});
