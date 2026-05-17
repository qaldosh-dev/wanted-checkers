"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { io } from "socket.io-client";
import { useAuth } from "../auth-context";
import {
  BrandNav,
  CinematicButton,
  PageBackground,
  PosterPanel,
  buildAvatarUrl,
  formatBounty,
  toAvatarSrc,
  useBodyScrollLock,
  usePieceSkin
} from "../components/wanted-ui";
import { FogOverlay } from "../components/blindMode/fogRenderer";
import {
  BLIND_HUNT_MODE,
  buildVisibleBoardSquares,
  isBlindHuntMode
} from "../components/blindMode/visibilityEngine";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL ?? API_URL;
const LIVE_GAME_MODES = ["multiplayer", "blitz", BLIND_HUNT_MODE];

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
  const [, setSessionId] = useState("");
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
  const [drawOffer, setDrawOffer] = useState(null);
  const [drawMessage, setDrawMessage] = useState("");
  const [resignConfirmOpen, setResignConfirmOpen] = useState(false);
  const [matchGuard, setMatchGuard] = useState(null);
  const [blitzState, setBlitzState] = useState(null);
  const [resultOverlayOpen, setResultOverlayOpen] = useState(false);
  const [resultMatchId, setResultMatchId] = useState("");
  const [pieceSkin] = usePieceSkin();
  const gameAudio = useGameAudio();
  const previousGameRef = useRef(null);
  const protectedActionRef = useRef(null);
  const activeGameIdRef = useRef(null);
  const playerNumberRef = useRef(null);
  const [pieceMotion, setPieceMotion] = useState({
    animations: {},
    promotions: {},
    result: null
  });

  const moveTargets = useMemo(() => new Set(moves.map((move) => move.to)), [moves]);
  const isLiveMode = LIVE_GAME_MODES.includes(gameMode) || isLiveGame(game);
  const activeOnlineMatch = Boolean(
    game?.gameId &&
    isLiveGame(game) &&
    game.status === "ongoing" &&
    playerNumber &&
    opponent?.id
  );
  const isMyTurn = !game || !isLiveGame(game) || game.currentTurn === playerNumber;
  const ownPlayerNumber = isLiveGame(game) && playerNumber ? playerNumber : 1;
  const pieceAvatarSrc = toAvatarSrc(auth.user?.avatarUrl ?? "") || buildAvatarUrl(auth.user?.username ?? "wanted");
  const blindVisionPlayer = useMemo(
    () => getBlindVisionPlayer(game, gameMode, playerNumber),
    [game, gameMode, playerNumber]
  );
  const visibleBoardSquares = useMemo(
    () => (blindVisionPlayer ? buildVisibleBoardSquares(game?.board ?? EMPTY_BOARD, blindVisionPlayer) : null),
    [blindVisionPlayer, game?.board]
  );

  useBodyScrollLock(Boolean(matchGuard || resignConfirmOpen || drawOffer));

  useEffect(() => {
    activeGameIdRef.current = game?.gameId ?? null;
    playerNumberRef.current = playerNumber;
  }, [game?.gameId, playerNumber]);

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

    const nextSocket = io(SOCKET_URL, {
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
    nextSocket.on("active_match:state", (payload) => {
      if (!payload?.active) {
        setMatchGuard(null);
        return;
      }
      hydrateActiveMatch(payload);
    });
    nextSocket.on("queue:matched", (payload) => {
      hydrateActiveMatch(payload);
    });
    nextSocket.on("game:update", (payload) => {
      setGame(payload.game);
      setBlitzState(payload.game.blitzState ?? null);
      setSelected(null);
      setMoves([]);
      setIsLoading(false);
    });
    nextSocket.on("game:finished", (payload) => {
      setGame(payload.game);
      setBlitzState(payload.game.blitzState ?? null);
      setSelected(null);
      setMoves([]);
      setDrawOffer(null);
      setIsLoading(false);
    });
    nextSocket.on("timer:update", (payload) => {
      setBlitzState(payload.blitzState);
    });
    nextSocket.on("timer:timeout", (payload) => {
      setBlitzState(payload.blitzState);
      setError(`Player ${payload.loser} lost on time.`);
    });
    nextSocket.on("blitz:started", (payload) => {
      setBlitzState(payload.blitzState ?? payload.game?.blitzState ?? null);
    });
    nextSocket.on("game:error", (payload) => {
      setError(payload.message ?? "Live multiplayer error.");
      setIsLoading(false);
    });
    nextSocket.on("draw:offered", (payload) => {
      if (payload.gameId !== activeGameIdRef.current) return;
      setDrawMessage("");
      if (payload.offeredBy === playerNumberRef.current) {
        setDrawMessage("Draw offer sent. Waiting for opponent.");
        return;
      }
      setDrawOffer(payload);
    });
    nextSocket.on("draw:declined", (payload) => {
      if (payload.gameId !== activeGameIdRef.current) return;
      setDrawOffer(null);
      setDrawMessage(`${payload.declinedByUsername ?? "Opponent"} declined the draw offer.`);
    });
    nextSocket.on("draw:accepted", (payload) => {
      if (payload.gameId !== activeGameIdRef.current) return;
      setDrawOffer(null);
      setDrawMessage("Draw accepted.");
      if (payload.game) setGame(payload.game);
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

  function requestProtectedAction(action, options = {}) {
    if (!activeOnlineMatch) {
      action();
      return false;
    }

    protectedActionRef.current = action;
    setMatchGuard({
      title: options.title ?? "Active Online Match",
      message: options.message ?? "Leaving this match will count as a resignation.",
      detail: "You are currently in an active online game. Finish it or resign before starting another online session.",
      resigning: false
    });
    return true;
  }

  function hydrateActiveMatch(payload) {
    if (!payload?.game?.gameId || !payload?.players?.playerOne || !payload?.players?.playerTwo) return;
    const nextPlayerNumber = payload.game.playerOneUserId === auth.user?.id ? 1 : 2;
    const nextOpponent = nextPlayerNumber === 1 ? payload.players.playerTwo : payload.players.playerOne;

    setPlayerNumber(nextPlayerNumber);
    setOpponent(nextOpponent);
    setGameMode(liveDraftModeFromGame(payload.game.mode));
    setIsQueueing(false);
    setSelected(null);
    setMoves([]);
    setError("");
    setGame(payload.game);
    setBlitzState(payload.game.blitzState ?? null);
    setSessionId(payload.game.gameId);
  }

  const startGame = useCallback(async () => {
    if (!auth.isAuthenticated) return;
    if (LIVE_GAME_MODES.includes(gameMode)) {
      if (activeOnlineMatch) {
        requestProtectedAction(() => {
          setIsQueueing(true);
          setError("");
          setSelected(null);
          setMoves([]);
          setResultOverlayOpen(false);
          setResultMatchId("");
          socket?.emit(queueEventForMode(gameMode));
        }, {
          title: "Online Match In Progress",
          message: "Starting another online match will resign your current game."
        });
        return;
      }
      if (!socket?.connected) {
        setError("Live connection is not ready yet.");
        return;
      }
      setIsQueueing(true);
      setError("");
      setSelected(null);
      setMoves([]);
      setResultOverlayOpen(false);
      setResultMatchId("");
      socket.emit(queueEventForMode(gameMode));
      return;
    }

    setIsLoading(true);
    setError("");
    setSelected(null);
    setMoves([]);
    setResultOverlayOpen(false);
    setResultMatchId("");

    try {
      const storedSessionId = window.localStorage.getItem("wanted-checkers-session-id") ?? "";
      const response = await fetch(`${API_URL}/api/game/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...auth.authHeaders() },
        body: JSON.stringify({
          sessionId: storedSessionId || undefined,
          opponentUserId: gameMode === "local_pvp" && opponentUserId !== "local" ? opponentUserId : undefined,
          mode: gameMode === "blind_hunt_local" ? BLIND_HUNT_MODE : gameMode,
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
  }, [auth, opponentUserId, gameMode, aiDifficulty, socket, activeOnlineMatch]);

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
    if (activeOnlineMatch) {
      requestProtectedAction(() => {
        setError("");
        setChallengeMessage("");
        socket?.emit("challenge:send", { username, mode: challengeModeForDraft(gameMode) });
      }, {
        title: "Duel Already Active",
        message: "Sending a challenge will resign your current online match."
      });
      return;
    }
    if (!socket?.connected) {
      setError("Live connection is not ready.");
      return;
    }

    setError("");
    setChallengeMessage("");
    socket.emit("challenge:send", { username, mode: challengeModeForDraft(gameMode) });
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
    if (activeOnlineMatch) {
      requestProtectedAction(() => socket?.emit("challenge:accept", { challengeId: incomingChallenge.id }), {
        title: "Accept Challenge?",
        message: "Accepting this challenge will resign your current online match."
      });
      return;
    }
    socket?.emit("challenge:accept", { challengeId: incomingChallenge.id });
  }

  function declineIncomingChallenge() {
    if (!incomingChallenge) return;
    socket?.emit("challenge:decline", { challengeId: incomingChallenge.id });
    setIncomingChallenge(null);
  }

  function changeGameMode(nextMode) {
    if (activeOnlineMatch && LIVE_GAME_MODES.includes(nextMode) && nextMode !== gameMode) {
      requestProtectedAction(() => setGameMode(nextMode), {
        title: "Switch Online Mode?",
        message: "Switching online modes will resign your current match."
      });
      return;
    }
    setGameMode(nextMode);
  }

  useEffect(() => {
    if (auth.isAuthLoading || !auth.isAuthenticated) return;
    setSessionId(window.localStorage.getItem("wanted-checkers-session-id") ?? "");
    loadPlayers().catch((caughtError) => setError(caughtError.message));
    loadFriends().catch((caughtError) => setError(caughtError.message));
  }, [auth.isAuthLoading, auth.isAuthenticated, loadPlayers, loadFriends]);

  useEffect(() => {
    if (!game?.gameId) return undefined;
    if (isLiveGame(game)) return undefined;

    const intervalId = window.setInterval(() => {
      refreshGame(game.gameId).catch((caughtError) => setError(caughtError.message));
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [game?.gameId, game?.mode, game?.playerTwoUserId, refreshGame]);

  useEffect(() => {
    if (socket?.connected && isLiveGame(game) && game.gameId) {
      socket.emit("game:join", { gameId: game.gameId });
    }
  }, [socket, socketStatus, game?.mode, game?.gameId, game?.playerTwoUserId]);

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

  useEffect(() => {
    if (!game || game.status === "ongoing") {
      setResultOverlayOpen(false);
      return;
    }
    setResultOverlayOpen(true);
  }, [game?.gameId, game?.status]);

  useEffect(() => {
    if (!auth.isAuthenticated || !game?.gameId || game.status === "ongoing") return;

    let cancelled = false;
    async function loadResultMatchId() {
      try {
        const response = await fetch(`${API_URL}/api/matches/recent`, {
          headers: auth.authHeaders(),
          cache: "no-store"
        });
        const payload = await response.json();
        if (!response.ok) return;
        const match = payload.matches?.find((candidate) => candidate.gameId === game.gameId);
        if (!cancelled && match?.matchId) setResultMatchId(match.matchId);
      } catch {
        // Replay actions stay disabled if the match id is not available yet.
      }
    }

    loadResultMatchId();
    return () => {
      cancelled = true;
    };
  }, [auth, game?.gameId, game?.status]);

  async function selectSquare(playableIndex) {
    if (!game || game.status !== "ongoing" || isAiThinking) return;
    if (isLiveGame(game) && !isMyTurn) return;

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

    if (isLiveGame(game)) {
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

  function requestResign() {
    if (!activeOnlineMatch) return;
    setResignConfirmOpen(true);
  }

  function confirmResign() {
    if (!activeOnlineMatch || !game?.gameId) return;
    setResignConfirmOpen(false);
    socket?.emit("game:resign", { gameId: game.gameId });
  }

  function confirmProtectedResign() {
    if (!activeOnlineMatch || !game?.gameId) {
      const action = protectedActionRef.current;
      protectedActionRef.current = null;
      setMatchGuard(null);
      action?.();
      return;
    }
    setMatchGuard((current) => current ? { ...current, resigning: true } : current);
    socket?.emit("game:resign", { gameId: game.gameId });
  }

  function offerDraw() {
    if (!activeOnlineMatch || !game?.gameId) return;
    setDrawMessage("");
    socket?.emit("draw:offer", { gameId: game.gameId });
  }

  function respondToDraw(accepted) {
    if (!drawOffer || !game?.gameId) return;
    socket?.emit("draw:respond", { gameId: game.gameId, accepted });
    if (!accepted) setDrawOffer(null);
  }

  useEffect(() => {
    if (!matchGuard?.resigning || activeOnlineMatch) return;
    const action = protectedActionRef.current;
    protectedActionRef.current = null;
    setMatchGuard(null);
    action?.();
  }, [matchGuard?.resigning, activeOnlineMatch]);

  useEffect(() => {
    if (!activeOnlineMatch) return undefined;

    function handleBeforeUnload(event) {
      event.preventDefault();
      event.returnValue = "Leaving this online match may count as a resignation.";
      return event.returnValue;
    }

    function handleDocumentClick(event) {
      const anchor = event.target.closest?.("a[href]");
      if (!anchor) return;
      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return;
      if (anchor.target === "_blank") return;

      event.preventDefault();
      requestProtectedAction(() => {
        window.location.href = anchor.href;
      }, {
        title: "Leave Online Match?",
        message: "Navigating away will resign your current online match."
      });
    }

    window.addEventListener("beforeunload", handleBeforeUnload);
    document.addEventListener("click", handleDocumentClick, true);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("click", handleDocumentClick, true);
    };
  }, [activeOnlineMatch, game?.gameId]);

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
      <MatchResultOverlay
        game={game}
        auth={auth}
        playerNumber={playerNumber}
        open={resultOverlayOpen}
        matchId={resultMatchId}
        onClose={() => setResultOverlayOpen(false)}
        onNewGame={startGame}
      />
      <MatchGuardModal
        guard={matchGuard}
        onReturn={() => {
          protectedActionRef.current = null;
          setMatchGuard(null);
        }}
        onResign={confirmProtectedResign}
      />
      <ConfirmResignModal
        open={resignConfirmOpen}
        onCancel={() => setResignConfirmOpen(false)}
        onConfirm={confirmResign}
      />
      <DrawOfferModal
        offer={drawOffer}
        onAccept={() => respondToDraw(true)}
        onDecline={() => respondToDraw(false)}
      />
      <div
        className="mx-auto flex min-h-[calc(100vh-88px)] w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8"
        onPointerDownCapture={gameAudio.unlock}
      >
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase text-red-300">Game cockpit</p>
            <h1 className="mt-2 text-4xl font-black uppercase tracking-normal text-amber-100 sm:text-6xl">
              Dark-Square Arena
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-sm">
            <CinematicButton href="/profile" variant="dark">Profile</CinematicButton>
            <CinematicButton href="/wanted-board" variant="dark">Wanted Board</CinematicButton>
            <CinematicButton onClick={auth.logout} variant="red">
              Logout
            </CinematicButton>
          </div>
        </header>

        <section className="grid flex-1 items-start gap-6 xl:grid-cols-[300px_minmax(420px,1fr)_320px] 2xl:grid-cols-[330px_minmax(520px,1fr)_340px]">
          <SetupSocialPanel
            auth={auth}
            gameMode={gameMode}
            setGameMode={changeGameMode}
            aiDifficulty={aiDifficulty}
            setAiDifficulty={setAiDifficulty}
            opponentUserId={opponentUserId}
            setOpponentUserId={setOpponentUserId}
            players={players}
            isLiveMode={isLiveMode}
            isQueueing={isQueueing}
            isLoading={isLoading}
            socket={socket}
            startGame={startGame}
            leaveQueue={leaveQueue}
            playerSearch={playerSearch}
            setPlayerSearch={setPlayerSearch}
            searchPlayers={searchPlayers}
            searchResults={searchResults}
            isSearchingPlayers={isSearchingPlayers}
            sendChallenge={sendChallenge}
            sendFriendRequest={sendFriendRequest}
            challengeMessage={challengeMessage}
            friends={friends}
            friendRequests={friendRequests}
            friendsMessage={friendsMessage}
            answerFriendRequest={answerFriendRequest}
            incomingChallenge={incomingChallenge}
            acceptIncomingChallenge={acceptIncomingChallenge}
            declineIncomingChallenge={declineIncomingChallenge}
          />

          <div className="mx-auto w-full max-w-[760px] xl:sticky xl:top-6">
            <Board
              board={game?.board ?? EMPTY_BOARD}
              selected={selected}
              moveTargets={moveTargets}
              onSquareClick={selectSquare}
              onMoveAttempt={submitMove}
              onPieceGrab={selectSquare}
              flipBoard={isLiveGame(game) && playerNumber === 2}
              blindMode={isBlindHuntMode(game?.mode ?? gameMode)}
              visibleBoardSquares={visibleBoardSquares}
              animations={pieceMotion.animations}
              promotions={pieceMotion.promotions}
              ownPlayerNumber={ownPlayerNumber}
              ownPieceSkin={pieceSkin}
              ownAvatarSrc={pieceAvatarSrc}
              disabled={!game || isLoading || isAiThinking || !isMyTurn}
            />
          </div>

          <MatchStatusPanel
            game={game}
            gameMode={gameMode}
            aiDifficulty={aiDifficulty}
            auth={auth}
            isLiveMode={isLiveMode}
            isLiveGame={isLiveGame(game)}
            isAiThinking={isAiThinking}
            socketStatus={socketStatus}
            playerNumber={playerNumber}
            opponent={opponent}
            isQueueing={isQueueing}
            blitzState={blitzState}
            socket={socket}
            error={error}
            drawMessage={drawMessage}
            onResign={requestResign}
            onOfferDraw={offerDraw}
          />
        </section>
      </div>
    </PageBackground>
  );
}

function SetupSocialPanel({
  auth,
  gameMode,
  setGameMode,
  aiDifficulty,
  setAiDifficulty,
  opponentUserId,
  setOpponentUserId,
  players,
  isLiveMode,
  isQueueing,
  isLoading,
  socket,
  startGame,
  leaveQueue,
  playerSearch,
  setPlayerSearch,
  searchPlayers,
  searchResults,
  isSearchingPlayers,
  sendChallenge,
  sendFriendRequest,
  challengeMessage,
  friends,
  friendRequests,
  friendsMessage,
  answerFriendRequest,
  incomingChallenge,
  acceptIncomingChallenge,
  declineIncomingChallenge
}) {
  return (
    <PosterPanel className="space-y-4 p-4 xl:sticky xl:top-6 xl:max-h-[calc(100vh-112px)] xl:overflow-y-auto">
      <PanelHeading eyebrow="Setup & Social" title="Duel Controls" />
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
          <option value="blitz">Blitz Duel</option>
          <option value="blind_hunt_local">Blind Hunt - Local</option>
          <option value="blind_hunt">Blind Hunt - Online</option>
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
          disabled={gameMode === "vs_ai" || gameMode === "blind_hunt_local" || LIVE_GAME_MODES.includes(gameMode)}
          className="mt-2 h-10 w-full rounded-md border border-stone-950/50 bg-stone-950/15 px-3 font-black text-stone-950 outline-none focus:border-red-900"
        >
          <option value="local">
            {gameMode === "vs_ai"
              ? `AI - ${labelDifficulty(aiDifficulty)}`
              : gameMode === "blind_hunt_local"
                ? "Local Blind Hunt"
              : LIVE_GAME_MODES.includes(gameMode)
                ? queueLabel(gameMode)
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

      <div className="grid gap-2">
        <button type="button" onClick={startGame} disabled={isLoading || isQueueing} className="poster-button w-full disabled:cursor-not-allowed disabled:opacity-60">
          {LIVE_GAME_MODES.includes(gameMode) ? "Find Match" : "New Game"}
        </button>
        {isQueueing ? (
          <button type="button" onClick={leaveQueue} className="blood-button w-full">
            Cancel Queue
          </button>
        ) : null}
      </div>

      {isQueueing ? (
        <div className="rounded-md border border-amber-700/50 bg-amber-950/20 p-3 text-sm font-black uppercase text-stone-950">
          Waiting for opponent...
        </div>
      ) : null}

      {isLiveMode ? (
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

      {isLiveMode ? (
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
    </PosterPanel>
  );
}

function MatchStatusPanel({
  game,
  gameMode,
  aiDifficulty,
  auth,
  isLiveMode,
  isLiveGame,
  isAiThinking,
  socketStatus,
  playerNumber,
  opponent,
  isQueueing,
  blitzState,
  socket,
  error,
  drawMessage,
  onResign,
  onOfferDraw
}) {
  return (
    <PosterPanel className="space-y-4 p-4 xl:sticky xl:top-6 xl:max-h-[calc(100vh-112px)] xl:overflow-y-auto">
      <PanelHeading eyebrow="Match Status" title="Board Intel" />
      <StatusPill game={game} />
      {isAiThinking ? (
        <div className="flex min-h-11 items-center rounded-md border border-red-700/60 bg-red-950/70 px-4 font-black uppercase text-red-100 shadow-lg shadow-black/30">
          AI thinking
        </div>
      ) : null}

      <InfoRow label="Mode" value={game ? modeLabel(game) : modeDraftLabel(gameMode, aiDifficulty)} />
      {isLiveMode ? <InfoRow label="Opponent" value={opponent?.username ?? (isQueueing ? "Searching" : "Waiting")} /> : null}
      {isLiveMode ? <InfoRow label="You are" value={playerNumber ? `Player ${playerNumber}` : "Unassigned"} /> : null}
      {isLiveMode ? <InfoRow label="Connection" value={socketStatus} /> : null}
      <InfoRow label="Turn" value={game?.currentTurn ? turnLabel(game, auth.user?.username, playerNumber, opponent?.username) : "Loading"} />
      <InfoRow label="Forced jump" value={game?.forcedFrom ?? "None"} />

      {game?.mode === "blitz" || gameMode === "blitz" ? (
        <BlitzClockPanel blitzState={blitzState ?? game?.blitzState} playerNumber={playerNumber} />
      ) : null}

      {isLiveGame && game?.status === "ongoing" ? (
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
          <button type="button" onClick={onOfferDraw} className="dark-button w-full">
            Offer Draw
          </button>
          <button type="button" onClick={onResign} className="blood-button w-full">
            Resign
          </button>
        </div>
      ) : null}

      {drawMessage ? (
        <div className="rounded-md border border-amber-700/50 bg-amber-950/20 p-3 text-sm font-black uppercase text-stone-950">
          {drawMessage}
        </div>
      ) : null}

      {error ? (
        <div className="rounded-md border border-red-900/50 bg-red-950/80 px-3 py-2 text-sm text-red-100">
          <p className="text-xs font-black uppercase text-red-200">Connection Alert</p>
          <p className="mt-1 font-semibold">{error}</p>
        </div>
      ) : null}

    </PosterPanel>
  );
}

function PanelHeading({ eyebrow, title }) {
  return (
    <div className="border-b border-stone-950/30 pb-3">
      <p className="text-xs font-black uppercase text-red-900">{eyebrow}</p>
      <h2 className="mt-1 text-2xl font-black uppercase tracking-normal text-stone-950">{title}</h2>
    </div>
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
  blindMode = false,
  visibleBoardSquares = null,
  animations,
  promotions,
  ownPlayerNumber = 1,
  ownPieceSkin = "classic",
  ownAvatarSrc = "",
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
    const cosmeticSkin = resolvePieceSkin(piece, ownPlayerNumber, ownPieceSkin);

    event.preventDefault();
    event.stopPropagation();

    const pointer = { x: event.clientX, y: event.clientY };
    dragRef.current = {
      pointerId: event.pointerId,
      playableIndex,
      piece,
      skin: cosmeticSkin,
      avatarSrc: cosmeticSkin === "avatar" ? ownAvatarSrc : "",
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
        skin: current.skin,
        avatarSrc: current.avatarSrc,
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
          const isHiddenByFog = blindMode && !visibleBoardSquares?.has(square);
          const canInteract = !isHiddenByFog || isMoveTarget;
          const isDragging = dragState?.playableIndex === playableIndex;
          const isSnappingBack = snapBack?.playableIndex === playableIndex;
          const skin = resolvePieceSkin(piece, ownPlayerNumber, ownPieceSkin);
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
              disabled={!isPlayable || disabled || !canInteract}
              onClick={() => {
                if (suppressClickRef.current) {
                  suppressClickRef.current = false;
                  return;
                }
                if (playableIndex !== null && canInteract) onSquareClick(playableIndex);
              }}
              className={[
                "relative flex items-center justify-center",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 focus-visible:ring-offset-0",
                isPlayable ? "game-square-dark hover:brightness-125" : "game-square-light",
                isHiddenByFog ? "blind-square-hidden" : "",
                isSelected ? "inset-ring" : ""
              ].join(" ")}
              aria-label={isPlayable ? `Playable square ${playableIndex}` : "Light square"}
            >
              {piece !== 0 && !isHiddenByFog ? (
                <Piece
                  piece={piece}
                  selected={isSelected}
                  dragging={isDragging || isSnappingBack}
                  animation={animation}
                  promotion={promotion}
                  skin={skin}
                  avatarSrc={skin === "avatar" ? ownAvatarSrc : ""}
                  onPointerDown={(event) => startPieceDrag(event, playableIndex, piece)}
                  onPointerMove={movePieceDrag}
                  onPointerUp={endPieceDrag}
                  onPointerCancel={endPieceDrag}
                />
              ) : null}
              {isMoveTarget ? <span className="valid-move-dot absolute z-30 h-4 w-4 rounded-full bg-amber-300/90 shadow-[0_0_18px_rgba(242,193,78,0.9)]" /> : null}
              <FogOverlay hidden={isHiddenByFog} />
            </button>
          );
        })}
      </div>
      {dragState ? <DraggedPiece dragState={dragState} boardElement={boardRef.current} /> : null}
      {snapBack ? <SnapBackPiece snapBack={snapBack} boardElement={boardRef.current} /> : null}
    </div>
  );
}

function Piece({ piece, selected, dragging, animation, promotion, skin = "classic", avatarSrc = "", onPointerDown, onPointerMove, onPointerUp, onPointerCancel }) {
  const isPlayerOne = piece === 1 || piece === 3;
  const isKing = piece === 3 || piece === 4;
  const slideStyle = animation
    ? {
        "--piece-slide-x": `${animation.dx * 138.888}%`,
        "--piece-slide-y": `${animation.dy * 138.888}%`
      }
    : undefined;
  const pieceClassName = pieceSkinClassName(skin, isPlayerOne);

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
        pieceClassName,
        isKing ? "king-piece-aura" : "",
        animation ? "piece-slide" : "",
        promotion ? "king-promotion-burst" : "",
        dragging ? "opacity-20" : "",
        selected ? "piece-selected ring-4 ring-amber-300 shadow-[0_0_28px_rgba(242,193,78,0.8)]" : "ring-1 ring-black/40"
      ].join(" ")}
    >
      {promotion ? <span className="promotion-flash" /> : null}
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

function DraggedPiece({ dragState, boardElement }) {
  if (!boardElement) return null;
  const bounds = boardElement.getBoundingClientRect();
  const size = bounds.width / 8;
  const isPlayerOne = dragState.piece === 1 || dragState.piece === 3;
  const skin = dragState.skin ?? "classic";

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
          pieceSkinClassName(skin, isPlayerOne),
          dragState.piece === 3 || dragState.piece === 4 ? "king-piece-aura" : ""
        ].join(" ")}
      >
        <PieceFace piece={dragState.piece} skin={skin} avatarSrc={dragState.avatarSrc ?? ""} />
      </span>
    </div>
  );
}

function SnapBackPiece({ snapBack, boardElement }) {
  if (!boardElement) return null;
  const bounds = boardElement.getBoundingClientRect();
  const isPlayerOne = snapBack.piece === 1 || snapBack.piece === 3;
  const skin = snapBack.skin ?? "classic";

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
          pieceSkinClassName(skin, isPlayerOne),
          snapBack.piece === 3 || snapBack.piece === 4 ? "king-piece-aura" : ""
        ].join(" ")}
      >
        <PieceFace piece={snapBack.piece} skin={skin} avatarSrc={snapBack.avatarSrc ?? ""} />
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

function resolvePieceSkin(piece, ownPlayerNumber, ownPieceSkin) {
  return pieceOwner(piece) === ownPlayerNumber ? ownPieceSkin : "classic";
}

function pieceSkinClassName(skin, isPlayerOne) {
  if (skin === "crimson") return "piece-skin-crimson text-red-50";
  if (skin === "ivory") return "piece-skin-ivory text-stone-950";
  if (skin === "avatar") return "piece-skin-avatar text-amber-50";
  return isPlayerOne
    ? "border-red-950 bg-gradient-to-br from-red-600 to-red-950 text-red-50 shadow-red-950/60"
    : "border-stone-950 bg-gradient-to-br from-stone-50 to-amber-200 text-stone-950 shadow-black/70";
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
  const ownPlayer = isLiveGame(game) && playerNumber ? playerNumber : 1;
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

function BlitzClockPanel({ blitzState, playerNumber }) {
  const playerOneMs = Number(blitzState?.playerClocks?.[1] ?? blitzState?.playerClocks?.["1"] ?? 180000);
  const playerTwoMs = Number(blitzState?.playerClocks?.[2] ?? blitzState?.playerClocks?.["2"] ?? 180000);
  const activePlayer = Number(blitzState?.activePlayer ?? 1);
  const moveMs = Number(blitzState?.moveRemainingMs ?? 10000);

  return (
    <div className="rounded-md border border-red-900/40 bg-red-950/10 p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase text-red-900">Blitz Duel</p>
          <p className="text-sm font-bold text-stone-800">3:00 total - 10s move timer</p>
        </div>
        <div className={`rounded-md border px-3 py-2 text-xl font-black ${moveMs <= 3000 ? "border-red-800 bg-red-950 text-red-100 blitz-warning" : "border-stone-950/40 bg-stone-950/10 text-stone-950"}`}>
          {Math.ceil(moveMs / 1000)}s
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <ClockCard label={playerNumber === 1 ? "You - P1" : "Player 1"} value={playerOneMs} active={activePlayer === 1} />
        <ClockCard label={playerNumber === 2 ? "You - P2" : "Player 2"} value={playerTwoMs} active={activePlayer === 2} />
      </div>
    </div>
  );
}

function ClockCard({ label, value, active }) {
  const low = value <= 10000;
  return (
    <div className={`rounded-md border p-2 ${active ? "border-amber-700 bg-amber-300/20" : "border-stone-950/30 bg-stone-950/10"} ${low ? "blitz-warning" : ""}`}>
      <p className="text-[10px] font-black uppercase text-stone-700">{label}</p>
      <p className={`text-2xl font-black ${low ? "text-red-950" : "text-stone-950"}`}>{formatClock(value)}</p>
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
      <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
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

      <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
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
      <p className="mt-1 text-xs font-black uppercase text-stone-800">
        {liveModeLabel(challenge.mode)}
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

function MatchGuardModal({ guard, onReturn, onResign }) {
  if (!guard) return null;

  return (
    <div className="cinematic-overlay fixed inset-0 flex items-center justify-center bg-black/70 px-4 py-6 backdrop-blur-md">
      <PosterPanel className="max-w-xl p-6 text-center shadow-2xl shadow-black/60">
        <p className="text-xs font-black uppercase text-red-900">Competitive Match Protection</p>
        <h2 className="mt-2 text-4xl font-black uppercase tracking-normal text-stone-950">
          {guard.title}
        </h2>
        <p className="mt-4 text-lg font-black text-stone-900">{guard.message}</p>
        <p className="mt-2 text-sm font-bold text-stone-800">{guard.detail}</p>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <button type="button" onClick={onReturn} disabled={guard.resigning} className="poster-button disabled:opacity-60">
            Return to Match
          </button>
          <button type="button" onClick={onResign} disabled={guard.resigning} className="blood-button disabled:opacity-60">
            {guard.resigning ? "Resigning..." : "Resign and Leave"}
          </button>
        </div>
      </PosterPanel>
    </div>
  );
}

function ConfirmResignModal({ open, onCancel, onConfirm }) {
  if (!open) return null;

  return (
    <div className="cinematic-overlay fixed inset-0 flex items-center justify-center bg-black/70 px-4 py-6 backdrop-blur-md">
      <PosterPanel className="max-w-lg p-6 text-center shadow-2xl shadow-black/60">
        <p className="text-xs font-black uppercase text-red-900">No Turning Back</p>
        <h2 className="mt-2 text-4xl font-black uppercase tracking-normal text-stone-950">Resign Match?</h2>
        <p className="mt-4 text-lg font-black text-stone-900">This will count as a defeat.</p>
        <p className="mt-2 text-sm font-bold text-stone-800">
          Your opponent will win immediately and bounty changes will be finalized normally.
        </p>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <button type="button" onClick={onCancel} className="poster-button">
            Return to Match
          </button>
          <button type="button" onClick={onConfirm} className="blood-button">
            Confirm Resign
          </button>
        </div>
      </PosterPanel>
    </div>
  );
}

function DrawOfferModal({ offer, onAccept, onDecline }) {
  if (!offer) return null;

  return (
    <div className="cinematic-overlay fixed inset-0 flex items-center justify-center bg-black/70 px-4 py-6 backdrop-blur-md">
      <PosterPanel className="max-w-lg p-6 text-center shadow-2xl shadow-black/60">
        <p className="text-xs font-black uppercase text-red-900">Draw Offer</p>
        <h2 className="mt-2 text-4xl font-black uppercase tracking-normal text-stone-950">Accept Draw?</h2>
        <p className="mt-4 text-lg font-black text-stone-900">
          {offer.offeredByUsername ?? "Opponent"} offers to split the bountyless result.
        </p>
        <p className="mt-2 text-sm font-bold text-stone-800">
          A draw only finalizes if both players agree. No bounty will be awarded.
        </p>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <button type="button" onClick={onDecline} className="blood-button">
            Decline
          </button>
          <button type="button" onClick={onAccept} className="poster-button">
            Accept Draw
          </button>
        </div>
      </PosterPanel>
    </div>
  );
}

function MatchResultOverlay({ game, auth, playerNumber, open, matchId, onClose, onNewGame }) {
  const [rendered, setRendered] = useState(open);
  const [closing, setClosing] = useState(false);

  useBodyScrollLock(rendered);

  useEffect(() => {
    if (open) {
      setRendered(true);
      setClosing(false);
      return undefined;
    }

    if (!rendered) return undefined;
    setClosing(true);
    const timeoutId = window.setTimeout(() => {
      setRendered(false);
      setClosing(false);
    }, 180);
    return () => window.clearTimeout(timeoutId);
  }, [open, rendered]);

  if (!rendered || !game || game.status === "ongoing") return null;

  const outcome = resolveMatchOutcome(game, playerNumber, auth.stats);
  const replayHref = matchId ? `/replay/${matchId}` : "";
  const coachHref = matchId ? `/replay/${matchId}?coach=1` : "";

  return (
    <div className={`cinematic-overlay match-result-overlay fixed inset-0 flex items-center justify-center px-3 py-5 ${closing ? "match-result-overlay-closing" : ""}`}>
      <button type="button" aria-label="Close result overlay" onClick={onClose} className="absolute inset-0 cursor-default bg-black/70 backdrop-blur-sm" />
      <section
        role="dialog"
        aria-modal="true"
        className={[
          "match-result-card poster-panel relative z-10 max-h-[92vh] w-full max-w-3xl overflow-y-auto p-5 text-center shadow-2xl sm:p-7",
          outcome.type === "victory" ? "match-result-victory" : "",
          outcome.type === "defeat" ? "match-result-defeat" : "",
          outcome.type === "draw" ? "match-result-draw" : ""
        ].join(" ")}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 rounded-md border border-stone-950/40 bg-stone-950/10 px-3 py-1 text-xs font-black uppercase text-stone-950 transition hover:bg-stone-950 hover:text-amber-100"
        >
          Close
        </button>

        <p className="text-xs font-black uppercase text-red-900">{outcome.eyebrow}</p>
        <h2 className="mt-2 text-5xl font-black uppercase tracking-normal text-stone-950 sm:text-7xl">
          {outcome.title}
        </h2>
        <p className="mx-auto mt-2 max-w-xl text-sm font-bold uppercase text-stone-700 sm:text-base">
          {outcome.subtitle}
        </p>

        <div className="match-result-bounty mx-auto mt-6 rounded-md border border-stone-950/30 bg-stone-950/10 p-4">
          <p className="text-xs font-black uppercase text-stone-700">{outcome.amountLabel}</p>
          <AnimatedBountyAmount
            value={outcome.primaryAmount}
            prefix={outcome.amountPrefix}
            active={open}
            className={`mt-1 block text-5xl sm:text-7xl ${outcome.type === "defeat" ? "text-red-950" : ""}`}
          />
          <p className="mt-2 text-sm font-black uppercase text-stone-800">
            {outcome.totalLabel}: {outcome.totalBounty === null ? "Not updated" : formatBounty(outcome.totalBounty)}
          </p>
        </div>

        {outcome.newRank ? (
          <div className="mx-auto mt-4 max-w-sm rounded-md border border-amber-700 bg-amber-300/40 px-4 py-3 text-center shadow-lg shadow-amber-900/20">
            <p className="text-xs font-black uppercase text-red-900">New Rank</p>
            <p className="text-2xl font-black uppercase tracking-normal text-stone-950">{outcome.newRank}</p>
          </div>
        ) : null}

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          {outcome.stats.map((stat) => (
            <div key={stat.label} className="rounded-md border border-stone-950/30 bg-stone-50/20 p-3">
              <p className="text-[11px] font-black uppercase text-stone-700">{stat.label}</p>
              <p className="mt-1 text-2xl font-black text-stone-950">{stat.value}</p>
            </div>
          ))}
        </div>

        {outcome.bonuses.length > 0 ? (
          <div className="mt-5 rounded-md border border-stone-950/30 bg-stone-950/10 p-3 text-left">
            <p className="text-xs font-black uppercase text-stone-700">Bonuses Applied</p>
            <div className="mt-2 space-y-2">
              {outcome.bonuses.map((bonus) => (
                <div key={bonus.code} className="flex items-center justify-between gap-3 border-b border-stone-950/20 pb-2 text-sm font-black text-stone-950">
                  <span>{bonus.label}</span>
                  <span>+{formatBounty(bonus.amount)}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <button type="button" onClick={onNewGame} className="poster-button">
            New Game
          </button>
          {replayHref ? (
            <a href={replayHref} className="dark-button text-center">Watch Replay</a>
          ) : (
            <button type="button" disabled className="dark-button opacity-50">Watch Replay</button>
          )}
          {coachHref ? (
            <a href={coachHref} className="dark-button text-center">AI Coach Analysis</a>
          ) : (
            <button type="button" disabled className="dark-button opacity-50">AI Coach Analysis</button>
          )}
          <a href="/stats" className="blood-button text-center">View Stats</a>
        </div>
      </section>
    </div>
  );
}

function AnimatedBountyAmount({ value, prefix = "", active, className = "" }) {
  const animatedValue = useAnimatedNumber(Math.abs(Number(value ?? 0)), active);
  return <span className={`bounty-text ${className}`}>{prefix}{formatBounty(animatedValue)}</span>;
}

function useAnimatedNumber(target, active) {
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (!active) return undefined;
    const start = performance.now();
    const duration = 900;
    let frameId = 0;

    function tick(now) {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(target * eased));
      if (progress < 1) frameId = requestAnimationFrame(tick);
    }

    setValue(0);
    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [active, target]);

  return value;
}

function resolveMatchOutcome(game, playerNumber, currentStats) {
  const matchResult = game.matchResult ?? {};
  if (matchResult.draw || game.status === "draw") {
    return {
      type: "draw",
      eyebrow: "Match Result",
      title: "Draw",
      subtitle: "No player could claim the bounty.",
      amountLabel: "Bounty Awarded",
      amountPrefix: "",
      primaryAmount: 0,
      totalLabel: "Bounty",
      totalBounty: currentStats?.bounty ?? null,
      newRank: "",
      bonuses: [],
      stats: [
        { label: "Result", value: "Draw" },
        { label: "Reason", value: drawReasonLabel(matchResult.drawReason) },
        { label: "Bounty", value: "None" }
      ]
    };
  }

  const ownPlayer = isLiveGame(game) && playerNumber ? playerNumber : 1;
  const didWin = game.winner === ownPlayer;
  const tierChanged = didWin && matchResult.winnerTier && currentStats?.tier && currentStats.tier !== matchResult.winnerTier;

  if (didWin) {
    return {
      type: "victory",
      eyebrow: "Victory Confirmed",
      title: matchResult.localOnly ? "You Won" : "Bounty Updated",
      subtitle: matchResult.localOnly ? matchResult.message : `${matchResult.winnerDisplayName ?? "Winner"} claimed the board.`,
      amountLabel: matchResult.localOnly ? "Local Match" : "Bounty Gained",
      amountPrefix: matchResult.localOnly ? "" : "+",
      primaryAmount: matchResult.bountyGain ?? 0,
      totalLabel: "New Total Bounty",
      totalBounty: matchResult.winnerNewBounty ?? null,
      newRank: tierChanged ? matchResult.winnerTier : "",
      bonuses: matchResult.bonusesApplied ?? [],
      stats: [
        { label: "Winner", value: matchResult.winnerDisplayName ?? `Player ${game.winner}` },
        { label: "Win Streak", value: `x${matchResult.streakMultiplier ?? 1}` },
        { label: "Tier", value: matchResult.winnerTier ?? "Unknown" }
      ]
    };
  }

  return {
    type: "defeat",
    eyebrow: "Defeat Recorded",
    title: matchResult.localOnly ? "Defeat" : "Bounty Lost",
    subtitle: matchResult.timeout ? matchResult.message : `${matchResult.winnerDisplayName ?? "Opponent"} took the match.`,
    amountLabel: matchResult.localOnly ? "Local Match" : "Bounty Lost",
    amountPrefix: matchResult.localOnly ? "" : "-",
    primaryAmount: matchResult.bountyLoss ?? 0,
    totalLabel: "New Total Bounty",
    totalBounty: matchResult.loserNewBounty ?? null,
    newRank: "",
    bonuses: [],
    stats: [
      { label: "Opponent Gained", value: matchResult.localOnly ? "None" : `+${formatBounty(matchResult.bountyGain ?? 0)}` },
      { label: "Winner", value: matchResult.winnerDisplayName ?? `Player ${game.winner}` },
      { label: "Tier", value: matchResult.loserTier ?? "Unknown" }
    ]
  };
}

function drawReasonLabel(reason) {
  if (reason === "threefold_repetition") return "Threefold repetition";
  if (reason === "no_progress") return "30 turns without capture or promotion";
  return "Draw";
}

function formatClock(value) {
  const totalSeconds = Math.max(0, Math.ceil(Number(value ?? 0) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function turnLabel(game, username, playerNumber, opponentName) {
  if (LIVE_GAME_MODES.includes(game.mode) && playerNumber) {
    if (game.currentTurn === playerNumber) return "Your turn";
    return `${opponentName ?? "Opponent"} to move`;
  }
  if (game.currentTurn === 1) return `${username ?? "You"} as Player 1`;
  if (game.mode === "vs_ai") return `AI - ${labelDifficulty(game.aiDifficulty)}`;
  return game.playerTwoUserId ? "Player 2" : "Local Player 2";
}

function getBlindVisionPlayer(game, gameMode, playerNumber) {
  const mode = game?.mode ?? gameMode;
  if (!isBlindHuntMode(mode)) return null;
  if (isLiveGame(game) && playerNumber) return playerNumber;
  return game?.currentTurn ?? 1;
}

function isLiveGame(game) {
  return Boolean(game?.playerTwoUserId && LIVE_GAME_MODES.includes(game.mode));
}

function queueEventForMode(gameMode) {
  if (gameMode === "blitz") return "queue:join_blitz";
  if (gameMode === BLIND_HUNT_MODE) return "queue:join_blind";
  return "queue:join";
}

function challengeModeForDraft(gameMode) {
  if (gameMode === "blitz") return "blitz";
  if (gameMode === BLIND_HUNT_MODE) return BLIND_HUNT_MODE;
  return "multiplayer";
}

function liveDraftModeFromGame(mode) {
  if (mode === "blitz") return "blitz";
  if (mode === BLIND_HUNT_MODE) return BLIND_HUNT_MODE;
  return "multiplayer";
}

function queueLabel(gameMode) {
  if (gameMode === "blitz") return "Blitz Queue";
  if (gameMode === BLIND_HUNT_MODE) return "Blind Hunt Queue";
  return "Matchmaking Queue";
}

function liveModeLabel(mode) {
  if (mode === "blitz") return "Blitz Duel";
  if (mode === BLIND_HUNT_MODE) return "Blind Hunt Mode";
  return "Online Multiplayer";
}

function modeLabel(game) {
  if (game.mode === "vs_ai") return `vs AI - ${labelDifficulty(game.aiDifficulty)}`;
  if (game.mode === "multiplayer") return "Online Multiplayer";
  if (game.mode === "blitz") return "Blitz Duel";
  if (game.mode === BLIND_HUNT_MODE) return game.playerTwoUserId ? "Blind Hunt - Online" : "Blind Hunt - Local";
  return "Local PvP";
}

function modeDraftLabel(gameMode, aiDifficulty) {
  if (gameMode === "vs_ai") return `vs AI - ${labelDifficulty(aiDifficulty)}`;
  if (gameMode === "multiplayer") return "Online Multiplayer";
  if (gameMode === "blitz") return "Blitz Duel";
  if (gameMode === "blind_hunt") return "Blind Hunt - Online";
  if (gameMode === "blind_hunt_local") return "Blind Hunt - Local";
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
