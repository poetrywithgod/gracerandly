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

/** An extra place the runner visits after the pickup and before the drop-off. */
export interface ErrandStop {
  id: string;
  lat: number;
  lng: number;
  address?: string;
  /** What to do or get here, e.g. "Collect the prescription". */
  note?: string;
  /** ISO timestamp — set when the runner confirmed being at this stop. */
  completedAt?: string;
}

export type RecurrenceFrequency = "daily" | "weekly" | "biweekly" | "monthly";

/** A repeating errand: the template the server posts a fresh errand from on schedule. */
export interface RecurringErrand {
  id: string;
  category: ErrandCategory;
  frequency: RecurrenceFrequency;
  pickup: GeoPoint;
  dropoff: GeoPoint;
  stops: ErrandStop[];
  items: ErrandItem[];
  instructions?: string;
  estimatedCost: number;
  itemsBudget: number;
  active: boolean;
  /** When the next errand will be (re)scheduled for, ISO. Unset once stopped. */
  nextRunAt?: string;
  lastRunAt?: string;
  createdAt: string;
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
  /** Extra stops between the pickup and the drop-off, in the order to visit. */
  stops: ErrandStop[];
  items: ErrandItem[];
  instructions?: string;
  isRecurring: boolean;
  recurrenceRule?: string;
  /** Set when this errand was posted automatically by a repeating errand. */
  recurringId?: string;
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
