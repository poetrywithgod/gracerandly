import { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, FlatList, RefreshControl, Pressable } from "react-native";
import { useNavigation, type CompositeNavigationProp } from "@react-navigation/native";
import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { getTheme } from "@gracerandly/theme";
import type { Errand } from "@gracerandly/shared-types";
import { useAuth } from "../context/AuthContext";
import { apiFetch, ApiError } from "../lib/apiClient";
import { getCurrentCoordinate, LocationPermissionDeniedError } from "../lib/location";
import Button from "../components/Button";
import type { MainStackParamList, TabParamList } from "../navigation/types";

const theme = getTheme("light");

type HomeNavigationProp = CompositeNavigationProp<
  BottomTabNavigationProp<TabParamList, "Home">,
  NativeStackNavigationProp<MainStackParamList>
>;

const ACTIVE_STATUSES: Errand["status"][] = ["accepted", "en_route_to_pickup", "in_progress", "en_route_to_delivery"];

const CATEGORY_LABELS: Record<Errand["category"], string> = {
  grocery: "Grocery",
  pharmacy: "Pharmacy",
  food: "Food",
  parcel: "Parcel",
  miscellaneous: "Other",
};

export default function HomeScreen() {
  const navigation = useNavigation<HomeNavigationProp>();
  const { user, token, setOnlineStatus, refreshUser } = useAuth();

  const [myErrands, setMyErrands] = useState<Errand[]>([]);
  const [available, setAvailable] = useState<Errand[]>([]);
  const [radiusMiles, setRadiusMiles] = useState<number | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isTogglingOnline, setIsTogglingOnline] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setError(null);
    try {
      const mineResponse = await apiFetch<{ errands: Errand[] }>("/runners/errands/mine", {
        headers: { Authorization: `Bearer ${token}` },
      });
      setMyErrands(mineResponse.errands.filter((e) => ACTIVE_STATUSES.includes(e.status)));

      if (user?.isOnline && user.currentLocation) {
        const params = new URLSearchParams({
          lat: String(user.currentLocation.lat),
          lng: String(user.currentLocation.lng),
        });
        const availableResponse = await apiFetch<{ errands: Errand[]; radiusMiles: number | null }>(
          `/runners/errands/available?${params.toString()}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        setAvailable(availableResponse.errands);
        setRadiusMiles(availableResponse.radiusMiles);
      } else {
        setAvailable([]);
        setRadiusMiles(null);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't load errands");
    }
  }, [token, user?.isOnline, user?.currentLocation]);

  useEffect(() => {
    load();
  }, [load]);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await load();
    setIsRefreshing(false);
  }, [load]);

  const handleToggleOnline = useCallback(async () => {
    setError(null);
    setIsTogglingOnline(true);
    try {
      if (user?.isOnline) {
        await setOnlineStatus(false);
      } else {
        const coordinate = await getCurrentCoordinate();
        await setOnlineStatus(true, { lat: coordinate.latitude, lng: coordinate.longitude, heading: coordinate.heading });
      }
      await refreshUser();
    } catch (err) {
      if (err instanceof LocationPermissionDeniedError) {
        setError(err.message);
      } else {
        setError(err instanceof ApiError ? err.message : "Couldn't update your status");
      }
    } finally {
      setIsTogglingOnline(false);
    }
  }, [user?.isOnline, setOnlineStatus, refreshUser]);

  const handleAccept = useCallback(
    async (errandId: string) => {
      setError(null);
      try {
        await apiFetch(`/runners/errands/${errandId}/accept`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
        await load();
        navigation.navigate("ErrandDetail", { errandId });
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Couldn't accept this errand");
      }
    },
    [token, load, navigation]
  );

  const atCapacity = myErrands.length >= 3;

  return (
    <FlatList
      contentContainerStyle={styles.list}
      refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor={theme.colors.primary} />}
      ListHeaderComponent={
        <View>
          <View style={styles.toggleCard}>
            <View>
              <Text style={styles.toggleTitle}>{user?.isOnline ? "You're online" : "You're offline"}</Text>
              <Text style={styles.toggleSubtitle}>
                {user?.isOnline ? "Nearby errands will show up below" : "Go online to start seeing nearby errands"}
              </Text>
            </View>
            <Button
              label={user?.isOnline ? "Go offline" : "Go online"}
              onPress={handleToggleOnline}
              variant={user?.isOnline ? "danger" : "primary"}
              loading={isTogglingOnline}
            />
          </View>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          {myErrands.length > 0 ? (
            <View>
              <Text style={styles.sectionTitle}>My active errands ({myErrands.length}/3)</Text>
              {myErrands.map((errand) => (
                <ErrandCard
                  key={errand.id}
                  errand={errand}
                  onPress={() => navigation.navigate("ErrandDetail", { errandId: errand.id })}
                />
              ))}
            </View>
          ) : null}

          <View style={styles.sectionTitleRow}>
            <Text style={styles.sectionTitle}>Available nearby</Text>
            {radiusMiles ? <Text style={styles.radiusLabel}>within {radiusMiles} mi</Text> : null}
          </View>

          {!user?.isOnline ? <Text style={styles.emptyText}>Go online to see errands near you.</Text> : null}
          {user?.isOnline && atCapacity ? (
            <Text style={styles.emptyText}>You&apos;re at your 3-errand limit — finish one to see more.</Text>
          ) : null}
          {user?.isOnline && !atCapacity && available.length === 0 ? (
            <Text style={styles.emptyText}>No open errands nearby right now.</Text>
          ) : null}
        </View>
      }
      data={user?.isOnline && !atCapacity ? available : []}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => (
        <ErrandCard
          errand={item}
          onPress={() => navigation.navigate("ErrandDetail", { errandId: item.id })}
          actionLabel="Accept"
          onAction={() => handleAccept(item.id)}
        />
      )}
    />
  );
}

function ErrandCard({
  errand,
  onPress,
  actionLabel,
  onAction,
}: {
  errand: Errand;
  onPress: () => void;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <Pressable style={styles.card} onPress={onPress}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardCategory}>{CATEGORY_LABELS[errand.category]}</Text>
        <Text style={styles.cardCost}>₦{errand.estimatedCost.toLocaleString()}</Text>
      </View>
      <Text style={styles.cardAddress} numberOfLines={1}>
        Pickup: {errand.pickup.address ?? `${errand.pickup.lat.toFixed(3)}, ${errand.pickup.lng.toFixed(3)}`}
      </Text>
      <Text style={styles.cardAddress} numberOfLines={1}>
        Drop-off: {errand.dropoff.address ?? `${errand.dropoff.lat.toFixed(3)}, ${errand.dropoff.lng.toFixed(3)}`}
      </Text>
      <Text style={styles.cardStatus}>{errand.status.replace(/_/g, " ")}</Text>
      {actionLabel && onAction ? <Button label={actionLabel} onPress={onAction} style={styles.cardButton} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  list: { padding: theme.spacing.lg, gap: theme.spacing.sm },
  toggleCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginBottom: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  toggleTitle: { fontFamily: theme.fonts.uiSemibold, fontSize: 16, color: theme.colors.text },
  toggleSubtitle: { fontFamily: theme.fonts.ui, fontSize: 12, color: theme.colors.textMuted, maxWidth: 180 },
  errorText: { fontFamily: theme.fonts.uiMedium, fontSize: 13, color: theme.colors.danger, marginBottom: theme.spacing.md },
  sectionTitleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sectionTitle: {
    fontFamily: theme.fonts.uiSemibold,
    fontSize: 14,
    color: theme.colors.text,
    marginTop: theme.spacing.md,
    marginBottom: theme.spacing.sm,
  },
  radiusLabel: { fontFamily: theme.fonts.ui, fontSize: 12, color: theme.colors.textMuted },
  emptyText: { fontFamily: theme.fonts.ui, fontSize: 13, color: theme.colors.textMuted, paddingVertical: theme.spacing.md },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginBottom: theme.spacing.sm,
    gap: 4,
  },
  cardHeader: { flexDirection: "row", justifyContent: "space-between" },
  cardCategory: { fontFamily: theme.fonts.uiSemibold, fontSize: 14, color: theme.colors.primaryDark },
  cardCost: { fontFamily: theme.fonts.uiSemibold, fontSize: 14, color: theme.colors.text },
  cardAddress: { fontFamily: theme.fonts.ui, fontSize: 12, color: theme.colors.textMuted },
  cardStatus: { fontFamily: theme.fonts.uiMedium, fontSize: 12, color: theme.colors.info, textTransform: "capitalize" },
  cardButton: { marginTop: theme.spacing.sm },
});
