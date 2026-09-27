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

// ---------------------------------------------------------------------
// Runner payout disbursement (PRD 6.7) — bank-transfer leg only. Vendor
// disbursement (virtual card / USSD / cash float for the requester side)
// is a separate, still-unbuilt flow; this is just "get a runner's
// released earnings into their bank account."
// ---------------------------------------------------------------------

interface PaystackBank {
  name: string;
  code: string;
  active: boolean;
}

// Paystack's bank list rarely changes and this endpoint is slow-ish, so
// it's cached for the life of the process rather than fetched on every
// payout-account save. Restart the API to pick up a newly-added bank —
// fine in practice, since new banks are rare and this isn't user-facing.
let bankListCache: PaystackBank[] | null = null;

async function listBanks(): Promise<PaystackBank[]> {
  if (bankListCache) return bankListCache;

  const res = await fetch(`${PAYSTACK_BASE_URL}/bank?currency=NGN&country=nigeria`, {
    headers: { Authorization: `Bearer ${getSecretKey()}` },
  });
  const data = (await res.json()) as { status: boolean; message: string; data?: PaystackBank[] };
  if (!res.ok || !data.status || !data.data) {
    throw new Error(`Paystack bank list failed: ${data.message ?? res.statusText}`);
  }

  bankListCache = data.data.filter((bank) => bank.active);
  return bankListCache;
}

// Common abbreviations/short names Nigerian bank customers actually type
// that don't appear as a substring of Paystack's canonical bank name
// (e.g. "GTBank" vs "Guaranty Trust Bank") — checked before the generic
// substring match below. Not exhaustive; new entries can be added as
// runners report a bank that fails to resolve.
const BANK_NAME_ALIASES: Record<string, string> = {
  gtbank: "guaranty trust",
  gtb: "guaranty trust",
  uba: "united bank for africa",
  fcmb: "first city monument",
  "first bank": "first bank of nigeria",
  firstbank: "first bank of nigeria",
  stanbic: "stanbic ibtc",
  polaris: "polaris bank",
  wema: "wema bank",
  keystone: "keystone bank",
  fidelity: "fidelity bank",
  union: "union bank",
  sterling: "sterling bank",
  ecobank: "ecobank nigeria",
  heritage: "heritage bank",
};

/**
 * Matches a runner's free-typed bank name (e.g. "GTBank", "First Bank")
 * against Paystack's canonical bank list. Tries a known alias first (see
 * BANK_NAME_ALIASES — plain substring matching misses common
 * abbreviations that aren't textually contained in the official name),
 * then falls back to case-insensitive substring matching in either
 * direction. Returns null rather than throwing when nothing matches: an
 * unrecognized bank name is an expected, recoverable case the caller
 * decides how to handle (see routes/runners.ts), not a system failure.
 */
export async function resolveBankCode(bankNameInput: string): Promise<{ code: string; name: string } | null> {
  const banks = await listBanks();
  const input = bankNameInput.trim().toLowerCase();
  const aliasTarget = BANK_NAME_ALIASES[input];

  const find = (needle: string) =>
    banks.find((bank) => {
      const name = bank.name.toLowerCase();
      return name === needle || name.includes(needle) || needle.includes(name);
    });

  const match = (aliasTarget && find(aliasTarget)) || find(input);
  return match ? { code: match.code, name: match.name } : null;
}

interface ResolvedAccount {
  accountNumber: string;
  accountName: string;
}

/**
 * Confirms an account number is real and returns the account name on
 * file at the bank, via Paystack's /bank/resolve. Throws on a
 * not-found/invalid account (a 4xx from Paystack) so callers can turn
 * that into a validation error — this is meant to catch a mistyped
 * account number before it's saved as "verified".
 */
export async function resolveAccountNumber(accountNumber: string, bankCode: string): Promise<ResolvedAccount> {
  const res = await fetch(
    `${PAYSTACK_BASE_URL}/bank/resolve?account_number=${encodeURIComponent(accountNumber)}&bank_code=${encodeURIComponent(bankCode)}`,
    { headers: { Authorization: `Bearer ${getSecretKey()}` } }
  );
  const data = (await res.json()) as {
    status: boolean;
    message: string;
    data?: { account_number: string; account_name: string };
  };
  if (!res.ok || !data.status || !data.data) {
    throw new Error(data.message || "Could not verify this account number");
  }
  return { accountNumber: data.data.account_number, accountName: data.data.account_name };
}

interface CreateRecipientParams {
  accountNumber: string;
  bankCode: string;
  accountName: string;
}

/** Creates a Paystack transfer recipient, returning its recipient_code —
 * the handle a transfer is sent to. Callers should cache this
 * (runners.paystackRecipientCode) rather than call this on every payout. */
export async function createTransferRecipient(params: CreateRecipientParams): Promise<string> {
  const res = await fetch(`${PAYSTACK_BASE_URL}/transferrecipient`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getSecretKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      type: "nuban",
      name: params.accountName,
      account_number: params.accountNumber,
      bank_code: params.bankCode,
      currency: "NGN",
    }),
  });
  const data = (await res.json()) as {
    status: boolean;
    message: string;
    data?: { recipient_code: string };
  };
  if (!res.ok || !data.status || !data.data) {
    throw new Error(`Paystack recipient creation failed: ${data.message ?? res.statusText}`);
  }
  return data.data.recipient_code;
}

interface InitiateTransferParams {
  amountNaira: number;
  recipientCode: string;
  reference: string;
  reason: string;
}

interface InitiateTransferResult {
  transferCode: string;
  // Paystack returns "success" when OTP is disabled on the integration
  // (the normal setup for a server-automated flow like this one) or
  // "pending"/"otp" otherwise — the webhook is still the source of truth
  // either way (see routes/wallet.ts's webhook handler), this is just
  // what to show the runner immediately.
  status: string;
}

export async function initiateTransfer(params: InitiateTransferParams): Promise<InitiateTransferResult> {
  const res = await fetch(`${PAYSTACK_BASE_URL}/transfer`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getSecretKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      source: "balance",
      amount: amountToKobo(params.amountNaira),
      recipient: params.recipientCode,
      reference: params.reference,
      reason: params.reason,
    }),
  });
  const data = (await res.json()) as {
    status: boolean;
    message: string;
    data?: { transfer_code: string; status: string };
  };
  if (!res.ok || !data.status || !data.data) {
    throw new Error(`Paystack transfer failed: ${data.message ?? res.statusText}`);
  }
  return { transferCode: data.data.transfer_code, status: data.data.status };
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
