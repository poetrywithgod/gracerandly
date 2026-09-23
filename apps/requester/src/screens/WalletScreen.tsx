import { useCallback, useState } from "react";
import { View, Text, ScrollView, RefreshControl, StyleSheet } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import { Wallet as WalletIcon } from "lucide-react-native";
import { getTheme } from "@gracerandly/theme";
import type { Errand, EscrowTransaction, TransactionStatus } from "@gracerandly/shared-types";
import Button from "../components/Button";
import { SkeletonBlock } from "../components/Skeleton";
import { useAuth } from "../context/AuthContext";
import { apiFetch, ApiError } from "../lib/apiClient";

const theme = getTheme("light");

const CATEGORY_LABELS: Record<Errand["category"], string> = {
  grocery: "Grocery",
  pharmacy: "Pharmacy",
  food: "Food",
  parcel: "Parcel",
  miscellaneous: "Other",
};

const STATUS_LABELS: Record<TransactionStatus, string> = {
  pending: "Processing",
  escrowed: "Paid — in escrow",
  disbursed: "Runner paid",
  released: "Completed",
  refunded: "Refunded",
  failed: "Failed",
};

const STATUS_COLORS: Record<TransactionStatus, string> = {
  pending: theme.colors.warning,
  escrowed: theme.colors.info,
  disbursed: theme.colors.info,
  released: theme.colors.success,
  refunded: theme.colors.textMuted,
  failed: theme.colors.danger,
};

function formatNaira(amount: number): string {
  return `\u20a6${amount.toLocaleString("en-NG")}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("en-NG", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function WalletScreen() {
  const { token } = useAuth();

  const [errands, setErrands] = useState<Errand[] | null>(null);
  const [transactions, setTransactions] = useState<EscrowTransaction[] | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [payingErrandId, setPayingErrandId] = useState<string | null>(null);
  const [payError, setPayError] = useState<string | null>(null);

  const loadAll = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setIsRefreshing(true);
      setLoadError(null);
      try {
        const [errandsRes, transactionsRes] = await Promise.all([
          apiFetch<{ errands: Errand[] }>("/errands", {
            headers: { Authorization: `Bearer ${token}` },
          }),
          apiFetch<{ transactions: EscrowTransaction[] }>("/wallet/transactions", {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ]);
        setErrands(errandsRes.errands);
        setTransactions(transactionsRes.transactions);
      } catch (err) {
        setLoadError(err instanceof ApiError ? err.message : "Couldn't load your wallet");
      } finally {
        if (isRefresh) setIsRefreshing(false);
      }
    },
    [token]
  );

  useFocusEffect(
    useCallback(() => {
      loadAll();
    }, [loadAll])
  );

  async function handlePay(errand: Errand) {
    setPayingErrandId(errand.id);
    setPayError(null);
    try {
      const callbackUrl = Linking.createURL("payment-callback");
      const init = await apiFetch<{ authorizationUrl: string; reference: string }>(
        `/wallet/errands/${errand.id}/pay`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: JSON.stringify({ callbackUrl }),
        }
      );

      await WebBrowser.openAuthSessionAsync(init.authorizationUrl, callbackUrl);

      // Whichever way the browser closed (completed, backed out, or just
      // dismissed), ask the server what Paystack actually says — the
      // webhook may have already settled it, or this call settles it.
      try {
        await apiFetch("/wallet/verify", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: JSON.stringify({ reference: init.reference }),
        });
      } catch (verifyErr) {
        setPayError(
          verifyErr instanceof ApiError
            ? verifyErr.message
            : "Couldn't confirm that payment — check the transaction list below."
        );
      }
    } catch (err) {
      setPayError(err instanceof ApiError ? err.message : "Couldn't start payment");
    } finally {
      setPayingErrandId(null);
      loadAll(true);
    }
  }

  // Only errands with no attempt beyond a failed one need a "Pay now" —
  // anything pending/escrowed/disbursed/released already has money moving
  // or moved, so it drops out of this list once a transaction exists.
  const unpaidErrands =
    errands?.filter(
      (e) =>
        e.status === "pending_match" &&
        !transactions?.some((t) => t.errandId === e.id && t.status !== "failed")
    ) ?? [];

  const errandById = new Map((errands ?? []).map((e) => [e.id, e]));

  return (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={() => loadAll(true)} />}
    >
      {errands === null && transactions === null ? (
        <View style={styles.loadingState}>
          <SkeletonBlock width="100%" height={72} style={styles.skeletonCard} />
          <SkeletonBlock width="100%" height={72} style={styles.skeletonCard} />
        </View>
      ) : loadError ? (
        <Text style={styles.errorText}>{loadError}</Text>
      ) : (
        <>
          {unpaidErrands.length > 0 ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Awaiting payment</Text>
              {unpaidErrands.map((errand) => (
                <View key={errand.id} style={styles.unpaidCard}>
                  <View style={styles.unpaidInfo}>
                    <Text style={styles.unpaidCategory}>{CATEGORY_LABELS[errand.category]}</Text>
                    <Text style={styles.unpaidCost}>{formatNaira(errand.estimatedCost)}</Text>
                  </View>
                  <Button
                    label="Pay now"
                    onPress={() => handlePay(errand)}
                    loading={payingErrandId === errand.id}
                    disabled={payingErrandId !== null && payingErrandId !== errand.id}
                    style={styles.payButton}
                  />
                </View>
              ))}
              {payError ? <Text style={styles.errorText}>{payError}</Text> : null}
            </View>
          ) : null}

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Transactions</Text>
            {transactions && transactions.length > 0 ? (
              transactions.map((tx) => {
                const errand = errandById.get(tx.errandId);
                return (
                  <View key={tx.id} style={styles.txRow}>
                    <View style={styles.txInfo}>
                      <Text style={styles.txCategory}>
                        {errand ? CATEGORY_LABELS[errand.category] : "Errand"}
                      </Text>
                      <Text style={styles.txDate}>{formatDate(tx.createdAt)}</Text>
                    </View>
                    <View style={styles.txAmountGroup}>
                      <Text style={styles.txAmount}>{formatNaira(tx.amount)}</Text>
                      <View style={[styles.statusPill, { backgroundColor: STATUS_COLORS[tx.status] }]}>
                        <Text style={styles.statusText}>{STATUS_LABELS[tx.status]}</Text>
                      </View>
                    </View>
                  </View>
                );
              })
            ) : (
              <View style={styles.emptyState}>
                <WalletIcon size={28} color={theme.colors.textMuted} />
                <Text style={styles.emptyText}>No transactions yet</Text>
              </View>
            )}
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: theme.colors.background },
  container: { padding: theme.spacing.lg, paddingBottom: theme.spacing.xxl },
  loadingState: { gap: theme.spacing.sm },
  skeletonCard: { borderRadius: theme.radius.md },
  section: { marginBottom: theme.spacing.xl },
  sectionTitle: {
    fontFamily: theme.fonts.uiSemibold,
    fontSize: 15,
    color: theme.colors.text,
    marginBottom: theme.spacing.sm,
  },
  unpaidCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.sm,
  },
  unpaidInfo: { flex: 1 },
  unpaidCategory: {
    fontFamily: theme.fonts.uiMedium,
    fontSize: 14,
    color: theme.colors.text,
  },
  unpaidCost: {
    fontFamily: theme.fonts.uiSemibold,
    fontSize: 15,
    color: theme.colors.primaryDark,
    marginTop: 2,
  },
  payButton: { paddingHorizontal: theme.spacing.md },
  txRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.sm,
  },
  txInfo: { flex: 1 },
  txCategory: {
    fontFamily: theme.fonts.uiMedium,
    fontSize: 14,
    color: theme.colors.text,
  },
  txDate: {
    fontFamily: theme.fonts.ui,
    fontSize: 12,
    color: theme.colors.textMuted,
    marginTop: 2,
  },
  txAmountGroup: { alignItems: "flex-end", gap: 4 },
  txAmount: {
    fontFamily: theme.fonts.uiSemibold,
    fontSize: 14,
    color: theme.colors.text,
  },
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: theme.radius.pill,
  },
  statusText: {
    fontFamily: theme.fonts.uiSemibold,
    fontSize: 10,
    color: theme.colors.textOnPrimary,
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: theme.spacing.xl,
    gap: theme.spacing.sm,
  },
  emptyText: {
    fontFamily: theme.fonts.ui,
    fontSize: 13,
    color: theme.colors.textMuted,
  },
  errorText: {
    fontFamily: theme.fonts.ui,
    fontSize: 13,
    color: theme.colors.danger,
  },
});
