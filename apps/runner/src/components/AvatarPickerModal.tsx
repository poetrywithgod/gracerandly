// Identical to apps/requester/src/components/AvatarPickerModal.tsx — see
// GlassCard.tsx's header comment for why it's duplicated rather than shared.
import { useState } from "react";
import { Modal, View, Text, Pressable, StyleSheet, Platform } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { Camera, Image as ImageIcon, Trash2, X } from "lucide-react-native";
import { getTheme } from "@gracerandly/theme";

const theme = getTheme("light");

// Kept comfortably under the API's ~1.4MB decoded cap (updateAvatarSchema).
const AVATAR_DIMENSION = 512;
const AVATAR_JPEG_QUALITY = 0.6;

interface AvatarPickerModalProps {
  visible: boolean;
  hasAvatar: boolean;
  onSelect: (imageDataUri: string | null) => void;
  onClose: () => void;
}

async function resizeAndEncode(uri: string): Promise<string> {
  const context = ImageManipulator.manipulate(uri);
  const manipulated = await context.resize({ width: AVATAR_DIMENSION }).renderAsync();
  const result = await manipulated.saveAsync({
    format: SaveFormat.JPEG,
    compress: AVATAR_JPEG_QUALITY,
    base64: true,
  });
  context.release();
  manipulated.release();
  return `data:image/jpeg;base64,${result.base64}`;
}

export default function AvatarPickerModal({
  visible,
  hasAvatar,
  onSelect,
  onClose,
}: AvatarPickerModalProps) {
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  async function handlePickFromLibrary() {
    setError(null);
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError("Allow photo library access in your device settings to choose a picture.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 1,
    });
    if (result.canceled || !result.assets[0]) return;
    await processAndSelect(result.assets[0].uri);
  }

  async function handleTakePhoto() {
    setError(null);
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      setError("Allow camera access in your device settings to take a picture.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [1, 1],
      quality: 1,
    });
    if (result.canceled || !result.assets[0]) return;
    await processAndSelect(result.assets[0].uri);
  }

  async function processAndSelect(uri: string) {
    setIsProcessing(true);
    try {
      const dataUri = await resizeAndEncode(uri);
      onSelect(dataUri);
    } catch {
      setError("Couldn't process that image — try a different one.");
    } finally {
      setIsProcessing(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.header}>
            <Text style={styles.title}>Profile photo</Text>
            <Pressable onPress={onClose} hitSlop={12}>
              <X size={20} color={theme.colors.textMuted} />
            </Pressable>
          </View>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <SheetOption
            icon={<Camera size={20} color={theme.colors.primary} />}
            label="Take photo"
            disabled={isProcessing}
            onPress={handleTakePhoto}
          />
          <SheetOption
            icon={<ImageIcon size={20} color={theme.colors.primary} />}
            label="Choose from library"
            disabled={isProcessing}
            onPress={handlePickFromLibrary}
          />
          {hasAvatar ? (
            <SheetOption
              icon={<Trash2 size={20} color={theme.colors.danger} />}
              label="Remove photo"
              labelColor={theme.colors.danger}
              disabled={isProcessing}
              onPress={() => onSelect(null)}
            />
          ) : null}

          {isProcessing ? <Text style={styles.processingText}>Processing photo…</Text> : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function SheetOption({
  icon,
  label,
  labelColor,
  disabled,
  onPress,
}: {
  icon: React.ReactNode;
  label: string;
  labelColor?: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.option, pressed && !disabled && styles.optionPressed]}
      onPress={onPress}
      disabled={disabled}
    >
      <View style={styles.optionIcon}>{icon}</View>
      <Text style={[styles.optionLabel, labelColor ? { color: labelColor } : null]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(26,16,19,0.55)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: theme.radius.lg,
    borderTopRightRadius: theme.radius.lg,
    padding: theme.spacing.lg,
    paddingBottom: Platform.OS === "ios" ? theme.spacing.xl : theme.spacing.lg,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: theme.spacing.md,
  },
  title: {
    fontFamily: theme.fonts.display,
    fontSize: 18,
    color: theme.colors.primaryDark,
  },
  errorText: {
    fontFamily: theme.fonts.ui,
    fontSize: 13,
    color: theme.colors.danger,
    marginBottom: theme.spacing.sm,
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  optionPressed: { opacity: 0.6 },
  optionIcon: { width: 24, alignItems: "center" },
  optionLabel: {
    fontFamily: theme.fonts.uiMedium,
    fontSize: 15,
    color: theme.colors.text,
  },
  processingText: {
    fontFamily: theme.fonts.ui,
    fontSize: 13,
    color: theme.colors.textMuted,
    marginTop: theme.spacing.sm,
    textAlign: "center",
  },
});
