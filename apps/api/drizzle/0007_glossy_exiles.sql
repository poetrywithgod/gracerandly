CREATE TYPE "public"."vehicle_type" AS ENUM('bicycle', 'motorcycle', 'car', 'on_foot');--> statement-breakpoint
ALTER TABLE "runners" ADD COLUMN "avatar_url" text;--> statement-breakpoint
ALTER TABLE "runners" ADD COLUMN "vehicle_type" "vehicle_type";--> statement-breakpoint
ALTER TABLE "runners" ADD COLUMN "bank_name" text;--> statement-breakpoint
ALTER TABLE "runners" ADD COLUMN "bank_account_number" text;--> statement-breakpoint
ALTER TABLE "runners" ADD COLUMN "bank_account_name" text;