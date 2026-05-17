"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../auth-context";
import {
  BountyAmount,
  BrandNav,
  CinematicButton,
  PageBackground,
  PosterPanel,
  TierBadge,
  formatBounty
} from "../components/wanted-ui";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

const MODE_LABELS = {
  localPvP: "Local PvP",
  vsAI: "vs AI",
  multiplayer: "Online",
  blitz: "Blitz",
  blindHunt: "Blind Hunt"
};

const AI_LABELS = {
  beginnerAI: "Beginner",
  intermediateAI: "Intermediate",
  expertAI: "Expert"
};

export default function StatsPage() {
  const auth = useAuth();
  const router = useRouter();
  const [stats, setStats] = useState(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!auth.isAuthLoading && !auth.isAuthenticated) router.push("/login");
  }, [auth.isAuthLoading, auth.isAuthenticated, router]);

  useEffect(() => {
    if (!auth.isAuthenticated) return;

    async function loadStats() {
      setIsLoading(true);
      setError("");
      try {
        const response = await fetch(`${API_URL}/api/players/me/stats`, {
          headers: auth.authHeaders(),
          cache: "no-store"
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error ?? "Could not load statistics.");
        setStats(payload.stats);
      } catch (caughtError) {
        setError(caughtError.message);
      } finally {
        setIsLoading(false);
      }
    }

    loadStats();
  }, [auth]);

  if (auth.isAuthLoading || isLoading) {
    return (
      <PageBackground>
        <BrandNav auth={auth} active="stats" compact />
        <div className="p-8 text-stone-100">Loading statistics...</div>
      </PageBackground>
    );
  }

  const core = stats?.core ?? {};
  const bounty = stats?.bounty ?? {};
  const ranks = stats?.ranks ?? {};

  return (
    <PageBackground>
      <BrandNav auth={auth} active="stats" />
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase text-red-300">Competitive ledger</p>
            <h1 className="mt-2 text-4xl font-black uppercase tracking-normal text-amber-100 sm:text-6xl">
              Statistics Dashboard
            </h1>
            <p className="mt-2 max-w-2xl text-base font-semibold text-stone-300">
              Your match record, bounty movement, regional standing, and recent form.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <CinematicButton href="/profile" variant="dark">Profile</CinematicButton>
            <CinematicButton href="/play">Play</CinematicButton>
          </div>
        </header>

        {error ? <p className="mt-6 rounded-md bg-red-950/80 px-3 py-2 text-sm text-red-100">{error}</p> : null}

        {stats ? (
          <div className="mt-8 space-y-6">
            <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <HeroStat label="Total Games" value={core.totalGames ?? 0} />
              <HeroStat label="Win Rate" value={`${core.winRate ?? 0}%`} />
              <HeroStat label="Current Streak" value={core.currentWinStreak ?? 0} />
              <HeroStat label="Best Streak" value={core.bestWinStreak ?? 0} />
            </section>

            <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
              <PosterPanel className="p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-sm font-black uppercase text-stone-800">Bounty Standing</p>
                    <BountyAmount value={core.bounty ?? 0} className="mt-2 block text-5xl sm:text-6xl" />
                  </div>
                  <div className="flex flex-col items-start gap-2 sm:items-end">
                    <TierBadge tier={core.tier ?? "Unknown"} />
                    <p className="text-xs font-black uppercase text-stone-700">
                      KZ {ranks.nationalRank ? `#${ranks.nationalRank}` : "unranked"}
                      {ranks.regionalRank ? ` / ${ranks.region} #${ranks.regionalRank}` : ""}
                    </p>
                  </div>
                </div>
                {ranks.prestigeLabel ? (
                  <p className="mt-4 rounded-md border border-amber-800 bg-amber-300/30 px-3 py-2 text-center text-xs font-black uppercase text-stone-950">
                    {ranks.prestigeLabel}
                  </p>
                ) : null}
                <BountyTrendChart data={stats.bountyTrend ?? []} />
              </PosterPanel>

              <PosterPanel className="p-5">
                <p className="text-sm font-black uppercase text-stone-800">Win / Loss / Draw</p>
                <div className="mt-4 grid items-center gap-5 sm:grid-cols-[180px_1fr] xl:grid-cols-1">
                  <ResultDonut wins={core.wins ?? 0} losses={core.losses ?? 0} draws={core.draws ?? 0} />
                  <div className="grid grid-cols-3 gap-2">
                    <SmallStat label="Wins" value={core.wins ?? 0} tone="gold" />
                    <SmallStat label="Losses" value={core.losses ?? 0} tone="red" />
                    <SmallStat label="Draws" value={core.draws ?? 0} tone="stone" />
                  </div>
                </div>
              </PosterPanel>
            </section>

            <section className="grid gap-6 lg:grid-cols-2">
              <PosterPanel className="p-5">
                <p className="text-sm font-black uppercase text-stone-800">Mode Breakdown</p>
                <ModeBreakdown data={stats.byMode ?? {}} />
              </PosterPanel>

              <PosterPanel className="p-5">
                <p className="text-sm font-black uppercase text-stone-800">AI Difficulty Record</p>
                <AIStats data={stats.aiStats ?? {}} />
              </PosterPanel>
            </section>

            <section className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
              <PosterPanel className="p-5">
                <p className="text-sm font-black uppercase text-stone-800">Bounty Economy</p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <SmallStat label="Total Gained" value={formatBounty(bounty.totalBountyGained ?? 0)} tone="gold" />
                  <SmallStat label="Total Lost" value={formatBounty(bounty.totalBountyLost ?? 0)} tone="red" />
                  <SmallStat label="Average / Win" value={formatBounty(bounty.averageBountyPerWin ?? 0)} tone="stone" />
                  <SmallStat label="Highest Gain" value={formatBounty(bounty.highestBountyGain ?? 0)} tone="gold" />
                </div>
              </PosterPanel>

              <PosterPanel className="p-5">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <p className="text-sm font-black uppercase text-stone-800">Recent Form</p>
                    <h2 className="text-2xl font-black tracking-normal text-stone-950">Last 10 Matches</h2>
                  </div>
                  <p className="text-xs font-black uppercase text-stone-700">W / L / D</p>
                </div>
                <RecentForm data={stats.recentPerformance ?? {}} />
              </PosterPanel>
            </section>
          </div>
        ) : null}
      </div>
    </PageBackground>
  );
}

function HeroStat({ label, value }) {
  return (
    <PosterPanel className="p-5">
      <p className="text-xs font-black uppercase text-stone-800">{label}</p>
      <p className="mt-2 text-4xl font-black tracking-normal text-stone-950">{value}</p>
    </PosterPanel>
  );
}

function SmallStat({ label, value, tone = "stone" }) {
  const toneClass = tone === "gold" ? "text-amber-900" : tone === "red" ? "text-red-950" : "text-stone-950";
  return (
    <div className="rounded-md border border-stone-950/35 bg-stone-950/10 p-3">
      <p className="text-[11px] font-black uppercase text-stone-700">{label}</p>
      <p className={`mt-1 text-2xl font-black tracking-normal ${toneClass}`}>{value}</p>
    </div>
  );
}

function ResultDonut({ wins, losses, draws }) {
  const total = Math.max(1, wins + losses + draws);
  const winDeg = (wins / total) * 360;
  const lossDeg = (losses / total) * 360;
  const style = {
    background: `conic-gradient(#d97706 0deg ${winDeg}deg, #7f1d1d ${winDeg}deg ${winDeg + lossDeg}deg, #78716c ${winDeg + lossDeg}deg 360deg)`
  };

  return (
    <div className="mx-auto grid h-44 w-44 place-items-center rounded-full border border-stone-950/40 shadow-xl shadow-black/20" style={style}>
      <div className="grid h-28 w-28 place-items-center rounded-full border border-stone-950/30 bg-[#e5c07b] text-center">
        <span>
          <span className="block text-3xl font-black text-stone-950">{total === 1 && wins + losses + draws === 0 ? 0 : total}</span>
          <span className="text-[10px] font-black uppercase text-stone-700">Games</span>
        </span>
      </div>
    </div>
  );
}

function BountyTrendChart({ data }) {
  const points = useMemo(() => buildTrendPoints(data), [data]);
  const latest = data.at(-1)?.netBounty ?? 0;

  return (
    <div className="mt-5 rounded-md border border-stone-950/30 bg-stone-950/10 p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-black uppercase text-stone-700">Bounty Trend</p>
        <p className="text-sm font-black text-stone-950">Net {latest >= 0 ? "+" : ""}{formatBounty(latest)}</p>
      </div>
      <svg viewBox="0 0 420 150" role="img" aria-label="Bounty trend chart" className="mt-3 h-44 w-full overflow-visible">
        <path d="M0 125H420" stroke="rgba(41,37,36,0.28)" strokeWidth="2" />
        <path d="M0 25H420" stroke="rgba(41,37,36,0.18)" strokeWidth="1" />
        {points.path ? <path d={points.path} fill="none" stroke="#92400e" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" /> : null}
        {points.area ? <path d={points.area} fill="rgba(217,119,6,0.18)" /> : null}
        {points.circles.map((point) => (
          <circle key={`${point.x}-${point.y}`} cx={point.x} cy={point.y} r="4" fill="#7f1d1d" stroke="#f5d28a" strokeWidth="2" />
        ))}
        {points.circles.length === 0 ? (
          <text x="210" y="82" textAnchor="middle" className="fill-stone-800 text-[14px] font-black uppercase">
            No bounty movement yet
          </text>
        ) : null}
      </svg>
    </div>
  );
}

function ModeBreakdown({ data }) {
  const entries = Object.entries(MODE_LABELS).map(([key, label]) => ({
    key,
    label,
    ...(data[key] ?? { games: 0, wins: 0, losses: 0, draws: 0 })
  }));
  const maxGames = Math.max(1, ...entries.map((entry) => entry.games));

  return (
    <div className="mt-4 space-y-3">
      {entries.map((entry) => (
        <div key={entry.key}>
          <div className="mb-1 flex items-center justify-between text-xs font-black uppercase text-stone-800">
            <span>{entry.label}</span>
            <span>{entry.games} games</span>
          </div>
          <div className="h-4 overflow-hidden rounded-full border border-stone-950/30 bg-stone-950/10">
            <div className="h-full rounded-full bg-gradient-to-r from-red-950 via-amber-800 to-amber-300" style={{ width: `${(entry.games / maxGames) * 100}%` }} />
          </div>
          <p className="mt-1 text-xs font-bold text-stone-700">
            {entry.wins}W / {entry.losses}L / {entry.draws}D
          </p>
        </div>
      ))}
    </div>
  );
}

function AIStats({ data }) {
  return (
    <div className="mt-4 grid gap-3 sm:grid-cols-3">
      {Object.entries(AI_LABELS).map(([key, label]) => {
        const record = data[key] ?? { wins: 0, losses: 0, draws: 0 };
        return (
          <div key={key} className="rounded-md border border-stone-950/35 bg-stone-950/10 p-3 text-center">
            <p className="text-xs font-black uppercase text-stone-700">{label}</p>
            <p className="mt-2 text-3xl font-black text-stone-950">{record.wins}-{record.losses}</p>
            <p className="mt-1 text-xs font-bold uppercase text-stone-700">{record.draws} draws</p>
          </div>
        );
      })}
    </div>
  );
}

function RecentForm({ data }) {
  const results = data.results ?? [];
  const changes = data.bountyChanges ?? [];
  const modes = data.modeBreakdown ?? {};

  return (
    <div className="mt-4 space-y-4">
      <div className="flex flex-wrap gap-2">
        {results.length === 0 ? (
          <span className="rounded-md border border-stone-950/30 bg-stone-950/10 px-3 py-2 text-sm font-black uppercase text-stone-800">
            No completed matches yet
          </span>
        ) : null}
        {results.map((result, index) => (
          <span key={`${result}-${index}`} className={`grid h-11 w-11 place-items-center rounded-md border text-lg font-black ${resultClass(result)}`}>
            {result}
          </span>
        ))}
      </div>

      {changes.length > 0 ? (
        <div className="grid gap-2 sm:grid-cols-5">
          {changes.slice(0, 5).map((change, index) => (
            <div key={`${change}-${index}`} className="rounded-md border border-stone-950/30 bg-stone-950/10 p-2 text-center">
              <p className="text-[10px] font-black uppercase text-stone-700">Match {index + 1}</p>
              <p className={`text-sm font-black ${change >= 0 ? "text-amber-900" : "text-red-950"}`}>
                {change > 0 ? "+" : ""}{formatBounty(change)}
              </p>
            </div>
          ))}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {Object.entries(modes).map(([key, count]) => (
          <span key={key} className="rounded-md border border-stone-950/30 bg-stone-950/10 px-3 py-2 text-xs font-black uppercase text-stone-800">
            {MODE_LABELS[key] ?? key}: {count}
          </span>
        ))}
      </div>
    </div>
  );
}

function buildTrendPoints(data) {
  if (!Array.isArray(data) || data.length === 0) return { path: "", area: "", circles: [] };
  const values = data.map((point) => Number(point.netBounty ?? 0));
  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);
  const span = max === min ? 1 : max - min;
  const width = 420;
  const height = 120;
  const top = 15;
  const left = 8;
  const usableWidth = width - left * 2;
  const circles = values.map((value, index) => ({
    x: left + (data.length === 1 ? usableWidth / 2 : (index / (data.length - 1)) * usableWidth),
    y: top + height - ((value - min) / span) * height
  }));
  const path = circles.map((point, index) => `${index === 0 ? "M" : "L"}${point.x} ${point.y}`).join(" ");
  const first = circles[0];
  const last = circles.at(-1);
  const area = `${path} L${last.x} ${top + height} L${first.x} ${top + height} Z`;
  return { path, area, circles };
}

function resultClass(result) {
  if (result === "W") return "border-amber-700 bg-amber-300/30 text-amber-950";
  if (result === "L") return "border-red-900 bg-red-950/20 text-red-950";
  return "border-stone-800 bg-stone-950/10 text-stone-950";
}
