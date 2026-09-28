# Gracerandly — Chat v2: avatars, edit, voice notes, audio/video calls (both apps)

## Apply (Git Bash, from ~/documents/gracerandly)

```bash
cp ~/Downloads/gracerandly-chat-v2.zip ~/documents/gracerandly/
cd ~/documents/gracerandly
unzip gracerandly-chat-v2.zip -d chat-v2-handoff

# all 14 new files, keeping their folder structure:
cp -r chat-v2-handoff/new_files/. .

git apply chat-v2-handoff/MODIFIED_FILES.patch

pnpm install
pnpm -r type-check
pnpm --filter @gracerandly/api db:migrate
git status
```

## Before calls work: Agora setup (5 minutes, free tier)

1. Sign up at https://console.agora.io, create a project, choose
   "Secured mode: APP ID + Token".
2. Copy the **App ID** and **App Certificate** into `apps/api/.env`:
   ```
   AGORA_APP_ID=...
   AGORA_APP_CERTIFICATE=...
   ```
3. Restart the API. Without these, only the two call-token endpoints fail;
   text chat, edits and voice notes work regardless.

## IMPORTANT: both apps now need a development build (no more Expo Go)

`react-native-agora` is a native module. Expo Go can't load it, and because
the chat screen imports it, **the app will fail to start in Expo Go**, not
just the call feature. To run on a device/emulator:

```bash
cd apps/runner      # and again in apps/requester
npx expo prebuild
npx expo run:android      # or: eas build --profile development --platform android
```

(`expo-audio` mic permission plus camera/mic permissions are already
declared in each app.json by this patch.)

## What's in it

**API**
- `chat_messages` gains `kind` (message | edit), `content_type` (text | audio),
  `target_message_id` — migration 0011.
- `lib/chat-server.ts`: edits and voice notes ride the same store-until-acked
  pipeline as text (an edit made while the other side is offline still arrives
  when they reconnect); call signaling (`call-invite/accept/decline/end`) is
  live-only relay; a dropped connection reads as a hang-up. Payload cap raised
  to 5MB for voice notes.
- `GET /errands/:id/chat-participant` (requester) and
  `GET /runners/errands/:id/chat-participant` (runner): the other party's name
  + avatar.
- `POST /errands/:id/agora-token` and `POST /runners/errands/:id/agora-token`:
  1-hour Agora join token, channel = the errand id, only for parties to that
  errand while it's in an active status.
- `lib/agora.ts` (token minting, uses the official `agora-token` package).

**Both apps (same code, role passed in)**
- `lib/chatDb.ts`, `lib/chatSocket.ts`, `lib/chatApi.ts`
- `components/Avatar.tsx`, `VoiceNoteBubble.tsx`, `CallOverlay.tsx`
- `screens/ChatScreen.tsx`: avatar + name in the header and next to every
  bubble (initial letter fallback), long-press your own text message to edit
  ("edited" shown), mic button records up to 60s (tap send or cancel),
  phone/video buttons in the header, full-screen call UI with mute / camera
  toggle / flip camera / hang up.
- Requester app: new Chat route + "Message runner" button on the errand screen.

## Tested here vs. not

Tested (real Postgres, two-client WebSocket harness): live edit with
targetMessageId; edit while recipient offline flushed on reconnect; a ~200KB
voice note delivered byte-for-byte; call invite → accept → end; invite when the
other side is offline → `call-unavailable`; disconnect notifies the other
party; queue table back to 0 rows afterwards; participant + token endpoints for
both roles, wrong-role rejected. All 5 packages type-check (against the real
`react-native-agora` and `expo-audio` types), both apps bundle with Metro
(Android/Hermes), and the patch applies + type-checks in a fresh clone.

**NOT tested — needs real devices:** the actual audio/video media path, voice
recording/playback on hardware, and the Agora join with your real credentials.
I tested with fake Agora keys, so token minting works but Agora's servers
haven't seen a token from this backend. Expect to debug a little on first call.

## Known limitations

- **A call only rings while the other person has the chat screen open** (the
  socket lives there). No app-wide socket or push notification yet — that's the
  natural next feature (push would also make chat notify when the app is closed).
- An edit reaches the other side only via the queue, so it works whether or not
  they're online — but if their local copy of the original message is gone
  (cleared/reinstalled) the edit has nothing to update.
- Voice notes are stored as base64 in SQLite — fine for ≤60s clips.
- Avatars are the data-URI images that already exist on profiles.
- Free Agora tier: 10,000 minutes/month.
