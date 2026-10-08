/**
 * Ratings and reviews between the two sides of a delivered errand.
 * See errandReviews in db/schema.ts for the rules.
 */
import { and, eq, sql } from "drizzle-orm";
import { db } from "../db/client";
import { errandReviews, type ErrandReviewRow } from "../db/schema";
import { AppErrors } from "./errors";

export type ReviewerRole = "requester" | "runner";

export interface RatingSummary {
  /** Mean of the 1-5 ratings, one decimal; null until there's at least one. */
  average: number | null;
  count: number;
}

/** What others have rated this person (a runner as rated by requesters, or a requester as rated by runners). */
export async function ratingSummaryFor(personRole: ReviewerRole, personId: string): Promise<RatingSummary> {
  const reviewerRole: ReviewerRole = personRole === "runner" ? "requester" : "runner";
  const [row] = await db
    .select({ avg: sql<string | null>`avg(${errandReviews.rating})`, count: sql<number>`count(*)::int` })
    .from(errandReviews)
    .where(and(eq(errandReviews.revieweeId, personId), eq(errandReviews.reviewerRole, reviewerRole)));
  const count = row?.count ?? 0;
  return { average: count > 0 && row?.avg != null ? Math.round(Number(row.avg) * 10) / 10 : null, count };
}

export interface ReviewState {
  /** Delivered, and this person hasn't reviewed yet. */
  canReview: boolean;
  myReview: { rating: number; comment: string | null } | null;
  /** The other side's average rating, for context on the screen. */
  otherRating: RatingSummary;
}

interface ErrandParties {
  id: string;
  status: string;
  requesterId: string;
  runnerId: string | null;
}

function otherPartyId(errand: ErrandParties, role: ReviewerRole): string | null {
  return role === "requester" ? errand.runnerId : errand.requesterId;
}

export async function getReviewState(errand: ErrandParties, role: ReviewerRole): Promise<ReviewState> {
  const [mine] = await db
    .select()
    .from(errandReviews)
    .where(and(eq(errandReviews.errandId, errand.id), eq(errandReviews.reviewerRole, role)))
    .limit(1);
  const otherId = otherPartyId(errand, role);
  const otherRole: ReviewerRole = role === "requester" ? "runner" : "requester";
  return {
    canReview: errand.status === "delivered" && !!otherId && !mine,
    myReview: mine ? { rating: mine.rating, comment: mine.comment } : null,
    otherRating: otherId ? await ratingSummaryFor(otherRole, otherId) : { average: null, count: 0 },
  };
}

export async function submitReview(
  errand: ErrandParties,
  role: ReviewerRole,
  reviewerId: string,
  rating: number,
  comment: string | undefined
): Promise<ErrandReviewRow> {
  const revieweeId = otherPartyId(errand, role);
  if (errand.status !== "delivered" || !revieweeId) {
    throw AppErrors.conflict("You can rate once the errand has been delivered");
  }
  const [inserted] = await db
    .insert(errandReviews)
    .values({ errandId: errand.id, reviewerRole: role, reviewerId, revieweeId, rating, comment: comment ?? null })
    .onConflictDoNothing()
    .returning();
  if (!inserted) throw AppErrors.conflict("You've already rated this errand");
  return inserted;
}
