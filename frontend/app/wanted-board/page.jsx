"use client";

import { useEffect, useState } from "react";
import {
  BrandNav,
  PageBackground,
  PosterPanel,
  WantedPosterCard
} from "../components/wanted-ui";
import { useAuth } from "../auth-context";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export default function WantedBoardPage() {
  const auth = useAuth();
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
    <PageBackground>
      <BrandNav auth={auth} active="board" />
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase text-red-300">Wall of dangerous legends</p>
            <h1 className="mt-2 text-5xl font-black uppercase tracking-normal text-amber-100 sm:text-7xl">
              WANTED Board
            </h1>
          </div>

          <a href="/play" className="dark-button w-fit">
            Back to Arena
          </a>
        </header>

        {error ? <p className="mb-6 rounded-md bg-red-950/80 px-3 py-2 text-sm text-red-100">{error}</p> : null}
        {isLoading ? (
          <PosterPanel className="p-5 text-xl font-black uppercase text-stone-950">
            Loading bounties...
          </PosterPanel>
        ) : null}

        <section className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
          {players.map((player, index) => (
            <WantedPosterCard key={player.userId ?? player.username} player={player} rank={index + 1} />
          ))}
        </section>

        {!isLoading && players.length === 0 ? (
          <PosterPanel className="mt-8 p-6">
            <h2 className="text-3xl font-black uppercase tracking-normal text-stone-950">
              No posters on the wall yet
            </h2>
            <p className="mt-2 font-semibold text-stone-800">
              Register, play, and become the first name pinned to the board.
            </p>
          </PosterPanel>
        ) : null}
      </div>
    </PageBackground>
  );
}
