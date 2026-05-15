"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

const PIECE_LABELS = {
  1: "P1",
  2: "P2",
  3: "K1",
  4: "K2"
};

export default function Home() {
  const [sessionId, setSessionId] = useState("");
  const [game, setGame] = useState(null);
  const [selected, setSelected] = useState(null);
  const [moves, setMoves] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const moveTargets = useMemo(() => new Set(moves.map((move) => move.to)), [moves]);

  const refreshGame = useCallback(async (gameId) => {
    const response = await fetch(`${API_URL}/api/game/state/${gameId}`, { cache: "no-store" });
    if (!response.ok) throw new Error("Could not load game state.");
    const nextGame = await response.json();
    setGame(nextGame);
  }, []);

  const startGame = useCallback(async () => {
    setIsLoading(true);
    setError("");
    setSelected(null);
    setMoves([]);

    try {
      const storedSessionId = window.localStorage.getItem("wanted-checkers-session-id") ?? "";
      const response = await fetch(`${API_URL}/api/game/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: storedSessionId || undefined })
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
  }, []);

  useEffect(() => {
    setSessionId(window.localStorage.getItem("wanted-checkers-session-id") ?? "");
    startGame();
  }, [startGame]);

  useEffect(() => {
    if (!game?.gameId) return undefined;

    const intervalId = window.setInterval(() => {
      refreshGame(game.gameId).catch((caughtError) => setError(caughtError.message));
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [game?.gameId, refreshGame]);

  async function selectSquare(playableIndex) {
    if (!game || game.status !== "ongoing") return;

    if (selected !== null && moveTargets.has(playableIndex)) {
      await submitMove(selected, playableIndex);
      return;
    }

    setSelected(playableIndex);
    setError("");

    try {
      const response = await fetch(`${API_URL}/api/game/moves/${game.gameId}/${playableIndex}`, {
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
    setError("");

    try {
      const response = await fetch(`${API_URL}/api/game/move`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
    }
  }

  return (
    <main className="min-h-screen bg-[#15110c] text-stone-100">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-6 px-4 py-5 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-4 border-b border-stone-700/70 pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase text-amber-400">
              WANTED CHECKERS
            </p>
            <h1 className="mt-2 text-3xl font-black tracking-normal text-stone-50 sm:text-5xl">
              Dark-square duel
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-sm">
            <StatusPill game={game} />
            <button
              type="button"
              onClick={startGame}
              disabled={isLoading}
              className="h-10 rounded-md border border-amber-400/70 px-4 font-bold text-amber-200 transition hover:bg-amber-400 hover:text-stone-950 disabled:cursor-wait disabled:opacity-60"
            >
              New Game
            </button>
          </div>
        </header>

        <section className="grid flex-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div className="mx-auto w-full max-w-[680px]">
            <Board
              board={game?.board ?? Array(32).fill(0)}
              selected={selected}
              moveTargets={moveTargets}
              onSquareClick={selectSquare}
              disabled={!game || isLoading}
            />
          </div>

          <aside className="space-y-4 border-t border-stone-700/70 pt-5 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
            <InfoRow label="Game" value={game?.gameId ? shortId(game.gameId) : "Starting"} />
            <InfoRow label="Session" value={sessionId ? shortId(sessionId) : "Local"} />
            <InfoRow label="Turn" value={game?.currentTurn ? `Player ${game.currentTurn}` : "Loading"} />
            <InfoRow label="Forced jump" value={game?.forcedFrom ?? "None"} />
            {error ? <p className="rounded-md bg-red-950/80 px-3 py-2 text-sm text-red-100">{error}</p> : null}
            {game?.status === "finished" ? <WinnerPanel winner={game.winner} onRestart={startGame} /> : null}
          </aside>
        </section>
      </div>
    </main>
  );
}

function Board({ board, selected, moveTargets, onSquareClick, disabled }) {
  return (
    <div className="aspect-square w-full overflow-hidden rounded-lg border border-stone-700 bg-stone-950 shadow-2xl shadow-black/40">
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
                isPlayable ? "bg-[#55351f] hover:bg-[#674126]" : "bg-[#c9a66b]",
                isSelected ? "inset-ring" : ""
              ].join(" ")}
              aria-label={isPlayable ? `Playable square ${playableIndex}` : "Light square"}
            >
              {piece !== 0 ? <Piece piece={piece} selected={isSelected} /> : null}
              {isMoveTarget ? <span className="absolute h-3 w-3 rounded-full bg-amber-300/80 shadow shadow-black/40" /> : null}
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
          ? "border-red-950 bg-red-700 text-red-50 shadow-red-950/50"
          : "border-stone-950 bg-stone-100 text-stone-950 shadow-black/60",
        selected ? "ring-4 ring-amber-300" : "ring-1 ring-black/40"
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
    <div className="flex h-10 items-center rounded-md bg-stone-900 px-4 font-bold text-stone-100 ring-1 ring-stone-700">
      {label}
    </div>
  );
}

function InfoRow({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-stone-800 pb-3 text-sm">
      <span className="text-stone-400">{label}</span>
      <span className="max-w-[170px] truncate font-semibold text-stone-100">{value}</span>
    </div>
  );
}

function WinnerPanel({ winner, onRestart }) {
  return (
    <div className="rounded-lg border border-amber-300 bg-amber-300 p-4 text-stone-950">
      <p className="text-sm font-semibold uppercase">Winner</p>
      <p className="mt-1 text-3xl font-black tracking-normal">Player {winner}</p>
      <button
        type="button"
        onClick={onRestart}
        className="mt-4 h-10 w-full rounded-md bg-stone-950 px-4 font-bold text-amber-200 transition hover:bg-stone-800"
      >
        Play Again
      </button>
    </div>
  );
}

function shortId(value) {
  return `${value.slice(0, 8)}...`;
}
