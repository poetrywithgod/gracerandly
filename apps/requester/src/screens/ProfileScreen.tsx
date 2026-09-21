import { useState } from "react";
import { View, Text, ScrollView, StyleSheet } from "react-native";
import { getTheme } from "@gracerandly/theme";
import Button from "../components/Button";
import TextField from "../components/TextField";
import { useAuth } from "../context/AuthContext";
import { ApiError } from "../lib/apiClient";

const theme = getTheme("light");

const GENDER_LABELS: Record<string, string> = {
  female: "Female",
  male: "Male",
  unspecified: "Prefer not to say",
};

function formatMemberSince(iso: string): string {
  return new Date(iso).toLocaleDateString("en-NG", { month: "long", year: "numeric" });
}

export default function ProfileScreen() {
  const { user, signOut, updateProfile } = useAuth();

  const [isEditing, setIsEditing] = useState(false);
  const [fullName, setFullName] = useState(user?.fullName ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  function startEditing() {
    setFullName(user?.fullName ?? "");
    setEmail(user?.email ?? "");
    setFormError(null);
    setIsEditing(true);
  }

  async function handleSave() {
    if (fullName.trim().length < 2) {
      setFormError("Full name is required");
      return;
    }
    setFormError(null);
    setIsSaving(true);
    try {
      await updateProfile({
        fullName: fullName.trim(),
        email: email.trim() || undefined,
      });
      setIsEditing(false);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Couldn't save changes");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.container}>
      <View style={styles.avatar}>
        <Text style={styles.avatarInitial}>{user?.fullName.charAt(0).toUpperCase() ?? "?"}</Text>
      </View>

      {isEditing ? (
        <View style={styles.editForm}>
          <TextField label="Full name" value={fullName} onChangeText={setFullName} />
          <TextField
            label="Email"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
          />
          {formError ? <Text style={styles.errorText}>{formError}</Text> : null}
          <View style={styles.editActions}>
            <Button
              label="Cancel"
              variant="ghost"
              onPress={() => setIsEditing(false)}
              style={styles.editActionButton}
            />
            <Button
              label="Save"
              onPress={handleSave}
              loading={isSaving}
              style={styles.editActionButton}
            />
          </View>
        </View>
      ) : (
        <>
          <Text style={styles.name}>{user?.fullName}</Text>
          {user ? (
            <Text style={styles.memberSince}>Member since {formatMemberSince(user.createdAt)}</Text>
          ) : null}

          <View style={styles.infoCard}>
            <InfoRow label="Phone" value={user?.phone ?? "—"} />
            <InfoRow label="Email" value={user?.email ?? "Not provided"} />
            <InfoRow label="Gender" value={user ? GENDER_LABELS[user.gender] : "—"} />
            <InfoRow label="Phone verified" value={user?.phoneVerified ? "Yes" : "Not yet"} />
          </View>

          <Button
            label="Edit profile"
            variant="ghost"
            onPress={startEditing}
            style={styles.editProfileButton}
          />
          <Button label="Sign out" variant="ghost" onPress={signOut} style={styles.signOutButton} />
        </>
      )}
    </ScrollView>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: theme.colors.background },
  container: {
    padding: theme.spacing.lg,
    alignItems: "center",
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: theme.colors.primary,
    alignItems: "center",
    justifyContent: "center",
    marginTop: theme.spacing.lg,
    marginBottom: theme.spacing.sm,
  },
  avatarInitial: {
    fontFamily: theme.fonts.display,
    fontSize: 28,
    color: theme.colors.textOnPrimary,
  },
  name: {
    fontFamily: theme.fonts.uiSemibold,
    fontSize: 18,
    color: theme.colors.text,
  },
  memberSince: {
    fontFamily: theme.fonts.ui,
    fontSize: 13,
    color: theme.colors.textMuted,
    marginBottom: theme.spacing.lg,
  },
  infoCard: {
    alignSelf: "stretch",
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  infoLabel: {
    fontFamily: theme.fonts.ui,
    fontSize: 14,
    color: theme.colors.textMuted,
  },
  infoValue: {
    fontFamily: theme.fonts.uiMedium,
    fontSize: 14,
    color: theme.colors.text,
  },
  editProfileButton: { alignSelf: "stretch", marginBottom: theme.spacing.sm },
  signOutButton: { alignSelf: "stretch" },
  editForm: { alignSelf: "stretch" },
  editActions: { flexDirection: "row", gap: theme.spacing.sm, marginTop: theme.spacing.sm },
  editActionButton: { flex: 1 },
  errorText: {
    fontFamily: theme.fonts.ui,
    fontSize: 13,
    color: theme.colors.danger,
    marginBottom: theme.spacing.sm,
  },
});
