ALTER TABLE "requesters" ADD COLUMN "suspended_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "requesters" ADD COLUMN "suspended_reason" text;--> statement-breakpoint
ALTER TABLE "runners" ADD COLUMN "suspended_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "runners" ADD COLUMN "suspended_reason" text;