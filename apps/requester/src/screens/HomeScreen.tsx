import { useCallback, useEffect, useState } from "react";
import { View, Text, FlatList, RefreshControl, StyleSheet } from "react-native";
import { useFocusEffect, useNavigation, type CompositeNavigationProp } from "@react-navigation/native";
import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { getTheme } from "@gracerandly/theme";
import type { Errand } from "@gracerandly/shared-types";
import Button from "../components/Button";
import ErrandCard from "../components/ErrandCard";
import { ErrandCardSkeleton } from "../components/Skeleton";
import { useAuth } from "../context/AuthContext";
import { apiFetch, ApiError } from "../lib/apiClient";
import type { MainStackParamList, TabParamList } from "../navigation/types";

const theme = getTheme("light");

type HomeNavigationProp = CompositeNavigationProp<
  BottomTabNavigationProp<TabParamList, "Home">,
  NativeStackNavigationProp<MainStackParamList>
>;

export default function HomeScreen() {
  const { user, token } = useAuth();
  const navigation = useNavigation<HomeNavigationProp>();

  const [errands, setErrands] = useState<Errand[] | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadErrands = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setIsRefreshing(true);
      setLoadError(null);
      try {
        const response = await apiFetch<{ errands: Errand[] }>("/errands", {
          headers: { Authorization: `Bearer ${token}` },
        });
        setErrands(response.errands);
      } catch (err) {
        setLoadError(err instanceof ApiError ? err.message : "Couldn't load your errands");
      } finally {
        if (isRefresh) setIsRefreshing(false);
      }
    },
    [token]
  );

  // Refresh whenever Home regains focus (e.g. coming back from posting an
  // errand) rather than only once on mount.
  useFocusEffect(
    useCallback(() => {
      loadErrands();
    }, [loadErrands])
  );

  return (
    <FlatList
      style={styles.flex}
      contentContainerStyle={styles.content}
      data={errands ?? []}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => <ErrandCard errand={item} />}
      refreshControl={
        <RefreshControl refreshing={isRefreshing} onRefresh={() => loadErrands(true)} />
      }
      ListHeaderComponent={
        <View>
          {user ? <Text style={styles.welcome}>Welcome back, {user.fullName.split(" ")[0]}</Text> : null}
          <Button
            label="Post an errand"
            onPress={() => navigation.navigate("CreateErrand")}
            style={styles.postButton}
          />
          <Text style={styles.sectionTitle}>Recent errands</Text>
        </View>
      }
      ListEmptyComponent={
        errands === null ? (
          <View>
            <ErrandCardSkeleton />
            <ErrandCardSkeleton />
            <ErrandCardSkeleton />
          </View>
        ) : loadError ? (
          <Text style={styles.errorText}>{loadError}</Text>
        ) : (
          <Text style={styles.emptyText}>No errands yet — post your first one above.</Text>
        )
      }
    />
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: theme.colors.background },
  content: { padding: theme.spacing.lg, paddingBottom: theme.spacing.xxl },
  welcome: {
    fontFamily: theme.fonts.uiMedium,
    fontSize: 16,
    color: theme.colors.text,
    marginBottom: theme.spacing.md,
  },
  postButton: { marginBottom: theme.spacing.xl },
  sectionTitle: {
    fontFamily: theme.fonts.uiSemibold,
    fontSize: 15,
    color: theme.colors.text,
    marginBottom: theme.spacing.sm,
  },
  errorText: {
    fontFamily: theme.fonts.ui,
    fontSize: 13,
    color: theme.colors.danger,
  },
  emptyText: {
    fontFamily: theme.fonts.ui,
    fontSize: 13,
    color: theme.colors.textMuted,
  },
});
