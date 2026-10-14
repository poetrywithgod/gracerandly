// Identical to apps/runner/src/components/CallLogRow.tsx — see
// GlassCard.tsx's header comment for why it's duplicated.
//
// One centered line in the chat thread recording a call: who started it and
// how it went (answered with its length, declined, or not answered). Drawn
// from the local "call" rows chatSocket.ts writes when a call ends.
import { View, Text, StyleSheet } from "react-native";
import { Phone, Video, PhoneMissed, PhoneOff } from "lucide-react-native";
import { getTheme } from "@gracerandly/theme";
import { parseCallLog, type LocalChatMessage } from "../lib/chatDb";
import { formatDuration } from "./CallOverlay";

const theme = getTheme("light");

interface CallLogRowProps {
  message: LocalChatMessage;
  /** This device's own role. */
  ownRole: "requester" | "runner";
  otherName: string;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export default function CallLogRow({ message, ownRole, otherName }: CallLogRowProps) {
  const log = parseCallLog(message.content);
  if (!log) return null;

  const startedByMe = log.caller === ownRole;
  const kind = log.mode === "video" ? "video" : "voice";
  const title = startedByMe ? `You started a ${kind} call` : `${otherName} started a ${kind} call`;

  let detail: string;
  let tone: "good" | "bad" | "neutral";
  if (log.outcome === "completed") {
    detail = `Accepted · ${formatDuration(log.durationSec)}`;
    tone = "good";
  } else if (log.outcome === "declined") {
    detail = startedByMe ? `Declined by ${otherName}` : "You declined";
    tone = "bad";
  } else {
    detail = startedByMe ? "No answer" : "Missed";
    tone = "bad";
  }

  const color = tone === "good" ? theme.colors.success : tone === "bad" ? theme.colors.danger : theme.colors.textMuted;
  const Icon =
    log.outcome === "completed"
      ? log.mode === "video"
        ? Video
        : Phone
      : log.outcome === "declined"
        ? PhoneOff
        : PhoneMissed;

  return (
    <View style={styles.wrap}>
      <View style={styles.pill}>
        <View style={[styles.iconWrap, { backgroundColor: color }]}>
          <Icon size={14} color="#fff" />
        </View>
        <View>
          <Text style={styles.title}>{title}</Text>
          <Text style={[styles.detail, { color }]}>
            {detail} · {formatTime(message.createdAt)}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", marginVertical: 8 },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  iconWrap: { width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  title: { fontFamily: theme.fonts.uiMedium, fontSize: 13, color: theme.colors.text },
  detail: { fontFamily: theme.fonts.uiMedium, fontSize: 12, marginTop: 1 },
});
