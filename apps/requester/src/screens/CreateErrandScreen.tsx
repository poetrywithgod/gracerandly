import { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { MapPin, Plus, Trash2 } from "lucide-react-native";
import { getTheme } from "@gracerandly/theme";
import type { Errand, ErrandCategory, ErrandUrgency, GeoPoint } from "@gracerandly/shared-types";
import Button from "../components/Button";
import TextField from "../components/TextField";
import PillSelect from "../components/PillSelect";
import LocationPickerModal from "../components/LocationPickerModal";
import ErrandPostedModal from "../components/ErrandPostedModal";
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

export default function CreateErrandScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const { token } = useAuth();

  const [category, setCategory] = useState<ErrandCategory | null>(null);
  const [urgency, setUrgency] = useState<ErrandUrgency | null>(null);
  const [pickup, setPickup] = useState<GeoPoint | null>(null);
  const [dropoff, setDropoff] = useState<GeoPoint | null>(null);
  const [activeField, setActiveField] = useState<"pickup" | "dropoff" | null>(null);
  const [items, setItems] = useState<DraftItem[]>([newDraftItem()]);
  const [instructions, setInstructions] = useState("");
  const [estimatedCost, setEstimatedCost] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [showSuccessModal, setShowSuccessModal] = useState(false);

  function updateItem(key: string, patch: Partial<DraftItem>) {
    setItems((prev) => prev.map((item) => (item.key === key ? { ...item, ...patch } : item)));
  }

  function addItem() {
    setItems((prev) => [...prev, newDraftItem()]);
  }

  function removeItem(key: string) {
    setItems((prev) => (prev.length > 1 ? prev.filter((item) => item.key !== key) : prev));
  }

  function validate(): boolean {
    const nextErrors: Record<string, string> = {};

    if (!category) nextErrors.category = "Choose a category";
    if (!urgency) nextErrors.urgency = "Choose how urgent this is";
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
      };

      await apiFetch<{ errand: Errand }>("/errands", {
        method: "POST",
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
        <Text style={styles.title}>Post an errand</Text>

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

        <Button label="Post errand" onPress={handleSubmit} loading={isSubmitting} />
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

      <ErrandPostedModal visible={showSuccessModal} onDone={() => navigation.goBack()} />
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
  locationFieldWrapper: { marginBottom: theme.spacing.md },
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
