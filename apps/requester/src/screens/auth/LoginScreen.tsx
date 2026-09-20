import { useState } from "react";
import { Text, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, Pressable } from "react-native";
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

export default function LoginScreen({ navigation }: Props) {
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");

  return (
    <LinearGradient
      colors={[theme.colors.primaryDark, theme.colors.primary]}
      style={styles.gradient}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <AuthHeader heading="Welcome back" />

          <GlassCard style={styles.card}>
            <FloatingLabelInput
              label="Phone number"
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              autoCapitalize="none"
            />
            <FloatingLabelInput
              label="Password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />
            <Pressable style={styles.forgot}>
              <Text style={styles.forgotText}>Forgot password?</Text>
            </Pressable>
            <Button label="Log in" onPress={() => {}} style={{ marginTop: theme.spacing.sm }} />
          </GlassCard>

          <Pressable style={styles.footer} onPress={() => navigation.navigate("Signup")}>
            <Text style={styles.footerText}>
              Don&apos;t have an account? <Text style={styles.footerLink}>Sign up</Text>
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: { flex: 1 },
  scroll: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: theme.spacing.lg,
  },
  card: { width: "100%" },
  forgot: { alignSelf: "flex-end", marginBottom: theme.spacing.sm },
  forgotText: { fontFamily: theme.fonts.ui, fontSize: 13, color: "rgba(255,255,255,0.8)" },
  footer: { marginTop: theme.spacing.lg },
  footerText: { fontFamily: theme.fonts.ui, color: "rgba(255,255,255,0.8)" },
  footerLink: {
    fontFamily: theme.fonts.uiSemibold,
    color: theme.colors.textOnPrimary,
    textDecorationLine: "underline",
  },
});
