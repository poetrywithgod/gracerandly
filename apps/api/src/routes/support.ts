import { Router } from "express";
import { asyncHandler } from "../lib/asyncHandler";
import { requireAuth, requireRunnerAuth } from "../middleware/requireAuth";
import {
  createTicket,
  createTicketSchema,
  getThread,
  listTickets,
  replySchema,
  toTicket,
  userReply,
  type SupportRole,
} from "../lib/support";

// The same five endpoints for both apps. Mounted at /support (requesters) and
// /runners/support (runners, in routes/runners.ts's neighbour in server.ts).
function buildRouter(role: SupportRole): Router {
  const router: Router = Router();
  router.use(role === "requester" ? requireAuth : requireRunnerAuth);
  const who = (req: Express.Request) => (role === "requester" ? req.requesterId! : req.runnerId!);

  router.get(
    "/tickets",
    asyncHandler(async (req, res) => {
      res.json({ tickets: await listTickets(role, who(req)) });
    })
  );

  router.post(
    "/tickets",
    asyncHandler(async (req, res) => {
      const input = createTicketSchema.parse(req.body);
      const ticket = await createTicket(role, who(req), input);
      res.status(201).json({ ticket: toTicket(ticket) });
    })
  );

  router.get(
    "/tickets/:id",
    asyncHandler(async (req, res) => {
      res.json(await getThread(role, who(req), req.params.id));
    })
  );

  router.post(
    "/tickets/:id/messages",
    asyncHandler(async (req, res) => {
      const { body } = replySchema.parse(req.body);
      res.status(201).json({ message: await userReply(role, who(req), req.params.id, body) });
    })
  );

  return router;
}

export const requesterSupportRouter: Router = buildRouter("requester");
export const runnerSupportRouter: Router = buildRouter("runner");
