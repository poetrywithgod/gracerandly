ALTER TABLE "requesters" ADD COLUMN "legal_accepted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "requesters" ADD COLUMN "legal_version" text;--> statement-breakpoint
ALTER TABLE "runners" ADD COLUMN "legal_accepted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "runners" ADD COLUMN "legal_version" text;