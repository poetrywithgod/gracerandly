/**
 * REST helpers for chat/calls — who the other party is (for the header and
 * bubble avatars) and a join credential for a call. Same shape in both
 * apps; only the URL prefix differs by role (requesters call /errands/...,
 * runners call /runners/errands/...).
 */
import { apiFetch } from "./apiClient";
import type { ChatRole } from "./chatSocket";

export interface ChatParticipant {
  id: string;
  name: string;
  avatarUrl?: string;
}

export interface AgoraJoinInfo {
  appId: string;
  channelName: string;
  token: string;
  uid: string;
}

function prefix(role: ChatRole, errandId: string): string {
  return role === "runner" ? `/runners/errands/${errandId}` : `/errands/${errandId}`;
}

export async function fetchChatParticipant(role: ChatRole, errandId: string, token: string): Promise<ChatParticipant> {
  const { participant } = await apiFetch<{ participant: ChatParticipant }>(`${prefix(role, errandId)}/chat-participant`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return participant;
}

export function fetchAgoraJoinInfo(role: ChatRole, errandId: string, token: string): Promise<AgoraJoinInfo> {
  return apiFetch<AgoraJoinInfo>(`${prefix(role, errandId)}/agora-token`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
}
