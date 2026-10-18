/**
 * Helpers that make posting an errand quicker:
 *  - a suggested delivery fee, worked out from the route (and from what
 *    similar errands have really cost on the platform once there are enough)
 *  - "buy again" and "you might also need" item chips
 *
 * The fee suggestion is plain arithmetic, no AI: it must be explainable and
 * never fail. Straight-line distance is multiplied by a road factor because
 * real routes are longer than the crow flies. All numbers below are starting
 * points to tune with real data. Amounts are in Naira.
 */
import { and, desc, eq } from "drizzle-orm";
import type { ErrandCategory } from "@gracerandly/shared-types";
import { db } from "../db/client";
import { errands } from "../db/schema";
import { haversineMeters } from "./matching";
import { suggestRelatedItems } from "./ai";

const BASE_FEE = 800;
const PER_KM = 120;
const PER_EXTRA_STOP = 300;
const ASAP_SURCHARGE = 0.15;
const ROAD_FACTOR = 1.3;
const FREE_ITEMS = 5;
const PER_EXTRA_ITEM = 40;
export const MIN_SUGGESTED_FEE = 1000;
const MIN_HISTORY_SAMPLES = 5;
const HISTORY_WINDOW = 200;

type Point = { lat: number; lng: number };

function roundTo50(n: number): number {
  return Math.round(n / 50) * 50;
}

export function routeKm(pickup: Point, stops: Point[], dropoff: Point): number {
  const path = [pickup, ...stops, dropoff];
  let meters = 0;
  for (let i = 1; i < path.length; i++) meters += haversineMeters(path[i - 1], path[i]);
  return (meters / 1000) * ROAD_FACTOR;
}

export function formulaFee(input: { km: number; stopCount: number; itemCount: number; urgency: "asap" | "scheduled" }): number {
  let fee = BASE_FEE + input.km * PER_KM + input.stopCount * PER_EXTRA_STOP;
  fee += Math.max(0, input.itemCount - FREE_ITEMS) * PER_EXTRA_ITEM;
  if (input.urgency === "asap") fee *= 1 + ASAP_SURCHARGE;
  return Math.max(MIN_SUGGESTED_FEE, roundTo50(fee));
}

export interface PriceSuggestion {
  suggested: number;
  low: number;
  high: number;
  distanceKm: number;
  /** "history" when real similar errands were blended in. */
  basis: "formula" | "history";
  samples: number;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export async function suggestPrice(input: {
  category: ErrandCategory;
  urgency: "asap" | "scheduled";
  pickup: Point;
  dropoff: Point;
  stops: Point[];
  itemCount: number;
}): Promise<PriceSuggestion> {
  const km = routeKm(input.pickup, input.stops, input.dropoff);
  const formula = formulaFee({ km, stopCount: input.stops.length, itemCount: input.itemCount, urgency: input.urgency });

  // What did similar finished errands (same category, similar length) cost?
  const recent = await db
    .select({ pickup: errands.pickup, dropoff: errands.dropoff, stops: errands.stops, cost: errands.estimatedCost })
    .from(errands)
    .where(and(eq(errands.category, input.category), eq(errands.status, "delivered")))
    .orderBy(desc(errands.createdAt))
    .limit(HISTORY_WINDOW);
  const similar = recent
    .filter((e) => {
      const theirs = routeKm(e.pickup, e.stops ?? [], e.dropoff);
      return km === 0 ? theirs < 1 : Math.abs(theirs - km) / km <= 0.3 || Math.abs(theirs - km) < 1;
    })
    .map((e) => e.cost);

  let suggested = formula;
  let basis: PriceSuggestion["basis"] = "formula";
  if (similar.length >= MIN_HISTORY_SAMPLES) {
    suggested = Math.max(MIN_SUGGESTED_FEE, roundTo50((formula + median(similar)) / 2));
    basis = "history";
  }
  return {
    suggested,
    low: Math.max(MIN_SUGGESTED_FEE, roundTo50(suggested * 0.85)),
    high: roundTo50(suggested * 1.2),
    distanceKm: Math.round(km * 10) / 10,
    basis,
    samples: basis === "history" ? similar.length : 0,
  };
}

export interface ItemSuggestions {
  /** Things this requester bought before in this category, most often first. */
  buyAgain: string[];
  /** AI ideas based on what's already listed. Empty if the AI helper isn't available. */
  related: string[];
}

export async function suggestItems(input: {
  requesterId: string;
  category: ErrandCategory;
  currentNames: string[];
}): Promise<ItemSuggestions> {
  const have = new Set(input.currentNames.map((n) => n.trim().toLowerCase()).filter(Boolean));

  const past = await db
    .select({ items: errands.items })
    .from(errands)
    .where(and(eq(errands.requesterId, input.requesterId), eq(errands.category, input.category)))
    .orderBy(desc(errands.createdAt))
    .limit(30);
  const counts = new Map<string, { name: string; count: number }>();
  for (const row of past) {
    for (const item of row.items) {
      const key = item.name.trim().toLowerCase();
      if (!key || have.has(key)) continue;
      const entry = counts.get(key) ?? { name: item.name.trim(), count: 0 };
      entry.count++;
      counts.set(key, entry);
    }
  }
  const buyAgain = [...counts.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 6)
    .map((e) => e.name);

  let related: string[] = [];
  try {
    related = (await suggestRelatedItems(input.category, input.currentNames)).filter(
      (name) => !buyAgain.some((b) => b.toLowerCase() === name.toLowerCase())
    );
  } catch (err) {
    // Suggestions are a nicety — never fail the request because the AI helper is down or busy.
    console.warn("[suggestions] related items unavailable:", err instanceof Error ? err.message : err);
  }
  return { buyAgain, related };
}
