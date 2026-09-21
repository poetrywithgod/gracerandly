import { pgTable, pgEnum, uuid, text, boolean, integer, jsonb, timestamp } from "drizzle-orm/pg-core";
import type { ErrandItem, GeoPoint } from "@gracerandly/shared-types";

// Mirrors packages/shared-types' Gender union.
export const genderEnum = pgEnum("gender", ["female", "male", "unspecified"]);

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
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type RequesterRow = typeof requesters.$inferSelect;
export type NewRequesterRow = typeof requesters.$inferInsert;

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
