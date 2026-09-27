CREATE TYPE "public"."chat_sender_role" AS ENUM('requester', 'runner');--> statement-breakpoint
CREATE TABLE "chat_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"errand_id" uuid NOT NULL,
	"sender_role" "chat_sender_role" NOT NULL,
	"sender_id" uuid NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_errand_id_errands_id_fk" FOREIGN KEY ("errand_id") REFERENCES "public"."errands"("id") ON DELETE no action ON UPDATE no action;