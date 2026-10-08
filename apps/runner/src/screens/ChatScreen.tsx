import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Pressable,
} from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useAudioRecorder, RecordingPresets, setAudioModeAsync } from "expo-audio";
import { ensurePermission } from "../lib/permissions";
import * as FileSystem from "expo-file-system/legacy";
import { Phone, Video, Mic, Send, X, Check } from "lucide-react-native";
import { getTheme } from "@gracerandly/theme";
import { useAuth } from "../context/AuthContext";
import { useChat } from "../lib/chatSocket";
import { fetchChatParticipant, type ChatParticipant } from "../lib/chatApi";
import type { LocalChatMessage } from "../lib/chatDb";
import Avatar from "../components/Avatar";
import VoiceNoteBubble from "../components/VoiceNoteBubble";
import CallOverlay from "../components/CallOverlay";
import NoticeModal from "../components/NoticeModal";
import type { MainStackParamList } from "../navigation/types";

const theme = getTheme("light");

const ROLE = "runner" as const;
const MAX_VOICE_NOTE_SECONDS = 60;

type Props = NativeStackScreenProps<MainStackParamList, "Chat">;

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export default function ChatScreen({ route, navigation }: Props) {
  const { errandId } = route.params;
  const { token, user } = useAuth();
  const chat = useChat({ errandId, token, ownUserId: user?.id ?? null, role: ROLE });
  const [participant, setParticipant] = useState<ChatParticipant | null>(null);
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const listRef = useRef<FlatList<LocalChatMessage>>(null);

  // --- Voice recording ---
  const recorder = useAudioRecorder(RecordingPresets.LOW_QUALITY);
  const [isRecording, setIsRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [showNotConnected, setShowNotConnected] = useState(false);

  useEffect(() => {
    if (!token) return;
    fetchChatParticipant(ROLE, errandId, token)
      .then(setParticipant)
      .catch(() => {
        // Header just falls back to a generic label — chat still works.
      });
  }, [errandId, token]);

  const otherName = participant?.name ?? "Requester";

  useLayoutEffect(() => {
    navigation.setOptions({
      headerTitle: () => (
        <View style={styles.headerTitle}>
          <Avatar name={otherName} uri={participant?.avatarUrl} size={32} />
          <Text style={styles.headerName} numberOfLines={1}>
            {otherName}
          </Text>
        </View>
      ),
      headerRight: () => (
        <View style={styles.headerActions}>
          <Pressable hitSlop={8} onPress={() => chat.startCall("audio")} disabled={chat.connectionState !== "open"}>
            <Phone size={22} color={chat.connectionState === "open" ? theme.colors.primary : theme.colors.textMuted} />
          </Pressable>
          <Pressable hitSlop={8} onPress={() => chat.startCall("video")} disabled={chat.connectionState !== "open"}>
            <Video size={22} color={chat.connectionState === "open" ? theme.colors.primary : theme.colors.textMuted} />
          </Pressable>
        </View>
      ),
    });
    // chat's call starters are stable callbacks; connectionState is the only
    // part of it the header actually needs to re-render for.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigation, otherName, participant?.avatarUrl, chat.connectionState]);

  function handleSend() {
    if (editingId) {
      if (chat.sendEdit(editingId, draft)) {
        setEditingId(null);
        setDraft("");
      }
      return;
    }
    if (chat.sendText(draft)) setDraft("");
  }

  function startEditing(message: LocalChatMessage) {
    if (message.senderRole !== ROLE || message.contentType !== "text") return;
    setEditingId(message.id);
    setDraft(message.content);
  }

  function cancelEditing() {
    setEditingId(null);
    setDraft("");
  }

  async function startRecording() {
    // Branded explainer first, then the OS dialog (see lib/permissions.ts);
    // if they decline, the card itself has already told them what to do.
    if ((await ensurePermission("microphone")) !== "granted") return;
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    await recorder.prepareToRecordAsync();
    recorder.record();
    setRecordSeconds(0);
    setIsRecording(true);
  }

  async function stopRecording(send: boolean) {
    setIsRecording(false);
    await recorder.stop();
    await setAudioModeAsync({ allowsRecording: false });
    const uri = recorder.uri;
    if (!send || !uri) return;
    const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
    if (!chat.sendAudio(base64)) setShowNotConnected(true);
  }

  // Tick the visible timer while recording, and stop-and-send at the cap.
  useEffect(() => {
    if (!isRecording) return;
    const interval = setInterval(() => {
      setRecordSeconds((s) => {
        if (s + 1 >= MAX_VOICE_NOTE_SECONDS) {
          stopRecording(true);
          return s + 1;
        }
        return s + 1;
      });
    }, 1000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRecording]);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={90}
    >
      {chat.connectionState !== "open" ? (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>
            {chat.connectionState === "connecting" ? "Connecting…" : "Disconnected — reconnecting…"}
          </Text>
        </View>
      ) : null}

      <FlatList
        ref={listRef}
        data={chat.messages}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
        renderItem={({ item }) => {
          const isMine = item.senderRole === ROLE;
          const avatar = isMine ? (
            <Avatar name={user?.fullName ?? "Me"} uri={user?.avatarUrl} size={28} />
          ) : (
            <Avatar name={otherName} uri={participant?.avatarUrl} size={28} />
          );
          return (
            <View style={[styles.bubbleRow, isMine && styles.bubbleRowMine]}>
              {!isMine ? avatar : null}
              <Pressable
                onLongPress={() => startEditing(item)}
                delayLongPress={350}
                style={[styles.bubble, isMine ? styles.bubbleMine : styles.bubbleTheirs]}
              >
                {item.contentType === "audio" ? (
                  <VoiceNoteBubble messageId={item.id} base64Audio={item.content} isMine={isMine} />
                ) : (
                  <Text style={[styles.bubbleText, isMine && styles.bubbleTextMine]}>{item.content}</Text>
                )}
                <Text style={[styles.bubbleTime, isMine && styles.bubbleTimeMine]}>
                  {item.edited ? "edited · " : ""}
                  {formatTime(item.createdAt)}
                </Text>
              </Pressable>
              {isMine ? avatar : null}
            </View>
          );
        }}
        ListEmptyComponent={
          <Text style={styles.emptyText}>No messages yet — say hello to coordinate the errand.</Text>
        }
      />

      {editingId ? (
        <View style={styles.editBar}>
          <Text style={styles.editBarText}>Editing message</Text>
          <Pressable hitSlop={8} onPress={cancelEditing}>
            <X size={18} color={theme.colors.textMuted} />
          </Pressable>
        </View>
      ) : null}

      {isRecording ? (
        <View style={styles.composer}>
          <Pressable hitSlop={8} onPress={() => stopRecording(false)}>
            <X size={24} color={theme.colors.danger} />
          </Pressable>
          <Text style={styles.recordingText}>
            ● Recording {Math.floor(recordSeconds / 60)}:{String(recordSeconds % 60).padStart(2, "0")}
          </Text>
          <Pressable hitSlop={8} onPress={() => stopRecording(true)}>
            <Send size={24} color={theme.colors.primary} />
          </Pressable>
        </View>
      ) : (
        <View style={styles.composer}>
          <TextInput
            style={styles.input}
            value={draft}
            onChangeText={setDraft}
            placeholder={`Message ${otherName}…`}
            placeholderTextColor={theme.colors.textMuted}
            multiline
            maxLength={2000}
          />
          {draft.trim() ? (
            <Pressable hitSlop={8} onPress={handleSend} disabled={chat.connectionState !== "open"} style={styles.actionButton}>
              {editingId ? (
                <Check size={24} color={chat.connectionState === "open" ? theme.colors.primary : theme.colors.textMuted} />
              ) : (
                <Send size={24} color={chat.connectionState === "open" ? theme.colors.primary : theme.colors.textMuted} />
              )}
            </Pressable>
          ) : (
            <Pressable hitSlop={8} onPress={startRecording} disabled={chat.connectionState !== "open"} style={styles.actionButton}>
              <Mic size={24} color={chat.connectionState === "open" ? theme.colors.primary : theme.colors.textMuted} />
            </Pressable>
          )}
        </View>
      )}

      {token ? (
        <CallOverlay
          role={ROLE}
          errandId={errandId}
          authToken={token}
          participant={participant}
          callState={chat.callState}
          callMode={chat.callMode}
          onAccept={chat.acceptCall}
          onDecline={chat.declineCall}
          onEnd={chat.endCall}
        />
      ) : null}

      <NoticeModal
        visible={chat.callUnavailable}
        title="Can't call right now"
        body={`${otherName} isn't online in this chat.`}
        onClose={chat.dismissCallUnavailable}
      />
      <NoticeModal
        visible={showNotConnected}
        title="Not connected"
        body="Couldn't send the voice note — try again once reconnected."
        onClose={() => setShowNotConnected(false)}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  headerTitle: { flexDirection: "row", alignItems: "center", gap: 10 },
  headerName: { fontFamily: theme.fonts.uiSemibold, fontSize: 17, color: theme.colors.text, maxWidth: 180 },
  headerActions: { flexDirection: "row", gap: 22, alignItems: "center" },
  banner: { backgroundColor: theme.colors.accent, paddingVertical: 6, alignItems: "center" },
  bannerText: { fontFamily: theme.fonts.ui, fontSize: 12, color: theme.colors.text },
  list: { padding: theme.spacing.md, flexGrow: 1 },
  emptyText: {
    fontFamily: theme.fonts.ui,
    fontSize: 14,
    color: theme.colors.textMuted,
    textAlign: "center",
    marginTop: theme.spacing.xl,
  },
  bubbleRow: { flexDirection: "row", alignItems: "flex-end", marginBottom: 10, gap: 6 },
  bubbleRowMine: { justifyContent: "flex-end" },
  bubble: { maxWidth: "72%", borderRadius: theme.radius.lg, paddingHorizontal: 14, paddingVertical: 10 },
  bubbleTheirs: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderBottomLeftRadius: 4,
  },
  bubbleMine: { backgroundColor: theme.colors.primary, borderBottomRightRadius: 4 },
  bubbleText: { fontFamily: theme.fonts.uiMedium, fontSize: 15, color: theme.colors.text },
  bubbleTextMine: { color: theme.colors.textOnPrimary },
  bubbleTime: { fontFamily: theme.fonts.ui, fontSize: 10, color: theme.colors.textMuted, marginTop: 4, textAlign: "right" },
  bubbleTimeMine: { color: theme.colors.textOnPrimary, opacity: 0.8 },
  editBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 8,
    backgroundColor: theme.colors.accent,
  },
  editBarText: { fontFamily: theme.fonts.uiMedium, fontSize: 13, color: theme.colors.text },
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
  actionButton: { paddingVertical: 10, paddingHorizontal: 4 },
  recordingText: { flex: 1, textAlign: "center", fontFamily: theme.fonts.uiMedium, fontSize: 15, color: theme.colors.danger },
});
