"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

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

export const PIECE_SKINS = [
  { id: "classic", name: "Classic", tier: "free", description: "Original tavern-table checker colors." },
  { id: "crimson", name: "Crimson", tier: "free", description: "Blood-red lacquer with gold heat." },
  { id: "ivory", name: "Ivory", tier: "free", description: "Aged bone and parchment champion pieces." },
  { id: "avatar", name: "Avatar", tier: "free", description: "Your wanted portrait sealed into each piece." },
  { id: "dragon", name: "Dragon", tier: "pro", description: "Molten scale glow for legendary raids." },
  { id: "shadow", name: "Shadow", tier: "pro", description: "Black-market smoke and midnight steel." },
  { id: "neon", name: "Neon", tier: "pro", description: "Electric arcade bounty energy." },
  { id: "samurai", name: "Samurai", tier: "pro", description: "Ceremonial armor with crimson trim." }
];

const FREE_PIECE_SKIN_IDS = new Set(PIECE_SKINS.filter((skin) => skin.tier === "free").map((skin) => skin.id));
const PIECE_SKIN_STORAGE_KEY = "wanted-checkers-piece-skin";
const THEME_STORAGE_KEY = "wanted-checkers-theme";
const THEME_CHANGE_EVENT = "wanted-checkers-theme-change";
let bodyScrollLockCount = 0;
let previousBodyOverflow = "";

export function useBodyScrollLock(isLocked) {
  useEffect(() => {
    if (!isLocked || typeof document === "undefined") return undefined;

    if (bodyScrollLockCount === 0) {
      previousBodyOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      document.body.classList.add("cinematic-modal-open");
    }

    bodyScrollLockCount += 1;

    return () => {
      bodyScrollLockCount = Math.max(0, bodyScrollLockCount - 1);
      if (bodyScrollLockCount === 0) {
        document.body.style.overflow = previousBodyOverflow;
        document.body.classList.remove("cinematic-modal-open");
      }
    };
  }, [isLocked]);
}

export const WANTED_THEMES = [
  {
    id: "classic",
    name: "Classic",
    description: "The current WANTED CHECKERS bounty-board identity."
  },
  {
    id: "western",
    name: "Wanted Western",
    description: "Warm parchment, sheriff gold, and old saloon wood."
  },
  {
    id: "noir",
    name: "Midnight Noir",
    description: "Charcoal, crimson pressure, and elite bounty-hunter atmosphere."
  }
];

const THEME_IDS = new Set(WANTED_THEMES.map((theme) => theme.id));

export function PageBackground({ children, className = "" }) {
  const [theme] = useWantedTheme();

  return (
    <main data-theme={theme} className={`wanted-bg min-h-screen overflow-hidden text-stone-100 ${className}`}>
      <div className="relative z-10">{children}</div>
    </main>
  );
}

export function BrandNav({ auth, active = "", compact = false }) {
  return (
    <header className="brand-nav mx-auto flex w-full max-w-7xl flex-col gap-4 border-b border-amber-900/60 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
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
        {auth?.isAuthenticated ? <NavLink href="/stats" active={active === "stats"}>Stats</NavLink> : null}
        {!compact && !auth?.isAuthenticated ? <NavLink href="/login" active={active === "login"}>Sign In</NavLink> : null}
        <ProUpgradeButton />
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

export function usePieceSkin() {
  const [skin, setSkinState] = useState("classic");

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(PIECE_SKIN_STORAGE_KEY);
      if (FREE_PIECE_SKIN_IDS.has(stored)) setSkinState(stored);
    } catch {
      setSkinState("classic");
    }
  }, []);

  function setSkin(nextSkin) {
    const safeSkin = FREE_PIECE_SKIN_IDS.has(nextSkin) ? nextSkin : "classic";
    setSkinState(safeSkin);
    try {
      window.localStorage.setItem(PIECE_SKIN_STORAGE_KEY, safeSkin);
    } catch {
      // Local storage can be unavailable in private or restricted browser contexts.
    }
  }

  return [skin, setSkin];
}

export function useWantedTheme() {
  const [theme, setThemeState] = useState("classic");

  useEffect(() => {
    function readStoredTheme() {
      try {
        const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
        setThemeState(THEME_IDS.has(stored) ? stored : "classic");
      } catch {
        setThemeState("classic");
      }
    }

    function handleThemeChange(event) {
      const nextTheme = event.detail?.theme;
      if (THEME_IDS.has(nextTheme)) setThemeState(nextTheme);
    }

    readStoredTheme();
    window.addEventListener("storage", readStoredTheme);
    window.addEventListener(THEME_CHANGE_EVENT, handleThemeChange);

    return () => {
      window.removeEventListener("storage", readStoredTheme);
      window.removeEventListener(THEME_CHANGE_EVENT, handleThemeChange);
    };
  }, []);

  function setTheme(nextTheme) {
    const safeTheme = THEME_IDS.has(nextTheme) ? nextTheme : "classic";
    setThemeState(safeTheme);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, safeTheme);
      window.dispatchEvent(new CustomEvent(THEME_CHANGE_EVENT, { detail: { theme: safeTheme } }));
    } catch {
      // Theme selection remains usable even when local storage is unavailable.
    }
  }

  return [theme, setTheme];
}

export function ThemeSelector() {
  const [theme, setTheme] = useWantedTheme();

  return (
    <section className="rounded-md border border-stone-950/30 bg-stone-950/10 p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-black uppercase text-stone-800">Arena Theme</p>
          <h3 className="text-2xl font-black uppercase tracking-normal text-stone-950">Cinematic Identity</h3>
        </div>
        <p className="max-w-md text-sm font-bold text-stone-800">
          Reskin the arena atmosphere without changing layout or gameplay readability.
        </p>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        {WANTED_THEMES.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => setTheme(option.id)}
            className={[
              "theme-option-card text-left",
              `theme-option-card-${option.id}`,
              theme === option.id ? "theme-option-card-active" : ""
            ].join(" ")}
          >
            <span className="theme-option-swatch" />
            <span className="mt-3 block text-base font-black uppercase text-stone-950">{option.name}</span>
            <span className="mt-1 block text-xs font-bold text-stone-800">{option.description}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

export function ProUpgradeButton({ className = "", label = "PRO" }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className={`pro-button ${className}`}
        aria-haspopup="dialog"
      >
        {label}
      </button>
      {isOpen ? <ProUpgradeModal onClose={() => setIsOpen(false)} /> : null}
    </>
  );
}

function ProUpgradeModal({ onClose }) {
  const [teaser, setTeaser] = useState("");
  const [mounted, setMounted] = useState(false);
  const [theme] = useWantedTheme();

  useBodyScrollLock(true);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === "Escape") onClose();
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  if (!mounted) return null;

  return createPortal(
    <div
      data-theme={theme}
      className="cinematic-overlay wanted-bg pro-modal-backdrop"
      role="presentation"
      onMouseDown={onClose}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="pro-upgrade-title"
        className="pro-modal"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button type="button" onClick={onClose} className="pro-modal-close" aria-label="Close PRO upgrade modal">
          X
        </button>

        <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="flex flex-col justify-between gap-6">
            <div>
              <p className="text-xs font-black uppercase text-red-900">Legendary Access</p>
              <h2 id="pro-upgrade-title" className="wanted-title mt-2 text-5xl font-black uppercase leading-none tracking-normal text-stone-950 sm:text-7xl">
                WANTED PRO
              </h2>
              <p className="mt-4 text-base font-bold leading-relaxed text-stone-900">
                A cinematic preview of the premium future of WANTED CHECKERS. No billing is connected in this MVP.
              </p>
            </div>

            <div className="rounded-md border border-stone-950/30 bg-stone-950/10 p-4">
              <p className="text-xs font-black uppercase text-stone-700">Included Preview</p>
              <div className="mt-3 grid gap-3">
                <ProFeature title="Unlimited AI Coach" description="Remove daily analysis limits, unlock unlimited coaching sessions, and expand tactical review." />
                <ProFeature title="Priority Features" description="Priority matchmaking, animated king effects, and an elite player badge for your poster." />
              </div>
            </div>

            <div>
              <button
                type="button"
                onClick={() => setTeaser("Coming Soon: PRO access is presentation-only in this MVP. No payment flow exists yet.")}
                className="pro-cta w-full"
              >
                Become Legendary
              </button>
              {teaser ? (
                <p className="mt-3 rounded-md border border-amber-900/40 bg-stone-950/10 px-3 py-2 text-sm font-black uppercase text-stone-900">
                  {teaser}
                </p>
              ) : null}
            </div>
          </div>

          <div className="space-y-4">
            <ProPreviewSection
              eyebrow="Exclusive Piece Skins"
              items={[
                { title: "Dragon", tone: "from-red-950 via-amber-700 to-black" },
                { title: "Shadow", tone: "from-stone-950 via-stone-800 to-black" },
                { title: "Neon", tone: "from-cyan-500 via-fuchsia-700 to-black" },
                { title: "Samurai", tone: "from-red-900 via-stone-900 to-amber-600" }
              ]}
            />

            <ProPreviewSection
              eyebrow="Legendary Board Themes"
              items={[
                { title: "Midnight Noir", tone: "from-black via-stone-900 to-amber-950" },
                { title: "Pirate Map", tone: "from-amber-200 via-yellow-700 to-stone-950" },
                { title: "Crimson Arena", tone: "from-red-950 via-red-800 to-black" }
              ]}
            />
          </div>
        </div>
      </section>
    </div>,
    document.body
  );
}

function ProFeature({ title, description }) {
  return (
    <div className="rounded-md border border-stone-950/25 bg-amber-100/25 p-3">
      <p className="text-sm font-black uppercase text-stone-950">{title}</p>
      <p className="mt-1 text-sm font-semibold text-stone-800">{description}</p>
    </div>
  );
}

function ProPreviewSection({ eyebrow, items }) {
  return (
    <div className="rounded-md border border-stone-950/30 bg-stone-950/10 p-4">
      <p className="text-xs font-black uppercase text-stone-700">{eyebrow}</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {items.map((item) => (
          <div key={item.title} className="pro-locked-card">
            <div className={`h-24 rounded-md border border-amber-200/25 bg-gradient-to-br ${item.tone} shadow-inner shadow-black/60`} />
            <div className="mt-3 flex items-center justify-between gap-3">
              <p className="font-black uppercase text-stone-950">{item.title}</p>
              <span className="rounded border border-red-950 bg-red-950 px-2 py-1 text-[10px] font-black uppercase text-red-100">
                PRO ONLY
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function PieceSkinSelector({ avatarSrc = "" }) {
  const [selectedSkin, setSelectedSkin] = usePieceSkin();
  const [showProModal, setShowProModal] = useState(false);

  return (
    <section className="rounded-md border border-stone-950/30 bg-stone-950/10 p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-black uppercase text-stone-800">Piece Skins</p>
          <h3 className="text-2xl font-black uppercase tracking-normal text-stone-950">Your Checkers Style</h3>
        </div>
        <p className="max-w-md text-sm font-bold text-stone-800">
          Applies to your own pieces only. Opponents stay readable for competitive play.
        </p>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {PIECE_SKINS.map((skin) => {
          const locked = skin.tier === "pro";
          const active = selectedSkin === skin.id;

          return (
            <button
              key={skin.id}
              type="button"
              onClick={() => (locked ? setShowProModal(true) : setSelectedSkin(skin.id))}
              className={[
                "piece-skin-card text-left",
                active ? "piece-skin-card-active" : "",
                locked ? "piece-skin-card-locked" : ""
              ].join(" ")}
            >
              <div className="flex items-center gap-3">
                <SkinPreview skin={skin.id} avatarSrc={avatarSrc} />
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-base font-black uppercase text-stone-950">{skin.name}</p>
                    {locked ? (
                      <span className="rounded border border-red-950 bg-red-950 px-2 py-0.5 text-[10px] font-black uppercase text-red-100">
                        PRO
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs font-bold text-stone-800">{skin.description}</p>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {showProModal ? <ProUpgradeModal onClose={() => setShowProModal(false)} /> : null}
    </section>
  );
}

function SkinPreview({ skin, avatarSrc }) {
  const isAvatar = skin === "avatar" && avatarSrc;

  return (
    <span className={`piece-skin-preview piece-skin-preview-${skin}`}>
      {isAvatar ? (
        <img
          src={avatarSrc}
          alt=""
          className="h-full w-full rounded-full object-cover"
          onError={(event) => {
            event.currentTarget.style.display = "none";
          }}
        />
      ) : null}
      {isAvatar ? null : <span />}
    </span>
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
  const displayName = compactPosterName(username);
  const isNationalChampion = Boolean(player?.isNationalChampion);
  const isRegionalChampion = Boolean(player?.isRegionalChampion);

  return (
    <article className={`wanted-poster bounty-poster ${compact ? "bounty-poster-compact" : ""} ${strongTier ? "wanted-poster-elite" : ""} ${isRegionalChampion ? "wanted-poster-regional" : ""} ${isNationalChampion ? "wanted-poster-national" : ""}`}>
      <div className="absolute right-4 top-4 z-20">
        <TierBadge tier={tier} className="rotate-2 opacity-90" />
      </div>
      {player?.prestigeLabel ? (
        <div className="absolute left-4 top-4 z-20 max-w-[58%] rotate-[-2deg] rounded-md border border-red-950 bg-amber-300/80 px-2 py-1 text-[10px] font-black uppercase text-stone-950 shadow-lg">
          {player.prestigeLabel}
        </div>
      ) : null}

      <div className="text-center">
        <h2 className={`${compact ? "text-5xl" : "text-6xl sm:text-7xl"} wanted-title font-black uppercase tracking-normal text-stone-950`}>
          WANTED
        </h2>
      </div>

      <div className={`poster-portrait poster-portrait-large ${compact ? "my-3" : "my-4"}`}>
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
        <h3
          className={`poster-name poster-name-fit mt-1 font-black uppercase tracking-normal text-stone-950 ${compact ? "poster-name-compact" : ""}`}
          title={username}
        >
          {displayName}
        </h3>
        <p className="mt-1 text-xs font-black uppercase text-stone-700">{player?.city || "Unclaimed Region"}</p>
      </div>

      <div className={`${compact ? "mt-3" : "mt-4"} text-center`}>
        <p className="text-xs font-black uppercase text-stone-700">Bounty</p>
        <div className="flex items-baseline justify-center gap-2">
          <span className={`${compact ? "text-2xl" : "text-3xl"} bounty-symbol font-black text-stone-950`}>฿</span>
          <BountyAmount value={player?.bounty ?? 0} className={compact ? "bounty-poster-amount text-3xl" : "bounty-poster-amount text-4xl"} />
        </div>
      </div>

      <div className={`${compact ? "mt-3" : "mt-4"} grid grid-cols-3 gap-2 text-center`}>
        <PosterStat label="Wins" value={player?.wins ?? 0} />
        <PosterStat label="Losses" value={player?.losses ?? 0} />
        <PosterStat label="Streak" value={player?.currentWinStreak ?? 0} />
      </div>
    </article>
  );
}

function compactPosterName(value) {
  const normalized = String(value ?? "Unknown").replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  if (normalized.length <= 34) return normalized;
  return `${normalized.slice(0, 31).trim()}...`;
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
