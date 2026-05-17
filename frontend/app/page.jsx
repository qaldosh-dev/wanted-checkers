"use client";

import {
  BoardMotif,
  BrandNav,
  CinematicButton,
  PageBackground,
  PosterPanel
} from "./components/wanted-ui";
import { useAuth } from "./auth-context";

const HERO_IMAGE_SRC = "/images/wanted-checkers-duel.png";

export default function LandingPage() {
  const auth = useAuth();

  return (
    <PageBackground>
      <BrandNav auth={auth} />

      <section className="mx-auto grid min-h-[calc(100vh-88px)] max-w-7xl items-center gap-10 px-4 py-10 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:px-8">
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

        <CinematicDuelHero />
      </section>
    </PageBackground>
  );
}

function CinematicDuelHero() {
  return (
    <div className="relative">
      <div className="pointer-events-none absolute -inset-5 rounded-[2rem] bg-amber-500/10 blur-3xl" />
      <figure className="hero-duel-card relative overflow-hidden rounded-xl border border-amber-700/25 bg-black shadow-2xl shadow-black/70">
        <img
          src={HERO_IMAGE_SRC}
          alt="Two original WANTED CHECKERS pieces facing each other in a cinematic bounty duel"
          className="aspect-[16/10] w-full object-cover object-center sm:aspect-[16/9] lg:min-h-[34rem]"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-black/20 via-transparent to-black/15" />
      </figure>
    </div>
  );
}
