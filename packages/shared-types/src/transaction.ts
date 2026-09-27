export type DisbursementMethod = "virtual_card" | "bank_transfer" | "ussd" | "cash_float";

export type TransactionStatus = "pending" | "escrowed" | "disbursed" | "released" | "refunded" | "failed";

export interface EscrowTransaction {
  id: string;
  errandId: string;
  requesterId: string;
  runnerId?: string;
  amount: number;
  commissionAmount: number;
  runnerPayout: number;
  // itemsBudget/itemsSpent mirror Errand.itemsBudget — captured at payment
  // time (so a later edit to the errand can't retroactively change what
  // was actually escrowed) and drawn down as vendor disbursements succeed
  // (see VendorDisbursement). itemsBudget - itemsSpent is what's still
  // available for the runner to spend at vendors on this errand.
  itemsBudget: number;
  itemsSpent: number;
  status: TransactionStatus;
  createdAt: string;
  releasedAt?: string;
}

// A payout run: one bank transfer to a runner covering some number of
// "released" escrow transactions at once (see EscrowTransaction.status).
// Not per-errand — a runner may have several released transactions
// waiting when they request a payout, and this bundles them into a
// single transfer.
export type RunnerPayoutStatus = "pending" | "success" | "failed";

export interface RunnerPayout {
  id: string;
  runnerId: string;
  amount: number;
  status: RunnerPayoutStatus;
  transactionIds: string[];
  failureReason?: string;
  createdAt: string;
  completedAt?: string;
}

// Money the runner spends at a vendor while shopping an errand, drawn from
// that errand's itemsBudget (see Errand/EscrowTransaction). Only
// "bank_transfer" is actually wired up right now — the other three methods
// are modeled here for PRD 6.7's future coverage but rejected server-side
// today. bankDetails is only present for a bank_transfer disbursement.
export type VendorDisbursementStatus = "pending" | "success" | "failed";

export interface VendorDisbursement {
  id: string;
  errandId: string;
  runnerId: string;
  vendorName: string;
  method: DisbursementMethod;
  amount: number;
  status: VendorDisbursementStatus;
  bankDetails?: {
    bankName: string;
    accountNumber: string;
    accountName: string;
  };
  receiptPhotoUrl?: string;
  geoVerified: boolean;
  failureReason?: string;
  createdAt: string;
  completedAt?: string;
}
