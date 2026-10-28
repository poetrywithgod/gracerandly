import { Router } from "express";
import { timingSafeEqual } from "node:crypto";
import { asyncHandler } from "../lib/asyncHandler";
import { runDueRecurring } from "../lib/recurring";
import { expireStaleErrands } from "../lib/expiry";

// Endpoints for outside schedulers (not for the apps). Disabled unless
// CRON_SECRET is set.
const router: Router = Router();

function secretMatches(provided: string | undefined, expected: string): boolean {
  if (!provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

// A free host stops the API's own timers whenever it goes to sleep, so a
// pinger (e.g. cron-job.org, every 5 minutes) calls this — which also wakes
// the server. GET so the simplest pinger can use it; the secret goes in the
// `x-cron-secret` header, or `?secret=` for pingers that can't set headers.
router.get(
  "/recurring/run",
  asyncHandler(async (req, res) => {
    const expected = process.env.CRON_SECRET?.trim();
    if (!expected) {
      res.status(404).json({ error: { code: "not_found", message: "Not found" } });
      return;
    }
    const header = req.headers["x-cron-secret"];
    const provided = typeof header === "string" ? header : typeof req.query.secret === "string" ? req.query.secret : undefined;
    if (!secretMatches(provided, expected)) {
      res.status(401).json({ error: { code: "unauthorized", message: "Unauthorized" } });
      return;
    }
    const posted = await runDueRecurring();
    const expired = await expireStaleErrands();
    res.json({ ok: true, posted, expired });
  })
);

export default router;
