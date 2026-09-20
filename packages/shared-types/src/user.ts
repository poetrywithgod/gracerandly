export type UserRole = "requester" | "runner" | "platform_admin" | "trust_safety_admin" | "finance_ops_admin";

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
  phoneVerified: boolean;
}

export interface Guarantor {
  fullName: string;
  phone: string;
  relationship: string;
}

export interface Runner extends BaseUser {
  role: "runner";
  nin: string;
  bvn: string;
  identityVerified: boolean;
  guarantor: Guarantor;
  trustTierId: string;
  isOnline: boolean;
  activeErrandCount: number;
  currentLocation?: { lat: number; lng: number; heading?: number; updatedAt: string };
}

export type AdminRole = "platform_admin" | "trust_safety_admin" | "finance_ops_admin";

export interface AdminUser extends BaseUser {
  role: AdminRole;
}

export type AnyUser = Requester | Runner | AdminUser;
