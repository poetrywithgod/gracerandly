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

// PATCH /runners/me — profile fields a runner can change any time (unlike
// NIN/BVN/guarantor, which lock in once verification is submitted; see
// routes/runners.ts's PATCH /me handler for that rule).
export const updateRunnerProfileSchema = z
  .object({
    fullName: z.string().trim().min(2, "Full name is required"),
    email: z.email("Enter a valid email address"),
    vehicleType: z.enum(["bicycle", "motorcycle", "car", "on_foot"]),
  })
  .partial();

export type UpdateRunnerProfileInput = z.infer<typeof updateRunnerProfileSchema>;

// Same shape and size cap as schemas/auth.ts's updateAvatarSchema — see
// that file's comment for why the cap is ~1.4MB of decoded image data.
const MAX_AVATAR_DATA_URI_LENGTH = 2_000_000;

export const updateRunnerAvatarSchema = z.object({
  image: z
    .string()
    .regex(/^data:image\/(png|jpe?g|webp);base64,/, "Expected a base64 image data URI")
    .max(MAX_AVATAR_DATA_URI_LENGTH, "Image is too large")
    .nullable(),
});

export type UpdateRunnerAvatarInput = z.infer<typeof updateRunnerAvatarSchema>;

// PATCH /runners/me/payout-account — where a runner's payout would land
// once real disbursement exists (PRD 6.7). Nigerian NUBAN account numbers
// are 10 digits.
export const updatePayoutAccountSchema = z.object({
  bankName: z.string().trim().min(2, "Bank name is required"),
  accountNumber: z.string().regex(/^\d{10}$/, "Enter a valid 10-digit account number"),
  accountName: z.string().trim().min(2, "Account name is required"),
});

export type UpdatePayoutAccountInput = z.infer<typeof updatePayoutAccountSchema>;

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
