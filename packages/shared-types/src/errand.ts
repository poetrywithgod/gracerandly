export type ErrandCategory = "grocery" | "pharmacy" | "food" | "parcel" | "miscellaneous";

export type ErrandUrgency = "asap" | "scheduled";

export type ErrandStatus =
  | "pending_match"
  | "accepted"
  | "en_route_to_pickup"
  | "in_progress"
  | "en_route_to_delivery"
  | "delivered"
  | "cancelled";

export interface GeoPoint {
  lat: number;
  lng: number;
  address?: string;
}

export interface ErrandItem {
  id: string;
  name: string;
  quantity: number;
  notes?: string;
}

export interface Errand {
  id: string;
  requesterId: string;
  runnerId?: string;
  category: ErrandCategory;
  urgency: ErrandUrgency;
  /** ISO timestamp — required when urgency is "scheduled", unset for "asap". */
  scheduledFor?: string;
  status: ErrandStatus;
  pickup: GeoPoint;
  dropoff: GeoPoint;
  items: ErrandItem[];
  instructions?: string;
  isRecurring: boolean;
  recurrenceRule?: string;
  estimatedCost: number;
  /** Money set aside for the runner to actually buy the items — separate
   * from estimatedCost, which is the delivery/service fee. Zero for
   * categories like "parcel" where there's nothing to purchase. Paid
   * into escrow alongside estimatedCost (see EscrowTransaction) and paid
   * out to vendors as the runner shops (see VendorDisbursement), not to
   * the runner themselves. */
  itemsBudget: number;
  finalCost?: number;
  sequenceOrder?: number;
  deliveryPin?: string;
  aiParsed: boolean;
  createdAt: string;
  updatedAt: string;
}
