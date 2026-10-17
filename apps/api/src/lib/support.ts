/**
 * Support tickets: a requester or runner opens a ticket (optionally about one
 * of their errands), staff reply from the admin page, and the user gets a
 * push when staff answer. Shared by the requester routes, the runner routes
 * and the admin routes (routes/support.ts, routes/admin.ts).
 */
import { and, asc, desc, eq, inArray, or } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client";
import { errands, supportMessages, supportTickets } from "../db/schema";
import { AppErrors } from "./errors";
import { emailProvider } from "./email";
import { sendPushToUser } from "./push";

export type SupportRole = "requester" | "runner";
export const SUPPORT_CATEGORIES = ["payment", "errand_problem", "other_person", "account", "safety", "other"] as const;
export const SUPPORT_STATUSES = ["open", "awaiting_user", "resolved", "closed"] as const;

export const createTicketSchema = z.object({
  category: z.enum(SUPPORT_CATEGORIES),
  subject: z.string().trim().min(3, "Add a short subject").max(120),
  message: z.string().trim().min(5, "Tell us a bit more").max(4000),
  errandId: z.uuid().optional(),
});
export const replySchema = z.object({ body: z.string().trim().min(1, "Write a message").max(4000) });

type TicketRow = typeof supportTickets.$inferSelect;
type MessageRow = typeof supportMessages.$inferSelect;

export function toTicket(row: TicketRow) {
  return {
    id: row.id,
    category: row.category,
    subject: row.subject,
    status: row.status,
    errandId: row.errandId ?? undefined,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toMessage(row: MessageRow) {
  return { id: row.id, sender: row.sender, body: row.body, createdAt: row.createdAt.toISOString() };
}

async function loadOwnTicket(role: SupportRole, userId: string, id: unknown): Promise<TicketRow> {
  const parsed = z.uuid().safeParse(id);
  if (!parsed.success) throw AppErrors.notFound("Ticket not found");
  const [ticket] = await db
    .select()
    .from(supportTickets)
    .where(and(eq(supportTickets.id, parsed.data), eq(supportTickets.userRole, role), eq(supportTickets.userId, userId)))
    .limit(1);
  if (!ticket) throw AppErrors.notFound("Ticket not found");
  return ticket;
}

function supportInbox(): string[] {
  return (process.env.SUPPORT_EMAILS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

export async function createTicket(role: SupportRole, userId: string, input: z.infer<typeof createTicketSchema>) {
  if (input.errandId) {
    // Only your own errands can be attached.
    const [errand] = await db
      .select({ id: errands.id })
      .from(errands)
      .where(
        and(
          eq(errands.id, input.errandId),
          role === "requester" ? eq(errands.requesterId, userId) : eq(errands.runnerId, userId)
        )
      )
      .limit(1);
    if (!errand) throw AppErrors.validation("That errand isn't yours", { errandId: "That errand isn't yours" });
  }

  const ticket = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(supportTickets)
      .values({
        userRole: role,
        userId,
        errandId: input.errandId ?? null,
        category: input.category,
        subject: input.subject,
      })
      .returning();
    await tx.insert(supportMessages).values({ ticketId: row.id, sender: role, body: input.message });
    return row;
  });

  // Tell the team (best effort — the ticket is saved either way).
  const inbox = supportInbox();
  if (inbox.length > 0) {
    const text = `New ${input.category} ticket from a ${role}\n\n${input.subject}\n\n${input.message}\n\nTicket: ${ticket.id}${
      input.errandId ? `\nErrand: ${input.errandId}` : ""
    }`;
    for (const to of inbox) {
      void emailProvider.send(to, `[Gracerandly support] ${input.subject}`, text).catch((err) => {
        console.error("[support] notify email failed", err);
      });
    }
  }
  return ticket;
}

export async function listTickets(role: SupportRole, userId: string) {
  const rows = await db
    .select()
    .from(supportTickets)
    .where(and(eq(supportTickets.userRole, role), eq(supportTickets.userId, userId)))
    .orderBy(desc(supportTickets.updatedAt))
    .limit(100);
  return rows.map(toTicket);
}

export async function getThread(role: SupportRole, userId: string, id: unknown) {
  const ticket = await loadOwnTicket(role, userId, id);
  const messages = await db
    .select()
    .from(supportMessages)
    .where(eq(supportMessages.ticketId, ticket.id))
    .orderBy(asc(supportMessages.createdAt));
  return { ticket: toTicket(ticket), messages: messages.map(toMessage) };
}

/** A user's reply. A resolved ticket reopens; a closed one doesn't. */
export async function userReply(role: SupportRole, userId: string, id: unknown, body: string) {
  const ticket = await loadOwnTicket(role, userId, id);
  if (ticket.status === "closed") throw AppErrors.conflict("This ticket is closed — please open a new one");
  const [message] = await db.insert(supportMessages).values({ ticketId: ticket.id, sender: role, body }).returning();
  await db
    .update(supportTickets)
    .set({ status: "open", updatedAt: new Date(), resolvedAt: null })
    .where(eq(supportTickets.id, ticket.id));
  return toMessage(message);
}

// ---- staff side ----

export async function adminList(status?: string) {
  const filter = SUPPORT_STATUSES.includes(status as never)
    ? eq(supportTickets.status, status as (typeof SUPPORT_STATUSES)[number])
    : or(eq(supportTickets.status, "open"), eq(supportTickets.status, "awaiting_user"));
  const rows = await db.select().from(supportTickets).where(filter).orderBy(desc(supportTickets.updatedAt)).limit(200);
  return rows.map((row) => ({ ...toTicket(row), userRole: row.userRole, userId: row.userId }));
}

export async function adminGet(id: unknown) {
  const parsed = z.uuid().safeParse(id);
  if (!parsed.success) throw AppErrors.notFound("Ticket not found");
  const [ticket] = await db.select().from(supportTickets).where(eq(supportTickets.id, parsed.data)).limit(1);
  if (!ticket) throw AppErrors.notFound("Ticket not found");
  const messages = await db
    .select()
    .from(supportMessages)
    .where(eq(supportMessages.ticketId, ticket.id))
    .orderBy(asc(supportMessages.createdAt));
  return { ticket: { ...toTicket(ticket), userRole: ticket.userRole, userId: ticket.userId }, messages: messages.map(toMessage) };
}

export async function adminReply(id: unknown, body: string) {
  const { ticket } = await adminGet(id);
  const [message] = await db.insert(supportMessages).values({ ticketId: ticket.id, sender: "staff", body }).returning();
  await db
    .update(supportTickets)
    .set({ status: "awaiting_user", updatedAt: new Date() })
    .where(and(eq(supportTickets.id, ticket.id), inArray(supportTickets.status, ["open", "awaiting_user", "resolved"])));
  void sendPushToUser(ticket.userRole, ticket.userId, {
    title: "Gracerandly support replied",
    body: body.length > 120 ? `${body.slice(0, 117)}…` : body,
    data: { type: "support_reply", ticketId: ticket.id },
    channelId: "errands",
    ttl: 7 * 24 * 3600,
  });
  return toMessage(message);
}

export async function adminSetStatus(id: unknown, status: (typeof SUPPORT_STATUSES)[number]) {
  const { ticket } = await adminGet(id);
  await db
    .update(supportTickets)
    .set({
      status,
      updatedAt: new Date(),
      resolvedAt: status === "resolved" || status === "closed" ? new Date() : null,
    })
    .where(eq(supportTickets.id, ticket.id));
  return { ...ticket, status };
}
