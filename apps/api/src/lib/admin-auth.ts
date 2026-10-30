/**
 * Staff accounts for the admin dashboard.
 *
 * Each person has their own email + password and one of three roles
 * (see adminRoleEnum in db/schema.ts). Signing in returns a 12-hour token;
 * every request re-reads the account, so disabling someone or changing a
 * password takes effect straight away on every device.
 *
 * ADMIN_API_KEY is no longer a login. It does two things only:
 *  - it switches the admin page on (the page 404s without it), and
 *  - it is the setup key for creating the very first owner, once, while no
 *    staff account exists. After that it can't be used for anything.
 * Forgotten owner password: `pnpm --filter api admin:user reset <email>`
 * (run where the database is reachable).
 *
 * Sign-in is rate limited: 5 wrong passwords for one email, or 20 from one
 * address, in 15 minutes locks that email/address out for the rest of the
 * window. Counters are in memory (one server), which is enough here.
 *
 * Every change a signed-in person makes, and every sign-in, is written to
 * the audit log (auditMutations below).
 */
import { timingSafeEqual } from "node:crypto";
import bcrypt from "bcryptjs";
import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { and, desc, eq, ilike, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client";
import { adminAuditLog, adminUsers, type AdminUserRow } from "../db/schema";
import { AppError, AppErrors } from "./errors";

export type AdminRole = AdminUserRow["role"];
export const ADMIN_ROLES: readonly AdminRole[] = ["owner", "support", "finance"] as const;

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      admin?: AdminUserRow;
    }
  }
}

const BCRYPT_ROUNDS = 12;
const TOKEN_HOURS = 12;
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILS_PER_EMAIL = 5;
const MAX_FAILS_PER_IP = 20;

// ---------------------------------------------------------------------
// Passwords and tokens
// ---------------------------------------------------------------------

export const passwordSchema = z
  .string()
  .min(10, "Use at least 10 characters")
  .max(100, "Use at most 100 characters")
  .refine((p) => /[A-Za-z]/.test(p) && /[0-9]/.test(p), "Use letters and at least one number");

const emailSchema = z.string().trim().toLowerCase().email("Enter a valid email address").max(120);

function tokenSecret(): string {
  const base = process.env.JWT_SECRET;
  if (!base) throw new Error("JWT_SECRET is not set");
  // Different from the app tokens' secret, so an app token can never pass as a staff token.
  return `${base}:admin-dashboard`;
}

function signToken(admin: Pick<AdminUserRow, "id">): string {
  return jwt.sign({ sub: admin.id, typ: "admin" }, tokenSecret(), { expiresIn: `${TOKEN_HOURS}h` });
}

const view = (a: AdminUserRow) => ({
  id: a.id,
  email: a.email,
  fullName: a.fullName,
  role: a.role,
  disabled: !!a.disabledAt,
  lastLoginAt: a.lastLoginAt ? a.lastLoginAt.toISOString() : null,
  createdAt: a.createdAt.toISOString(),
});
export type AdminView = ReturnType<typeof view>;

// A hash to compare against when the email doesn't exist, so a wrong email and a
// wrong password take the same time.
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", BCRYPT_ROUNDS);

// ---------------------------------------------------------------------
// Rate limiting
// ---------------------------------------------------------------------

const fails = new Map<string, number[]>();

function recent(key: string): number[] {
  const now = Date.now();
  const list = (fails.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (list.length) fails.set(key, list);
  else fails.delete(key);
  return list;
}

function assertNotLocked(email: string, ip: string): void {
  for (const [key, max] of [
    [`e:${email}`, MAX_FAILS_PER_EMAIL],
    [`i:${ip}`, MAX_FAILS_PER_IP],
  ] as const) {
    const list = recent(key);
    if (list.length >= max) {
      const minutes = Math.max(1, Math.ceil((list[0] + WINDOW_MS - Date.now()) / 60000));
      throw AppErrors.tooManyRequests(`Too many wrong attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`);
    }
  }
}

function recordFail(email: string, ip: string): void {
  for (const key of [`e:${email}`, `i:${ip}`]) fails.set(key, [...recent(key), Date.now()]);
  if (fails.size > 5000) fails.clear();
}

export function clientIp(req: Request): string {
  const fwd = req.headers["x-forwarded-for"];
  const first = (Array.isArray(fwd) ? fwd[0] : fwd)?.split(",")[0]?.trim();
  return first || req.socket.remoteAddress || "unknown";
}

// ---------------------------------------------------------------------
// Audit log
// ---------------------------------------------------------------------

export async function audit(
  who: { id: string | null; email: string },
  action: string,
  opts: { targetId?: string | null; detail?: string | null; ip?: string | null } = {}
): Promise<void> {
  try {
    await db.insert(adminAuditLog).values({
      adminId: who.id,
      adminEmail: who.email,
      action,
      targetId: opts.targetId ?? null,
      detail: opts.detail ? opts.detail.slice(0, 500) : null,
      ip: opts.ip ?? null,
    });
  } catch (err) {
    console.error("[admin-audit] could not write", action, err instanceof Error ? err.message : err);
  }
}

/** What each change is called in the log. Anything not listed is logged as "METHOD path". */
const ACTION_LABELS: Record<string, string> = {
  "POST /api/support/tickets/:id/messages": "Replied to a support ticket",
  "PATCH /api/support/tickets/:id": "Changed a support ticket's status",
  "POST /api/verifications/:id/approve": "Approved a runner's identity",
  "POST /api/verifications/:id/reject": "Sent a runner's identity back",
  "POST /api/sos/:id/resolve": "Closed an SOS alert",
  "POST /api/incidents": "Recorded a runner incident",
  "POST /api/incidents/:id/confirm": "Confirmed a runner incident",
  "POST /api/incidents/:id/dismiss": "Dismissed a runner incident",
  "POST /api/people/:role/:id/suspend": "Suspended an account",
  "POST /api/people/:role/:id/reinstate": "Reinstated an account",
  "POST /api/errands/:id/cancel": "Cancelled an errand and refunded",
  "POST /api/errands/:id/unassign": "Took a runner off an errand",
  "POST /api/disputes/:id/resolve": "Decided a dispute",
  "POST /api/payouts/retry": "Retried a runner payout",
  "POST /api/refunds": "Sent a refund",
  "POST /api/refunds/:id/retry": "Retried a refund",
  "POST /api/team": "Added a staff account",
  "PATCH /api/team/:id": "Changed a staff account",
  "POST /api/team/:id/password": "Reset a staff password",
  "POST /api/auth/password": "Changed own password",
  "PATCH /api/auth/me": "Updated own profile",
  "PUT /api/settings/:key": "Changed a setting",
  "DELETE /api/settings/:key": "Reset a setting to its default",
  "POST /api/alerts/test": "Sent a test alert email",
};

const HIDDEN_FIELDS = /pass|token|key|secret/i;
// Bodies that are passwords under other names ("current", "next"): never log their contents.
const NO_DETAIL = new Set(["PATCH /api/auth/me", "POST /api/auth/password", "POST /api/team/:id/password"]);

function summarise(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body as Record<string, unknown>)) clean[k] = HIDDEN_FIELDS.test(k) ? "(hidden)" : v;
  const text = JSON.stringify(clean);
  return text === "{}" ? null : text;
}

/** Logs every successful change (POST/PATCH/PUT/DELETE) made by a signed-in staff member. */
export function auditMutations(req: Request, res: Response, next: NextFunction): void {
  if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") return next();
  res.on("finish", () => {
    if (res.statusCode >= 400 || !req.admin) return;
    const route = `${req.method} ${(req.route?.path as string | undefined) ?? req.path}`;
    const p = req.params as Record<string, string | undefined>;
    const target = p.role && p.id ? `${p.role}:${p.id}` : (p.id ?? p.key ?? null);
    void audit(req.admin, ACTION_LABELS[route] ?? route, { targetId: target, detail: NO_DETAIL.has(route) ? null : summarise(req.body), ip: clientIp(req) });
  });
  next();
}

export async function listAudit(opts: { adminId?: string; q?: string; limit?: number }) {
  const where = [] as ReturnType<typeof eq>[];
  if (opts.adminId) where.push(eq(adminAuditLog.adminId, opts.adminId));
  if (opts.q) where.push(ilike(adminAuditLog.action, `%${opts.q.replace(/[\\%_]/g, (c) => "\\" + c)}%`));
  const list = await db
    .select()
    .from(adminAuditLog)
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(adminAuditLog.createdAt))
    .limit(Math.min(opts.limit ?? 200, 500));
  return list.map((r) => ({
    id: r.id,
    adminId: r.adminId,
    adminEmail: r.adminEmail,
    action: r.action,
    targetId: r.targetId,
    detail: r.detail,
    ip: r.ip,
    createdAt: r.createdAt.toISOString(),
  }));
}

// ---------------------------------------------------------------------
// Sign-in, setup, middleware
// ---------------------------------------------------------------------

export async function adminCount(): Promise<number> {
  const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(adminUsers);
  return r?.n ?? 0;
}

function keyMatches(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export const setupSchema = z.object({
  setupKey: z.string().min(1, "Enter the setup key"),
  fullName: z.string().trim().min(2, "Enter your name").max(80),
  email: emailSchema,
  password: passwordSchema,
});

/** Creates the first owner. Only works while there are no staff accounts, and needs ADMIN_API_KEY. */
export async function setupFirstOwner(input: z.infer<typeof setupSchema>, ip: string) {
  const expected = process.env.ADMIN_API_KEY?.trim();
  if (!expected) throw AppErrors.notFound();
  assertNotLocked(input.email, ip);
  if (!keyMatches(input.setupKey, expected)) {
    recordFail(input.email, ip);
    throw AppErrors.unauthorized("That setup key is wrong");
  }
  const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
  const created = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(42001)`);
    const [c] = await tx.select({ n: sql<number>`count(*)::int` }).from(adminUsers);
    if ((c?.n ?? 0) > 0) throw AppErrors.conflict("Setup is already done. Sign in with your staff account.");
    const [row] = await tx
      .insert(adminUsers)
      .values({ email: input.email, fullName: input.fullName, role: "owner", passwordHash, lastLoginAt: new Date() })
      .returning();
    return row;
  });
  await audit(created, "Created the first Global Admin account", { targetId: created.id, ip });
  return { token: signToken(created), admin: view(created) };
}

export const loginSchema = z.object({ email: emailSchema, password: z.string().min(1, "Enter your password").max(200) });

export async function login(input: z.infer<typeof loginSchema>, ip: string) {
  assertNotLocked(input.email, ip);
  const [row] = await db.select().from(adminUsers).where(eq(adminUsers.email, input.email)).limit(1);
  const ok = await bcrypt.compare(input.password, row?.passwordHash ?? DUMMY_HASH);
  if (!row || !ok || row.disabledAt) {
    recordFail(input.email, ip);
    await audit({ id: row?.id ?? null, email: input.email }, "Failed sign-in", { ip });
    // Same message whether the email exists, the password is wrong or the account is off.
    throw AppErrors.unauthorized("Wrong email or password");
  }
  fails.delete(`e:${input.email}`);
  const [updated] = await db.update(adminUsers).set({ lastLoginAt: new Date() }).where(eq(adminUsers.id, row.id)).returning();
  await audit(updated, "Signed in", { ip });
  return { token: signToken(updated), admin: view(updated) };
}

/** Requires a valid staff token; puts the account on req.admin. */
export async function requireStaff(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const header = req.headers.authorization;
    const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
    if (!token) throw new AppError(401, "unauthorized", "Please sign in");
    let payload: jwt.JwtPayload;
    try {
      const decoded = jwt.verify(token, tokenSecret());
      if (typeof decoded === "string" || decoded.typ !== "admin" || typeof decoded.sub !== "string") throw new Error("bad");
      payload = decoded;
    } catch {
      throw new AppError(401, "unauthorized", "Your session ended. Please sign in again.");
    }
    const [row] = await db.select().from(adminUsers).where(eq(adminUsers.id, payload.sub!)).limit(1);
    const issued = payload.iat ?? 0;
    if (!row || row.disabledAt || Math.floor(row.passwordChangedAt.getTime() / 1000) > issued) {
      throw new AppError(401, "unauthorized", "Your session ended. Please sign in again.");
    }
    req.admin = row;
    next();
  } catch (err) {
    next(err);
  }
}

/** After requireStaff: only these roles may continue. */
export function requireRole(...roles: AdminRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (req.admin && roles.includes(req.admin.role)) return next();
    next(new AppError(403, "forbidden", `Your role (${req.admin?.role ?? "none"}) can't do this. Ask a Global Admin.`));
  };
}

// ---------------------------------------------------------------------
// Team management
// ---------------------------------------------------------------------

export const createStaffSchema = z.object({
  fullName: z.string().trim().min(2, "Enter their name").max(80),
  email: emailSchema,
  role: z.enum(["owner", "support", "finance"]),
  password: passwordSchema,
});

export async function listTeam() {
  const list = await db.select().from(adminUsers).orderBy(adminUsers.createdAt);
  return list.map(view);
}

export async function createStaff(input: z.infer<typeof createStaffSchema>) {
  const [existing] = await db.select({ id: adminUsers.id }).from(adminUsers).where(eq(adminUsers.email, input.email)).limit(1);
  if (existing) throw AppErrors.conflict("Someone with that email already has an account", { email: "Already in use" });
  const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
  const [row] = await db
    .insert(adminUsers)
    .values({ email: input.email, fullName: input.fullName, role: input.role, passwordHash })
    .returning();
  return view(row);
}

export const updateStaffSchema = z.object({
  role: z.enum(["owner", "support", "finance"]).optional(),
  disabled: z.boolean().optional(),
});

async function activeOwnerCount(): Promise<number> {
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(adminUsers)
    .where(and(eq(adminUsers.role, "owner"), isNull(adminUsers.disabledAt)));
  return r?.n ?? 0;
}

export async function updateStaff(actorId: string, id: string, input: z.infer<typeof updateStaffSchema>) {
  if (actorId === id) throw AppErrors.conflict("You can't change your own role or disable yourself. Ask another Global Admin.");
  const [target] = await db.select().from(adminUsers).where(eq(adminUsers.id, id)).limit(1);
  if (!target) throw AppErrors.notFound("No staff account with that id");
  const losesOwner = target.role === "owner" && !target.disabledAt && (input.role === "support" || input.role === "finance" || input.disabled === true);
  if (losesOwner && (await activeOwnerCount()) <= 1) throw AppErrors.conflict("There must always be at least one active Global Admin");
  const patch: Partial<AdminUserRow> = {};
  if (input.role) patch.role = input.role;
  if (input.disabled !== undefined) patch.disabledAt = input.disabled ? new Date() : null;
  if (!Object.keys(patch).length) return view(target);
  const [row] = await db.update(adminUsers).set(patch).where(eq(adminUsers.id, id)).returning();
  return view(row);
}

export async function resetStaffPassword(id: string, password: string) {
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const [row] = await db
    .update(adminUsers)
    .set({ passwordHash, passwordChangedAt: new Date() }) // signs them out everywhere
    .where(eq(adminUsers.id, id))
    .returning();
  if (!row) throw AppErrors.notFound("No staff account with that id");
  return view(row);
}

export const changePasswordSchema = z.object({ current: z.string().min(1, "Enter your current password"), next: passwordSchema });

export async function changeOwnPassword(admin: AdminUserRow, input: z.infer<typeof changePasswordSchema>, ip: string) {
  assertNotLocked(admin.email, ip);
  if (!(await bcrypt.compare(input.current, admin.passwordHash))) {
    recordFail(admin.email, ip);
    throw AppErrors.validation("Your current password is wrong", { current: "Wrong password" });
  }
  if (input.next === input.current) throw AppErrors.validation("Choose a password you haven't used", { next: "Same as the current one" });
  const passwordHash = await bcrypt.hash(input.next, BCRYPT_ROUNDS);
  const [row] = await db
    .update(adminUsers)
    .set({ passwordHash, passwordChangedAt: new Date() })
    .where(eq(adminUsers.id, admin.id))
    .returning();
  // A fresh token, so this browser stays signed in while every other session ends.
  return { token: signToken(row), admin: view(row) };
}

export const updateProfileSchema = z.object({
  fullName: z.string().trim().min(2, "Enter your full name").max(80).optional(),
  email: emailSchema.optional(),
  current: z.string().max(200).optional(),
});

/** Own name and email. Changing the email (it is the sign-in) needs the current password. */
export async function updateOwnProfile(admin: AdminUserRow, input: z.infer<typeof updateProfileSchema>, ip: string) {
  const changes: { fullName?: string; email?: string } = {};
  if (input.fullName && input.fullName !== admin.fullName) changes.fullName = input.fullName;
  if (input.email && input.email.toLowerCase() !== admin.email.toLowerCase()) {
    assertNotLocked(admin.email, ip);
    if (!input.current || !(await bcrypt.compare(input.current, admin.passwordHash))) {
      if (input.current) recordFail(admin.email, ip);
      throw AppErrors.validation("Enter your current password to change your email", { current: "Wrong password" });
    }
    const [taken] = await db.select({ id: adminUsers.id }).from(adminUsers).where(eq(adminUsers.email, input.email.toLowerCase())).limit(1);
    if (taken) throw AppErrors.conflict("Another admin already uses that email");
    changes.email = input.email.toLowerCase();
  }
  if (!Object.keys(changes).length) return { admin: view(admin) };
  const [row] = await db.update(adminUsers).set(changes).where(eq(adminUsers.id, admin.id)).returning();
  return { admin: view(row) };
}

export const adminView = view;
