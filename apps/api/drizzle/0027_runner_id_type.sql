ALTER TABLE "runners" ADD COLUMN "id_type" text;
--> statement-breakpoint
ALTER TABLE "runners" ADD COLUMN "id_number" text;
--> statement-breakpoint
UPDATE "runners" SET "id_type" = 'nin', "id_number" = "nin" WHERE "nin" IS NOT NULL AND "id_number" IS NULL;
--> statement-breakpoint
UPDATE "runners" SET "id_type" = 'bvn', "id_number" = "bvn" WHERE "bvn" IS NOT NULL AND "id_number" IS NULL;
