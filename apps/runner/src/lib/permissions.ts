// Identical to apps/requester/src/lib/permissions.ts — see
// components/GlassCard.tsx's header comment for why it's duplicated.
//
// Asks for a device permission in the app's own voice first.
//
// The OS permission dialog can't be restyled — it's drawn by Android itself.
// What we can control is what comes BEFORE it: a branded "here's why we need
// this" card (components/PermissionHost.tsx). Only when the person taps
// Continue does the OS dialog appear. And if they've previously chosen
// "Don't ask again", the OS dialog can never show again, so instead of
// failing silently we show a card that opens the app's system settings.
//
// Usage:  if ((await ensurePermission("location")) !== "granted") { ... }
import { Linking } from "react-native";
import * as Location from "expo-location";
import * as ImagePicker from "expo-image-picker";
import * as Notifications from "expo-notifications";
import { getRecordingPermissionsAsync, requestRecordingPermissionsAsync } from "expo-audio";

export type PermissionKind = "location" | "microphone" | "camera" | "photos" | "notifications";

/** granted: go ahead. denied: they said no this time (can be asked again).
 * blocked: the OS won't ask again — only system Settings can change it. */
export type PermissionOutcome = "granted" | "denied" | "blocked";

export type PromptMode = "primer" | "blocked";

export interface PermissionPrompt {
  kind: PermissionKind;
  mode: PromptMode;
  resolve: (accepted: boolean) => void;
}

interface Status {
  granted: boolean;
  canAskAgain: boolean;
}

const handlers: Record<PermissionKind, { get: () => Promise<Status>; request: () => Promise<Status> }> = {
  location: {
    get: () => Location.getForegroundPermissionsAsync(),
    request: () => Location.requestForegroundPermissionsAsync(),
  },
  microphone: {
    get: () => getRecordingPermissionsAsync(),
    request: () => requestRecordingPermissionsAsync(),
  },
  camera: {
    get: () => ImagePicker.getCameraPermissionsAsync(),
    request: () => ImagePicker.requestCameraPermissionsAsync(),
  },
  photos: {
    get: () => ImagePicker.getMediaLibraryPermissionsAsync(),
    request: () => ImagePicker.requestMediaLibraryPermissionsAsync(),
  },
  notifications: {
    get: () => Notifications.getPermissionsAsync(),
    request: () => Notifications.requestPermissionsAsync(),
  },
};

// The host component registers itself here. Prompts are queued so two
// permission requests at once (e.g. microphone then camera for a video
// call) show one card after the other rather than on top of each other.
let showPrompt: ((prompt: PermissionPrompt | null) => void) | null = null;
let queue: Promise<unknown> = Promise.resolve();

export function registerPermissionHost(handler: ((prompt: PermissionPrompt | null) => void) | null) {
  showPrompt = handler;
}

function ask(kind: PermissionKind, mode: PromptMode): Promise<boolean> {
  // No host mounted (shouldn't happen in the real app): fall straight
  // through to the OS dialog rather than blocking the feature.
  if (!showPrompt) return Promise.resolve(mode === "primer");

  const run = () =>
    new Promise<boolean>((resolve) => {
      showPrompt?.({
        kind,
        mode,
        resolve: (accepted) => {
          showPrompt?.(null);
          resolve(accepted);
        },
      });
    });
  const next = queue.then(run, run);
  queue = next.catch(() => undefined);
  return next;
}

export async function ensurePermission(kind: PermissionKind): Promise<PermissionOutcome> {
  const { get, request } = handlers[kind];

  let status = await get();
  if (status.granted) return "granted";

  if (status.canAskAgain) {
    const accepted = await ask(kind, "primer");
    if (!accepted) return "denied";

    status = await request();
    if (status.granted) return "granted";
    if (status.canAskAgain) return "denied";
  }

  // The OS will no longer show its own dialog — offer Settings instead.
  const openSettings = await ask(kind, "blocked");
  if (openSettings) Linking.openSettings().catch(() => {});
  return "blocked";
}
