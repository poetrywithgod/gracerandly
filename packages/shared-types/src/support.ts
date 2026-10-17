export type SupportCategory = "payment" | "errand_problem" | "other_person" | "account" | "safety" | "other";
export type SupportStatus = "open" | "awaiting_user" | "resolved" | "closed";
export type SupportSender = "requester" | "runner" | "staff";

export interface SupportTicket {
  id: string;
  category: SupportCategory;
  subject: string;
  status: SupportStatus;
  errandId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SupportMessage {
  id: string;
  sender: SupportSender;
  body: string;
  createdAt: string;
}

export interface ReferralSummary {
  code: string;
  shareMessage: string;
  invited: number;
  qualified: number;
  rewardNaira: { referrer: number; referee: number };
  /** Credit (requesters) or bonus (runners) ready to use, in Naira. */
  availableNaira: number;
  earnedNaira: number;
  minErrandNaira: number;
}
