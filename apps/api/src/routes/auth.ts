import { Router } from "express";
import { eq, or } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db } from "../db/client";
import { requesters } from "../db/schema";
import { signupSchema, loginSchema, updateProfileSchema } from "../schemas/auth";
import { signAuthToken } from "../lib/jwt";
import { AppErrors } from "../lib/errors";
import { asyncHandler } from "../lib/asyncHandler";
import { requireAuth } from "../middleware/requireAuth";
import type { Requester } from "@gracerandly/shared-types";

const router: Router = Router();

const BCRYPT_SALT_ROUNDS = 12;

function toRequester(row: typeof requesters.$inferSelect): Requester {
  return {
    id: row.id,
    fullName: row.fullName,
    phone: row.phone,
    email: row.email ?? undefined,
    role: "requester",
    gender: row.gender,
    phoneVerified: row.phoneVerified,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

router.post(
  "/signup",
  asyncHandler(async (req, res) => {
    const input = signupSchema.parse(req.body);

    const existing = await db
      .select({ id: requesters.id, phone: requesters.phone, email: requesters.email })
      .from(requesters)
      .where(
        input.email
          ? or(eq(requesters.phone, input.phone), eq(requesters.email, input.email))
          : eq(requesters.phone, input.phone)
      )
      .limit(1);

    if (existing.length > 0) {
      const clash = existing[0];
      const field = clash.phone === input.phone ? "phone number" : "email";
      throw AppErrors.conflict(`An account with this ${field} already exists`);
    }

    const passwordHash = await bcrypt.hash(input.password, BCRYPT_SALT_ROUNDS);

    const [row] = await db
      .insert(requesters)
      .values({
        fullName: input.fullName,
        phone: input.phone,
        email: input.email,
        gender: input.gender,
        passwordHash,
      })
      .returning();

    const token = signAuthToken({ sub: row.id, role: "requester" });
    res.status(201).json({ token, user: toRequester(row) });
  })
);

router.post(
  "/login",
  asyncHandler(async (req, res) => {
    const input = loginSchema.parse(req.body);

    const [row] = await db
      .select()
      .from(requesters)
      .where(eq(requesters.phone, input.phone))
      .limit(1);

    if (!row) {
      throw AppErrors.unauthorized("Incorrect phone number or password");
    }

    const passwordMatches = await bcrypt.compare(input.password, row.passwordHash);
    if (!passwordMatches) {
      throw AppErrors.unauthorized("Incorrect phone number or password");
    }

    const token = signAuthToken({ sub: row.id, role: "requester" });
    res.json({ token, user: toRequester(row) });
  })
);

router.get(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    const [row] = await db
      .select()
      .from(requesters)
      .where(eq(requesters.id, req.requesterId!))
      .limit(1);

    if (!row) {
      throw AppErrors.notFound("Requester not found");
    }

    res.json({ user: toRequester(row) });
  })
);

router.patch(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    const input = updateProfileSchema.parse(req.body);
    if (Object.keys(input).length === 0) {
      throw AppErrors.validation("Nothing to update");
    }

    if (input.email) {
      const clash = await db
        .select({ id: requesters.id })
        .from(requesters)
        .where(eq(requesters.email, input.email))
        .limit(1);
      if (clash.length > 0 && clash[0].id !== req.requesterId) {
        throw AppErrors.conflict("An account with this email already exists");
      }
    }

    const [row] = await db
      .update(requesters)
      .set({
        ...(input.fullName !== undefined && { fullName: input.fullName }),
        ...(input.email !== undefined && { email: input.email }),
        ...(input.gender !== undefined && { gender: input.gender }),
      })
      .where(eq(requesters.id, req.requesterId!))
      .returning();

    res.json({ user: toRequester(row) });
  })
);

export default router;
