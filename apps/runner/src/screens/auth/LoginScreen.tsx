import { useCallback, useMemo, useState } from "react";
import { Text, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, Pressable, View, Image } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { getTheme } from "@gracerandly/theme";
import TextField from "../../components/TextField";
import Button from "../../components/Button";
import { useAuth } from "../../context/AuthContext";
import type { AuthStackParamList } from "../../navigation/types";

const theme = getTheme("light");

type Props = NativeStackScreenProps<AuthStackParamList, "Login">;

export default function LoginScreen({ navigation }: Props) {
  const { signIn, isLoading } = useAuth();

  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const phoneError = useMemo(() => {
    if (!submitted) return undefined;
    if (!/^\+[0-9]{7,15}$/.test(phone)) return "Enter a valid phone number, e.g. +2348012345678";
    return undefined;
  }, [phone, submitted]);

  const canSubmit = phone.length > 0 && password.length > 0 && !isLoading;

  const handleLogin = useCallback(async () => {
    setSubmitted(true);
    setFormError(null);
    if (!/^\+[0-9]{7,15}$/.test(phone) || !password) return;

    try {
      await signIn({ phone, password });
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Login failed");
    }
  }, [phone, password, signIn]);

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.flex}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Image source={require("../../../assets/brand-icon-badge.png")} style={styles.badge} resizeMode="contain" />
        <Text style={styles.title}>Gracerandly Runner</Text>
        <Text style={styles.subtitle}>Log in to see nearby errands</Text>

        <TextField
          label="Phone number"
          value={phone}
          onChangeText={setPhone}
          placeholder="+2348012345678"
          keyboardType="phone-pad"
          autoCapitalize="none"
          error={phoneError}
        />
        <TextField
          label="Password"
          value={password}
          onChangeText={setPassword}
          placeholder="Your password"
          secureTextEntry
          autoCapitalize="none"
          returnKeyType="done"
          onSubmitEditing={handleLogin}
        />

        {formError ? <Text style={styles.formError}>{formError}</Text> : null}

        <Button label={isLoading ? "Logging in…" : "Log in"} onPress={handleLogin} disabled={!canSubmit} />

        <View style={styles.footer}>
          <Text style={styles.footerText}>New runner? </Text>
          <Pressable onPress={() => navigation.navigate("Signup")} hitSlop={8}>
            <Text style={styles.footerLink}>Sign up</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: theme.colors.background },
  scroll: { flexGrow: 1, justifyContent: "center", padding: theme.spacing.lg },
  badge: { width: 64, height: 64, borderRadius: theme.radius.lg, alignSelf: "center", marginBottom: theme.spacing.md },
  title: {
    fontFamily: theme.fonts.display,
    fontSize: 24,
    color: theme.colors.primaryDark,
    textAlign: "center",
  },
  subtitle: {
    fontFamily: theme.fonts.ui,
    fontSize: 14,
    color: theme.colors.textMuted,
    textAlign: "center",
    marginBottom: theme.spacing.xl,
  },
  formError: {
    fontFamily: theme.fonts.uiMedium,
    fontSize: 13,
    color: theme.colors.danger,
    marginBottom: theme.spacing.sm,
  },
  footer: { flexDirection: "row", alignItems: "center", justifyContent: "center", marginTop: theme.spacing.lg },
  footerText: { fontFamily: theme.fonts.ui, color: theme.colors.textMuted },
  footerLink: { fontFamily: theme.fonts.uiSemibold, color: theme.colors.primary, textDecorationLine: "underline" },
});
