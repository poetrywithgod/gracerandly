// Shown on a delivered errand: "Something wrong?" lets the requester report a
// problem once (within the dispute window). Afterwards it shows the status and,
// once staff have decided, what they decided and why. The runner's pay for the
// errand is held until then (see api/src/lib/disputes.ts).
import { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import { getTheme } from "@gracerandly/theme";
import Button from "./Button";
import PillSelect from "./PillSelect";
import TextField from "./TextField";
import { useAuth } from "../context/AuthContext";
import { apiFetch, ApiError } from "../lib/apiClient";

const theme = getTheme("light");

type Reason = "item_missing" | "wrong_item" | "damaged" | "not_delivered" | "overcharged" | "rude_behavior" | "other";

const REASONS: { value: Reason; label: string }[] = [
  { value: "item_missing", label: "Item missing" },
  { value: "wrong_item", label: "Wrong item" },
  { value: "damaged", label: "Damaged" },
  { value: "not_delivered", label: "Never arrived" },
  { value: "overcharged", label: "Charged too much" },
  { value: "rude_behavior", label: "Rude or unsafe" },
  { value: "other", label: "Something else" },
];

interface DisputeState {
  canDispute: boolean;
  windowEndsAt: string | null;
  dispute: {
    reason: Reason;
    status: "open" | "resolved";
    outcome: "refunded" | "rejected" | null;
    staffNote: string | null;
    refundAmount: number | null;
  } | null;
}

const naira = (n: number) => `₦${n.toLocaleString("en-NG")}`;

export default function DisputeCard({ errandId }: { errandId: string }) {
  const { token } = useAuth();
  const path = `/errands/${errandId}/dispute`;
  const [state, setState] = useState<DisputeState | null>(null);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<Reason | null>(null);
  const [description, setDescription] = useState("");
  const [reasonError, setReasonError] = useState<string | undefined>(undefined);
  const [descError, setDescError] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    try {
      setState(await apiFetch<DisputeState>(path, { headers: { Authorization: `Bearer ${token}` } }));
    } catch {
      // Not being able to show this card isn't worth an error banner.
    }
  }, [path, token]);

  useEffect(() => {
    load();
  }, [load]);

  const submit = async () => {
    if (!reason) {
      setReasonError("Choose what went wrong.");
      return;
    }
    setSubmitting(true);
    setError(null);
    setReasonError(undefined);
    setDescError(undefined);
    try {
      setState(
        await apiFetch<DisputeState>(path, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: JSON.stringify({ reason, description: description.trim() }),
        })
      );
      setOpen(false);
    } catch (err) {
      if (err instanceof ApiError && err.fields?.description) {
        setDescError(err.fields.description);
        return;
      }
      setError(err instanceof ApiError ? err.message : "Couldn't send your report. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!state || (!state.canDispute && !state.dispute)) return null;

  const d = state.dispute;
  if (d) {
    return (
      <View style={styles.card}>
        <Text style={styles.title}>
          {d.status === "open"
            ? "Problem reported"
            : d.outcome === "refunded"
              ? "Problem report upheld"
              : "Problem report reviewed"}
        </Text>
        {d.status === "open" ? (
          <Text style={styles.note}>Our team is looking into it. We'll tell you what we decide.</Text>
        ) : (
          <>
            {d.outcome === "refunded" && d.refundAmount ? (
              <Text style={styles.note}>{naira(d.refundAmount)} is being refunded to your card or bank. It can take a few days to show.</Text>
            ) : null}
            {d.staffNote ? <Text style={styles.note}>{d.staffNote}</Text> : null}
          </>
        )}
      </View>
    );
  }

  if (!open) {
    return (
      <View style={styles.card}>
        <Text style={styles.title}>Something wrong with this errand?</Text>
        <Text style={styles.note}>Tell us and our team will look into it. You can report a problem for 48 hours after delivery.</Text>
        <Button label="Report a problem" variant="secondary" onPress={() => setOpen(true)} />
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Report a problem</Text>
      <PillSelect label="What went wrong?" options={REASONS} value={reason} onChange={(v) => { setReason(v); setReasonError(undefined); }} error={reasonError} />
      <TextField
        label="Tell us what happened"
        value={description}
        error={descError}
        onChangeText={(v) => {
          setDescription(v);
          setDescError(undefined);
        }}
        multiline
        maxLength={600}
        placeholder="For example: the rice and oil were not in the bag"
      />
      <Text style={styles.note}>The runner's pay for this errand is held while we look into it.</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Button label="Send report" onPress={submit} loading={submitting} />
      <Button label="Cancel" variant="secondary" onPress={() => setOpen(false)} />
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
  note: { fontFamily: theme.fonts.ui, fontSize: 13, color: theme.colors.textMuted },
  error: { fontFamily: theme.fonts.ui, fontSize: 13, color: theme.colors.danger },
});
