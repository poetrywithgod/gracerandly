export type TrustTierLevel = "probationary" | "bronze" | "silver" | "gold";

export interface TrustTier {
  level: TrustTierLevel;
  maxErrandValue: number;
  maxCashFloat: number;
  completedErrands: number;
  cleanCompletionRate: number;
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
