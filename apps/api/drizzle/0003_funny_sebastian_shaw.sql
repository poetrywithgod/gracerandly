CREATE TYPE "public"."requester_status" AS ENUM('available', 'busy', 'offline');--> statement-breakpoint
CREATE TYPE "public"."verification_channel" AS ENUM('phone', 'email');--> statement-breakpoint
CREATE TABLE "verification_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"requester_id" uuid NOT NULL,
	"channel" "verification_channel" NOT NULL,
	"code_hash" text NOT NULL,
	"destination" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "requesters" ADD COLUMN "email_verified" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "requesters" ADD COLUMN "avatar_url" text;--> statement-breakpoint
ALTER TABLE "requesters" ADD COLUMN "bio" text;--> statement-breakpoint
ALTER TABLE "requesters" ADD COLUMN "status" "requester_status" DEFAULT 'available' NOT NULL;--> statement-breakpoint
ALTER TABLE "verification_codes" ADD CONSTRAINT "verification_codes_requester_id_requesters_id_fk" FOREIGN KEY ("requester_id") REFERENCES "public"."requesters"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "verification_codes_requester_channel_idx" ON "verification_codes" USING btree ("requester_id","channel");