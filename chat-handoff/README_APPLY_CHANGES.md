# Gracerandly — In-App Chat (WebSocket, WhatsApp-style delivery)

Requester ↔ runner chat over a real WebSocket. No permanent chat history
on the server — a message is stored only until the recipient's device
confirms it received it, then it's deleted. The actual, permanent chat
history lives only on each device's own local SQLite database.

## 1. Copy the new files

```
cp new_files/apps/api/drizzle/0010_boring_puck.sql ~/documents/gracerandly/apps/api/drizzle/
cp new_files/apps/api/drizzle/meta/0010_snapshot.json ~/documents/gracerandly/apps/api/drizzle/meta/
cp new_files/apps/api/src/lib/chat-server.ts ~/documents/gracerandly/apps/api/src/lib/
cp new_files/apps/runner/src/lib/chatDb.ts ~/documents/gracerandly/apps/runner/src/lib/
cp new_files/apps/runner/src/lib/chatSocket.ts ~/documents/gracerandly/apps/runner/src/lib/
cp new_files/apps/runner/src/screens/ChatScreen.tsx ~/documents/gracerandly/apps/runner/src/screens/
cp new_files/packages/shared-types/src/message.ts ~/documents/gracerandly/packages/shared-types/src/
```

## 2. Apply the patch

```
cd ~/documents/gracerandly
git apply /path/to/MODIFIED_FILES.patch
```

## 3. Install, migrate, type-check

```
pnpm install
pnpm -r type-check
pnpm --filter @gracerandly/api db:migrate
```

This patch *does* touch `pnpm-lock.yaml` this time — legitimately, since
it adds `ws` + `@types/ws` to the API and `expo-sqlite` to the Runner app.

## 4. No new `.env` variables, but one deploy detail worth knowing

Chat runs on the exact same HTTP server/port as the REST API — there's no
separate service or port to stand up, and no new environment variable.
The only thing worth checking: if you're ever behind a proxy/load balancer
in front of the API (not yet the case, but worth remembering for later),
it needs to support WebSocket upgrades on that same route
(`/ws/chat`) — most do by default, but it's the kind of thing that only
bites you the day you add a reverse proxy.

## How it works

**The delivery model, in one paragraph:** A runner or requester connects
with `ws://.../ws/chat?token=<jwt>&errandId=<uuid>`. Sending a message
persists it server-side and, if the other party is currently connected,
forwards it to them immediately. The recipient's client acknowledges
receipt once it's saved the message to its own local SQLite — only then
does the server delete its copy. If the recipient isn't connected at all,
the message just waits in the table until they next connect, at which
point everything queued for them gets flushed in one go. This is exactly
how WhatsApp's servers have always worked (store-until-delivered, no
permanent archive) — the permanent record lives entirely on the two
devices.

**apps/api**
- New `chat_messages` table — deliberately not a history table. A row's
  entire lifecycle is: inserted on send, optionally forwarded live,
  deleted on ack. I verified this empties out to zero rows after a real
  conversation in testing (see below).
- `lib/chat-server.ts` — the WebSocket server itself, attached to the
  same `http.Server` Express already listens on. Full protocol
  documented at the top of the file.
- Connection auth: same JWT as REST, passed as a query param (`?token=`).
  Worth knowing: unlike an `Authorization` header, a query string can end
  up in access logs. Fine for now over TLS, but if you ever want to
  harden this, the usual fix is a short-lived one-time "ticket" fetched
  over a normal authenticated REST call first, then used once for the WS
  handshake instead of the long-lived JWT itself.
- A connection is only allowed if: the token is valid, the errand exists,
  the connecting user is actually the requester or the accepted runner on
  it, and the errand is in an active status (`accepted` through
  `delivered` — not before a runner's assigned, not after cancellation).
- Basic WebSocket liveness (ping every 30s, terminates a socket that
  stops responding) so a phone that goes dark without a clean disconnect
  doesn't sit in memory pretending to be a valid delivery target.

**apps/runner**
- `lib/chatDb.ts` — the actual permanent chat history, in this app's own
  private SQLite database (`expo-sqlite`). Nothing here needs a storage
  permission prompt — that's a legacy Android concept; app-private SQLite
  needs none on either platform.
- `lib/chatSocket.ts` — the WebSocket client: connects, reconnects with
  backoff (1s → 2s → 4s → 8s → capped at 10s) if the connection drops,
  saves every inbound message to SQLite and acks it, and sends outbound
  messages with a client-generated `clientId` so the "stored"
  confirmation can be matched to the right send even if a few messages
  go out back-to-back (see "what testing caught" below — this wasn't
  theoretical).
- `screens/ChatScreen.tsx` — the actual chat UI: bubbles, a connection
  banner when reconnecting, a composer bar. New `Chat` route registered in
  the navigator, reachable from a "Message requester" link on
  ErrandDetailScreen whenever the errand's in an active status.
- Also fixed a stale comment in `AuthContext.tsx` left over from before
  runner payouts existed — it still said payout accounts didn't do
  anything real yet.

**packages/shared-types**
- New `ChatMessage` interface.

## What's tested vs. what isn't

Same sandbox approach as before: real local Postgres, no live mobile
runtime (I can't launch Expo/Metro here), so the client hook and screen
are type-checked but not run on a device. The WebSocket server itself,
though, I tested hard with a real two-client harness:

- Live delivery when both parties are connected
- A message sent while the recipient was disconnected correctly queued,
  then flushed on their reconnect
- A message the recipient never acked got redelivered on their next
  reconnect (correct — that's the point of an ack-based queue); once
  acked, a further reconnect got nothing, and I confirmed directly in
  Postgres that `chat_messages` was at 0 rows for that errand afterward
- An invalid token was rejected with a clean close
- **Caught a real bug via testing, not just reasoning about it**: I fired
  three messages back-to-back and checked whether the server's "stored"
  replies came back in the same order they were sent. They didn't (`two`
  confirmed before `one`) — which is exactly the scenario the
  client-generated `clientId` correlation exists to handle, and it
  matched all three correctly despite the reordering. If I'd shipped the
  simpler "assume replies come back in order" version, this would have
  silently mismatched sent messages to the wrong stored confirmations
  under real mobile network conditions.

`pnpm -r type-check` is clean across all 5 packages, both in my own
working copy and — more importantly — in a completely independent fresh
clone of the actual current `main` with only this patch applied.

**What hasn't happened:**
- No Requester app chat screen. The backend is symmetric (either role can
  connect), but there's no UI for the requester side yet — following the
  same "apps/requester is pre-existing, not touched" boundary from the
  original handoff. This is the natural next step if you want two real
  phones actually chatting rather than just the runner side working.
- No push notifications for a message that arrives while the recipient's
  app is fully closed (not just backgrounded — a WebSocket can't do
  anything if the app process isn't running at all). Right now that
  message just waits in the queue until they next open the app and
  reconnect, same as it would for a backgrounded app. A "you have a new
  message" push notification would need a whole separate integration
  (Expo push notifications / FCM / APNs) — deliberately out of scope
  here, flagging it so it's a known gap rather than a surprise.
- Never run against a real device/simulator, same caveat as previous
  Runner app changes.
- The `?token=` query-string auth pattern is a known, documented
  simplification — see the note in the "how it works" section above.

## Still open (from the original PRD sweep)

- Requester app chat screen (the obvious next step for this feature)
- Push notifications for chat (and generally — errand status updates
  could use the same infra once it exists)
- Admin dashboard
- Ratings & reviews, SOS/panic button
- Runner trust-tier progression logic
- Analytics/reporting, referral program, support/ticketing
- Virtual card / USSD / cash float vendor disbursement methods
- Most AI features beyond conversational errand creation

A good next-chat opener: "Continue Gracerandly — pick up with [whichever]."
