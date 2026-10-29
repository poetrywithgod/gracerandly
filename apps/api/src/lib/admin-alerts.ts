/**
 * Emails to staff when something needs a person: a refund or payout failed, a
 * requester reported a problem, a runner is waiting for identity review.
 * (SOS has its own, faster path with texts too: lib/sos.ts.)
 *
 * Goes to the "Alert emails" setting (Settings page), else SUPPORT_EMAILS.
 * Quiet by design: at most one email per kind every 10 minutes. Anything that
 * happens in between is counted and mentioned in the next one, so a Paystack
 * outage failing 40 refunds sends one email, not 40. A failed email never
 * breaks the thing that triggered it.
 */
import { emailProvider } from "./email";
import { getTextSetting } from "./settings";

const QUIET_MS = 10 * 60 * 1000;
const state = new Map<string, { last: number; held: number }>();

export function alertRecipients(): string[] {
  const raw = getTextSetting("ADMIN_ALERT_EMAILS") || process.env.SUPPORT_EMAILS || "";
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

export async function alertStaff(kind: string, subject: string, body: string): Promise<void> {
  try {
    const to = alertRecipients();
    if (!to.length) return;
    const now = Date.now();
    const s = state.get(kind) ?? { last: 0, held: 0 };
    if (now - s.last < QUIET_MS) {
      state.set(kind, { ...s, held: s.held + 1 });
      return;
    }
    state.set(kind, { last: now, held: 0 });
    const more = s.held > 0 ? `\n\n(${s.held} more of these happened since the last alert. Open the dashboard to see them all.)` : "";
    const text = `${body}${more}\n\nOpen the admin dashboard: ${process.env.PUBLIC_API_URL?.trim() || "https://gracerandly.onrender.com"}/admin`;
    await Promise.allSettled(to.map((email) => emailProvider.send(email, `[Gracerandly] ${subject}`, text)));
  } catch (err) {
    console.error("[admin-alerts] failed", kind, err instanceof Error ? err.message : err);
  }
}

/** For the Settings page's "send a test": ignores the quiet period. */
export async function sendTestAlert(): Promise<number> {
  const to = alertRecipients();
  await Promise.all(
    to.map((email) =>
      emailProvider.send(email, "[Gracerandly] Test alert", "This is a test. If you can read this, alert emails from the Gracerandly admin dashboard reach you.")
    )
  );
  return to.length;
}
