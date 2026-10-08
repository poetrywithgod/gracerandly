// Shown on a delivered errand: rate the requester out of five stars
// (with an optional comment), once. Afterwards it shows what you gave.
// Also shows the requester's average rating from others, for context.
import { useCallback, useEffect, useState } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Star } from "lucide-react-native";
import { getTheme } from "@gracerandly/theme";
import Button from "./Button";
import ReviewsListModal from "./ReviewsListModal";
import TextField from "./TextField";
import { useAuth } from "../context/AuthContext";
import { apiFetch, ApiError } from "../lib/apiClient";

const theme = getTheme("light");

interface ReviewState {
  canReview: boolean;
  myReview: { rating: number; comment: string | null } | null;
  otherRating: { average: number | null; count: number };
}

function Stars({ value, onChange, size = 32 }: { value: number; onChange?: (n: number) => void; size?: number }) {
  return (
    <View style={styles.stars}>
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = n <= value;
        const star = <Star size={size} color={theme.colors.primary} fill={filled ? theme.colors.primary : "none"} />;
        return onChange ? (
          <Pressable key={n} onPress={() => onChange(n)} hitSlop={6} accessibilityRole="button" accessibilityLabel={`${n} star${n === 1 ? "" : "s"}`}>
            {star}
          </Pressable>
        ) : (
          <View key={n}>{star}</View>
        );
      })}
    </View>
  );
}

export default function ReviewCard({ errandId }: { errandId: string }) {
  const { token } = useAuth();
  const path = `/runners/errands/${errandId}/review`;
  const [state, setState] = useState<ReviewState | null>(null);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showReviews, setShowReviews] = useState(false);

  const load = useCallback(async () => {
    try {
      setState(await apiFetch<ReviewState>(path, { headers: { Authorization: `Bearer ${token}` } }));
    } catch {
      // Not being able to show the rating card isn't worth an error banner.
    }
  }, [path, token]);

  useEffect(() => {
    load();
  }, [load]);

  const submit = async () => {
    if (rating < 1) {
      setError("Tap a star to choose a rating.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const next = await apiFetch<ReviewState>(path, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({ rating, comment: comment.trim() || undefined }),
      });
      setState(next);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't save your rating. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!state || (!state.canReview && !state.myReview)) return null;

  const { average, count } = state.otherRating;
  const seeReviews = (
    <Pressable onPress={() => setShowReviews(true)} accessibilityRole="button" hitSlop={6}>
      <Text style={styles.link}>
        {average !== null ? `${average.toFixed(1)} average` : "Ratings"} ({count} {count === 1 ? "rating" : "ratings"}) · See reviews
      </Text>
    </Pressable>
  );

  return (
    <View style={styles.card}>
      {state.myReview ? (
        <>
          <Text style={styles.title}>You rated the requester</Text>
          <Stars value={state.myReview.rating} size={24} />
          <Text style={styles.note}>Thanks for your feedback.</Text>
          {count > 0 ? seeReviews : null}
        </>
      ) : (
        <>
          <Text style={styles.title}>Rate the requester</Text>
          {count > 0 ? seeReviews : null}
          <Stars value={rating} onChange={setRating} />
          <TextField
            label="Comment (optional)"
            value={comment}
            onChangeText={setComment}
            multiline
            maxLength={500}
            placeholder="How did it go?"
          />
          <Text style={styles.note}>Your rating and comment are shown to others, with your first name.</Text>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Button label="Submit rating" onPress={submit} loading={submitting} />
        </>
      )}
      <ReviewsListModal
        visible={showReviews}
        onClose={() => setShowReviews(false)}
        title="Reviews about the requester"
        path={`/runners/errands/${errandId}/counterpart-reviews`}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.md,
    gap: 10,
  },
  title: { fontFamily: theme.fonts.uiMedium, fontSize: 15, color: theme.colors.text },
  link: { fontFamily: theme.fonts.uiMedium, fontSize: 13, color: theme.colors.primary, textDecorationLine: "underline" },
  note: { fontFamily: theme.fonts.ui, fontSize: 13, color: theme.colors.textMuted },
  error: { fontFamily: theme.fonts.ui, fontSize: 13, color: theme.colors.danger },
  stars: { flexDirection: "row", gap: 8 },
});
