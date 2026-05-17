# WANTED CHECKERS

Minimal playable MVP checkers game.

## Stack

- Frontend: Next.js 14 App Router, React, Tailwind CSS
- Backend: Node.js, Express REST API
- Database: PostgreSQL
- Auth: Google Identity Services plus JWT sessions

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create PostgreSQL database and enable `pgcrypto`, then apply schema:

   ```bash
   psql "$DATABASE_URL" -f backend/src/schema.sql
   ```

3. Copy environment variables:

   ```bash
   cp .env.example .env
   ```

4. Run tests:

   ```bash
   npm test
   ```

5. Start backend and frontend:

   ```bash
   npm run dev
   ```

Frontend opens at `http://localhost:3000`, backend at `http://localhost:4000`.
The landing page is `/`, the playable board is `/play`, and the leaderboard is
`/wanted-board`.

## Google OAuth

WANTED CHECKERS uses Google-only authentication. Google Identity Services runs
in the browser and the Express backend verifies the
returned ID token on the Express backend with `google-auth-library`.

Google login is enabled only when `GOOGLE_CLIENT_ID` is set. If it is missing,
the login page shows a disabled `Google login is not configured` button.

1. Create an OAuth 2.0 Client ID in Google Cloud Console.
2. Set the authorized JavaScript origin to:

   ```text
   http://localhost:3000
   ```

3. Add the client ID to `.env`:

   ```bash
   GOOGLE_CLIENT_ID=your-google-client-id
   GROK_API_KEY=optional-grok-api-key
   GROK_MODEL=grok-2-latest
   ```

No `GOOGLE_CLIENT_SECRET` or redirect URI is required for this ID-token flow.
For production, add your deployed frontend origin to the same Google OAuth
client.

## Deployment

Current production targets:

- Database: Neon PostgreSQL
- Backend: Render at `https://wanted-checkers.onrender.com`
- Frontend: Vercel at `https://wanted-checkers-1pco.vercel.app`

### Neon PostgreSQL

1. Create a Neon project and copy the pooled or direct PostgreSQL connection
   string.
2. Apply the schema from your machine or a migration job:

   ```bash
   psql "$DATABASE_URL" -f backend/src/schema.sql
   ```

3. Keep `DATABASE_URL` available to the Render backend. The schema enables
   `pgcrypto`, so the connected database user must be allowed to create that
   extension.

### Render Backend

Set these Render environment variables:

```bash
DATABASE_URL=postgres://...
JWT_SECRET=use-a-long-random-production-secret
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
FRONTEND_URL=https://wanted-checkers-1pco.vercel.app
GROK_API_KEY=optional-grok-api-key
```

`FRONTEND_URL` is the production browser origin allowed by both Express CORS and
Socket.IO CORS. Local development at `http://localhost:3000` is always allowed.
Vercel preview origins matching `https://*.vercel.app` are also allowed for API
and Socket.IO requests. If you want to pin multiple production origins, separate
them with commas:

```bash
FRONTEND_URL=https://wanted-checkers-1pco.vercel.app,https://another-domain.example
```

`CLIENT_ORIGIN` is still accepted as a legacy fallback, but new deployments
should use `FRONTEND_URL`.

### Vercel Frontend

Set these Vercel environment variables:

```bash
NEXT_PUBLIC_API_URL=https://wanted-checkers.onrender.com
NEXT_PUBLIC_SOCKET_URL=https://wanted-checkers.onrender.com
NEXT_PUBLIC_GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
```

`NEXT_PUBLIC_API_URL` is used for REST requests, including
`/api/auth/google/status`. `NEXT_PUBLIC_SOCKET_URL` is used by Socket.IO. They
can point to the same Render service.

### Google OAuth Origins

In the Google Cloud Console OAuth client, add authorized JavaScript origins for
every frontend origin that should show the Google popup:

```text
http://localhost:3000
https://wanted-checkers-1pco.vercel.app
```

For Vercel preview deployments, add each preview origin you intend to test.
Google authorized JavaScript origins should be exact origins, not paths. This
project uses the Google ID-token flow, so no `GOOGLE_CLIENT_SECRET` or redirect
URI is required.

## API

- `POST /api/game/start`
- `POST /api/game/move` with `{ "gameId": "...", "from": 9, "to": 13 }`
- `GET /api/game/state/:gameId`
- `GET /api/game/moves/:gameId/:from` for backend-sourced move highlights
- `POST /api/auth/google`
- `POST /api/auth/onboarding`
- `GET /api/auth/username/:username`
- `GET /api/auth/google/status`
- `GET /api/auth/me`
- `PUT /api/auth/profile`
- `GET /api/players/leaderboard` for the MVP WANTED board
- `GET /api/players/leaderboard?region=Almaty` for regional WANTED boards
- `GET /api/players/rank/me` for national and regional rank badges
- `GET /api/matches/recent` for the signed-in user's last 3 matches
- `GET /api/matches/:id/replay` for authorized replay snapshots
- `POST /api/matches/:id/analysis` for cached AI Coach analysis

Board state is a 32-element array of playable dark squares.

Finished games include a `matchResult` payload with bounty gain/loss, tiers,
streak multiplier, and applied bonuses.

Games can also end with `status: "draw"` when the same board position occurs
three times or when 30 moves pass without a capture or king promotion. Draws do
not award bounty.

Current gameplay is local PvP: a logged-in user owns Player 1, and Player 2 is
played locally on the same board unless a real opponent is selected later.
Local Player 2 matches intentionally do not update bounty yet; the result
payload marks these as `localOnly`.

The `/play` page also supports built-in `vs AI` mode. The AI runs locally in the
Express backend with Beginner, Intermediate, and Expert difficulty. No external
AI APIs are used.

The `/play` page includes first-version online multiplayer through Socket.IO.
Authenticated clients can choose `Online Multiplayer`, click `Find Match`, and
the backend pairs two queued users into a live `multiplayer` game room. Moves are
validated by the backend engine and broadcast to both players in real time.
Players can also search by username and send direct challenge invites. Challenges
are in-memory MVP invites, expire after a short timeout, and create the same live
multiplayer game room when accepted.

The `/play` page also includes `Blitz Duel` for online matchmaking and direct
friend/player challenges. Blitz games use server-authoritative clocks: each
player has 3 minutes total and each active move has a 10-second limit. Timer
state is stored on `games.blitz_state`, broadcast over Socket.IO, and timeout
losses are finalized through the normal match result/replay flow.

The `/play` page includes experimental `Blind Hunt` modes for local hot-seat play
and online matchmaking/challenges. The backend still stores and validates the
full board; the frontend renders a per-player fog layer so players only see
their own pieces and nearby squares. Replays for Blind Hunt games can be viewed
with full vision or either player's vision.

Players select a structured Kazakhstan region during onboarding and profile
editing. The existing `users.city` column stores only approved region values for
compatibility. The WANTED Board can show Kazakhstan-wide rankings or a regional
leaderboard; regional #1 players receive champion styling, and the global #1 is
marked as Kazakhstan's Most Wanted.

Completed games store snapshot-rich `move_history` entries for replay. The
profile page shows the latest matches and `/replay/:id` lets a participant step
through the match or auto-play it one move per second.

The replay page includes an MVP AI Coach. The backend always performs local
heuristic analysis first, caches the result per user and match, and can
optionally use Grok only to rewrite those local findings into natural coaching
language when `GROK_API_KEY` is configured. Free users are limited to 3 new
analyses per day; the Pro upgrade prompt is presentation-only and has no billing
backend.

The `/play` page includes a lightweight friends system. Authenticated users can
send, accept, and decline friend requests, view their friends list with live
online/offline presence, and challenge friends through the existing multiplayer
challenge flow.

Friendship API:

- `POST /api/friends/request` with `{ "addresseeUserId": 2 }`
- `POST /api/friends/accept` with `{ "friendshipId": 1 }`
- `POST /api/friends/decline` with `{ "friendshipId": 1 }`
- `GET /api/friends/list`
- `GET /api/friends/requests`

## Avatars

Onboarding and profile edit support local avatar uploads for JPG, PNG, and WebP
images up to 2MB. Uploaded files are stored under `uploads/avatars` and served
by the backend at `/uploads/avatars/...`.

If no avatar is uploaded, the backend saves a generated default avatar URL based
on the username.
