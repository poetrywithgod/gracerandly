/**
 * Live runner-location tracking, over Supabase Realtime's Broadcast
 * feature — chosen over standing up a separate Socket.io server since
 * we're already on Supabase for the database; no extra infra to run.
 *
 * Channel name: `runner-location:<errandId>`, one channel per errand.
 * The Runner side (currently: scripts/fake-runner.ts, until a real
 * Runner app exists) publishes `{lat, lng, heading, timestamp}` on it;
 * this file is the requester-side subscriber.
 *
 * Security note: these are public (non-private) broadcast channels —
 * fine for prototyping, but anyone who knows/guesses an errandId could
 * listen in. Before this carries real traffic, switch to Realtime's
 * Authorization feature (private channels gated by an RLS policy that
 * checks the subscriber is that errand's requester) rather than relying
 * on the errandId being hard to guess.
 */
import { createClient, type RealtimeChannel } from "@supabase/supabase-js";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

let client: ReturnType<typeof createClient> | null = null;

function getSupabaseClient() {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY must be set — see apps/requester/.env.example."
    );
  }
  if (!client) {
    client = createClient(supabaseUrl, supabaseAnonKey);
  }
  return client;
}

export interface RunnerPosition {
  latitude: number;
  longitude: number;
  heading?: number;
  timestamp: number;
}

/**
 * Subscribes to an errand's runner-location channel. Calls `onPosition`
 * for every broadcast received. Returns an unsubscribe function — call it
 * on unmount, or whenever the errand leaves the actively-tracked status
 * range, to close the channel.
 */
export function subscribeToRunnerLocation(
  errandId: string,
  onPosition: (position: RunnerPosition) => void
): () => void {
  const supabase = getSupabaseClient();
  const channel: RealtimeChannel = supabase
    .channel(`runner-location:${errandId}`)
    .on("broadcast", { event: "position" }, ({ payload }) => {
      if (typeof payload?.lat !== "number" || typeof payload?.lng !== "number") return;
      onPosition({
        latitude: payload.lat,
        longitude: payload.lng,
        heading: typeof payload.heading === "number" ? payload.heading : undefined,
        timestamp: typeof payload.timestamp === "number" ? payload.timestamp : Date.now(),
      });
    })
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
