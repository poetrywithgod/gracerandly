import { z } from "zod";

const geoPointInputSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

// Accepts all four PRD methods so the client can send whichever the runner
// picks — the route rejects anything but "bank_transfer" today with a
// clear "not available yet" message, rather than the schema silently
// disallowing them (see routes/runners.ts).
export const createVendorDisbursementSchema = z
  .object({
    vendorName: z.string().trim().min(1, "Vendor name is required"),
    method: z.enum(["virtual_card", "bank_transfer", "ussd", "cash_float"]),
    amount: z.number().int().positive("Amount must be greater than 0"),
    bankName: z.string().trim().optional(),
    accountNumber: z
      .string()
      .trim()
      .regex(/^\d{10}$/, "Account number must be 10 digits")
      .optional(),
    accountName: z.string().trim().optional(),
    // Where the runner is right now — used for the geoVerified audit flag,
    // never required to succeed (see vendorDisbursements.geoVerified).
    location: geoPointInputSchema.optional(),
  })
  .superRefine((data, ctx) => {
    if (data.method === "bank_transfer" && (!data.bankName || !data.accountNumber || !data.accountName)) {
      ctx.addIssue({
        code: "custom",
        path: ["bankName"],
        message: "Bank name, account number, and account name are required for a bank transfer",
      });
    }
  });

export type CreateVendorDisbursementInput = z.infer<typeof createVendorDisbursementSchema>;
