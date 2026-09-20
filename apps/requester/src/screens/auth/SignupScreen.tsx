import { useCallback, useMemo, useState } from "react";
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
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { getTheme } from "@gracerandly/theme";
import AuthHeader from "../../components/AuthHeader";
import GlassCard from "../../components/GlassCard";
import FloatingLabelInput from "../../components/FloatingLabelInput";
import Button from "../../components/Button";
import type { AuthStackParamList } from "../../navigation/types";

const theme = getTheme("light");

type Props = NativeStackScreenProps<AuthStackParamList, "Login">;

const PHONE_REGEX = /^\+?[0-9]{7,15}$/;

/** Deep, saturated gradient stops for a richer backdrop. */
const GRADIENT_COLORS = [
  theme.colors.primaryDark,
  theme.colors.primary,
  theme.colors.primaryDark,
] as const;

const GRADIENT_LOCATIONS = [0, 0.55, 1] as const;

export default function LoginScreen({ navigation }: Props) {
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const phoneError = useMemo(() => {
    if (!submitted) return undefined;
    if (!phone.trim()) return "Phone number is required";
    if (!PHONE_REGEX.test(phone.trim())) return "Enter a valid phone number";
    return undefined;
  }, [phone, submitted]);

  const passwordError = useMemo(() => {
    if (!submitted) return undefined;
    if (!password) return "Password is required";
    if (password.length < 6) return "Password must be at least 6 characters";
    return undefined;
  }, [password, submitted]);

  const canSubmit =
    phone.trim().length > 0 && password.length > 0 && !isSubmitting;

  const handleLogin = useCallback(async () => {
    setSubmitted(true);
    if (!PHONE_REGEX.test(phone.trim()) || password.length < 6) return;

    try {
      setIsSubmitting(true);
      // TODO: wire up actual login call
    } catch (err) {
      console.warn("Login failed", err);
    } finally {
      setIsSubmitting(false);
    }
  }, [phone, password]);

  const handleForgotPassword = useCallback(() => {
    // navigation.navigate("ForgotPassword");
  }, []);

  const handleGoToSignup = useCallback(() => {
    navigation.navigate("Signup");
  }, [navigation]);

  return (
    <LinearGradient
      colors={GRADIENT_COLORS}
      locations={GRADIENT_LOCATIONS}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.gradient}
    >
      {/* Soft decorative blobs add depth behind the glass card */}
      <View pointerEvents="none" style={styles.blobTop} />
      <View pointerEvents="none" style={styles.blobBottom} />

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <AuthHeader heading="Welcome back" />

          <GlassCard style={styles.card}>
            <FloatingLabelInput
              label="Phone number"
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              autoCapitalize="none"
              autoComplete="tel"
              textContentType="telephoneNumber"
              returnKeyType="next"
              error={phoneError}
            />
            <FloatingLabelInput
              label="Password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
              autoComplete="password"
              textContentType="password"
              returnKeyType="done"
              onSubmitEditing={handleLogin}
              error={passwordError}
            />

            <Pressable
              style={styles.forgot}
              onPress={handleForgotPassword}
              hitSlop={8}
              accessibilityRole="link"
              accessibilityLabel="Forgot password"
            >
              <Text style={styles.forgotText}>Forgot password?</Text>
            </Pressable>

            <Button
              label={isSubmitting ? "Logging in…" : "Log in"}
              onPress={handleLogin}
              disabled={!canSubmit}
              style={styles.loginButton}
            />
          </GlassCard>

          <View style={styles.footer}>
            <Text style={styles.footerText}>Don&apos;t have an account? </Text>
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
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  gradient: { flex: 1 },

  // Decorative blurred circles behind the card — creates that "lit from within" look
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
    // Override GlassCard defaults so it feels darker and more contrasty
    backgroundColor: "rgba(20, 24, 40, 0.55)",
    borderColor: "rgba(255,255,255,0.18)",
    borderWidth: 1,
    // Deep shadow lifts it off the gradient
    shadowColor: "#000",
    shadowOpacity: 0.35,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 12,
  },

  forgot: {
    alignSelf: "flex-end",
    marginBottom: theme.spacing.sm,
  },
  forgotText: {
    fontFamily: theme.fonts.uiSemibold,
    fontSize: 13,
    color: theme.colors.textOnPrimary, // crisp white, not 0.8 alpha
    opacity: 0.95,
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