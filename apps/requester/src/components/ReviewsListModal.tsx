// Identical to apps/runner/src/components/ReviewsListModal.tsx — see
// GlassCard.tsx's header comment for why it's duplicated.
//
// A sheet listing the reviews people have left about someone — stars, the
// reviewer's first name, the date and the comment — under their average.
// Opened by tapping a rating.
import { useEffect, useState } from "react";
import { View, Text, Modal, FlatList, Pressable, ActivityIndicator, StyleSheet } from "react-native";
import { Star, X } from "lucide-react-native";
import { getTheme } from "@gracerandly/theme";
import { useAuth } from "../context/AuthContext";
import { apiFetch } from "../lib/apiClient";

const theme = getTheme("light");

interface PublicReview {
  id: string;
  rating: number;
  comment: string | null;
  createdAt: string;
  reviewerName: string;
}

interface ReviewsResponse {
  summary: { average: number | null; count: number };
  reviews: PublicReview[];
}

interface ReviewsListModalProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  /** API path that returns { summary, reviews }. */
  path: string;
}

function StarRow({ value, size = 14 }: { value: number; size?: number }) {
  return (
    <View style={styles.starRow}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} size={size} color={theme.colors.primary} fill={n <= value ? theme.colors.primary : "none"} />
      ))}
    </View>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" });
}

export default function ReviewsListModal({ visible, onClose, title, path }: ReviewsListModalProps) {
  const { token } = useAuth();
  const [data, setData] = useState<ReviewsResponse | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setData(null);
    setFailed(false);
    apiFetch<ReviewsResponse>(path, { headers: { Authorization: `Bearer ${token}` } })
      .then((response) => {
        if (!cancelled) setData(response);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [visible, path, token]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>{title}</Text>
            <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close">
              <X size={22} color={theme.colors.text} />
            </Pressable>
          </View>

          {failed ? (
            <Text style={styles.empty}>Couldn't load the reviews. Check your connection and try again.</Text>
          ) : !data ? (
            <ActivityIndicator color={theme.colors.primary} style={styles.loader} />
          ) : (
            <FlatList
              data={data.reviews}
              keyExtractor={(item) => item.id}
              ListHeaderComponent={
                data.summary.average !== null ? (
                  <View style={styles.summary}>
                    <Text style={styles.average}>{data.summary.average.toFixed(1)}</Text>
                    <View>
                      <StarRow value={Math.round(data.summary.average)} size={18} />
                      <Text style={styles.count}>
                        {data.summary.count} {data.summary.count === 1 ? "rating" : "ratings"}
                      </Text>
                    </View>
                  </View>
                ) : null
              }
              ListEmptyComponent={<Text style={styles.empty}>No reviews yet.</Text>}
              ItemSeparatorComponent={() => <View style={styles.separator} />}
              renderItem={({ item }) => (
                <View style={styles.review}>
                  <View style={styles.reviewTop}>
                    <StarRow value={item.rating} />
                    <Text style={styles.meta}>
                      {item.reviewerName} · {formatDate(item.createdAt)}
                    </Text>
                  </View>
                  {item.comment ? <Text style={styles.comment}>{item.comment}</Text> : <Text style={styles.noComment}>No comment</Text>}
                </View>
              )}
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: theme.colors.background,
    borderTopLeftRadius: theme.radius.lg,
    borderTopRightRadius: theme.radius.lg,
    padding: theme.spacing.md,
    maxHeight: "80%",
    minHeight: 240,
  },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  title: { fontFamily: theme.fonts.uiSemibold, fontSize: 17, color: theme.colors.text },
  loader: { marginVertical: 32 },
  empty: { fontFamily: theme.fonts.ui, fontSize: 14, color: theme.colors.textMuted, textAlign: "center", marginVertical: 32 },
  summary: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 12 },
  average: { fontFamily: theme.fonts.uiSemibold, fontSize: 34, color: theme.colors.text },
  count: { fontFamily: theme.fonts.ui, fontSize: 12, color: theme.colors.textMuted, marginTop: 2 },
  starRow: { flexDirection: "row", gap: 2 },
  review: { gap: 6, paddingVertical: 4 },
  reviewTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  meta: { fontFamily: theme.fonts.ui, fontSize: 12, color: theme.colors.textMuted },
  comment: { fontFamily: theme.fonts.ui, fontSize: 14, color: theme.colors.text },
  noComment: { fontFamily: theme.fonts.ui, fontSize: 13, color: theme.colors.textMuted, fontStyle: "italic" },
  separator: { height: 1, backgroundColor: theme.colors.border, marginVertical: 8 },
});
