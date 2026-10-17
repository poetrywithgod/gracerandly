import { useCallback, useState } from "react";
import { View, Text, ScrollView, StyleSheet, RefreshControl, Pressable } from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ChevronRight } from "lucide-react-native";
import { getTheme } from "@gracerandly/theme";
import type { SupportStatus, SupportTicket } from "@gracerandly/shared-types";
import Button from "../components/Button";
import LoadingScreen from "../components/LoadingScreen";
import { useAuth } from "../context/AuthContext";
import { apiFetch } from "../lib/apiClient";
import { SUPPORT_BASE } from "../lib/supportBase";
import type { MainStackParamList } from "../navigation/types";

const theme = getTheme("light");

const STATUS_LABELS: Record<SupportStatus, string> = {
  open: "Open",
  awaiting_user: "Reply from support",
  resolved: "Resolved",
  closed: "Closed",
};
const STATUS_COLORS: Record<SupportStatus, string> = {
  open: theme.colors.info,
  awaiting_user: theme.colors.warning,
  resolved: theme.colors.success,
  closed: theme.colors.textMuted,
};

export default function SupportListScreen() {
  const { token } = useAuth();
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const [tickets, setTickets] = useState<SupportTicket[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await apiFetch<{ tickets: SupportTicket[] }>(`${SUPPORT_BASE}/tickets`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setTickets(response.tickets);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [token]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  if (tickets === null && !failed) return <LoadingScreen message="Loading…" />;

  return (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={async () => {
            setRefreshing(true);
            await load();
            setRefreshing(false);
          }}
        />
      }
    >
      <Button label="Contact support" onPress={() => navigation.navigate("SupportNew")} />
      {failed && tickets === null ? <Text style={styles.error}>Couldn't load your tickets. Pull down to retry.</Text> : null}
      {tickets && tickets.length === 0 ? (
        <Text style={styles.empty}>
          No messages yet. If something went wrong with a payment, an errand or your account, tell us and we'll reply here.
        </Text>
      ) : null}
      {tickets?.map((t) => (
        <Pressable
          key={t.id}
          style={styles.card}
          onPress={() => navigation.navigate("SupportThread", { ticketId: t.id })}
          accessibilityRole="button"
        >
          <View style={styles.cardText}>
            <Text style={styles.subject} numberOfLines={1}>
              {t.subject}
            </Text>
            <Text style={[styles.status, { color: STATUS_COLORS[t.status] }]}>{STATUS_LABELS[t.status]}</Text>
            <Text style={styles.date}>{new Date(t.updatedAt).toLocaleDateString("en-NG", { day: "numeric", month: "short" })}</Text>
          </View>
          <ChevronRight size={16} color={theme.colors.textMuted} />
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: theme.colors.background },
  content: { padding: theme.spacing.lg, gap: theme.spacing.md },
  empty: { fontFamily: theme.fonts.ui, fontSize: 14, color: theme.colors.textMuted, textAlign: "center", paddingVertical: theme.spacing.lg },
  error: { fontFamily: theme.fonts.ui, fontSize: 13, color: theme.colors.danger, textAlign: "center" },
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
  },
  cardText: { flex: 1, gap: 2 },
  subject: { fontFamily: theme.fonts.uiSemibold, fontSize: 15, color: theme.colors.text },
  status: { fontFamily: theme.fonts.uiMedium, fontSize: 13 },
  date: { fontFamily: theme.fonts.ui, fontSize: 12, color: theme.colors.textMuted },
});
