import { z } from "zod";

// Same shape as schemas/auth.ts's phoneSchema — kept as a separate copy
// rather than a shared import since requester/runner auth are meant to
// stay independently editable (see routes/runners.ts header comment).
const phoneSchema = z.string().regex(/^\+[0-9]{7,15}$/, "Enter a valid phone number");

// A runner proves who they are with ONE government ID. Format checks only:
// nothing here is verified against NIMC, a bank or the issuing agency — staff
// review the submission (lib/identity-review.ts).
export const ID_TYPES = ["nin", "bvn", "passport", "drivers_license"] as const;
export type IdType = (typeof ID_TYPES)[number];

const ID_RULES: Record<IdType, { re: RegExp; message: string }> = {
  nin: { re: /^\d{11}$/, message: "NIN must be 11 digits" },
  bvn: { re: /^\d{11}$/, message: "BVN must be 11 digits" },
  // Nigerian passports are a letter + 8 digits; foreign ones vary (6-9 letters/digits).
  passport: { re: /^[A-Z0-9]{6,9}$/, message: "Enter the passport number exactly as printed (6 to 9 letters or digits)" },
  // FRSC licence numbers are letters and digits, 8 to 15 characters.
  drivers_license: { re: /^[A-Z0-9]{8,15}$/, message: "Enter the licence number exactly as printed (8 to 15 letters or digits)" },
};

/** Removes spaces and dashes and upper-cases, so "abc 12345-aa" and "ABC12345AA" are the same number. */
export function normalizeIdNumber(value: string): string {
  return value.replace(/[\s-]/g, "").toUpperCase();
}

// People type Nigerian numbers the way they dial them (08012345678), not in
// +234 form. Normalise the common local shapes to international format
// before the strict phoneSchema check, so a perfectly good number isn't
// rejected just for how it was typed. Anything else is passed through
// unchanged and left for phoneSchema to judge.
function normalizeNigerianPhone(value: string): string {
  const compact = value.replace(/[\s-]/g, "");
  if (/^0\d{10}$/.test(compact)) return `+234${compact.slice(1)}`;
  if (/^234\d{10}$/.test(compact)) return `+${compact}`;
  return compact;
}

const guarantorPhoneSchema = z.string().transform(normalizeNigerianPhone).pipe(phoneSchema);

const guarantorSchema = z.object({
  fullName: z.string().trim().min(2, "Guarantor's full name is required"),
  phone: guarantorPhoneSchema,
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
  // Someone else's referral code, typed at signup (checked in the route).
  referralCode: z.string().trim().max(20).optional(),
  acceptedTerms: z.literal(true, { message: "Please agree to the Terms and Conditions to create an account" }),
  acceptedPrivacy: z.literal(true, { message: "Please agree to the Privacy Policy to create an account" }),
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
  idType: z.enum(ID_TYPES, { message: "Choose which ID you are using" }),
  idNumber: z.string().transform(normalizeIdNumber),
  guarantor: guarantorSchema,
}).superRefine((value, ctx) => {
  const rule = ID_RULES[value.idType];
  if (!rule.re.test(value.idNumber)) ctx.addIssue({ code: "custom", path: ["idNumber"], message: rule.message });
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
// Sent to confirm arriving at one of an errand's extra stops.
export const completeStopSchema = z.object({
  location: z.object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
  }),
});

export const updateErrandStatusSchema = z.object({
  status: z.enum(["en_route_to_pickup", "in_progress", "en_route_to_delivery", "delivered"]),
  location: geoPointSchema.optional(),
  pin: z
    .string()
    .regex(/^\d{4}$/, "Enter the 4-digit delivery PIN")
    .optional(),
});

export type UpdateErrandStatusInput = z.infer<typeof updateErrandStatusSchema>;
