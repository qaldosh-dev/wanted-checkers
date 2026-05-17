"use client";

import { useEffect, useState } from "react";
import {
  BoardMotif,
  BrandNav,
  CinematicButton,
  PageBackground,
  PosterPanel,
  WantedPosterCard
} from "./components/wanted-ui";
import { useAuth } from "./auth-context";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export default function LandingPage() {
  const auth = useAuth();
  const [players, setPlayers] = useState([]);

  useEffect(() => {
    async function loadPlayers() {
      try {
        const response = await fetch(`${API_URL}/api/players/leaderboard`, { cache: "no-store" });
        if (!response.ok) return;
        const payload = await response.json();
        setPlayers(payload.players.slice(0, 3));
      } catch {
        setPlayers([]);
      }
    }

    loadPlayers();
  }, []);

  return (
    <PageBackground>
      <BrandNav auth={auth} />

      <section className="mx-auto grid min-h-[calc(100vh-88px)] max-w-7xl items-center gap-8 px-4 py-10 sm:px-6 lg:grid-cols-[1fr_0.95fr] lg:px-8">
        <div className="relative">
          <BoardMotif className="absolute -left-8 -top-8 h-56 w-56 rotate-12 blur-[1px]" />
          <p className="relative text-sm font-black uppercase text-red-300">Dark-square bounty arena</p>
          <h1 className="relative mt-4 max-w-4xl text-5xl font-black uppercase leading-[0.92] tracking-normal text-amber-100 sm:text-7xl lg:text-8xl">
            BECOME THE MOST WANTED PLAYER
          </h1>
          <p className="relative mt-6 max-w-2xl text-xl font-semibold text-stone-300 sm:text-2xl">
            Raise your bounty. Defeat rivals. Rule the board.
          </p>

          <div className="relative mt-8 flex flex-wrap gap-4">
            <CinematicButton href={auth.isAuthenticated ? "/play" : "/login"} className="text-lg">
              Play Now
            </CinematicButton>
            <CinematicButton href="/wanted-board" variant="dark" className="text-lg">
              View Wanted Board
            </CinematicButton>
          </div>

          <PosterPanel className="mt-10 max-w-3xl p-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-black uppercase text-stone-800">Arena marks</p>
                <h2 className="text-2xl font-black uppercase tracking-normal text-stone-950">
                  Crowns, diagonals, and bounties
                </h2>
              </div>
              <div className="flex gap-3 text-4xl text-stone-950">
                <span className="grid h-14 w-14 place-items-center rounded-full border-4 border-stone-950 bg-red-800 text-amber-100 shadow-inner">
                  K
                </span>
                <span className="grid h-14 w-14 place-items-center rounded-full border-4 border-stone-950 bg-stone-100 text-stone-950 shadow-inner">
                  C
                </span>
                <span className="grid h-14 w-14 place-items-center rounded-full border-4 border-stone-950 bg-amber-300 text-stone-950 shadow-inner">
                  W
                </span>
              </div>
            </div>
          </PosterPanel>
        </div>

        <div>
          <div className="mb-4 flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase text-amber-400">Top most wanted</p>
              <h2 className="text-3xl font-black uppercase tracking-normal text-stone-50">Poster Wall</h2>
            </div>
            <a href="/wanted-board" className="text-sm font-black uppercase text-amber-200 hover:text-amber-100">
              View all
            </a>
          </div>
          <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3">
            {(players.length ? players : fallbackPlayers).map((player, index) => (
              <WantedPosterCard key={player.userId ?? player.username} player={player} rank={index + 1} compact />
            ))}
          </div>
        </div>
      </section>
    </PageBackground>
  );
}

const fallbackPlayers = [
  {
    userId: "preview-1",
    username: "crown_rival",
    city: "Almaty",
    bounty: 5_600_000,
    tier: "Rookie Threat",
    wins: 8,
    losses: 2,
    currentWinStreak: 3
  },
  {
    userId: "preview-2",
    username: "diagonal_ace",
    city: "Astana",
    bounty: 12_400_000,
    tier: "Rising Menace",
    wins: 15,
    losses: 5,
    currentWinStreak: 4
  },
  {
    userId: "preview-3",
    username: "kingmaker",
    city: "Shymkent",
    bounty: 51_000_000,
    tier: "Dangerous",
    wins: 32,
    losses: 8,
    currentWinStreak: 6
  }
];
