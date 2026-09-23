import { useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import DateTimePicker from "@react-native-community/datetimepicker";
import { CalendarClock, MapPin, Plus, Sparkles, Trash2 } from "lucide-react-native";
import { getTheme } from "@gracerandly/theme";
import type { Errand, ErrandCategory, ErrandUrgency, GeoPoint } from "@gracerandly/shared-types";
import Button from "../components/Button";
import TextField from "../components/TextField";
import PillSelect from "../components/PillSelect";
import LocationPickerModal from "../components/LocationPickerModal";
import RoutePreview from "../components/RoutePreview";
import ErrandPostedModal from "../components/ErrandPostedModal";
import AiParseModal, { type AiParsedDraft } from "../components/AiParseModal";
import LoadingScreen from "../components/LoadingScreen";
import { useAuth } from "../context/AuthContext";
import { apiFetch, ApiError } from "../lib/apiClient";
import type { MainStackParamList } from "../navigation/types";

const theme = getTheme("light");

const CATEGORY_OPTIONS: { value: ErrandCategory; label: string }[] = [
  { value: "grocery", label: "Grocery" },
  { value: "pharmacy", label: "Pharmacy" },
  { value: "food", label: "Food" },
  { value: "parcel", label: "Parcel" },
  { value: "miscellaneous", label: "Other" },
];

const URGENCY_OPTIONS: { value: ErrandUrgency; label: string }[] = [
  { value: "asap", label: "ASAP" },
  { value: "scheduled", label: "Scheduled" },
];

type RepeatMode = "once" | "repeat";

const REPEAT_MODE_OPTIONS: { value: RepeatMode; label: string }[] = [
  { value: "once", label: "One-time" },
  { value: "repeat", label: "Repeats" },
];

const RECURRENCE_OPTIONS: { value: string; label: string }[] = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "biweekly", label: "Every 2 weeks" },
  { value: "monthly", label: "Monthly" },
];

interface DraftItem {
  key: string;
  name: string;
  quantity: string;
  notes: string;
}

function newDraftItem(): DraftItem {
  return { key: Math.random().toString(36).slice(2), name: "", quantity: "1", notes: "" };
}

function describeLocation(point: GeoPoint | null): string {
  if (!point) return "";
  return point.address ?? `${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}`;
}

function formatScheduledFor(date: Date | null): string {
  if (!date) return "";
  return date.toLocaleString("en-NG", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

type CreateErrandRouteProp = RouteProp<MainStackParamList, "CreateErrand">;

export default function CreateErrandScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const route = useRoute<CreateErrandRouteProp>();
  const { token } = useAuth();
  const errandId = route.params?.errandId;
  const isEditMode = !!errandId;

  const [isLoadingErrand, setIsLoadingErrand] = useState(isEditMode);
  const [loadFailed, setLoadFailed] = useState(false);

  const [category, setCategory] = useState<ErrandCategory | null>(null);
  const [urgency, setUrgency] = useState<ErrandUrgency | null>(null);
  const [scheduledFor, setScheduledFor] = useState<Date | null>(null);
  const [schedulerStep, setSchedulerStep] = useState<"date" | "time" | null>(null);
  const [pickup, setPickup] = useState<GeoPoint | null>(null);
  const [dropoff, setDropoff] = useState<GeoPoint | null>(null);
  const [activeField, setActiveField] = useState<"pickup" | "dropoff" | null>(null);
  const [items, setItems] = useState<DraftItem[]>([newDraftItem()]);
  const [instructions, setInstructions] = useState("");
  const [estimatedCost, setEstimatedCost] = useState("");
  const [aiParsed, setAiParsed] = useState(false);
  const [showAiParse, setShowAiParse] = useState(false);
  const [repeatMode, setRepeatMode] = useState<RepeatMode>("once");
  const [recurrenceRule, setRecurrenceRule] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [showSuccessModal, setShowSuccessModal] = useState(false);

  useEffect(() => {
    navigation.setOptions({ title: isEditMode ? "Edit errand" : "Post an errand" });
  }, [navigation, isEditMode]);

  useEffect(() => {
    if (!isEditMode) return;
    let cancelled = false;

    (async () => {
      try {
        const { errand } = await apiFetch<{ errand: Errand }>(`/errands/${errandId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (cancelled) return;

        setCategory(errand.category);
        setUrgency(errand.urgency);
        setScheduledFor(errand.scheduledFor ? new Date(errand.scheduledFor) : null);
        setPickup(errand.pickup);
        setDropoff(errand.dropoff);
        setItems(
          errand.items.map((item) => ({
            key: item.id,
            name: item.name,
            quantity: String(item.quantity),
            notes: item.notes ?? "",
          }))
        );
        setInstructions(errand.instructions ?? "");
        setEstimatedCost(String(errand.estimatedCost));
        setRepeatMode(errand.isRecurring ? "repeat" : "once");
        setRecurrenceRule(errand.recurrenceRule ?? null);
      } catch {
        if (!cancelled) setLoadFailed(true);
      } finally {
        if (!cancelled) setIsLoadingErrand(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isEditMode, errandId, token]);

  function updateItem(key: string, patch: Partial<DraftItem>) {
    setItems((prev) => prev.map((item) => (item.key === key ? { ...item, ...patch } : item)));
  }

  function addItem() {
    setItems((prev) => [...prev, newDraftItem()]);
  }

  function removeItem(key: string) {
    setItems((prev) => (prev.length > 1 ? prev.filter((item) => item.key !== key) : prev));
  }

  function handleAiParsed(draft: AiParsedDraft) {
    setCategory(draft.category);
    setItems(
      draft.items.map((item) => ({
        key: Math.random().toString(36).slice(2),
        name: item.name,
        quantity: String(item.quantity),
        notes: item.notes ?? "",
      }))
    );
    if (draft.instructions) setInstructions(draft.instructions);
    setAiParsed(true);
    setShowAiParse(false);
  }

  function validate(): boolean {
    const nextErrors: Record<string, string> = {};

    if (!category) nextErrors.category = "Choose a category";
    if (!urgency) nextErrors.urgency = "Choose how urgent this is";
    if (urgency === "scheduled" && !scheduledFor) {
      nextErrors.scheduledFor = "Set a time for this errand";
    }
    if (repeatMode === "repeat" && !recurrenceRule) {
      nextErrors.recurrenceRule = "Choose how often this repeats";
    }
    if (!pickup) nextErrors.pickup = "Set a pickup location";
    if (!dropoff) nextErrors.dropoff = "Set a drop-off location";

    const hasNamedItem = items.some((item) => item.name.trim().length > 0);
    if (!hasNamedItem) nextErrors.items = "Add at least one item";

    const cost = Number(estimatedCost);
    if (!estimatedCost || !Number.isFinite(cost) || cost <= 0) {
      nextErrors.estimatedCost = "Enter an estimated cost in Naira";
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  async function handleSubmit() {
    if (!validate() || !category || !urgency || !pickup || !dropoff) return;

    setSubmitError(null);
    setIsSubmitting(true);
    try {
      const payload = {
        category,
        urgency,
        scheduledFor: urgency === "scheduled" ? scheduledFor?.toISOString() : undefined,
        pickup,
        dropoff,
        items: items
          .filter((item) => item.name.trim().length > 0)
          .map((item) => ({
            name: item.name.trim(),
            quantity: Math.max(1, Math.round(Number(item.quantity)) || 1),
            notes: item.notes.trim() || undefined,
          })),
        instructions: instructions.trim() || undefined,
        estimatedCost: Math.round(Number(estimatedCost)),
        isRecurring: repeatMode === "repeat",
        recurrenceRule: repeatMode === "repeat" ? (recurrenceRule ?? undefined) : undefined,
        ...(!isEditMode && aiParsed && { aiParsed: true }),
      };

      await apiFetch<{ errand: Errand }>(isEditMode ? `/errands/${errandId}` : "/errands", {
        method: isEditMode ? "PATCH" : "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });

      setShowSuccessModal(true);
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleSchedulerChange(_event: unknown, selected?: Date) {
    if (Platform.OS === "android") {
      // Android's picker is a one-shot dialog: a date pick chains straight
      // into the time dialog; a time pick finalizes. Dismissal (no
      // `selected`) cancels the whole flow rather than leaving it stuck
      // mid-step.
      if (!selected) {
        setSchedulerStep(null);
        return;
      }
      if (schedulerStep === "date") {
        setScheduledFor(selected);
        setSchedulerStep("time");
      } else if (schedulerStep === "time") {
        setScheduledFor((prev) => {
          const base = prev ?? selected;
          const combined = new Date(base);
          combined.setHours(selected.getHours(), selected.getMinutes());
          return combined;
        });
        setSchedulerStep(null);
      }
      return;
    }

    // iOS's inline picker supports mode="datetime" directly.
    if (selected) setScheduledFor(selected);
  }

  if (isLoadingErrand) {
    return <LoadingScreen message="Loading errand…" />;
  }

  if (loadFailed) {
    return (
      <View style={styles.loadFailedContainer}>
        <Text style={styles.errorText}>Couldn't load this errand.</Text>
        <Button label="Go back" variant="ghost" onPress={() => navigation.goBack()} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>{isEditMode ? "Edit errand" : "Post an errand"}</Text>

        {!isEditMode ? (
          <Pressable onPress={() => setShowAiParse(true)} style={styles.aiEntryCard}>
            <Sparkles size={18} color={theme.colors.primary} />
            <View style={styles.aiEntryTextGroup}>
              <Text style={styles.aiEntryTitle}>Fill with AI</Text>
              <Text style={styles.aiEntrySubtitle}>Paste a list and we'll fill this in</Text>
            </View>
          </Pressable>
        ) : null}

        <PillSelect
          label="Category"
          options={CATEGORY_OPTIONS}
          value={category}
          onChange={setCategory}
          error={errors.category}
        />

        <PillSelect
          label="Urgency"
          options={URGENCY_OPTIONS}
          value={urgency}
          onChange={setUrgency}
          error={errors.urgency}
        />

        {urgency === "scheduled" ? (
          <View style={styles.locationFieldWrapper}>
            <Text style={styles.sectionLabel}>Scheduled for</Text>
            <Pressable
              onPress={() => setSchedulerStep(Platform.OS === "android" ? "date" : "time")}
              style={styles.locationField}
            >
              <CalendarClock size={18} color={theme.colors.primary} />
              <Text
                style={[
                  styles.locationFieldText,
                  !scheduledFor && styles.locationFieldPlaceholder,
                ]}
                numberOfLines={1}
              >
                {formatScheduledFor(scheduledFor) || "Tap to set date & time"}
              </Text>
            </Pressable>
            {errors.scheduledFor ? (
              <Text style={styles.errorText}>{errors.scheduledFor}</Text>
            ) : null}
            {Platform.OS === "ios" && schedulerStep ? (
              <DateTimePicker
                value={scheduledFor ?? new Date()}
                mode="datetime"
                minimumDate={new Date()}
                display="inline"
                onChange={(event, selected) => {
                  handleSchedulerChange(event, selected);
                  setSchedulerStep(null);
                }}
              />
            ) : null}
            {Platform.OS === "android" && schedulerStep ? (
              <DateTimePicker
                value={scheduledFor ?? new Date()}
                mode={schedulerStep}
                minimumDate={new Date()}
                display="default"
                onChange={handleSchedulerChange}
              />
            ) : null}
          </View>
        ) : null}

        <PillSelect
          label="Repeat"
          options={REPEAT_MODE_OPTIONS}
          value={repeatMode}
          onChange={setRepeatMode}
        />

        {repeatMode === "repeat" ? (
          <View style={styles.locationFieldWrapper}>
            <PillSelect
              label="How often"
              options={RECURRENCE_OPTIONS}
              value={recurrenceRule}
              onChange={setRecurrenceRule}
              error={errors.recurrenceRule}
            />
            <Text style={styles.recurrenceHint}>
              We'll remember this, but repeat errands aren't posted automatically yet — you'll
              still need to post each one.
            </Text>
          </View>
        ) : null}

        <LocationField
          label="Pickup location"
          value={describeLocation(pickup)}
          error={errors.pickup}
          onPress={() => setActiveField("pickup")}
        />

        <LocationField
          label="Drop-off location"
          value={describeLocation(dropoff)}
          error={errors.dropoff}
          onPress={() => setActiveField("dropoff")}
        />

        {pickup && dropoff ? <RoutePreview pickup={pickup} dropoff={dropoff} /> : null}

        <View style={styles.itemsSection}>
          <Text style={styles.sectionLabel}>Items</Text>
          {items.map((item, index) => (
            <View key={item.key} style={styles.itemRow}>
              <View style={styles.itemNameField}>
                <TextField
                  label={`Item ${index + 1}`}
                  value={item.name}
                  onChangeText={(name) => updateItem(item.key, { name })}
                  placeholder="e.g. Bread"
                />
              </View>
              <View style={styles.itemQtyField}>
                <TextField
                  label="Qty"
                  value={item.quantity}
                  onChangeText={(quantity) => updateItem(item.key, { quantity })}
                  keyboardType="number-pad"
                />
              </View>
              <Pressable
                onPress={() => removeItem(item.key)}
                style={styles.removeItemButton}
                hitSlop={8}
                disabled={items.length === 1}
              >
                <Trash2
                  size={20}
                  color={items.length === 1 ? theme.colors.border : theme.colors.danger}
                />
              </Pressable>
            </View>
          ))}
          {errors.items ? <Text style={styles.errorText}>{errors.items}</Text> : null}

          <Pressable onPress={addItem} style={styles.addItemButton}>
            <Plus size={18} color={theme.colors.primary} />
            <Text style={styles.addItemText}>Add another item</Text>
          </Pressable>
        </View>

        <TextField
          label="Instructions (optional)"
          value={instructions}
          onChangeText={setInstructions}
          placeholder="Anything the runner should know"
          multiline
          numberOfLines={3}
        />

        <TextField
          label="Estimated cost (₦)"
          value={estimatedCost}
          onChangeText={setEstimatedCost}
          placeholder="e.g. 5000"
          keyboardType="number-pad"
          error={errors.estimatedCost}
        />

        {submitError ? <Text style={styles.submitError}>{submitError}</Text> : null}

        <Button
          label={isEditMode ? "Save changes" : "Post errand"}
          onPress={handleSubmit}
          loading={isSubmitting}
        />
      </ScrollView>

      <LocationPickerModal
        visible={activeField !== null}
        title={activeField === "pickup" ? "Pickup location" : "Drop-off location"}
        initial={(activeField === "pickup" ? pickup : dropoff) ?? undefined}
        onCancel={() => setActiveField(null)}
        onConfirm={(point) => {
          if (activeField === "pickup") setPickup(point);
          if (activeField === "dropoff") setDropoff(point);
          setActiveField(null);
        }}
      />

      <AiParseModal
        visible={showAiParse}
        onClose={() => setShowAiParse(false)}
        onParsed={handleAiParsed}
      />

      <ErrandPostedModal
        visible={showSuccessModal}
        title={isEditMode ? "Errand updated!" : "Errand posted!"}
        body={
          isEditMode
            ? "Your changes have been saved."
            : "We're finding a runner near you. You'll get an update as soon as one accepts."
        }
        onDone={() => navigation.goBack()}
      />
    </KeyboardAvoidingView>
  );
}

function LocationField({
  label,
  value,
  error,
  onPress,
}: {
  label: string;
  value: string;
  error?: string;
  onPress: () => void;
}) {
  return (
    <View style={styles.locationFieldWrapper}>
      <Text style={styles.sectionLabel}>{label}</Text>
      <Pressable onPress={onPress} style={styles.locationField}>
        <MapPin size={18} color={theme.colors.primary} />
        <Text
          style={[styles.locationFieldText, !value && styles.locationFieldPlaceholder]}
          numberOfLines={1}
        >
          {value || "Tap to set on map"}
        </Text>
      </Pressable>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: theme.colors.background },
  content: { padding: theme.spacing.lg, paddingBottom: theme.spacing.xxl },
  loadFailedContainer: {
    flex: 1,
    backgroundColor: theme.colors.background,
    alignItems: "center",
    justifyContent: "center",
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
  },
  title: {
    fontSize: 26,
    fontFamily: theme.fonts.display,
    color: theme.colors.primaryDark,
    marginBottom: theme.spacing.lg,
  },
  sectionLabel: {
    fontFamily: theme.fonts.uiMedium,
    fontSize: 14,
    color: theme.colors.text,
    marginBottom: 8,
  },
  aiEntryCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.primary,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.lg,
  },
  aiEntryTextGroup: { flex: 1 },
  aiEntryTitle: {
    fontFamily: theme.fonts.uiSemibold,
    fontSize: 14,
    color: theme.colors.text,
  },
  aiEntrySubtitle: {
    fontFamily: theme.fonts.ui,
    fontSize: 12,
    color: theme.colors.textMuted,
    marginTop: 1,
  },
  locationFieldWrapper: { marginBottom: theme.spacing.md },
  recurrenceHint: {
    fontFamily: theme.fonts.ui,
    fontSize: 12,
    color: theme.colors.textMuted,
    marginTop: 4,
  },
  locationField: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surface,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 14,
  },
  locationFieldText: {
    flex: 1,
    fontFamily: theme.fonts.uiMedium,
    fontSize: 15,
    color: theme.colors.text,
  },
  locationFieldPlaceholder: { color: theme.colors.textMuted },
  itemsSection: { marginBottom: theme.spacing.md },
  itemRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  itemNameField: { flex: 3 },
  itemQtyField: { flex: 1 },
  removeItemButton: { padding: 12, marginTop: 22 },
  addItemButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
  },
  addItemText: {
    fontFamily: theme.fonts.uiMedium,
    fontSize: 14,
    color: theme.colors.primary,
  },
  errorText: {
    fontFamily: theme.fonts.ui,
    fontSize: 12,
    color: theme.colors.danger,
    marginTop: 4,
  },
  submitError: {
    fontFamily: theme.fonts.ui,
    fontSize: 13,
    color: theme.colors.danger,
    marginBottom: theme.spacing.sm,
    textAlign: "center",
  },
});
