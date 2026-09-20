import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { AppError } from "../lib/errors";

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message } });
    return;
  }

  if (err instanceof ZodError) {
    const message = err.issues[0]?.message ?? "Invalid request";
    res.status(400).json({ error: { code: "validation_error", message } });
    return;
  }

  console.error(err);
  res.status(500).json({ error: { code: "internal_error", message: "Something went wrong" } });
}
