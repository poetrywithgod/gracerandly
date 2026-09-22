// SMS provider abstraction for OTP delivery.
//
// Only a console-logging implementation exists so far — there's no
// SMS_PROVIDER integration wired up yet (no Termii/Africa's Talking/Twilio
// credentials configured). Swap the exported `smsProvider` for a real
// implementation of the SmsProvider interface once one is.

export interface SmsProvider {
  send(to: string, message: string): Promise<void>;
}

class ConsoleSmsProvider implements SmsProvider {
  async send(to: string, message: string): Promise<void> {
    // eslint-disable-next-line no-console
    console.log(`[sms:dev] to=${to} message="${message}"`);
  }
}

function resolveSmsProvider(): SmsProvider {
  const configured = process.env.SMS_PROVIDER ?? "console";
  switch (configured) {
    case "console":
      return new ConsoleSmsProvider();
    default:
      throw new Error(
        `Unknown SMS_PROVIDER "${configured}" — only "console" is implemented so far. ` +
          "Add a real provider implementation in apps/api/src/lib/sms.ts before configuring another value."
      );
  }
}

export const smsProvider: SmsProvider = resolveSmsProvider();
