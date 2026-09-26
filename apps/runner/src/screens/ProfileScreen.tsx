import { useCallback, useState } from "react";
import { View, Text, Image, ScrollView, StyleSheet, RefreshControl, Pressable } from "react-native";
import { useFocusEffect, useNavigation, type CompositeNavigationProp } from "@react-navigation/native";
import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import {
  ShieldCheck,
  ShieldAlert,
  ChevronRight,
  Camera,
  Package,
  CheckCircle2,
  Wallet,
  Landmark,
} from "lucide-react-native";
import { getTheme } from "@gracerandly/theme";
import type { Errand, VehicleType } from "@gracerandly/shared-types";
import { useAuth } from "../context/AuthContext";
import { apiFetch, ApiError } from "../lib/apiClient";
import Button from "../components/Button";
import TextField from "../components/TextField";
import PillSelect from "../components/PillSelect";
import ConfirmModal from "../components/ConfirmModal";
import AvatarPickerModal from "../components/AvatarPickerModal";
import { SkeletonBlock } from "../components/Skeleton";
import type { MainStackParamList, TabParamList } from "../navigation/types";

const theme = getTheme("light");

type ProfileNavigationProp = CompositeNavigationProp<
  BottomTabNavigationProp<TabParamList, "Profile">,
  NativeStackNavigationProp<MainStackParamList>
>;

const TIER_LABELS: Record<string, string> = {
  probationary: "Probationary",
  bronze: "Bronze",
  silver: "Silver",
  gold: "Gold",
};

const VEHICLE_OPTIONS: { value: VehicleType; label: string }[] = [
  { value: "bicycle", label: "Bicycle" },
  { value: "motorcycle", label: "Motorcycle" },
  { value: "car", label: "Car" },
  { value: "on_foot", label: "On foot" },
];

const VEHICLE_LABELS: Record<VehicleType, string> = {
  bicycle: "Bicycle",
  motorcycle: "Motorcycle",
  car: "Car",
  on_foot: "On foot",
};

interface EarningsResponse {
  totalEarned: number;
  completedErrandsCount: number;
}

function formatNaira(amount: number): string {
  return `\u20a6${amount.toLocaleString("en-NG")}`;
}

function maskId(value: string): string {
  return `${"•".repeat(Math.max(value.length - 4, 0))}${value.slice(-4)}`;
}

function maskAccountNumber(value: string): string {
  return `${"•".repeat(Math.max(value.length - 4, 0))}${value.slice(-4)}`;
}

export default function ProfileScreen() {
  const navigation = useNavigation<ProfileNavigationProp>();
  const { user, token, signOut, updateProfile, updateAvatar, updatePayoutAccount } = useAuth();

  // --- Profile edit (name/email/vehicle) ---
  const [isEditing, setIsEditing] = useState(false);
  const [fullName, setFullName] = useState(user?.fullName ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [vehicleType, setVehicleType] = useState<VehicleType | null>(user?.vehicleType ?? null);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  // --- Avatar ---
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);
  const [isSavingAvatar, setIsSavingAvatar] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);

  // --- Payout account edit ---
  const [isEditingPayout, setIsEditingPayout] = useState(false);
  const [bankName, setBankName] = useState(user?.payoutAccount?.bankName ?? "");
  const [accountNumber, setAccountNumber] = useState(user?.payoutAccount?.accountNumber ?? "");
  const [accountName, setAccountName] = useState(user?.payoutAccount?.accountName ?? "");
  const [isSavingPayout, setIsSavingPayout] = useState(false);
  const [payoutError, setPayoutError] = useState<string | null>(null);

  // --- Stats ---
  const [errands, setErrands] = useState<Errand[] | null>(null);
  const [earnings, setEarnings] = useState<EarningsResponse | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [statsError, setStatsError] = useState<string | null>(null);

  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);

  const loadStats = useCallback(
    async (isRefresh = false) => {
      if (!token) return;
      if (isRefresh) setIsRefreshing(true);
      setStatsError(null);
      try {
        const [errandsResponse, earningsResponse] = await Promise.all([
          apiFetch<{ errands: Errand[] }>("/runners/errands/mine", {
            headers: { Authorization: `Bearer ${token}` },
          }),
          apiFetch<EarningsResponse>("/runners/me/earnings", {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ]);
        setErrands(errandsResponse.errands);
        setEarnings(earningsResponse);
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

  const activeCount =
    errands?.filter((e) =>
      ["accepted", "en_route_to_pickup", "in_progress", "en_route_to_delivery"].includes(e.status)
    ).length ?? 0;

  function startEditingProfile() {
    setFullName(user?.fullName ?? "");
    setEmail(user?.email ?? "");
    setVehicleType(user?.vehicleType ?? null);
    setProfileError(null);
    setIsEditing(true);
  }

  async function handleSaveProfile() {
    if (fullName.trim().length < 2) {
      setProfileError("Full name is required");
      return;
    }
    setProfileError(null);
    setIsSavingProfile(true);
    try {
      await updateProfile({
        fullName: fullName.trim(),
        email: email.trim() || undefined,
        vehicleType: vehicleType ?? undefined,
      });
      setIsEditing(false);
    } catch (err) {
      setProfileError(err instanceof ApiError ? err.message : "Couldn't save changes");
    } finally {
      setIsSavingProfile(false);
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

  function startEditingPayout() {
    setBankName(user?.payoutAccount?.bankName ?? "");
    setAccountNumber(user?.payoutAccount?.accountNumber ?? "");
    setAccountName(user?.payoutAccount?.accountName ?? "");
    setPayoutError(null);
    setIsEditingPayout(true);
  }

  async function handleSavePayout() {
    if (bankName.trim().length < 2 || !/^\d{10}$/.test(accountNumber) || accountName.trim().length < 2) {
      setPayoutError("Fill in a bank name, 10-digit account number, and account name");
      return;
    }
    setPayoutError(null);
    setIsSavingPayout(true);
    try {
      await updatePayoutAccount({
        bankName: bankName.trim(),
        accountNumber,
        accountName: accountName.trim(),
      });
      setIsEditingPayout(false);
    } catch (err) {
      setPayoutError(err instanceof ApiError ? err.message : "Couldn't save payout details");
    } finally {
      setIsSavingPayout(false);
    }
  }

  async function handleSignOut() {
    await signOut();
  }

  if (!user) return null;

  return (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={() => loadStats(true)} />}
    >
      <Pressable style={styles.avatarWrapper} onPress={() => setShowAvatarPicker(true)} disabled={isSavingAvatar}>
        <View style={styles.avatar}>
          {user.avatarUrl ? (
            <Image source={{ uri: user.avatarUrl }} style={styles.avatarImage} />
          ) : (
            <Text style={styles.avatarInitial}>{user.fullName.charAt(0).toUpperCase()}</Text>
          )}
        </View>
        <View style={styles.avatarEditBadge}>
          <Camera size={14} color={theme.colors.textOnPrimary} />
        </View>
      </Pressable>
      {avatarError ? <Text style={styles.errorText}>{avatarError}</Text> : null}

      {isEditing ? (
        <View style={styles.editForm}>
          <TextField label="Full name" value={fullName} onChangeText={setFullName} autoCapitalize="words" />
          <TextField label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
          <PillSelect label="Vehicle" options={VEHICLE_OPTIONS} value={vehicleType} onChange={setVehicleType} />
          {profileError ? <Text style={styles.errorText}>{profileError}</Text> : null}
          <View style={styles.editActions}>
            <Button label="Cancel" variant="ghost" onPress={() => setIsEditing(false)} style={styles.editActionButton} />
            <Button label="Save" onPress={handleSaveProfile} loading={isSavingProfile} style={styles.editActionButton} />
          </View>
        </View>
      ) : (
        <>
          <Text style={styles.name}>{user.fullName}</Text>
          <Text style={styles.phone}>{user.phone}</Text>
          {user.email ? <Text style={styles.email}>{user.email}</Text> : null}
          {user.vehicleType ? <Text style={styles.vehicle}>{VEHICLE_LABELS[user.vehicleType]}</Text> : null}

          <View style={styles.statsRow}>
            <StatTile
              icon={<CheckCircle2 size={18} color={theme.colors.primary} />}
              label="Completed"
              value={earnings ? String(earnings.completedErrandsCount) : null}
            />
            <StatTile
              icon={<Package size={18} color={theme.colors.primary} />}
              label="Active"
              value={errands ? String(activeCount) : null}
            />
            <StatTile
              icon={<Wallet size={18} color={theme.colors.primary} />}
              label="Earned"
              value={earnings ? formatNaira(earnings.totalEarned) : null}
            />
          </View>
          {statsError ? <Text style={styles.statsErrorText}>{statsError}</Text> : null}

          <Pressable style={styles.card} onPress={() => navigation.navigate("Verification")}>
            <View style={styles.rowLeft}>
              {user.identityVerified ? (
                <ShieldCheck size={20} color={theme.colors.success} />
              ) : (
                <ShieldAlert size={20} color={theme.colors.warning} />
              )}
              <View style={styles.rowLeftText}>
                <Text style={styles.rowLabel}>
                  {user.identityVerified ? "Identity verified" : "Verification required"}
                </Text>
                {!user.identityVerified ? (
                  <Text style={styles.rowHint}>Submit your NIN, BVN and a guarantor to go online</Text>
                ) : (
                  <Text style={styles.rowHint}>
                    NIN {maskId(user.nin ?? "")} · BVN {maskId(user.bvn ?? "")}
                  </Text>
                )}
              </View>
            </View>
            <ChevronRight size={18} color={theme.colors.textMuted} />
          </Pressable>

          {user.identityVerified && user.guarantor ? (
            <View style={styles.infoCard}>
              <InfoRow label="Guarantor" value={user.guarantor.fullName} />
              <InfoRow label="Guarantor's phone" value={user.guarantor.phone} />
              <InfoRow label="Relationship" value={user.guarantor.relationship} last />
            </View>
          ) : null}

          <View style={styles.sectionHeaderRow}>
            <Landmark size={16} color={theme.colors.primary} />
            <Text style={styles.sectionHeaderText}>Payout account</Text>
          </View>

          {isEditingPayout ? (
            <View style={styles.editForm}>
              <TextField label="Bank name" value={bankName} onChangeText={setBankName} placeholder="e.g. GTBank" />
              <TextField
                label="Account number"
                value={accountNumber}
                onChangeText={setAccountNumber}
                placeholder="10-digit NUBAN"
                keyboardType="number-pad"
                maxLength={10}
              />
              <TextField label="Account name" value={accountName} onChangeText={setAccountName} placeholder="Name on the account" />
              {payoutError ? <Text style={styles.errorText}>{payoutError}</Text> : null}
              <View style={styles.editActions}>
                <Button label="Cancel" variant="ghost" onPress={() => setIsEditingPayout(false)} style={styles.editActionButton} />
                <Button label="Save" onPress={handleSavePayout} loading={isSavingPayout} style={styles.editActionButton} />
              </View>
            </View>
          ) : (
            <Pressable style={styles.card} onPress={startEditingPayout}>
              <View style={styles.rowLeftText}>
                {user.payoutAccount ? (
                  <>
                    <Text style={styles.rowLabel}>{user.payoutAccount.bankName}</Text>
                    <Text style={styles.rowHint}>
                      {user.payoutAccount.accountName} · {maskAccountNumber(user.payoutAccount.accountNumber)}
                    </Text>
                  </>
                ) : (
                  <>
                    <Text style={styles.rowLabel}>No payout account yet</Text>
                    <Text style={styles.rowHint}>Add a bank account to receive future payouts</Text>
                  </>
                )}
              </View>
              <ChevronRight size={18} color={theme.colors.textMuted} />
            </Pressable>
          )}

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Trust tier</Text>
            <Text style={styles.tierValue}>{TIER_LABELS[user.trustTierId] ?? user.trustTierId}</Text>
            <Text style={styles.tierHint}>
              Higher tiers unlock higher-value errands as you complete more clean, on-time deliveries.
            </Text>
          </View>

          <Button label="Edit profile" variant="ghost" onPress={startEditingProfile} style={styles.editProfileButton} />
          <Button label="Sign out" variant="ghost" onPress={() => setShowSignOutConfirm(true)} style={styles.signOutButton} />
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
        hasAvatar={Boolean(user.avatarUrl)}
        onSelect={handleAvatarSelect}
        onClose={() => setShowAvatarPicker(false)}
      />
    </ScrollView>
  );
}

function StatTile({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | null }) {
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

function InfoRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={[styles.infoRow, last && styles.infoRowLast]}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: theme.colors.background },
  container: { padding: theme.spacing.lg, alignItems: "center" },
  avatarWrapper: { marginTop: theme.spacing.md, marginBottom: theme.spacing.sm },
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
  avatarInitial: { fontFamily: theme.fonts.display, fontSize: 28, color: theme.colors.textOnPrimary },
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
  name: { fontFamily: theme.fonts.uiSemibold, fontSize: 18, color: theme.colors.text },
  phone: { fontFamily: theme.fonts.ui, fontSize: 14, color: theme.colors.textMuted, marginTop: 2 },
  email: { fontFamily: theme.fonts.ui, fontSize: 14, color: theme.colors.textMuted },
  vehicle: { fontFamily: theme.fonts.uiMedium, fontSize: 13, color: theme.colors.primary, marginTop: 4 },

  statsRow: {
    flexDirection: "row",
    alignSelf: "stretch",
    gap: theme.spacing.sm,
    marginTop: theme.spacing.md,
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
  statValue: { fontFamily: theme.fonts.uiSemibold, fontSize: 14, color: theme.colors.text, marginTop: 2 },
  statSkeleton: { marginTop: 6, marginBottom: 2 },
  statLabel: { fontFamily: theme.fonts.ui, fontSize: 11, color: theme.colors.textMuted },
  statsErrorText: {
    alignSelf: "stretch",
    fontFamily: theme.fonts.ui,
    fontSize: 12,
    color: theme.colors.danger,
    marginBottom: theme.spacing.md,
  },

  card: {
    alignSelf: "stretch",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginBottom: theme.spacing.md,
  },
  rowLeft: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
  rowLeftText: { flex: 1 },
  rowLabel: { fontFamily: theme.fonts.uiMedium, fontSize: 14, color: theme.colors.text },
  rowHint: { fontFamily: theme.fonts.ui, fontSize: 12, color: theme.colors.textMuted, marginTop: 2 },

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
  infoRowLast: { borderBottomWidth: 0 },
  infoLabel: { fontFamily: theme.fonts.ui, fontSize: 13, color: theme.colors.textMuted },
  infoValue: { fontFamily: theme.fonts.uiMedium, fontSize: 13, color: theme.colors.text },

  sectionHeaderRow: {
    alignSelf: "stretch",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: theme.spacing.sm,
  },
  sectionHeaderText: {
    fontFamily: theme.fonts.uiSemibold,
    fontSize: 13,
    color: theme.colors.primary,
    textTransform: "uppercase",
  },

  sectionTitle: { fontFamily: theme.fonts.uiMedium, fontSize: 13, color: theme.colors.textMuted, textTransform: "uppercase" },
  tierValue: { fontFamily: theme.fonts.uiSemibold, fontSize: 20, color: theme.colors.primaryDark, marginTop: 4 },
  tierHint: { fontFamily: theme.fonts.ui, fontSize: 12, color: theme.colors.textMuted, marginTop: 6 },

  editProfileButton: { alignSelf: "stretch", marginBottom: theme.spacing.sm },
  signOutButton: { alignSelf: "stretch" },
  editForm: { alignSelf: "stretch", marginBottom: theme.spacing.md },
  editActions: { flexDirection: "row", gap: theme.spacing.sm, marginTop: theme.spacing.sm },
  editActionButton: { flex: 1 },
  errorText: { fontFamily: theme.fonts.ui, fontSize: 13, color: theme.colors.danger, marginBottom: theme.spacing.sm },
});
