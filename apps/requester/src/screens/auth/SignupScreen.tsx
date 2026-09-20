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
import { useAuth } from "../../context/AuthContext";
import type { AuthStackParamList } from "../../navigation/types";

const theme = getTheme("light");

type Props = NativeStackScreenProps<AuthStackParamList, "Signup">;

const PHONE_REGEX = /^\+?[0-9]{7,15}$/;

/** Deep, saturated gradient stops for a richer backdrop. */
const GRADIENT_COLORS = [
  theme.colors.primaryDark,
  theme.colors.primary,
  theme.colors.primaryDark,
] as const;

const GRADIENT_LOCATIONS = [0, 0.55, 1] as const;

export default function SignupScreen({ navigation }: Props) {
  const { signUp, isLoading } = useAuth();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

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
    phone.trim().length > 0 && password.length > 0 && !isLoading;

  const handleSignup = useCallback(async () => {
    setSubmitted(true);
    setFormError(null);
    if (!PHONE_REGEX.test(phone.trim()) || password.length < 6) return;

    try {
      await signUp({ phone: phone.trim(), password });
      // On success, AuthContext flips isAuthenticated and RootNavigator
      // swaps to MainNavigator automatically — nothing to navigate here.
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Sign up failed");
    }
  }, [phone, password, signUp]);

  const handleGoToLogin = useCallback(() => {
    navigation.navigate("Login");
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
          <AuthHeader heading="Create your account" />

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
              autoComplete="password-new"
              textContentType="newPassword"
              returnKeyType="done"
              onSubmitEditing={handleSignup}
              error={passwordError}
            />

            {formError ? <Text style={styles.formError}>{formError}</Text> : null}

            <Button
              label={isLoading ? "Creating account…" : "Sign up"}
              onPress={handleSignup}
              disabled={!canSubmit}
              style={styles.signupButton}
            />
          </GlassCard>

          <View style={styles.footer}>
            <Text style={styles.footerText}>Already have an account? </Text>
            <Pressable
              onPress={handleGoToLogin}
              hitSlop={8}
              accessibilityRole="link"
              accessibilityLabel="Go to log in"
            >
              <Text style={styles.footerLink}>Log in</Text>
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

  formError: {
    fontFamily: theme.fonts.uiMedium,
    fontSize: 13,
    color: "#FFB4A8",
    marginBottom: theme.spacing.sm,
  },

  signupButton: {
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
