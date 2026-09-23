import { z } from "zod";

export const payForErrandSchema = z.object({
  // Where Paystack's checkout redirects back to after the requester pays —
  // the requester app's deep link, e.g. gracerandly://payment-callback.
  callbackUrl: z.url(),
});

export type PayForErrandInput = z.infer<typeof payForErrandSchema>;

export const verifyPaymentSchema = z.object({
  reference: z.string().min(1, "Missing payment reference"),
});

export type VerifyPaymentInput = z.infer<typeof verifyPaymentSchema>;
