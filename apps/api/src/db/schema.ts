import {
  pgTable,
  pgEnum,
  uuid,
  text,
  boolean,
  integer,
  jsonb,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import type { ErrandItem, GeoPoint, Guarantor, RunnerLocation } from "@gracerandly/shared-types";

// Mirrors packages/shared-types' Gender union.
export const genderEnum = pgEnum("gender", ["female", "male", "unspecified"]);

// Mirrors packages/shared-types' RequesterStatus union.
export const requesterStatusEnum = pgEnum("requester_status", ["available", "busy", "offline"]);

// Mirrors packages/shared-types' Requester interface, plus the
// server-only passwordHash column that never leaves the API.
//
// Runner and AdminUser tables are intentionally not modeled yet —
// only the requester mobile app has a real signup/login flow so far.
export const requesters = pgTable("requesters", {
  id: uuid("id").primaryKey().defaultRandom(),
  fullName: text("full_name").notNull(),
  phone: text("phone").notNull().unique(),
  email: text("email").unique(),
  gender: genderEnum("gender").notNull(),
  passwordHash: text("password_hash").notNull(),
  phoneVerified: boolean("phone_verified").notNull().default(false),
  emailVerified: boolean("email_verified").notNull().default(false),
  // Data URI for now — swap for a hosted URL once real object storage
  // (S3/Cloudinary/etc) is wired up. Kept small client-side (see the
  // requester app's avatar picker) to stay well under the row/payload size
  // this approach can tolerate.
  avatarUrl: text("avatar_url"),
  bio: text("bio"),
  status: requesterStatusEnum("status").notNull().default("available"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type RequesterRow = typeof requesters.$inferSelect;
export type NewRequesterRow = typeof requesters.$inferInsert;

// Mirrors packages/shared-types' TrustTierLevel union. Just a plain column
// on the runner row for now — see the Runner.trustTierId comment in
// shared-types/user.ts for why there's no trust_tiers table yet.
export const trustTierLevelEnum = pgEnum("trust_tier_level", [
  "probationary",
  "bronze",
  "silver",
  "gold",
]);

// Mirrors packages/shared-types' VehicleType union.
export const vehicleTypeEnum = pgEnum("vehicle_type", ["bicycle", "motorcycle", "car", "on_foot"]);

// Mirrors packages/shared-types' Runner interface, plus the server-only
// passwordHash column (same split as `requesters` above).
export const runners = pgTable("runners", {
  id: uuid("id").primaryKey().defaultRandom(),
  fullName: text("full_name").notNull(),
  phone: text("phone").notNull().unique(),
  email: text("email").unique(),
  passwordHash: text("password_hash").notNull(),
  // Same base64 data-URI approach as requesters.avatarUrl — see that
  // column's usage in routes/auth.ts's PATCH /me/avatar for the pattern
  // this mirrors (routes/runners.ts's PATCH /me/avatar does the same).
  avatarUrl: text("avatar_url"),
  // How the runner gets around — optional, set from Settings. Not
  // currently used by matching/ETA (see PRD 6.13's future route
  // optimization), just informational for now.
  vehicleType: vehicleTypeEnum("vehicle_type"),
  // NIN/BVN/guarantor are collected post-signup, in the Runner app's
  // settings (PATCH /me/verification) — not at signup. Null until
  // submitted. identityVerified flips to true on submission; there's no
  // admin review step or registry check yet (see that route for the
  // "self-serve auto-verify, revisit once Trust & Safety review exists"
  // caveat), it's just the gate on going online / accepting errands.
  nin: text("nin"),
  bvn: text("bvn"),
  identityVerified: boolean("identity_verified").notNull().default(false),
  guarantor: jsonb("guarantor").$type<Guarantor>(),
  // Where a runner's payout would land once real disbursement exists
  // (PRD 6.7) — collected now so the Profile page has somewhere to put
  // it, but nothing actually pays out to this yet. All three or none;
  // toRunner() in routes/runners.ts only builds the nested
  // `payoutAccount` object when all three are present.
  bankName: text("bank_name"),
  bankAccountNumber: text("bank_account_number"),
  bankAccountName: text("bank_account_name"),
  trustTierLevel: trustTierLevelEnum("trust_tier_level").notNull().default("probationary"),
  isOnline: boolean("is_online").notNull().default(false),
  currentLocation: jsonb("current_location").$type<RunnerLocation>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type RunnerRow = typeof runners.$inferSelect;
export type NewRunnerRow = typeof runners.$inferInsert;

// Mirrors packages/shared-types' VerificationChannel union.
export const verificationChannelEnum = pgEnum("verification_channel", ["phone", "email"]);

// One active code per (requester, channel) — requesting a new code
// overwrites whatever was pending rather than accumulating rows.
// codeHash is bcrypt-hashed the same way passwordHash is; codes are
// short-lived and low-value, but hashing costs nothing meaningful here
// and keeps a DB leak from handing out live OTPs.
export const verificationCodes = pgTable(
  "verification_codes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    requesterId: uuid("requester_id")
      .notNull()
      .references(() => requesters.id),
    channel: verificationChannelEnum("channel").notNull(),
    codeHash: text("code_hash").notNull(),
    // The destination the code was actually sent to, frozen at send time —
    // so a code sent to an old email/phone can't be redeemed after the
    // requester changes it mid-flow.
    destination: text("destination").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    attempts: integer("attempts").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("verification_codes_requester_channel_idx").on(table.requesterId, table.channel)]
);

export type VerificationCodeRow = typeof verificationCodes.$inferSelect;
export type NewVerificationCodeRow = typeof verificationCodes.$inferInsert;

// Mirrors packages/shared-types' Errand union types.
export const errandCategoryEnum = pgEnum("errand_category", [
  "grocery",
  "pharmacy",
  "food",
  "parcel",
  "miscellaneous",
]);
export const errandUrgencyEnum = pgEnum("errand_urgency", ["asap", "scheduled"]);
export const errandStatusEnum = pgEnum("errand_status", [
  "pending_match",
  "accepted",
  "en_route_to_pickup",
  "in_progress",
  "en_route_to_delivery",
  "delivered",
  "cancelled",
]);

// Mirrors packages/shared-types' Errand interface.
//
// estimatedCost/finalCost are whole-Naira integers for now (no kobo
// precision) — revisit if/when real money handling needs it.
export const errands = pgTable("errands", {
  id: uuid("id").primaryKey().defaultRandom(),
  requesterId: uuid("requester_id")
    .notNull()
    .references(() => requesters.id),
  runnerId: uuid("runner_id").references(() => runners.id),
  category: errandCategoryEnum("category").notNull(),
  urgency: errandUrgencyEnum("urgency").notNull(),
  scheduledFor: timestamp("scheduled_for", { withTimezone: true }),
  status: errandStatusEnum("status").notNull().default("pending_match"),
  pickup: jsonb("pickup").$type<GeoPoint>().notNull(),
  dropoff: jsonb("dropoff").$type<GeoPoint>().notNull(),
  items: jsonb("items").$type<ErrandItem[]>().notNull(),
  instructions: text("instructions"),
  isRecurring: boolean("is_recurring").notNull().default(false),
  recurrenceRule: text("recurrence_rule"),
  estimatedCost: integer("estimated_cost").notNull(),
  finalCost: integer("final_cost"),
  sequenceOrder: integer("sequence_order"),
  deliveryPin: text("delivery_pin"),
  aiParsed: boolean("ai_parsed").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type ErrandRow = typeof errands.$inferSelect;
export type NewErrandRow = typeof errands.$inferInsert;

// Mirrors packages/shared-types' TransactionStatus union (a subset of it —
// "disbursed" belongs to the Runner-payout leg, which isn't wired up yet;
// this MVP only ever reaches "escrowed", "released", "refunded", "failed").
export const transactionStatusEnum = pgEnum("transaction_status", [
  "pending",
  "escrowed",
  "disbursed",
  "released",
  "refunded",
  "failed",
]);

// Mirrors packages/shared-types' EscrowTransaction interface.
//
// One row per payment attempt (not per errand — a failed attempt can be
// retried, which creates a new row rather than overwriting the old one).
// runnerPayout is calculated and stored but still never actually
// disbursed anywhere yet — that's the vendor-disbursement flow from PRD
// 6.7, still unbuilt; only the requester-facing pay-in (this table's real
// job right now) is live.
export const escrowTransactions = pgTable("escrow_transactions", {
  id: uuid("id").primaryKey().defaultRandom(),
  errandId: uuid("errand_id")
    .notNull()
    .references(() => errands.id),
  requesterId: uuid("requester_id")
    .notNull()
    .references(() => requesters.id),
  runnerId: uuid("runner_id").references(() => runners.id),
  amount: integer("amount").notNull(),
  commissionAmount: integer("commission_amount").notNull(),
  runnerPayout: integer("runner_payout").notNull(),
  status: transactionStatusEnum("status").notNull().default("pending"),
  // Paystack's transaction reference — handed to them at initialize time,
  // matched back against at verify time (manual verify or their webhook).
  providerReference: text("provider_reference").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  releasedAt: timestamp("released_at", { withTimezone: true }),
});

export type EscrowTransactionRow = typeof escrowTransactions.$inferSelect;
export type NewEscrowTransactionRow = typeof escrowTransactions.$inferInsert;
