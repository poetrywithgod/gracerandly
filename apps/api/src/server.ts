// Must be the very first import: this file compiles to CommonJS, where
// requires run in source order (unlike ESM's hoisting) — anything that
// reads process.env at module-load time (e.g. db/client.ts) needs
// dotenv's side effect to have already run.
import "dotenv/config";

import express from "express";
import cors from "cors";
import authRouter from "./routes/auth";
import errandsRouter from "./routes/errands";
import walletRouter from "./routes/wallet";
import runnersRouter from "./routes/runners";
import pushRouter from "./routes/push";
import recurringRouter from "./routes/recurring";
import internalRouter from "./routes/internal";
import adminRouter from "./routes/admin";
import { requesterSupportRouter, runnerSupportRouter } from "./routes/support";
import { errorHandler } from "./middleware/errorHandler";
import { attachChatServer } from "./lib/chat-server";
import { expireStaleAlerts } from "./lib/sos";
import { runDueRecurring } from "./lib/recurring";
import { expireStaleErrands } from "./lib/expiry";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      // Raw request body bytes, captured alongside the parsed JSON body —
      // needed for Paystack webhook signature verification, which is an
      // HMAC over the exact bytes they sent, not a re-serialization of the
      // parsed object (see routes/wallet.ts).
      rawBody?: Buffer;
    }
  }
}

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
// 100kb (body-parser's default) is plenty for every route except
// PATCH /auth/me/avatar, which carries a base64-encoded image — that
// route used to layer its own express.json({ limit: "3mb" }) on top of
// this one, but Express runs middleware in registration order, so this
// global parser was rejecting anything over 100kb with a 413 before the
// request ever reached that route-level override. Simplest fix: raise
// the one global limit high enough for that route and drop the
// redundant local one, rather than keeping two limits where only the
// smaller one could ever actually apply.
app.use(
  express.json({
    limit: "3mb",
    verify: (req, _res, buf) => {
      (req as express.Request).rawBody = buf;
    },
  })
);

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "gracerandly-api", timestamp: new Date().toISOString() });
});

app.use("/auth", authRouter);
app.use("/errands", errandsRouter);
app.use("/wallet", walletRouter);
app.use("/runners/support", runnerSupportRouter); // before /runners so it isn't swallowed
app.use("/runners", runnersRouter);
app.use("/support", requesterSupportRouter);
app.use("/admin", adminRouter);
app.use("/push", pushRouter);
app.use("/recurring", recurringRouter);
app.use("/internal", internalRouter);

// Must be registered last — Express identifies error-handling middleware
// by its four-argument signature.
app.use(errorHandler);

const httpServer = app.listen(PORT, () => {
  console.log(`Gracerandly API running on port ${PORT}`);
});

// Chat runs on the same HTTP server/port as the REST API (path /ws/chat)
// rather than a separate port — one less thing to configure/expose.
attachChatServer(httpServer);

// Close SOS alerts that went stale (see lib/sos.ts). Also runs once at
// start-up, since a free-tier host that was asleep may have missed some.
const SOS_SWEEP_INTERVAL_MS = 10 * 60 * 1000;
const sweepSos = () => expireStaleAlerts().catch((err) => console.error("[sos] sweep failed", err));
void sweepSos();
setInterval(sweepSos, SOS_SWEEP_INTERVAL_MS).unref();

// Post repeating errands that have come due (see lib/recurring.ts). The
// timer only runs while the server is awake — on a free host also set up an
// outside pinger for /internal/recurring/run (see .env.example, CRON_SECRET).
const RECURRING_INTERVAL_MS = 60 * 1000;
const runRecurring = () => runDueRecurring().catch((err) => console.error("[recurring] run failed", err));
void runRecurring();
setInterval(runRecurring, RECURRING_INTERVAL_MS).unref();

// Cancel and refund errands no runner accepted within STALE_ERRAND_HOURS
// (default 24; see lib/expiry.ts). Same caveat as above for a sleeping host:
// the /internal/recurring/run ping runs this too.
const EXPIRY_INTERVAL_MS = 10 * 60 * 1000;
const runExpiry = () => expireStaleErrands().catch((err) => console.error("[expiry] run failed", err));
void runExpiry();
setInterval(runExpiry, EXPIRY_INTERVAL_MS).unref();
