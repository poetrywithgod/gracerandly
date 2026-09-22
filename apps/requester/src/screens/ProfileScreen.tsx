import { useCallback, useState } from "react";
import { View, Text, ScrollView, StyleSheet, RefreshControl, Alert } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import {
  Phone,
  Mail,
  ShieldCheck,
  ShieldAlert,
  Package,
  CheckCircle2,
  Wallet,
} from "lucide-react-native";
import { getTheme } from "@gracerandly/theme";
import type { Errand, Gender } from "@gracerandly/shared-types";
import Button from "../components/Button";
import TextField from "../components/TextField";
import PillSelect from "../components/PillSelect";
import { SkeletonBlock } from "../components/Skeleton";
import { useAuth } from "../context/AuthContext";
import { apiFetch, ApiError } from "../lib/apiClient";

const theme = getTheme("light");

const GENDER_LABELS: Record<Gender, string> = {
  female: "Female",
  male: "Male",
  unspecified: "Prefer not to say",
};

const GENDER_OPTIONS: { value: Gender; label: string }[] = [
  { value: "female", label: "Female" },
  { value: "male", label: "Male" },
  { value: "unspecified", label: "Prefer not to say" },
];

function formatMemberSince(iso: string): string {
  return new Date(iso).toLocaleDateString("en-NG", { month: "long", year: "numeric" });
}

function formatNaira(amount: number): string {
  return `\u20a6${amount.toLocaleString("en-NG")}`;
}

export default function ProfileScreen() {
  const { user, token, signOut, updateProfile } = useAuth();

  const [isEditing, setIsEditing] = useState(false);
  const [fullName, setFullName] = useState(user?.fullName ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [gender, setGender] = useState<Gender | null>(user?.gender ?? null);
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [errands, setErrands] = useState<Errand[] | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [statsError, setStatsError] = useState<string | null>(null);

  const loadStats = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setIsRefreshing(true);
      setStatsError(null);
      try {
        const response = await apiFetch<{ errands: Errand[] }>("/errands", {
          headers: { Authorization: `Bearer ${token}` },
        });
        setErrands(response.errands);
      } catch (err) {
        setStatsError(err instanceof ApiError ? err.message : "Couldn't load your activity");
      } finally {
        if (isRefresh) setIsRefreshing(false);
      }
    },
    [token]
  );

  useFocusEffect(
    useCallback(() => {
      loadStats();
    }, [loadStats])
  );

  const totalErrands = errands?.length ?? 0;
  const completedErrands = errands?.filter((e) => e.status === "delivered").length ?? 0;
  const totalSpent =
    errands
      ?.filter((e) => e.status === "delivered")
      .reduce((sum, e) => sum + (e.finalCost ?? e.estimatedCost), 0) ?? 0;

  function startEditing() {
    setFullName(user?.fullName ?? "");
    setEmail(user?.email ?? "");
    setGender(user?.gender ?? null);
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
        gender: gender ?? undefined,
      });
      setIsEditing(false);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Couldn't save changes");
    } finally {
      setIsSaving(false);
    }
  }

  function handleSignOutPress() {
    Alert.alert("Sign out?", "You'll need to log in again to continue.", [
      { text: "Cancel", style: "cancel" },
      { text: "Sign out", style: "destructive", onPress: signOut },
    ]);
  }

  return (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={styles.container}
      refreshControl={
        <RefreshControl refreshing={isRefreshing} onRefresh={() => loadStats(true)} />
      }
    >
      <View style={styles.avatar}>
        <Text style={styles.avatarInitial}>{user?.fullName.charAt(0).toUpperCase() ?? "?"}</Text>
      </View>

      {isEditing ? (
        <View style={styles.editForm}>
          <TextField
            label="Full name"
            value={fullName}
            onChangeText={setFullName}
            autoCapitalize="words"
          />
          <TextField
            label="Email"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
          />
          <PillSelect
            label="Gender"
            options={GENDER_OPTIONS}
            value={gender}
            onChange={setGender}
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

          <View style={styles.statsRow}>
            <StatTile
              icon={<Package size={18} color={theme.colors.primary} />}
              label="Errands"
              value={errands === null ? null : String(totalErrands)}
            />
            <StatTile
              icon={<CheckCircle2 size={18} color={theme.colors.success} />}
              label="Completed"
              value={errands === null ? null : String(completedErrands)}
            />
            <StatTile
              icon={<Wallet size={18} color={theme.colors.primaryDark} />}
              label="Total spent"
              value={errands === null ? null : formatNaira(totalSpent)}
            />
          </View>
          {statsError ? <Text style={styles.statsErrorText}>{statsError}</Text> : null}

          <View style={styles.infoCard}>
            <InfoRow
              icon={<Phone size={16} color={theme.colors.textMuted} />}
              label="Phone"
              value={user?.phone ?? "—"}
            />
            <InfoRow
              icon={<Mail size={16} color={theme.colors.textMuted} />}
              label="Email"
              value={user?.email ?? "Not provided"}
            />
            <InfoRow
              icon={
                user?.gender ? (
                  <Text style={styles.genderGlyph}>{user.gender === "female" ? "\u2640" : user.gender === "male" ? "\u2642" : "\u2013"}</Text>
                ) : undefined
              }
              label="Gender"
              value={user ? GENDER_LABELS[user.gender] : "—"}
            />
            <InfoRow
              icon={
                user?.phoneVerified ? (
                  <ShieldCheck size={16} color={theme.colors.success} />
                ) : (
                  <ShieldAlert size={16} color={theme.colors.warning} />
                )
              }
              label="Phone verified"
              value={user?.phoneVerified ? "Yes" : "Not yet"}
              last
            />
          </View>

          <Button
            label="Edit profile"
            variant="ghost"
            onPress={startEditing}
            style={styles.editProfileButton}
          />
          <Button
            label="Sign out"
            variant="ghost"
            onPress={handleSignOutPress}
            style={styles.signOutButton}
          />
        </>
      )}
    </ScrollView>
  );
}

function StatTile({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | null;
}) {
  return (
    <View style={styles.statTile}>
      {icon}
      {value === null ? (
        <SkeletonBlock width={40} height={16} style={styles.statSkeleton} />
      ) : (
        <Text style={styles.statValue} numberOfLines={1}>
          {value}
        </Text>
      )}
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function InfoRow({
  icon,
  label,
  value,
  last,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
  last?: boolean;
}) {
  return (
    <View style={[styles.infoRow, last && styles.infoRowLast]}>
      <View style={styles.infoLabelGroup}>
        {icon ? <View style={styles.infoIcon}>{icon}</View> : null}
        <Text style={styles.infoLabel}>{label}</Text>
      </View>
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
  statsRow: {
    flexDirection: "row",
    alignSelf: "stretch",
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  statTile: {
    flex: 1,
    alignItems: "center",
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    paddingVertical: theme.spacing.md,
    gap: 4,
  },
  statValue: {
    fontFamily: theme.fonts.uiSemibold,
    fontSize: 15,
    color: theme.colors.text,
    marginTop: 2,
  },
  statSkeleton: { marginTop: 6, marginBottom: 2 },
  statLabel: {
    fontFamily: theme.fonts.ui,
    fontSize: 11,
    color: theme.colors.textMuted,
  },
  statsErrorText: {
    alignSelf: "stretch",
    fontFamily: theme.fonts.ui,
    fontSize: 12,
    color: theme.colors.danger,
    marginBottom: theme.spacing.md,
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
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  infoRowLast: { borderBottomWidth: 0 },
  infoLabelGroup: { flexDirection: "row", alignItems: "center", gap: 8 },
  infoIcon: { width: 16, alignItems: "center" },
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
  genderGlyph: {
    fontFamily: theme.fonts.uiSemibold,
    fontSize: 14,
    color: theme.colors.textMuted,
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
