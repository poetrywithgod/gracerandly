import type { NextFunction, Request, Response } from "express";
import { verifyAuthToken } from "../lib/jwt";
import { AppErrors } from "../lib/errors";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      requesterId?: string;
      runnerId?: string;
    }
  }
}

function readBearerToken(req: Request): string | undefined {
  const header = req.headers.authorization;
  return header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : undefined;
}

/** Gates requester-only routes. Sets req.requesterId; rejects runner tokens. */
export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const token = readBearerToken(req);
  if (!token) {
    next(AppErrors.unauthorized("Missing or malformed Authorization header"));
    return;
  }

  try {
    const payload = verifyAuthToken(token);
    if (payload.role !== "requester") {
      next(AppErrors.unauthorized("This endpoint is for requester accounts"));
      return;
    }
    req.requesterId = payload.sub;
    next();
  } catch {
    next(AppErrors.unauthorized("Invalid or expired token"));
  }
}

/** Gates runner-only routes. Sets req.runnerId; rejects requester tokens. */
export function requireRunnerAuth(req: Request, _res: Response, next: NextFunction) {
  const token = readBearerToken(req);
  if (!token) {
    next(AppErrors.unauthorized("Missing or malformed Authorization header"));
    return;
  }

  try {
    const payload = verifyAuthToken(token);
    if (payload.role !== "runner") {
      next(AppErrors.unauthorized("This endpoint is for runner accounts"));
      return;
    }
    req.runnerId = payload.sub;
    next();
  } catch {
    next(AppErrors.unauthorized("Invalid or expired token"));
  }
}
