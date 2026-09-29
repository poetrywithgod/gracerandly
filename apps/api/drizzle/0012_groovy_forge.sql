CREATE TYPE "public"."sos_alert_status" AS ENUM('active', 'resolved');--> statement-breakpoint
CREATE TYPE "public"."sos_triggered_by" AS ENUM('requester', 'runner');--> statement-breakpoint
CREATE TABLE "sos_alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"errand_id" uuid NOT NULL,
	"triggered_by_role" "sos_triggered_by" NOT NULL,
	"triggered_by_id" uuid NOT NULL,
	"location" jsonb NOT NULL,
	"status" "sos_alert_status" DEFAULT 'active' NOT NULL,
	"notified_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "sos_alerts" ADD CONSTRAINT "sos_alerts_errand_id_errands_id_fk" FOREIGN KEY ("errand_id") REFERENCES "public"."errands"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "sos_alerts_one_active_per_person_idx" ON "sos_alerts" USING btree ("errand_id","triggered_by_role") WHERE "sos_alerts"."status" = 'active';