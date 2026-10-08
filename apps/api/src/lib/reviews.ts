/**
 * Ratings and reviews between the two sides of a delivered errand.
 * See errandReviews in db/schema.ts for the rules.
 */
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "../db/client";
import { errandReviews, requesters, runners, type ErrandReviewRow } from "../db/schema";
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

export interface PublicReview {
  id: string;
  rating: number;
  comment: string | null;
  createdAt: string;
  /** First name only — reviews show who wrote them without exposing full names. */
  reviewerName: string;
}

const REVIEWS_PAGE_SIZE = 50;

/** The reviews others have written about this person, newest first, with
 * their average. A runner is reviewed by requesters and vice versa. */
export async function listReviewsAbout(
  personRole: ReviewerRole,
  personId: string
): Promise<{ summary: RatingSummary; reviews: PublicReview[] }> {
  const reviewerRole: ReviewerRole = personRole === "runner" ? "requester" : "runner";
  const reviewerTable = reviewerRole === "requester" ? requesters : runners;
  const rows = await db
    .select({
      id: errandReviews.id,
      rating: errandReviews.rating,
      comment: errandReviews.comment,
      createdAt: errandReviews.createdAt,
      reviewerFullName: reviewerTable.fullName,
    })
    .from(errandReviews)
    .leftJoin(reviewerTable, eq(reviewerTable.id, errandReviews.reviewerId))
    .where(and(eq(errandReviews.revieweeId, personId), eq(errandReviews.reviewerRole, reviewerRole)))
    .orderBy(desc(errandReviews.createdAt))
    .limit(REVIEWS_PAGE_SIZE);

  return {
    summary: await ratingSummaryFor(personRole, personId),
    reviews: rows.map((row) => ({
      id: row.id,
      rating: row.rating,
      comment: row.comment,
      createdAt: row.createdAt.toISOString(),
      reviewerName: row.reviewerFullName?.trim().split(/\s+/)[0] || "Someone",
    })),
  };
}
