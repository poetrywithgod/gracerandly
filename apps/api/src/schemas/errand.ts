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

// Extra stops between the pickup and the drop-off. No `id` — the server
// assigns one, same as items. Capped so a form can't turn into a route plan.
export const MAX_EXTRA_STOPS = 4;
const errandStopSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  address: z.string().trim().min(1).optional(),
  note: z.string().trim().max(200).optional(),
});

export const RECURRENCE_FREQUENCIES = ["daily", "weekly", "biweekly", "monthly"] as const;

const baseErrandFields = {
  category: z.enum(["grocery", "pharmacy", "food", "parcel", "miscellaneous"]),
  urgency: z.enum(["asap", "scheduled"]),
  scheduledFor: z.string().datetime().optional(),
  pickup: geoPointSchema,
  dropoff: geoPointSchema,
  stops: z.array(errandStopSchema).max(MAX_EXTRA_STOPS, `You can add up to ${MAX_EXTRA_STOPS} extra stops`).optional(),
  items: z.array(errandItemSchema).min(1, "Add at least one item"),
  instructions: z.string().trim().optional(),
  isRecurring: z.boolean().default(false),
  recurrenceRule: z.enum(RECURRENCE_FREQUENCIES).optional(),
  estimatedCost: z.number().int().positive("Estimated cost must be greater than 0"),
  // Money for the runner to actually buy the items — separate from
  // estimatedCost (the delivery/service fee). Optional; defaults to 0 for
  // categories like "parcel" with nothing to purchase.
  itemsBudget: z.number().int().nonnegative("Items budget can't be negative").optional().default(0),
  // True when the requester used the "parse with AI" entry point to draft
  // this errand (even if they then edited the result) — set by the client
  // on submit, not derived server-side, since the server has no way to
  // know which path the requester took to fill the form.
  aiParsed: z.boolean().optional(),
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
  .superRefine(requireScheduledForWhenScheduled)
  .superRefine((data, ctx) => {
    // A repeating errand needs to know the pattern and when it starts.
    if (data.isRecurring && !data.recurrenceRule) {
      ctx.addIssue({ code: "custom", path: ["recurrenceRule"], message: "Choose how often this repeats" });
    }
    if (data.isRecurring && data.urgency !== "scheduled") {
      ctx.addIssue({
        code: "custom",
        path: ["urgency"],
        message: "A repeating errand needs a scheduled start time",
      });
    }
  });

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

export const parseErrandTextSchema = z.object({
  text: z.string().trim().min(3, "Add a bit more detail").max(2000, "That's a lot — try trimming it down"),
});

export type ParseErrandTextInput = z.infer<typeof parseErrandTextSchema>;
