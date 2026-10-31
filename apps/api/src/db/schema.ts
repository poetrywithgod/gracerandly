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
  index,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import type { ErrandItem, ErrandStop, GeoPoint, Guarantor, RunnerLocation } from "@gracerandly/shared-types";

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
  // Code other people type at signup to credit this account with a referral
  // (see lib/referrals.ts). Created the first time it's needed.
  referralCode: text("referral_code").unique(),
  phoneVerified: boolean("phone_verified").notNull().default(false),
  emailVerified: boolean("email_verified").notNull().default(false),
  // Data URI for now — swap for a hosted URL once real object storage
  // (S3/Cloudinary/etc) is wired up. Kept small client-side (see the
  // requester app's avatar picker) to stay well under the row/payload size
  // this approach can tolerate.
  avatarUrl: text("avatar_url"),
  bio: text("bio"),
  // Staff suspension (admin dashboard, People). A suspended account can't log
  // in or use the API (lib/suspension.ts); the reason is shown to the person.
  suspendedAt: timestamp("suspended_at", { withTimezone: true }),
  suspendedReason: text("suspended_reason"),
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

// Where a runner's identity submission stands (lib/identity-review.ts).
export const verificationStatusEnum = pgEnum("verification_status", ["unsubmitted", "pending", "approved", "rejected"]);

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
  // See requesters.referralCode.
  referralCode: text("referral_code").unique(),
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
  // Legacy columns from when both were required. New submissions use idType +
  // idNumber (one of NIN, BVN, passport or driver's licence); old values were
  // copied across by migration 0027.
  nin: text("nin"),
  bvn: text("bvn"),
  idType: text("id_type"), // "nin" | "bvn" | "passport" | "drivers_license"
  idNumber: text("id_number"),
  // identityVerified is now the *result* of staff review, not of submitting
  // the form: it is true only while verificationStatus is "approved" (see
  // lib/identity-review.ts). Submitting moves unsubmitted/rejected -> pending;
  // staff then approve or reject (with a reason the runner sees).
  identityVerified: boolean("identity_verified").notNull().default(false),
  verificationStatus: verificationStatusEnum("verification_status").notNull().default("unsubmitted"),
  verificationNote: text("verification_note"),
  verificationSubmittedAt: timestamp("verification_submitted_at", { withTimezone: true }),
  verificationReviewedAt: timestamp("verification_reviewed_at", { withTimezone: true }),
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
  // Staff suspension (admin dashboard, People). A suspended account can't log
  // in or use the API (lib/suspension.ts); the reason is shown to the person.
  suspendedAt: timestamp("suspended_at", { withTimezone: true }),
  suspendedReason: text("suspended_reason"),
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
export const recurrenceFrequencyEnum = pgEnum("recurrence_frequency", ["daily", "weekly", "biweekly", "monthly"]);

// A repeating errand: the template lib/recurring.ts posts a fresh errand from
// each time nextRunAt comes round (a couple of hours ahead of the time the
// errand is for). Created when a requester posts an errand with "Repeats"
// switched on. Deleting one leaves the errands it already posted alone
// (errands.recurring_id is just cleared).
export const recurringErrands = pgTable("recurring_errands", {
  id: uuid("id").primaryKey().defaultRandom(),
  requesterId: uuid("requester_id")
    .notNull()
    .references(() => requesters.id),
  category: errandCategoryEnum("category").notNull(),
  frequency: recurrenceFrequencyEnum("frequency").notNull(),
  pickup: jsonb("pickup").$type<GeoPoint>().notNull(),
  dropoff: jsonb("dropoff").$type<GeoPoint>().notNull(),
  stops: jsonb("stops").$type<ErrandStop[]>().notNull().default([]),
  items: jsonb("items").$type<ErrandItem[]>().notNull(),
  instructions: text("instructions"),
  estimatedCost: integer("estimated_cost").notNull(),
  itemsBudget: integer("items_budget").notNull().default(0),
  active: boolean("active").notNull().default(true),
  // The time (not the posting time) of the next errand to create. Advancing
  // it is a compare-and-swap, so a double run can never post the same one twice.
  nextRunAt: timestamp("next_run_at", { withTimezone: true }).notNull(),
  lastRunAt: timestamp("last_run_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type RecurringErrandRow = typeof recurringErrands.$inferSelect;

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
  // Extra places to visit after the pickup and before the drop-off, in
  // order. The runner confirms each one on arrival (routes/runners.ts) and
  // can't head to the drop-off until all are done.
  stops: jsonb("stops").$type<ErrandStop[]>().notNull().default([]),
  items: jsonb("items").$type<ErrandItem[]>().notNull(),
  instructions: text("instructions"),
  isRecurring: boolean("is_recurring").notNull().default(false),
  recurrenceRule: text("recurrence_rule"),
  // Which repeating errand posted this one, if any.
  recurringId: uuid("recurring_id").references(() => recurringErrands.id, { onDelete: "set null" }),
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
  // Referral credit taken off what the requester was charged (see
  // lib/referrals.ts). The runner's payout is unaffected — Gracerandly
  // absorbs the credit. The Paystack charge is
  // amount + itemsBudget - creditApplied.
  creditApplied: integer("credit_applied").notNull().default(0),
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

// ---------------------------------------------------------------------
// Referrals (lib/referrals.ts)
// ---------------------------------------------------------------------

// Whose account something belongs to, for tables that serve both apps.
export const userRoleEnum = pgEnum("user_role", ["requester", "runner"]);

export const referralStatusEnum = pgEnum("referral_status", ["pending", "qualified"]);

// One row per referred account: who invited them (by code, at signup) and
// whether they've since earned the reward by completing a qualifying
// errand. referrerId/referredId point at requesters OR runners depending on
// the role columns, so they aren't foreign keys.
export const referrals = pgTable(
  "referrals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    referrerRole: userRoleEnum("referrer_role").notNull(),
    referrerId: uuid("referrer_id").notNull(),
    referredRole: userRoleEnum("referred_role").notNull(),
    referredId: uuid("referred_id").notNull(),
    status: referralStatusEnum("status").notNull().default("pending"),
    qualifiedAt: timestamp("qualified_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // An account can only ever have been referred once.
    uniqueIndex("referrals_one_per_referred_idx").on(table.referredRole, table.referredId),
    index("referrals_referrer_idx").on(table.referrerRole, table.referrerId),
  ]
);

// available -> reserved (held for a checkout / payout in flight) -> used.
// A failed checkout or payout puts a reserved reward back to available.
export const referralRewardStatusEnum = pgEnum("referral_reward_status", ["available", "reserved", "used"]);

// What a qualified referral earned each side. A requester's reward is
// credit off a later errand; a runner's is cash added to their payout.
export const referralRewards = pgTable(
  "referral_rewards",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    referralId: uuid("referral_id")
      .notNull()
      .references(() => referrals.id, { onDelete: "cascade" }),
    beneficiaryRole: userRoleEnum("beneficiary_role").notNull(),
    beneficiaryId: uuid("beneficiary_id").notNull(),
    amount: integer("amount").notNull(),
    status: referralRewardStatusEnum("status").notNull().default("available"),
    // Set while status is "reserved": the escrow transaction (requester
    // credit) or runner payout (runner bonus) it's held for.
    reservedForTransactionId: uuid("reserved_for_transaction_id"),
    reservedForPayoutId: uuid("reserved_for_payout_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    usedAt: timestamp("used_at", { withTimezone: true }),
  },
  (table) => [index("referral_rewards_beneficiary_idx").on(table.beneficiaryRole, table.beneficiaryId)]
);

// ---------------------------------------------------------------------
// Support tickets (lib/support.ts)
// ---------------------------------------------------------------------

export const supportCategoryEnum = pgEnum("support_category", [
  "payment",
  "errand_problem",
  "other_person",
  "account",
  "safety",
  "other",
]);

export const supportStatusEnum = pgEnum("support_status", ["open", "awaiting_user", "resolved", "closed"]);

export const supportSenderEnum = pgEnum("support_sender", ["requester", "runner", "staff"]);

export const supportTickets = pgTable(
  "support_tickets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Who opened it — a requester or a runner (not a foreign key, same
    // reasoning as referrals).
    userRole: userRoleEnum("user_role").notNull(),
    userId: uuid("user_id").notNull(),
    errandId: uuid("errand_id").references(() => errands.id, { onDelete: "set null" }),
    category: supportCategoryEnum("category").notNull(),
    subject: text("subject").notNull(),
    status: supportStatusEnum("status").notNull().default("open"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (table) => [
    index("support_tickets_user_idx").on(table.userRole, table.userId),
    index("support_tickets_status_idx").on(table.status),
  ]
);

export const supportMessages = pgTable(
  "support_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ticketId: uuid("ticket_id")
      .notNull()
      .references(() => supportTickets.id, { onDelete: "cascade" }),
    sender: supportSenderEnum("sender").notNull(),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("support_messages_ticket_idx").on(table.ticketId)]
);

// Mirrors packages/shared-types' IncidentType union.
export const trustIncidentTypeEnum = pgEnum("trust_incident_type", [
  "geofence_mismatch",
  "route_deviation",
  "theft_confirmed",
  "dispute_lost",
  "sos_triggered",
  "other",
]);

// Mirrors packages/shared-types' TrustIncident. A row only counts against a
// runner's trust tier once `confirmed` is true (lib/trust.ts) — an
// unconfirmed one is just a flag waiting for review. Staff confirm or
// dismiss them from the admin dashboard (lib/safety-admin.ts).
// reviewedByAdminId is plain text until an admin users table exists.
export const trustIncidents = pgTable(
  "trust_incidents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runnerId: uuid("runner_id")
      .notNull()
      .references(() => runners.id, { onDelete: "cascade" }),
    errandId: uuid("errand_id").references(() => errands.id, { onDelete: "set null" }),
    type: trustIncidentTypeEnum("type").notNull(),
    description: text("description").notNull(),
    confirmed: boolean("confirmed").notNull().default(false),
    reviewedByAdminId: text("reviewed_by_admin_id"),
    // Staff reviewed it and decided it was not a real problem (admin dashboard,
    // Safety page). A dismissed incident never counts against the runner.
    dismissed: boolean("dismissed").notNull().default(false),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("trust_incidents_runner_idx").on(table.runnerId)]
);

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

// Mirrors packages/shared-types' SosStatus union.
export const sosAlertStatusEnum = pgEnum("sos_alert_status", ["active", "resolved"]);

// Who pressed the button. Its own enum rather than reusing
// chatSenderRoleEnum — same two values today, but unrelated concepts.
export const sosTriggeredByEnum = pgEnum("sos_triggered_by", ["requester", "runner"]);

// Mirrors packages/shared-types' SosAlert interface.
//
// triggeredById isn't a foreign key for the same polymorphic reason as
// chatMessages.senderId — it can point at requesters.id or runners.id
// depending on triggeredByRole, so lib/sos.ts validates it in code.
//
// The partial unique index guarantees at most ONE active alert per
// (errand, person who triggered it) even if two requests race — a second
// press updates the existing alert's location instead of stacking rows
// (and re-texting the safety team each time).
export const sosAlerts = pgTable(
  "sos_alerts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    errandId: uuid("errand_id")
      .notNull()
      .references(() => errands.id),
    triggeredByRole: sosTriggeredByEnum("triggered_by_role").notNull(),
    triggeredById: uuid("triggered_by_id").notNull(),
    location: jsonb("location").$type<{ lat: number; lng: number }>().notNull(),
    status: sosAlertStatusEnum("status").notNull().default("active"),
    notifiedCount: integer("notified_count").notNull().default(0),
    // Follow-up location updates to the safety team (see lib/sos.ts): when
    // the last one went out, where the person was then, and how many have
    // been sent — so updates can be rate-limited and capped.
    lastUpdateSentAt: timestamp("last_update_sent_at", { withTimezone: true }),
    lastUpdateLocation: jsonb("last_update_location").$type<{ lat: number; lng: number }>(),
    updateCount: integer("update_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    // "self" = the person tapped "I'm safe"; "auto" = closed by the server
    // because it went stale and nobody confirmed they were safe; "staff" =
    // closed from the admin dashboard.
    resolvedBy: text("resolved_by").$type<"self" | "auto" | "staff">(),
  },
  (table) => [
    uniqueIndex("sos_alerts_one_active_per_person_idx")
      .on(table.errandId, table.triggeredByRole)
      .where(sql`${table.status} = 'active'`),
  ]
);

export type SosAlertRow = typeof sosAlerts.$inferSelect;
export type NewSosAlertRow = typeof sosAlerts.$inferInsert;

// One row per device that can receive push notifications. `token` is the
// Expo push token (ExponentPushToken[...]) the app registers after login.
// Unique on the token itself: a token identifies a physical install, so if
// a different person logs in on the same phone the row is re-pointed at
// them (see routes/push.ts) rather than leaving the old account getting
// the new account's messages.
export const pushTokenRoleEnum = pgEnum("push_token_role", ["requester", "runner"]);

export const pushTokens = pgTable(
  "push_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userRole: pushTokenRoleEnum("user_role").notNull(),
    userId: uuid("user_id").notNull(),
    token: text("token").notNull(),
    platform: text("platform").notNull().default("android"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("push_tokens_token_idx").on(table.token),
  ]
);

export type PushTokenRow = typeof pushTokens.$inferSelect;

// Ratings and reviews. After an errand is delivered each side can rate the
// other once: the requester rates the runner, the runner rates the
// requester. Only the 1-5 rating feeds anything people see (the other
// party's average); the written comment is kept for the team (a future
// admin dashboard) and isn't shown to the person it's about.
export const reviewerRoleEnum = pgEnum("reviewer_role", ["requester", "runner"]);

export const errandReviews = pgTable(
  "errand_reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    errandId: uuid("errand_id")
      .notNull()
      .references(() => errands.id),
    reviewerRole: reviewerRoleEnum("reviewer_role").notNull(),
    reviewerId: uuid("reviewer_id").notNull(),
    // The person being rated (a runner id when the reviewer is a requester, and vice versa).
    revieweeId: uuid("reviewee_id").notNull(),
    rating: integer("rating").notNull(),
    comment: text("comment"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // One review per side per errand.
    uniqueIndex("errand_reviews_one_per_side_idx").on(table.errandId, table.reviewerRole),
    index("errand_reviews_reviewee_idx").on(table.revieweeId),
    check("errand_reviews_rating_range", sql`${table.rating} between 1 and 5`),
  ]
);

export type ErrandReviewRow = typeof errandReviews.$inferSelect;

// ---------------------------------------------------------------------
// Refunds (lib/refunds.ts)
// ---------------------------------------------------------------------

// "cancelled": money back when an errand is cancelled; "items_leftover": the
// part of the items budget the runner didn't spend; "admin": staff-issued.
export const refundReasonEnum = pgEnum("refund_reason", ["cancelled", "items_leftover", "admin"]);
export const refundStatusEnum = pgEnum("refund_status", ["pending", "processed", "failed"]);

export const refunds = pgTable(
  "refunds",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    escrowTransactionId: uuid("escrow_transaction_id")
      .notNull()
      .references(() => escrowTransactions.id),
    errandId: uuid("errand_id")
      .notNull()
      .references(() => errands.id),
    requesterId: uuid("requester_id")
      .notNull()
      .references(() => requesters.id),
    amount: integer("amount").notNull(),
    reason: refundReasonEnum("reason").notNull(),
    note: text("note"),
    status: refundStatusEnum("status").notNull().default("pending"),
    // Paystack's refund id (or reference), to match their refund.* webhooks.
    providerReference: text("provider_reference"),
    failureReason: text("failure_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("refunds_errand_idx").on(table.errandId),
    // Cancel and leftover refunds can only ever happen once per payment, so
    // a retried request or a webhook replay can't pay the requester twice.
    uniqueIndex("refunds_once_per_reason_idx")
      .on(table.escrowTransactionId, table.reason)
      .where(sql`${table.reason} <> 'admin'`),
  ]
);

export type RefundRow = typeof refunds.$inferSelect;

// ---------------------------------------------------------------------
// Disputes (lib/disputes.ts)
// ---------------------------------------------------------------------

// A requester reporting a problem with a delivered errand. One per errand.
// While it is open the runner's pay for that errand is held back from payouts.
export const disputeReasonEnum = pgEnum("dispute_reason", [
  "item_missing",
  "wrong_item",
  "damaged",
  "not_delivered",
  "overcharged",
  "rude_behavior",
  "other",
]);
export const disputeStatusEnum = pgEnum("dispute_status", ["open", "resolved"]);
export const disputeOutcomeEnum = pgEnum("dispute_outcome", ["refunded", "rejected"]);

export const disputes = pgTable(
  "disputes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    errandId: uuid("errand_id")
      .notNull()
      .references(() => errands.id),
    requesterId: uuid("requester_id")
      .notNull()
      .references(() => requesters.id),
    runnerId: uuid("runner_id").references(() => runners.id),
    reason: disputeReasonEnum("reason").notNull(),
    description: text("description").notNull(),
    status: disputeStatusEnum("status").notNull().default("open"),
    outcome: disputeOutcomeEnum("outcome"),
    // What staff decided, shown to the requester.
    staffNote: text("staff_note"),
    refundAmount: integer("refund_amount"),
    // How much of the refund was taken back out of the runner's pay.
    runnerDeduction: integer("runner_deduction"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("disputes_one_per_errand_idx").on(table.errandId),
    index("disputes_status_idx").on(table.status),
  ]
);

export type DisputeRow = typeof disputes.$inferSelect;

// ---------------------------------------------------------------------
// Staff accounts and audit log (lib/admin-auth.ts)
// ---------------------------------------------------------------------

// owner: everything, including the team and the audit log.
// support: people, verification, safety, support tickets, disputes (can reject, can't refund), errand fixes.
// finance: payouts, refunds and disputes; can look at the rest but not change it.
export const adminRoleEnum = pgEnum("admin_role", ["owner", "support", "finance"]);

export const adminUsers = pgTable("admin_users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  fullName: text("full_name").notNull(),
  role: adminRoleEnum("role").notNull(),
  passwordHash: text("password_hash").notNull(),
  // Tokens issued before this moment stop working (set on every password change).
  passwordChangedAt: timestamp("password_changed_at", { withTimezone: true }).notNull().defaultNow(),
  disabledAt: timestamp("disabled_at", { withTimezone: true }),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type AdminUserRow = typeof adminUsers.$inferSelect;

// One row per staff action that changed something (and every sign-in).
// adminEmail is copied in so the row still reads right if the account is removed.
export const adminAuditLog = pgTable(
  "admin_audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    adminId: uuid("admin_id").references(() => adminUsers.id, { onDelete: "set null" }),
    adminEmail: text("admin_email").notNull(),
    action: text("action").notNull(),
    targetId: text("target_id"),
    detail: text("detail"),
    ip: text("ip"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("admin_audit_created_idx").on(table.createdAt)]
);

// ---------------------------------------------------------------------
// Settings staff can change from the admin dashboard (lib/settings.ts)
// ---------------------------------------------------------------------

// A row here overrides the environment variable of the same name; delete the
// row to go back to the env value (or the built-in default).
export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  updatedBy: text("updated_by"),
});

// One pending "forgot my password" code per requester or runner. Only the
// hash of the code is stored; it dies after 10 minutes or 5 wrong guesses.
export const passwordResets = pgTable(
  "password_resets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    role: text("role").notNull(), // "requester" | "runner"
    userId: uuid("user_id").notNull(),
    codeHash: text("code_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    attempts: integer("attempts").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("password_resets_role_user_idx").on(t.role, t.userId)]
);
