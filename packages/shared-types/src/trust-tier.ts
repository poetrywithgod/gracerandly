export type TrustTierLevel = "probationary" | "bronze" | "silver" | "gold";

export interface TrustTier {
  level: TrustTierLevel;
  maxErrandValue: number;
  maxCashFloat: number;
  completedErrands: number;
  cleanCompletionRate: number;
}

/** A runner's tier plus what it takes to reach the next one (unset at the top tier). */
export interface TrustTierSummary {
  tier: TrustTier;
  next?: {
    level: TrustTierLevel;
    /** Delivered errands still needed. */
    errandsToGo: number;
    /** Share of deliveries (0-1) that must be free of confirmed incidents. */
    minCleanCompletionRate: number;
    maxErrandValue: number;
    maxCashFloat: number;
  };
}

export type IncidentType =
  | "geofence_mismatch"
  | "route_deviation"
  | "theft_confirmed"
  | "dispute_lost"
  | "sos_triggered"
  | "other";

export interface TrustIncident {
  id: string;
  runnerId: string;
  errandId?: string;
  type: IncidentType;
  description: string;
  confirmed: boolean;
  reviewedByAdminId?: string;
  createdAt: string;
}
