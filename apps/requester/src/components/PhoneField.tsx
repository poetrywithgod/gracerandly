import { useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  Modal,
  FlatList,
  StyleSheet,
  Animated,
  type TextInputProps,
} from "react-native";
import { ChevronDown, Search, X, Check } from "lucide-react-native";
import { allCountries, type Country } from "country-telephone-data";
import { getTheme } from "@gracerandly/theme";

const theme = getTheme("light");

export type { Country };

const DEFAULT_ISO2 = "ng"; // Gracerandly launches in Nigeria first.

export const DEFAULT_COUNTRY: Country =
  allCountries.find((c) => c.iso2 === DEFAULT_ISO2) ?? allCountries[0];

/** Converts an ISO 3166-1 alpha-2 code to its regional-indicator flag emoji. */
function flagEmoji(iso2: string): string {
  return iso2
    .toUpperCase()
    .replace(/./g, (char) => String.fromCodePoint(127397 + char.charCodeAt(0)));
}

interface PhoneFieldProps {
  /** Local number only (no dial code), digits as typed. */
  value: string;
  onChangeText: (digits: string) => void;
  country: Country;
  onChangeCountry: (country: Country) => void;
  error?: string;
  returnKeyType?: TextInputProps["returnKeyType"];
  onSubmitEditing?: () => void;
}

export default function PhoneField({
  value,
  onChangeText,
  country,
  onChangeCountry,
  error,
  returnKeyType,
  onSubmitEditing,
}: PhoneFieldProps) {
  const [isFocused, setIsFocused] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState("");
  const anim = useRef(new Animated.Value(value ? 1 : 0)).current;

  const handleFocus = () => {
    setIsFocused(true);
    Animated.timing(anim, { toValue: 1, duration: 160, useNativeDriver: false }).start();
  };

  const handleBlur = () => {
    setIsFocused(false);
    if (!value) {
      Animated.timing(anim, { toValue: 0, duration: 160, useNativeDriver: false }).start();
    }
  };

  const labelTop = anim.interpolate({ inputRange: [0, 1], outputRange: [18, -10] });
  const labelFontSize = anim.interpolate({ inputRange: [0, 1], outputRange: [16, 12] });

  const filteredCountries = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return allCountries;
    return allCountries.filter(
      (c) => c.name.toLowerCase().includes(query) || c.dialCode.includes(query)
    );
  }, [search]);

  const openPicker = () => {
    setSearch("");
    setPickerOpen(true);
  };

  return (
    <View style={styles.wrapper}>
      <View
        style={[
          styles.inputContainer,
          isFocused && styles.inputContainerFocused,
          !!error && styles.inputContainerError,
        ]}
      >
        <Pressable
          onPress={openPicker}
          style={styles.countryButton}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={`Country code, currently ${country.name}`}
        >
          <Text style={styles.flag}>{flagEmoji(country.iso2)}</Text>
          <Text style={styles.dialCode}>+{country.dialCode}</Text>
          <ChevronDown size={14} color="rgba(255,255,255,0.85)" />
        </Pressable>

        <View style={styles.divider} />

        <View style={styles.numberField}>
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
            Phone number
          </Animated.Text>
          <TextInput
            value={value}
            onChangeText={(text) => onChangeText(text.replace(/[^0-9]/g, ""))}
            onFocus={handleFocus}
            onBlur={handleBlur}
            keyboardType="phone-pad"
            returnKeyType={returnKeyType}
            onSubmitEditing={onSubmitEditing}
            style={styles.input}
            placeholderTextColor="transparent"
            selectionColor={theme.colors.accent}
          />
        </View>
      </View>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <Modal visible={pickerOpen} animationType="slide" transparent onRequestClose={() => setPickerOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setPickerOpen(false)} />
        <View style={styles.sheet}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>Choose a country</Text>
            <Pressable onPress={() => setPickerOpen(false)} hitSlop={8} accessibilityLabel="Close">
              <X size={20} color={theme.colors.textMuted} />
            </Pressable>
          </View>

          <View style={styles.searchRow}>
            <Search size={16} color={theme.colors.textMuted} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search country or code"
              placeholderTextColor={theme.colors.textMuted}
              style={styles.searchInput}
              autoFocus
            />
          </View>

          <FlatList
            data={filteredCountries}
            keyExtractor={(item, index) => `${item.iso2}-${item.dialCode}-${index}`}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => {
              const selected = item.iso2 === country.iso2 && item.dialCode === country.dialCode;
              return (
                <Pressable
                  style={styles.countryRow}
                  onPress={() => {
                    onChangeCountry(item);
                    setPickerOpen(false);
                  }}
                >
                  <Text style={styles.rowFlag}>{flagEmoji(item.iso2)}</Text>
                  <Text style={styles.rowName} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={styles.rowDialCode}>+{item.dialCode}</Text>
                  {selected ? <Check size={16} color={theme.colors.primary} /> : null}
                </Pressable>
              );
            }}
          />
        </View>
      </Modal>
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
  },
  inputContainerFocused: {
    borderColor: theme.colors.accent,
    backgroundColor: "rgba(255,255,255,0.32)",
  },
  inputContainerError: {
    borderColor: "#FFB4A8",
  },
  countryButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 18,
    paddingRight: theme.spacing.sm,
  },
  flag: { fontSize: 18 },
  dialCode: {
    fontFamily: theme.fonts.uiMedium,
    fontSize: 15,
    color: theme.colors.textOnPrimary,
  },
  divider: {
    width: 1.5,
    alignSelf: "stretch",
    marginVertical: 12,
    backgroundColor: "rgba(255,255,255,0.35)",
  },
  numberField: {
    flex: 1,
    paddingLeft: theme.spacing.sm,
    paddingTop: 22,
    paddingBottom: 12,
  },
  label: {
    position: "absolute",
    left: theme.spacing.sm,
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

  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  sheet: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: theme.radius.lg,
    borderTopRightRadius: theme.radius.lg,
    maxHeight: "75%",
    paddingTop: theme.spacing.md,
    paddingBottom: theme.spacing.lg,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: theme.spacing.lg,
    marginBottom: theme.spacing.sm,
  },
  sheetTitle: {
    fontFamily: theme.fonts.uiSemibold,
    fontSize: 16,
    color: theme.colors.text,
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: theme.spacing.lg,
    marginBottom: theme.spacing.sm,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 10,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.background,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  searchInput: {
    flex: 1,
    fontFamily: theme.fonts.ui,
    fontSize: 15,
    color: theme.colors.text,
    padding: 0,
  },
  countryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: 12,
  },
  rowFlag: { fontSize: 20 },
  rowName: {
    flex: 1,
    fontFamily: theme.fonts.uiMedium,
    fontSize: 15,
    color: theme.colors.text,
  },
  rowDialCode: {
    fontFamily: theme.fonts.ui,
    fontSize: 14,
    color: theme.colors.textMuted,
  },
});
