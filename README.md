# WANTED CHECKERS

Minimal playable MVP checkers game.

## Stack

- Frontend: Next.js 14 App Router, React, Tailwind CSS
- Backend: Node.js, Express REST API
- Database: PostgreSQL
- Auth: JWT local login plus Google ID token login

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

Google login is enabled only when all required server-side variables are set.
If any are missing, the login page shows a disabled `Google login coming soon`
button.

1. Create an OAuth 2.0 Client ID in Google Cloud Console.
2. Set the authorized JavaScript origin to:

   ```text
   http://localhost:3000
   ```

3. Set the authorized redirect URI to:

   ```text
   http://localhost:3000/auth/google/callback
   ```

4. Add these values to `.env`:

   ```bash
   GOOGLE_CLIENT_ID=your-google-client-id
   GOOGLE_CLIENT_SECRET=your-google-client-secret
   GOOGLE_REDIRECT_URI=http://localhost:3000/auth/google/callback
   ```

For production, use your deployed frontend callback URL as
`GOOGLE_REDIRECT_URI` and register that exact URI in Google Cloud.

## API

- `POST /api/game/start`
- `POST /api/game/move` with `{ "gameId": "...", "from": 9, "to": 13 }`
- `GET /api/game/state/:gameId`
- `GET /api/game/moves/:gameId/:from` for backend-sourced move highlights
- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/google`
- `GET /api/auth/google/status`
- `GET /api/auth/google/url`
- `POST /api/auth/google/callback`
- `GET /api/auth/me`
- `PUT /api/auth/profile`
- `GET /api/players/leaderboard` for the MVP WANTED board

Board state is a 32-element array of playable dark squares.

Finished games include a `matchResult` payload with bounty gain/loss, tiers,
streak multiplier, and applied bonuses.

Current gameplay is local PvP: a logged-in user owns Player 1, and Player 2 is
played locally on the same board unless a real opponent is selected later.
Local Player 2 matches intentionally do not update bounty yet; the result
payload marks these as `localOnly`.

The `/play` page also supports built-in `vs AI` mode. The AI runs locally in the
Express backend with Beginner, Intermediate, and Expert difficulty. No external
AI APIs are used.

## Avatars

Registration and profile edit support local avatar uploads for JPG, PNG, and
WebP images up to 2MB. Uploaded files are stored under `uploads/avatars` and
served by the backend at `/uploads/avatars/...`.

If no avatar is uploaded, the backend saves a generated default avatar URL based
on the username.
