import { View, Text, Image, StyleSheet } from "react-native";
import { getTheme } from "@gracerandly/theme";

const theme = getTheme("light");

interface AvatarProps {
  name: string;
  /** A data URI or hosted URL — see the avatarUrl comment in apps/api's schema. */
  uri?: string;
  size?: number;
}

/** Profile picture, falling back to the person's initial when they haven't set one. */
export default function Avatar({ name, uri, size = 36 }: AvatarProps) {
  const dimension = { width: size, height: size, borderRadius: size / 2 };
  if (uri) return <Image source={{ uri }} style={[styles.image, dimension]} />;
  return (
    <View style={[styles.fallback, dimension]}>
      <Text style={[styles.initial, { fontSize: size * 0.42 }]}>{name.trim().charAt(0).toUpperCase() || "?"}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  image: { backgroundColor: theme.colors.border },
  fallback: { backgroundColor: theme.colors.primary, alignItems: "center", justifyContent: "center" },
  initial: { fontFamily: theme.fonts.uiSemibold, color: theme.colors.textOnPrimary },
});
