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
import type { Gender } from "@gracerandly/shared-types";
import AuthHeader from "../../components/AuthHeader";
import GlassCard from "../../components/GlassCard";
import FloatingLabelInput from "../../components/FloatingLabelInput";
import PhoneField, { DEFAULT_COUNTRY, type Country } from "../../components/PhoneField";
import GenderSelect from "../../components/GenderSelect";
import Button from "../../components/Button";
import { useAuth } from "../../context/AuthContext";
import type { AuthStackParamList } from "../../navigation/types";

const theme = getTheme("light");

type Props = NativeStackScreenProps<AuthStackParamList, "Signup">;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_LOCAL_PHONE_DIGITS = 6;
const MIN_PASSWORD_LENGTH = 6;

/** Deep, saturated gradient stops for a richer backdrop. */
const GRADIENT_COLORS = [
  theme.colors.primaryDark,
  theme.colors.primary,
  theme.colors.primaryDark,
] as const;

const GRADIENT_LOCATIONS = [0, 0.55, 1] as const;

export default function SignupScreen({ navigation }: Props) {
  const { signUp, isLoading } = useAuth();
  const blurTargetRef = useRef<View | null>(null);

  const [fullName, setFullName] = useState("");
  const [country, setCountry] = useState<Country>(DEFAULT_COUNTRY);
  const [localPhone, setLocalPhone] = useState("");
  const [email, setEmail] = useState("");
  const [gender, setGender] = useState<Gender | null>(null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [submitted, setSubmitted] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const fullNameError = useMemo(() => {
    if (!submitted) return undefined;
    if (!fullName.trim()) return "Full name is required";
    if (fullName.trim().length < 2) return "Enter your full name";
    return undefined;
  }, [fullName, submitted]);

  const phoneError = useMemo(() => {
    if (!submitted) return undefined;
    if (!localPhone) return "Phone number is required";
    if (localPhone.length < MIN_LOCAL_PHONE_DIGITS) return "Enter a valid phone number";
    return undefined;
  }, [localPhone, submitted]);

  const emailError = useMemo(() => {
    if (!submitted) return undefined;
    if (!email.trim()) return undefined; // email is optional
    if (!EMAIL_REGEX.test(email.trim())) return "Enter a valid email address";
    return undefined;
  }, [email, submitted]);

  const genderError = useMemo(() => {
    if (!submitted) return undefined;
    if (!gender) return "Select a gender";
    return undefined;
  }, [gender, submitted]);

  const passwordError = useMemo(() => {
    if (!submitted) return undefined;
    if (!password) return "Password is required";
    if (password.length < MIN_PASSWORD_LENGTH)
      return `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
    return undefined;
  }, [password, submitted]);

  const confirmPasswordError = useMemo(() => {
    if (!submitted) return undefined;
    if (!confirmPassword) return "Confirm your password";
    if (confirmPassword !== password) return "Passwords don't match";
    return undefined;
  }, [confirmPassword, password, submitted]);

  const canSubmit =
    fullName.trim().length > 0 &&
    localPhone.length > 0 &&
    !!gender &&
    password.length > 0 &&
    confirmPassword.length > 0 &&
    !isLoading;

  const isFormValid = useCallback(() => {
    return (
      fullName.trim().length >= 2 &&
      localPhone.length >= MIN_LOCAL_PHONE_DIGITS &&
      (!email.trim() || EMAIL_REGEX.test(email.trim())) &&
      !!gender &&
      password.length >= MIN_PASSWORD_LENGTH &&
      confirmPassword === password
    );
  }, [fullName, localPhone, email, gender, password, confirmPassword]);

  const handleSignup = useCallback(async () => {
    setSubmitted(true);
    setFormError(null);
    if (!isFormValid() || !gender) return;

    try {
      await signUp({
        fullName: fullName.trim(),
        phone: `+${country.dialCode}${localPhone}`,
        email: email.trim() || undefined,
        password,
        gender,
      });
      // On success, AuthContext flips isAuthenticated and RootNavigator
      // swaps to MainNavigator automatically — nothing to navigate here.
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Sign up failed");
    }
  }, [isFormValid, signUp, fullName, country, localPhone, email, password, gender]);

  const handleGoToLogin = useCallback(() => {
    navigation.navigate("Login");
  }, [navigation]);

  return (
    <View style={styles.gradient}>
      {/*
        BlurTargetView wraps everything GlassCard's frosted-glass effect
        should show through. On Android (Expo SDK 57+), BlurView only
        produces a real blur when pointed at an explicit target via a ref —
        without this it silently falls back to a flat tinted box.
      */}
      <BlurTargetView ref={blurTargetRef} style={StyleSheet.absoluteFill}>
        <LinearGradient
          colors={GRADIENT_COLORS}
          locations={GRADIENT_LOCATIONS}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        {/* Soft decorative blobs add depth behind the glass card */}
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
          <AuthHeader heading="Create your account" />

          <GlassCard style={styles.card} blurTarget={blurTargetRef}>
            <FloatingLabelInput
              label="Full name"
              value={fullName}
              onChangeText={setFullName}
              autoCapitalize="words"
              autoComplete="name"
              textContentType="name"
              returnKeyType="next"
              error={fullNameError}
            />

            <PhoneField
              value={localPhone}
              onChangeText={setLocalPhone}
              country={country}
              onChangeCountry={setCountry}
              returnKeyType="next"
              error={phoneError}
            />

            <FloatingLabelInput
              label="Email (optional)"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              textContentType="emailAddress"
              returnKeyType="next"
              error={emailError}
            />

            <GenderSelect value={gender} onChange={setGender} />
            {genderError ? <Text style={styles.genderError}>{genderError}</Text> : null}

            <FloatingLabelInput
              label="Password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
              autoComplete="password-new"
              textContentType="newPassword"
              returnKeyType="next"
              error={passwordError}
            />

            <FloatingLabelInput
              label="Confirm password"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry
              autoCapitalize="none"
              autoComplete="password-new"
              textContentType="newPassword"
              returnKeyType="done"
              onSubmitEditing={handleSignup}
              error={confirmPasswordError}
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
    </View>
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

  genderError: {
    fontFamily: theme.fonts.ui,
    fontSize: 12,
    color: "#FFB4A8",
    marginTop: -theme.spacing.sm,
    marginBottom: theme.spacing.md,
    marginLeft: 4,
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
