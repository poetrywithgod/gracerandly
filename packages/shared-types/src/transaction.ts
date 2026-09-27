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

export interface VendorDisbursement {
  id: string;
  errandId: string;
  runnerId: string;
  vendorName: string;
  method: DisbursementMethod;
  amount: number;
  receiptPhotoUrl?: string;
  geoVerified: boolean;
  createdAt: string;
}
