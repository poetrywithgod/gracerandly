// Email provider abstraction for verification codes.
//
// EMAIL_PROVIDER=console (default) just logs the message. EMAIL_PROVIDER=resend
// sends real email through Resend (needs RESEND_API_KEY and EMAIL_FROM, see
// .env.example).

export interface EmailProvider {
  send(to: string, subject: string, body: string): Promise<void>;
}

class ConsoleEmailProvider implements EmailProvider {
  async send(to: string, subject: string, body: string): Promise<void> {
    // eslint-disable-next-line no-console
    console.log(`[email:dev] to=${to} subject="${subject}"\n${body}`);
  }
}

class ResendEmailProvider implements EmailProvider {
  private readonly apiKey: string;
  private readonly from: string;

  constructor() {
    const apiKey = process.env.RESEND_API_KEY?.trim();
    // Resend's shared test sender only delivers to the account owner's own
    // address; real users need a sender on a domain verified in Resend.
    const from = process.env.EMAIL_FROM?.trim() || "Gracerandly <onboarding@resend.dev>";
    if (!apiKey) throw new Error('EMAIL_PROVIDER="resend" needs RESEND_API_KEY to be set.');
    this.apiKey = apiKey;
    this.from = from;
  }

  async send(to: string, subject: string, body: string): Promise<void> {
    const baseUrl = (process.env.RESEND_BASE_URL?.trim() || "https://api.resend.com").replace(/\/+$/, "");
    let res: Response;
    try {
      res = await fetch(`${baseUrl}/emails`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.apiKey}` },
        body: JSON.stringify({ from: this.from, to: [to], subject, text: body }),
        signal: AbortSignal.timeout(15_000),
      });
    } catch (err) {
      throw new Error(`Resend request failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    if (!res.ok) {
      const detail = (await res.json().catch(() => ({}))) as { message?: string };
      // Never log the api key or the message text (it contains the OTP).
      throw new Error(`Resend rejected the email (HTTP ${res.status}): ${detail.message ?? "no message"}`);
    }
  }
}

function resolveEmailProvider(): EmailProvider {
  const configured = process.env.EMAIL_PROVIDER ?? "console";
  switch (configured) {
    case "console":
      return new ConsoleEmailProvider();
    case "resend":
      return new ResendEmailProvider();
    default:
      throw new Error(`Unknown EMAIL_PROVIDER "${configured}" — use "console" or "resend".`);
  }
}

export const emailProvider: EmailProvider = resolveEmailProvider();
