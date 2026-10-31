// Identical in apps/requester and apps/runner (see GlassCard.tsx's header
// comment for why components are duplicated rather than shared).
//
// The two "I agree" boxes at signup. The words "Terms and Conditions" and
// "Privacy Policy" open the full text (served by the API at /legal/...) in the
// phone's browser, so people can read before they tick. The account can't be
// created until both are ticked, and the server checks it again.
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { Check } from "lucide-react-native";
import { getTheme } from "@gracerandly/theme";
import { API_BASE_URL } from "../lib/apiClient";

const theme = getTheme("light");

interface Props {
  acceptedTerms: boolean;
  acceptedPrivacy: boolean;
  onChangeTerms: (value: boolean) => void;
  onChangePrivacy: (value: boolean) => void;
}

function open(path: string) {
  void Linking.openURL(`${API_BASE_URL}/legal/${path}`).catch(() => undefined);
}

function Row({ checked, onToggle, children, label }: { checked: boolean; onToggle: () => void; children: React.ReactNode; label: string }) {
  return (
    <View style={styles.row}>
      <Pressable
        onPress={onToggle}
        hitSlop={8}
        accessibilityRole="checkbox"
        accessibilityState={{ checked }}
        accessibilityLabel={label}
        style={[styles.box, checked && styles.boxChecked]}
      >
        {checked ? <Check size={14} color={theme.colors.primaryDark} strokeWidth={3} /> : null}
      </Pressable>
      <Text style={styles.text}>{children}</Text>
    </View>
  );
}

export default function LegalConsent({ acceptedTerms, acceptedPrivacy, onChangeTerms, onChangePrivacy }: Props) {
  return (
    <View style={styles.wrap}>
      <Row checked={acceptedTerms} onToggle={() => onChangeTerms(!acceptedTerms)} label="I agree to the Terms and Conditions">
        I agree to the{" "}
        <Text style={styles.link} onPress={() => open("terms")} accessibilityRole="link">
          Terms and Conditions
        </Text>
      </Row>
      <Row checked={acceptedPrivacy} onToggle={() => onChangePrivacy(!acceptedPrivacy)} label="I agree to the Privacy Policy">
        I have read and agree to the{" "}
        <Text style={styles.link} onPress={() => open("privacy")} accessibilityRole="link">
          Privacy Policy
        </Text>
      </Row>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: theme.spacing.xs, marginBottom: theme.spacing.xs, gap: theme.spacing.sm },
  row: { flexDirection: "row", alignItems: "flex-start", gap: theme.spacing.sm },
  box: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.7)",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  boxChecked: { backgroundColor: theme.colors.textOnPrimary, borderColor: theme.colors.textOnPrimary },
  text: { flex: 1, fontFamily: theme.fonts.ui, fontSize: 13, lineHeight: 19, color: "rgba(255,255,255,0.88)" },
  link: { fontFamily: theme.fonts.uiSemibold, color: theme.colors.textOnPrimary, textDecorationLine: "underline" },
});
