CREATE TYPE "public"."runner_payout_status" AS ENUM('pending', 'success', 'failed');--> statement-breakpoint
CREATE TABLE "runner_payouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"runner_id" uuid NOT NULL,
	"amount" integer NOT NULL,
	"status" "runner_payout_status" DEFAULT 'pending' NOT NULL,
	"transaction_ids" jsonb NOT NULL,
	"provider_reference" text NOT NULL,
	"failure_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "runner_payouts_provider_reference_unique" UNIQUE("provider_reference")
);
--> statement-breakpoint
ALTER TABLE "runners" ADD COLUMN "bank_code" text;--> statement-breakpoint
ALTER TABLE "runners" ADD COLUMN "bank_account_verified" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "runners" ADD COLUMN "paystack_recipient_code" text;--> statement-breakpoint
ALTER TABLE "runner_payouts" ADD CONSTRAINT "runner_payouts_runner_id_runners_id_fk" FOREIGN KEY ("runner_id") REFERENCES "public"."runners"("id") ON DELETE no action ON UPDATE no action;