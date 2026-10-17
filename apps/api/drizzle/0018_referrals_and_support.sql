CREATE TYPE "public"."referral_reward_status" AS ENUM('available', 'reserved', 'used');--> statement-breakpoint
CREATE TYPE "public"."referral_status" AS ENUM('pending', 'qualified');--> statement-breakpoint
CREATE TYPE "public"."support_category" AS ENUM('payment', 'errand_problem', 'other_person', 'account', 'safety', 'other');--> statement-breakpoint
CREATE TYPE "public"."support_sender" AS ENUM('requester', 'runner', 'staff');--> statement-breakpoint
CREATE TYPE "public"."support_status" AS ENUM('open', 'awaiting_user', 'resolved', 'closed');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('requester', 'runner');--> statement-breakpoint
CREATE TABLE "referral_rewards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"referral_id" uuid NOT NULL,
	"beneficiary_role" "user_role" NOT NULL,
	"beneficiary_id" uuid NOT NULL,
	"amount" integer NOT NULL,
	"status" "referral_reward_status" DEFAULT 'available' NOT NULL,
	"reserved_for_transaction_id" uuid,
	"reserved_for_payout_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"used_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "referrals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"referrer_role" "user_role" NOT NULL,
	"referrer_id" uuid NOT NULL,
	"referred_role" "user_role" NOT NULL,
	"referred_id" uuid NOT NULL,
	"status" "referral_status" DEFAULT 'pending' NOT NULL,
	"qualified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "support_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ticket_id" uuid NOT NULL,
	"sender" "support_sender" NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "support_tickets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_role" "user_role" NOT NULL,
	"user_id" uuid NOT NULL,
	"errand_id" uuid,
	"category" "support_category" NOT NULL,
	"subject" text NOT NULL,
	"status" "support_status" DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "escrow_transactions" ADD COLUMN "credit_applied" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "requesters" ADD COLUMN "referral_code" text;--> statement-breakpoint
ALTER TABLE "runners" ADD COLUMN "referral_code" text;--> statement-breakpoint
ALTER TABLE "referral_rewards" ADD CONSTRAINT "referral_rewards_referral_id_referrals_id_fk" FOREIGN KEY ("referral_id") REFERENCES "public"."referrals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_messages" ADD CONSTRAINT "support_messages_ticket_id_support_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."support_tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_errand_id_errands_id_fk" FOREIGN KEY ("errand_id") REFERENCES "public"."errands"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "referral_rewards_beneficiary_idx" ON "referral_rewards" USING btree ("beneficiary_role","beneficiary_id");--> statement-breakpoint
CREATE UNIQUE INDEX "referrals_one_per_referred_idx" ON "referrals" USING btree ("referred_role","referred_id");--> statement-breakpoint
CREATE INDEX "referrals_referrer_idx" ON "referrals" USING btree ("referrer_role","referrer_id");--> statement-breakpoint
CREATE INDEX "support_messages_ticket_idx" ON "support_messages" USING btree ("ticket_id");--> statement-breakpoint
CREATE INDEX "support_tickets_user_idx" ON "support_tickets" USING btree ("user_role","user_id");--> statement-breakpoint
CREATE INDEX "support_tickets_status_idx" ON "support_tickets" USING btree ("status");--> statement-breakpoint
ALTER TABLE "requesters" ADD CONSTRAINT "requesters_referral_code_unique" UNIQUE("referral_code");--> statement-breakpoint
ALTER TABLE "runners" ADD CONSTRAINT "runners_referral_code_unique" UNIQUE("referral_code");--> statement-breakpoint
ALTER TABLE "referrals" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "referral_rewards" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "support_tickets" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "support_messages" ENABLE ROW LEVEL SECURITY;
