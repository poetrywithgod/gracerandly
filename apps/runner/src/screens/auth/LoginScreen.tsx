// Same gradient/glass structure as
// apps/requester/src/screens/auth/LoginScreen.tsx (see
// components/GlassCard.tsx's header comment for why it's duplicated
// rather than shared) — kept visually identical so switching between the
// two apps feels like one product.
import { useCallback, useMemo, useRef, useState } from "react";
import {
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Pressable,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { BlurTargetView } from "expo-blur";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { getTheme } from "@gracerandly/theme";
import AuthHeader from "../../components/AuthHeader";
import GlassCard from "../../components/GlassCard";
import FloatingLabelInput from "../../components/FloatingLabelInput";
import PhoneField, { DEFAULT_COUNTRY, type Country } from "../../components/PhoneField";
import Button from "../../components/Button";
import { useAuth } from "../../context/AuthContext";
import type { AuthStackParamList } from "../../navigation/types";

const theme = getTheme("light");

type Props = NativeStackScreenProps<AuthStackParamList, "Login">;

const MIN_LOCAL_PHONE_DIGITS = 6;

const GRADIENT_COLORS = [
  theme.colors.primaryDark,
  theme.colors.primary,
  theme.colors.primaryDark,
] as const;

const GRADIENT_LOCATIONS = [0, 0.55, 1] as const;

export default function LoginScreen({ navigation }: Props) {
  const { signIn, isLoading } = useAuth();
  const blurTargetRef = useRef<View | null>(null);

  const [country, setCountry] = useState<Country>(DEFAULT_COUNTRY);
  const [localPhone, setLocalPhone] = useState("");
  const [password, setPassword] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const phoneError = useMemo(() => {
    if (!submitted) return undefined;
    if (!localPhone) return "Phone number is required";
    if (localPhone.length < MIN_LOCAL_PHONE_DIGITS) return "Enter a valid phone number";
    return undefined;
  }, [localPhone, submitted]);

  const passwordError = useMemo(() => {
    if (!submitted) return undefined;
    if (!password) return "Password is required";
    return undefined;
  }, [password, submitted]);

  const canSubmit = localPhone.length > 0 && password.length > 0 && !isLoading;

  const handleLogin = useCallback(async () => {
    setSubmitted(true);
    setFormError(null);
    if (localPhone.length < MIN_LOCAL_PHONE_DIGITS || !password) return;

    try {
      await signIn({ phone: `+${country.dialCode}${localPhone}`, password });
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Login failed");
    }
  }, [localPhone, password, signIn, country]);

  const handleGoToSignup = useCallback(() => {
    navigation.navigate("Signup");
  }, [navigation]);

  return (
    <View style={styles.gradient}>
      <BlurTargetView ref={blurTargetRef} style={StyleSheet.absoluteFill}>
        <LinearGradient
          colors={GRADIENT_COLORS}
          locations={GRADIENT_LOCATIONS}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <View pointerEvents="none" style={styles.blobTop} />
        <View pointerEvents="none" style={styles.blobBottom} />
      </BlurTargetView>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <AuthHeader heading="Welcome back, Runner" />

          <GlassCard style={styles.card} blurTarget={blurTargetRef}>
            <PhoneField
              value={localPhone}
              onChangeText={setLocalPhone}
              country={country}
              onChangeCountry={setCountry}
              returnKeyType="next"
              error={phoneError}
            />

            <FloatingLabelInput
              label="Password"
              value={password}
              onChangeText={setPassword}
              isPassword
              autoCapitalize="none"
              autoComplete="password"
              textContentType="password"
              returnKeyType="done"
              onSubmitEditing={handleLogin}
              error={passwordError}
            />

            {formError ? <Text style={styles.formError}>{formError}</Text> : null}

            <Button
              label={isLoading ? "Logging in…" : "Log in"}
              onPress={handleLogin}
              disabled={!canSubmit}
              style={styles.loginButton}
            />
          </GlassCard>

          <View style={styles.footer}>
            <Text style={styles.footerText}>New runner? </Text>
            <Pressable
              onPress={handleGoToSignup}
              hitSlop={8}
              accessibilityRole="link"
              accessibilityLabel="Go to sign up"
            >
              <Text style={styles.footerLink}>Sign up</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  gradient: { flex: 1 },

  blobTop: {
    position: "absolute",
    top: -80,
    right: -60,
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: "rgba(255,255,255,0.10)",
  },
  blobBottom: {
    position: "absolute",
    bottom: -100,
    left: -80,
    width: 320,
    height: 320,
    borderRadius: 160,
    backgroundColor: "rgba(255,255,255,0.06)",
  },

  scroll: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: theme.spacing.lg,
  },

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

  formError: {
    fontFamily: theme.fonts.uiMedium,
    fontSize: 13,
    color: "#FFB4A8",
    marginBottom: theme.spacing.sm,
  },

  loginButton: {
    marginTop: theme.spacing.sm,
  },

  footer: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: theme.spacing.lg,
  },
  footerText: {
    fontFamily: theme.fonts.ui,
    color: "rgba(255,255,255,0.75)",
  },
  footerLink: {
    fontFamily: theme.fonts.uiSemibold,
    color: theme.colors.textOnPrimary,
    textDecorationLine: "underline",
  },
});
