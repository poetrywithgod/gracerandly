/**
 * CSV downloads for the admin dashboard (refunds, tickets, runners, requesters,
 * disputes, payouts). Spreadsheet-safe: cells that start with = + - @ are
 * prefixed so Excel never runs them as formulas. Runner exports leave out
 * NIN, BVN and bank account numbers on purpose.
 */
import { sql } from "drizzle-orm";
import { db } from "../db/client";
import { AppErrors } from "./errors";
import type { AdminRole } from "./admin-auth";

export const EXPORT_KINDS = ["refunds", "tickets", "runners", "requesters", "disputes", "payouts"] as const;
export type ExportKind = (typeof EXPORT_KINDS)[number];

/** Who may download what. */
export const EXPORT_ROLES: Record<ExportKind, AdminRole[]> = {
  refunds: ["owner", "finance"],
  payouts: ["owner", "finance"],
  disputes: ["owner", "finance", "support"],
  tickets: ["owner", "support"],
  runners: ["owner", "support"],
  requesters: ["owner", "support"],
};

function cell(v: unknown): string {
  if (v === null || v === undefined) return "";
  let s = v instanceof Date ? v.toISOString() : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(headers: string[], rows: unknown[][]): string {
  return [headers, ...rows].map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}

async function q(query: ReturnType<typeof sql>): Promise<any[]> {
  return Array.from((await db.execute(query)) as unknown as any[]);
}

export async function buildExport(kind: string): Promise<{ filename: string; csv: string }> {
  const day = new Date().toISOString().slice(0, 10);
  const name = (k: string) => `gracerandly-${k}-${day}.csv`;
  switch (kind as ExportKind) {
    case "refunds": {
      const r = await q(sql`select created_at, id, errand_id, requester_id, amount, reason::text reason, status::text status, note, failure_reason from refunds order by created_at desc limit 20000`);
      return { filename: name(kind), csv: toCsv(["Created", "Refund id", "Errand id", "Requester id", "Amount (NGN)", "Reason", "Status", "Note", "Failure reason"], r.map((x) => [x.created_at, x.id, x.errand_id, x.requester_id, x.amount, x.reason, x.status, x.note, x.failure_reason])) };
    }
    case "tickets": {
      const r = await q(sql`select created_at, updated_at, id, user_role::text role, category::text category, status::text status, subject, errand_id from support_tickets order by created_at desc limit 20000`);
      return { filename: name(kind), csv: toCsv(["Created", "Updated", "Ticket id", "From", "Category", "Status", "Subject", "Errand id"], r.map((x) => [x.created_at, x.updated_at, x.id, x.role, x.category, x.status, x.subject, x.errand_id])) };
    }
    case "runners": {
      const r = await q(sql`select r.created_at, r.id, r.full_name, r.phone, r.email, r.verification_status::text verification, r.trust_tier_level::text tier, r.is_online, r.suspended_at, r.bank_account_verified,
          (select count(*) from errands e where e.runner_id = r.id and e.status = 'delivered') delivered,
          (select round(avg(rating)::numeric, 2) from errand_reviews v where v.reviewee_id = r.id and v.reviewer_role = 'requester') rating
        from runners r order by r.created_at desc limit 20000`);
      return { filename: name(kind), csv: toCsv(["Joined", "Runner id", "Name", "Phone", "Email", "Identity", "Tier", "Online", "Suspended", "Payout account verified", "Deliveries", "Average rating"], r.map((x) => [x.created_at, x.id, x.full_name, x.phone, x.email, x.verification, x.tier, x.is_online ? "yes" : "no", x.suspended_at ? "yes" : "no", x.bank_account_verified ? "yes" : "no", x.delivered, x.rating])) };
    }
    case "requesters": {
      const r = await q(sql`select r.created_at, r.id, r.full_name, r.phone, r.email, r.suspended_at,
          (select count(*) from errands e where e.requester_id = r.id) errands,
          (select count(*) from errands e where e.requester_id = r.id and e.status = 'delivered') delivered
        from requesters r order by r.created_at desc limit 20000`);
      return { filename: name(kind), csv: toCsv(["Joined", "Requester id", "Name", "Phone", "Email", "Suspended", "Errands posted", "Errands delivered"], r.map((x) => [x.created_at, x.id, x.full_name, x.phone, x.email, x.suspended_at ? "yes" : "no", x.errands, x.delivered])) };
    }
    case "disputes": {
      const r = await q(sql`select d.created_at, d.resolved_at, d.id, d.errand_id, d.reason::text reason, d.status::text status, d.outcome::text outcome, d.refund_amount, d.runner_deduction, d.description, d.staff_note from disputes d order by d.created_at desc limit 20000`);
      return { filename: name(kind), csv: toCsv(["Reported", "Decided", "Dispute id", "Errand id", "Reason", "Status", "Outcome", "Refund (NGN)", "Taken from runner (NGN)", "What the requester said", "Staff note"], r.map((x) => [x.created_at, x.resolved_at, x.id, x.errand_id, x.reason, x.status, x.outcome, x.refund_amount, x.runner_deduction, x.description, x.staff_note])) };
    }
    case "payouts": {
      const r = await q(sql`select p.created_at, p.completed_at, p.id, p.runner_id, r.full_name, p.amount, p.status::text status, p.failure_reason, p.provider_reference from runner_payouts p join runners r on r.id = p.runner_id order by p.created_at desc limit 20000`);
      return { filename: name(kind), csv: toCsv(["Created", "Completed", "Payout id", "Runner id", "Runner", "Amount (NGN)", "Status", "Failure reason", "Paystack reference"], r.map((x) => [x.created_at, x.completed_at, x.id, x.runner_id, x.full_name, x.amount, x.status, x.failure_reason, x.provider_reference])) };
    }
    default:
      throw AppErrors.notFound("Unknown export");
  }
}
