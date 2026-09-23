import { useState } from "react";
import { Modal, View, Text, Pressable, StyleSheet } from "react-native";
import { X, Sparkles } from "lucide-react-native";
import { getTheme } from "@gracerandly/theme";
import type { ErrandCategory } from "@gracerandly/shared-types";
import Button from "./Button";
import TextField from "./TextField";
import { useAuth } from "../context/AuthContext";
import { apiFetch, ApiError } from "../lib/apiClient";

const theme = getTheme("light");

export interface AiParsedDraft {
  category: ErrandCategory;
  items: { name: string; quantity: number; notes?: string }[];
  instructions?: string;
}

interface AiParseModalProps {
  visible: boolean;
  onClose: () => void;
  onParsed: (draft: AiParsedDraft) => void;
}

export default function AiParseModal({ visible, onClose, onParsed }: AiParseModalProps) {
  const { token } = useAuth();
  const [text, setText] = useState("");
  const [isParsing, setIsParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleParse() {
    if (text.trim().length < 3) {
      setError("Add a bit more detail");
      return;
    }
    setIsParsing(true);
    setError(null);
    try {
      const { draft } = await apiFetch<{ draft: AiParsedDraft }>("/errands/parse", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({ text: text.trim() }),
      });
      onParsed(draft);
      setText("");
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Couldn't parse that — try filling the form manually"
      );
    } finally {
      setIsParsing(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.header}>
            <View style={styles.headerTitleGroup}>
              <Sparkles size={18} color={theme.colors.primary} />
              <Text style={styles.title}>Fill with AI</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={12}>
              <X size={20} color={theme.colors.textMuted} />
            </Pressable>
          </View>

          <Text style={styles.body}>
            Paste a list or describe what you need — we'll fill in the category and items for you
            to review.
          </Text>

          <TextField
            label="What do you need?"
            value={text}
            onChangeText={setText}
            multiline
            numberOfLines={4}
            placeholder="e.g. 2 loaves of bread, a bag of rice, toothpaste. It's urgent, call me when you arrive"
            editable={!isParsing}
          />

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <Button label="Parse with AI" onPress={handleParse} loading={isParsing} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(26,16,19,0.55)",
    alignItems: "center",
    justifyContent: "center",
    padding: theme.spacing.lg,
  },
  card: {
    width: "100%",
    maxWidth: 380,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.xl,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: theme.spacing.sm,
  },
  headerTitleGroup: { flexDirection: "row", alignItems: "center", gap: 8 },
  title: {
    fontFamily: theme.fonts.display,
    fontSize: 19,
    color: theme.colors.primaryDark,
  },
  body: {
    fontFamily: theme.fonts.ui,
    fontSize: 14,
    color: theme.colors.textMuted,
    lineHeight: 20,
    marginBottom: theme.spacing.md,
  },
  errorText: {
    fontFamily: theme.fonts.ui,
    fontSize: 13,
    color: theme.colors.danger,
    marginBottom: theme.spacing.sm,
  },
});
