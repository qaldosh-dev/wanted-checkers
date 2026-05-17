"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../auth-context";
import {
  BrandNav,
  CinematicButton,
  PageBackground,
  PosterPanel,
  ProUpgradeButton,
  formatBounty,
  buildAvatarUrl,
  toAvatarSrc,
  usePieceSkin
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
  const [visionMode, setVisionMode] = useState("full");
  const [coachStepIndex, setCoachStepIndex] = useState(0);
  const [coachReplay, setCoachReplay] = useState(null);
  const [pieceSkin] = usePieceSkin();
  const autoCoachStartedRef = useRef(false);

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
  const coachInsights = coachAnalysis?.insights ?? [];
  const activeInsight = coachInsights[coachStepIndex] ?? null;
  const replayOwnPlayerNumber = resolveReplayOwnPlayerNumber(replay, auth.user?.id);
  const pieceAvatarSrc = toAvatarSrc(auth.user?.avatarUrl ?? "") || buildAvatarUrl(auth.user?.username ?? "wanted");

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
      setCoachStepIndex(0);
    } catch (caughtError) {
      setCoachError(caughtError.message);
    } finally {
      setIsCoachLoading(false);
    }
  }

  function jumpToInsight(insight, index = coachStepIndex) {
    setIsPlaying(false);
    setCoachReplay(null);
    setCoachStepIndex(index);
    setStep(insightStep(insight, maxStep));
  }

  function autoReplayInsight(insight, index = coachStepIndex) {
    const target = insightStep(insight, maxStep);
    const start = Math.max(0, target - 1);
    const end = Math.min(maxStep, target + 2);
    setIsPlaying(false);
    setCoachStepIndex(index);
    setStep(start);
    setCoachReplay({ end });
  }

  useEffect(() => {
    if (!replay || autoCoachStartedRef.current || typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("coach") !== "1") return;
    autoCoachStartedRef.current = true;
    analyzeMatch();
  }, [replay]);

  useEffect(() => {
    if (!isPlaying) return undefined;
    setCoachReplay(null);
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

  useEffect(() => {
    if (!coachReplay) return undefined;

    const intervalId = window.setInterval(() => {
      setStep((current) => {
        if (current >= coachReplay.end) {
          window.clearInterval(intervalId);
          setCoachReplay(null);
          return current;
        }

        const next = Math.min(coachReplay.end, current + 1);
        if (next >= coachReplay.end) {
          window.setTimeout(() => setCoachReplay(null), 0);
        }
        return next;
      });
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [coachReplay]);

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
          <div className="space-y-6">
            <section className="grid items-start gap-6 xl:grid-cols-[minmax(0,720px)_minmax(320px,1fr)]">
              <div className="mx-auto w-full max-w-[720px] xl:mx-0">
                <ReplayBoard
                  board={board}
                  lastMove={currentMove}
                  visionPlayer={visionPlayer}
                  coachActive={Boolean(activeInsight && step === insightStep(activeInsight, maxStep))}
                  ownPlayerNumber={replayOwnPlayerNumber}
                  ownPieceSkin={pieceSkin}
                  ownAvatarSrc={pieceAvatarSrc}
                />
              </div>

              <CompactReplayPanel
                replay={replay}
                bountyChange={bountyChange}
                step={step}
                maxStep={maxStep}
                currentMove={currentMove}
                isPlaying={isPlaying}
                visionMode={visionMode}
                onVisionModeChange={setVisionMode}
                onPrevious={() => setStep((value) => Math.max(0, value - 1))}
                onNext={() => setStep((value) => Math.min(maxStep, value + 1))}
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                onReset={() => {
                  setIsPlaying(false);
                  setStep(0);
                }}
              />
            </section>

            <CoachPanel
              analysis={coachAnalysis}
              usage={coachUsage}
              error={coachError}
              isLoading={isCoachLoading}
              currentIndex={coachStepIndex}
              isCoachReplaying={Boolean(coachReplay)}
              onAnalyze={analyzeMatch}
              onSelectIndex={setCoachStepIndex}
              onJump={jumpToInsight}
              onAutoReplay={autoReplayInsight}
            />
          </div>
        ) : null}
      </div>
    </PageBackground>
  );
}

function CompactReplayPanel({
  replay,
  bountyChange,
  step,
  maxStep,
  currentMove,
  isPlaying,
  visionMode,
  onVisionModeChange,
  onPrevious,
  onNext,
  onPlay,
  onPause,
  onReset
}) {
  return (
    <PosterPanel className="space-y-4 p-5 xl:sticky xl:top-24">
      <div>
        <p className="text-sm font-black uppercase text-stone-800">Match Ledger</p>
        <h2 className="mt-1 text-2xl font-black tracking-normal text-stone-950">
          {replay.players.playerOne.username} vs {replay.players.playerTwo.username}
        </h2>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
        <InfoRow label="Result" value={resultLabel(replay.result)} />
        <InfoRow label="Mode" value={modeLabel(replay.mode)} />
        <InfoRow label="Opponent" value={replay.opponent} />
        <InfoRow label="Bounty" value={`${bountyChange > 0 ? "+" : ""}${formatBounty(bountyChange)}`} />
        <InfoRow label="Move" value={`${step} / ${maxStep}`} />
        <InfoRow label="Date" value={formatDate(replay.createdAt)} />
      </div>

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
                onClick={() => onVisionModeChange(value)}
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
        <button type="button" onClick={onPrevious} disabled={step === 0} className="dark-button disabled:opacity-60">
          Previous
        </button>
        <button type="button" onClick={onNext} disabled={step === maxStep} className="poster-button disabled:opacity-60">
          Next
        </button>
        <button type="button" onClick={onPlay} disabled={isPlaying || step === maxStep} className="poster-button disabled:opacity-60">
          Auto-play
        </button>
        <button type="button" onClick={onPause} disabled={!isPlaying} className="blood-button disabled:opacity-60">
          Pause
        </button>
        <button type="button" onClick={onReset} className="dark-button col-span-2">
          Reset
        </button>
      </div>
    </PosterPanel>
  );
}

function CoachPanel({ analysis, usage, error, isLoading, currentIndex, isCoachReplaying, onAnalyze, onSelectIndex, onJump, onAutoReplay }) {
  const proLocked = error === "AI Coach Pro Required";
  const insights = analysis?.insights ?? [];
  const activeInsight = insights[currentIndex] ?? null;

  return (
    <section id="coach" className="rounded-md border border-amber-700/45 bg-stone-950/35 p-4 shadow-2xl shadow-black/35 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase text-red-300">AI Coach</p>
          <h3 className="text-3xl font-black uppercase tracking-normal text-amber-100 sm:text-4xl">Guided Tactical Review</h3>
        </div>
        <button type="button" onClick={onAnalyze} disabled={isLoading} className="poster-button px-3 py-2 text-xs disabled:opacity-60">
          {isLoading ? "Analyzing..." : analysis ? "Refresh View" : "Analyze Match"}
        </button>
      </div>

      {usage ? (
        <p className="mt-3 text-xs font-black uppercase text-amber-100/75">
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
          <ProUpgradeButton className="mt-4 w-full justify-center" label="Upgrade to Pro" />
        </div>
      ) : null}

      {error && !proLocked ? <p className="mt-3 rounded-md bg-red-950/80 px-3 py-2 text-sm text-red-100">{error}</p> : null}

      {analysis ? (
        <div className="mt-5 space-y-4">
          <div className="rounded-md border border-amber-700/35 bg-amber-100/90 p-4 shadow-lg shadow-black/20">
            <p className="text-xs font-black uppercase text-stone-700">
              {analysis.provider === "local+grok" ? "Local analysis + Grok wording" : "Local heuristic analysis"}
              {analysis.cached ? " - cached" : ""}
            </p>
            <p className="mt-1 text-sm font-bold text-stone-900">{analysis.summary}</p>
          </div>

          {insights.length === 0 ? (
            <p className="rounded-md border border-amber-700/35 bg-amber-100/90 p-3 text-sm font-bold text-stone-800">
              No major tactical moments detected.
            </p>
          ) : null}

          {activeInsight ? (
            <GuidedCoachMoment
              insight={activeInsight}
              index={currentIndex}
              total={insights.length}
              isCoachReplaying={isCoachReplaying}
              onJump={() => onJump(activeInsight, currentIndex)}
              onAutoReplay={() => onAutoReplay(activeInsight, currentIndex)}
              onPrevious={() => onSelectIndex(Math.max(0, currentIndex - 1))}
              onNext={() => onSelectIndex(Math.min(insights.length - 1, currentIndex + 1))}
            />
          ) : null}

          {insights.length > 0 ? (
            <div className="rounded-md border border-amber-700/35 bg-amber-100/90 p-3">
              <p className="text-xs font-black uppercase text-stone-700">Review Progress</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {insights.map((insight, index) => (
                  <button
                    key={insight.id}
                    type="button"
                    onClick={() => onSelectIndex(index)}
                    className={[
                      "grid h-9 w-9 place-items-center rounded-md border text-xs font-black transition",
                      index === currentIndex
                        ? "border-amber-600 bg-amber-300/60 text-stone-950 shadow-lg shadow-amber-900/20"
                        : "border-stone-950/30 bg-stone-50/20 text-stone-800 hover:bg-amber-200/30"
                    ].join(" ")}
                    aria-label={`Open coaching moment ${index + 1}`}
                  >
                    {index + 1}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function GuidedCoachMoment({ insight, index, total, isCoachReplaying, onJump, onAutoReplay, onPrevious, onNext }) {
  const kind = reviewKind(insight);

  return (
    <article key={insight.id} className="coach-moment-card rounded-md border border-amber-800/35 bg-amber-100/95 p-4 shadow-xl shadow-black/25 sm:p-5">
      <div className="grid gap-5 lg:grid-cols-[0.42fr_0.58fr] lg:items-stretch">
        <div className="flex flex-col justify-between gap-4 rounded-md border border-stone-950/25 bg-stone-950/10 p-4">
          <div>
            <p className="text-xs font-black uppercase text-red-900">
              {kind} {index + 1} of {total}
            </p>
            <h4 className="mt-1 text-3xl font-black uppercase tracking-normal text-stone-950 sm:text-4xl">
              {insight.label}
            </h4>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            <div className="rounded-md border border-stone-950/25 bg-stone-50/30 p-3">
              <p className="text-[11px] font-black uppercase text-stone-700">Category</p>
              <p className="mt-1 text-lg font-black uppercase text-stone-950">{insight.tacticalLabel}</p>
            </div>
            <div className="rounded-md border border-stone-950/25 bg-stone-50/30 p-3">
              <p className="text-[11px] font-black uppercase text-stone-700">Move</p>
              <p className="mt-1 text-lg font-black uppercase text-stone-950">{insight.moveNumber}</p>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <div className="flex items-start justify-between gap-3">
            <p className="text-[11px] font-black uppercase text-red-900">Coach Explanation</p>
            <span className={`w-fit rounded px-3 py-2 text-[10px] font-black uppercase ${severityClass(insight.severity)}`}>
              {insight.severity}
            </span>
          </div>
          <div className="flex min-h-[150px] flex-1 items-center rounded-md border border-amber-900/25 bg-stone-50/35 p-4 text-left">
            <p className="text-base font-bold leading-relaxed text-stone-900 sm:text-lg">{insight.explanation}</p>
          </div>

          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <button type="button" onClick={onJump} className="poster-button">
              Jump to Moment
            </button>
            <button type="button" onClick={onAutoReplay} disabled={isCoachReplaying} className="dark-button disabled:cursor-wait disabled:opacity-70">
              {isCoachReplaying ? "Replaying..." : "Auto Replay"}
            </button>
            <button type="button" onClick={onPrevious} disabled={index === 0} className="dark-button disabled:opacity-50">
              Previous
            </button>
            <button type="button" onClick={onNext} disabled={index >= total - 1} className="poster-button disabled:opacity-50">
              Next
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}

function ReplayBoard({ board, lastMove, visionPlayer, coachActive, ownPlayerNumber = 1, ownPieceSkin = "classic", ownAvatarSrc = "" }) {
  const highlighted = new Set([lastMove?.from, lastMove?.to].filter((value) => Number.isInteger(value)));
  const visibleBoardSquares = useMemo(
    () => (visionPlayer ? buildVisibleBoardSquares(board, visionPlayer) : null),
    [board, visionPlayer]
  );

  return (
    <div className={`game-board-frame aspect-square w-full overflow-hidden p-2 ${coachActive ? "coach-board-focus" : ""}`}>
      <div className="grid h-full w-full grid-cols-8 grid-rows-8">
        {Array.from({ length: 64 }, (_, square) => {
          const row = Math.floor(square / 8);
          const col = square % 8;
          const isPlayable = (row + col) % 2 === 1;
          const playableIndex = isPlayable ? row * 4 + Math.floor(col / 2) : null;
          const piece = playableIndex === null ? 0 : board[playableIndex];
          const skin = resolvePieceSkin(piece, ownPlayerNumber, ownPieceSkin);
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
              {piece !== 0 && !isHiddenByFog ? <ReplayPiece piece={piece} skin={skin} avatarSrc={skin === "avatar" ? ownAvatarSrc : ""} /> : null}
              <FogOverlay hidden={isHiddenByFog} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ReplayPiece({ piece, skin = "classic", avatarSrc = "" }) {
  const isPlayerOne = piece === 1 || piece === 3;
  const isKing = piece === 3 || piece === 4;

  return (
    <span
      className={[
        "flex h-[72%] w-[72%] items-center justify-center rounded-full border-4 text-xs font-black shadow-lg sm:text-sm",
        pieceSkinClassName(skin, isPlayerOne),
        isKing ? "king-piece-aura" : ""
      ].join(" ")}
    >
      <PieceFace piece={piece} skin={skin} avatarSrc={avatarSrc} />
    </span>
  );
}

function PieceFace({ piece, skin, avatarSrc }) {
  const isKing = piece === 3 || piece === 4;
  const [avatarFailed, setAvatarFailed] = useState(false);
  const showAvatar = skin === "avatar" && avatarSrc && !avatarFailed;

  return (
    <>
      {showAvatar ? (
        <img
          src={avatarSrc}
          alt=""
          draggable={false}
          className="piece-avatar-face"
          onError={() => setAvatarFailed(true)}
        />
      ) : null}
      <span className={`piece-face-label ${showAvatar && !isKing ? "sr-only" : ""}`}>
        {isKing ? "K" : PIECE_LABELS[piece]}
      </span>
    </>
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

function resolveReplayOwnPlayerNumber(replay, userId) {
  if (!replay || !userId) return 1;
  const playerOneId = replay.players?.playerOne?.userId ?? replay.players?.playerOne?.id;
  const playerTwoId = replay.players?.playerTwo?.userId ?? replay.players?.playerTwo?.id;
  if (Number(playerTwoId) === Number(userId)) return 2;
  if (Number(playerOneId) === Number(userId)) return 1;
  return 1;
}

function resolvePieceSkin(piece, ownPlayerNumber, ownPieceSkin) {
  return pieceOwner(piece) === ownPlayerNumber ? ownPieceSkin : "classic";
}

function pieceOwner(piece) {
  if (piece === 1 || piece === 3) return 1;
  if (piece === 2 || piece === 4) return 2;
  return 0;
}

function pieceSkinClassName(skin, isPlayerOne) {
  if (skin === "crimson") return "piece-skin-crimson text-red-50";
  if (skin === "ivory") return "piece-skin-ivory text-stone-950";
  if (skin === "avatar") return "piece-skin-avatar text-amber-50";
  return isPlayerOne
    ? "border-red-950 bg-gradient-to-br from-red-600 to-red-950 text-red-50 shadow-red-950/60"
    : "border-stone-950 bg-gradient-to-br from-stone-50 to-amber-200 text-stone-950 shadow-black/70";
}

function insightStep(insight, maxStep) {
  return Math.max(0, Math.min(maxStep, insight?.step ?? insight?.moveNumber ?? 0));
}

function reviewKind(insight) {
  if (["strong_tactical_play", "smart_defense"].includes(insight.type)) return "Good Move";
  if (String(insight.type).includes("missed")) return "Opportunity";
  if (["critical", "high"].includes(insight.severity)) return "Mistake";
  return "Coaching Moment";
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
