CREATE TYPE "public"."disbursement_method" AS ENUM('virtual_card', 'bank_transfer', 'ussd', 'cash_float');--> statement-breakpoint
CREATE TYPE "public"."vendor_disbursement_status" AS ENUM('pending', 'success', 'failed');--> statement-breakpoint
CREATE TABLE "vendor_disbursements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"errand_id" uuid NOT NULL,
	"runner_id" uuid NOT NULL,
	"vendor_name" text NOT NULL,
	"method" "disbursement_method" NOT NULL,
	"amount" integer NOT NULL,
	"bank_name" text,
	"bank_code" text,
	"bank_account_number" text,
	"bank_account_name" text,
	"status" "vendor_disbursement_status" DEFAULT 'pending' NOT NULL,
	"provider_reference" text,
	"failure_reason" text,
	"receipt_photo_url" text,
	"geo_verified" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "vendor_disbursements_provider_reference_unique" UNIQUE("provider_reference")
);
--> statement-breakpoint
ALTER TABLE "errands" ADD COLUMN "items_budget" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "escrow_transactions" ADD COLUMN "items_budget" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "escrow_transactions" ADD COLUMN "items_spent" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "vendor_disbursements" ADD CONSTRAINT "vendor_disbursements_errand_id_errands_id_fk" FOREIGN KEY ("errand_id") REFERENCES "public"."errands"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_disbursements" ADD CONSTRAINT "vendor_disbursements_runner_id_runners_id_fk" FOREIGN KEY ("runner_id") REFERENCES "public"."runners"("id") ON DELETE no action ON UPDATE no action;