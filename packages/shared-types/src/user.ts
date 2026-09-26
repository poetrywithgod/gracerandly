export type UserRole = "requester" | "runner" | "platform_admin" | "trust_safety_admin" | "finance_ops_admin";

export type Gender = "female" | "male" | "unspecified";

/** A requester's self-reported availability — shown to runners on an active errand. */
export type RequesterStatus = "available" | "busy" | "offline";

export interface BaseUser {
  id: string;
  fullName: string;
  phone: string;
  email?: string;
  role: UserRole;
  createdAt: string;
  updatedAt: string;
}

export interface Requester extends BaseUser {
  role: "requester";
  gender: Gender;
  phoneVerified: boolean;
  emailVerified: boolean;
  /** Data URI (or hosted URL, once real object storage exists) — undefined until the user sets one. */
  avatarUrl?: string;
  bio?: string;
  status: RequesterStatus;
}

export interface Guarantor {
  fullName: string;
  phone: string;
  relationship: string;
}

export interface RunnerLocation {
  lat: number;
  lng: number;
  heading?: number;
  updatedAt: string;
}

/** How a runner gets around — informational for now (see PRD 6.13's
 * future route-optimization work), not used by matching or ETAs yet. */
export type VehicleType = "bicycle" | "motorcycle" | "car" | "on_foot";

/** Where a runner's payout would land once real disbursement exists
 * (PRD 6.7). Undefined until all three fields are set. */
export interface PayoutAccount {
  bankName: string;
  accountNumber: string;
  accountName: string;
}

export interface Runner extends BaseUser {
  role: "runner";
  /** Data URI (or hosted URL, once real object storage exists) — undefined until the runner sets one. */
  avatarUrl?: string;
  vehicleType?: VehicleType;
  /**
   * Identity verification (NIN/BVN/guarantor) happens post-signup, in the
   * Runner app's settings — see routes/runners.ts's PATCH /me/verification.
   * These three are undefined until the runner submits them, and a runner
   * can't go online or accept errands until they do (identityVerified).
   */
  nin?: string;
  bvn?: string;
  identityVerified: boolean;
  guarantor?: Guarantor;
  payoutAccount?: PayoutAccount;
  /**
   * Mirrors TrustTierLevel from trust-tier.ts. A full `trust_tiers` table
   * (with per-tier caps, completion stats, etc — see 6.8) doesn't exist
   * yet; this is the plain level string until that lands, so callers
   * shouldn't treat it as a foreign key.
   */
  trustTierId: string;
  isOnline: boolean;
  activeErrandCount: number;
  currentLocation?: RunnerLocation;
}

export type AdminRole = "platform_admin" | "trust_safety_admin" | "finance_ops_admin";

export interface AdminUser extends BaseUser {
  role: AdminRole;
}

export type AnyUser = Requester | Runner | AdminUser;
