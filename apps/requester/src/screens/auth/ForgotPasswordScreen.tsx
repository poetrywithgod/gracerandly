import { useCallback, useMemo, useRef, useState } from "react";
import { Text, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, Pressable, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { BlurTargetView } from "expo-blur";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { getTheme } from "@gracerandly/theme";
import AuthHeader from "../../components/AuthHeader";
import GlassCard from "../../components/GlassCard";
import FloatingLabelInput from "../../components/FloatingLabelInput";
import PhoneField, { DEFAULT_COUNTRY, type Country } from "../../components/PhoneField";
import Button from "../../components/Button";
import { apiFetch } from "../../lib/apiClient";
import type { AuthStackParamList } from "../../navigation/types";

const theme = getTheme("light");

type Props = NativeStackScreenProps<AuthStackParamList, "ForgotPassword">;

const MIN_LOCAL_PHONE_DIGITS = 6;
const BASE = "/auth";
const GRADIENT_COLORS = [theme.colors.primaryDark, theme.colors.primary, theme.colors.primaryDark] as const;
const GRADIENT_LOCATIONS = [0, 0.55, 1] as const;

type Step = "phone" | "code" | "done";

/**
 * Forgot password in two steps on one screen: ask for a code by phone number
 * (it is texted, and emailed too if the account has an email), then enter the
 * code with a new password. The server gives the same answer whether or not the
 * number has an account, so this screen never says which.
 */
export default function ForgotPasswordScreen({ navigation }: Props) {
  const blurTargetRef = useRef<View | null>(null);
  const [step, setStep] = useState<Step>("phone");
  const [country, setCountry] = useState<Country>(DEFAULT_COUNTRY);
  const [localPhone, setLocalPhone] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const phone = `+${country.dialCode}${localPhone}`;

  const sendCode = useCallback(async () => {
    setError(null);
    setNotice(null);
    if (localPhone.length < MIN_LOCAL_PHONE_DIGITS) {
      setError("Enter a valid phone number");
      return;
    }
    setBusy(true);
    try {
      await apiFetch(`${BASE}/forgot-password`, { method: "POST", body: JSON.stringify({ phone }) });
      setStep("code");
      setNotice("If that number has an account, we've sent a 6-digit code. It works for 10 minutes.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't send the code");
    } finally {
      setBusy(false);
    }
  }, [localPhone, phone]);

  const passwordError = useMemo(() => {
    if (!password) return undefined;
    if (password.length < 6) return "Use at least 6 characters";
    if (confirm && confirm !== password) return "The two passwords don't match";
    return undefined;
  }, [password, confirm]);

  const canReset = code.length === 6 && password.length >= 6 && confirm === password && !busy;

  const resetPassword = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      await apiFetch(`${BASE}/reset-password`, { method: "POST", body: JSON.stringify({ phone, code, password }) });
      setStep("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't reset your password");
    } finally {
      setBusy(false);
    }
  }, [phone, code, password]);

  return (
    <View style={styles.gradient}>
      <BlurTargetView ref={blurTargetRef} style={StyleSheet.absoluteFill}>
        <LinearGradient colors={GRADIENT_COLORS} locations={GRADIENT_LOCATIONS} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
        <View pointerEvents="none" style={styles.blobTop} />
        <View pointerEvents="none" style={styles.blobBottom} />
      </BlurTargetView>

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <AuthHeader heading={step === "done" ? "Password changed" : "Reset your password"} />

          <GlassCard style={styles.card} blurTarget={blurTargetRef}>
            {step === "phone" ? (
              <>
                <Text style={styles.help}>Enter the phone number you signed up with and we&apos;ll send you a code.</Text>
                <PhoneField value={localPhone} onChangeText={setLocalPhone} country={country} onChangeCountry={setCountry} returnKeyType="done" />
                {error ? <Text style={styles.formError}>{error}</Text> : null}
                <Button label={busy ? "Sending…" : "Send code"} onPress={sendCode} disabled={busy || localPhone.length === 0} style={styles.button} />
              </>
            ) : null}

            {step === "code" ? (
              <>
                {notice ? <Text style={styles.help}>{notice}</Text> : null}
                <FloatingLabelInput label="6-digit code" value={code} onChangeText={(t) => setCode(t.replace(/[^0-9]/g, "").slice(0, 6))} keyboardType="number-pad" autoComplete="one-time-code" textContentType="oneTimeCode" />
                <FloatingLabelInput label="New password" value={password} onChangeText={setPassword} isPassword autoCapitalize="none" textContentType="newPassword" error={passwordError} />
                <FloatingLabelInput label="New password again" value={confirm} onChangeText={setConfirm} isPassword autoCapitalize="none" textContentType="newPassword" returnKeyType="done" onSubmitEditing={canReset ? resetPassword : undefined} />
                {error ? <Text style={styles.formError}>{error}</Text> : null}
                <Button label={busy ? "Saving…" : "Reset password"} onPress={resetPassword} disabled={!canReset} style={styles.button} />
                <Pressable onPress={sendCode} disabled={busy} hitSlop={8} accessibilityRole="link" accessibilityLabel="Send a new code" style={styles.again}>
                  <Text style={styles.linkText}>Send a new code</Text>
                </Pressable>
              </>
            ) : null}

            {step === "done" ? (
              <>
                <Text style={styles.help}>Your password has been changed. You can log in with the new one now.</Text>
                <Button label="Back to log in" onPress={() => navigation.navigate("Login")} style={styles.button} />
              </>
            ) : null}
          </GlassCard>

          {step !== "done" ? (
            <Pressable onPress={() => navigation.navigate("Login")} hitSlop={8} accessibilityRole="link" accessibilityLabel="Back to log in" style={styles.footer}>
              <Text style={styles.footerLink}>Back to log in</Text>
            </Pressable>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  gradient: { flex: 1 },
  blobTop: { position: "absolute", top: -80, right: -60, width: 260, height: 260, borderRadius: 130, backgroundColor: "rgba(255,255,255,0.10)" },
  blobBottom: { position: "absolute", bottom: -100, left: -80, width: 320, height: 320, borderRadius: 160, backgroundColor: "rgba(255,255,255,0.06)" },
  scroll: { flexGrow: 1, alignItems: "center", justifyContent: "center", padding: theme.spacing.lg },
  card: {
    width: "100%",
    backgroundColor: "rgba(20, 24, 40, 0.55)",
    borderColor: "rgba(255,255,255,0.18)",
    borderWidth: 1,
    shadowColor: "#000",
    shadowOpacity: 0.35,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 12,
  },
  help: { fontFamily: theme.fonts.ui, fontSize: 14, lineHeight: 20, color: "rgba(255,255,255,0.85)", marginBottom: theme.spacing.md },
  formError: { fontFamily: theme.fonts.uiMedium, fontSize: 13, color: "#FFB4A8", marginBottom: theme.spacing.sm },
  button: { marginTop: theme.spacing.sm },
  again: { alignSelf: "center", marginTop: theme.spacing.md },
  linkText: { fontFamily: theme.fonts.uiSemibold, fontSize: 13, color: theme.colors.textOnPrimary, textDecorationLine: "underline" },
  footer: { marginTop: theme.spacing.lg },
  footerLink: { fontFamily: theme.fonts.uiSemibold, color: theme.colors.textOnPrimary, textDecorationLine: "underline" },
});
