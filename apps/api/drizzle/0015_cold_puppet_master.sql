ALTER TABLE "sos_alerts" ADD COLUMN "last_update_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sos_alerts" ADD COLUMN "last_update_location" jsonb;--> statement-breakpoint
ALTER TABLE "sos_alerts" ADD COLUMN "update_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "sos_alerts" ADD COLUMN "resolved_by" text;