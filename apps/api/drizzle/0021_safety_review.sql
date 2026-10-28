ALTER TABLE "trust_incidents" ADD COLUMN "dismissed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "trust_incidents" ADD COLUMN "reviewed_at" timestamp with time zone;