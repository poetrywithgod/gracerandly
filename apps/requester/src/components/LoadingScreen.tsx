import { View, Image, Text, ActivityIndicator, StyleSheet } from "react-native";
import { getTheme } from "@gracerandly/theme";

const theme = getTheme("light");

interface LoadingScreenProps {
  message?: string;
}

export default function LoadingScreen({ message }: LoadingScreenProps) {
  return (
    <View style={styles.container}>
      <Image
        source={require("../../assets/brand-icon-badge.png")}
        style={styles.badge}
        resizeMode="contain"
      />
      <ActivityIndicator color={theme.colors.primary} size="small" style={styles.spinner} />
      {message ? <Text style={styles.message}>{message}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
    alignItems: "center",
    justifyContent: "center",
  },
  badge: {
    width: 84,
    height: 84,
    borderRadius: theme.radius.lg,
    marginBottom: theme.spacing.lg,
  },
  spinner: {
    marginBottom: theme.spacing.sm,
  },
  message: {
    fontFamily: theme.fonts.uiMedium,
    fontSize: 14,
    color: theme.colors.textMuted,
  },
});
