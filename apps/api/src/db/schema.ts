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
import type { ErrandItem, GeoPoint } from "@gracerandly/shared-types";

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
// runnerId has no FK yet — there's no runners table until the Runner app's
// signup flow exists. estimatedCost/finalCost are whole-Naira integers for
// now (no kobo precision) — revisit if/when real money handling needs it.
export const errands = pgTable("errands", {
  id: uuid("id").primaryKey().defaultRandom(),
  requesterId: uuid("requester_id")
    .notNull()
    .references(() => requesters.id),
  runnerId: uuid("runner_id"),
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
