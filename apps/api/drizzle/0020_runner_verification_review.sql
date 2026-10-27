CREATE TYPE "public"."verification_status" AS ENUM('unsubmitted', 'pending', 'approved', 'rejected');--> statement-breakpoint
ALTER TABLE "runners" ADD COLUMN "verification_status" "verification_status" DEFAULT 'unsubmitted' NOT NULL;--> statement-breakpoint
ALTER TABLE "runners" ADD COLUMN "verification_note" text;--> statement-breakpoint
ALTER TABLE "runners" ADD COLUMN "verification_submitted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "runners" ADD COLUMN "verification_reviewed_at" timestamp with time zone;--> statement-breakpoint
UPDATE "runners" SET "verification_status" = 'approved', "verification_reviewed_at" = now() WHERE "identity_verified" = true;
