import { z } from "zod";

// E.164-ish: "+" followed by 7-15 digits. Matches what the mobile app's
// PhoneField builds ("+" + dial code + local number).
const phoneSchema = z
  .string()
  .regex(/^\+[0-9]{7,15}$/, "Enter a valid phone number");

export const signupSchema = z.object({
  fullName: z.string().trim().min(2, "Full name is required"),
  phone: phoneSchema,
  email: z.email("Enter a valid email address").optional(),
  password: z.string().min(6, "Password must be at least 6 characters"),
  gender: z.enum(["female", "male", "unspecified"]),
});

export type SignupInput = z.infer<typeof signupSchema>;

export const loginSchema = z.object({
  phone: phoneSchema,
  password: z.string().min(1, "Password is required"),
});

export type LoginInput = z.infer<typeof loginSchema>;

const MAX_BIO_LENGTH = 280;

export const updateProfileSchema = z
  .object({
    fullName: z.string().trim().min(2, "Full name is required"),
    email: z.email("Enter a valid email address"),
    gender: z.enum(["female", "male", "unspecified"]),
    // Empty string clears the bio — `.partial()` only makes the *key*
    // optional, "" is still a valid string value that reaches the handler.
    bio: z.string().trim().max(MAX_BIO_LENGTH, `Bio must be ${MAX_BIO_LENGTH} characters or fewer`),
    status: z.enum(["available", "busy", "offline"]),
  })
  .partial();

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

// "data:image/jpeg;base64,...." etc. The requester app downsizes/compresses
// before encoding (see PhotoPickerModal), so this cap is mostly a backstop
// against a misbehaving client rather than the primary size control.
const MAX_AVATAR_DATA_URI_LENGTH = 2_000_000; // ~1.4MB of raw image data once base64-decoded

export const updateAvatarSchema = z.object({
  // null clears the avatar back to the initials placeholder.
  image: z
    .string()
    .regex(/^data:image\/(png|jpe?g|webp);base64,/, "Expected a base64 image data URI")
    .max(MAX_AVATAR_DATA_URI_LENGTH, "Image is too large")
    .nullable(),
});

export type UpdateAvatarInput = z.infer<typeof updateAvatarSchema>;

export const verificationChannelSchema = z.object({
  channel: z.enum(["phone", "email"]),
});

export type VerificationChannelInput = z.infer<typeof verificationChannelSchema>;

export const confirmVerificationSchema = z.object({
  channel: z.enum(["phone", "email"]),
  code: z.string().regex(/^\d{6}$/, "Enter the 6-digit code"),
});

export type ConfirmVerificationInput = z.infer<typeof confirmVerificationSchema>;
