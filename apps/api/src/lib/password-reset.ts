/**
 * "Forgot my password" for requesters and runners. A 6-digit code goes to the
 * phone (SMS) and, if the account has one, the email address too. The answer to
 * "send me a code" is always the same whether or not the account exists, so the
 * route can't be used to find out who has an account.
 */
import { randomInt } from "node:crypto";
import bcrypt from "bcryptjs";
import { and, eq } from "drizzle-orm";
import { db } from "../db/client";
import { passwordResets, requesters, runners } from "../db/schema";
import { AppErrors } from "./errors";
import { smsProvider } from "./sms";
import { emailProvider } from "./email";

export type ResetRole = "requester" | "runner";

const TTL_MINUTES = 10;
const COOLDOWN_SECONDS = 60;
const MAX_ATTEMPTS = 5;
const EXPOSE_DEV_CODES = process.env.EXPOSE_DEV_VERIFICATION_CODES === "true";

async function findUser(role: ResetRole, phone: string) {
  if (role === "requester") {
    const [row] = await db.select().from(requesters).where(eq(requesters.phone, phone)).limit(1);
    return row ? { id: row.id, phone: row.phone, email: row.email, name: row.fullName } : null;
  }
  const [row] = await db.select().from(runners).where(eq(runners.phone, phone)).limit(1);
  return row ? { id: row.id, phone: row.phone, email: row.email, name: row.fullName } : null;
}

export async function requestPasswordReset(role: ResetRole, phone: string): Promise<{ devCode?: string }> {
  const user = await findUser(role, phone);
  if (!user) return {};

  const [existing] = await db
    .select()
    .from(passwordResets)
    .where(and(eq(passwordResets.role, role), eq(passwordResets.userId, user.id)))
    .limit(1);
  if (existing && (Date.now() - existing.createdAt.getTime()) / 1000 < COOLDOWN_SECONDS) return {};

  const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
  const codeHash = await bcrypt.hash(code, 10);
  const expiresAt = new Date(Date.now() + TTL_MINUTES * 60 * 1000);
  await db
    .insert(passwordResets)
    .values({ role, userId: user.id, codeHash, expiresAt, attempts: 0 })
    .onConflictDoUpdate({
      target: [passwordResets.role, passwordResets.userId],
      set: { codeHash, expiresAt, attempts: 0, createdAt: new Date() },
    });

  const message = `${code} is your Gracerandly password reset code. It expires in ${TTL_MINUTES} minutes. If you didn't ask for it, ignore this message.`;
  const sends: Promise<unknown>[] = [smsProvider.send(user.phone, message)];
  if (user.email) sends.push(emailProvider.send(user.email, "Reset your Gracerandly password", message));
  const results = await Promise.allSettled(sends);
  results.forEach((r) => {
    if (r.status === "rejected") console.error("[password-reset] delivery failed", r.reason);
  });

  return EXPOSE_DEV_CODES ? { devCode: code } : {};
}

/** Checks the code and returns the user id. Throws one friendly error for every failure. */
export async function confirmPasswordReset(role: ResetRole, phone: string, code: string): Promise<string> {
  const bad = () => AppErrors.validation("That code isn't right or has expired. Ask for a new one.", { code: "Wrong or expired code" });
  const user = await findUser(role, phone);
  if (!user) throw bad();
  const [row] = await db
    .select()
    .from(passwordResets)
    .where(and(eq(passwordResets.role, role), eq(passwordResets.userId, user.id)))
    .limit(1);
  if (!row) throw bad();
  if (row.expiresAt.getTime() < Date.now() || row.attempts >= MAX_ATTEMPTS) {
    await db.delete(passwordResets).where(eq(passwordResets.id, row.id));
    throw bad();
  }
  if (!(await bcrypt.compare(code, row.codeHash))) {
    await db.update(passwordResets).set({ attempts: row.attempts + 1 }).where(eq(passwordResets.id, row.id));
    throw bad();
  }
  await db.delete(passwordResets).where(eq(passwordResets.id, row.id));
  return user.id;
}

export async function setNewPassword(role: ResetRole, userId: string, password: string): Promise<void> {
  const passwordHash = await bcrypt.hash(password, 12);
  if (role === "requester") await db.update(requesters).set({ passwordHash }).where(eq(requesters.id, userId));
  else await db.update(runners).set({ passwordHash }).where(eq(runners.id, userId));
}
