import { timingSafeEqual } from "node:crypto";
import { Router, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import { asyncHandler } from "../lib/asyncHandler";
import { AppError, AppErrors } from "../lib/errors";
import { desc, eq } from "drizzle-orm";
import { db } from "../db/client";
import { errands, refunds } from "../db/schema";
import { dailyCsv, getAnalytics } from "../lib/analytics";
import { ADMIN_PAGE, ADMIN_PAGE_CSP } from "../lib/adminPage";
import { adminSearch, getInsights } from "../lib/insights";
import { adminListPayouts, adminRetryPayout } from "../lib/payouts";
import {
  confirmIncident,
  createIncident,
  createIncidentSchema,
  dismissIncident,
  listIncidents,
  listSos,
  safetyCounts,
  staffResolveSos,
} from "../lib/safety-admin";
import { approve, getReview, listReviews, reject, rejectSchema, reviewCounts } from "../lib/identity-review";
import {
  getErrandDetail,
  getPerson,
  listPeople,
  setSuspended,
  staffCancelErrand,
  staffCancelSchema,
  staffUnassignRunner,
  staffUnassignSchema,
  suspendSchema,
} from "../lib/people-admin";
import { adminGetDispute, adminListDisputes, resolveDisputeSchema, resolveDispute } from "../lib/disputes";
import { findPaidTransaction, issueRefund, retryRefund } from "../lib/refunds";
import { SUPPORT_STATUSES, adminGet, adminList, adminReply, adminSetStatus, replySchema } from "../lib/support";

// Staff side of support. Guarded by one shared key (ADMIN_API_KEY); the whole
// thing is switched off (404) until that's set. The page itself lives in
// lib/adminPage.ts.
const router: Router = Router();

function keyMatches(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  const expected = process.env.ADMIN_API_KEY?.trim();
  if (!expected) return next(AppErrors.notFound());
  const header = req.headers.authorization;
  const given =
    (typeof req.headers["x-admin-key"] === "string" ? req.headers["x-admin-key"] : undefined) ??
    (header?.startsWith("Bearer ") ? header.slice(7) : "");
  if (!given || !keyMatches(given, expected)) {
    return next(new AppError(401, "unauthorized", "Wrong admin key"));
  }
  next();
}

// The page itself is just a shell; it holds no data and needs no key to load.
router.get(["/", "/support"], (_req, res) => {
  if (!process.env.ADMIN_API_KEY?.trim()) {
    res.status(404).send("Not found");
    return;
  }
  res.setHeader("Content-Security-Policy", ADMIN_PAGE_CSP);
  res.type("html").send(ADMIN_PAGE);
});

router.get(
  "/api/support/tickets",
  requireAdmin,
  asyncHandler(async (req, res) => {
    res.json({ tickets: await adminList(typeof req.query.status === "string" ? req.query.status : undefined) });
  })
);

router.get(
  "/api/support/tickets/:id",
  requireAdmin,
  asyncHandler(async (req, res) => {
    res.json(await adminGet(req.params.id));
  })
);

router.post(
  "/api/support/tickets/:id/messages",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { body } = replySchema.parse(req.body);
    res.status(201).json({ message: await adminReply(req.params.id, body) });
  })
);

router.patch(
  "/api/support/tickets/:id",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { status } = z.object({ status: z.enum(SUPPORT_STATUSES) }).parse(req.body);
    res.json({ ticket: await adminSetStatus(req.params.id, status) });
  })
);

router.get(
  "/api/analytics",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const days = Number(typeof req.query.days === "string" ? req.query.days : 30);
    res.json(await getAnalytics(days));
  })
);

// Extra chart data for the dashboard: previous-period comparison, weekday/hour
// demand, status mixes, ratings, the "needs attention" counts and latest errands.
router.get(
  "/api/insights",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const days = Number(typeof req.query.days === "string" ? req.query.days : 30);
    res.json(await getInsights(days));
  })
);

router.get(
  "/api/search",
  requireAdmin,
  asyncHandler(async (req, res) => {
    res.json(await adminSearch(typeof req.query.q === "string" ? req.query.q : ""));
  })
);

router.get(
  "/api/analytics/daily.csv",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const days = Number(typeof req.query.days === "string" ? req.query.days : 30);
    res.type("text/csv").setHeader("Content-Disposition", 'attachment; filename="gracerandly-daily.csv"');
    res.send(dailyCsv(await getAnalytics(days)));
  })
);

// Identity verification review (Verification page).
router.get(
  "/api/verifications",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    res.json({ runners: await listReviews(status), counts: await reviewCounts() });
  })
);

router.get(
  "/api/verifications/:id",
  requireAdmin,
  asyncHandler(async (req, res) => {
    res.json(await getReview(z.uuid().parse(req.params.id)));
  })
);

router.post(
  "/api/verifications/:id/approve",
  requireAdmin,
  asyncHandler(async (req, res) => {
    res.json(await approve(z.uuid().parse(req.params.id)));
  })
);

router.post(
  "/api/verifications/:id/reject",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { reason } = rejectSchema.parse(req.body);
    res.json(await reject(z.uuid().parse(req.params.id), reason));
  })
);

// Safety page: SOS alerts and trust incidents.
router.get(
  "/api/sos",
  requireAdmin,
  asyncHandler(async (_req, res) => {
    res.json({ alerts: await listSos(), counts: await safetyCounts() });
  })
);

router.post(
  "/api/sos/:id/resolve",
  requireAdmin,
  asyncHandler(async (req, res) => {
    res.json(await staffResolveSos(z.uuid().parse(req.params.id)));
  })
);

router.get(
  "/api/incidents",
  requireAdmin,
  asyncHandler(async (req, res) => {
    res.json(await listIncidents(typeof req.query.view === "string" ? req.query.view : undefined));
  })
);

router.post(
  "/api/incidents",
  requireAdmin,
  asyncHandler(async (req, res) => {
    res.status(201).json(await createIncident(createIncidentSchema.parse(req.body)));
  })
);

router.post(
  "/api/incidents/:id/confirm",
  requireAdmin,
  asyncHandler(async (req, res) => {
    res.json(await confirmIncident(z.uuid().parse(req.params.id)));
  })
);

router.post(
  "/api/incidents/:id/dismiss",
  requireAdmin,
  asyncHandler(async (req, res) => {
    res.json(await dismissIncident(z.uuid().parse(req.params.id)));
  })
);

// Payouts page: runner payout history, and a retry that pays out what a
// runner is still owed (for example after Paystack rejected a transfer).
router.get(
  "/api/payouts",
  requireAdmin,
  asyncHandler(async (req, res) => {
    res.json(await adminListPayouts(typeof req.query.status === "string" ? req.query.status : undefined));
  })
);

router.post(
  "/api/payouts/retry",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { runnerId } = z.object({ runnerId: z.uuid() }).parse(req.body);
    res.status(201).json({ payout: await adminRetryPayout(runnerId) });
  })
);

// People: search, profile, suspend / reinstate.
router.get(
  "/api/people",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const q = req.query;
    res.json(
      await listPeople({
        role: typeof q.role === "string" ? q.role : undefined,
        q: typeof q.q === "string" ? q.q : undefined,
        suspended: q.suspended === "1",
      })
    );
  })
);

router.get(
  "/api/people/:role/:id",
  requireAdmin,
  asyncHandler(async (req, res) => {
    res.json(await getPerson(String(req.params.role), z.uuid("Not a valid id").parse(req.params.id)));
  })
);

router.post(
  "/api/people/:role/:id/suspend",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { reason } = suspendSchema.parse(req.body);
    res.json(await setSuspended(String(req.params.role), z.uuid().parse(req.params.id), reason));
  })
);

router.post(
  "/api/people/:role/:id/reinstate",
  requireAdmin,
  asyncHandler(async (req, res) => {
    res.json(await setSuspended(String(req.params.role), z.uuid().parse(req.params.id), null));
  })
);

// One errand in full, and the two things staff can do to a stuck one.
router.get(
  "/api/errands/:id",
  requireAdmin,
  asyncHandler(async (req, res) => {
    res.json(await getErrandDetail(z.uuid("Not a valid errand id").parse(req.params.id)));
  })
);

router.post(
  "/api/errands/:id/cancel",
  requireAdmin,
  asyncHandler(async (req, res) => {
    res.json(await staffCancelErrand(z.uuid().parse(req.params.id), staffCancelSchema.parse(req.body)));
  })
);

router.post(
  "/api/errands/:id/unassign",
  requireAdmin,
  asyncHandler(async (req, res) => {
    res.json(await staffUnassignRunner(z.uuid().parse(req.params.id), staffUnassignSchema.parse(req.body)));
  })
);

// Disputes: problems requesters report on delivered errands.
router.get(
  "/api/disputes",
  requireAdmin,
  asyncHandler(async (req, res) => {
    res.json(await adminListDisputes(typeof req.query.status === "string" ? req.query.status : undefined));
  })
);

router.get(
  "/api/disputes/:id",
  requireAdmin,
  asyncHandler(async (req, res) => {
    res.json(await adminGetDispute(z.uuid().parse(req.params.id)));
  })
);

router.post(
  "/api/disputes/:id/resolve",
  requireAdmin,
  asyncHandler(async (req, res) => {
    res.json(await resolveDispute(z.uuid().parse(req.params.id), resolveDisputeSchema.parse(req.body)));
  })
);

const adminRefundSchema = z.object({
  errandId: z.uuid("Paste the errand's id"),
  amount: z.number().int().positive("Amount must be a whole number of Naira above 0"),
  note: z.string().trim().min(3, "Add a short reason").max(300),
});

router.get(
  "/api/refunds",
  requireAdmin,
  asyncHandler(async (_req, res) => {
    const rows = await db.select().from(refunds).orderBy(desc(refunds.createdAt)).limit(100);
    res.json({
      refunds: rows.map((r) => ({
        id: r.id,
        errandId: r.errandId,
        requesterId: r.requesterId,
        amount: r.amount,
        reason: r.reason,
        note: r.note ?? undefined,
        status: r.status,
        failureReason: r.failureReason ?? undefined,
        createdAt: r.createdAt.toISOString(),
      })),
    });
  })
);

router.post(
  "/api/refunds",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const input = adminRefundSchema.parse(req.body);
    const [errand] = await db.select({ id: errands.id }).from(errands).where(eq(errands.id, input.errandId)).limit(1);
    if (!errand) throw AppErrors.notFound("No errand with that id");
    const tx = await findPaidTransaction(input.errandId);
    if (!tx) throw AppErrors.conflict("That errand has no paid payment to refund");
    const refund = await issueRefund({ tx, amount: input.amount, reason: "admin", note: input.note });
    res.status(201).json({ refund });
  })
);

router.post(
  "/api/refunds/:id/retry",
  requireAdmin,
  asyncHandler(async (req, res) => {
    res.json({ refund: await retryRefund(z.uuid().parse(req.params.id)) });
  })
);

export default router;
