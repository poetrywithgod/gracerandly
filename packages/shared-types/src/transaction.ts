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
