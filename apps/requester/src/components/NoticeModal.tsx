// Identical to apps/runner/src/components/NoticeModal.tsx — see
// GlassCard.tsx's header comment for why it's duplicated rather than shared.
import { Modal, View, Text, StyleSheet } from "react-native";
import { getTheme } from "@gracerandly/theme";
import Button from "./Button";

const theme = getTheme("light");

interface NoticeModalProps {
  visible: boolean;
  title: string;
  body?: string;
  buttonLabel?: string;
  onClose: () => void;
}

/**
 * The branded replacement for a one-button Alert.alert — "something happened,
 * got it". Use ConfirmModal when the person has a real choice to make.
 */
export default function NoticeModal({ visible, title, body, buttonLabel = "OK", onClose }: NoticeModalProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>{title}</Text>
          {body ? <Text style={styles.body}>{body}</Text> : null}
          <Button label={buttonLabel} onPress={onClose} />
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
    maxWidth: 340,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.xl,
  },
  title: {
    fontFamily: theme.fonts.display,
    fontSize: 20,
    color: theme.colors.primaryDark,
    marginBottom: theme.spacing.sm,
  },
  body: {
    fontFamily: theme.fonts.ui,
    fontSize: 14,
    color: theme.colors.textMuted,
    lineHeight: 20,
    marginBottom: theme.spacing.lg,
  },
});
