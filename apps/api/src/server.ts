// Must be the very first import: this file compiles to CommonJS, where
// requires run in source order (unlike ESM's hoisting) — anything that
// reads process.env at module-load time (e.g. db/client.ts) needs
// dotenv's side effect to have already run.
import "dotenv/config";

import express from "express";
import cors from "cors";
import authRouter from "./routes/auth";
import errandsRouter from "./routes/errands";
import { errorHandler } from "./middleware/errorHandler";

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "gracerandly-api", timestamp: new Date().toISOString() });
});

app.use("/auth", authRouter);
app.use("/errands", errandsRouter);

// Must be registered last — Express identifies error-handling middleware
// by its four-argument signature.
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`Gracerandly API running on port ${PORT}`);
});
