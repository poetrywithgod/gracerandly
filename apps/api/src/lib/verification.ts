import { randomInt } from "node:crypto";
import bcrypt from "bcryptjs";
import { eq, and } from "drizzle-orm";
import { db } from "../db/client";
import { verificationCodes } from "../db/schema";
import type { VerificationChannel } from "@gracerandly/shared-types";
import { AppErrors } from "./errors";
import { smsProvider } from "./sms";
import { emailProvider } from "./email";

const CODE_LENGTH = 6;
const CODE_TTL_MINUTES = 10;
const RESEND_COOLDOWN_SECONDS = 60;
const MAX_ATTEMPTS = 5;

const BCRYPT_SALT_ROUNDS = 10; // lighter than the password's 12 — these are short-lived, low-value codes

const EXPOSE_DEV_CODES = process.env.EXPOSE_DEV_VERIFICATION_CODES === "true";

function generateCode(): string {
  return randomInt(0, 10 ** CODE_LENGTH).toString().padStart(CODE_LENGTH, "0");
}

async function loadCodeRow(requesterId: string, channel: VerificationChannel) {
  const [row] = await db
    .select()
    .from(verificationCodes)
    .where(and(eq(verificationCodes.requesterId, requesterId), eq(verificationCodes.channel, channel)))
    .limit(1);
  return row ?? null;
}

/**
 * Generates a fresh code for (requester, channel), stores its hash, and
 * sends it via the relevant provider. Returns the plain code only when
 * EXPOSE_DEV_VERIFICATION_CODES is on, so callers can optionally echo it
 * back in the API response for local testing.
 */
export async function requestVerificationCode(
  requesterId: string,
  channel: VerificationChannel,
  destination: string
): Promise<{ devCode?: string }> {
  const existing = await loadCodeRow(requesterId, channel);
  if (existing) {
    const secondsSinceSent = (Date.now() - existing.createdAt.getTime()) / 1000;
    if (secondsSinceSent < RESEND_COOLDOWN_SECONDS) {
      const waitSeconds = Math.ceil(RESEND_COOLDOWN_SECONDS - secondsSinceSent);
      throw AppErrors.tooManyRequests(`Please wait ${waitSeconds}s before requesting another code`);
    }
  }

  const code = generateCode();
  const codeHash = await bcrypt.hash(code, BCRYPT_SALT_ROUNDS);
  const expiresAt = new Date(Date.now() + CODE_TTL_MINUTES * 60 * 1000);

  await db
    .insert(verificationCodes)
    .values({ requesterId, channel, codeHash, destination, expiresAt, attempts: 0 })
    .onConflictDoUpdate({
      target: [verificationCodes.requesterId, verificationCodes.channel],
      set: { codeHash, destination, expiresAt, attempts: 0, createdAt: new Date() },
    });

  const message = `${code} is your Gracerandly verification code. It expires in ${CODE_TTL_MINUTES} minutes.`;
  if (channel === "phone") {
    await smsProvider.send(destination, message);
  } else {
    await emailProvider.send(destination, "Verify your email", message);
  }

  return EXPOSE_DEV_CODES ? { devCode: code } : {};
}

/**
 * Verifies a submitted code for (requester, channel). Throws a validation
 * error (expired/no pending code/too many attempts) or an unauthorized
 * error (wrong code) — callers should surface `err.message` directly, it's
 * already user-facing. On success, deletes the spent code and returns the
 * destination it was issued for, so the caller can confirm it still
 * matches the requester's current phone/email before flipping the
 * verified flag.
 */
export async function confirmVerificationCode(
  requesterId: string,
  channel: VerificationChannel,
  submittedCode: string
): Promise<{ destination: string }> {
  const row = await loadCodeRow(requesterId, channel);
  if (!row) {
    throw AppErrors.validation("Request a verification code first");
  }

  if (row.expiresAt.getTime() < Date.now()) {
    await db.delete(verificationCodes).where(eq(verificationCodes.id, row.id));
    throw AppErrors.validation("This code has expired — request a new one");
  }

  if (row.attempts >= MAX_ATTEMPTS) {
    await db.delete(verificationCodes).where(eq(verificationCodes.id, row.id));
    throw AppErrors.validation("Too many incorrect attempts — request a new code");
  }

  const matches = await bcrypt.compare(submittedCode, row.codeHash);
  if (!matches) {
    await db
      .update(verificationCodes)
      .set({ attempts: row.attempts + 1 })
      .where(eq(verificationCodes.id, row.id));
    const remaining = MAX_ATTEMPTS - (row.attempts + 1);
    throw AppErrors.unauthorized(
      remaining > 0 ? `Incorrect code — ${remaining} attempt${remaining === 1 ? "" : "s"} left` : "Incorrect code"
    );
  }

  await db.delete(verificationCodes).where(eq(verificationCodes.id, row.id));
  return { destination: row.destination };
}
