// Identical to apps/runner/src/lib/agora.ts — see components/GlassCard.tsx's
// header comment for why it's duplicated rather than shared.
//
// Loads react-native-agora on demand instead of at app start. The package
// is a native module: if it isn't present in the installed build (an old dev
// build, Expo Go, or a linking problem), a top-level import throws while the
// app is still booting and takes the WHOLE app down with a red screen —
// login, errands, chat and SOS included. Loading it lazily, inside a
// try/catch, means a missing native module only disables calling; the
// call UI shows a clear message instead of crashing.
import { NativeModules, TurboModuleRegistry } from "react-native";
import type * as AgoraModule from "react-native-agora";

type Agora = typeof AgoraModule;

let cached: Agora | null | undefined;
let cachedError: string | undefined;

// Whether this build of the app actually contains Agora's native code.
// This is checked WITHOUT importing the package, because a try/catch around
// require() does not work here: when react-native-agora's native module is
// missing, Metro reports the error to React Native's global fatal-error
// handler (the red screen) instead of throwing it to our catch block. So we
// only require() the package once we know the native side is present.
// "AgoraRtcNg" is the module's registered native name.
function nativeAgoraPresent(): boolean {
  try {
    return !!(TurboModuleRegistry.get("AgoraRtcNg") ?? NativeModules.AgoraRtcNg);
  } catch {
    return false;
  }
}

/** The react-native-agora module, or null if it isn't available in this
 * build. The failure reason is kept for `agoraUnavailableReason()`. */
export function loadAgora(): Agora | null {
  if (cached !== undefined) return cached;
  if (!nativeAgoraPresent()) {
    cached = null;
    cachedError = "Calling isn't available in this build of the app.";
    return cached;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    cached = require("react-native-agora") as Agora;
  } catch (err) {
    cached = null;
    cachedError = err instanceof Error ? err.message : String(err);
    console.warn("[agora] react-native-agora couldn't be loaded:", cachedError);
  }
  return cached;
}

export function agoraUnavailableReason(): string {
  return cachedError ?? "Calling isn't available in this build of the app.";
}
