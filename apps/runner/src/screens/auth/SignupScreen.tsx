import { useCallback, useState } from "react";
import { Text, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, Pressable, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { getTheme } from "@gracerandly/theme";
import TextField from "../../components/TextField";
import Button from "../../components/Button";
import { useAuth } from "../../context/AuthContext";
import type { AuthStackParamList } from "../../navigation/types";

const theme = getTheme("light");

type Props = NativeStackScreenProps<AuthStackParamList, "Signup">;

export default function SignupScreen({ navigation }: Props) {
  const { signUp, isLoading } = useAuth();

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nin, setNin] = useState("");
  const [bvn, setBvn] = useState("");
  const [guarantorName, setGuarantorName] = useState("");
  const [guarantorPhone, setGuarantorPhone] = useState("");
  const [guarantorRelationship, setGuarantorRelationship] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  // PRD 6.1: identity verification via NIN/BVN plus a guarantor is
  // required at signup — every field below is on the Runner path only
  // (the Requester app has no equivalent).
  const canSubmit =
    fullName.trim().length > 1 &&
    /^\+[0-9]{7,15}$/.test(phone) &&
    password.length >= 6 &&
    /^\d{11}$/.test(nin) &&
    /^\d{11}$/.test(bvn) &&
    guarantorName.trim().length > 1 &&
    /^\+[0-9]{7,15}$/.test(guarantorPhone) &&
    guarantorRelationship.trim().length > 1 &&
    !isLoading;

  const handleSignup = useCallback(async () => {
    setFormError(null);
    if (!canSubmit) {
      setFormError("Fill in every field correctly, including your guarantor's details");
      return;
    }
    try {
      await signUp({
        fullName: fullName.trim(),
        phone,
        email: email.trim() || undefined,
        password,
        nin,
        bvn,
        guarantor: {
          fullName: guarantorName.trim(),
          phone: guarantorPhone,
          relationship: guarantorRelationship.trim(),
        },
      });
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Signup failed");
    }
  }, [canSubmit, signUp, fullName, phone, email, password, nin, bvn, guarantorName, guarantorPhone, guarantorRelationship]);

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.flex}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Become a Runner</Text>
        <Text style={styles.subtitle}>We verify every runner's identity before they can accept errands.</Text>

        <TextField label="Full name" value={fullName} onChangeText={setFullName} placeholder="Your full name" />
        <TextField label="Phone number" value={phone} onChangeText={setPhone} placeholder="+2348012345678" keyboardType="phone-pad" autoCapitalize="none" />
        <TextField label="Email (optional)" value={email} onChangeText={setEmail} placeholder="you@example.com" keyboardType="email-address" autoCapitalize="none" />
        <TextField label="Password" value={password} onChangeText={setPassword} placeholder="At least 6 characters" secureTextEntry autoCapitalize="none" />

        <Text style={styles.sectionLabel}>Identity verification</Text>
        <TextField label="NIN" value={nin} onChangeText={setNin} placeholder="11-digit National ID number" keyboardType="number-pad" maxLength={11} />
        <TextField label="BVN" value={bvn} onChangeText={setBvn} placeholder="11-digit Bank Verification Number" keyboardType="number-pad" maxLength={11} />

        <Text style={styles.sectionLabel}>Guarantor</Text>
        <TextField label="Guarantor's full name" value={guarantorName} onChangeText={setGuarantorName} placeholder="Someone who can vouch for you" />
        <TextField label="Guarantor's phone number" value={guarantorPhone} onChangeText={setGuarantorPhone} placeholder="+2348012345678" keyboardType="phone-pad" autoCapitalize="none" />
        <TextField label="Relationship to you" value={guarantorRelationship} onChangeText={setGuarantorRelationship} placeholder="e.g. Uncle, Former employer" />

        {formError ? <Text style={styles.formError}>{formError}</Text> : null}

        <Button label={isLoading ? "Creating account…" : "Sign up"} onPress={handleSignup} disabled={isLoading} />

        <View style={styles.footer}>
          <Text style={styles.footerText}>Already a runner? </Text>
          <Pressable onPress={() => navigation.navigate("Login")} hitSlop={8}>
            <Text style={styles.footerLink}>Log in</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: theme.colors.background },
  scroll: { flexGrow: 1, padding: theme.spacing.lg, paddingTop: theme.spacing.xxl },
  title: { fontFamily: theme.fonts.display, fontSize: 24, color: theme.colors.primaryDark },
  subtitle: { fontFamily: theme.fonts.ui, fontSize: 14, color: theme.colors.textMuted, marginBottom: theme.spacing.lg },
  sectionLabel: {
    fontFamily: theme.fonts.uiSemibold,
    fontSize: 13,
    color: theme.colors.primary,
    textTransform: "uppercase",
    marginTop: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
  },
  formError: { fontFamily: theme.fonts.uiMedium, fontSize: 13, color: theme.colors.danger, marginBottom: theme.spacing.sm },
  footer: { flexDirection: "row", alignItems: "center", justifyContent: "center", marginTop: theme.spacing.lg, marginBottom: theme.spacing.xl },
  footerText: { fontFamily: theme.fonts.ui, color: theme.colors.textMuted },
  footerLink: { fontFamily: theme.fonts.uiSemibold, color: theme.colors.primary, textDecorationLine: "underline" },
});
