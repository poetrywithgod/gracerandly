/**
 * Mints short-lived Agora RTC tokens for audio/video calls (PRD extension —
 * calling isn't in the original PRD 6.x sweep, added on top of chat).
 *
 * Agora itself only carries the media once both clients join the same
 * channel — signaling (who's calling whom, ringing, accept/decline) is
 * handled entirely over the existing chat WebSocket (see chat-server.ts's
 * call-* message types), not by Agora. This file's only job is proving to
 * Agora that a request to join a given channel came from this backend, not
 * an arbitrary client with just the public App ID.
 *
 * The channel name is always the errand's own id — one call channel per
 * errand, matching the one requester + one runner relationship an errand
 * already has. Anyone minted a token for that channel is, by construction,
 * a party to that specific errand (see routes' agora-token handlers, which
 * check that before calling getRtcToken).
 */
import { RtcTokenBuilder, RtcRole } from "agora-token";

const TOKEN_TTL_SECONDS = 60 * 60; // 1 hour — comfortably longer than any single call

export interface AgoraJoinInfo {
  appId: string;
  channelName: string;
  token: string;
  uid: string;
}

export function getAgoraJoinInfo(channelName: string, userId: string): AgoraJoinInfo {
  const appId = process.env.AGORA_APP_ID;
  const appCertificate = process.env.AGORA_APP_CERTIFICATE;
  if (!appId || !appCertificate) {
    throw new Error("Agora isn't configured (AGORA_APP_ID / AGORA_APP_CERTIFICATE unset)");
  }

  const token = RtcTokenBuilder.buildTokenWithUserAccount(
    appId,
    appCertificate,
    channelName,
    userId,
    RtcRole.PUBLISHER, // both parties on a 1:1 errand call publish their own audio/video
    TOKEN_TTL_SECONDS,
    TOKEN_TTL_SECONDS
  );

  return { appId, channelName, token, uid: userId };
}
