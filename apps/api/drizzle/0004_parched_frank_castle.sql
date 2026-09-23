CREATE TYPE "public"."transaction_status" AS ENUM('pending', 'escrowed', 'disbursed', 'released', 'refunded', 'failed');--> statement-breakpoint
CREATE TABLE "escrow_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"errand_id" uuid NOT NULL,
	"requester_id" uuid NOT NULL,
	"runner_id" uuid,
	"amount" integer NOT NULL,
	"commission_amount" integer NOT NULL,
	"runner_payout" integer NOT NULL,
	"status" "transaction_status" DEFAULT 'pending' NOT NULL,
	"provider_reference" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"released_at" timestamp with time zone,
	CONSTRAINT "escrow_transactions_provider_reference_unique" UNIQUE("provider_reference")
);
--> statement-breakpoint
ALTER TABLE "escrow_transactions" ADD CONSTRAINT "escrow_transactions_errand_id_errands_id_fk" FOREIGN KEY ("errand_id") REFERENCES "public"."errands"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "escrow_transactions" ADD CONSTRAINT "escrow_transactions_requester_id_requesters_id_fk" FOREIGN KEY ("requester_id") REFERENCES "public"."requesters"("id") ON DELETE no action ON UPDATE no action;