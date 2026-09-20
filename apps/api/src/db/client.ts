import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "DATABASE_URL is not set. Copy apps/api/.env.example to apps/api/.env and fill it in."
  );
}

// A single shared connection pool for the process. tsx's watch mode
// restarts the whole process on file changes (unlike Next.js-style HMR),
// so there's no need to guard against re-creating this across reloads.
const queryClient = postgres(connectionString);

export const db = drizzle(queryClient, { schema });
