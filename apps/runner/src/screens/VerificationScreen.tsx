// Settings-style page (plain background, TextField — same as
// ProfileScreen), not the auth gradient/glass look: this isn't part of
// signing in, it's a form the runner fills in from Settings whenever
// they're ready. See routes/runners.ts's PATCH /me/verification and its
// "self-serve auto-verify for now" comment for what happens server-side.
import { useCallback, useMemo, useState } from "react";
import { View, Text, StyleSheet, ScrollView } from "react-native";
import { ShieldCheck } from "lucide-react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { getTheme } from "@gracerandly/theme";
import TextField from "../components/TextField";
import Button from "../components/Button";
import { useAuth } from "../context/AuthContext";
import { ApiError } from "../lib/apiClient";
import type { MainStackParamList } from "../navigation/types";

const theme = getTheme("light");

type Props = NativeStackScreenProps<MainStackParamList, "Verification">;

export default function VerificationScreen({ navigation }: Props) {
  const { user, submitVerification, isLoading } = useAuth();

  const [nin, setNin] = useState("");
  const [bvn, setBvn] = useState("");
  const [guarantorName, setGuarantorName] = useState("");
  const [guarantorPhone, setGuarantorPhone] = useState("");
  const [guarantorRelationship, setGuarantorRelationship] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const canSubmit = useMemo(
    () =>
      /^\d{11}$/.test(nin) &&
      /^\d{11}$/.test(bvn) &&
      guarantorName.trim().length > 1 &&
      /^\+[0-9]{7,15}$/.test(guarantorPhone) &&
      guarantorRelationship.trim().length > 1 &&
      !isLoading,
    [nin, bvn, guarantorName, guarantorPhone, guarantorRelationship, isLoading]
  );

  const handleSubmit = useCallback(async () => {
    setSubmitted(true);
    setFormError(null);
    if (!canSubmit) {
      setFormError("Fill in every field correctly, including your guarantor's details");
      return;
    }
    try {
      await submitVerification({
        nin,
        bvn,
        guarantor: {
          fullName: guarantorName.trim(),
          phone: guarantorPhone,
          relationship: guarantorRelationship.trim(),
        },
      });
      navigation.goBack();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Couldn't submit verification");
    }
  }, [canSubmit, submitVerification, nin, bvn, guarantorName, guarantorPhone, guarantorRelationship, navigation]);

  if (user?.identityVerified) {
    return (
      <View style={styles.verifiedContainer}>
        <ShieldCheck size={40} color={theme.colors.success} />
        <Text style={styles.verifiedTitle}>You&apos;re verified</Text>
        <Text style={styles.verifiedSubtitle}>
          Your identity has already been verified — you're all set to go online and accept errands.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Text style={styles.intro}>
        We verify every runner's identity before they can go online or accept errands. This only
        takes a minute.
      </Text>

      <Text style={styles.sectionLabel}>Identity verification</Text>
      <TextField
        label="NIN"
        value={nin}
        onChangeText={setNin}
        placeholder="11-digit National ID number"
        keyboardType="number-pad"
        maxLength={11}
      />
      <TextField
        label="BVN"
        value={bvn}
        onChangeText={setBvn}
        placeholder="11-digit Bank Verification Number"
        keyboardType="number-pad"
        maxLength={11}
      />

      <Text style={styles.sectionLabel}>Guarantor</Text>
      <TextField
        label="Guarantor's full name"
        value={guarantorName}
        onChangeText={setGuarantorName}
        placeholder="Someone who can vouch for you"
      />
      <TextField
        label="Guarantor's phone number"
        value={guarantorPhone}
        onChangeText={setGuarantorPhone}
        placeholder="+2348012345678"
        keyboardType="phone-pad"
        autoCapitalize="none"
      />
      <TextField
        label="Relationship to you"
        value={guarantorRelationship}
        onChangeText={setGuarantorRelationship}
        placeholder="e.g. Uncle, Former employer"
      />

      {submitted && formError ? <Text style={styles.formError}>{formError}</Text> : null}

      <Button
        label={isLoading ? "Submitting…" : "Submit for verification"}
        onPress={handleSubmit}
        disabled={isLoading}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: theme.spacing.lg, backgroundColor: theme.colors.background, flexGrow: 1 },
  intro: {
    fontFamily: theme.fonts.ui,
    fontSize: 14,
    color: theme.colors.textMuted,
    marginBottom: theme.spacing.lg,
    lineHeight: 20,
  },
  sectionLabel: {
    fontFamily: theme.fonts.uiSemibold,
    fontSize: 13,
    color: theme.colors.primary,
    textTransform: "uppercase",
    marginTop: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
  },
  formError: {
    fontFamily: theme.fonts.uiMedium,
    fontSize: 13,
    color: theme.colors.danger,
    marginBottom: theme.spacing.sm,
  },
  verifiedContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: theme.spacing.xl,
    backgroundColor: theme.colors.background,
    gap: theme.spacing.sm,
  },
  verifiedTitle: { fontFamily: theme.fonts.uiSemibold, fontSize: 18, color: theme.colors.text },
  verifiedSubtitle: {
    fontFamily: theme.fonts.ui,
    fontSize: 14,
    color: theme.colors.textMuted,
    textAlign: "center",
  },
});
