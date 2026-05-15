const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

const TIER_STYLES = {
  Unknown: "border-stone-700 bg-stone-950 text-stone-300 shadow-black/30",
  "Rookie Threat": "border-amber-700 bg-amber-950 text-amber-200 shadow-amber-950/30",
  "Rising Menace": "border-red-800 bg-red-950 text-red-100 shadow-red-950/40",
  Dangerous: "border-red-700 bg-red-950 text-amber-100 shadow-red-800/50",
  Notorious: "border-amber-500 bg-stone-950 text-amber-200 shadow-amber-600/40",
  Warlord: "border-yellow-400 bg-stone-950 text-yellow-200 shadow-yellow-500/50",
  Emperor: "border-yellow-300 bg-black text-yellow-100 shadow-yellow-300/60"
};

export function PageBackground({ children, className = "" }) {
  return (
    <main className={`wanted-bg min-h-screen overflow-hidden text-stone-100 ${className}`}>
      <div className="relative z-10">{children}</div>
    </main>
  );
}

export function BrandNav({ auth, active = "", compact = false }) {
  return (
    <header className="mx-auto flex w-full max-w-7xl flex-col gap-4 border-b border-amber-900/60 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
      <a href="/" className="flex items-center gap-3">
        <span className="grid h-12 w-12 place-items-center rounded-full border-2 border-amber-400 bg-black text-2xl font-black text-amber-200 shadow-lg shadow-amber-950/60">
          K
        </span>
        <span>
          <span className="block text-xl font-black uppercase leading-none text-amber-100 sm:text-2xl">
            WANTED
          </span>
          <span className="block text-lg font-black uppercase leading-none text-red-300 sm:text-xl">
            CHECKERS
          </span>
        </span>
      </a>

      <nav className="flex flex-wrap items-center gap-2 text-sm font-black uppercase text-stone-300">
        <NavLink href="/wanted-board" active={active === "board"}>Wanted Board</NavLink>
        <NavLink href="/play" active={active === "play"}>Play</NavLink>
        {auth?.isAuthenticated ? <NavLink href="/profile" active={active === "profile"}>Profile</NavLink> : null}
        {!compact && !auth?.isAuthenticated ? <NavLink href="/login" active={active === "login"}>Login</NavLink> : null}
        {!compact && !auth?.isAuthenticated ? (
          <a href="/register" className="poster-button px-4 py-2 text-stone-950">Register</a>
        ) : null}
      </nav>
    </header>
  );
}

export function NavLink({ href, active, children }) {
  return (
    <a
      href={href}
      className={`rounded-md px-3 py-2 transition ${
        active
          ? "bg-amber-400/15 text-amber-200 ring-1 ring-amber-500/50"
          : "text-stone-300 hover:bg-amber-400/10 hover:text-amber-200"
      }`}
    >
      {children}
    </a>
  );
}

export function PosterPanel({ children, className = "" }) {
  return <section className={`poster-panel ${className}`}>{children}</section>;
}

export function CinematicButton({ href, onClick, children, variant = "paper", disabled = false, type = "button", className = "" }) {
  const classes =
    variant === "dark"
      ? "dark-button"
      : variant === "red"
        ? "blood-button"
        : "poster-button";

  if (href) {
    return (
      <a href={href} className={`${classes} ${className}`}>
        {children}
      </a>
    );
  }

  return (
    <button type={type} disabled={disabled} onClick={onClick} className={`${classes} ${className}`}>
      {children}
    </button>
  );
}

export function TierBadge({ tier = "Unknown", className = "" }) {
  const style = TIER_STYLES[tier] ?? TIER_STYLES.Unknown;
  return (
    <span className={`inline-flex items-center rounded-md border px-3 py-1 text-xs font-black uppercase shadow-lg ${style} ${className}`}>
      {tier}
    </span>
  );
}

export function BountyAmount({ value, prefix = "", className = "" }) {
  const display = value === null || value === undefined ? "Not updated" : `${prefix}${formatBounty(value)}`;
  return <span className={`bounty-text ${className}`}>{display}</span>;
}

export function WantedPosterCard({ player, rank, compact = false }) {
  const tier = player?.tier ?? "Unknown";
  const strongTier = ["Dangerous", "Notorious", "Warlord", "Emperor"].includes(tier);
  const username = player?.username ?? "Unknown";

  return (
    <article className={`wanted-poster bounty-poster ${strongTier ? "wanted-poster-elite" : ""}`}>
      <div className="absolute right-4 top-4 z-20">
        <TierBadge tier={tier} className="rotate-2 opacity-90" />
      </div>

      <div className="text-center">
        <p className="text-[10px] font-black uppercase text-stone-700">Bounty Notice #{rank}</p>
        <h2 className={`${compact ? "text-5xl" : "text-6xl sm:text-7xl"} wanted-title font-black uppercase tracking-normal text-stone-950`}>
          WANTED
        </h2>
      </div>

      <div className={`poster-portrait poster-portrait-large ${compact ? "my-3" : "my-5"}`}>
        <img
          src={toAvatarSrc(player?.avatarUrl) || buildAvatarUrl(username)}
          alt=""
          className="h-full w-full object-cover"
        />
      </div>

      <div className="text-center">
        <p className={`${compact ? "text-lg" : "text-2xl"} dead-or-alive font-black uppercase text-stone-800`}>
          Dead Or Alive
        </p>
        <h3 className={`${compact ? "text-2xl" : "text-4xl"} poster-name mt-1 font-black uppercase tracking-normal text-stone-950`}>
          {username}
        </h3>
        <p className="mt-1 text-xs font-black uppercase text-stone-700">{player?.city || "Unknown Waters"}</p>
      </div>

      <div className={`${compact ? "mt-3" : "mt-5"} text-center`}>
        <p className="text-xs font-black uppercase text-stone-700">Bounty</p>
        <div className="flex items-baseline justify-center gap-2">
          <span className={`${compact ? "text-2xl" : "text-4xl"} bounty-symbol font-black text-stone-950`}>฿</span>
          <BountyAmount value={player?.bounty ?? 0} className={compact ? "text-3xl" : "text-5xl"} />
        </div>
      </div>

      <div className={`${compact ? "mt-3" : "mt-5"} grid grid-cols-3 gap-2 text-center`}>
        <PosterStat label="Wins" value={player?.wins ?? 0} />
        <PosterStat label="Losses" value={player?.losses ?? 0} />
        <PosterStat label="Streak" value={player?.currentWinStreak ?? 0} />
      </div>
    </article>
  );
}

export function PosterStat({ label, value }) {
  return (
    <div className="rounded-md border border-stone-950/40 bg-stone-950/10 px-2 py-2">
      <p className="text-[11px] font-black uppercase text-stone-700">{label}</p>
      <p className="mt-1 text-xl font-black text-stone-950">{value}</p>
    </div>
  );
}

export function BoardMotif({ className = "" }) {
  return (
    <div className={`board-motif ${className}`} aria-hidden="true">
      {Array.from({ length: 32 }, (_, index) => <span key={index} />)}
    </div>
  );
}

export function formatBounty(value) {
  return new Intl.NumberFormat("en-US").format(value);
}

export function buildAvatarUrl(seed) {
  return `${API_URL}/api/avatars/default/${encodeURIComponent(seed || "wanted")}`;
}

export function toAvatarSrc(value) {
  if (!value) return "";
  if (value.startsWith("http") || value.startsWith("data:") || value.startsWith("blob:")) return value;
  return `${API_URL}${value}`;
}
