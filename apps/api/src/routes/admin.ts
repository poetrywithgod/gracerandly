import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../lib/asyncHandler";
import { AppError, AppErrors } from "../lib/errors";
import {
  adminCount,
  adminView,
  auditMutations,
  changeOwnPassword,
  changePasswordSchema,
  clientIp,
  createStaff,
  createStaffSchema,
  listAudit,
  listTeam,
  login,
  loginSchema,
  passwordSchema,
  requireRole,
  requireStaff,
  resetStaffPassword,
  setupFirstOwner,
  setupSchema,
  updateStaff,
  updateStaffSchema,
} from "../lib/admin-auth";
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

const supportOnly = requireRole("owner", "support");
const moneyOnly = requireRole("owner", "finance");
const ownerOnly = requireRole("owner");

// ---- Sign-in (public) ----
// The page is on while ADMIN_API_KEY is set. The key only creates the first owner.
router.get(
  "/api/auth/status",
  asyncHandler(async (_req, res) => {
    res.json({ setupNeeded: (await adminCount()) === 0 });
  })
);

router.post(
  "/api/auth/setup",
  asyncHandler(async (req, res) => {
    res.status(201).json(await setupFirstOwner(setupSchema.parse(req.body), clientIp(req)));
  })
);

router.post(
  "/api/auth/login",
  asyncHandler(async (req, res) => {
    if (!process.env.ADMIN_API_KEY?.trim()) throw AppErrors.notFound();
    res.json(await login(loginSchema.parse(req.body), clientIp(req)));
  })
);

// Everything below needs a signed-in staff account, and every change is logged.
router.use("/api", requireStaff, auditMutations);

router.get("/api/auth/me", (req, res) => {
  res.json({ admin: adminView(req.admin!) });
});

router.post(
  "/api/auth/password",
  asyncHandler(async (req, res) => {
    res.json(await changeOwnPassword(req.admin!, changePasswordSchema.parse(req.body), clientIp(req)));
  })
);

// Team and audit log: owners only.
router.get(
  "/api/team",
  ownerOnly,
  asyncHandler(async (_req, res) => {
    res.json({ team: await listTeam() });
  })
);

router.post(
  "/api/team",
  ownerOnly,
  asyncHandler(async (req, res) => {
    res.status(201).json({ member: await createStaff(createStaffSchema.parse(req.body)) });
  })
);

router.patch(
  "/api/team/:id",
  ownerOnly,
  asyncHandler(async (req, res) => {
    res.json({ member: await updateStaff(req.admin!.id, z.uuid().parse(req.params.id), updateStaffSchema.parse(req.body)) });
  })
);

router.post(
  "/api/team/:id/password",
  ownerOnly,
  asyncHandler(async (req, res) => {
    const { password } = z.object({ password: passwordSchema }).parse(req.body);
    res.json({ member: await resetStaffPassword(z.uuid().parse(req.params.id), password) });
  })
);

router.get(
  "/api/audit",
  ownerOnly,
  asyncHandler(async (req, res) => {
    res.json({
      entries: await listAudit({
        adminId: typeof req.query.admin === "string" && req.query.admin ? z.uuid().parse(req.query.admin) : undefined,
        q: typeof req.query.q === "string" ? req.query.q.slice(0, 60) : undefined,
      }),
    });
  })
);

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
  asyncHandler(async (req, res) => {
    res.json({ tickets: await adminList(typeof req.query.status === "string" ? req.query.status : undefined) });
  })
);

router.get(
  "/api/support/tickets/:id",
  asyncHandler(async (req, res) => {
    res.json(await adminGet(req.params.id));
  })
);

router.post(
  "/api/support/tickets/:id/messages",
  supportOnly,
  asyncHandler(async (req, res) => {
    const { body } = replySchema.parse(req.body);
    res.status(201).json({ message: await adminReply(req.params.id, body) });
  })
);

router.patch(
  "/api/support/tickets/:id",
  supportOnly,
  asyncHandler(async (req, res) => {
    const { status } = z.object({ status: z.enum(SUPPORT_STATUSES) }).parse(req.body);
    res.json({ ticket: await adminSetStatus(req.params.id, status) });
  })
);

router.get(
  "/api/analytics",
  asyncHandler(async (req, res) => {
    const days = Number(typeof req.query.days === "string" ? req.query.days : 30);
    res.json(await getAnalytics(days));
  })
);

// Extra chart data for the dashboard: previous-period comparison, weekday/hour
// demand, status mixes, ratings, the "needs attention" counts and latest errands.
router.get(
  "/api/insights",
  asyncHandler(async (req, res) => {
    const days = Number(typeof req.query.days === "string" ? req.query.days : 30);
    res.json(await getInsights(days));
  })
);

router.get(
  "/api/search",
  asyncHandler(async (req, res) => {
    res.json(await adminSearch(typeof req.query.q === "string" ? req.query.q : ""));
  })
);

router.get(
  "/api/analytics/daily.csv",
  asyncHandler(async (req, res) => {
    const days = Number(typeof req.query.days === "string" ? req.query.days : 30);
    res.type("text/csv").setHeader("Content-Disposition", 'attachment; filename="gracerandly-daily.csv"');
    res.send(dailyCsv(await getAnalytics(days)));
  })
);

// Identity verification review (Verification page).
router.get(
  "/api/verifications",
  supportOnly,
  asyncHandler(async (req, res) => {
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    res.json({ runners: await listReviews(status), counts: await reviewCounts() });
  })
);

router.get(
  "/api/verifications/:id",
  supportOnly,
  asyncHandler(async (req, res) => {
    res.json(await getReview(z.uuid().parse(req.params.id)));
  })
);

router.post(
  "/api/verifications/:id/approve",
  supportOnly,
  asyncHandler(async (req, res) => {
    res.json(await approve(z.uuid().parse(req.params.id)));
  })
);

router.post(
  "/api/verifications/:id/reject",
  supportOnly,
  asyncHandler(async (req, res) => {
    const { reason } = rejectSchema.parse(req.body);
    res.json(await reject(z.uuid().parse(req.params.id), reason));
  })
);

// Safety page: SOS alerts and trust incidents.
router.get(
  "/api/sos",
  asyncHandler(async (_req, res) => {
    res.json({ alerts: await listSos(), counts: await safetyCounts() });
  })
);

router.post(
  "/api/sos/:id/resolve",
  supportOnly,
  asyncHandler(async (req, res) => {
    res.json(await staffResolveSos(z.uuid().parse(req.params.id)));
  })
);

router.get(
  "/api/incidents",
  asyncHandler(async (req, res) => {
    res.json(await listIncidents(typeof req.query.view === "string" ? req.query.view : undefined));
  })
);

router.post(
  "/api/incidents",
  supportOnly,
  asyncHandler(async (req, res) => {
    res.status(201).json(await createIncident(createIncidentSchema.parse(req.body), req.admin!.email));
  })
);

router.post(
  "/api/incidents/:id/confirm",
  supportOnly,
  asyncHandler(async (req, res) => {
    res.json(await confirmIncident(z.uuid().parse(req.params.id), req.admin!.email));
  })
);

router.post(
  "/api/incidents/:id/dismiss",
  supportOnly,
  asyncHandler(async (req, res) => {
    res.json(await dismissIncident(z.uuid().parse(req.params.id), req.admin!.email));
  })
);

// Payouts page: runner payout history, and a retry that pays out what a
// runner is still owed (for example after Paystack rejected a transfer).
router.get(
  "/api/payouts",
  asyncHandler(async (req, res) => {
    res.json(await adminListPayouts(typeof req.query.status === "string" ? req.query.status : undefined));
  })
);

router.post(
  "/api/payouts/retry",
  moneyOnly,
  asyncHandler(async (req, res) => {
    const { runnerId } = z.object({ runnerId: z.uuid() }).parse(req.body);
    res.status(201).json({ payout: await adminRetryPayout(runnerId) });
  })
);

// People: search, profile, suspend / reinstate.
router.get(
  "/api/people",
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
  asyncHandler(async (req, res) => {
    res.json(await getPerson(String(req.params.role), z.uuid("Not a valid id").parse(req.params.id)));
  })
);

router.post(
  "/api/people/:role/:id/suspend",
  supportOnly,
  asyncHandler(async (req, res) => {
    const { reason } = suspendSchema.parse(req.body);
    res.json(await setSuspended(String(req.params.role), z.uuid().parse(req.params.id), reason));
  })
);

router.post(
  "/api/people/:role/:id/reinstate",
  supportOnly,
  asyncHandler(async (req, res) => {
    res.json(await setSuspended(String(req.params.role), z.uuid().parse(req.params.id), null));
  })
);

// One errand in full, and the two things staff can do to a stuck one.
router.get(
  "/api/errands/:id",
  asyncHandler(async (req, res) => {
    res.json(await getErrandDetail(z.uuid("Not a valid errand id").parse(req.params.id)));
  })
);

router.post(
  "/api/errands/:id/cancel",
  supportOnly,
  asyncHandler(async (req, res) => {
    res.json(await staffCancelErrand(z.uuid().parse(req.params.id), staffCancelSchema.parse(req.body)));
  })
);

router.post(
  "/api/errands/:id/unassign",
  supportOnly,
  asyncHandler(async (req, res) => {
    res.json(await staffUnassignRunner(z.uuid().parse(req.params.id), staffUnassignSchema.parse(req.body)));
  })
);

// Disputes: problems requesters report on delivered errands.
router.get(
  "/api/disputes",
  asyncHandler(async (req, res) => {
    res.json(await adminListDisputes(typeof req.query.status === "string" ? req.query.status : undefined));
  })
);

router.get(
  "/api/disputes/:id",
  asyncHandler(async (req, res) => {
    res.json(await adminGetDispute(z.uuid().parse(req.params.id)));
  })
);

router.post(
  "/api/disputes/:id/resolve",
  asyncHandler(async (req, res) => {
    const input = resolveDisputeSchema.parse(req.body);
    // Support staff can reject a dispute; sending money back is for owners and finance.
    if (input.outcome === "refund" && req.admin!.role === "support") {
      throw new AppError(403, "forbidden", "Your role (support) can't send refunds. Ask an owner or finance.");
    }
    res.json(await resolveDispute(z.uuid().parse(req.params.id), input, req.admin!.email));
  })
);

const adminRefundSchema = z.object({
  errandId: z.uuid("Paste the errand's id"),
  amount: z.number().int().positive("Amount must be a whole number of Naira above 0"),
  note: z.string().trim().min(3, "Add a short reason").max(300),
});

router.get(
  "/api/refunds",
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
  moneyOnly,
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
  moneyOnly,
  asyncHandler(async (req, res) => {
    res.json({ refund: await retryRefund(z.uuid().parse(req.params.id)) });
  })
);

export default router;
