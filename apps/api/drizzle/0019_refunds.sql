CREATE TYPE "public"."refund_reason" AS ENUM('cancelled', 'items_leftover', 'admin');--> statement-breakpoint
CREATE TYPE "public"."refund_status" AS ENUM('pending', 'processed', 'failed');--> statement-breakpoint
CREATE TABLE "refunds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"escrow_transaction_id" uuid NOT NULL,
	"errand_id" uuid NOT NULL,
	"requester_id" uuid NOT NULL,
	"amount" integer NOT NULL,
	"reason" "refund_reason" NOT NULL,
	"note" text,
	"status" "refund_status" DEFAULT 'pending' NOT NULL,
	"provider_reference" text,
	"failure_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_escrow_transaction_id_escrow_transactions_id_fk" FOREIGN KEY ("escrow_transaction_id") REFERENCES "public"."escrow_transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_errand_id_errands_id_fk" FOREIGN KEY ("errand_id") REFERENCES "public"."errands"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_requester_id_requesters_id_fk" FOREIGN KEY ("requester_id") REFERENCES "public"."requesters"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "refunds_errand_idx" ON "refunds" USING btree ("errand_id");--> statement-breakpoint
CREATE UNIQUE INDEX "refunds_once_per_reason_idx" ON "refunds" USING btree ("escrow_transaction_id","reason") WHERE "refunds"."reason" <> 'admin';
--> statement-breakpoint
ALTER TABLE "refunds" ENABLE ROW LEVEL SECURITY;
