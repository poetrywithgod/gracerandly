CREATE TYPE "public"."reviewer_role" AS ENUM('requester', 'runner');--> statement-breakpoint
CREATE TABLE "errand_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"errand_id" uuid NOT NULL,
	"reviewer_role" "reviewer_role" NOT NULL,
	"reviewer_id" uuid NOT NULL,
	"reviewee_id" uuid NOT NULL,
	"rating" integer NOT NULL,
	"comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "errand_reviews_rating_range" CHECK ("errand_reviews"."rating" between 1 and 5)
);
--> statement-breakpoint
ALTER TABLE "errand_reviews" ADD CONSTRAINT "errand_reviews_errand_id_errands_id_fk" FOREIGN KEY ("errand_id") REFERENCES "public"."errands"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "errand_reviews_one_per_side_idx" ON "errand_reviews" USING btree ("errand_id","reviewer_role");--> statement-breakpoint
CREATE INDEX "errand_reviews_reviewee_idx" ON "errand_reviews" USING btree ("reviewee_id");