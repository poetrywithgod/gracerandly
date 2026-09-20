import { pgTable, pgEnum, uuid, text, boolean, timestamp } from "drizzle-orm/pg-core";

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
