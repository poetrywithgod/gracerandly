import { useRef, useState } from "react";
import { View, Text, StyleSheet, FlatList, TextInput, KeyboardAvoidingView, Platform } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { getTheme } from "@gracerandly/theme";
import type { ChatMessage } from "@gracerandly/shared-types";
import { useAuth } from "../context/AuthContext";
import { useChat } from "../lib/chatSocket";
import type { MainStackParamList } from "../navigation/types";

const theme = getTheme("light");

type Props = NativeStackScreenProps<MainStackParamList, "Chat">;

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export default function ChatScreen({ route }: Props) {
  const { errandId } = route.params;
  const { token, user } = useAuth();
  const { messages, connectionState, sendMessage } = useChat(errandId, token, user?.id ?? null);
  const [draft, setDraft] = useState("");
  const listRef = useRef<FlatList<ChatMessage>>(null);

  function handleSend() {
    if (sendMessage(draft)) setDraft("");
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={90}
    >
      {connectionState !== "open" ? (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>
            {connectionState === "connecting" ? "Connecting…" : "Disconnected — reconnecting…"}
          </Text>
        </View>
      ) : null}

      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
        renderItem={({ item }) => {
          const isMine = item.senderRole === "runner";
          return (
            <View style={[styles.bubbleRow, isMine && styles.bubbleRowMine]}>
              <View style={[styles.bubble, isMine ? styles.bubbleMine : styles.bubbleTheirs]}>
                <Text style={[styles.bubbleText, isMine && styles.bubbleTextMine]}>{item.content}</Text>
                <Text style={[styles.bubbleTime, isMine && styles.bubbleTimeMine]}>{formatTime(item.createdAt)}</Text>
              </View>
            </View>
          );
        }}
        ListEmptyComponent={
          <Text style={styles.emptyText}>No messages yet — say hello to coordinate the errand.</Text>
        }
      />

      <View style={styles.composer}>
        <TextInput
          style={styles.input}
          value={draft}
          onChangeText={setDraft}
          placeholder="Message the requester…"
          placeholderTextColor={theme.colors.textMuted}
          multiline
          maxLength={2000}
        />
        <Text
          style={[styles.sendButton, (!draft.trim() || connectionState !== "open") && styles.sendButtonDisabled]}
          onPress={handleSend}
        >
          Send
        </Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  banner: {
    backgroundColor: theme.colors.accent,
    paddingVertical: 6,
    alignItems: "center",
  },
  bannerText: { fontFamily: theme.fonts.ui, fontSize: 12, color: theme.colors.text },
  list: { padding: theme.spacing.md, flexGrow: 1 },
  emptyText: {
    fontFamily: theme.fonts.ui,
    fontSize: 14,
    color: theme.colors.textMuted,
    textAlign: "center",
    marginTop: theme.spacing.xl,
  },
  bubbleRow: { flexDirection: "row", marginBottom: 10 },
  bubbleRowMine: { justifyContent: "flex-end" },
  bubble: {
    maxWidth: "78%",
    borderRadius: theme.radius.lg,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  bubbleTheirs: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderBottomLeftRadius: 4,
  },
  bubbleMine: {
    backgroundColor: theme.colors.primary,
    borderBottomRightRadius: 4,
  },
  bubbleText: { fontFamily: theme.fonts.uiMedium, fontSize: 15, color: theme.colors.text },
  bubbleTextMine: { color: theme.colors.textOnPrimary },
  bubbleTime: { fontFamily: theme.fonts.ui, fontSize: 10, color: theme.colors.textMuted, marginTop: 4, textAlign: "right" },
  bubbleTimeMine: { color: theme.colors.textOnPrimary, opacity: 0.8 },
  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    padding: theme.spacing.md,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  input: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontFamily: theme.fonts.uiMedium,
    fontSize: 15,
    color: theme.colors.text,
    maxHeight: 120,
    marginRight: theme.spacing.sm,
  },
  sendButton: {
    fontFamily: theme.fonts.uiMedium,
    fontSize: 15,
    color: theme.colors.primary,
    paddingVertical: 12,
    paddingHorizontal: 4,
  },
  sendButtonDisabled: { color: theme.colors.textMuted },
});
