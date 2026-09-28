import { useEffect, useState } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import * as FileSystem from "expo-file-system/legacy";
import { Play, Pause } from "lucide-react-native";
import { getTheme } from "@gracerandly/theme";

const theme = getTheme("light");

interface VoiceNoteBubbleProps {
  messageId: string;
  base64Audio: string;
  isMine: boolean;
}

/**
 * Plays a voice note stored as base64 in local chat history. The audio
 * player needs a file (or URL), so the first play writes the base64 out to
 * the cache directory and points the player at that — cache, not
 * documents, since it's fine for the OS to reclaim it and the real copy
 * always lives in SQLite (see lib/chatDb.ts).
 */
export default function VoiceNoteBubble({ messageId, base64Audio, isMine }: VoiceNoteBubbleProps) {
  const [uri, setUri] = useState<string | null>(null);
  const [wantsPlay, setWantsPlay] = useState(false);
  const player = useAudioPlayer(uri ? { uri } : null);
  const status = useAudioPlayerStatus(player);

  useEffect(() => {
    if (uri && wantsPlay) {
      player.play();
      setWantsPlay(false);
    }
  }, [uri, wantsPlay, player]);

  async function handlePress() {
    if (status.playing) {
      player.pause();
      return;
    }
    if (!uri) {
      const path = `${FileSystem.cacheDirectory}voice-${messageId}.m4a`;
      await FileSystem.writeAsStringAsync(path, base64Audio, { encoding: FileSystem.EncodingType.Base64 });
      setWantsPlay(true);
      setUri(path);
      return;
    }
    // Finished earlier — start over from the top.
    if (status.duration > 0 && status.currentTime >= status.duration - 0.05) player.seekTo(0);
    player.play();
  }

  const seconds = Math.round(status.duration > 0 ? status.duration : 0);
  const iconColor = isMine ? theme.colors.textOnPrimary : theme.colors.primary;

  return (
    <Pressable style={styles.row} onPress={handlePress}>
      {status.playing ? <Pause size={20} color={iconColor} /> : <Play size={20} color={iconColor} />}
      <View style={[styles.track, { backgroundColor: isMine ? "rgba(255,255,255,0.4)" : theme.colors.border }]}>
        <View
          style={[
            styles.progress,
            {
              backgroundColor: iconColor,
              width: `${status.duration > 0 ? Math.min(100, (status.currentTime / status.duration) * 100) : 0}%`,
            },
          ]}
        />
      </View>
      <Text style={[styles.label, { color: isMine ? theme.colors.textOnPrimary : theme.colors.textMuted }]}>
        {seconds > 0 ? `${seconds}s` : "Voice note"}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", minWidth: 180 },
  track: { flex: 1, height: 4, borderRadius: 2, marginHorizontal: 10, overflow: "hidden" },
  progress: { height: 4, borderRadius: 2 },
  label: { fontFamily: theme.fonts.ui, fontSize: 12 },
});
