import { useEffect, useRef, useState } from "react";
import { Modal, View, Text, Pressable, StyleSheet } from "react-native";
import { X } from "lucide-react-native";
import { getTheme } from "@gracerandly/theme";
import type { VerificationChannel } from "@gracerandly/shared-types";
import Button from "./Button";
import TextField from "./TextField";
import { useAuth } from "../context/AuthContext";
import { ApiError } from "../lib/apiClient";

const theme = getTheme("light");

const RESEND_COOLDOWN_SECONDS = 60; // mirrors the API's cooldown in lib/verification.ts

interface VerificationModalProps {
  visible: boolean;
  channel: VerificationChannel;
  destination: string;
  onClose: () => void;
  /** Called once the code is confirmed — AuthContext's user is already updated by then. */
  onVerified: () => void;
}

export default function VerificationModal({
  visible,
  channel,
  destination,
  onClose,
  onVerified,
}: VerificationModalProps) {
  const { requestVerification, confirmVerification } = useAuth();

  const [isSending, setIsSending] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const hasSentRef = useRef(false);

  useEffect(() => {
    if (!visible) {
      // Reset for next time this modal opens.
      hasSentRef.current = false;
      setCode("");
      setError(null);
      setDevCode(null);
      setCooldown(0);
      return;
    }
    if (!hasSentRef.current) {
      hasSentRef.current = true;
      void sendCode();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => setCooldown((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  async function sendCode() {
    setIsSending(true);
    setError(null);
    try {
      const response = await requestVerification(channel);
      if (response.devCode) setDevCode(response.devCode);
      setCooldown(RESEND_COOLDOWN_SECONDS);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't send a code — try again");
    } finally {
      setIsSending(false);
    }
  }

  async function handleConfirm() {
    if (code.length !== 6) {
      setError("Enter the 6-digit code");
      return;
    }
    setIsConfirming(true);
    setError(null);
    try {
      await confirmVerification(channel, code);
      onVerified();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't verify that code");
    } finally {
      setIsConfirming(false);
    }
  }

  const channelLabel = channel === "phone" ? "phone number" : "email";

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.header}>
            <Text style={styles.title}>Verify your {channelLabel}</Text>
            <Pressable onPress={onClose} hitSlop={12}>
              <X size={20} color={theme.colors.textMuted} />
            </Pressable>
          </View>

          <Text style={styles.body}>
            {isSending
              ? `Sending a code to ${destination}…`
              : `Enter the 6-digit code sent to ${destination}.`}
          </Text>

          {devCode ? (
            <Text style={styles.devCodeText}>Dev mode — code: {devCode}</Text>
          ) : null}

          <TextField
            label="Verification code"
            value={code}
            onChangeText={(text) => setCode(text.replace(/\D/g, "").slice(0, 6))}
            keyboardType="number-pad"
            maxLength={6}
            placeholder="123456"
            editable={!isSending}
          />

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <Button label="Verify" onPress={handleConfirm} loading={isConfirming} disabled={isSending} />

          <Button
            label={cooldown > 0 ? `Resend code in ${cooldown}s` : "Resend code"}
            variant="ghost"
            onPress={sendCode}
            disabled={cooldown > 0 || isSending}
            style={styles.resendButton}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(26,16,19,0.55)",
    alignItems: "center",
    justifyContent: "center",
    padding: theme.spacing.lg,
  },
  card: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.xl,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: theme.spacing.sm,
  },
  title: {
    flex: 1,
    fontFamily: theme.fonts.display,
    fontSize: 19,
    color: theme.colors.primaryDark,
  },
  body: {
    fontFamily: theme.fonts.ui,
    fontSize: 14,
    color: theme.colors.textMuted,
    lineHeight: 20,
    marginBottom: theme.spacing.md,
  },
  devCodeText: {
    fontFamily: theme.fonts.uiMedium,
    fontSize: 13,
    color: theme.colors.info,
    marginBottom: theme.spacing.md,
  },
  errorText: {
    fontFamily: theme.fonts.ui,
    fontSize: 13,
    color: theme.colors.danger,
    marginBottom: theme.spacing.sm,
  },
  resendButton: { marginTop: theme.spacing.xs },
});
