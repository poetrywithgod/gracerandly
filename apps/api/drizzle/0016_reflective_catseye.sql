CREATE TYPE "public"."recurrence_frequency" AS ENUM('daily', 'weekly', 'biweekly', 'monthly');--> statement-breakpoint
CREATE TABLE "recurring_errands" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"requester_id" uuid NOT NULL,
	"category" "errand_category" NOT NULL,
	"frequency" "recurrence_frequency" NOT NULL,
	"pickup" jsonb NOT NULL,
	"dropoff" jsonb NOT NULL,
	"stops" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"items" jsonb NOT NULL,
	"instructions" text,
	"estimated_cost" integer NOT NULL,
	"items_budget" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"next_run_at" timestamp with time zone NOT NULL,
	"last_run_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "errands" ADD COLUMN "stops" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "errands" ADD COLUMN "recurring_id" uuid;--> statement-breakpoint
ALTER TABLE "recurring_errands" ADD CONSTRAINT "recurring_errands_requester_id_requesters_id_fk" FOREIGN KEY ("requester_id") REFERENCES "public"."requesters"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "errands" ADD CONSTRAINT "errands_recurring_id_recurring_errands_id_fk" FOREIGN KEY ("recurring_id") REFERENCES "public"."recurring_errands"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_errands" ENABLE ROW LEVEL SECURITY;
