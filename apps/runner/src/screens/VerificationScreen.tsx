// Settings-style page (plain background, TextField — same as
// ProfileScreen), not the auth gradient/glass look: this isn't part of
// signing in, it's a form the runner fills in from Settings whenever
// they're ready. See routes/runners.ts's PATCH /me/verification and its
// "self-serve auto-verify for now" comment for what happens server-side.
import { useCallback, useRef, useState } from "react";
import { View, Text, StyleSheet, ScrollView, type LayoutChangeEvent } from "react-native";
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

type FieldKey = "nin" | "bvn" | "guarantorName" | "guarantorPhone" | "guarantorRelationship";
type FieldErrors = Partial<Record<FieldKey, string>>;

// Top-to-bottom, so "first error" means the one highest on the screen.
const FIELD_ORDER: FieldKey[] = ["nin", "bvn", "guarantorName", "guarantorPhone", "guarantorRelationship"];

// Server-side path -> the input it belongs to (see errorHandler's `fields`).
const SERVER_FIELD_MAP: Record<string, FieldKey> = {
  nin: "nin",
  bvn: "bvn",
  "guarantor.fullName": "guarantorName",
  "guarantor.phone": "guarantorPhone",
  "guarantor.relationship": "guarantorRelationship",
};

// People type Nigerian numbers the way they dial them (08012345678). Accept
// that, plus 234… and +234…, and send the server the +234 form it expects.
// Anything else is returned as typed so validation can reject it.
function normalizeNigerianPhone(value: string): string {
  const compact = value.replace(/[\s-]/g, "");
  if (/^0\d{10}$/.test(compact)) return `+234${compact.slice(1)}`;
  if (/^234\d{10}$/.test(compact)) return `+${compact}`;
  return compact;
}

// NIN/BVN are only format-checked (11 digits) — nothing is verified against
// NIMC or a bank yet, so placeholder numbers are fine while testing.
function validate(values: Record<FieldKey, string>): FieldErrors {
  const errors: FieldErrors = {};
  if (!/^\d{11}$/.test(values.nin.trim())) errors.nin = "NIN must be exactly 11 digits";
  if (!/^\d{11}$/.test(values.bvn.trim())) errors.bvn = "BVN must be exactly 11 digits";
  if (values.guarantorName.trim().length < 2) errors.guarantorName = "Enter your guarantor's full name";
  if (!/^\+[0-9]{7,15}$/.test(normalizeNigerianPhone(values.guarantorPhone))) {
    errors.guarantorPhone = "Enter a valid phone number, e.g. 08012345678";
  }
  if (values.guarantorRelationship.trim().length < 2) {
    errors.guarantorRelationship = "Say how this person knows you, e.g. Mom or Former employer";
  }
  return errors;
}

export default function VerificationScreen({ navigation }: Props) {
  const { user, submitVerification, isLoading } = useAuth();

  const [values, setValues] = useState<Record<FieldKey, string>>({
    nin: "",
    bvn: "",
    guarantorName: "",
    guarantorPhone: "",
    guarantorRelationship: "",
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  // Only start showing errors after the first submit attempt, so a field
  // isn't shouted at while the person is still typing it for the first time.
  const [hasTriedSubmit, setHasTriedSubmit] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const scrollRef = useRef<ScrollView>(null);
  const fieldY = useRef<Partial<Record<FieldKey, number>>>({});

  const trackLayout = (key: FieldKey) => (event: LayoutChangeEvent) => {
    fieldY.current[key] = event.nativeEvent.layout.y;
  };

  function scrollToFirstError(errs: FieldErrors) {
    const first = FIELD_ORDER.find((key) => errs[key]);
    const y = first ? fieldY.current[first] : undefined;
    if (y !== undefined) scrollRef.current?.scrollTo({ y: Math.max(0, y - 24), animated: true });
  }

  function setValue(key: FieldKey, next: string) {
    const updated = { ...values, [key]: next };
    setValues(updated);
    setFormError(null);
    // Once the person has tried to submit, re-check live so the red clears
    // the moment a field becomes valid.
    if (hasTriedSubmit) setErrors(validate(updated));
  }

  const handleSubmit = useCallback(async () => {
    setHasTriedSubmit(true);
    setFormError(null);

    const found = validate(values);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      scrollToFirstError(found);
      return;
    }

    try {
      await submitVerification({
        nin: values.nin.trim(),
        bvn: values.bvn.trim(),
        guarantor: {
          fullName: values.guarantorName.trim(),
          phone: normalizeNigerianPhone(values.guarantorPhone),
          relationship: values.guarantorRelationship.trim(),
        },
      });
      navigation.goBack();
    } catch (err) {
      if (err instanceof ApiError && err.fields) {
        // The server disagreed with the form — point at the exact inputs.
        const mapped: FieldErrors = {};
        for (const [path, message] of Object.entries(err.fields)) {
          const key = SERVER_FIELD_MAP[path];
          if (key && !mapped[key]) mapped[key] = message;
        }
        if (Object.keys(mapped).length > 0) {
          setErrors(mapped);
          scrollToFirstError(mapped);
          return;
        }
      }
      setFormError(err instanceof ApiError ? err.message : "Couldn't submit verification");
    }
  }, [values, submitVerification, navigation]);

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
    <ScrollView
      ref={scrollRef}
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.intro}>
        We verify every runner's identity before they can go online or accept errands. This only
        takes a minute.
      </Text>

      <Text style={styles.sectionLabel}>Identity verification</Text>
      <View onLayout={trackLayout("nin")}>
        <TextField
          label="NIN"
          value={values.nin}
          onChangeText={(t) => setValue("nin", t.replace(/\D/g, ""))}
          placeholder="11-digit National ID number"
          keyboardType="number-pad"
          maxLength={11}
          error={errors.nin}
        />
      </View>
      <View onLayout={trackLayout("bvn")}>
        <TextField
          label="BVN"
          value={values.bvn}
          onChangeText={(t) => setValue("bvn", t.replace(/\D/g, ""))}
          placeholder="11-digit Bank Verification Number"
          keyboardType="number-pad"
          maxLength={11}
          error={errors.bvn}
        />
      </View>

      <Text style={styles.sectionLabel}>Guarantor</Text>
      <View onLayout={trackLayout("guarantorName")}>
        <TextField
          label="Guarantor's full name"
          value={values.guarantorName}
          onChangeText={(t) => setValue("guarantorName", t)}
          placeholder="Someone who can vouch for you"
          error={errors.guarantorName}
        />
      </View>
      <View onLayout={trackLayout("guarantorPhone")}>
        <TextField
          label="Guarantor's phone number"
          value={values.guarantorPhone}
          onChangeText={(t) => setValue("guarantorPhone", t)}
          placeholder="08012345678"
          keyboardType="phone-pad"
          autoCapitalize="none"
          error={errors.guarantorPhone}
        />
      </View>
      <View onLayout={trackLayout("guarantorRelationship")}>
        <TextField
          label="Relationship to you"
          value={values.guarantorRelationship}
          onChangeText={(t) => setValue("guarantorRelationship", t)}
          placeholder="e.g. Uncle, Former employer"
          error={errors.guarantorRelationship}
        />
      </View>

      {formError ? <Text style={styles.formError}>{formError}</Text> : null}

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
