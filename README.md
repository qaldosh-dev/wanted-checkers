# WANTED CHECKERS

Minimal playable MVP checkers game.

## Stack

- Frontend: Next.js 14 App Router, React, Tailwind CSS
- Backend: Node.js, Express REST API
- Database: PostgreSQL
- Auth: none for MVP, frontend keeps a simple `sessionId`

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

## API

- `POST /api/game/start`
- `POST /api/game/move` with `{ "gameId": "...", "from": 9, "to": 13 }`
- `GET /api/game/state/:gameId`
- `GET /api/game/moves/:gameId/:from` for backend-sourced move highlights
- `GET /api/players/leaderboard` for the MVP WANTED board

Board state is a 32-element array of playable dark squares.

Finished games include a `matchResult` payload with bounty gain/loss, tiers,
streak multiplier, and applied bonuses.
