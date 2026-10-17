import { useCallback, useState } from "react";
import { View, Text, ScrollView, StyleSheet, KeyboardAvoidingView, Platform } from "react-native";
import { useFocusEffect, useRoute } from "@react-navigation/native";
import type { RouteProp } from "@react-navigation/native";
import { getTheme } from "@gracerandly/theme";
import type { SupportMessage, SupportTicket } from "@gracerandly/shared-types";
import Button from "../components/Button";
import TextField from "../components/TextField";
import LoadingScreen from "../components/LoadingScreen";
import { useAuth } from "../context/AuthContext";
import { apiFetch, ApiError } from "../lib/apiClient";
import { SUPPORT_BASE } from "../lib/supportBase";
import type { MainStackParamList } from "../navigation/types";

const theme = getTheme("light");

export default function SupportThreadScreen() {
  const { token } = useAuth();
  const { ticketId } = useRoute<RouteProp<MainStackParamList, "SupportThread">>().params;
  const [ticket, setTicket] = useState<SupportTicket | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [failed, setFailed] = useState(false);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await apiFetch<{ ticket: SupportTicket; messages: SupportMessage[] }>(
        `${SUPPORT_BASE}/tickets/${ticketId}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setTicket(response.ticket);
      setMessages(response.messages);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [token, ticketId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  async function send() {
    const body = reply.trim();
    if (!body) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`${SUPPORT_BASE}/tickets/${ticketId}/messages`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({ body }),
      });
      setReply("");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't send your reply");
    } finally {
      setBusy(false);
    }
  }

  if (!ticket) {
    return failed ? (
      <View style={styles.center}>
        <Text style={styles.error}>Couldn't load this conversation.</Text>
        <Button label="Try again" variant="ghost" onPress={load} />
      </View>
    ) : (
      <LoadingScreen message="Loading…" />
    );
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={90}>
      <ScrollView style={styles.flex} contentContainerStyle={styles.content}>
        <Text style={styles.subject}>{ticket.subject}</Text>
        {messages.map((m) => (
          <View key={m.id} style={[styles.bubble, m.sender === "staff" ? styles.staff : styles.mine]}>
            <Text style={styles.who}>{m.sender === "staff" ? "Gracerandly support" : "You"}</Text>
            <Text style={styles.bodyText}>{m.body}</Text>
            <Text style={styles.when}>{new Date(m.createdAt).toLocaleString("en-NG", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</Text>
          </View>
        ))}
      </ScrollView>
      {ticket.status === "closed" ? (
        <Text style={styles.closed}>This conversation is closed. Start a new one if you still need help.</Text>
      ) : (
        <View style={styles.composer}>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <TextField label="Reply" value={reply} onChangeText={setReply} multiline numberOfLines={3} />
          <Button label="Send reply" onPress={send} loading={busy} disabled={!reply.trim()} />
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: theme.colors.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: theme.spacing.sm, backgroundColor: theme.colors.background },
  content: { padding: theme.spacing.lg, gap: theme.spacing.sm },
  subject: { fontFamily: theme.fonts.display, fontSize: 20, color: theme.colors.text, marginBottom: theme.spacing.sm },
  bubble: { borderRadius: theme.radius.md, padding: theme.spacing.md, maxWidth: "90%", gap: 2 },
  mine: { alignSelf: "flex-end", backgroundColor: theme.colors.surface },
  staff: { alignSelf: "flex-start", backgroundColor: theme.colors.surface, borderLeftWidth: 3, borderLeftColor: theme.colors.primary },
  who: { fontFamily: theme.fonts.uiSemibold, fontSize: 12, color: theme.colors.textMuted },
  bodyText: { fontFamily: theme.fonts.ui, fontSize: 14, color: theme.colors.text },
  when: { fontFamily: theme.fonts.ui, fontSize: 11, color: theme.colors.textMuted },
  composer: { padding: theme.spacing.md, gap: theme.spacing.sm, borderTopWidth: 1, borderTopColor: theme.colors.border },
  closed: { fontFamily: theme.fonts.ui, fontSize: 13, color: theme.colors.textMuted, textAlign: "center", padding: theme.spacing.md },
  error: { fontFamily: theme.fonts.ui, fontSize: 13, color: theme.colors.danger },
});
