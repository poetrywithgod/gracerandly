CREATE TYPE "public"."chat_content_type" AS ENUM('text', 'audio');--> statement-breakpoint
CREATE TYPE "public"."chat_message_kind" AS ENUM('message', 'edit');--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN "kind" "chat_message_kind" DEFAULT 'message' NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN "content_type" "chat_content_type" DEFAULT 'text' NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN "target_message_id" uuid;