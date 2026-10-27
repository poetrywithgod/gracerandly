/**
 * Extra numbers for the staff dashboard's charts (routes/admin.ts), on top of
 * lib/analytics.ts: comparisons with the previous period, demand by weekday
 * and hour, status/payment/refund mixes, ratings, SOS, the "needs attention"
 * list and the latest errands. Read-only; same Lagos-midnight day boundaries
 * and the same meaning of "paid" as analytics.ts.
 */
import { sql } from "drizzle-orm";
import { db } from "../db/client";

const TZ = "Africa/Lagos";
const PAID = sql`('escrowed','released','disbursed')`;
const LONG_WAIT_MINUTES = 15;

async function rows<T>(query: ReturnType<typeof sql>): Promise<T[]> {
  const result = await db.execute(query);
  return Array.from(result as unknown as T[]);
}
async function one<T>(query: ReturnType<typeof sql>): Promise<T> {
  return (await rows<T>(query))[0];
}
const num = (value: unknown) => Number(value ?? 0);

export interface Insights {
  days: number;
  /** The same measures for the period of equal length right before this one. */
  previous: { posted: number; delivered: number; cancelled: number; paidIn: number; commission: number; newUsers: number };
  /** Errands posted by weekday, Sunday first (Lagos time). */
  weekday: number[];
  /** Errands posted by weekday (0 = Sunday) and hour of day (0-23), Lagos time. */
  heatmap: { dow: number; hour: number; count: number }[];
  /** Errands posted in the period, by where they are now. */
  statusMix: { status: string; count: number }[];
  /** Payment attempts in the period, by outcome. */
  payments: { status: string; count: number }[];
  refunds: {
    byReason: { reason: string; count: number; amount: number }[];
    byStatus: { status: string; count: number }[];
  };
  tiers: { tier: string; count: number }[];
  /** Customers' ratings of runners in the period. distribution[0] is 1 star. */
  ratings: { average: number | null; count: number; distribution: number[] };
  support: { byCategory: { category: string; count: number }[]; byStatus: { status: string; count: number }[] };
  sos: { triggered: number; activeNow: number };
  /** People who were already signed up before the period began. */
  usersBefore: { requesters: number; runners: number };
  daily: {
    day: string;
    cancelled: number;
    commission: number;
    refunded: number;
    newRequesters: number;
    newRunners: number;
    avgMinutesToDeliver: number | null;
  }[];
  topRunners: { name: string; tier: string; delivered: number; earned: number; rating: number | null }[];
  attention: {
    pendingVerifications: number;
    failedRefunds: number;
    failedPayouts: number;
    activeSos: number;
    ticketsNeedingReply: number;
    longWaitingErrands: number;
    longWaitMinutes: number;
  };
  recentErrands: {
    id: string;
    category: string;
    status: string;
    fee: number;
    requester: string;
    runner: string | null;
    createdAt: string;
  }[];
}

export async function getInsights(daysInput: number): Promise<Insights> {
  const days = Math.min(Math.max(Math.floor(daysInput) || 30, 1), 365);
  const since = sql`(date_trunc('day', now() AT TIME ZONE ${TZ}::text) - make_interval(days => ${days - 1}::int)) AT TIME ZONE ${TZ}::text`;
  const prevSince = sql`((${since}) - make_interval(days => ${days}::int))`;
  const lagos = (col: ReturnType<typeof sql>) => sql`(${col} AT TIME ZONE ${TZ}::text)`;

  const [prev, weekday, heat, statusMix, payments, refundReason, refundStatus, tiers, ratings, suppCat, suppStatus, sos, before, daily, top, attention, recent] =
    await Promise.all([
      one<any>(sql`select
          (select count(*) from errands where created_at >= ${prevSince} and created_at < ${since}) posted,
          (select count(*) from errands where status = 'delivered' and updated_at >= ${prevSince} and updated_at < ${since}) delivered,
          (select count(*) from errands where status = 'cancelled' and updated_at >= ${prevSince} and updated_at < ${since}) cancelled,
          (select coalesce(sum(amount + items_budget - credit_applied), 0) from escrow_transactions
             where status in ${PAID} and created_at >= ${prevSince} and created_at < ${since}) paid_in,
          (select coalesce(sum(commission_amount) filter (where status in ('released','disbursed')), 0) from escrow_transactions
             where status in ${PAID} and created_at >= ${prevSince} and created_at < ${since}) commission,
          (select count(*) from requesters where created_at >= ${prevSince} and created_at < ${since})
            + (select count(*) from runners where created_at >= ${prevSince} and created_at < ${since}) new_users`),
      rows<any>(sql`select extract(dow from ${lagos(sql`created_at`)})::int dow, count(*) count
          from errands where created_at >= ${since} group by 1`),
      rows<any>(sql`select extract(dow from ${lagos(sql`created_at`)})::int dow,
            extract(hour from ${lagos(sql`created_at`)})::int as hr, count(*) count
          from errands where created_at >= ${since} group by 1, 2`),
      rows<any>(sql`select status::text status, count(*) count from errands where created_at >= ${since} group by 1`),
      rows<any>(sql`select status::text status, count(*) count from escrow_transactions where created_at >= ${since} group by 1`),
      rows<any>(sql`select reason::text reason, count(*) count, coalesce(sum(amount), 0) amount
          from refunds where created_at >= ${since} group by 1`),
      rows<any>(sql`select status::text status, count(*) count from refunds where created_at >= ${since} group by 1`),
      rows<any>(sql`select trust_tier_level::text tier, count(*) count from runners group by 1`),
      rows<any>(sql`select rating, count(*) count from errand_reviews
          where reviewer_role = 'requester' and created_at >= ${since} group by 1`),
      rows<any>(sql`select category::text category, count(*) count from support_tickets where created_at >= ${since} group by 1 order by 2 desc`),
      rows<any>(sql`select status::text status, count(*) count from support_tickets group by 1`),
      one<any>(sql`select
          count(*) filter (where created_at >= ${since}) triggered,
          count(*) filter (where status = 'active') active
        from sos_alerts`),
      one<any>(sql`select
          (select count(*) from requesters where created_at < ${since}) requesters,
          (select count(*) from runners where created_at < ${since}) runners`),
      rows<any>(sql`with d as (
          select generate_series(
            date_trunc('day', now() AT TIME ZONE ${TZ}::text) - make_interval(days => ${days - 1}::int),
            date_trunc('day', now() AT TIME ZONE ${TZ}::text), interval '1 day') as day)
        select to_char(d.day, 'YYYY-MM-DD') as day,
          (select count(*) from errands e where e.status = 'cancelled' and date_trunc('day', e.updated_at AT TIME ZONE ${TZ}::text) = d.day) cancelled,
          (select coalesce(sum(t.commission_amount), 0) from escrow_transactions t
             where t.status in ('released','disbursed') and date_trunc('day', t.created_at AT TIME ZONE ${TZ}::text) = d.day) commission,
          (select coalesce(sum(r.amount), 0) from refunds r
             where r.status <> 'failed' and date_trunc('day', r.created_at AT TIME ZONE ${TZ}::text) = d.day) refunded,
          (select count(*) from requesters r where date_trunc('day', r.created_at AT TIME ZONE ${TZ}::text) = d.day) new_requesters,
          (select count(*) from runners r where date_trunc('day', r.created_at AT TIME ZONE ${TZ}::text) = d.day) new_runners,
          (select avg(extract(epoch from (e.updated_at - e.created_at)) / 60) from errands e
             where e.status = 'delivered' and date_trunc('day', e.updated_at AT TIME ZONE ${TZ}::text) = d.day) avg_min
        from d order by d.day`),
      rows<any>(sql`select r.full_name name, r.trust_tier_level::text tier, count(*) delivered,
            coalesce((select sum(t.runner_payout) from escrow_transactions t
               where t.runner_id = r.id and t.status in ('released','disbursed') and t.created_at >= ${since}), 0) earned,
            (select avg(v.rating) from errand_reviews v
               where v.reviewee_id = r.id and v.reviewer_role = 'requester') rating
        from errands e join runners r on r.id = e.runner_id
        where e.status = 'delivered' and e.updated_at >= ${since}
        group by r.id, r.full_name, r.trust_tier_level order by 3 desc, 4 desc limit 6`),
      one<any>(sql`select
          (select count(*) from runners where verification_status = 'pending') pending_verifications,
          (select count(*) from refunds where status = 'failed') failed_refunds,
          (select count(*) from runner_payouts where status = 'failed') failed_payouts,
          (select count(*) from sos_alerts where status = 'active') active_sos,
          (select count(*) from support_tickets where status = 'open') open_tickets,
          (select count(*) from errands where status = 'pending_match'
             and created_at < now() - make_interval(mins => ${LONG_WAIT_MINUTES}::int)) long_waiting`),
      rows<any>(sql`select e.id, e.category::text category, e.status::text status, e.estimated_cost fee,
            rq.full_name requester, rn.full_name runner, e.created_at
        from errands e join requesters rq on rq.id = e.requester_id
        left join runners rn on rn.id = e.runner_id
        order by e.created_at desc limit 8`),
    ]);

  const weekdayCounts = [0, 0, 0, 0, 0, 0, 0];
  for (const w of weekday) weekdayCounts[num(w.dow)] = num(w.count);
  const distribution = [0, 0, 0, 0, 0];
  let ratingTotal = 0;
  let ratingCount = 0;
  for (const r of ratings) {
    const stars = num(r.rating);
    if (stars >= 1 && stars <= 5) {
      distribution[stars - 1] = num(r.count);
      ratingTotal += stars * num(r.count);
      ratingCount += num(r.count);
    }
  }

  return {
    days,
    previous: {
      posted: num(prev.posted),
      delivered: num(prev.delivered),
      cancelled: num(prev.cancelled),
      paidIn: num(prev.paid_in),
      commission: num(prev.commission),
      newUsers: num(prev.new_users),
    },
    weekday: weekdayCounts,
    heatmap: heat.map((h) => ({ dow: num(h.dow), hour: num(h.hr), count: num(h.count) })),
    statusMix: statusMix.map((s) => ({ status: s.status, count: num(s.count) })),
    payments: payments.map((p) => ({ status: p.status, count: num(p.count) })),
    refunds: {
      byReason: refundReason.map((r) => ({ reason: r.reason, count: num(r.count), amount: num(r.amount) })),
      byStatus: refundStatus.map((r) => ({ status: r.status, count: num(r.count) })),
    },
    tiers: tiers.map((t) => ({ tier: t.tier, count: num(t.count) })),
    ratings: { average: ratingCount ? Math.round((ratingTotal / ratingCount) * 10) / 10 : null, count: ratingCount, distribution },
    support: {
      byCategory: suppCat.map((c) => ({ category: c.category, count: num(c.count) })),
      byStatus: suppStatus.map((s) => ({ status: s.status, count: num(s.count) })),
    },
    sos: { triggered: num(sos.triggered), activeNow: num(sos.active) },
    usersBefore: { requesters: num(before.requesters), runners: num(before.runners) },
    daily: daily.map((d) => ({
      day: d.day,
      cancelled: num(d.cancelled),
      commission: num(d.commission),
      refunded: num(d.refunded),
      newRequesters: num(d.new_requesters),
      newRunners: num(d.new_runners),
      avgMinutesToDeliver: d.avg_min === null ? null : Math.round(num(d.avg_min)),
    })),
    topRunners: top.map((t) => ({
      name: t.name,
      tier: t.tier,
      delivered: num(t.delivered),
      earned: num(t.earned),
      rating: t.rating === null ? null : Math.round(num(t.rating) * 10) / 10,
    })),
    attention: {
      pendingVerifications: num(attention.pending_verifications),
      failedRefunds: num(attention.failed_refunds),
      failedPayouts: num(attention.failed_payouts),
      activeSos: num(attention.active_sos),
      ticketsNeedingReply: num(attention.open_tickets),
      longWaitingErrands: num(attention.long_waiting),
      longWaitMinutes: LONG_WAIT_MINUTES,
    },
    recentErrands: recent.map((e) => ({
      id: e.id,
      category: e.category,
      status: e.status,
      fee: num(e.fee),
      requester: e.requester,
      runner: e.runner ?? null,
      createdAt: new Date(e.created_at).toISOString(),
    })),
  };
}

export interface SearchResults {
  tickets: { id: string; subject: string; status: string }[];
  errands: { id: string; category: string; status: string; requester: string }[];
  people: { id: string; role: "requester" | "runner"; name: string; phone: string }[];
}

/** Small cross-table lookup for the top search box (at most 5 of each kind). */
export async function adminSearch(raw: string): Promise<SearchResults> {
  const q = raw.trim().slice(0, 60);
  if (q.length < 2) return { tickets: [], errands: [], people: [] };
  const like = `%${q.replace(/[\\%_]/g, (c) => "\\" + c)}%`;
  const idLike = `${q.replace(/[\\%_]/g, (c) => "\\" + c)}%`;
  const [tickets, errs, people] = await Promise.all([
    rows<any>(sql`select id, subject, status::text status from support_tickets
      where subject ilike ${like} or id::text ilike ${idLike} order by updated_at desc limit 5`),
    rows<any>(sql`select e.id, e.category::text category, e.status::text status, r.full_name requester
      from errands e join requesters r on r.id = e.requester_id
      where e.id::text ilike ${idLike} or r.full_name ilike ${like} order by e.created_at desc limit 5`),
    rows<any>(sql`(select id, 'requester' role, full_name name, phone from requesters where full_name ilike ${like} or phone ilike ${like} limit 5)
      union all (select id, 'runner' role, full_name name, phone from runners where full_name ilike ${like} or phone ilike ${like} limit 5)`),
  ]);
  return {
    tickets: tickets.map((t) => ({ id: t.id, subject: t.subject, status: t.status })),
    errands: errs.map((e) => ({ id: e.id, category: e.category, status: e.status, requester: e.requester })),
    people: people.slice(0, 8).map((p) => ({ id: p.id, role: p.role, name: p.name, phone: p.phone })),
  };
}
