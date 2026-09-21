CREATE TYPE "public"."errand_category" AS ENUM('grocery', 'pharmacy', 'food', 'parcel', 'miscellaneous');--> statement-breakpoint
CREATE TYPE "public"."errand_status" AS ENUM('pending_match', 'accepted', 'en_route_to_pickup', 'in_progress', 'en_route_to_delivery', 'delivered', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."errand_urgency" AS ENUM('asap', 'scheduled');--> statement-breakpoint
CREATE TABLE "errands" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"requester_id" uuid NOT NULL,
	"runner_id" uuid,
	"category" "errand_category" NOT NULL,
	"urgency" "errand_urgency" NOT NULL,
	"status" "errand_status" DEFAULT 'pending_match' NOT NULL,
	"pickup" jsonb NOT NULL,
	"dropoff" jsonb NOT NULL,
	"items" jsonb NOT NULL,
	"instructions" text,
	"is_recurring" boolean DEFAULT false NOT NULL,
	"recurrence_rule" text,
	"estimated_cost" integer NOT NULL,
	"final_cost" integer,
	"sequence_order" integer,
	"delivery_pin" text,
	"ai_parsed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "errands" ADD CONSTRAINT "errands_requester_id_requesters_id_fk" FOREIGN KEY ("requester_id") REFERENCES "public"."requesters"("id") ON DELETE no action ON UPDATE no action;