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
