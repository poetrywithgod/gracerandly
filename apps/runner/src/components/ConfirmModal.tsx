// Identical to apps/requester/src/components/ConfirmModal.tsx — see
// GlassCard.tsx's header comment for why it's duplicated rather than shared.
import { Modal, View, Text, StyleSheet } from "react-native";
import { getTheme } from "@gracerandly/theme";
import Button from "./Button";

const theme = getTheme("light");

interface ConfirmModalProps {
  visible: boolean;
  title: string;
  body?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Styles the confirm button as destructive (danger variant). */
  destructive?: boolean;
  isConfirming?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * The app's one branded confirmation dialog — used anywhere a screen would
 * otherwise reach for the native Alert.alert (sign out, cancel an errand,
 * discard changes, etc). Alert.alert renders as a bare OS dialog with none
 * of the app's fonts/colors, which is why this exists instead.
 */
export default function ConfirmModal({
  visible,
  title,
  body,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
  isConfirming = false,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>{title}</Text>
          {body ? <Text style={styles.body}>{body}</Text> : null}
          <View style={styles.actions}>
            <Button
              label={cancelLabel}
              variant="ghost"
              onPress={onCancel}
              disabled={isConfirming}
              style={styles.actionButton}
            />
            <Button
              label={confirmLabel}
              variant={destructive ? "danger" : "primary"}
              onPress={onConfirm}
              loading={isConfirming}
              style={styles.actionButton}
            />
          </View>
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
  actions: {
    flexDirection: "row",
    gap: theme.spacing.sm,
  },
  actionButton: { flex: 1 },
});
