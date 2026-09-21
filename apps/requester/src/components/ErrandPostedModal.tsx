import { Modal, View, Image, Text, StyleSheet } from "react-native";
import { getTheme } from "@gracerandly/theme";
import Button from "./Button";

const theme = getTheme("light");

interface ErrandPostedModalProps {
  visible: boolean;
  onDone: () => void;
}

export default function ErrandPostedModal({ visible, onDone }: ErrandPostedModalProps) {
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Image
            source={require("../../assets/brand-icon-badge.png")}
            style={styles.badge}
            resizeMode="contain"
          />
          <Text style={styles.title}>Errand posted!</Text>
          <Text style={styles.body}>
            We're finding a runner near you. You'll get an update as soon as one accepts.
          </Text>
          <Button label="Done" onPress={onDone} style={styles.button} />
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
    alignItems: "center",
  },
  badge: {
    width: 64,
    height: 64,
    borderRadius: theme.radius.md,
    marginBottom: theme.spacing.md,
  },
  title: {
    fontFamily: theme.fonts.display,
    fontSize: 22,
    color: theme.colors.primaryDark,
    marginBottom: theme.spacing.sm,
    textAlign: "center",
  },
  body: {
    fontFamily: theme.fonts.ui,
    fontSize: 14,
    color: theme.colors.textMuted,
    textAlign: "center",
    marginBottom: theme.spacing.lg,
    lineHeight: 20,
  },
  button: { alignSelf: "stretch" },
});
