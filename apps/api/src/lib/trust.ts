/**
 * Runner trust tiers (PRD: higher-value errands and cash float are earned,
 * not given).
 *
 * A runner's tier comes from two things only:
 *  - how many errands they've delivered, and
 *  - their "clean completion rate": the share of those deliveries that
 *    weren't hit by a *confirmed* trust incident (see trustIncidents in
 *    db/schema.ts).
 * A confirmed theft drops the runner back to Probationary for good.
 *
 * The tier is recalculated whenever it's looked at or an errand is
 * delivered, and the result is saved on the runner row (trustTierLevel) so
 * everything else can read it cheaply. Tiers can go down as well as up: a
 * confirmed incident lowers the clean rate.
 *
 * The thresholds below are starting points — tune them as real delivery
 * data comes in. Money amounts are in Naira.
 */
import { and, count, eq } from "drizzle-orm";
import type { TrustTier, TrustTierLevel, TrustTierSummary } from "@gracerandly/shared-types";
import { db } from "../db/client";
import { errands, runners, trustIncidents } from "../db/schema";
import { sendPushToUser } from "./push";

interface TierRule {
  minCompleted: number;
  minCleanRate: number;
  /** Most an errand can be worth (delivery fee + items budget) for this tier to accept it. */
  maxErrandValue: number;
  /** Most of their own cash a runner can have out on purchases at one time. */
  maxCashFloat: number;
}

export const TIER_ORDER: TrustTierLevel[] = ["probationary", "bronze", "silver", "gold"];

export const TIER_RULES: Record<TrustTierLevel, TierRule> = {
  probationary: { minCompleted: 0, minCleanRate: 0, maxErrandValue: 10_000, maxCashFloat: 0 },
  bronze: { minCompleted: 5, minCleanRate: 0.9, maxErrandValue: 30_000, maxCashFloat: 5_000 },
  silver: { minCompleted: 25, minCleanRate: 0.95, maxErrandValue: 100_000, maxCashFloat: 20_000 },
  gold: { minCompleted: 100, minCleanRate: 0.97, maxErrandValue: 500_000, maxCashFloat: 50_000 },
};

export const TIER_LABELS: Record<TrustTierLevel, string> = {
  probationary: "Probationary",
  bronze: "Bronze",
  silver: "Silver",
  gold: "Gold",
};

export interface TrustStats {
  completed: number;
  confirmedIncidents: number;
  hasConfirmedTheft: boolean;
}

export function cleanRate(stats: TrustStats): number {
  if (stats.completed === 0) return 1;
  return Math.max(0, 1 - stats.confirmedIncidents / stats.completed);
}

/** The highest tier whose requirements these stats meet. Pure — easy to test. */
export function levelForStats(stats: TrustStats): TrustTierLevel {
  if (stats.hasConfirmedTheft) return "probationary";
  const rate = cleanRate(stats);
  let level: TrustTierLevel = "probationary";
  for (const candidate of TIER_ORDER) {
    const rule = TIER_RULES[candidate];
    if (stats.completed >= rule.minCompleted && rate >= rule.minCleanRate) level = candidate;
  }
  return level;
}

export function tierFor(level: TrustTierLevel, stats: TrustStats): TrustTier {
  const rule = TIER_RULES[level];
  return {
    level,
    maxErrandValue: rule.maxErrandValue,
    maxCashFloat: rule.maxCashFloat,
    completedErrands: stats.completed,
    cleanCompletionRate: Math.round(cleanRate(stats) * 1000) / 1000,
  };
}

/** What an errand is worth for tier purposes: the delivery fee plus the money the runner will handle for items. */
export function errandValue(errand: { estimatedCost: number; itemsBudget: number }): number {
  return errand.estimatedCost + errand.itemsBudget;
}

async function loadStats(runnerId: string): Promise<TrustStats> {
  const [[completedRow], incidentRows] = await Promise.all([
    db
      .select({ value: count() })
      .from(errands)
      .where(and(eq(errands.runnerId, runnerId), eq(errands.status, "delivered"))),
    db
      .select({ type: trustIncidents.type })
      .from(trustIncidents)
      .where(and(eq(trustIncidents.runnerId, runnerId), eq(trustIncidents.confirmed, true))),
  ]);
  return {
    completed: completedRow?.value ?? 0,
    confirmedIncidents: incidentRows.length,
    hasConfirmedTheft: incidentRows.some((row) => row.type === "theft_confirmed"),
  };
}

/**
 * Works out the runner's current tier, saves it if it changed (telling the
 * runner when it went up), and returns it with what's needed for the next
 * one. Never throws on the notification part.
 */
export async function refreshRunnerTier(runnerId: string): Promise<TrustTierSummary> {
  const stats = await loadStats(runnerId);
  const level = levelForStats(stats);

  const [runner] = await db.select({ level: runners.trustTierLevel }).from(runners).where(eq(runners.id, runnerId)).limit(1);
  if (runner && runner.level !== level) {
    await db.update(runners).set({ trustTierLevel: level }).where(eq(runners.id, runnerId));
    if (TIER_ORDER.indexOf(level) > TIER_ORDER.indexOf(runner.level)) {
      const rule = TIER_RULES[level];
      void sendPushToUser("runner", runnerId, {
        title: `You're now ${TIER_LABELS[level]}!`,
        body: `You can take errands worth up to ₦${rule.maxErrandValue.toLocaleString("en-NG")}${
          rule.maxCashFloat > 0 ? ` and use up to ₦${rule.maxCashFloat.toLocaleString("en-NG")} of your own cash.` : "."
        }`,
        data: { type: "tier_up" },
        channelId: "errands",
        ttl: 24 * 3600,
      });
    }
  }

  const nextLevel = TIER_ORDER[TIER_ORDER.indexOf(level) + 1];
  const next = nextLevel
    ? {
        level: nextLevel,
        errandsToGo: Math.max(0, TIER_RULES[nextLevel].minCompleted - stats.completed),
        minCleanCompletionRate: TIER_RULES[nextLevel].minCleanRate,
        maxErrandValue: TIER_RULES[nextLevel].maxErrandValue,
        maxCashFloat: TIER_RULES[nextLevel].maxCashFloat,
      }
    : undefined;

  return { tier: tierFor(level, stats), next };
}
