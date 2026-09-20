import { View, Pressable, Text, StyleSheet } from "react-native";
import { getTheme } from "@gracerandly/theme";
import type { Gender } from "@gracerandly/shared-types";

const theme = getTheme("light");

const OPTIONS: { value: Gender; label: string }[] = [
  { value: "female", label: "Female" },
  { value: "male", label: "Male" },
  { value: "unspecified", label: "Prefer not to say" },
];

interface GenderSelectProps {
  value: Gender | null;
  onChange: (value: Gender) => void;
}

export default function GenderSelect({ value, onChange }: GenderSelectProps) {
  return (
    <View style={styles.wrapper}>
      <Text style={styles.label}>Gender</Text>
      <View style={styles.row}>
        {OPTIONS.map((opt) => {
          const selected = value === opt.value;
          return (
            <Pressable
              key={opt.value}
              onPress={() => onChange(opt.value)}
              style={[styles.pill, selected && styles.pillSelected]}
            >
              <Text style={[styles.pillText, selected && styles.pillTextSelected]}>
                {opt.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { marginBottom: theme.spacing.md },
  label: {
    fontFamily: theme.fonts.ui,
    fontSize: 13,
    color: "rgba(255,255,255,0.85)",
    marginBottom: 8,
    marginLeft: 4,
  },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  pill: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: theme.radius.pill,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.5)",
    backgroundColor: "rgba(255,255,255,0.18)",
  },
  pillSelected: {
    backgroundColor: theme.colors.accent,
    borderColor: theme.colors.accent,
  },
  pillText: {
    fontFamily: theme.fonts.uiMedium,
    fontSize: 13,
    color: "rgba(255,255,255,0.9)",
  },
  pillTextSelected: {
    color: theme.colors.primaryDark,
  },
});
