// Renders nothing. The first time a runner signs in on this phone it walks
// through the permissions the Runner app depends on — notifications (new
// errands nearby), location (the requester follows the runner, and nearby
// errands are matched from it) and microphone (calls and voice notes) — each
// one in the app's own explainer card first, then the system dialog (see
// lib/permissions.ts). Asked once per account; after that each feature asks
// again only when it's actually used, so a "no" is never nagged about.
// Mount once, near the root (App.tsx), inside AuthProvider and after PermissionHost.
import { useEffect } from "react";
import * as SecureStore from "expo-secure-store";
import { useAuth } from "../context/AuthContext";
import { ensurePermission, type PermissionKind } from "../lib/permissions";

const ORDER: PermissionKind[] = ["notifications", "location", "microphone"];

export default function RunnerPermissionsHost() {
  const { user } = useAuth();
  const runnerId = user?.id;

  useEffect(() => {
    if (!runnerId) return;
    let cancelled = false;
    const key = `gracerandly_runner_permissions_asked_${runnerId}`;

    (async () => {
      try {
        if (await SecureStore.getItemAsync(key)) return;
        // Mark first: if the app is closed mid-way we don't start over next launch.
        await SecureStore.setItemAsync(key, "1");
        for (const kind of ORDER) {
          if (cancelled) return;
          await ensurePermission(kind);
        }
      } catch {
        // Best effort — each feature asks for what it needs anyway.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [runnerId]);

  return null;
}
