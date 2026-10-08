import { z } from "zod";

export const submitReviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z
    .string()
    .trim()
    .max(500, "Keep the comment under 500 characters")
    .optional()
    .transform((value) => (value ? value : undefined)),
});
