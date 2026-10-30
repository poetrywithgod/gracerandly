/**
 * Small in-memory throttles for the public auth routes (login, signup,
 * forgot/reset password). Counters live in this server's memory, so they reset
 * on a restart and are per instance — fine for a single Render service, and
 * enough to make password guessing and SMS/email spam impractical.
 */
import type { Request } from "express";
import { AppErrors } from "./errors";

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

setInterval(() => {
  const now = Date.now();
  for (const [key, b] of buckets) if (b.resetAt <= now) buckets.delete(key);
}, 5 * 60 * 1000).unref();

function bucket(key: string, windowMs: number): Bucket {
  const now = Date.now();
  const b = buckets.get(key);
  if (b && b.resetAt > now) return b;
  const fresh = { count: 0, resetAt: now + windowMs };
  buckets.set(key, fresh);
  return fresh;
}

/** The caller's IP. Needs `app.set("trust proxy", 1)` so it is the real client behind Render's proxy. */
export function ipOf(req: Request): string {
  return req.ip || req.socket.remoteAddress || "unknown";
}

function tooMany(b: Bucket): never {
  const mins = Math.max(1, Math.ceil((b.resetAt - Date.now()) / 60000));
  throw AppErrors.tooManyRequests(`Too many attempts. Please try again in ${mins} minute${mins === 1 ? "" : "s"}.`);
}

/** Throws 429 if `key` already used up `max` attempts in the window. Does not count. */
export function assertNotLimited(key: string, max: number, windowMs: number): void {
  const b = bucket(key, windowMs);
  if (b.count >= max) tooMany(b);
}

/** Counts one attempt against `key` and throws 429 once it goes over `max`. */
export function hit(key: string, max: number, windowMs: number): void {
  const b = bucket(key, windowMs);
  b.count += 1;
  if (b.count > max) tooMany(b);
}

/** Counts one failure without throwing (use with assertNotLimited). */
export function fail(key: string, windowMs: number): void {
  bucket(key, windowMs).count += 1;
}

export function clear(key: string): void {
  buckets.delete(key);
}

const WINDOW = 15 * 60 * 1000;

/**
 * Login guard. Wrong passwords are counted per (phone + IP) — so a stranger
 * can't lock a real user out from their own phone — and per IP overall.
 * Call `check` before comparing the password, `failed` on a wrong password and
 * `ok` on success.
 */
export function loginGuard(req: Request, scope: "requester" | "runner", phone: string) {
  const pair = `login:${scope}:${phone}:${ipOf(req)}`;
  const ip = `login-ip:${ipOf(req)}`;
  return {
    check() {
      assertNotLimited(pair, 8, WINDOW);
      assertNotLimited(ip, 40, WINDOW);
    },
    failed() {
      fail(pair, WINDOW);
      fail(ip, WINDOW);
    },
    ok() {
      clear(pair);
    },
  };
}

/** Per-IP cap for routes that create accounts or send messages. */
export function limitByIp(req: Request, name: string, max: number, windowMs: number): void {
  hit(`${name}:${ipOf(req)}`, max, windowMs);
}
