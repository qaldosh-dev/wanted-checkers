"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { io } from "socket.io-client";
import { useAuth } from "../auth-context";
import {
  BrandNav,
  CinematicButton,
  PageBackground,
  PosterPanel,
  TierBadge,
  buildAvatarUrl,
  formatBounty,
  toAvatarSrc
} from "../components/wanted-ui";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

const PIECE_LABELS = {
  1: "P1",
  2: "P2",
  3: "K1",
  4: "K2"
};

const EMPTY_BOARD = Array(32).fill(0);
const RESULT_EFFECT_DURATION = 2200;

function useGameAudio() {
  const contextRef = useRef(null);
  const lastPlayedRef = useRef({});

  const ensureContext = useCallback(() => {
    if (typeof window === "undefined") return null;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;

    if (!contextRef.current) {
      contextRef.current = new AudioContextClass();
    }

    return contextRef.current;
  }, []);

  const unlock = useCallback(() => {
    const context = ensureContext();
    if (context?.state === "suspended") {
      context.resume().catch(() => {});
    }
  }, [ensureContext]);

  const play = useCallback((kind) => {
    const context = ensureContext();
    if (!context) return;

    const nowMs = typeof performance === "undefined" ? Date.now() : performance.now();
    if (nowMs - (lastPlayedRef.current[kind] ?? 0) < 110) return;
    lastPlayedRef.current[kind] = nowMs;

    if (context.state === "suspended") {
      context.resume().catch(() => {});
    }

    const now = context.currentTime;
    if (kind === "move") playClack(context, now, 0.09, 220, 520);
    if (kind === "capture") {
      playClack(context, now, 0.16, 110, 360);
      playNoiseHit(context, now, 0.045);
    }
    if (kind === "promotion") playPromotionSound(context, now);
    if (kind === "victory") playResultChord(context, now, [392, 494, 659], 0.12);
    if (kind === "defeat") playResultChord(context, now, [196, 155, 123], 0.1);
    if (kind === "draw") playResultChord(context, now, [220, 247], 0.075);
  }, [ensureContext]);

  return useMemo(() => ({ unlock, play }), [unlock, play]);
}

function playClack(context, startTime, gainValue, startFrequency, endFrequency) {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = "triangle";
  oscillator.frequency.setValueAtTime(startFrequency, startTime);
  oscillator.frequency.exponentialRampToValueAtTime(endFrequency, startTime + 0.045);
  gain.gain.setValueAtTime(0.0001, startTime);
  gain.gain.exponentialRampToValueAtTime(gainValue, startTime + 0.006);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.11);
  oscillator.connect(gain).connect(context.destination);
  oscillator.start(startTime);
  oscillator.stop(startTime + 0.12);
}

function playNoiseHit(context, startTime, gainValue) {
  const buffer = context.createBuffer(1, Math.floor(context.sampleRate * 0.07), context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let index = 0; index < data.length; index += 1) {
    data[index] = (Math.random() * 2 - 1) * (1 - index / data.length);
  }

  const source = context.createBufferSource();
  const gain = context.createGain();
  source.buffer = buffer;
  gain.gain.setValueAtTime(gainValue, startTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.08);
  source.connect(gain).connect(context.destination);
  source.start(startTime);
}

function playPromotionSound(context, startTime) {
  playResultChord(context, startTime, [330, 494, 740], 0.09, 0.32);
  playClack(context, startTime + 0.06, 0.09, 620, 980);
}

function playResultChord(context, startTime, frequencies, gainValue, duration = 0.45) {
  for (const [index, frequency] of frequencies.entries()) {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const offset = index * 0.035;
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(frequency, startTime + offset);
    gain.gain.setValueAtTime(0.0001, startTime + offset);
    gain.gain.exponentialRampToValueAtTime(gainValue / frequencies.length, startTime + offset + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + offset + duration);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(startTime + offset);
    oscillator.stop(startTime + offset + duration + 0.03);
  }
}

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
  const [socket, setSocket] = useState(null);
  const [socketStatus, setSocketStatus] = useState("offline");
  const [isQueueing, setIsQueueing] = useState(false);
  const [playerNumber, setPlayerNumber] = useState(null);
  const [opponent, setOpponent] = useState(null);
  const [playerSearch, setPlayerSearch] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [isSearchingPlayers, setIsSearchingPlayers] = useState(false);
  const [incomingChallenge, setIncomingChallenge] = useState(null);
  const [challengeMessage, setChallengeMessage] = useState("");
  const [friends, setFriends] = useState([]);
  const [friendRequests, setFriendRequests] = useState([]);
  const [friendsMessage, setFriendsMessage] = useState("");
  const [error, setError] = useState("");
  const gameAudio = useGameAudio();
  const previousGameRef = useRef(null);
  const [pieceMotion, setPieceMotion] = useState({
    animations: {},
    promotions: {},
    result: null
  });

  const moveTargets = useMemo(() => new Set(moves.map((move) => move.to)), [moves]);
  const isMultiplayer = gameMode === "multiplayer" || game?.mode === "multiplayer";
  const isMyTurn = !game || game.mode !== "multiplayer" || game.currentTurn === playerNumber;

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

  const loadFriends = useCallback(async () => {
    if (!auth.isAuthenticated) return;

    const [friendsResponse, requestsResponse] = await Promise.all([
      fetch(`${API_URL}/api/friends/list`, {
        headers: auth.authHeaders(),
        cache: "no-store"
      }),
      fetch(`${API_URL}/api/friends/requests`, {
        headers: auth.authHeaders(),
        cache: "no-store"
      })
    ]);
    const friendsPayload = await friendsResponse.json();
    const requestsPayload = await requestsResponse.json();
    if (!friendsResponse.ok) throw new Error(friendsPayload.error ?? "Could not load friends.");
    if (!requestsResponse.ok) throw new Error(requestsPayload.error ?? "Could not load friend requests.");
    setFriends(friendsPayload.friends);
    setFriendRequests(requestsPayload.requests);
  }, [auth]);

  useEffect(() => {
    if (auth.isAuthLoading || !auth.token) return undefined;

    const nextSocket = io(API_URL, {
      auth: { token: auth.token },
      transports: ["websocket", "polling"]
    });

    setSocket(nextSocket);
    setSocketStatus("connecting");

    nextSocket.on("connect", () => setSocketStatus("online"));
    nextSocket.on("disconnect", () => {
      setSocketStatus("offline");
      setIsQueueing(false);
    });
    nextSocket.on("connect_error", (caughtError) => {
      setSocketStatus("offline");
      setError(caughtError.message);
    });
    nextSocket.on("queue:waiting", () => {
      setIsQueueing(true);
      setError("");
    });
    nextSocket.on("queue:left", () => setIsQueueing(false));
    nextSocket.on("queue:matched", (payload) => {
      const nextPlayerNumber = payload.game.playerOneUserId === auth.user?.id ? 1 : 2;
      setPlayerNumber(nextPlayerNumber);
      setOpponent(nextPlayerNumber === 1 ? payload.players.playerTwo : payload.players.playerOne);
      setGameMode("multiplayer");
      setIsQueueing(false);
      setSelected(null);
      setMoves([]);
      setGame(payload.game);
      setSessionId(payload.game.gameId);
    });
    nextSocket.on("game:update", (payload) => {
      setGame(payload.game);
      setSelected(null);
      setMoves([]);
      setIsLoading(false);
    });
    nextSocket.on("game:finished", (payload) => {
      setGame(payload.game);
      setSelected(null);
      setMoves([]);
      setIsLoading(false);
    });
    nextSocket.on("game:error", (payload) => {
      setError(payload.message ?? "Live multiplayer error.");
      setIsLoading(false);
    });
    nextSocket.on("challenge:received", (payload) => {
      setIncomingChallenge(payload.challenge);
      setChallengeMessage("");
    });
    nextSocket.on("challenge:sent", (payload) => {
      setChallengeMessage(`Challenge sent to ${payload.challenge.target.username}.`);
    });
    nextSocket.on("challenge:accepted", (payload) => {
      setIncomingChallenge(null);
      setChallengeMessage(`${payload.challenge.target.username} accepted the duel.`);
      if (payload.game) setGame(payload.game);
    });
    nextSocket.on("challenge:declined", (payload) => {
      setIncomingChallenge((current) => (current?.id === payload.challenge?.id ? null : current));
      setChallengeMessage(
        payload.reason === "expired"
          ? "Challenge expired."
          : `${payload.challenge?.target?.username ?? "Player"} declined the challenge.`
      );
    });
    nextSocket.on("friend:request_received", (payload) => {
      setFriendsMessage(`${payload.requester.username} sent you a friend request.`);
      loadFriends().catch((caughtError) => setError(caughtError.message));
    });
    nextSocket.on("friend:request_accepted", (payload) => {
      setFriendsMessage(`${payload.friend.username} accepted your friend request.`);
      loadFriends().catch((caughtError) => setError(caughtError.message));
    });
    nextSocket.on("friend:request_declined", (payload) => {
      setFriendsMessage(`${payload.friend.username} declined your friend request.`);
      loadFriends().catch((caughtError) => setError(caughtError.message));
    });
    nextSocket.on("friend:list_updated", (payload) => {
      setFriends(payload.friends);
      setFriendRequests(payload.requests);
    });

    return () => {
      nextSocket.disconnect();
      setSocket(null);
    };
  }, [auth.isAuthLoading, auth.token, auth.user?.id, loadFriends]);

  const startGame = useCallback(async () => {
    if (!auth.isAuthenticated) return;
    if (gameMode === "multiplayer") {
      if (!socket?.connected) {
        setError("Live connection is not ready yet.");
        return;
      }
      setIsQueueing(true);
      setError("");
      setSelected(null);
      setMoves([]);
      socket.emit("queue:join");
      return;
    }

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
  }, [auth, opponentUserId, gameMode, aiDifficulty, socket]);

  const leaveQueue = useCallback(() => {
    socket?.emit("queue:leave");
    setIsQueueing(false);
  }, [socket]);

  const searchPlayers = useCallback(async () => {
    const query = playerSearch.trim();
    if (query.length < 2) {
      setSearchResults([]);
      return;
    }

    setIsSearchingPlayers(true);
    setError("");

    try {
      const response = await fetch(`${API_URL}/api/users/search?q=${encodeURIComponent(query)}`, {
        headers: auth.authHeaders(),
        cache: "no-store"
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Could not search players.");
      setSearchResults(payload.players);
    } catch (caughtError) {
      setError(caughtError.message);
      setSearchResults([]);
    } finally {
      setIsSearchingPlayers(false);
    }
  }, [auth, playerSearch]);

  function sendChallenge(username) {
    if (!socket?.connected) {
      setError("Live connection is not ready.");
      return;
    }

    setError("");
    setChallengeMessage("");
    socket.emit("challenge:send", { username });
  }

  async function sendFriendRequest(userId) {
    setError("");
    setFriendsMessage("");

    try {
      const response = await fetch(`${API_URL}/api/friends/request`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...auth.authHeaders() },
        body: JSON.stringify({ addresseeUserId: userId })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Could not send friend request.");
      setFriendsMessage("Friend request sent.");
      await loadFriends();
    } catch (caughtError) {
      setError(caughtError.message);
    }
  }

  async function answerFriendRequest(friendshipId, action) {
    setError("");
    setFriendsMessage("");

    try {
      const response = await fetch(`${API_URL}/api/friends/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...auth.authHeaders() },
        body: JSON.stringify({ friendshipId })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? `Could not ${action} friend request.`);
      setFriendsMessage(action === "accept" ? "Friend request accepted." : "Friend request declined.");
      await loadFriends();
    } catch (caughtError) {
      setError(caughtError.message);
    }
  }

  function acceptIncomingChallenge() {
    if (!incomingChallenge) return;
    socket?.emit("challenge:accept", { challengeId: incomingChallenge.id });
  }

  function declineIncomingChallenge() {
    if (!incomingChallenge) return;
    socket?.emit("challenge:decline", { challengeId: incomingChallenge.id });
    setIncomingChallenge(null);
  }

  useEffect(() => {
    if (auth.isAuthLoading || !auth.isAuthenticated) return;
    setSessionId(window.localStorage.getItem("wanted-checkers-session-id") ?? "");
    loadPlayers().catch((caughtError) => setError(caughtError.message));
    loadFriends().catch((caughtError) => setError(caughtError.message));
  }, [auth.isAuthLoading, auth.isAuthenticated, loadPlayers, loadFriends]);

  useEffect(() => {
    if (!game?.gameId) return undefined;
    if (game.mode === "multiplayer") return undefined;

    const intervalId = window.setInterval(() => {
      refreshGame(game.gameId).catch((caughtError) => setError(caughtError.message));
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [game?.gameId, refreshGame]);

  useEffect(() => {
    if (socket?.connected && game?.mode === "multiplayer" && game.gameId) {
      socket.emit("game:join", { gameId: game.gameId });
    }
  }, [socket, socketStatus, game?.mode, game?.gameId]);

  useEffect(() => {
    const previousGame = previousGameRef.current;
    if (!game) {
      previousGameRef.current = null;
      return;
    }

    if (!previousGame || previousGame.gameId !== game.gameId) {
      previousGameRef.current = game;
      setPieceMotion((current) => ({
        ...current,
        animations: {},
        promotions: {},
        result: null
      }));
      return;
    }

    const transition = analyzeGameTransition(previousGame, game, playerNumber);
    if (transition.boardChanged || transition.result) {
      setPieceMotion((current) => ({
        animations: transition.animations,
        promotions: transition.promotions,
        result: transition.result ?? current.result
      }));
    }

    for (const sound of transition.sounds) {
      gameAudio.play(sound);
    }

    previousGameRef.current = game;
  }, [game, gameAudio, playerNumber]);

  useEffect(() => {
    if (!pieceMotion.result) return undefined;
    const timeoutId = window.setTimeout(() => {
      setPieceMotion((current) => ({ ...current, result: null }));
    }, RESULT_EFFECT_DURATION);

    return () => window.clearTimeout(timeoutId);
  }, [pieceMotion.result]);

  async function selectSquare(playableIndex) {
    if (!game || game.status !== "ongoing" || isAiThinking) return;
    if (game.mode === "multiplayer" && !isMyTurn) return;

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

    if (game.mode === "multiplayer") {
      if (!socket?.connected) {
        setError("Live connection is not ready.");
        return;
      }
      setIsLoading(true);
      setError("");
      socket.emit("game:move", { gameId: game.gameId, from, to });
      setSelected(null);
      setMoves([]);
      setIsLoading(false);
      return;
    }

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
            Your bounty belongs to your Google-backed wanted profile. Sign in before starting a match.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <CinematicButton href="/login">Continue with Google</CinematicButton>
            <CinematicButton href="/wanted-board" variant="dark">Wanted Board</CinematicButton>
          </div>
        </div>
      </PageBackground>
    );
  }

  return (
    <PageBackground>
      <BrandNav auth={auth} active="play" compact />
      <ResultAtmosphere type={pieceMotion.result} />
      <div
        className="mx-auto flex min-h-[calc(100vh-88px)] w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8"
        onPointerDownCapture={gameAudio.unlock}
      >
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
            {isQueueing ? (
              <CinematicButton onClick={leaveQueue} variant="red">
                Cancel Search
              </CinematicButton>
            ) : null}
            <CinematicButton onClick={startGame} disabled={isLoading || isQueueing}>
              {gameMode === "multiplayer" ? "Find Match" : "New Game"}
            </CinematicButton>
          </div>
        </header>

        <section className="grid flex-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_330px]">
          <div className="mx-auto w-full max-w-[720px]">
            <Board
              board={game?.board ?? EMPTY_BOARD}
              selected={selected}
              moveTargets={moveTargets}
              onSquareClick={selectSquare}
              onMoveAttempt={submitMove}
              onPieceGrab={selectSquare}
              flipBoard={game?.mode === "multiplayer" && playerNumber === 2}
              animations={pieceMotion.animations}
              promotions={pieceMotion.promotions}
              disabled={!game || isLoading || isAiThinking || !isMyTurn}
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
                <option value="multiplayer">Online Multiplayer</option>
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
                disabled={gameMode === "vs_ai" || gameMode === "multiplayer"}
                className="mt-2 h-10 w-full rounded-md border border-stone-950/50 bg-stone-950/15 px-3 font-black text-stone-950 outline-none focus:border-red-900"
              >
                <option value="local">
                  {gameMode === "vs_ai"
                    ? `AI - ${labelDifficulty(aiDifficulty)}`
                    : gameMode === "multiplayer"
                      ? "Matchmaking Queue"
                      : "Local Player 2"}
                </option>
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
            {isMultiplayer ? <InfoRow label="Socket" value={socketStatus} /> : null}
            {isMultiplayer ? <InfoRow label="You are" value={playerNumber ? `Player ${playerNumber}` : "Unassigned"} /> : null}
            {isMultiplayer ? <InfoRow label="Opponent" value={opponent?.username ?? (isQueueing ? "Searching" : "Waiting")} /> : null}
            {isMultiplayer ? (
              <ChallengePanel
                query={playerSearch}
                onQueryChange={setPlayerSearch}
                onSearch={searchPlayers}
                results={searchResults}
                isSearching={isSearchingPlayers}
                onChallenge={sendChallenge}
                onAddFriend={sendFriendRequest}
                message={challengeMessage}
                disabled={!socket?.connected}
              />
            ) : null}
            {isMultiplayer ? (
              <FriendsPanel
                friends={friends}
                requests={friendRequests}
                message={friendsMessage}
                onChallenge={sendChallenge}
                onAccept={(friendshipId) => answerFriendRequest(friendshipId, "accept")}
                onDecline={(friendshipId) => answerFriendRequest(friendshipId, "decline")}
                disabled={!socket?.connected}
              />
            ) : null}
            {incomingChallenge ? (
              <IncomingChallengePanel
                challenge={incomingChallenge}
                onAccept={acceptIncomingChallenge}
                onDecline={declineIncomingChallenge}
              />
            ) : null}
            <InfoRow label="Session" value={sessionId ? shortId(sessionId) : "Local"} />
            <InfoRow label="Turn" value={game?.currentTurn ? turnLabel(game, auth.user?.username, playerNumber, opponent?.username) : "Loading"} />
            <InfoRow label="Forced jump" value={game?.forcedFrom ?? "None"} />
            {isQueueing ? (
              <div className="rounded-md border border-amber-700/50 bg-amber-950/20 p-3 text-sm font-black uppercase text-stone-950">
                Waiting for opponent...
              </div>
            ) : null}
            {game?.mode === "multiplayer" && game.status === "ongoing" ? (
              <button
                type="button"
                onClick={() => socket?.emit("game:resign", { gameId: game.gameId })}
                className="blood-button w-full"
              >
                Resign
              </button>
            ) : null}
            {error ? <p className="rounded-md bg-red-950/80 px-3 py-2 text-sm text-red-100">{error}</p> : null}
            {game && game.status !== "ongoing" ? (
              <BountyResultPanel matchResult={game.matchResult} winner={game.winner} resultEffect={pieceMotion.result} onRestart={startGame} />
            ) : null}
          </PosterPanel>
        </section>
      </div>
    </PageBackground>
  );
}

function Board({
  board,
  selected,
  moveTargets,
  onSquareClick,
  onMoveAttempt,
  onPieceGrab,
  flipBoard = false,
  animations,
  promotions,
  disabled
}) {
  const boardRef = useRef(null);
  const dragRef = useRef(null);
  const suppressClickRef = useRef(false);
  const moveTargetsRef = useRef(moveTargets);
  const [dragState, setDragState] = useState(null);
  const [snapBack, setSnapBack] = useState(null);

  useEffect(() => {
    moveTargetsRef.current = moveTargets;
  }, [moveTargets]);

  function startPieceDrag(event, playableIndex, piece) {
    if (disabled || piece === 0) return;

    event.preventDefault();
    event.stopPropagation();

    const pointer = { x: event.clientX, y: event.clientY };
    dragRef.current = {
      pointerId: event.pointerId,
      playableIndex,
      piece,
      startX: pointer.x,
      startY: pointer.y,
      x: pointer.x,
      y: pointer.y,
      moved: false
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setDragState(dragRef.current);
    onPieceGrab(playableIndex);
  }

  function movePieceDrag(event) {
    const current = dragRef.current;
    if (!current || current.pointerId !== event.pointerId) return;

    const next = {
      ...current,
      x: event.clientX,
      y: event.clientY,
      moved: current.moved || Math.hypot(event.clientX - current.startX, event.clientY - current.startY) > 7
    };
    dragRef.current = next;
    setDragState(next);
  }

  async function endPieceDrag(event) {
    const current = dragRef.current;
    if (!current || current.pointerId !== event.pointerId) return;

    event.preventDefault();
    event.stopPropagation();

    dragRef.current = null;
    setDragState(null);
    try {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    } catch {
      // Pointer capture may already be released by the browser on cancel.
    }

    suppressClickRef.current = true;
    if (!current.moved) {
      return;
    }

    const target = getPlayableIndexFromPoint(event.clientX, event.clientY, boardRef.current, flipBoard);
    if (target !== null && moveTargetsRef.current.has(target)) {
      await onMoveAttempt(current.playableIndex, target);
      return;
    }

    const origin = getPlayableCenter(current.playableIndex, boardRef.current, flipBoard);
    if (origin) {
      const snap = {
        id: `${Date.now()}-${current.playableIndex}`,
        playableIndex: current.playableIndex,
        piece: current.piece,
        originX: origin.x,
        originY: origin.y,
        fromX: event.clientX,
        fromY: event.clientY,
        size: origin.size
      };
      setSnapBack(snap);
      window.setTimeout(() => setSnapBack((active) => (active?.id === snap.id ? null : active)), 180);
    }
    onSquareClick(current.playableIndex);
  }

  return (
    <div ref={boardRef} className="game-board-frame relative aspect-square w-full overflow-hidden p-2">
      <div className="grid h-full w-full grid-cols-8 grid-rows-8">
        {Array.from({ length: 64 }, (_, visualSquare) => {
          const square = flipBoard ? 63 - visualSquare : visualSquare;
          const row = Math.floor(square / 8);
          const col = square % 8;
          const isPlayable = (row + col) % 2 === 1;
          const playableIndex = isPlayable ? row * 4 + Math.floor(col / 2) : null;
          const piece = playableIndex === null ? 0 : board[playableIndex];
          const isSelected = selected === playableIndex;
          const isMoveTarget = playableIndex !== null && moveTargets.has(playableIndex);
          const isDragging = dragState?.playableIndex === playableIndex;
          const isSnappingBack = snapBack?.playableIndex === playableIndex;
          const rawAnimation = playableIndex !== null ? animations[playableIndex] : null;
          const animation =
            rawAnimation && playableIndex !== null
              ? getAnimationVector(rawAnimation.from, playableIndex, flipBoard, rawAnimation.id)
              : null;
          const promotion = playableIndex !== null ? promotions[playableIndex] : null;

          return (
            <button
              key={square}
              type="button"
              disabled={!isPlayable || disabled}
              onClick={() => {
                if (suppressClickRef.current) {
                  suppressClickRef.current = false;
                  return;
                }
                if (playableIndex !== null) onSquareClick(playableIndex);
              }}
              className={[
                "relative flex items-center justify-center",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 focus-visible:ring-offset-0",
                isPlayable ? "game-square-dark hover:brightness-125" : "game-square-light",
                isSelected ? "inset-ring" : ""
              ].join(" ")}
              aria-label={isPlayable ? `Playable square ${playableIndex}` : "Light square"}
            >
              {piece !== 0 ? (
                <Piece
                  piece={piece}
                  selected={isSelected}
                  dragging={isDragging || isSnappingBack}
                  animation={animation}
                  promotion={promotion}
                  onPointerDown={(event) => startPieceDrag(event, playableIndex, piece)}
                  onPointerMove={movePieceDrag}
                  onPointerUp={endPieceDrag}
                  onPointerCancel={endPieceDrag}
                />
              ) : null}
              {isMoveTarget ? <span className="valid-move-dot absolute h-4 w-4 rounded-full bg-amber-300/90 shadow-[0_0_18px_rgba(242,193,78,0.9)]" /> : null}
            </button>
          );
        })}
      </div>
      {dragState ? <DraggedPiece dragState={dragState} boardElement={boardRef.current} /> : null}
      {snapBack ? <SnapBackPiece snapBack={snapBack} boardElement={boardRef.current} /> : null}
    </div>
  );
}

function Piece({ piece, selected, dragging, animation, promotion, onPointerDown, onPointerMove, onPointerUp, onPointerCancel }) {
  const isPlayerOne = piece === 1 || piece === 3;
  const isKing = piece === 3 || piece === 4;
  const slideStyle = animation
    ? {
        "--piece-slide-x": `${animation.dx * 138.888}%`,
        "--piece-slide-y": `${animation.dy * 138.888}%`
      }
    : undefined;

  return (
    <span
      key={`${piece}-${animation?.id ?? "steady"}-${promotion ?? "plain"}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      style={slideStyle}
      className={[
        "checker-piece relative flex h-[72%] w-[72%] touch-none select-none items-center justify-center rounded-full border-4 text-xs font-black shadow-lg sm:text-sm",
        isPlayerOne
          ? "border-red-950 bg-gradient-to-br from-red-600 to-red-950 text-red-50 shadow-red-950/60"
          : "border-stone-950 bg-gradient-to-br from-stone-50 to-amber-200 text-stone-950 shadow-black/70",
        animation ? "piece-slide" : "",
        promotion ? "king-promotion-burst" : "",
        dragging ? "opacity-20" : "",
        selected ? "piece-selected ring-4 ring-amber-300 shadow-[0_0_28px_rgba(242,193,78,0.8)]" : "ring-1 ring-black/40"
      ].join(" ")}
    >
      {promotion ? <span className="promotion-flash" /> : null}
      <span className="relative z-10">{isKing ? "K" : PIECE_LABELS[piece]}</span>
    </span>
  );
}

function DraggedPiece({ dragState, boardElement }) {
  if (!boardElement) return null;
  const bounds = boardElement.getBoundingClientRect();
  const size = bounds.width / 8;
  const isPlayerOne = dragState.piece === 1 || dragState.piece === 3;

  return (
    <div
      className="pointer-events-none absolute z-50 flex items-center justify-center"
      style={{
        left: dragState.x - bounds.left - size / 2,
        top: dragState.y - bounds.top - size / 2,
        width: size,
        height: size
      }}
    >
      <span
        className={[
          "checker-piece dragging-piece flex h-[72%] w-[72%] items-center justify-center rounded-full border-4 text-xs font-black shadow-lg sm:text-sm",
          isPlayerOne
            ? "border-red-950 bg-gradient-to-br from-red-600 to-red-950 text-red-50 shadow-red-950/60"
            : "border-stone-950 bg-gradient-to-br from-stone-50 to-amber-200 text-stone-950 shadow-black/70"
        ].join(" ")}
      >
        {dragState.piece === 3 || dragState.piece === 4 ? "K" : PIECE_LABELS[dragState.piece]}
      </span>
    </div>
  );
}

function SnapBackPiece({ snapBack, boardElement }) {
  if (!boardElement) return null;
  const bounds = boardElement.getBoundingClientRect();
  const isPlayerOne = snapBack.piece === 1 || snapBack.piece === 3;

  return (
    <div
      className="pointer-events-none absolute z-40 flex items-center justify-center"
      style={{
        left: snapBack.originX - bounds.left - snapBack.size / 2,
        top: snapBack.originY - bounds.top - snapBack.size / 2,
        width: snapBack.size,
        height: snapBack.size,
        "--snap-x": `${snapBack.fromX - snapBack.originX}px`,
        "--snap-y": `${snapBack.fromY - snapBack.originY}px`
      }}
    >
      <span
        className={[
          "checker-piece snap-back-piece flex h-[72%] w-[72%] items-center justify-center rounded-full border-4 text-xs font-black shadow-lg sm:text-sm",
          isPlayerOne
            ? "border-red-950 bg-gradient-to-br from-red-600 to-red-950 text-red-50 shadow-red-950/60"
            : "border-stone-950 bg-gradient-to-br from-stone-50 to-amber-200 text-stone-950 shadow-black/70"
        ].join(" ")}
      >
        {snapBack.piece === 3 || snapBack.piece === 4 ? "K" : PIECE_LABELS[snapBack.piece]}
      </span>
    </div>
  );
}

function ResultAtmosphere({ type }) {
  if (!type) return null;

  return (
    <div
      className={[
        "result-atmosphere pointer-events-none fixed inset-0 z-30",
        type === "victory" ? "result-atmosphere-victory" : "",
        type === "defeat" ? "result-atmosphere-defeat" : "",
        type === "draw" ? "result-atmosphere-draw" : ""
      ].join(" ")}
    />
  );
}

function getPlayableIndexFromPoint(clientX, clientY, boardElement, flipBoard) {
  if (!boardElement) return null;
  const bounds = boardElement.getBoundingClientRect();
  const innerPadding = Math.max(0, Math.round(bounds.width * 0.02));
  const x = clientX - bounds.left - innerPadding;
  const y = clientY - bounds.top - innerPadding;
  const size = bounds.width - innerPadding * 2;

  if (x < 0 || y < 0 || x > size || y > size) return null;

  const visualCol = Math.min(7, Math.max(0, Math.floor((x / size) * 8)));
  const visualRow = Math.min(7, Math.max(0, Math.floor((y / size) * 8)));
  const visualSquare = visualRow * 8 + visualCol;
  const square = flipBoard ? 63 - visualSquare : visualSquare;
  const row = Math.floor(square / 8);
  const col = square % 8;
  if ((row + col) % 2 !== 1) return null;
  return row * 4 + Math.floor(col / 2);
}

function getAnimationVector(from, to, flipBoard, id) {
  const source = playableIndexToVisualCoord(from, flipBoard);
  const target = playableIndexToVisualCoord(to, flipBoard);

  return {
    id,
    dx: source.col - target.col,
    dy: source.row - target.row
  };
}

function getPlayableCenter(index, boardElement, flipBoard) {
  if (!boardElement) return null;
  const bounds = boardElement.getBoundingClientRect();
  const visual = playableIndexToVisualCoord(index, flipBoard);
  const innerPadding = Math.max(0, Math.round(bounds.width * 0.02));
  const size = (bounds.width - innerPadding * 2) / 8;

  return {
    x: bounds.left + innerPadding + visual.col * size + size / 2,
    y: bounds.top + innerPadding + visual.row * size + size / 2,
    size
  };
}

function playableIndexToVisualCoord(index, flipBoard) {
  const row = Math.floor(index / 4);
  const darkOffset = row % 2 === 0 ? 1 : 0;
  const col = (index % 4) * 2 + darkOffset;
  const square = row * 8 + col;
  const visualSquare = flipBoard ? 63 - square : square;

  return {
    row: Math.floor(visualSquare / 8),
    col: visualSquare % 8
  };
}

function analyzeGameTransition(previousGame, nextGame, playerNumber) {
  const previousBoard = previousGame.board ?? EMPTY_BOARD;
  const nextBoard = nextGame.board ?? EMPTY_BOARD;
  const boardChanged = !boardsEqual(previousBoard, nextBoard);
  const animations = boardChanged ? buildPieceAnimations(previousBoard, nextBoard) : {};
  const promotions = boardChanged ? buildPromotionEffects(previousBoard, nextBoard) : {};
  const sounds = [];

  if (boardChanged) {
    if (countPieces(nextBoard) < countPieces(previousBoard)) sounds.push("capture");
    else sounds.push("move");

    if (Object.keys(promotions).length > 0) sounds.push("promotion");
  }

  const result = previousGame.status !== nextGame.status && nextGame.status !== "ongoing"
    ? resolveResultEffect(nextGame, playerNumber)
    : null;

  if (result === "victory") sounds.push("victory");
  if (result === "defeat") sounds.push("defeat");
  if (result === "draw") sounds.push("draw");

  return { animations, promotions, sounds, boardChanged, result };
}

function buildPieceAnimations(previousBoard, nextBoard) {
  const removed = [];
  const arrivals = [];
  const idBase = `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  for (let index = 0; index < 32; index += 1) {
    const before = previousBoard[index] ?? 0;
    const after = nextBoard[index] ?? 0;
    if (before !== 0 && before !== after) removed.push({ index, piece: before });
    if (after !== 0 && before !== after) arrivals.push({ index, piece: after });
  }

  const animations = {};
  const usedRemoved = new Set();

  for (const arrival of arrivals) {
    let bestMatch = null;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const candidate of removed) {
      if (usedRemoved.has(candidate.index)) continue;
      if (pieceOwner(candidate.piece) !== pieceOwner(arrival.piece)) continue;
      if (!isCompatibleMovedPiece(candidate.piece, arrival.piece)) continue;

      const distance = playableDistance(candidate.index, arrival.index);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestMatch = candidate;
      }
    }

    if (bestMatch) {
      usedRemoved.add(bestMatch.index);
      animations[arrival.index] = {
        from: bestMatch.index,
        id: `${idBase}-${bestMatch.index}-${arrival.index}`
      };
    }
  }

  return animations;
}

function buildPromotionEffects(previousBoard, nextBoard) {
  const effects = {};
  const idBase = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const removed = [];

  for (let index = 0; index < 32; index += 1) {
    const before = previousBoard[index] ?? 0;
    const after = nextBoard[index] ?? 0;
    if (before !== 0 && before !== after) removed.push({ index, piece: before });
  }

  for (let index = 0; index < 32; index += 1) {
    const before = previousBoard[index] ?? 0;
    const after = nextBoard[index] ?? 0;
    const promotedPlayerOne = after === 3 && before !== 3;
    const promotedPlayerTwo = after === 4 && before !== 4;
    if (!promotedPlayerOne && !promotedPlayerTwo) continue;

    const promotedFromRegular = removed.some((candidate) => (
      (candidate.piece === 1 && after === 3) || (candidate.piece === 2 && after === 4)
    ));

    if (promotedFromRegular) {
      effects[index] = `${idBase}-${index}`;
    }
  }

  return effects;
}

function boardsEqual(left, right) {
  if (!left || !right || left.length !== right.length) return false;
  return left.every((piece, index) => piece === right[index]);
}

function countPieces(board) {
  return board.reduce((total, piece) => total + (piece === 0 ? 0 : 1), 0);
}

function pieceOwner(piece) {
  if (piece === 1 || piece === 3) return 1;
  if (piece === 2 || piece === 4) return 2;
  return 0;
}

function isCompatibleMovedPiece(before, after) {
  if (before === after) return true;
  return (before === 1 && after === 3) || (before === 2 && after === 4);
}

function playableDistance(left, right) {
  const a = playableIndexToVisualCoord(left, false);
  const b = playableIndexToVisualCoord(right, false);
  return Math.abs(a.row - b.row) + Math.abs(a.col - b.col);
}

function resolveResultEffect(game, playerNumber) {
  if (game.status === "draw") return "draw";
  if (game.status !== "finished") return null;
  const ownPlayer = game.mode === "multiplayer" && playerNumber ? playerNumber : 1;
  return game.winner === ownPlayer ? "victory" : "defeat";
}

function StatusPill({ game }) {
  const label =
    game?.status === "draw"
      ? "DRAW"
      : game?.status === "finished"
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

function ChallengePanel({ query, onQueryChange, onSearch, results, isSearching, onChallenge, onAddFriend, message, disabled }) {
  return (
    <div className="space-y-3 rounded-md border border-stone-950/30 bg-stone-950/10 p-3">
      <p className="text-sm font-black uppercase text-stone-800">Direct Challenge</p>
      <div className="flex gap-2">
        <input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Search username"
          className="h-10 min-w-0 flex-1 rounded-md border border-stone-950/50 bg-stone-950/15 px-3 font-bold text-stone-950 outline-none placeholder:text-stone-700 focus:border-red-900"
        />
        <button
          type="button"
          onClick={onSearch}
          disabled={disabled || isSearching}
          className="dark-button px-3 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSearching ? "..." : "Search"}
        </button>
      </div>
      {message ? <p className="text-xs font-bold text-stone-800">{message}</p> : null}
      <div className="space-y-2">
        {results.map((player) => (
          <div key={player.userId} className="rounded-md border border-stone-950/30 bg-stone-50/20 p-2">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <img
                  src={toAvatarSrc(player.avatarUrl) || buildAvatarUrl(player.username)}
                  alt=""
                  className="h-10 w-10 shrink-0 rounded-md border border-stone-950/40 object-cover"
                />
                <div className="min-w-0">
                  <p className="truncate font-black text-stone-950">{player.username}</p>
                  <p className="text-xs font-bold uppercase text-stone-700">{player.tier}</p>
                  <p className="text-xs font-black text-stone-800">{formatBounty(player.bounty)}</p>
                </div>
              </div>
              <div className="flex shrink-0 flex-col gap-2">
                <button
                  type="button"
                  onClick={() => onChallenge(player.username)}
                  disabled={disabled}
                  className="poster-button px-3 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Challenge
                </button>
                <button
                  type="button"
                  onClick={() => onAddFriend(player.userId)}
                  className="dark-button px-3 py-2 text-xs"
                >
                  Add Friend
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function FriendsPanel({ friends, requests, message, onChallenge, onAccept, onDecline, disabled }) {
  return (
    <div className="space-y-3 rounded-md border border-stone-950/30 bg-stone-950/10 p-3">
      <p className="text-sm font-black uppercase text-stone-800">Crew</p>
      {message ? <p className="text-xs font-bold text-stone-800">{message}</p> : null}

      {requests.length > 0 ? (
        <div className="space-y-2">
          <p className="text-xs font-black uppercase text-stone-700">Friend Requests</p>
          {requests.map((request) => (
            <FriendCard
              key={request.friendshipId}
              player={request}
              actions={
                <>
                  <button type="button" onClick={() => onAccept(request.friendshipId)} className="poster-button px-3 py-2 text-xs">
                    Accept
                  </button>
                  <button type="button" onClick={() => onDecline(request.friendshipId)} className="blood-button px-3 py-2 text-xs">
                    Decline
                  </button>
                </>
              }
            />
          ))}
        </div>
      ) : null}

      <div className="space-y-2">
        <p className="text-xs font-black uppercase text-stone-700">Friends</p>
        {friends.length === 0 ? (
          <p className="text-xs font-bold text-stone-800">No friends yet.</p>
        ) : null}
        {friends.map((friend) => (
          <FriendCard
            key={friend.userId}
            player={friend}
            actions={
              <button
                type="button"
                onClick={() => onChallenge(friend.username)}
                disabled={disabled || !friend.isOnline}
                className="poster-button px-3 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-60"
              >
                Challenge Friend
              </button>
            }
          />
        ))}
      </div>
    </div>
  );
}

function FriendCard({ player, actions }) {
  return (
    <div className="rounded-md border border-stone-950/30 bg-stone-50/20 p-2">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <div className="relative">
            <img
              src={toAvatarSrc(player.avatarUrl) || buildAvatarUrl(player.username)}
              alt=""
              className="h-10 w-10 shrink-0 rounded-md border border-stone-950/40 object-cover"
            />
            <span
              className={`absolute -right-1 -top-1 h-3 w-3 rounded-full border border-stone-950 ${
                player.isOnline ? "bg-green-500" : "bg-stone-500"
              }`}
            />
          </div>
          <div className="min-w-0">
            <p className="truncate font-black text-stone-950">{player.username}</p>
            <p className="text-xs font-bold uppercase text-stone-700">{player.tier}</p>
            <p className="text-xs font-black text-stone-800">{formatBounty(player.bounty)}</p>
          </div>
        </div>
        <div className="flex shrink-0 flex-col gap-2">{actions}</div>
      </div>
    </div>
  );
}

function IncomingChallengePanel({ challenge, onAccept, onDecline }) {
  return (
    <div className="rounded-md border border-red-900/40 bg-red-950/15 p-3 text-stone-950">
      <p className="text-xs font-black uppercase text-red-900">Duel Challenge</p>
      <p className="mt-1 font-black">
        {challenge.challenger.username} challenged you to a duel
      </p>
      <div className="mt-3 flex gap-2">
        <button type="button" onClick={onAccept} className="poster-button flex-1 px-3 py-2 text-xs">
          Accept
        </button>
        <button type="button" onClick={onDecline} className="blood-button flex-1 px-3 py-2 text-xs">
          Decline
        </button>
      </div>
    </div>
  );
}

function BountyResultPanel({ matchResult, winner, resultEffect, onRestart }) {
  if (matchResult?.draw) {
    return (
      <div className="poster-panel result-panel result-panel-draw p-5 text-center text-stone-950">
        <p className="text-sm font-black uppercase text-red-900">Match Result</p>
        <p className="mt-2 text-5xl font-black uppercase tracking-normal">DRAW</p>
        <p className="mt-3 rounded-md bg-stone-950/15 p-3 text-sm font-black uppercase">
          NO PLAYER COULD CLAIM THE BOUNTY
        </p>
        <p className="mt-3 text-xs font-bold uppercase text-stone-700">
          {drawReasonLabel(matchResult.drawReason)}
        </p>
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

  if (!matchResult) {
    return (
      <div className={`poster-panel result-panel ${resultEffect === "defeat" ? "result-panel-defeat" : "result-panel-victory"} p-4`}>
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
    <div className={`poster-panel result-panel ${resultEffect === "defeat" ? "result-panel-defeat" : "result-panel-victory"} p-5 text-stone-950`}>
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

function drawReasonLabel(reason) {
  if (reason === "threefold_repetition") return "Threefold repetition";
  if (reason === "no_progress") return "30 turns without capture or promotion";
  return "Draw";
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

function turnLabel(game, username, playerNumber, opponentName) {
  if (game.mode === "multiplayer") {
    if (game.currentTurn === playerNumber) return "Your turn";
    return `${opponentName ?? "Opponent"} to move`;
  }
  if (game.currentTurn === 1) return `${username ?? "You"} as Player 1`;
  if (game.mode === "vs_ai") return `AI - ${labelDifficulty(game.aiDifficulty)}`;
  return game.playerTwoUserId ? "Player 2" : "Local Player 2";
}

function modeLabel(game) {
  if (game.mode === "vs_ai") return `vs AI - ${labelDifficulty(game.aiDifficulty)}`;
  if (game.mode === "multiplayer") return "Online Multiplayer";
  return "Local PvP";
}

function modeDraftLabel(gameMode, aiDifficulty) {
  if (gameMode === "vs_ai") return `vs AI - ${labelDifficulty(aiDifficulty)}`;
  if (gameMode === "multiplayer") return "Online Multiplayer";
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
