// Paystack REST client for escrow pay-ins.
//
// Unlike lib/sms.ts and lib/email.ts, this isn't behind a swappable
// provider interface with a console fallback — payments are exactly the
// kind of thing that should fail loudly rather than silently "succeed" in
// dev. If PAYSTACK_SECRET_KEY isn't set, every call here throws.
//
// Paystack's amounts are in kobo (1 Naira = 100 kobo); everywhere else in
// this codebase (errands.estimatedCost, escrowTransactions.amount) money
// is a whole-Naira integer, so the kobo conversion happens only at this
// boundary — see amountToKobo/koboToAmount.

import { createHmac } from "node:crypto";

const PAYSTACK_BASE_URL = "https://api.paystack.co";

function getSecretKey(): string {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) {
    throw new Error(
      "PAYSTACK_SECRET_KEY is not set. Copy apps/api/.env.example to apps/api/.env and fill it in " +
        "(get a test key from https://dashboard.paystack.com/#/settings/developer)."
    );
  }
  return key;
}

export function amountToKobo(nairaAmount: number): number {
  return Math.round(nairaAmount * 100);
}

export function koboToAmount(kobo: number): number {
  return Math.round(kobo / 100);
}

interface InitializeParams {
  email: string;
  amountNaira: number;
  reference: string;
  callbackUrl: string;
}

interface InitializeResult {
  authorizationUrl: string;
  accessCode: string;
}

export async function initializeTransaction(params: InitializeParams): Promise<InitializeResult> {
  const res = await fetch(`${PAYSTACK_BASE_URL}/transaction/initialize`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getSecretKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email: params.email,
      amount: amountToKobo(params.amountNaira),
      reference: params.reference,
      callback_url: params.callbackUrl,
    }),
  });

  const data = (await res.json()) as {
    status: boolean;
    message: string;
    data?: { authorization_url: string; access_code: string; reference: string };
  };

  if (!res.ok || !data.status || !data.data) {
    throw new Error(`Paystack initialize failed: ${data.message ?? res.statusText}`);
  }

  return { authorizationUrl: data.data.authorization_url, accessCode: data.data.access_code };
}

interface VerifyResult {
  success: boolean;
  amountNaira: number;
  reference: string;
}

export async function verifyTransaction(reference: string): Promise<VerifyResult> {
  const res = await fetch(`${PAYSTACK_BASE_URL}/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: { Authorization: `Bearer ${getSecretKey()}` },
  });

  const data = (await res.json()) as {
    status: boolean;
    message: string;
    data?: { status: string; amount: number; reference: string };
  };

  if (!res.ok || !data.status || !data.data) {
    throw new Error(`Paystack verify failed: ${data.message ?? res.statusText}`);
  }

  return {
    success: data.data.status === "success",
    amountNaira: koboToAmount(data.data.amount),
    reference: data.data.reference,
  };
}

/**
 * Verifies a webhook request actually came from Paystack, per their
 * documented scheme: HMAC-SHA512 of the raw request body, using the
 * secret key, compared against the x-paystack-signature header.
 * https://paystack.com/docs/payments/webhooks/
 */
export function verifyWebhookSignature(rawBody: Buffer, signatureHeader: string | undefined): boolean {
  if (!signatureHeader) return false;
  const expected = createHmac("sha512", getSecretKey()).update(rawBody).digest("hex");
  return expected === signatureHeader;
}

// Placeholder platform commission — the real rate is a business decision
// that hasn't been made yet (see EscrowTransaction/VendorDisbursement in
// packages/shared-types for the fuller runner-payout model this feeds).
// Flag this to product/finance before it's ever relied on.
export const PLATFORM_COMMISSION_RATE = 0.15;

export function splitCommission(amountNaira: number): { commissionAmount: number; runnerPayout: number } {
  const commissionAmount = Math.round(amountNaira * PLATFORM_COMMISSION_RATE);
  return { commissionAmount, runnerPayout: amountNaira - commissionAmount };
}
