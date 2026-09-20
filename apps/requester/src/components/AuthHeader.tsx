import { View, Text, Image, StyleSheet } from "react-native";
import { getTheme } from "@gracerandly/theme";

const theme = getTheme("light");

interface AuthHeaderProps {
  heading: string;
}

export default function AuthHeader({ heading }: AuthHeaderProps) {
  return (
    <View style={styles.wrapper}>
      <Image
        source={require("../../assets/brand-mark.png")}
        style={styles.mark}
        resizeMode="contain"
      />
      <Text style={styles.wordmark}>Gracerandly</Text>
      <Text style={styles.heading}>{heading}</Text>
      <Text style={styles.tagline}>Get it done without leaving.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { alignItems: "center", marginBottom: theme.spacing.xl },
  mark: { width: 64, height: 64, marginBottom: theme.spacing.sm },
  wordmark: {
    fontFamily: theme.fonts.display,
    fontSize: 22,
    letterSpacing: 0.3,
    color: theme.colors.textOnPrimary,
    marginBottom: theme.spacing.md,
  },
  heading: {
    fontFamily: theme.fonts.display,
    fontSize: 26,
    color: theme.colors.textOnPrimary,
    marginBottom: 4,
    textAlign: "center",
  },
  tagline: {
    fontFamily: theme.fonts.ui,
    fontSize: 14,
    color: "rgba(255,255,255,0.75)",
  },
});
