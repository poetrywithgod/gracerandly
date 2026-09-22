import { useCallback, useState } from "react";
import { View, Text, Image, ScrollView, StyleSheet, RefreshControl, Pressable } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import {
  Phone,
  Mail,
  ShieldCheck,
  ShieldAlert,
  Package,
  CheckCircle2,
  Wallet,
  Camera,
} from "lucide-react-native";
import { getTheme } from "@gracerandly/theme";
import type { Errand, Gender, RequesterStatus, VerificationChannel } from "@gracerandly/shared-types";
import Button from "../components/Button";
import TextField from "../components/TextField";
import PillSelect from "../components/PillSelect";
import { SkeletonBlock } from "../components/Skeleton";
import ConfirmModal from "../components/ConfirmModal";
import AvatarPickerModal from "../components/AvatarPickerModal";
import VerificationModal from "../components/VerificationModal";
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

const STATUS_OPTIONS: { value: RequesterStatus; label: string }[] = [
  { value: "available", label: "Available" },
  { value: "busy", label: "Busy" },
  { value: "offline", label: "Offline" },
];

const STATUS_COLORS: Record<RequesterStatus, string> = {
  available: theme.colors.success,
  busy: theme.colors.warning,
  offline: theme.colors.textMuted,
};

const MAX_BIO_LENGTH = 280;

function formatMemberSince(iso: string): string {
  return new Date(iso).toLocaleDateString("en-NG", { month: "long", year: "numeric" });
}

function formatNaira(amount: number): string {
  return `\u20a6${amount.toLocaleString("en-NG")}`;
}

export default function ProfileScreen() {
  const { user, token, signOut, updateProfile, updateAvatar } = useAuth();

  const [isEditing, setIsEditing] = useState(false);
  const [fullName, setFullName] = useState(user?.fullName ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [gender, setGender] = useState<Gender | null>(user?.gender ?? null);
  const [bio, setBio] = useState(user?.bio ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [isSavingStatus, setIsSavingStatus] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);

  const [errands, setErrands] = useState<Errand[] | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [statsError, setStatsError] = useState<string | null>(null);

  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);
  const [isSavingAvatar, setIsSavingAvatar] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);

  const [verifyingChannel, setVerifyingChannel] = useState<VerificationChannel | null>(null);

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
    setBio(user?.bio ?? "");
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
        bio,
      });
      setIsEditing(false);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Couldn't save changes");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleStatusChange(status: RequesterStatus) {
    if (status === user?.status) return;
    setIsSavingStatus(true);
    setStatusError(null);
    try {
      await updateProfile({ status });
    } catch (err) {
      setStatusError(err instanceof ApiError ? err.message : "Couldn't update status");
    } finally {
      setIsSavingStatus(false);
    }
  }

  async function handleAvatarSelect(imageDataUri: string | null) {
    setShowAvatarPicker(false);
    setIsSavingAvatar(true);
    setAvatarError(null);
    try {
      await updateAvatar(imageDataUri);
    } catch (err) {
      setAvatarError(err instanceof ApiError ? err.message : "Couldn't update your photo");
    } finally {
      setIsSavingAvatar(false);
    }
  }

  async function handleSignOut() {
    await signOut();
  }

  return (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={styles.container}
      refreshControl={
        <RefreshControl refreshing={isRefreshing} onRefresh={() => loadStats(true)} />
      }
    >
      <Pressable
        style={styles.avatarWrapper}
        onPress={() => setShowAvatarPicker(true)}
        disabled={isSavingAvatar}
      >
        <View style={styles.avatar}>
          {user?.avatarUrl ? (
            <Image source={{ uri: user.avatarUrl }} style={styles.avatarImage} />
          ) : (
            <Text style={styles.avatarInitial}>{user?.fullName.charAt(0).toUpperCase() ?? "?"}</Text>
          )}
        </View>
        <View style={styles.avatarEditBadge}>
          <Camera size={14} color={theme.colors.textOnPrimary} />
        </View>
      </Pressable>
      {avatarError ? <Text style={styles.errorText}>{avatarError}</Text> : null}

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
          <TextField
            label={`Bio (${bio.length}/${MAX_BIO_LENGTH})`}
            value={bio}
            onChangeText={(text) => setBio(text.slice(0, MAX_BIO_LENGTH))}
            multiline
            numberOfLines={3}
            placeholder="Tell runners a bit about yourself"
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
          {user?.bio ? <Text style={styles.bio}>{user.bio}</Text> : null}

          <View style={styles.statusRow}>
            <PillSelect
              label="Availability"
              options={STATUS_OPTIONS}
              value={user?.status ?? null}
              onChange={handleStatusChange}
              disabled={isSavingStatus}
            />
          </View>
          {statusError ? <Text style={styles.errorText}>{statusError}</Text> : null}

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
              action={
                user && !user.phoneVerified
                  ? { label: "Verify", onPress: () => setVerifyingChannel("phone") }
                  : undefined
              }
            />
            <InfoRow
              icon={<Mail size={16} color={theme.colors.textMuted} />}
              label="Email"
              value={user?.email ?? "Not provided"}
              action={
                user?.email && !user.emailVerified
                  ? { label: "Verify", onPress: () => setVerifyingChannel("email") }
                  : undefined
              }
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
            />
            <InfoRow
              icon={
                user?.emailVerified ? (
                  <ShieldCheck size={16} color={theme.colors.success} />
                ) : (
                  <ShieldAlert size={16} color={theme.colors.warning} />
                )
              }
              label="Email verified"
              value={user?.emailVerified ? "Yes" : user?.email ? "Not yet" : "No email on file"}
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
            onPress={() => setShowSignOutConfirm(true)}
            style={styles.signOutButton}
          />
        </>
      )}

      <ConfirmModal
        visible={showSignOutConfirm}
        title="Sign out?"
        body="You'll need to log in again to continue."
        confirmLabel="Sign out"
        cancelLabel="Cancel"
        destructive
        onConfirm={handleSignOut}
        onCancel={() => setShowSignOutConfirm(false)}
      />

      <AvatarPickerModal
        visible={showAvatarPicker}
        hasAvatar={Boolean(user?.avatarUrl)}
        onSelect={handleAvatarSelect}
        onClose={() => setShowAvatarPicker(false)}
      />

      {verifyingChannel && user ? (
        <VerificationModal
          visible
          channel={verifyingChannel}
          destination={verifyingChannel === "phone" ? user.phone : (user.email ?? "")}
          onClose={() => setVerifyingChannel(null)}
          onVerified={() => setVerifyingChannel(null)}
        />
      ) : null}
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
  action,
  last,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
  action?: { label: string; onPress: () => void };
  last?: boolean;
}) {
  return (
    <View style={[styles.infoRow, last && styles.infoRowLast]}>
      <View style={styles.infoLabelGroup}>
        {icon ? <View style={styles.infoIcon}>{icon}</View> : null}
        <Text style={styles.infoLabel}>{label}</Text>
      </View>
      <View style={styles.infoValueGroup}>
        <Text style={styles.infoValue}>{value}</Text>
        {action ? (
          <Pressable onPress={action.onPress} hitSlop={8}>
            <Text style={styles.infoAction}>{action.label}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: theme.colors.background },
  container: {
    padding: theme.spacing.lg,
    alignItems: "center",
  },
  avatarWrapper: {
    marginTop: theme.spacing.lg,
    marginBottom: theme.spacing.sm,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: theme.colors.primary,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  avatarImage: { width: "100%", height: "100%" },
  avatarInitial: {
    fontFamily: theme.fonts.display,
    fontSize: 28,
    color: theme.colors.textOnPrimary,
  },
  avatarEditBadge: {
    position: "absolute",
    bottom: 0,
    right: -2,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: theme.colors.primaryDark,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: theme.colors.background,
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
  },
  bio: {
    fontFamily: theme.fonts.ui,
    fontSize: 14,
    color: theme.colors.text,
    textAlign: "center",
    marginTop: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
  },
  statusRow: {
    alignSelf: "stretch",
    marginTop: theme.spacing.md,
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
  infoValueGroup: { flexDirection: "row", alignItems: "center", gap: 10 },
  infoValue: {
    fontFamily: theme.fonts.uiMedium,
    fontSize: 14,
    color: theme.colors.text,
  },
  infoAction: {
    fontFamily: theme.fonts.uiSemibold,
    fontSize: 13,
    color: theme.colors.primary,
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
