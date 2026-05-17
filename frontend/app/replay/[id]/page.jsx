"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../auth-context";
import {
  BrandNav,
  CinematicButton,
  PageBackground,
  PosterPanel,
  formatBounty
} from "../../components/wanted-ui";
import { FogOverlay } from "../../components/blindMode/fogRenderer";
import {
  BLIND_HUNT_MODE,
  buildVisibleBoardSquares
} from "../../components/blindMode/visibilityEngine";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

const PIECE_LABELS = {
  1: "P1",
  2: "P2",
  3: "K",
  4: "K"
};

export default function ReplayPage({ params }) {
  const auth = useAuth();
  const router = useRouter();
  const [replay, setReplay] = useState(null);
  const [step, setStep] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState("");
  const [coachAnalysis, setCoachAnalysis] = useState(null);
  const [coachUsage, setCoachUsage] = useState(null);
  const [coachError, setCoachError] = useState("");
  const [isCoachLoading, setIsCoachLoading] = useState(false);
  const [activeInsightId, setActiveInsightId] = useState("");
  const [visionMode, setVisionMode] = useState("full");

  useEffect(() => {
    if (!auth.isAuthLoading && !auth.isAuthenticated) router.push("/login");
  }, [auth.isAuthLoading, auth.isAuthenticated, router]);

  useEffect(() => {
    if (!auth.isAuthenticated) return;

    async function loadReplay() {
      setError("");
      try {
        const response = await fetch(`${API_URL}/api/matches/${params.id}/replay`, {
          headers: auth.authHeaders(),
          cache: "no-store"
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error ?? "Could not load replay.");
        setReplay(payload);
        setStep(0);
        setVisionMode("full");
      } catch (caughtError) {
        setError(caughtError.message);
      }
    }

    loadReplay();
  }, [auth, params.id]);

  const snapshots = replay?.snapshots?.length ? replay.snapshots : [replay?.initialBoard ?? Array(32).fill(0)];
  const maxStep = snapshots.length - 1;
  const board = snapshots[Math.min(step, maxStep)] ?? Array(32).fill(0);
  const currentMove = step > 0 ? replay?.moves?.[step - 1] : null;
  const bountyChange = useMemo(() => resolveBountyChange(replay), [replay]);
  const visionPlayer = visionMode === "p1" ? 1 : visionMode === "p2" ? 2 : null;

  async function analyzeMatch() {
    setIsCoachLoading(true);
    setCoachError("");

    try {
      const response = await fetch(`${API_URL}/api/matches/${params.id}/analysis`, {
        method: "POST",
        headers: auth.authHeaders()
      });
      const payload = await response.json();
      if (!response.ok && !payload.proRequired) throw new Error(payload.error ?? "Could not analyze match.");
      if (payload.proRequired) {
        setCoachAnalysis(null);
        setCoachUsage(payload.usage);
        setCoachError(payload.error);
        return;
      }
      setCoachAnalysis(payload.analysis);
      setCoachUsage(payload.usage);
    } catch (caughtError) {
      setCoachError(caughtError.message);
    } finally {
      setIsCoachLoading(false);
    }
  }

  function jumpToInsight(insight) {
    setIsPlaying(false);
    setActiveInsightId(insight.id);
    setStep(Math.max(0, Math.min(maxStep, insight.step ?? insight.moveNumber ?? 0)));
  }

  useEffect(() => {
    if (!isPlaying) return undefined;
    if (step >= maxStep) {
      setIsPlaying(false);
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      setStep((current) => {
        if (current >= maxStep) {
          window.clearInterval(intervalId);
          setIsPlaying(false);
          return current;
        }
        return current + 1;
      });
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [isPlaying, maxStep, step]);

  if (auth.isAuthLoading || (!replay && !error)) {
    return (
      <PageBackground>
        <BrandNav auth={auth} active="profile" compact />
        <div className="p-8 text-stone-100">Loading replay...</div>
      </PageBackground>
    );
  }

  return (
    <PageBackground>
      <BrandNav auth={auth} active="profile" compact />
      <div className="mx-auto flex min-h-[calc(100vh-88px)] w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase text-red-300">Replay ledger</p>
            <h1 className="mt-2 text-5xl font-black uppercase tracking-normal text-amber-100 sm:text-7xl">
              Match Replay
            </h1>
          </div>
          <div className="flex flex-wrap gap-3">
            <CinematicButton href="/profile" variant="dark">Back to Profile</CinematicButton>
            <CinematicButton href="/play">Play</CinematicButton>
          </div>
        </header>

        {error ? <PosterPanel className="p-5 text-red-950">{error}</PosterPanel> : null}

        {replay ? (
          <section className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
            <div className="mx-auto w-full max-w-[720px]">
              <ReplayBoard board={board} lastMove={currentMove} visionPlayer={visionPlayer} />
            </div>

            <PosterPanel className="space-y-4 p-5">
              <div>
                <p className="text-sm font-black uppercase text-stone-800">Players</p>
                <h2 className="mt-1 text-2xl font-black tracking-normal text-stone-950">
                  {replay.players.playerOne.username} vs {replay.players.playerTwo.username}
                </h2>
              </div>

              <InfoRow label="Result" value={resultLabel(replay.result)} />
              <InfoRow label="Mode" value={modeLabel(replay.mode)} />
              <InfoRow label="Opponent" value={replay.opponent} />
              <InfoRow label="Bounty" value={`${bountyChange > 0 ? "+" : ""}${formatBounty(bountyChange)}`} />
              <InfoRow label="Move" value={`${step} / ${maxStep}`} />
              <InfoRow label="Date" value={formatDate(replay.createdAt)} />

              {replay.mode === BLIND_HUNT_MODE ? (
                <div className="rounded-md border border-stone-950/30 bg-stone-950/10 p-3">
                  <p className="text-xs font-black uppercase text-stone-700">Blind Hunt Vision</p>
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    {[
                      ["full", "Full"],
                      ["p1", "P1"],
                      ["p2", "P2"]
                    ].map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setVisionMode(value)}
                        className={visionMode === value ? "poster-button px-2 py-2 text-xs" : "dark-button px-2 py-2 text-xs"}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="rounded-md border border-stone-950/30 bg-stone-950/10 p-3">
                <p className="text-xs font-black uppercase text-stone-700">Current Step</p>
                <p className="mt-1 text-lg font-black text-stone-950">
                  {currentMove ? moveLabel(currentMove) : "Initial board"}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setStep((value) => Math.max(0, value - 1))} disabled={step === 0} className="dark-button disabled:opacity-60">
                  Previous
                </button>
                <button type="button" onClick={() => setStep((value) => Math.min(maxStep, value + 1))} disabled={step === maxStep} className="poster-button disabled:opacity-60">
                  Next
                </button>
                <button type="button" onClick={() => setIsPlaying(true)} disabled={isPlaying || step === maxStep} className="poster-button disabled:opacity-60">
                  Auto-play
                </button>
                <button type="button" onClick={() => setIsPlaying(false)} disabled={!isPlaying} className="blood-button disabled:opacity-60">
                  Pause
                </button>
                <button type="button" onClick={() => { setIsPlaying(false); setStep(0); }} className="dark-button col-span-2">
                  Reset
                </button>
              </div>

              <CoachPanel
                analysis={coachAnalysis}
                usage={coachUsage}
                error={coachError}
                isLoading={isCoachLoading}
                activeInsightId={activeInsightId}
                onAnalyze={analyzeMatch}
                onSelectInsight={jumpToInsight}
              />
            </PosterPanel>
          </section>
        ) : null}
      </div>
    </PageBackground>
  );
}

function CoachPanel({ analysis, usage, error, isLoading, activeInsightId, onAnalyze, onSelectInsight }) {
  const proLocked = error === "AI Coach Pro Required";

  return (
    <section className="rounded-md border border-stone-950/35 bg-stone-950/10 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase text-red-900">AI Coach</p>
          <h3 className="text-2xl font-black tracking-normal text-stone-950">Tactical Debrief</h3>
        </div>
        <button type="button" onClick={onAnalyze} disabled={isLoading} className="poster-button px-3 py-2 text-xs disabled:opacity-60">
          {isLoading ? "Analyzing..." : analysis ? "Refresh View" : "Analyze Match"}
        </button>
      </div>

      {usage ? (
        <p className="mt-3 text-xs font-black uppercase text-stone-700">
          Free analyses today: {usage.usedToday}/{usage.limit}
        </p>
      ) : null}

      {proLocked ? (
        <div className="mt-4 rounded-md border border-amber-500/60 bg-stone-950 p-4 text-amber-100 shadow-lg shadow-amber-950/40">
          <p className="text-xs font-black uppercase text-red-300">AI Coach Pro Required</p>
          <p className="mt-2 text-2xl font-black uppercase tracking-normal">Unlock deeper bounty wisdom</p>
          <p className="mt-2 text-sm font-semibold text-amber-100/80">
            Free players can run 3 analyses per day. This upgrade button is presentation-only for the MVP.
          </p>
          <button type="button" className="poster-button mt-4 w-full">
            Upgrade to Pro
          </button>
        </div>
      ) : null}

      {error && !proLocked ? <p className="mt-3 rounded-md bg-red-950/80 px-3 py-2 text-sm text-red-100">{error}</p> : null}

      {analysis ? (
        <div className="mt-4 space-y-3">
          <div className="rounded-md border border-stone-950/30 bg-stone-50/20 p-3">
            <p className="text-xs font-black uppercase text-stone-700">
              {analysis.provider === "local+grok" ? "Local analysis + Grok wording" : "Local heuristic analysis"}
              {analysis.cached ? " - cached" : ""}
            </p>
            <p className="mt-1 text-sm font-bold text-stone-900">{analysis.summary}</p>
          </div>

          {analysis.insights.length === 0 ? (
            <p className="rounded-md border border-stone-950/30 bg-stone-50/20 p-3 text-sm font-bold text-stone-800">
              No major tactical moments detected.
            </p>
          ) : null}

          {analysis.insights.map((insight) => (
            <button
              key={insight.id}
              type="button"
              onClick={() => onSelectInsight(insight)}
              className={[
                "w-full rounded-md border p-3 text-left transition hover:-translate-y-0.5",
                activeInsightId === insight.id
                  ? "border-amber-500 bg-amber-200/35 shadow-lg shadow-amber-900/20"
                  : "border-stone-950/30 bg-stone-50/20"
              ].join(" ")}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-black uppercase text-red-900">{insight.tacticalLabel}</span>
                <span className={`rounded px-2 py-1 text-[10px] font-black uppercase ${severityClass(insight.severity)}`}>
                  {insight.severity}
                </span>
              </div>
              <h4 className="mt-2 text-lg font-black tracking-normal text-stone-950">
                Move {insight.moveNumber}: {insight.label}
              </h4>
              <p className="mt-1 text-sm font-semibold text-stone-800">{insight.explanation}</p>
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function ReplayBoard({ board, lastMove, visionPlayer }) {
  const highlighted = new Set([lastMove?.from, lastMove?.to].filter((value) => Number.isInteger(value)));
  const visibleBoardSquares = useMemo(
    () => (visionPlayer ? buildVisibleBoardSquares(board, visionPlayer) : null),
    [board, visionPlayer]
  );

  return (
    <div className="game-board-frame aspect-square w-full overflow-hidden p-2">
      <div className="grid h-full w-full grid-cols-8 grid-rows-8">
        {Array.from({ length: 64 }, (_, square) => {
          const row = Math.floor(square / 8);
          const col = square % 8;
          const isPlayable = (row + col) % 2 === 1;
          const playableIndex = isPlayable ? row * 4 + Math.floor(col / 2) : null;
          const piece = playableIndex === null ? 0 : board[playableIndex];
          const isHighlighted = playableIndex !== null && highlighted.has(playableIndex);
          const isHiddenByFog = Boolean(visibleBoardSquares && !visibleBoardSquares.has(square));

          return (
            <div
              key={square}
              className={[
                "relative flex items-center justify-center",
                isPlayable ? "game-square-dark" : "game-square-light",
                isHiddenByFog ? "blind-square-hidden" : "",
                isHighlighted ? "inset-ring" : ""
              ].join(" ")}
            >
              {piece !== 0 && !isHiddenByFog ? <ReplayPiece piece={piece} /> : null}
              <FogOverlay hidden={isHiddenByFog} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ReplayPiece({ piece }) {
  const isPlayerOne = piece === 1 || piece === 3;

  return (
    <span
      className={[
        "flex h-[72%] w-[72%] items-center justify-center rounded-full border-4 text-xs font-black shadow-lg sm:text-sm",
        isPlayerOne
          ? "border-red-950 bg-gradient-to-br from-red-600 to-red-950 text-red-50 shadow-red-950/60"
          : "border-stone-950 bg-gradient-to-br from-stone-50 to-amber-200 text-stone-950 shadow-black/70"
      ].join(" ")}
    >
      {PIECE_LABELS[piece]}
    </span>
  );
}

function InfoRow({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-stone-950/30 pb-3 text-sm">
      <span className="font-black uppercase text-stone-800">{label}</span>
      <span className="max-w-[180px] truncate font-black text-stone-950">{value}</span>
    </div>
  );
}

function moveLabel(move) {
  if (move.type === "resign") return `Player ${move.player} resigned`;
  if (move.type === "timeout") return `Player ${move.player} lost on time`;
  const capture = move.capturedSquares?.length ? " capture" : "";
  const promoted = move.promoted ? " promotion" : "";
  return `P${move.player}: ${move.from} to ${move.to}${capture}${promoted}`;
}

function resultLabel(result) {
  if (result === "win") return "Victory";
  if (result === "loss") return "Defeat";
  return "Draw";
}

function modeLabel(mode) {
  if (mode === "vs_ai") return "vs AI";
  if (mode === "multiplayer") return "Online Duel";
  if (mode === "blitz") return "Blitz Duel";
  if (mode === BLIND_HUNT_MODE) return "Blind Hunt";
  return "Local PvP";
}

function severityClass(severity) {
  if (severity === "critical") return "bg-red-950 text-red-100";
  if (severity === "high") return "bg-red-800 text-red-50";
  if (severity === "medium") return "bg-amber-800 text-amber-50";
  return "bg-stone-800 text-stone-100";
}

function resolveBountyChange(replay) {
  if (!replay?.finalResult) return 0;
  if (replay.result === "win") return Number(replay.finalResult.bountyGain ?? 0);
  if (replay.result === "loss") return -Number(replay.finalResult.bountyLoss ?? 0);
  return 0;
}

function formatDate(value) {
  if (!value) return "Unknown date";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}
