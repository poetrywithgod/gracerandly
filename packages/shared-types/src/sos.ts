// An SOS / panic alert raised by either party on an active errand.
//
// Deliberately NOT relayed to the other party on the errand — if the person
// who feels unsafe is unsafe *because of* the other party, alerting them
// would make things worse. Alerts go to Gracerandly's own safety contacts
// instead (see apps/api's lib/sos.ts and its SOS_ALERT_PHONES setting), and
// are stored so an admin dashboard can pick them up later.
export type SosStatus = "active" | "resolved";

export interface SosAlert {
  id: string;
  errandId: string;
  triggeredByRole: "requester" | "runner";
  triggeredById: string;
  /** Last known position of the person who triggered it — refreshed if
   * they press the button again while the alert is still active. */
  location: { lat: number; lng: number };
  status: SosStatus;
  /** How many safety contacts the alert was actually delivered to. Zero
   * means it was recorded but nobody was reached (no contacts configured,
   * or SMS is still on the dev console provider) — the app uses this to
   * avoid telling someone "help is coming" when it isn't. */
  notifiedCount: number;
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string;
}
