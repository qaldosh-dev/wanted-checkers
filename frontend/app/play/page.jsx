"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth-context";
import {
  BrandNav,
  CinematicButton,
  PageBackground,
  PosterPanel,
  TierBadge,
  formatBounty
} from "../components/wanted-ui";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

const PIECE_LABELS = {
  1: "P1",
  2: "P2",
  3: "K1",
  4: "K2"
};

export default function Home() {
  const auth = useAuth();
  const [sessionId, setSessionId] = useState("");
  const [game, setGame] = useState(null);
  const [players, setPlayers] = useState([]);
  const [gameMode, setGameMode] = useState("local_pvp");
  const [aiDifficulty, setAiDifficulty] = useState("beginner");
  const [opponentUserId, setOpponentUserId] = useState("local");
  const [selected, setSelected] = useState(null);
  const [moves, setMoves] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isAiThinking, setIsAiThinking] = useState(false);
  const [error, setError] = useState("");

  const moveTargets = useMemo(() => new Set(moves.map((move) => move.to)), [moves]);

  const refreshGame = useCallback(async (gameId) => {
    const response = await fetch(`${API_URL}/api/game/state/${gameId}`, { cache: "no-store" });
    if (!response.ok) throw new Error("Could not load game state.");
    const nextGame = await response.json();
    setGame(nextGame);
  }, []);

  const loadPlayers = useCallback(async () => {
    const response = await fetch(`${API_URL}/api/players/leaderboard`, { cache: "no-store" });
    if (!response.ok) throw new Error("Could not load players.");
    const payload = await response.json();
    setPlayers(payload.players);
    const firstOpponent = payload.players.find((player) => player.userId !== auth.user?.id);
    if (firstOpponent && !opponentUserId) setOpponentUserId("local");
  }, [auth.user?.id, opponentUserId]);

  const startGame = useCallback(async () => {
    if (!auth.isAuthenticated) return;

    setIsLoading(true);
    setError("");
    setSelected(null);
    setMoves([]);

    try {
      const storedSessionId = window.localStorage.getItem("wanted-checkers-session-id") ?? "";
      const response = await fetch(`${API_URL}/api/game/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...auth.authHeaders() },
        body: JSON.stringify({
          sessionId: storedSessionId || undefined,
          opponentUserId: gameMode === "local_pvp" && opponentUserId !== "local" ? opponentUserId : undefined,
          mode: gameMode,
          aiDifficulty: gameMode === "vs_ai" ? aiDifficulty : undefined
        })
      });

      if (!response.ok) throw new Error("Could not start a new game.");
      const nextGame = await response.json();
      window.localStorage.setItem("wanted-checkers-session-id", nextGame.sessionId);
      setSessionId(nextGame.sessionId);
      setGame(nextGame);
    } catch (caughtError) {
      setError(caughtError.message);
    } finally {
      setIsLoading(false);
    }
  }, [auth, opponentUserId, gameMode, aiDifficulty]);

  useEffect(() => {
    if (auth.isAuthLoading || !auth.isAuthenticated) return;
    setSessionId(window.localStorage.getItem("wanted-checkers-session-id") ?? "");
    loadPlayers().catch((caughtError) => setError(caughtError.message));
  }, [auth.isAuthLoading, auth.isAuthenticated, loadPlayers]);

  useEffect(() => {
    if (!game?.gameId) return undefined;

    const intervalId = window.setInterval(() => {
      refreshGame(game.gameId).catch((caughtError) => setError(caughtError.message));
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [game?.gameId, refreshGame]);

  async function selectSquare(playableIndex) {
    if (!game || game.status !== "ongoing" || isAiThinking) return;

    if (selected !== null && moveTargets.has(playableIndex)) {
      await submitMove(selected, playableIndex);
      return;
    }

    setSelected(playableIndex);
    setError("");

    try {
      const response = await fetch(`${API_URL}/api/game/moves/${game.gameId}/${playableIndex}`, {
        headers: auth.authHeaders(),
        cache: "no-store"
      });
      if (!response.ok) throw new Error("Could not load valid moves.");
      const payload = await response.json();
      setMoves(payload.moves);

      if (payload.moves.length === 0) {
        setSelected(null);
      }
    } catch (caughtError) {
      setSelected(null);
      setMoves([]);
      setError(caughtError.message);
    }
  }

  async function submitMove(from, to) {
    if (!game) return;

    setIsLoading(true);
    setIsAiThinking(game.mode === "vs_ai" && game.currentTurn === 1);
    setError("");

    try {
      const response = await fetch(`${API_URL}/api/game/move`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...auth.authHeaders() },
        body: JSON.stringify({ gameId: game.gameId, from, to })
      });

      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Illegal move.");

      setGame(payload);
      setSelected(null);
      setMoves([]);
    } catch (caughtError) {
      setError(caughtError.message);
      await refreshGame(game.gameId);
    } finally {
      setIsLoading(false);
      setIsAiThinking(false);
    }
  }

  if (!auth.isAuthLoading && !auth.isAuthenticated) {
    return (
      <PageBackground>
        <BrandNav auth={auth} active="play" compact />
        <div className="mx-auto flex min-h-[calc(100vh-88px)] max-w-4xl flex-col justify-center px-4 py-8 sm:px-6">
          <p className="text-xs font-black uppercase text-red-300">WANTED CHECKERS</p>
          <h1 className="mt-3 text-5xl font-black uppercase tracking-normal text-amber-100 sm:text-7xl">Sign In to Play</h1>
          <p className="mt-5 max-w-xl text-lg text-stone-300">
            Your bounty belongs to your account now. Register or login before starting a match.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <CinematicButton href="/register">Register</CinematicButton>
            <CinematicButton href="/login" variant="dark">Login</CinematicButton>
            <CinematicButton href="/wanted-board" variant="dark">Wanted Board</CinematicButton>
          </div>
        </div>
      </PageBackground>
    );
  }

  return (
    <PageBackground>
      <BrandNav auth={auth} active="play" compact />
      <div className="mx-auto flex min-h-[calc(100vh-88px)] w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase text-red-300">Premium local duel</p>
            <h1 className="mt-2 text-4xl font-black uppercase tracking-normal text-amber-100 sm:text-6xl">
              Dark-Square Arena
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-sm">
            <StatusPill game={game} />
            {isAiThinking ? (
              <div className="flex min-h-11 items-center rounded-md border border-red-700/60 bg-red-950/70 px-4 font-black uppercase text-red-100 shadow-lg shadow-black/30">
                AI thinking
              </div>
            ) : null}
            <CinematicButton href="/profile" variant="dark">Profile</CinematicButton>
            <CinematicButton href="/wanted-board" variant="dark">Wanted Board</CinematicButton>
            <CinematicButton onClick={auth.logout} variant="red">
              Logout
            </CinematicButton>
            <CinematicButton onClick={startGame} disabled={isLoading}>
              New Game
            </CinematicButton>
          </div>
        </header>

        <section className="grid flex-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_330px]">
          <div className="mx-auto w-full max-w-[720px]">
            <Board
              board={game?.board ?? Array(32).fill(0)}
              selected={selected}
              moveTargets={moveTargets}
              onSquareClick={selectSquare}
              disabled={!game || isLoading || isAiThinking}
            />
          </div>

          <PosterPanel className="space-y-4 p-5">
            <InfoRow label="Signed in" value={auth.user?.username ?? "Loading"} />
            <label className="block border-b border-stone-950/30 pb-3 text-sm">
              <span className="font-black uppercase text-stone-800">Game Mode</span>
              <select
                value={gameMode}
                onChange={(event) => setGameMode(event.target.value)}
                className="mt-2 h-10 w-full rounded-md border border-stone-950/50 bg-stone-950/15 px-3 font-black text-stone-950 outline-none focus:border-red-900"
              >
                <option value="local_pvp">Local PvP</option>
                <option value="vs_ai">vs AI</option>
              </select>
            </label>
            {gameMode === "vs_ai" ? (
              <label className="block border-b border-stone-950/30 pb-3 text-sm">
                <span className="font-black uppercase text-stone-800">AI Difficulty</span>
                <select
                  value={aiDifficulty}
                  onChange={(event) => setAiDifficulty(event.target.value)}
                  className="mt-2 h-10 w-full rounded-md border border-stone-950/50 bg-stone-950/15 px-3 font-black text-stone-950 outline-none focus:border-red-900"
                >
                  <option value="beginner">Beginner</option>
                  <option value="intermediate">Intermediate</option>
                  <option value="expert">Expert</option>
                </select>
              </label>
            ) : null}
            <label className="block border-b border-stone-950/30 pb-3 text-sm">
              <span className="font-black uppercase text-stone-800">Opponent</span>
              <select
                value={opponentUserId}
                onChange={(event) => setOpponentUserId(event.target.value)}
                disabled={gameMode === "vs_ai"}
                className="mt-2 h-10 w-full rounded-md border border-stone-950/50 bg-stone-950/15 px-3 font-black text-stone-950 outline-none focus:border-red-900"
              >
                <option value="local">{gameMode === "vs_ai" ? `AI - ${labelDifficulty(aiDifficulty)}` : "Local Player 2"}</option>
                {players
                  .filter((player) => player.userId !== auth.user?.id)
                  .map((player) => (
                    <option key={player.userId} value={player.userId}>
                      {player.username} - {player.tier}
                    </option>
                  ))}
              </select>
            </label>
            <InfoRow label="Game" value={game?.gameId ? shortId(game.gameId) : "Starting"} />
            <InfoRow label="Mode" value={game ? modeLabel(game) : modeDraftLabel(gameMode, aiDifficulty)} />
            <InfoRow label="Session" value={sessionId ? shortId(sessionId) : "Local"} />
            <InfoRow label="Turn" value={game?.currentTurn ? turnLabel(game, auth.user?.username) : "Loading"} />
            <InfoRow label="Forced jump" value={game?.forcedFrom ?? "None"} />
            {error ? <p className="rounded-md bg-red-950/80 px-3 py-2 text-sm text-red-100">{error}</p> : null}
            {game?.status === "finished" ? (
              <BountyResultPanel matchResult={game.matchResult} winner={game.winner} onRestart={startGame} />
            ) : null}
          </PosterPanel>
        </section>
      </div>
    </PageBackground>
  );
}

function Board({ board, selected, moveTargets, onSquareClick, disabled }) {
  return (
    <div className="game-board-frame aspect-square w-full overflow-hidden p-2">
      <div className="grid h-full w-full grid-cols-8 grid-rows-8">
        {Array.from({ length: 64 }, (_, square) => {
          const row = Math.floor(square / 8);
          const col = square % 8;
          const isPlayable = (row + col) % 2 === 1;
          const playableIndex = isPlayable ? row * 4 + Math.floor(col / 2) : null;
          const piece = playableIndex === null ? 0 : board[playableIndex];
          const isSelected = selected === playableIndex;
          const isMoveTarget = playableIndex !== null && moveTargets.has(playableIndex);

          return (
            <button
              key={square}
              type="button"
              disabled={!isPlayable || disabled}
              onClick={() => playableIndex !== null && onSquareClick(playableIndex)}
              className={[
                "relative flex items-center justify-center",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 focus-visible:ring-offset-0",
                isPlayable ? "game-square-dark hover:brightness-125" : "game-square-light",
                isSelected ? "inset-ring" : ""
              ].join(" ")}
              aria-label={isPlayable ? `Playable square ${playableIndex}` : "Light square"}
            >
              {piece !== 0 ? <Piece piece={piece} selected={isSelected} /> : null}
              {isMoveTarget ? <span className="absolute h-4 w-4 rounded-full bg-amber-300/90 shadow-[0_0_18px_rgba(242,193,78,0.9)]" /> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Piece({ piece, selected }) {
  const isPlayerOne = piece === 1 || piece === 3;
  const isKing = piece === 3 || piece === 4;

  return (
    <span
      className={[
        "flex h-[72%] w-[72%] items-center justify-center rounded-full border-4 text-xs font-black shadow-lg sm:text-sm",
        isPlayerOne
          ? "border-red-950 bg-gradient-to-br from-red-600 to-red-950 text-red-50 shadow-red-950/60"
          : "border-stone-950 bg-gradient-to-br from-stone-50 to-amber-200 text-stone-950 shadow-black/70",
        selected ? "ring-4 ring-amber-300 shadow-[0_0_28px_rgba(242,193,78,0.8)]" : "ring-1 ring-black/40"
      ].join(" ")}
    >
      {isKing ? "K" : PIECE_LABELS[piece]}
    </span>
  );
}

function StatusPill({ game }) {
  const label =
    game?.status === "finished"
      ? `Player ${game.winner} wins`
      : game?.currentTurn
        ? `Player ${game.currentTurn} to move`
        : "Loading";

  return (
    <div className="flex min-h-11 items-center rounded-md border border-amber-700/60 bg-black/60 px-4 font-black uppercase text-amber-100 shadow-lg shadow-black/30">
      {label}
    </div>
  );
}

function InfoRow({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-stone-950/30 pb-3 text-sm">
      <span className="font-black uppercase text-stone-800">{label}</span>
      <span className="max-w-[170px] truncate font-black text-stone-950">{value}</span>
    </div>
  );
}

function BountyResultPanel({ matchResult, winner, onRestart }) {
  if (!matchResult) {
    return (
      <div className="poster-panel p-4">
        <p className="text-sm font-semibold uppercase">Winner</p>
        <p className="mt-1 text-3xl font-black tracking-normal">Player {winner}</p>
        <button
          type="button"
          onClick={onRestart}
          className="mt-4 h-10 w-full rounded-md bg-stone-950 px-4 font-bold text-amber-200 transition hover:bg-stone-800"
        >
          New Game
        </button>
      </div>
    );
  }

  return (
    <div className="poster-panel p-5 text-stone-950">
      <p className="text-sm font-black uppercase text-red-900">BOUNTY UPDATED</p>
      <p className="mt-2 text-3xl font-black tracking-normal">{matchResult.winnerDisplayName}</p>
      <div className="bounty-text mt-3 text-4xl">
        {matchResult.localOnly ? "Local Match" : `+${formatBounty(matchResult.bountyGain)}`}
      </div>
      {matchResult.localOnly ? (
        <p className="mt-3 rounded-md bg-stone-950/15 p-3 text-sm font-bold">
          {matchResult.message}
        </p>
      ) : null}
      <InfoRowDark
        label="Total bounty"
        value={matchResult.winnerNewBounty === null ? "Not updated" : formatBounty(matchResult.winnerNewBounty)}
      />
      <div className="mt-3">
        <TierBadge tier={matchResult.winnerTier ?? "Unknown"} />
      </div>
      <InfoRowDark label="Streak" value={`x${matchResult.streakMultiplier}`} />

      <div className="mt-4 space-y-2">
        <p className="text-xs font-black uppercase">Bonuses</p>
        {matchResult.bonusesApplied.length > 0 ? (
          matchResult.bonusesApplied.map((bonus) => (
            <div
              key={bonus.code}
              className="flex items-center justify-between gap-3 border-b border-stone-950/30 pb-2 text-sm font-bold"
            >
              <span>{bonus.label}</span>
              <span>+{formatBounty(bonus.amount)}</span>
            </div>
          ))
        ) : (
          <p className="text-sm font-semibold">No bonus bounty applied.</p>
        )}
      </div>

      <button
        type="button"
        onClick={onRestart}
        className="dark-button mt-4 w-full"
      >
        New Game
      </button>
    </div>
  );
}

function InfoRowDark({ label, value }) {
  return (
    <div className="mt-3 flex items-center justify-between gap-4 border-b border-stone-950/30 pb-2 text-sm">
      <span className="font-semibold text-stone-800">{label}</span>
      <span className="max-w-[150px] truncate font-black text-stone-950">{value}</span>
    </div>
  );
}

function shortId(value) {
  return `${value.slice(0, 8)}...`;
}

function turnLabel(game, username) {
  if (game.currentTurn === 1) return `${username ?? "You"} as Player 1`;
  if (game.mode === "vs_ai") return `AI - ${labelDifficulty(game.aiDifficulty)}`;
  return game.playerTwoUserId ? "Player 2" : "Local Player 2";
}

function modeLabel(game) {
  if (game.mode === "vs_ai") return `vs AI - ${labelDifficulty(game.aiDifficulty)}`;
  return "Local PvP";
}

function modeDraftLabel(gameMode, aiDifficulty) {
  if (gameMode === "vs_ai") return `vs AI - ${labelDifficulty(aiDifficulty)}`;
  return "Local PvP";
}

function labelDifficulty(difficulty) {
  const labels = {
    beginner: "Beginner",
    intermediate: "Intermediate",
    expert: "Expert"
  };
  return labels[difficulty] ?? "Beginner";
}
