import { Router } from "express";
import express from "express";
import { eq, or } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db } from "../db/client";
import { requesters } from "../db/schema";
import {
  signupSchema,
  loginSchema,
  updateProfileSchema,
  updateAvatarSchema,
  verificationChannelSchema,
  confirmVerificationSchema,
} from "../schemas/auth";
import { signAuthToken } from "../lib/jwt";
import { AppErrors } from "../lib/errors";
import { asyncHandler } from "../lib/asyncHandler";
import { requireAuth } from "../middleware/requireAuth";
import { requestVerificationCode, confirmVerificationCode } from "../lib/verification";
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
    emailVerified: row.emailVerified,
    avatarUrl: row.avatarUrl ?? undefined,
    bio: row.bio ?? undefined,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function loadOwnRequester(requesterId: string) {
  const [row] = await db.select().from(requesters).where(eq(requesters.id, requesterId)).limit(1);
  if (!row) {
    throw AppErrors.notFound("Requester not found");
  }
  return row;
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

    const current = await loadOwnRequester(req.requesterId!);

    let emailChanged = false;
    if (input.email) {
      const clash = await db
        .select({ id: requesters.id })
        .from(requesters)
        .where(eq(requesters.email, input.email))
        .limit(1);
      if (clash.length > 0 && clash[0].id !== req.requesterId) {
        throw AppErrors.conflict("An account with this email already exists");
      }
      emailChanged = input.email !== current.email;
    }

    const [row] = await db
      .update(requesters)
      .set({
        ...(input.fullName !== undefined && { fullName: input.fullName }),
        ...(input.email !== undefined && { email: input.email }),
        ...(input.gender !== undefined && { gender: input.gender }),
        ...(input.bio !== undefined && { bio: input.bio.length > 0 ? input.bio : null }),
        ...(input.status !== undefined && { status: input.status }),
        // A changed email hasn't been proven to belong to this requester
        // yet — fall back to unverified rather than carrying over trust in
        // the old address.
        ...(emailChanged && { emailVerified: false }),
      })
      .where(eq(requesters.id, req.requesterId!))
      .returning();

    res.json({ user: toRequester(row) });
  })
);

// A separate route (rather than folding into PATCH /me) so its json body
// limit can be raised just for this payload — the default 100kb elsewhere
// is deliberately tight, base64 image data isn't.
router.patch(
  "/me/avatar",
  requireAuth,
  express.json({ limit: "3mb" }),
  asyncHandler(async (req, res) => {
    const input = updateAvatarSchema.parse(req.body);

    const [row] = await db
      .update(requesters)
      .set({ avatarUrl: input.image })
      .where(eq(requesters.id, req.requesterId!))
      .returning();

    res.json({ user: toRequester(row) });
  })
);

// Sends a fresh code to the requester's current phone or email. Reuses one
// endpoint for both channels (see verificationChannelSchema) rather than
// splitting into /phone and /email routes, since the two flows are
// otherwise identical.
router.post(
  "/verify/request",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { channel } = verificationChannelSchema.parse(req.body);
    const current = await loadOwnRequester(req.requesterId!);

    if (channel === "phone") {
      if (current.phoneVerified) {
        throw AppErrors.validation("Phone number is already verified");
      }
      const { devCode } = await requestVerificationCode(current.id, "phone", current.phone);
      res.json({ sent: true, destination: current.phone, ...(devCode && { devCode }) });
      return;
    }

    if (!current.email) {
      throw AppErrors.validation("Add an email address first");
    }
    if (current.emailVerified) {
      throw AppErrors.validation("Email is already verified");
    }
    const { devCode } = await requestVerificationCode(current.id, "email", current.email);
    res.json({ sent: true, destination: current.email, ...(devCode && { devCode }) });
  })
);

router.post(
  "/verify/confirm",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { channel, code } = confirmVerificationSchema.parse(req.body);
    const current = await loadOwnRequester(req.requesterId!);

    const { destination } = await confirmVerificationCode(current.id, channel, code);

    // The requester may have changed their phone/email between requesting
    // and confirming the code — only flip the flag if it's still for the
    // address currently on the account.
    const stillCurrent =
      channel === "phone" ? destination === current.phone : destination === current.email;
    if (!stillCurrent) {
      throw AppErrors.validation(
        `Your ${channel} changed since that code was sent — request a new one`
      );
    }

    const [row] = await db
      .update(requesters)
      .set(channel === "phone" ? { phoneVerified: true } : { emailVerified: true })
      .where(eq(requesters.id, current.id))
      .returning();

    res.json({ user: toRequester(row) });
  })
);

export default router;
