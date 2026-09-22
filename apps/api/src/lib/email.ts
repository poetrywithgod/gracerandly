// Email provider abstraction for verification codes.
//
// Only a console-logging implementation exists so far — there's no
// EMAIL_PROVIDER integration wired up yet (no Resend/SendGrid/SES
// credentials configured). Swap the exported `emailProvider` for a real
// implementation of the EmailProvider interface once one is.

export interface EmailProvider {
  send(to: string, subject: string, body: string): Promise<void>;
}

class ConsoleEmailProvider implements EmailProvider {
  async send(to: string, subject: string, body: string): Promise<void> {
    // eslint-disable-next-line no-console
    console.log(`[email:dev] to=${to} subject="${subject}"\n${body}`);
  }
}

function resolveEmailProvider(): EmailProvider {
  const configured = process.env.EMAIL_PROVIDER ?? "console";
  switch (configured) {
    case "console":
      return new ConsoleEmailProvider();
    default:
      throw new Error(
        `Unknown EMAIL_PROVIDER "${configured}" — only "console" is implemented so far. ` +
          "Add a real provider implementation in apps/api/src/lib/email.ts before configuring another value."
      );
  }
}

export const emailProvider: EmailProvider = resolveEmailProvider();
