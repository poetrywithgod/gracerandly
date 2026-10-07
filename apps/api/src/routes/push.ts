import { Router } from "express";
import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { verifyAuthToken } from "../lib/jwt";
import { AppErrors } from "../lib/errors";
import { asyncHandler } from "../lib/asyncHandler";
import { isExpoPushToken, registerPushToken, unregisterPushToken } from "../lib/push";

const router: Router = Router();

// Both apps use these two endpoints, so unlike the other routers this one
// accepts either a requester or a runner token and records which it was.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      pushAuth?: { role: "requester" | "runner"; userId: string };
    }
  }
}

function requireAnyAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : undefined;
  if (!token) {
    next(AppErrors.unauthorized("Missing or malformed Authorization header"));
    return;
  }
  try {
    const payload = verifyAuthToken(token);
    req.pushAuth = { role: payload.role, userId: payload.sub };
    next();
  } catch {
    next(AppErrors.unauthorized("Invalid or expired token"));
  }
}

const registerSchema = z.object({
  token: z.string().trim().min(1).max(300),
  platform: z.enum(["android", "ios"]).default("android"),
});

const unregisterSchema = z.object({ token: z.string().trim().min(1).max(300) });

router.post(
  "/register",
  requireAnyAuth,
  asyncHandler(async (req, res) => {
    const { token, platform } = registerSchema.parse(req.body);
    if (!isExpoPushToken(token)) throw AppErrors.validation("That isn't a valid push token");
    const { role, userId } = req.pushAuth!;
    await registerPushToken(role, userId, token, platform);
    res.json({ registered: true });
  })
);

router.post(
  "/unregister",
  requireAnyAuth,
  asyncHandler(async (req, res) => {
    const { token } = unregisterSchema.parse(req.body);
    const { role, userId } = req.pushAuth!;
    await unregisterPushToken(role, userId, token);
    res.json({ unregistered: true });
  })
);

export default router;
