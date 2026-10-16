CREATE TYPE "public"."trust_incident_type" AS ENUM('geofence_mismatch', 'route_deviation', 'theft_confirmed', 'dispute_lost', 'sos_triggered', 'other');--> statement-breakpoint
CREATE TABLE "trust_incidents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"runner_id" uuid NOT NULL,
	"errand_id" uuid,
	"type" "trust_incident_type" NOT NULL,
	"description" text NOT NULL,
	"confirmed" boolean DEFAULT false NOT NULL,
	"reviewed_by_admin_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "trust_incidents" ADD CONSTRAINT "trust_incidents_runner_id_runners_id_fk" FOREIGN KEY ("runner_id") REFERENCES "public"."runners"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trust_incidents" ADD CONSTRAINT "trust_incidents_errand_id_errands_id_fk" FOREIGN KEY ("errand_id") REFERENCES "public"."errands"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "trust_incidents_runner_idx" ON "trust_incidents" USING btree ("runner_id");--> statement-breakpoint
ALTER TABLE "trust_incidents" ENABLE ROW LEVEL SECURITY;