/**
 * Business settings staff can change from the admin dashboard (Settings page,
 * owners only) without touching Render: commission, cancellation fee,
 * referral amounts, how long an errand may wait, the dispute window and who
 * gets alert emails.
 *
 * Where a value comes from, in order: a value saved here (app_settings table),
 * then the environment variable of the same name, then the built-in default.
 * Reads are synchronous (from a copy kept in memory) so existing code that
 * asked process.env can ask here instead. The copy is loaded at start-up,
 * refreshed every minute, and updated at once when someone saves.
 */
import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { appSettings } from "../db/schema";
import { AppErrors } from "./errors";

export interface SettingDef {
  key: string;
  label: string;
  help: string;
  kind: "number" | "text";
  unit?: string;
  min?: number;
  max?: number;
  integer?: boolean;
  default: number | string;
}

export const SETTING_DEFS: SettingDef[] = [
  {
    key: "PLATFORM_COMMISSION_PERCENT",
    label: "Commission",
    help: "Gracerandly's cut of each delivery fee. Only errands paid for after you change it are affected.",
    kind: "number", unit: "%", min: 0, max: 50, default: 5,
  },
  {
    key: "CANCELLATION_FEE_NAIRA",
    label: "Cancellation fee",
    help: "What a runner keeps when a requester cancels after the runner accepted (before pickup).",
    kind: "number", unit: "₦", min: 0, max: 10000, integer: true, default: 500,
  },
  {
    key: "REFERRAL_REFERRER_NAIRA",
    label: "Referral reward for the person who invites",
    help: "Paid after the new person's first delivered errand.",
    kind: "number", unit: "₦", min: 0, max: 10000, integer: true, default: 500,
  },
  {
    key: "REFERRAL_REFEREE_NAIRA",
    label: "Referral reward for the new person",
    help: "Credit on their next errand (requesters) or bonus in their payout (runners).",
    kind: "number", unit: "₦", min: 0, max: 10000, integer: true, default: 500,
  },
  {
    key: "REFERRAL_MIN_ERRAND_NAIRA",
    label: "Smallest errand that earns a referral reward",
    help: "The new person's first delivered errand must be worth at least this much.",
    kind: "number", unit: "₦", min: 0, max: 100000, integer: true, default: 1000,
  },
  {
    key: "REFERRAL_MAX_REWARDED_PER_REFERRER",
    label: "Most rewarded referrals per person",
    help: "Stops one person farming rewards.",
    kind: "number", min: 0, max: 1000, integer: true, default: 20,
  },
  {
    key: "STALE_ERRAND_HOURS",
    label: "Cancel unaccepted errands after",
    help: "An errand nobody accepts is cancelled and fully refunded after this many hours.",
    kind: "number", unit: "hours", min: 1, max: 168, integer: true, default: 24,
  },
  {
    key: "DISPUTE_WINDOW_HOURS",
    label: "Problem reports allowed for",
    help: "How long after delivery a requester can report a problem.",
    kind: "number", unit: "hours", min: 1, max: 720, integer: true, default: 48,
  },
  {
    key: "ADMIN_ALERT_EMAILS",
    label: "Alert emails",
    help: "Comma-separated addresses that get an email when a refund or payout fails, a problem is reported, or a runner is waiting for identity review.",
    kind: "text", default: "",
  },
];

const defOf = (key: string) => SETTING_DEFS.find((d) => d.key === key);

let overrides = new Map<string, string>();

export async function loadSettings(): Promise<void> {
  try {
    const rows = await db.select().from(appSettings);
    overrides = new Map(rows.map((r) => [r.key, r.value]));
  } catch (err) {
    console.error("[settings] could not load", err instanceof Error ? err.message : err);
  }
}

function parseNumber(def: SettingDef, raw: string | undefined): number | null {
  if (raw === undefined || raw.trim() === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  if (def.min !== undefined && n < def.min) return null;
  if (def.max !== undefined && n > def.max) return null;
  return def.integer ? Math.floor(n) : n;
}

export function settingSource(key: string): "custom" | "env" | "default" {
  const def = defOf(key);
  if (!def) return "default";
  if (overrides.has(key)) return "custom";
  const env = process.env[key];
  if (env !== undefined && env.trim() !== "" && (def.kind === "text" || parseNumber(def, env) !== null)) return "env";
  return "default";
}

export function getNumberSetting(key: string): number {
  const def = defOf(key);
  if (!def || def.kind !== "number") throw new Error(`Unknown number setting ${key}`);
  return parseNumber(def, overrides.get(key)) ?? parseNumber(def, process.env[key]) ?? (def.default as number);
}

export function getTextSetting(key: string): string {
  const def = defOf(key);
  if (!def || def.kind !== "text") throw new Error(`Unknown text setting ${key}`);
  return overrides.get(key) ?? process.env[key]?.trim() ?? (def.default as string);
}

export function listSettings() {
  return SETTING_DEFS.map((d) => ({
    key: d.key,
    label: d.label,
    help: d.help,
    kind: d.kind,
    unit: d.unit ?? null,
    min: d.min ?? null,
    max: d.max ?? null,
    default: d.default,
    source: settingSource(d.key),
    value: d.kind === "number" ? getNumberSetting(d.key) : getTextSetting(d.key),
  }));
}

export async function saveSetting(key: string, raw: unknown, by: string) {
  const def = defOf(key);
  if (!def) throw AppErrors.notFound("Unknown setting");
  let value: string;
  if (def.kind === "number") {
    const n = typeof raw === "number" ? raw : Number(String(raw ?? "").trim());
    if (String(raw ?? "").trim() === "" || !Number.isFinite(n)) throw AppErrors.validation(`${def.label}: enter a number`);
    if (def.integer && !Number.isInteger(n)) throw AppErrors.validation(`${def.label}: use a whole number`);
    if (def.min !== undefined && n < def.min) throw AppErrors.validation(`${def.label}: can't be below ${def.min}`);
    if (def.max !== undefined && n > def.max) throw AppErrors.validation(`${def.label}: can't be above ${def.max}`);
    value = String(n);
  } else {
    const list = String(raw ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    const bad = list.find((e) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
    if (bad) throw AppErrors.validation(`"${bad}" isn't a valid email address`);
    value = list.join(",");
  }
  await db
    .insert(appSettings)
    .values({ key, value, updatedBy: by })
    .onConflictDoUpdate({ target: appSettings.key, set: { value, updatedAt: new Date(), updatedBy: by } });
  overrides.set(key, value);
  return listSettings().find((s) => s.key === key)!;
}

export async function resetSetting(key: string) {
  if (!defOf(key)) throw AppErrors.notFound("Unknown setting");
  await db.delete(appSettings).where(eq(appSettings.key, key));
  overrides.delete(key);
  return listSettings().find((s) => s.key === key)!;
}
