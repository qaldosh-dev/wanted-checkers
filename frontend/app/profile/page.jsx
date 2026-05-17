"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../auth-context";
import {
  BountyAmount,
  BrandNav,
  CinematicButton,
  PageBackground,
  PosterPanel,
  PosterStat,
  TierBadge,
  formatBounty
} from "../components/wanted-ui";
import { KAZAKHSTAN_REGIONS } from "../constants/regions";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export default function ProfilePage() {
  const router = useRouter();
  const auth = useAuth();
  const [isEditing, setIsEditing] = useState(false);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [form, setForm] = useState({
    firstName: auth.user?.firstName ?? "",
    lastName: auth.user?.lastName ?? "",
    city: auth.user?.city ?? ""
  });
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState("");
  const [recentMatches, setRecentMatches] = useState([]);
  const [matchesError, setMatchesError] = useState("");
  const [ranking, setRanking] = useState(null);

  useEffect(() => {
    if (!auth.isAuthLoading && !auth.isAuthenticated) router.push("/login");
  }, [auth.isAuthLoading, auth.isAuthenticated, router]);

  useEffect(() => {
    if (!auth.user) return;
    setForm({
      firstName: auth.user.firstName ?? "",
      lastName: auth.user.lastName ?? "",
      city: auth.user.city ?? ""
    });
  }, [auth.user]);

  useEffect(() => {
    if (!auth.isAuthenticated) return;

    async function loadRecentMatches() {
      try {
        const [matchesResponse, rankingResponse] = await Promise.all([
          fetch(`${API_URL}/api/matches/recent`, {
            headers: auth.authHeaders(),
            cache: "no-store"
          }),
          fetch(`${API_URL}/api/players/rank/me`, {
            headers: auth.authHeaders(),
            cache: "no-store"
          })
        ]);
        const rankingPayload = await rankingResponse.json();
        if (rankingResponse.ok) setRanking(rankingPayload.ranking);
        const response = matchesResponse;
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error ?? "Could not load recent matches.");
        setRecentMatches(payload.matches);
      } catch (caughtError) {
        setMatchesError(caughtError.message);
      }
    }

    loadRecentMatches();
  }, [auth]);

  useEffect(() => {
    if (!avatarFile) {
      setAvatarPreview("");
      return undefined;
    }

    const objectUrl = URL.createObjectURL(avatarFile);
    setAvatarPreview(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [avatarFile]);

  if (auth.isAuthLoading || !auth.user) {
    return (
      <PageBackground>
        <div className="p-8 text-stone-100">Loading profile...</div>
      </PageBackground>
    );
  }

  async function saveProfile(event) {
    event.preventDefault();
    setIsLoading(true);
    setError("");

    try {
      const body = new FormData();
      Object.entries(form).forEach(([key, value]) => body.append(key, value));
      if (avatarFile) body.append("avatar", avatarFile);

      const response = await fetch(`${API_URL}/api/auth/profile`, {
        method: "PUT",
        headers: auth.authHeaders(),
        body
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Could not update profile.");
      auth.applySession({ token: auth.token, user: payload.user, stats: payload.stats });
      setAvatarFile(null);
      setIsEditing(false);
    } catch (caughtError) {
      setError(caughtError.message);
    } finally {
      setIsLoading(false);
    }
  }

  function chooseAvatar(file) {
    setError("");

    if (!file) {
      setAvatarFile(null);
      return;
    }

    const validationError = validateAvatarFile(file);
    if (validationError) {
      setAvatarFile(null);
      setError(validationError);
      return;
    }

    setAvatarFile(file);
  }

  const stats = auth.stats;
  const avatar = avatarPreview || toAvatarSrc(auth.user.avatarUrl) || buildAvatarUrl(auth.user.username);

  return (
    <PageBackground>
      <BrandNav auth={auth} active="profile" />
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase text-red-300">Criminal dossier</p>
            <h1 className="mt-2 text-4xl font-black uppercase tracking-normal text-amber-100 sm:text-6xl">
              Player Identity
            </h1>
          </div>
          <div className="flex flex-wrap gap-3">
            <CinematicButton href="/play" variant="dark">Back to Game</CinematicButton>
            <CinematicButton onClick={auth.logout} variant="red">Logout</CinematicButton>
          </div>
        </header>

        <section className="mt-8 grid gap-6 lg:grid-cols-[390px_1fr]">
          <article className="wanted-poster">
            <p className="text-sm font-black uppercase">Wanted</p>
            <img
              src={avatar}
              alt=""
              className="my-4 aspect-square w-full rounded-md border-4 border-stone-950 object-cover"
            />
            <h2 className="text-4xl font-black uppercase tracking-normal text-stone-950">{auth.user.username}</h2>
            <p className="mt-1 font-bold text-stone-800">{auth.user.city || "Unclaimed Region"}</p>
            {ranking?.prestigeLabel ? (
              <p className="mt-3 rounded-md border border-amber-800 bg-amber-300/30 px-3 py-2 text-center text-xs font-black uppercase text-stone-950">
                {ranking.prestigeLabel}
              </p>
            ) : null}
            <p className="mt-5 text-sm font-black uppercase text-stone-800">Bounty</p>
            <BountyAmount value={stats?.bounty ?? 0} className="text-4xl" />
            <div className="mt-3"><TierBadge tier={stats?.tier ?? "Unknown"} /></div>
          </article>

          <div className="space-y-6">
            <PosterPanel className="grid gap-3 p-4 sm:grid-cols-3 xl:grid-cols-6">
              <PosterStat label="Wins" value={stats?.wins ?? 0} />
              <PosterStat label="Losses" value={stats?.losses ?? 0} />
              <PosterStat label="Win Streak" value={stats?.currentWinStreak ?? 0} />
              <PosterStat label="Best Streak" value={stats?.bestWinStreak ?? 0} />
              <PosterStat label="KZ Rank" value={ranking?.nationalRank ? `#${ranking.nationalRank}` : "N/A"} />
              <PosterStat label="Region Rank" value={ranking?.regionalRank ? `#${ranking.regionalRank}` : "N/A"} />
            </PosterPanel>

            <PosterPanel className="p-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-black uppercase text-stone-800">Identity</p>
                  <h3 className="text-2xl font-black tracking-normal text-stone-950">
                    {auth.user.firstName} {auth.user.lastName}
                  </h3>
                  <p className="mt-1 font-semibold text-stone-800">{auth.user.email}</p>
                </div>
                <button type="button" onClick={() => setIsEditing(!isEditing)} className="dark-button">
                  Edit Profile
                </button>
              </div>

              {isEditing ? (
                <form onSubmit={saveProfile} className="mt-5 grid gap-4 sm:grid-cols-2">
                  <Field label="First Name" value={form.firstName} onChange={(value) => setForm({ ...form, firstName: value })} />
                  <Field label="Last Name" value={form.lastName} onChange={(value) => setForm({ ...form, lastName: value })} />
                  <RegionField value={form.city} onChange={(value) => setForm({ ...form, city: value })} />
                  <AvatarField onChange={chooseAvatar} />
                  {error ? <p className="rounded-md bg-red-950/80 px-3 py-2 text-sm text-red-100 sm:col-span-2">{error}</p> : null}
                  <button type="submit" disabled={isLoading} className="poster-button sm:col-span-2 disabled:opacity-60">
                    Save Changes
                  </button>
                </form>
              ) : null}
            </PosterPanel>

            <PosterPanel className="p-5">
              <p className="text-sm font-black uppercase text-stone-800">Total Games</p>
              <p className="mt-2 text-5xl font-black tracking-normal text-stone-950">{stats?.totalGames ?? 0}</p>
            </PosterPanel>

            <PosterPanel className="p-5">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-sm font-black uppercase text-stone-800">Recent Matches</p>
                  <h3 className="text-2xl font-black tracking-normal text-stone-950">Replay Ledger</h3>
                </div>
                <span className="text-xs font-black uppercase text-stone-700">Last 3</span>
              </div>
              {matchesError ? <p className="mt-4 rounded-md bg-red-950/80 px-3 py-2 text-sm text-red-100">{matchesError}</p> : null}
              <div className="mt-4 space-y-3">
                {recentMatches.map((match) => (
                  <RecentMatchCard key={match.matchId} match={match} />
                ))}
                {recentMatches.length === 0 && !matchesError ? (
                  <p className="rounded-md border border-stone-950/30 bg-stone-950/10 p-4 text-sm font-bold text-stone-800">
                    No completed matches yet.
                  </p>
                ) : null}
              </div>
            </PosterPanel>
          </div>
        </section>
      </div>
    </PageBackground>
  );
}

function RecentMatchCard({ match }) {
  return (
    <article className="rounded-md border border-stone-950/35 bg-stone-950/10 p-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase text-red-900">{resultLabel(match.result)}</p>
          <h4 className="text-xl font-black tracking-normal text-stone-950">{match.opponent}</h4>
          <p className="mt-1 text-xs font-bold uppercase text-stone-700">
            {modeLabel(match.mode)} - {formatDate(match.createdAt)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`rounded-md border px-3 py-2 text-sm font-black ${match.bountyChange >= 0 ? "border-amber-800/50 text-stone-950" : "border-red-900/50 text-red-950"}`}>
            {match.bountyChange > 0 ? "+" : ""}{formatBounty(match.bountyChange)}
          </span>
          <a href={`/replay/${match.matchId}`} className="dark-button px-3 py-2 text-xs">
            Watch Replay
          </a>
        </div>
      </div>
    </article>
  );
}

function resultLabel(result) {
  if (result === "win") return "Victory";
  if (result === "loss") return "Defeat";
  return "Draw";
}

function modeLabel(mode) {
  if (mode === "vs_ai") return "vs AI";
  if (mode === "multiplayer") return "Online Duel";
  return "Local PvP";
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

function AvatarField({ onChange }) {
  return (
    <label className="block">
      <span className="text-sm font-black uppercase text-stone-800">Change Avatar</span>
      <input
        type="file"
        accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
        onChange={(event) => onChange(event.target.files?.[0] ?? null)}
        className="mt-2 block w-full rounded-md border border-stone-950/50 bg-stone-950/15 px-3 py-2 text-sm font-bold text-stone-950 outline-none transition file:mr-3 file:rounded-md file:border-0 file:bg-stone-950 file:px-3 file:py-2 file:font-bold file:text-amber-200 focus:border-red-900"
      />
      <span className="mt-1 block text-xs font-semibold text-stone-700">JPG, PNG, or WebP. Max 2MB.</span>
    </label>
  );
}

function Field({ label, value, onChange }) {
  return (
    <label className="block">
      <span className="text-sm font-black uppercase text-stone-800">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 h-10 w-full rounded-md border border-stone-950/50 bg-stone-950/15 px-3 font-bold text-stone-950 outline-none transition focus:border-red-900"
      />
    </label>
  );
}

function RegionField({ value, onChange }) {
  return (
    <label className="block">
      <span className="text-sm font-black uppercase text-stone-800">Region</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 h-10 w-full rounded-md border border-stone-950/50 bg-stone-950/15 px-3 font-bold text-stone-950 outline-none transition focus:border-red-900"
        required
      >
        <option value="">Choose Kazakhstan region</option>
        {KAZAKHSTAN_REGIONS.map((region) => (
          <option key={region} value={region}>{region}</option>
        ))}
      </select>
    </label>
  );
}

function buildAvatarUrl(seed) {
  return `${API_URL}/api/avatars/default/${encodeURIComponent(seed)}`;
}

function toAvatarSrc(value) {
  if (!value) return "";
  if (value.startsWith("http") || value.startsWith("data:") || value.startsWith("blob:")) return value;
  return `${API_URL}${value}`;
}

function validateAvatarFile(file) {
  const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
  const allowedExtensions = [".jpg", ".jpeg", ".png", ".webp"];
  const extension = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();

  if (!allowedTypes.includes(file.type) || !allowedExtensions.includes(extension)) {
    return "Avatar must be a JPG, PNG, or WebP image.";
  }
  if (file.size > 2 * 1024 * 1024) {
    return "Avatar must be 2MB or smaller.";
  }
  return "";
}
