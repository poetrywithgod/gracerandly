CREATE TYPE "public"."gender" AS ENUM('female', 'male', 'unspecified');--> statement-breakpoint
CREATE TABLE "requesters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"full_name" text NOT NULL,
	"phone" text NOT NULL,
	"email" text,
	"gender" "gender" NOT NULL,
	"password_hash" text NOT NULL,
	"phone_verified" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "requesters_phone_unique" UNIQUE("phone"),
	CONSTRAINT "requesters_email_unique" UNIQUE("email")
);
