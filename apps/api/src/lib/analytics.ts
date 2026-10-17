/**
 * Numbers for the staff dashboard (routes/admin.ts). Read-only, computed on
 * request straight from the tables — fine at this scale; if it ever gets
 * slow, cache the result for a minute.
 *
 * Days are cut at midnight Lagos time so "today" matches the team's day.
 * "Paid" means an escrow row that reached escrowed / released / disbursed.
 */
import { sql } from "drizzle-orm";
import { db } from "../db/client";

const TZ = "Africa/Lagos";
const PAID = sql`('escrowed','released','disbursed')`;

async function rows<T>(query: ReturnType<typeof sql>): Promise<T[]> {
  const result = await db.execute(query);
  return Array.from(result as unknown as T[]);
}
async function one<T>(query: ReturnType<typeof sql>): Promise<T> {
  return (await rows<T>(query))[0];
}
const num = (value: unknown) => Number(value ?? 0);

export interface AnalyticsSummary {
  days: number;
  generatedAt: string;
  users: { requesters: number; newRequesters: number; runners: number; newRunners: number; verifiedRunners: number };
  errands: {
    posted: number;
    delivered: number;
    cancelled: number;
    openNow: number;
    inProgressNow: number;
    /** delivered / (delivered + cancelled), 0..1, or null if neither happened. */
    completionRate: number | null;
    avgMinutesToDeliver: number | null;
    aiParsed: number;
    recurring: number;
    byCategory: { category: string; count: number }[];
  };
  money: {
    /** What requesters paid in: fee + items budget, after credit. */
    paidIn: number;
    /** Delivery fees only (what the commission is taken from). */
    feeVolume: number;
    commission: number;
    referralCreditGiven: number;
    runnerPayoutsSent: number;
    runnerPayoutsPending: number;
    avgFee: number | null;
  };
  referrals: { invited: number; qualified: number; rewardsIssued: number; rewardsUsedNaira: number; rewardsOutstandingNaira: number };
  support: { open: number; awaitingUser: number; newInPeriod: number; resolvedInPeriod: number };
  daily: { day: string; posted: number; delivered: number; paidIn: number; newUsers: number }[];
  topRunners: { name: string; tier: string; delivered: number }[];
}

export async function getAnalytics(daysInput: number): Promise<AnalyticsSummary> {
  const days = Math.min(Math.max(Math.floor(daysInput) || 30, 1), 365);
  const since = sql`(date_trunc('day', now() AT TIME ZONE ${TZ}::text) - make_interval(days => ${days - 1}::int)) AT TIME ZONE ${TZ}::text`;

  const [reqU, runU, errs, cats, money, payouts, refs, rewards, supp, daily, top] = await Promise.all([
    one<any>(sql`select count(*) total, count(*) filter (where created_at >= ${since}) fresh from requesters`),
    one<any>(sql`select count(*) total, count(*) filter (where created_at >= ${since}) fresh, count(*) filter (where identity_verified) verified from runners`),
    one<any>(sql`select
        count(*) filter (where created_at >= ${since}) posted,
        count(*) filter (where status = 'delivered' and updated_at >= ${since}) delivered,
        count(*) filter (where status = 'cancelled' and updated_at >= ${since}) cancelled,
        count(*) filter (where status = 'pending_match') open_now,
        count(*) filter (where status in ('accepted','en_route_to_pickup','in_progress','en_route_to_delivery')) in_progress_now,
        avg(extract(epoch from (updated_at - created_at)) / 60) filter (where status = 'delivered' and updated_at >= ${since}) avg_min,
        count(*) filter (where created_at >= ${since} and ai_parsed) ai_parsed,
        count(*) filter (where created_at >= ${since} and recurring_id is not null) recurring
      from errands`),
    rows<any>(sql`select category::text category, count(*) count from errands where created_at >= ${since} group by 1 order by 2 desc`),
    one<any>(sql`select
        coalesce(sum(amount + items_budget - credit_applied), 0) paid_in,
        coalesce(sum(amount), 0) fee_volume,
        coalesce(sum(commission_amount) filter (where status in ('released','disbursed')), 0) commission,
        coalesce(sum(credit_applied), 0) credit,
        avg(amount) avg_fee
      from escrow_transactions where status in ${PAID} and created_at >= ${since}`),
    one<any>(sql`select
        coalesce(sum(amount) filter (where status = 'success' and created_at >= ${since}), 0) sent,
        coalesce(sum(amount) filter (where status = 'pending'), 0) pending
      from runner_payouts`),
    one<any>(sql`select count(*) invited, count(*) filter (where status = 'qualified') qualified from referrals where created_at >= ${since}`),
    one<any>(sql`select
        coalesce(sum(amount) filter (where created_at >= ${since}), 0) issued,
        coalesce(sum(amount) filter (where status = 'used' and used_at >= ${since}), 0) used,
        coalesce(sum(amount) filter (where status in ('available','reserved')), 0) outstanding
      from referral_rewards`),
    one<any>(sql`select
        count(*) filter (where status = 'open') open,
        count(*) filter (where status = 'awaiting_user') awaiting,
        count(*) filter (where created_at >= ${since}) fresh,
        count(*) filter (where resolved_at >= ${since}) resolved
      from support_tickets`),
    rows<any>(sql`with d as (
        select generate_series(
          date_trunc('day', now() AT TIME ZONE ${TZ}::text) - make_interval(days => ${days - 1}::int),
          date_trunc('day', now() AT TIME ZONE ${TZ}::text), interval '1 day') as day)
      select to_char(d.day, 'YYYY-MM-DD') as day,
        (select count(*) from errands e where date_trunc('day', e.created_at AT TIME ZONE ${TZ}::text) = d.day) posted,
        (select count(*) from errands e where e.status = 'delivered' and date_trunc('day', e.updated_at AT TIME ZONE ${TZ}::text) = d.day) delivered,
        (select coalesce(sum(t.amount + t.items_budget - t.credit_applied), 0) from escrow_transactions t where t.status in ${PAID} and date_trunc('day', t.created_at AT TIME ZONE ${TZ}::text) = d.day) paid_in,
        (select count(*) from requesters r where date_trunc('day', r.created_at AT TIME ZONE ${TZ}::text) = d.day)
          + (select count(*) from runners r where date_trunc('day', r.created_at AT TIME ZONE ${TZ}::text) = d.day) new_users
      from d order by d.day`),
    rows<any>(sql`select r.full_name name, r.trust_tier_level::text tier, count(*) delivered
      from errands e join runners r on r.id = e.runner_id
      where e.status = 'delivered' and e.updated_at >= ${since}
      group by r.id, r.full_name, r.trust_tier_level order by 3 desc limit 10`),
  ]);

  const delivered = num(errs.delivered);
  const cancelled = num(errs.cancelled);
  return {
    days,
    generatedAt: new Date().toISOString(),
    users: {
      requesters: num(reqU.total),
      newRequesters: num(reqU.fresh),
      runners: num(runU.total),
      newRunners: num(runU.fresh),
      verifiedRunners: num(runU.verified),
    },
    errands: {
      posted: num(errs.posted),
      delivered,
      cancelled,
      openNow: num(errs.open_now),
      inProgressNow: num(errs.in_progress_now),
      completionRate: delivered + cancelled > 0 ? delivered / (delivered + cancelled) : null,
      avgMinutesToDeliver: errs.avg_min === null ? null : Math.round(num(errs.avg_min)),
      aiParsed: num(errs.ai_parsed),
      recurring: num(errs.recurring),
      byCategory: cats.map((c) => ({ category: c.category, count: num(c.count) })),
    },
    money: {
      paidIn: num(money.paid_in),
      feeVolume: num(money.fee_volume),
      commission: num(money.commission),
      referralCreditGiven: num(money.credit),
      runnerPayoutsSent: num(payouts.sent),
      runnerPayoutsPending: num(payouts.pending),
      avgFee: money.avg_fee === null ? null : Math.round(num(money.avg_fee)),
    },
    referrals: {
      invited: num(refs.invited),
      qualified: num(refs.qualified),
      rewardsIssued: num(rewards.issued),
      rewardsUsedNaira: num(rewards.used),
      rewardsOutstandingNaira: num(rewards.outstanding),
    },
    support: { open: num(supp.open), awaitingUser: num(supp.awaiting), newInPeriod: num(supp.fresh), resolvedInPeriod: num(supp.resolved) },
    daily: daily.map((d) => ({ day: d.day, posted: num(d.posted), delivered: num(d.delivered), paidIn: num(d.paid_in), newUsers: num(d.new_users) })),
    topRunners: top.map((t) => ({ name: t.name, tier: t.tier, delivered: num(t.delivered) })),
  };
}

/** One row per day as CSV, for a spreadsheet. */
export function dailyCsv(summary: AnalyticsSummary): string {
  const lines = ["day,errands_posted,errands_delivered,paid_in_naira,new_users"];
  for (const d of summary.daily) lines.push(`${d.day},${d.posted},${d.delivered},${d.paidIn},${d.newUsers}`);
  return lines.join("\n") + "\n";
}
