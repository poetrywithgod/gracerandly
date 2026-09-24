/**
 * Runner-side counterpart to apps/requester/src/lib/realtime.ts — that
 * file subscribes to `runner-location:<errandId>`; this one publishes to
 * it. Same channel, same Supabase Realtime Broadcast feature, same
 * "public channel, fine for prototyping" caveat noted over there.
 *
 * This replaces apps/api/scripts/fake-runner.ts's broadcasting for real
 * errands — that script is still useful for testing the Requester app
 * without a second device, but a real Runner app should drive this
 * instead.
 */
import { createClient, type RealtimeChannel } from "@supabase/supabase-js";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

let client: ReturnType<typeof createClient> | null = null;

function getSupabaseClient() {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY must be set — see apps/runner/.env.example."
    );
  }
  if (!client) {
    client = createClient(supabaseUrl, supabaseAnonKey);
  }
  return client;
}

const channels = new Map<string, RealtimeChannel>();

function getChannel(errandId: string): RealtimeChannel {
  let channel = channels.get(errandId);
  if (!channel) {
    channel = getSupabaseClient().channel(`runner-location:${errandId}`);
    channel.subscribe();
    channels.set(errandId, channel);
  }
  return channel;
}

export interface RunnerPosition {
  lat: number;
  lng: number;
  heading?: number;
}

/** Publishes the runner's current position on an errand's channel. Safe to
 * call repeatedly (e.g. every few seconds from a location watcher) — the
 * channel is cached per errandId rather than re-subscribed each time. */
export function publishRunnerLocation(errandId: string, position: RunnerPosition): void {
  const channel = getChannel(errandId);
  channel.send({
    type: "broadcast",
    event: "position",
    payload: { ...position, timestamp: Date.now() },
  });
}

/** Call when an errand is no longer being actively tracked (delivered,
 * cancelled, or the runner navigates away) to close its channel. */
export function stopPublishingLocation(errandId: string): void {
  const channel = channels.get(errandId);
  if (!channel) return;
  getSupabaseClient().removeChannel(channel);
  channels.delete(errandId);
}
