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
  status: ErrandStatus;
  pickup: GeoPoint;
  dropoff: GeoPoint;
  items: ErrandItem[];
  instructions?: string;
  isRecurring: boolean;
  recurrenceRule?: string;
  estimatedCost: number;
  finalCost?: number;
  sequenceOrder?: number;
  deliveryPin?: string;
  aiParsed: boolean;
  createdAt: string;
  updatedAt: string;
}
