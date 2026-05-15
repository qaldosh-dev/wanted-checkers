"use client";

import { useEffect, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export default function WantedBoardPage() {
  const [players, setPlayers] = useState([]);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadPlayers() {
      try {
        const response = await fetch(`${API_URL}/api/players/leaderboard`, { cache: "no-store" });
        if (!response.ok) throw new Error("Could not load WANTED board.");
        const payload = await response.json();
        setPlayers(payload.players);
      } catch (caughtError) {
        setError(caughtError.message);
      } finally {
        setIsLoading(false);
      }
    }

    loadPlayers();
  }, []);

  return (
    <main className="min-h-screen bg-[#15110c] px-4 py-6 text-stone-100 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <header className="flex flex-col gap-4 border-b border-stone-700/70 pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase text-amber-400">WANTED CHECKERS</p>
            <h1 className="mt-2 text-4xl font-black tracking-normal text-stone-50 sm:text-6xl">
              WANTED Board
            </h1>
          </div>

          <a
            href="/"
            className="flex h-10 w-fit items-center rounded-md border border-amber-400/70 px-4 font-bold text-amber-200 transition hover:bg-amber-400 hover:text-stone-950"
          >
            Back to Game
          </a>
        </header>

        {error ? <p className="mt-6 rounded-md bg-red-950/80 px-3 py-2 text-sm text-red-100">{error}</p> : null}
        {isLoading ? <p className="mt-8 text-stone-300">Loading bounties...</p> : null}

        <section className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {players.map((player, index) => (
            <WantedPoster key={player.playerId} player={player} rank={index + 1} />
          ))}
        </section>
      </div>
    </main>
  );
}

function WantedPoster({ player, rank }) {
  return (
    <article className="rounded-lg border-4 border-stone-950 bg-[#d7b36a] p-5 text-stone-950 shadow-xl shadow-black/30">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase">Rank #{rank}</p>
          <h2 className="mt-2 text-3xl font-black tracking-normal">{player.displayName}</h2>
        </div>
        <span className="rounded-md bg-stone-950 px-3 py-1 text-xs font-black text-amber-200">
          {player.tier}
        </span>
      </div>

      <div className="my-5 flex aspect-[4/3] items-center justify-center border-4 border-stone-950/80 bg-[#b58445]">
        <span className="text-7xl font-black tracking-normal">{player.displayName.slice(-1)}</span>
      </div>

      <p className="text-sm font-black uppercase">Dead or Alive</p>
      <p className="mt-1 text-4xl font-black tracking-normal text-red-900">
        {formatBounty(player.bounty)}
      </p>

      <div className="mt-5 grid grid-cols-3 gap-2 text-center text-sm font-bold">
        <StatBox label="Wins" value={player.wins} />
        <StatBox label="Losses" value={player.losses} />
        <StatBox label="Streak" value={player.currentWinStreak} />
      </div>
    </article>
  );
}

function StatBox({ label, value }) {
  return (
    <div className="rounded-md border border-stone-950/50 bg-stone-950/10 p-2">
      <p className="text-xs uppercase text-stone-800">{label}</p>
      <p className="mt-1 text-xl font-black">{value}</p>
    </div>
  );
}

function formatBounty(value) {
  return new Intl.NumberFormat("en-US").format(value);
}
