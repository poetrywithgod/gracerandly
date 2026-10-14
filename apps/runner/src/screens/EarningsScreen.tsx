import { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, RefreshControl } from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import { Wallet, Clock, CheckCircle2, Landmark, ShieldCheck, Package } from "lucide-react-native";
import { getTheme } from "@gracerandly/theme";
import type { RunnerPayout } from "@gracerandly/shared-types";
import { useAuth } from "../context/AuthContext";
import { apiFetch, ApiError } from "../lib/apiClient";
import Button from "../components/Button";
import type { TabParamList } from "../navigation/types";

const theme = getTheme("light");

interface Earnings {
  totalEarned: number;
  availableBalance: number;
  pendingBalance: number;
  totalPaidOut: number;
  completedErrandsCount: number;
}

interface EarningItem {
  id: string;
  errandId: string;
  category: "grocery" | "pharmacy" | "food" | "parcel" | "miscellaneous";
  state: "held" | "available" | "paid_out";
  runnerPayout: number;
  commissionAmount: number;
  errandFee: number;
  earnedAt: string;
}

const CATEGORY_LABELS: Record<EarningItem["category"], string> = {
  grocery: "Grocery",
  pharmacy: "Pharmacy",
  food: "Food",
  parcel: "Parcel",
  miscellaneous: "Errand",
};

const STATE_LABELS: Record<EarningItem["state"], { text: string; color: string }> = {
  held: { text: "Held until delivery", color: theme.colors.warning },
  available: { text: "Ready to withdraw", color: theme.colors.success },
  paid_out: { text: "Paid to your bank", color: theme.colors.textMuted },
};

const PAYOUT_LABELS: Record<RunnerPayout["status"], { text: string; color: string }> = {
  pending: { text: "On its way", color: theme.colors.warning },
  success: { text: "Sent", color: theme.colors.success },
  failed: { text: "Failed — money is still in your balance", color: theme.colors.danger },
};

function formatNaira(amount: number): string {
  return `₦${amount.toLocaleString("en-NG")}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-NG", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

export default function EarningsScreen() {
  const navigation = useNavigation<BottomTabNavigationProp<TabParamList, "Earnings">>();
  const { user, token } = useAuth();

  const [earnings, setEarnings] = useState<Earnings | null>(null);
  const [items, setItems] = useState<EarningItem[]>([]);
  const [payouts, setPayouts] = useState<RunnerPayout[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isRequesting, setIsRequesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    const headers = { Authorization: `Bearer ${token}` };
    try {
      const [summary, history, payoutHistory] = await Promise.all([
        apiFetch<Earnings>("/runners/me/earnings", { headers }),
        apiFetch<{ items: EarningItem[] }>("/runners/me/earnings/history", { headers }),
        apiFetch<{ payouts: RunnerPayout[] }>("/runners/me/payouts", { headers }),
      ]);
      setEarnings(summary);
      setItems(history.items);
      setPayouts(payoutHistory.payouts);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't load your earnings");
    }
  }, [token]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function handleRefresh() {
    setIsRefreshing(true);
    await load();
    setIsRefreshing(false);
  }

  async function handleWithdraw() {
    if (!token) return;
    setError(null);
    setSuccess(null);
    setIsRequesting(true);
    try {
      const { payout } = await apiFetch<{ payout: { amount: number } }>("/runners/me/payout", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      setSuccess(`${formatNaira(payout.amount)} is on its way to your bank account`);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't start the withdrawal");
    } finally {
      setIsRequesting(false);
    }
  }

  const hasAccount = !!user?.payoutAccount;
  const available = earnings?.availableBalance ?? 0;

  return (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor={theme.colors.primary} />}
    >
      <View style={styles.balanceCard}>
        <Text style={styles.balanceLabel}>Available to withdraw</Text>
        <Text style={styles.balanceValue}>{earnings ? formatNaira(available) : "—"}</Text>
        {earnings && earnings.pendingBalance > 0 ? (
          <View style={styles.pendingRow}>
            <Clock size={14} color="#fff" />
            <Text style={styles.pendingText}>{formatNaira(earnings.pendingBalance)} on active errands — released when you deliver</Text>
          </View>
        ) : null}
        {hasAccount ? (
          <Button
            label="Withdraw to bank"
            icon={Landmark}
            variant="secondary"
            size="large"
            onPress={handleWithdraw}
            loading={isRequesting}
            disabled={available <= 0}
            style={styles.withdrawButton}
          />
        ) : (
          <Button
            label="Add a payout account"
            icon={Landmark}
            variant="secondary"
            size="large"
            onPress={() => navigation.navigate("Profile")}
            style={styles.withdrawButton}
          />
        )}
        {success ? <Text style={styles.successText}>{success}</Text> : null}
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
      </View>

      <View style={styles.statsRow}>
        <Stat label="Total earned" value={earnings ? formatNaira(earnings.totalEarned) : "—"} />
        <Stat label="Paid out" value={earnings ? formatNaira(earnings.totalPaidOut) : "—"} />
        <Stat label="Errands done" value={earnings ? String(earnings.completedErrandsCount) : "—"} />
      </View>

      <Text style={styles.sectionTitle}>How you get paid</Text>
      <View style={styles.card}>
        <Step
          icon={<ShieldCheck size={18} color={theme.colors.primary} />}
          title="The requester pays first"
          body="Their payment is held safely by Gracerandly while you work, so the money is guaranteed."
        />
        <Step
          icon={<Package size={18} color={theme.colors.primary} />}
          title="You deliver, it's released"
          body="Once the requester gives you their delivery PIN and you confirm, your earnings (the fee minus Gracerandly's service fee) move to your balance."
        />
        <Step
          icon={<Wallet size={18} color={theme.colors.primary} />}
          title="Withdraw any time"
          body="Tap Withdraw to send your available balance to your bank account."
          last
        />
      </View>

      <Text style={styles.sectionTitle}>Recent earnings</Text>
      {items.length === 0 ? (
        <Text style={styles.emptyText}>Finish an errand and your earnings will show up here.</Text>
      ) : (
        items.map((item) => {
          const state = STATE_LABELS[item.state];
          return (
            <View key={item.id} style={styles.rowCard}>
              <View style={styles.rowTop}>
                <Text style={styles.rowTitle}>{CATEGORY_LABELS[item.category]}</Text>
                <Text style={styles.rowAmount}>+{formatNaira(item.runnerPayout)}</Text>
              </View>
              <Text style={styles.rowHint}>
                {formatNaira(item.errandFee)} fee − {formatNaira(item.commissionAmount)} service fee · {formatDate(item.earnedAt)}
              </Text>
              <View style={styles.stateRow}>
                {item.state === "paid_out" ? <CheckCircle2 size={13} color={state.color} /> : null}
                <Text style={[styles.stateText, { color: state.color }]}>{state.text}</Text>
              </View>
            </View>
          );
        })
      )}

      {payouts.length > 0 ? (
        <>
          <Text style={styles.sectionTitle}>Withdrawals</Text>
          {payouts.map((payout) => {
            const label = PAYOUT_LABELS[payout.status];
            return (
              <View key={payout.id} style={styles.rowCard}>
                <View style={styles.rowTop}>
                  <Text style={styles.rowTitle}>To your bank account</Text>
                  <Text style={styles.rowAmount}>{formatNaira(payout.amount)}</Text>
                </View>
                <Text style={styles.rowHint}>{formatDate(payout.createdAt)}</Text>
                <Text style={[styles.stateText, { color: label.color }]}>{label.text}</Text>
              </View>
            );
          })}
        </>
      ) : null}
    </ScrollView>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function Step({ icon, title, body, last }: { icon: React.ReactNode; title: string; body: string; last?: boolean }) {
  return (
    <View style={[styles.step, !last && styles.stepDivider]}>
      <View style={styles.stepIcon}>{icon}</View>
      <View style={styles.stepText}>
        <Text style={styles.stepTitle}>{title}</Text>
        <Text style={styles.stepBody}>{body}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: theme.colors.background },
  content: { padding: theme.spacing.lg, paddingBottom: theme.spacing.xxl },
  balanceCard: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.lg,
    gap: 6,
  },
  balanceLabel: { fontFamily: theme.fonts.uiMedium, fontSize: 13, color: "rgba(255,255,255,0.85)" },
  balanceValue: { fontFamily: theme.fonts.display, fontSize: 36, color: "#fff" },
  pendingRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 },
  pendingText: { fontFamily: theme.fonts.ui, fontSize: 12, color: "rgba(255,255,255,0.9)", flex: 1 },
  withdrawButton: { marginTop: theme.spacing.md },
  successText: { fontFamily: theme.fonts.uiMedium, fontSize: 13, color: "#fff", marginTop: 6 },
  errorText: { fontFamily: theme.fonts.uiMedium, fontSize: 13, color: "#ffd9d4", marginTop: 6 },
  statsRow: { flexDirection: "row", gap: theme.spacing.sm, marginTop: theme.spacing.md },
  stat: {
    flex: 1,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.md,
    alignItems: "center",
  },
  statValue: { fontFamily: theme.fonts.uiSemibold, fontSize: 16, color: theme.colors.primaryDark },
  statLabel: { fontFamily: theme.fonts.ui, fontSize: 11, color: theme.colors.textMuted, marginTop: 2 },
  sectionTitle: {
    fontFamily: theme.fonts.uiSemibold,
    fontSize: 14,
    color: theme.colors.text,
    marginTop: theme.spacing.lg,
    marginBottom: theme.spacing.sm,
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: theme.spacing.md,
  },
  step: { flexDirection: "row", gap: 12, paddingVertical: 12 },
  stepDivider: { borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  stepIcon: { width: 28, alignItems: "center", paddingTop: 2 },
  stepText: { flex: 1 },
  stepTitle: { fontFamily: theme.fonts.uiSemibold, fontSize: 14, color: theme.colors.text },
  stepBody: { fontFamily: theme.fonts.ui, fontSize: 12, color: theme.colors.textMuted, marginTop: 2, lineHeight: 17 },
  emptyText: { fontFamily: theme.fonts.ui, fontSize: 13, color: theme.colors.textMuted, paddingVertical: theme.spacing.md },
  rowCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    gap: 3,
  },
  rowTop: { flexDirection: "row", justifyContent: "space-between" },
  rowTitle: { fontFamily: theme.fonts.uiSemibold, fontSize: 14, color: theme.colors.text },
  rowAmount: { fontFamily: theme.fonts.uiSemibold, fontSize: 14, color: theme.colors.success },
  rowHint: { fontFamily: theme.fonts.ui, fontSize: 12, color: theme.colors.textMuted },
  stateRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  stateText: { fontFamily: theme.fonts.uiMedium, fontSize: 12 },
});
