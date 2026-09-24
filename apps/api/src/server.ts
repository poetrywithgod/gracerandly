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
import { errorHandler } from "./middleware/errorHandler";

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
app.use("/runners", runnersRouter);

// Must be registered last — Express identifies error-handling middleware
// by its four-argument signature.
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`Gracerandly API running on port ${PORT}`);
});
