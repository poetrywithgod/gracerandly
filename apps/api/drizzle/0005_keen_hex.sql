CREATE TYPE "public"."trust_tier_level" AS ENUM('probationary', 'bronze', 'silver', 'gold');--> statement-breakpoint
CREATE TABLE "runners" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"full_name" text NOT NULL,
	"phone" text NOT NULL,
	"email" text,
	"password_hash" text NOT NULL,
	"nin" text NOT NULL,
	"bvn" text NOT NULL,
	"identity_verified" boolean DEFAULT false NOT NULL,
	"guarantor" jsonb NOT NULL,
	"trust_tier_level" "trust_tier_level" DEFAULT 'probationary' NOT NULL,
	"is_online" boolean DEFAULT false NOT NULL,
	"current_location" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "runners_phone_unique" UNIQUE("phone"),
	CONSTRAINT "runners_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "errands" ADD CONSTRAINT "errands_runner_id_runners_id_fk" FOREIGN KEY ("runner_id") REFERENCES "public"."runners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "escrow_transactions" ADD CONSTRAINT "escrow_transactions_runner_id_runners_id_fk" FOREIGN KEY ("runner_id") REFERENCES "public"."runners"("id") ON DELETE no action ON UPDATE no action;