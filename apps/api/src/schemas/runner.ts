import { z } from "zod";

// Same shape as schemas/auth.ts's phoneSchema — kept as a separate copy
// rather than a shared import since requester/runner auth are meant to
// stay independently editable (see routes/runners.ts header comment).
const phoneSchema = z.string().regex(/^\+[0-9]{7,15}$/, "Enter a valid phone number");

// NIN is 11 digits, BVN is 11 digits — both purely numeric in Nigeria.
// This is a format check only; nothing here verifies these against NIMC/
// banks (see schema.ts's identityVerified comment).
const ninSchema = z.string().regex(/^\d{11}$/, "NIN must be 11 digits");
const bvnSchema = z.string().regex(/^\d{11}$/, "BVN must be 11 digits");

const guarantorSchema = z.object({
  fullName: z.string().trim().min(2, "Guarantor's full name is required"),
  phone: phoneSchema,
  relationship: z.string().trim().min(2, "How this person knows you is required"),
});

// Signup only collects what's needed to create the account — NIN/BVN/
// guarantor move to a separate post-signup step (see
// submitVerificationSchema below) so a new runner can get into the app
// immediately and complete identity verification from Settings, rather
// than facing a long form before they've even seen the app.
export const runnerSignupSchema = z.object({
  fullName: z.string().trim().min(2, "Full name is required"),
  phone: phoneSchema,
  email: z.email("Enter a valid email address").optional(),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

export type RunnerSignupInput = z.infer<typeof runnerSignupSchema>;

export const runnerLoginSchema = z.object({
  phone: phoneSchema,
  password: z.string().min(1, "Password is required"),
});

export type RunnerLoginInput = z.infer<typeof runnerLoginSchema>;

// PATCH /runners/me/verification — submitted from the Runner app's
// Settings screen, any time after signup. A runner can't go online or
// accept errands until this has been submitted (see routes/runners.ts).
export const submitVerificationSchema = z.object({
  nin: ninSchema,
  bvn: bvnSchema,
  guarantor: guarantorSchema,
});

export type SubmitVerificationInput = z.infer<typeof submitVerificationSchema>;

const geoPointSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

// Runners report whether they're taking new errands plus (when online)
// their live position in one call, since the Runner app sends both
// together on every location tick.
export const updateRunnerStatusSchema = z.object({
  isOnline: z.boolean(),
  location: geoPointSchema.extend({ heading: z.number().min(0).max(360).optional() }).optional(),
});

export type UpdateRunnerStatusInput = z.infer<typeof updateRunnerStatusSchema>;

export const availableErrandsQuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
});

export type AvailableErrandsQuery = z.infer<typeof availableErrandsQuerySchema>;

// Sent with a status-transition PATCH. `location` is required for the two
// geofenced transitions (arriving at pickup, arriving at drop-off — see
// routes/runners.ts); `pin` is required only for the final "delivered"
// transition.
export const updateErrandStatusSchema = z.object({
  status: z.enum(["en_route_to_pickup", "in_progress", "en_route_to_delivery", "delivered"]),
  location: geoPointSchema.optional(),
  pin: z
    .string()
    .regex(/^\d{4}$/, "Enter the 4-digit delivery PIN")
    .optional(),
});

export type UpdateErrandStatusInput = z.infer<typeof updateErrandStatusSchema>;
