import { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, FlatList, RefreshControl, Pressable } from "react-native";
import { useFocusEffect, useNavigation, type CompositeNavigationProp } from "@react-navigation/native";
import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { getTheme } from "@gracerandly/theme";
import type { Errand } from "@gracerandly/shared-types";
import { useAuth } from "../context/AuthContext";
import { apiFetch, ApiError } from "../lib/apiClient";
import { requestLiveLocationRefresh } from "../lib/liveLocation";
import { getCurrentCoordinate, LocationPermissionDeniedError, requestLocationPermission } from "../lib/location";
import { onErrandFeedRefreshRequested } from "../lib/errandFeed";
import Button from "../components/Button";
import ConfirmModal from "../components/ConfirmModal";
import type { MainStackParamList, TabParamList } from "../navigation/types";

const theme = getTheme("light");

type HomeNavigationProp = CompositeNavigationProp<
  BottomTabNavigationProp<TabParamList, "Home">,
  NativeStackNavigationProp<MainStackParamList>
>;

// How often the list of available errands re-checks on its own while this
// screen is showing (and a push that arrives while the app is open triggers
// an immediate re-check on top of this).
const FEED_POLL_INTERVAL_MS = 10_000;

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
  // Errand the runner tapped "Accept" on, waiting for them to confirm that
  // their live location will be shared with the requester.
  const [pendingAcceptId, setPendingAcceptId] = useState<string | null>(null);
  const [isAccepting, setIsAccepting] = useState(false);
  // Errand ids already shown once, so ones that appear later get a "New" badge.
  const seenIds = useRef<Set<string> | null>(null);
  const [newIds, setNewIds] = useState<Set<string>>(new Set());

  // `silent` is the background poll: it shouldn't flash or clear an error the
  // runner is reading, and a failed poll just waits for the next one.
  const load = useCallback(async (silent = false) => {
    if (!token) return;
    if (!silent) setError(null);
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

        // First load just records what's there; after that, anything not seen before is "new".
        const ids = availableResponse.errands.map((e) => e.id);
        if (seenIds.current === null) {
          seenIds.current = new Set(ids);
        } else {
          const fresh = ids.filter((id) => !seenIds.current!.has(id));
          if (fresh.length > 0) {
            fresh.forEach((id) => seenIds.current!.add(id));
            setNewIds((prev) => new Set([...prev, ...fresh]));
          }
        }
      } else {
        setAvailable([]);
        setRadiusMiles(null);
      }
    } catch (err) {
      if (!silent) setError(err instanceof ApiError ? err.message : "Couldn't load errands");
    }
  }, [token, user?.isOnline, user?.currentLocation]);

  useEffect(() => {
    load();
  }, [load]);

  // Errands feed in on their own: re-check every few seconds while this tab
  // is showing and the runner is online, and straight away when a "new
  // errand" push arrives while the app is open. (When the app is closed the
  // push itself is the alert — see apps/api's lib/errand-alerts.ts.)
  useFocusEffect(
    useCallback(() => {
      if (!user?.isOnline) return;
      const interval = setInterval(() => load(true), FEED_POLL_INTERVAL_MS);
      const unsubscribe = onErrandFeedRefreshRequested(() => load(true));
      return () => {
        clearInterval(interval);
        unsubscribe();
      };
    }, [load, user?.isOnline])
  );

  // Going offline resets what counts as "new".
  useEffect(() => {
    if (!user?.isOnline) {
      seenIds.current = null;
      setNewIds(new Set());
    }
  }, [user?.isOnline]);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await load();
    setIsRefreshing(false);
  }, [load]);

  const handleToggleOnline = useCallback(async () => {
    setError(null);

    if (!user?.isOnline && !user?.identityVerified) {
      navigation.navigate("Verification");
      return;
    }

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
  }, [user?.isOnline, user?.identityVerified, navigation, setOnlineStatus, refreshUser]);

  // Step 1: tapping Accept asks the runner to agree to share their location.
  const handleAccept = useCallback((errandId: string) => {
    setError(null);
    setPendingAcceptId(errandId);
  }, []);

  // Step 2: they agreed — make sure the phone's location permission is on
  // (the requester follows the runner on a live map), then accept.
  const confirmAccept = useCallback(
    async () => {
      const errandId = pendingAcceptId;
      if (!errandId) return;
      setIsAccepting(true);
      setError(null);
      try {
        try {
          await requestLocationPermission();
        } catch (err) {
          setPendingAcceptId(null);
          setError(err instanceof LocationPermissionDeniedError ? "Location access is needed to accept an errand — the requester follows your progress on the map." : "Couldn't turn on location");
          return;
        }
        setPendingAcceptId(null);
        await apiFetch(`/runners/errands/${errandId}/accept`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
        requestLiveLocationRefresh();
        await load();
        navigation.navigate("ErrandDetail", { errandId });
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Couldn't accept this errand");
      } finally {
        setIsAccepting(false);
      }
    },
    [pendingAcceptId, token, load, navigation]
  );

  const atCapacity = myErrands.length >= 3;

  return (
    <FlatList
      contentContainerStyle={styles.list}
      refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor={theme.colors.primary} />}
      ListHeaderComponent={
        <View>
          <View style={styles.toggleCard}>
            <View style={styles.toggleTextWrap}>
              <Text style={styles.toggleTitle}>
                {user?.isOnline ? "You're online" : user?.identityVerified ? "You're offline" : "Verification needed"}
              </Text>
              <Text style={styles.toggleSubtitle}>
                {user?.isOnline
                  ? "Nearby errands will show up below"
                  : user?.identityVerified
                    ? "Go online to start seeing nearby errands"
                    : "Complete identity verification before you can go online"}
              </Text>
            </View>
            <Button
              label={user?.isOnline ? "Go offline" : user?.identityVerified ? "Go online" : "Verify"}
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
            <View style={styles.limitCard}>
              <Text style={styles.limitTitle}>You&apos;re at your 3-errand limit</Text>
              <Text style={styles.limitBody}>Quickly finish an errand so you can accept new errands.</Text>
            </View>
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
          isNew={newIds.has(item.id)}
        />
      )}
      ListFooterComponent={
        <ConfirmModal
          visible={pendingAcceptId !== null}
          title="Accept this errand?"
          body="Your live location will be shared with the requester until the errand is delivered, so they can follow your progress."
          confirmLabel="Accept & share location"
          cancelLabel="Not now"
          isConfirming={isAccepting}
          onConfirm={confirmAccept}
          onCancel={() => setPendingAcceptId(null)}
        />
      }
    />
  );
}

function ErrandCard({
  errand,
  onPress,
  actionLabel,
  onAction,
  isNew,
}: {
  errand: Errand;
  onPress: () => void;
  actionLabel?: string;
  onAction?: () => void;
  isNew?: boolean;
}) {
  return (
    <Pressable style={styles.card} onPress={onPress}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardCategory}>
          {CATEGORY_LABELS[errand.category]}
          {isNew ? <Text style={styles.newBadge}>{"  NEW"}</Text> : null}
        </Text>
        <Text style={styles.cardCost}>₦{errand.estimatedCost.toLocaleString()}</Text>
      </View>
      <Text style={styles.cardAddress} numberOfLines={1}>
        Pickup: {errand.pickup.address ?? `${errand.pickup.lat.toFixed(3)}, ${errand.pickup.lng.toFixed(3)}`}
      </Text>
      <Text style={styles.cardAddress} numberOfLines={1}>
        Drop-off: {errand.dropoff.address ?? `${errand.dropoff.lat.toFixed(3)}, ${errand.dropoff.lng.toFixed(3)}`}
      </Text>
      <Text style={styles.cardStatus}>
        {errand.status.replace(/_/g, " ")}
        {errand.stops.length > 0 ? ` \u00b7 +${errand.stops.length} stop${errand.stops.length > 1 ? "s" : ""}` : ""}
      </Text>
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
  toggleTextWrap: { flex: 1, paddingRight: theme.spacing.sm },
  toggleSubtitle: { fontFamily: theme.fonts.ui, fontSize: 12, color: theme.colors.textMuted },
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
  newBadge: { fontFamily: theme.fonts.uiSemibold, fontSize: 11, color: theme.colors.success },
  limitCard: {
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.primary,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    gap: 2,
  },
  limitTitle: { fontFamily: theme.fonts.uiSemibold, fontSize: 14, color: theme.colors.primaryDark },
  limitBody: { fontFamily: theme.fonts.ui, fontSize: 13, color: theme.colors.text },
  cardButton: { marginTop: theme.spacing.sm },
});
