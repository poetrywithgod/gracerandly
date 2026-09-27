# Gracerandly — Vendor Disbursement: Bank Transfer (apply these changes)

This delivers the "bank transfer to vendor" half of PRD §6.7: a runner can
now pay a vendor directly from an errand's items budget while shopping,
via a real Paystack bank transfer — separate from their own earnings.

## 1. Copy the new files

```
cp new_files/apps/api/drizzle/0009_odd_zaran.sql ~/documents/gracerandly/apps/api/drizzle/
cp new_files/apps/api/drizzle/meta/0009_snapshot.json ~/documents/gracerandly/apps/api/drizzle/meta/
cp new_files/apps/api/src/schemas/vendor-disbursement.ts ~/documents/gracerandly/apps/api/src/schemas/
```

## 2. Apply the patch

```
cd ~/documents/gracerandly
git apply /path/to/MODIFIED_FILES.patch
```

## 3. Install, migrate, type-check

```
pnpm install
pnpm -r type-check
pnpm --filter @gracerandly/api db:migrate
```

No lockfile surprises this time — I checked, and this patch doesn't touch
`pnpm-lock.yaml`.

## 4. Nothing new needed in `.env` or on the Paystack dashboard

Reuses the same `PAYSTACK_SECRET_KEY`, the same webhook URL, and the same
Transfers capability you already turned on for runner payouts. The webhook
handler now tries to match an incoming `transfer.*` event against a
runner payout first, then a vendor disbursement — no new event types to
register.

## What's new

**A new concept: `itemsBudget`, separate from `estimatedCost`**

Up to now, `estimatedCost` was the whole story — the delivery/service fee,
entirely the runner's payout minus commission. That's still true, but it
never covered what a runner actually needs to *buy* something on a
grocery/pharmacy/food errand. This adds:
- `errands.itemsBudget` — set at errand creation, optional, defaults to 0
- `escrowTransactions.itemsBudget` / `itemsSpent` — captured from the
  errand at payment time; `itemsSpent` only ever increases, and only when
  a vendor disbursement's transfer actually succeeds
- The requester is now charged `estimatedCost + itemsBudget` total — the
  service fee and the shopping money are collected together, up front,
  into the same escrow transaction, but tracked and spent completely
  separately. A runner's earnings can never accidentally include money
  meant for a vendor.

**`apps/api`**
- New `vendor_disbursements` table — one row per purchase (not bundled
  like runner payouts, since a vendor is rarely reused)
- `POST /runners/errands/:id/vendor-disbursements` — the runner enters a
  vendor name, amount, and the vendor's bank details. Only while the
  errand is `in_progress`. Checks the amount against what's actually left
  of the items budget (accounting for other disbursements still pending,
  so two rapid requests can't double-spend the same money), resolves and
  verifies the vendor's bank account with Paystack (rejects outright if it
  doesn't check out — no "save unverified for later" here, since this is
  a one-off transfer of the requester's money to a stranger, not the
  runner's own account), then sends a real transfer.
- `GET /runners/errands/:id/vendor-disbursements` (runner) and
  `GET /errands/:id/vendor-disbursements` (requester) — list/transparency
  views
- `routes/wallet.ts`'s webhook now settles vendor disbursements the same
  async way it settles runner payouts: `transfer.success` bumps
  `itemsSpent`, `transfer.failed`/`transfer.reversed` leaves the budget
  untouched so the runner can just try again
- Only `method: "bank_transfer"` is implemented. `virtual_card`, `ussd`,
  and `cash_float` are modeled in the schema/types (so the column doesn't
  need to change shape later) but rejected with a clear "not available
  yet" message if sent.
- Fixed two comments in `schema.ts` left stale from the runner-payout pass
  that still said disbursement "isn't wired up yet"

**`packages/shared-types`**
- `Errand` gained `itemsBudget`
- `EscrowTransaction` gained `itemsBudget` / `itemsSpent`
- `VendorDisbursement` now has a real `status`, optional `bankDetails`,
  `failureReason`, `completedAt` — it used to be a bare shape with no
  lifecycle at all

## What's tested vs. what isn't

Same approach as the payout handoff: real local Postgres, a small mock
Paystack server, no live credentials or network access to Paystack from
where I work. Ran the full path end-to-end:

- Created an errand with `itemsBudget: 8000`, paid `estimatedCost +
  itemsBudget` together, confirmed via webhook, walked it to `in_progress`
- Unrecognized bank name → rejected. Unresolvable account number →
  rejected (no unverified save). Amount over budget → rejected with the
  exact remaining figure. Unsupported method (`virtual_card`) → rejected
  with a clear message.
- Two valid disbursements (3000 + 4000 of the 8000 budget) → both
  succeeded, a third for the remaining 1000 correctly saw "₦0 left" while
  those two were still pending (proving the pending-total check works,
  not just the settled total)
- Simulated `transfer.success` for both → `itemsSpent` became 7000
  exactly, both flipped to `success`
- Simulated `transfer.failed` for a third disbursement → `itemsSpent`
  stayed at 7000 (not bumped), and the same amount could immediately be
  requested again — confirming a failed transfer doesn't strand the
  budget
- Tried a disbursement after the errand was `delivered` → correctly
  rejected ("only while in progress")

`pnpm -r type-check` is clean across all 5 packages, and I verified the
patch applies cleanly (and type-checks clean) against a completely fresh,
independent clone of the actual current `main` — not just my own working
copy.

**What hasn't happened**: no test against Paystack's real API, and no
Runner app UI for this yet — it's backend-only. The runner currently has
no way to actually trigger this from the app; that's the natural next
step if you want to use this before building the admin dashboard or
something else.

## Still open (from the original PRD sweep)

- Runner-app UI for vendor disbursement (the obvious next step for this
  feature specifically)
- Virtual card / USSD / cash float — the other three PRD 6.7 methods
- Admin dashboard
- In-app chat, ratings & reviews, SOS/panic button
- Runner trust-tier progression logic
- Analytics/reporting, referral program, support/ticketing
- Most AI features beyond conversational errand creation

A good next-chat opener: "Continue Gracerandly — pick up with [whichever]."
