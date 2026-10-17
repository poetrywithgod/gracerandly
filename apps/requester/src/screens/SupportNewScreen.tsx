import { useState } from "react";
import { Text, ScrollView, StyleSheet } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { getTheme } from "@gracerandly/theme";
import type { SupportCategory, SupportTicket } from "@gracerandly/shared-types";
import Button from "../components/Button";
import TextField from "../components/TextField";
import PillSelect from "../components/PillSelect";
import { useAuth } from "../context/AuthContext";
import { apiFetch, ApiError } from "../lib/apiClient";
import { SUPPORT_BASE } from "../lib/supportBase";
import type { MainStackParamList } from "../navigation/types";

const theme = getTheme("light");

const CATEGORIES: { value: SupportCategory; label: string }[] = [
  { value: "payment", label: "Payment" },
  { value: "errand_problem", label: "An errand" },
  { value: "other_person", label: "Another person" },
  { value: "account", label: "My account" },
  { value: "safety", label: "Safety" },
  { value: "other", label: "Something else" },
];

export default function SupportNewScreen() {
  const { token } = useAuth();
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const [category, setCategory] = useState<SupportCategory | null>(null);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  async function submit() {
    const found: Record<string, string> = {};
    if (!category) found.category = "Pick what this is about";
    if (subject.trim().length < 3) found.subject = "Add a short subject";
    if (message.trim().length < 5) found.message = "Tell us a bit more";
    setFieldErrors(found);
    if (Object.keys(found).length > 0) return;
    setBusy(true);
    setError(null);
    try {
      const response = await apiFetch<{ ticket: SupportTicket }>(`${SUPPORT_BASE}/tickets`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({ category, subject: subject.trim(), message: message.trim() }),
      });
      navigation.replace("SupportThread", { ticketId: response.ticket.id });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't send your message");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <PillSelect label="What's it about?" options={CATEGORIES} value={category} onChange={setCategory} />
      {fieldErrors.category ? <Text style={styles.error}>{fieldErrors.category}</Text> : null}
      <TextField label="Subject" value={subject} onChangeText={setSubject} error={fieldErrors.subject} maxLength={120} />
      <TextField
        label="What happened?"
        value={message}
        onChangeText={setMessage}
        error={fieldErrors.message}
        multiline
        numberOfLines={5}
        placeholder="Include the errand, amount or person involved if there is one"
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Button label="Send" onPress={submit} loading={busy} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: theme.colors.background },
  content: { padding: theme.spacing.lg, gap: theme.spacing.md },
  error: { fontFamily: theme.fonts.ui, fontSize: 13, color: theme.colors.danger },
});
