/**
 * Staff review of runner identity submissions (admin dashboard, Verification
 * page).
 *
 * A runner submits NIN, BVN and a guarantor from the Runner app
 * (routes/runners.ts PATCH /me/verification) and lands in "pending". Staff
 * approve (identityVerified = true, the runner can go online) or reject with
 * a reason the runner sees and can fix. A previously approved runner can be
 * revoked the same way (rejected: forced offline, cannot accept errands).
 *
 * The runner gets a push either way. Push is best-effort (lib/push.ts).
 */
import { desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client";
import { runners } from "../db/schema";
import { AppErrors } from "./errors";
import { sendPushToUser } from "./push";

export const REVIEW_STATUSES = ["pending", "approved", "rejected", "unsubmitted"] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export const rejectSchema = z.object({
  reason: z.string().trim().min(5, "Tell the runner what to fix (at least 5 characters)").max(300),
});

/** 12345678901 -> 123 •••• •901, so the list never shows a full ID. */
function mask(value: string | null): string | null {
  if (!value) return null;
  return value.length <= 6 ? "••••" : `${value.slice(0, 3)} •••• ${value.slice(-3)}`;
}

export interface ReviewListItem {
  id: string;
  fullName: string;
  phone: string;
  status: ReviewStatus;
  ninMasked: string | null;
  bvnMasked: string | null;
  submittedAt: string | null;
  reviewedAt: string | null;
  note: string | null;
}

export async function listReviews(status: string | undefined): Promise<ReviewListItem[]> {
  const wanted = REVIEW_STATUSES.includes(status as ReviewStatus) ? (status as ReviewStatus) : "pending";
  const rows = await db
    .select()
    .from(runners)
    .where(eq(runners.verificationStatus, wanted))
    .orderBy(wanted === "pending" ? runners.verificationSubmittedAt : desc(runners.verificationReviewedAt))
    .limit(100);
  return rows.map((r) => ({
    id: r.id,
    fullName: r.fullName,
    phone: r.phone,
    status: r.verificationStatus,
    ninMasked: mask(r.nin),
    bvnMasked: mask(r.bvn),
    submittedAt: r.verificationSubmittedAt?.toISOString() ?? null,
    reviewedAt: r.verificationReviewedAt?.toISOString() ?? null,
    note: r.verificationNote,
  }));
}

export async function reviewCounts(): Promise<Record<ReviewStatus, number>> {
  const result = await db.execute(
    sql`select verification_status::text status, count(*) count from runners group by 1`
  );
  const out: Record<ReviewStatus, number> = { pending: 0, approved: 0, rejected: 0, unsubmitted: 0 };
  for (const row of Array.from(result as unknown as { status: ReviewStatus; count: string }[])) {
    out[row.status] = Number(row.count);
  }
  return out;
}

export async function getReview(id: string) {
  const [r] = await db.select().from(runners).where(eq(runners.id, id)).limit(1);
  if (!r) throw AppErrors.notFound("No runner with that id");
  const stats = await db.execute(sql`select
      (select count(*) from errands where runner_id = ${id} and status = 'delivered') delivered,
      (select count(*) from runners where id <> ${id} and (nin = ${r.nin ?? ""} or bvn = ${r.bvn ?? ""})
         and (${r.nin ?? ""} <> '' or ${r.bvn ?? ""} <> '')) duplicate_ids,
      (select count(*) from runners where id <> ${id} and guarantor ->> 'phone' = ${r.guarantor?.phone ?? ""}
         and ${r.guarantor?.phone ?? ""} <> '') shared_guarantor`);
  const s = Array.from(stats as unknown as any[])[0] ?? {};
  return {
    runner: {
      id: r.id,
      fullName: r.fullName,
      phone: r.phone,
      email: r.email,
      status: r.verificationStatus,
      nin: r.nin,
      bvn: r.bvn,
      guarantor: r.guarantor ?? null,
      note: r.verificationNote,
      submittedAt: r.verificationSubmittedAt?.toISOString() ?? null,
      reviewedAt: r.verificationReviewedAt?.toISOString() ?? null,
      joinedAt: r.createdAt.toISOString(),
      trustTier: r.trustTierLevel,
      deliveredErrands: Number(s.delivered ?? 0),
    },
    // Quick red flags for the reviewer: the same NIN/BVN on another account,
    // or the same guarantor phone used by other runners.
    flags: {
      otherAccountsWithSameId: Number(s.duplicate_ids ?? 0),
      otherRunnersWithSameGuarantor: Number(s.shared_guarantor ?? 0),
    },
  };
}

export async function approve(id: string) {
  const [row] = await db
    .update(runners)
    .set({ identityVerified: true, verificationStatus: "approved", verificationNote: null, verificationReviewedAt: new Date() })
    .where(eq(runners.id, id))
    .returning({ id: runners.id });
  if (!row) throw AppErrors.notFound("No runner with that id");
  void sendPushToUser("runner", id, {
    title: "You're verified",
    body: "Your identity has been approved. You can go online and start accepting errands.",
    data: { type: "verification", status: "approved" },
    channelId: "errands",
  });
  return getReview(id);
}

export async function reject(id: string, reason: string) {
  const [row] = await db
    .update(runners)
    .set({
      identityVerified: false,
      isOnline: false,
      verificationStatus: "rejected",
      verificationNote: reason,
      verificationReviewedAt: new Date(),
    })
    .where(eq(runners.id, id))
    .returning({ id: runners.id });
  if (!row) throw AppErrors.notFound("No runner with that id");
  void sendPushToUser("runner", id, {
    title: "Verification needs changes",
    body: reason,
    data: { type: "verification", status: "rejected" },
    channelId: "errands",
  });
  return getReview(id);
}
