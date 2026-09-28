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
  // Where a runner's payout lands (PRD 6.7) — bankName/bankAccountNumber/
  // bankAccountName are collected together; toRunner() in
  // routes/runners.ts only builds the nested `payoutAccount` object when
  // all three are present. bankCode is Paystack's numeric bank code,
  // resolved server-side from bankName against their /bank list at save
  // time (see lib/payments.ts's resolveBankCode) — needed to create a
  // transfer recipient, never shown to the runner. bankAccountVerified
  // flips true only once Paystack's account-resolve endpoint confirms the
  // account number actually belongs to that bank (see PATCH
  // /me/payout-account); a runner can save an account that failed
  // resolution (typos happen, and Paystack's resolve endpoint doesn't
  // cover every bank), but can't request a payout until it's true.
  // paystackRecipientCode caches the transfer recipient Paystack returns
  // so repeat payouts don't recreate one each time — cleared whenever the
  // account details change, so a stale recipient never receives a
  // transfer meant for a new account.
  bankName: text("bank_name"),
  bankAccountNumber: text("bank_account_number"),
  bankAccountName: text("bank_account_name"),
  bankCode: text("bank_code"),
  bankAccountVerified: boolean("bank_account_verified").notNull().default(false),
  paystackRecipientCode: text("paystack_recipient_code"),
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
  // Mirrors packages/shared-types' Errand.itemsBudget comment — money for
  // the runner to actually buy the items, separate from estimatedCost.
  itemsBudget: integer("items_budget").notNull().default(0),
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

// Mirrors packages/shared-types' TransactionStatus union. "disbursed" is
// the runner-payout leg (see runnerPayouts below) — a "released" row
// becomes "disbursed" once its bank transfer actually settles.
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
// amount/commissionAmount/runnerPayout are the delivery/service-fee split
// (estimatedCost); itemsBudget/itemsSpent are the separate pool vendor
// disbursements draw from (see vendorDisbursements below) — the two never
// mix, so a runner's earnings can never accidentally include money meant
// for a vendor.
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
  // Captured from errands.itemsBudget at payment time (see routes/wallet.ts's
  // pay route) — a later edit to the errand can't retroactively change what
  // was actually escrowed. itemsSpent only ever increases, and only via a
  // *successful* vendor disbursement (routes/wallet.ts's webhook handler) —
  // a failed one leaves the budget untouched so the runner can retry.
  itemsBudget: integer("items_budget").notNull().default(0),
  itemsSpent: integer("items_spent").notNull().default(0),
  status: transactionStatusEnum("status").notNull().default("pending"),
  // Paystack's transaction reference — handed to them at initialize time,
  // matched back against at verify time (manual verify or their webhook).
  providerReference: text("provider_reference").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  releasedAt: timestamp("released_at", { withTimezone: true }),
});

export type EscrowTransactionRow = typeof escrowTransactions.$inferSelect;
export type NewEscrowTransactionRow = typeof escrowTransactions.$inferInsert;

// Mirrors packages/shared-types' RunnerPayoutStatus union.
export const runnerPayoutStatusEnum = pgEnum("runner_payout_status", ["pending", "success", "failed"]);

// Mirrors packages/shared-types' RunnerPayout interface.
//
// One row per payout *run*, not per errand — POST /runners/me/payout
// bundles every currently-"released" escrow_transactions row for that
// runner into a single Paystack transfer. transactionIds freezes which
// rows were included at request time, so a transaction that becomes
// released later (a different delivery, mid-flight) isn't accidentally
// swept into this payout when the webhook later marks those same
// transactions "disbursed" — see routes/runners.ts's POST /me/payout.
export const runnerPayouts = pgTable("runner_payouts", {
  id: uuid("id").primaryKey().defaultRandom(),
  runnerId: uuid("runner_id")
    .notNull()
    .references(() => runners.id),
  amount: integer("amount").notNull(),
  status: runnerPayoutStatusEnum("status").notNull().default("pending"),
  transactionIds: jsonb("transaction_ids").$type<string[]>().notNull(),
  // Paystack's transfer_code — used to match the async transfer.success /
  // transfer.failed / transfer.reversed webhook back to this row (same
  // pattern as escrowTransactions.providerReference for pay-ins).
  providerReference: text("provider_reference").notNull().unique(),
  failureReason: text("failure_reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

export type RunnerPayoutRow = typeof runnerPayouts.$inferSelect;
export type NewRunnerPayoutRow = typeof runnerPayouts.$inferInsert;

// Mirrors packages/shared-types' DisbursementMethod union. Only
// "bank_transfer" is implemented (routes/runners.ts's POST
// /errands/:id/vendor-disbursements rejects the other three) — modeled
// here so the column doesn't need to change shape when they are.
export const disbursementMethodEnum = pgEnum("disbursement_method", [
  "virtual_card",
  "bank_transfer",
  "ussd",
  "cash_float",
]);

// Mirrors packages/shared-types' VendorDisbursementStatus union.
export const vendorDisbursementStatusEnum = pgEnum("vendor_disbursement_status", ["pending", "success", "failed"]);

// Mirrors packages/shared-types' VendorDisbursement interface.
//
// One row per purchase — unlike runnerPayouts, these aren't bundled;
// each trip to a vendor gets its own transfer, since the runner types in
// that vendor's own bank details fresh each time (no cached recipient the
// way runners.paystackRecipientCode caches a runner's own account, since a
// vendor is rarely used twice). Draws down its errand's escrow_transactions
// row's itemsBudget — see that table's comment.
export const vendorDisbursements = pgTable("vendor_disbursements", {
  id: uuid("id").primaryKey().defaultRandom(),
  errandId: uuid("errand_id")
    .notNull()
    .references(() => errands.id),
  runnerId: uuid("runner_id")
    .notNull()
    .references(() => runners.id),
  vendorName: text("vendor_name").notNull(),
  method: disbursementMethodEnum("method").notNull(),
  amount: integer("amount").notNull(),
  // Only populated for method="bank_transfer". bankAccountName is the name
  // Paystack's resolve endpoint returned, not necessarily what the runner
  // typed — see the route for why (same reasoning as a runner's own
  // payout account, but stricter: there's no unverified state here, a
  // vendor transfer either resolves or is rejected outright).
  bankName: text("bank_name"),
  bankCode: text("bank_code"),
  bankAccountNumber: text("bank_account_number"),
  bankAccountName: text("bank_account_name"),
  status: vendorDisbursementStatusEnum("status").notNull().default("pending"),
  // Paystack's transfer reference — same settlement pattern as
  // runnerPayouts.providerReference, via the same webhook handler.
  providerReference: text("provider_reference").unique(),
  failureReason: text("failure_reason"),
  receiptPhotoUrl: text("receipt_photo_url"),
  // Whether the runner's device location was within the pickup geofence
  // when they made this purchase — an audit/trust signal (PRD 6.7), not a
  // hard block: shopping online from a vendor who takes bank transfer is
  // legitimate even off-site, so this never rejects a request on its own.
  geoVerified: boolean("geo_verified").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

export type VendorDisbursementRow = typeof vendorDisbursements.$inferSelect;
export type NewVendorDisbursementRow = typeof vendorDisbursements.$inferInsert;

// Mirrors packages/shared-types' ChatMessage's senderRole field.
export const chatSenderRoleEnum = pgEnum("chat_sender_role", ["requester", "runner"]);

// A regular chat bubble ("message") vs. an edit to a previously-sent one
// ("edit" — see the targetMessageId comment below). Mirrors
// packages/shared-types' ChatMessage.kind.
export const chatMessageKindEnum = pgEnum("chat_message_kind", ["message", "edit"]);

// Mirrors packages/shared-types' ChatMessage.contentType — "text" is a
// normal message, "audio" is a voice note (content holds base64-encoded
// audio, not the transcript). Same delivery/deletion lifecycle either way;
// audio just makes for a much bigger `content` value, which is why
// lib/chat-server.ts's WebSocketServer needs a larger maxPayload than the
// text-only default would need.
export const chatContentTypeEnum = pgEnum("chat_content_type", ["text", "audio"]);

// Mirrors packages/shared-types' ChatMessage interface — but this table is
// a delivery queue, not a chat history. A row exists only from the moment
// a message is sent until the recipient's WebSocket connection
// acknowledges receiving it (see lib/chat-server.ts), at which point it's
// deleted. The *actual* chat history lives only on each device's own
// local storage (apps/runner and apps/requester's lib/chatDb.ts) — this
// table's whole job is getting a message from one phone to the other,
// same model WhatsApp's servers use (store only until delivered, never a
// permanent archive).
//
// senderId isn't a foreign key, since it can point at either requesters.id
// or runners.id depending on senderRole — Drizzle doesn't support a
// conditional/polymorphic reference, so this is validated in code (see
// lib/chat-server.ts's connection handshake) rather than by the schema.
export const chatMessages = pgTable("chat_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  errandId: uuid("errand_id")
    .notNull()
    .references(() => errands.id),
  senderRole: chatSenderRoleEnum("sender_role").notNull(),
  senderId: uuid("sender_id").notNull(),
  kind: chatMessageKindEnum("kind").notNull().default("message"),
  contentType: chatContentTypeEnum("content_type").notNull().default("text"),
  // For kind="edit": the id of the message being edited, as the CLIENT
  // knows it (from its own local chat history) — not a foreign key, since
  // the original chat_messages row is very likely already deleted by the
  // time an edit happens (most messages are acked and removed within
  // moments of being sent). The recipient's client looks this id up in
  // its own local SQLite and updates that row's content in place.
  targetMessageId: uuid("target_message_id"),
  content: text("content").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ChatMessageRow = typeof chatMessages.$inferSelect;
export type NewChatMessageRow = typeof chatMessages.$inferInsert;
