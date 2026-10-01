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
    // One message per offending field, keyed by its dotted path (e.g.
    // "guarantor.phone"), so a client can highlight exactly which input is
    // wrong instead of showing one generic banner. The first message per
    // path wins; issues with no path (whole-body problems) are left out
    // and still surface through `message`.
    const fields: Record<string, string> = {};
    for (const issue of err.issues) {
      const path = issue.path.join(".");
      if (path && !(path in fields)) fields[path] = issue.message;
    }
    res.status(400).json({ error: { code: "validation_error", message, fields } });
    return;
  }

  console.error(err);
  res.status(500).json({ error: { code: "internal_error", message: "Something went wrong" } });
}
