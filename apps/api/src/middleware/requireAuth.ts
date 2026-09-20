import type { NextFunction, Request, Response } from "express";
import { verifyAuthToken } from "../lib/jwt";
import { AppErrors } from "../lib/errors";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      requesterId?: string;
    }
  }
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : undefined;

  if (!token) {
    next(AppErrors.unauthorized("Missing or malformed Authorization header"));
    return;
  }

  try {
    const payload = verifyAuthToken(token);
    req.requesterId = payload.sub;
    next();
  } catch {
    next(AppErrors.unauthorized("Invalid or expired token"));
  }
}
