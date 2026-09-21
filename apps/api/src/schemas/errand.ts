import { z } from "zod";

const geoPointSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  address: z.string().trim().min(1).optional(),
});

// No `id` here — the server assigns each item an id on insert so the
// client doesn't have to generate/track them.
const errandItemSchema = z.object({
  name: z.string().trim().min(1, "Item name is required"),
  quantity: z.number().int().positive("Quantity must be at least 1"),
  notes: z.string().trim().optional(),
});

export const createErrandSchema = z.object({
  category: z.enum(["grocery", "pharmacy", "food", "parcel", "miscellaneous"]),
  urgency: z.enum(["asap", "scheduled"]),
  pickup: geoPointSchema,
  dropoff: geoPointSchema,
  items: z.array(errandItemSchema).min(1, "Add at least one item"),
  instructions: z.string().trim().optional(),
  isRecurring: z.boolean().default(false),
  recurrenceRule: z.string().trim().optional(),
  estimatedCost: z.number().int().positive("Estimated cost must be greater than 0"),
});

export type CreateErrandInput = z.infer<typeof createErrandSchema>;
