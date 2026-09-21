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

const baseErrandFields = {
  category: z.enum(["grocery", "pharmacy", "food", "parcel", "miscellaneous"]),
  urgency: z.enum(["asap", "scheduled"]),
  scheduledFor: z.string().datetime().optional(),
  pickup: geoPointSchema,
  dropoff: geoPointSchema,
  items: z.array(errandItemSchema).min(1, "Add at least one item"),
  instructions: z.string().trim().optional(),
  isRecurring: z.boolean().default(false),
  recurrenceRule: z.string().trim().optional(),
  estimatedCost: z.number().int().positive("Estimated cost must be greater than 0"),
};

function requireScheduledForWhenScheduled<T extends { urgency: string; scheduledFor?: string }>(
  data: T,
  ctx: z.RefinementCtx
) {
  if (data.urgency === "scheduled" && !data.scheduledFor) {
    ctx.addIssue({
      code: "custom",
      path: ["scheduledFor"],
      message: "Set a time for this scheduled errand",
    });
  }
}

export const createErrandSchema = z
  .object(baseErrandFields)
  .superRefine(requireScheduledForWhenScheduled);

export type CreateErrandInput = z.infer<typeof createErrandSchema>;

// All fields optional for PATCH — only the fields the client actually sends
// get updated. The scheduledFor/urgency cross-check still applies whenever
// urgency is part of the payload.
export const updateErrandSchema = z
  .object(baseErrandFields)
  .partial()
  .superRefine((data, ctx) => {
    if (data.urgency !== undefined) {
      requireScheduledForWhenScheduled(
        { urgency: data.urgency, scheduledFor: data.scheduledFor },
        ctx
      );
    }
  });

export type UpdateErrandInput = z.infer<typeof updateErrandSchema>;
