// SMS provider abstraction for OTP delivery.
//
// SMS_PROVIDER=console (default) just logs the message. SMS_PROVIDER=termii
// sends real texts through Termii (needs TERMII_API_KEY and TERMII_SENDER_ID,
// see .env.example).

export interface SmsProvider {
  send(to: string, message: string): Promise<void>;
}

class ConsoleSmsProvider implements SmsProvider {
  async send(to: string, message: string): Promise<void> {
    // eslint-disable-next-line no-console
    console.log(`[sms:dev] to=${to} message="${message}"`);
  }
}

class TermiiSmsProvider implements SmsProvider {
  private readonly apiKey: string;
  private readonly senderId: string;
  private readonly baseUrl: string;
  private readonly channel: string;

  constructor() {
    const apiKey = process.env.TERMII_API_KEY?.trim();
    const senderId = process.env.TERMII_SENDER_ID?.trim();
    if (!apiKey) throw new Error('SMS_PROVIDER="termii" needs TERMII_API_KEY to be set.');
    if (!senderId) throw new Error('SMS_PROVIDER="termii" needs TERMII_SENDER_ID to be set.');
    this.apiKey = apiKey;
    this.senderId = senderId;
    this.baseUrl = (process.env.TERMII_BASE_URL?.trim() || "https://api.ng.termii.com").replace(/\/+$/, "");
    this.channel = process.env.TERMII_CHANNEL?.trim() || "generic";
  }

  async send(to: string, message: string): Promise<void> {
    // Termii wants the number in international format without the "+".
    const destination = to.replace(/[^\d]/g, "");
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/api/sms/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: this.apiKey,
          to: destination,
          from: this.senderId,
          sms: message,
          type: "plain",
          channel: this.channel,
        }),
        signal: AbortSignal.timeout(15_000),
      });
    } catch (err) {
      throw new Error(`Termii request failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    const body = (await res.json().catch(() => ({}))) as { code?: string; message?: string };
    if (!res.ok || (body.code !== undefined && body.code !== "ok")) {
      // Never log the api key or the message text (it contains the OTP).
      throw new Error(`Termii rejected the SMS (HTTP ${res.status}): ${body.message ?? "no message"}`);
    }
  }
}

function resolveSmsProvider(): SmsProvider {
  const configured = process.env.SMS_PROVIDER ?? "console";
  switch (configured) {
    case "console":
      return new ConsoleSmsProvider();
    case "termii":
      return new TermiiSmsProvider();
    default:
      throw new Error(`Unknown SMS_PROVIDER "${configured}" — use "console" or "termii".`);
  }
}

export const smsProvider: SmsProvider = resolveSmsProvider();
