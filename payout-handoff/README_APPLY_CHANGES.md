# Gracerandly — Runner Payout Disbursement (apply these changes)

This delivers PRD §6.7's runner-side bank transfer: a runner can now save a
payout account, have it verified against Paystack's bank records, and
request a payout that actually bundles their released earnings into a real
bank transfer.

## 1. Copy the new files

From this folder, into your repo:

```
cp -r new_files/apps/api/drizzle/0008_lean_iron_lad.sql ~/documents/gracerandly/apps/api/drizzle/
cp -r new_files/apps/api/drizzle/meta/0008_snapshot.json ~/documents/gracerandly/apps/api/drizzle/meta/
```

## 2. Apply the patch

From your repo root:

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

`pnpm install` will touch `pnpm-lock.yaml` — this isn't from the payout
feature; the committed lockfile was missing `apps/runner`'s dependency
section (looks like an earlier session's lockfile update didn't get
committed). `pnpm install` fixes that as a side effect. Worth a quick look
before you commit, but it's unrelated and harmless.

## 4. Nothing new needed in `.env`

This reuses your existing `PAYSTACK_SECRET_KEY` — no new env vars. Two
things worth checking on your Paystack dashboard, though:
- **Transfers must be enabled** on the account (it's off by default on new
  Paystack accounts until you request it).
- **The webhook URL you already have configured** for `charge.success`
  now also needs to receive `transfer.success` / `transfer.failed` /
  `transfer.reversed` — same endpoint, same signature verification, no
  new URL to register. Paystack sends all event types to whichever URL
  is set, so if that's already pointed at `/wallet/paystack/webhook` you
  don't need to change anything on Paystack's end.

## What's new

**`apps/api`**
- `runners` table: `bank_code`, `bank_account_verified`, `paystack_recipient_code` columns
- New `runner_payouts` table — one row per payout *run* (a runner can have
  several released transactions waiting; a payout bundles all of them into
  one transfer, not one transfer per errand)
- `lib/payments.ts`: bank-list lookup + name resolution (with an alias
  table for things like "GTBank" → Paystack's official "Guaranty Trust
  Bank" — plain substring matching missed these), account-number
  verification, transfer-recipient creation, transfer initiation
- `PATCH /runners/me/payout-account` — now actually verifies the account
  with Paystack before saving. An unrecognized bank name is rejected
  outright (no bank code, no way to ever pay out); an account number that
  fails Paystack's resolve is still saved, but flagged unverified.
- `POST /runners/me/payout` — sweeps every "released" escrow transaction
  for that runner into one transfer. Blocked until the payout account is
  verified.
- `GET /runners/me/payouts` — payout history
- `GET /runners/me/earnings` — now returns `availableBalance` (released,
  not yet disbursed) and `totalPaidOut` alongside the existing
  `totalEarned` (which is now lifetime — released + disbursed — where
  before it silently dropped to 0 once money was paid out, since it only
  counted "released" rows)
- `routes/wallet.ts`'s Paystack webhook handler now also processes
  transfer events, settling the matching `runner_payouts` row and flipping
  its escrow transactions from `released` to `disbursed`

**`apps/runner`**
- Profile screen: shows available balance, a "Request payout" button
  (disabled until there's a balance and the account is verified), and an
  "unverified" flag on the payout account row when it needs re-saving

**`packages/shared-types`**
- New `RunnerPayout` / `RunnerPayoutStatus` types
- `PayoutAccount` gained a `verified` field

## What's tested vs. what isn't

I built this in my own sandbox against a real local Postgres and a small
mock Paystack server (no live credentials or network access to Paystack
from where I work), and ran the full path end-to-end: signup → verify
identity → pay for an errand → deliver it → save a payout account (bad
bank name rejected, unresolvable account saved-but-unverified, "GTBank"
correctly resolves) → request a payout while unverified (blocked) → verify
and request a payout (succeeds, released transactions swept up) →
simulate the `transfer.success` webhook → confirm the transaction flips to
`disbursed` and earnings numbers land right. `pnpm -r type-check` is clean
across all 5 packages, migration 0008 applies cleanly on top of 0000–0007.

Two real bugs came out of that testing (not from a live run, from
reasoning + the mock — worth knowing about if something looks off later):
1. My first pass at bank-name matching only did substring matching, which
   missed "GTBank" (Paystack's canonical name is "Guaranty Trust Bank") —
   fixed with a small alias table in `resolveBankCode`. It's not
   exhaustive; if a runner reports a common bank name that fails to
   resolve, it likely just needs adding to `BANK_NAME_ALIASES`.
2. `totalEarned` was originally only summing "released" transactions, so
   it dropped to 0 the moment a payout succeeded (since those transactions
   move to "disbursed"). Fixed to sum released + disbursed.

**What hasn't happened**: no test against Paystack's real sandbox/live API
(I don't have credentials or the right network access here), and the
Runner app's Profile screen changes haven't been run through Expo/Metro —
worth doing before this ships, same as the note from the last handoff
about actually opening the Runner app on a device.

## Still open (from the original PRD sweep)

- Vendor disbursement for requester-side purchases (virtual card → bank
  transfer → petty cash, PRD §6.7's other half)
- Admin dashboard
- In-app chat, ratings & reviews, SOS/panic button
- Runner trust-tier progression logic
- Analytics/reporting, referral program, support/ticketing
- Most AI features beyond conversational errand creation

A good next-chat opener: "Continue Gracerandly — pick up with [whichever]."
