// Settings-style page (plain background, TextField — same as
// ProfileScreen), not the auth gradient/glass look: this isn't part of
// signing in, it's a form the runner fills in from Settings whenever
// they're ready. See routes/runners.ts's PATCH /me/verification and its
// "self-serve auto-verify for now" comment for what happens server-side.
import { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, ScrollView, type LayoutChangeEvent } from "react-native";
import { Clock, ShieldCheck } from "lucide-react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { getTheme } from "@gracerandly/theme";
import TextField from "../components/TextField";
import PillSelect from "../components/PillSelect";
import type { IdType } from "@gracerandly/shared-types";
import Button from "../components/Button";
import { useAuth } from "../context/AuthContext";
import { ApiError } from "../lib/apiClient";
import type { MainStackParamList } from "../navigation/types";

const theme = getTheme("light");

type Props = NativeStackScreenProps<MainStackParamList, "Verification">;

type FieldKey = "idType" | "idNumber" | "guarantorName" | "guarantorPhone" | "guarantorRelationship";
type FieldErrors = Partial<Record<FieldKey, string>>;

// Top-to-bottom, so "first error" means the one highest on the screen.
const FIELD_ORDER: FieldKey[] = ["idType", "idNumber", "guarantorName", "guarantorPhone", "guarantorRelationship"];

// Server-side path -> the input it belongs to (see errorHandler's `fields`).
const SERVER_FIELD_MAP: Record<string, FieldKey> = {
  idType: "idType",
  idNumber: "idNumber",
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

// The runner gives ONE government ID. Format-checked only — nothing is verified
// against NIMC, a bank or the issuing agency; staff review each submission.
const ID_OPTIONS: { value: IdType; label: string }[] = [
  { value: "nin", label: "NIN" },
  { value: "bvn", label: "BVN" },
  { value: "passport", label: "Passport" },
  { value: "drivers_license", label: "Driver's licence" },
];

const ID_FIELDS: Record<IdType, { label: string; placeholder: string; digitsOnly: boolean; maxLength: number; pattern: RegExp; error: string }> = {
  nin: { label: "NIN", placeholder: "11-digit National ID number", digitsOnly: true, maxLength: 11, pattern: /^\d{11}$/, error: "NIN must be exactly 11 digits" },
  bvn: { label: "BVN", placeholder: "11-digit Bank Verification Number", digitsOnly: true, maxLength: 11, pattern: /^\d{11}$/, error: "BVN must be exactly 11 digits" },
  passport: { label: "Passport number", placeholder: "As printed in your passport", digitsOnly: false, maxLength: 12, pattern: /^[A-Z0-9]{6,9}$/, error: "Enter the passport number exactly as printed (6 to 9 letters or digits)" },
  drivers_license: { label: "Driver's licence number", placeholder: "As printed on your licence", digitsOnly: false, maxLength: 20, pattern: /^[A-Z0-9]{8,15}$/, error: "Enter the licence number exactly as printed (8 to 15 letters or digits)" },
};

/** Spaces and dashes don't count, and case doesn't matter. */
function normalizeIdNumber(value: string): string {
  return value.replace(/[\s-]/g, "").toUpperCase();
}

function validate(values: Record<FieldKey, string>): FieldErrors {
  const errors: FieldErrors = {};
  const idType = values.idType as IdType | "";
  if (!idType) errors.idType = "Choose which ID you are using";
  else if (!ID_FIELDS[idType].pattern.test(normalizeIdNumber(values.idNumber))) errors.idNumber = ID_FIELDS[idType].error;
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
  const { user, submitVerification, isLoading, refreshUser } = useAuth();

  // While a review is pending, check for a decision whenever this screen opens.
  useEffect(() => {
    if (user?.verificationStatus === "pending") void refreshUser().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [values, setValues] = useState<Record<FieldKey, string>>({
    idType: "",
    idNumber: "",
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
        idType: values.idType as IdType,
        idNumber: normalizeIdNumber(values.idNumber),
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

  if (user?.verificationStatus === "pending") {
    return (
      <View style={styles.verifiedContainer}>
        <Clock size={40} color={theme.colors.warning} />
        <Text style={styles.verifiedTitle}>Your details are being reviewed</Text>
        <Text style={styles.verifiedSubtitle}>
          We&apos;ll send you a notification as soon as you&apos;re approved. You can go online after that.
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
      {user?.verificationStatus === "rejected" ? (
        <View style={styles.rejectedBox}>
          <Text style={styles.rejectedTitle}>Your details were sent back</Text>
          <Text style={styles.rejectedText}>{user.verificationNote ?? "Please check your details and submit again."}</Text>
        </View>
      ) : null}

      <Text style={styles.intro}>
        We verify every runner's identity before they can go online or accept errands. This only
        takes a minute.
      </Text>

      <Text style={styles.sectionLabel}>Identity verification</Text>
      <Text style={styles.intro}>Give us just one of these. Pick the one you have.</Text>
      <View onLayout={trackLayout("idType")}>
        <PillSelect
          label="ID type"
          options={ID_OPTIONS}
          value={(values.idType || null) as IdType | null}
          onChange={(next) => setValues((prev) => ({ ...prev, idType: next, idNumber: "" }))}
          error={errors.idType}
        />
      </View>
      {values.idType ? (
        <View onLayout={trackLayout("idNumber")}>
          <TextField
            label={ID_FIELDS[values.idType as IdType].label}
            value={values.idNumber}
            onChangeText={(t) => {
              const cfg = ID_FIELDS[values.idType as IdType];
              setValue("idNumber", cfg.digitsOnly ? t.replace(/\D/g, "") : t.toUpperCase());
            }}
            placeholder={ID_FIELDS[values.idType as IdType].placeholder}
            keyboardType={ID_FIELDS[values.idType as IdType].digitsOnly ? "number-pad" : "default"}
            autoCapitalize="characters"
            maxLength={ID_FIELDS[values.idType as IdType].maxLength}
            error={errors.idNumber}
          />
        </View>
      ) : null}

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
  rejectedBox: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.danger,
    borderWidth: 1,
    borderRadius: 12,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.lg,
  },
  rejectedTitle: { fontFamily: theme.fonts.uiSemibold, fontSize: 14, color: theme.colors.danger, marginBottom: 4 },
  rejectedText: { fontFamily: theme.fonts.ui, fontSize: 14, color: theme.colors.text, lineHeight: 20 },
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
