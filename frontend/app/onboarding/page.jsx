"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../auth-context";
import {
  BrandNav,
  CinematicButton,
  PageBackground,
  PosterPanel,
  buildAvatarUrl,
  toAvatarSrc
} from "../components/wanted-ui";
import { KAZAKHSTAN_REGIONS } from "../constants/regions";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const ONBOARDING_KEY = "wanted-checkers-onboarding";

export default function OnboardingPage() {
  const router = useRouter();
  const auth = useAuth();
  const [session, setSession] = useState(null);
  const [form, setForm] = useState({ username: "", city: "", avatarUrl: "" });
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState("");
  const [usernameStatus, setUsernameStatus] = useState({ state: "idle", message: "" });
  const [fields, setFields] = useState({});
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const stored = window.sessionStorage.getItem(ONBOARDING_KEY);
    if (!stored) {
      router.replace("/login");
      return;
    }

    try {
      const payload = JSON.parse(stored);
      setSession(payload);
      setForm((current) => ({
        ...current,
        username: payload.suggestedUsername ?? "",
        avatarUrl: payload.profile?.avatarUrl ?? ""
      }));
    } catch {
      window.sessionStorage.removeItem(ONBOARDING_KEY);
      router.replace("/login");
    }
  }, [router]);

  useEffect(() => {
    if (auth.isAuthenticated) router.replace("/play");
  }, [auth.isAuthenticated, router]);

  useEffect(() => {
    if (!avatarFile) {
      setAvatarPreview("");
      return undefined;
    }

    const objectUrl = URL.createObjectURL(avatarFile);
    setAvatarPreview(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [avatarFile]);

  useEffect(() => {
    const username = form.username.trim().toLowerCase();
    if (!username) {
      setUsernameStatus({ state: "idle", message: "" });
      return undefined;
    }

    const timer = window.setTimeout(async () => {
      setUsernameStatus({ state: "checking", message: "Checking username..." });
      try {
        const response = await fetch(`${API_URL}/api/auth/username/${encodeURIComponent(username)}`, { cache: "no-store" });
        const payload = await response.json();
        if (!response.ok) {
          setUsernameStatus({ state: "invalid", message: payload.error ?? "Username is not available." });
          return;
        }
        setUsernameStatus({
          state: payload.available ? "available" : "taken",
          message: payload.available ? "Username is available." : "Username is already taken."
        });
      } catch {
        setUsernameStatus({ state: "invalid", message: "Could not check username." });
      }
    }, 350);

    return () => window.clearTimeout(timer);
  }, [form.username]);

  const avatar = useMemo(() => {
    return avatarPreview || toAvatarSrc(form.avatarUrl) || toAvatarSrc(session?.profile?.avatarUrl) || buildAvatarUrl(form.username || "wanted");
  }, [avatarPreview, form.avatarUrl, form.username, session?.profile?.avatarUrl]);

  function update(field, value) {
    setForm({ ...form, [field]: value });
    setFields({ ...fields, [field]: "" });
  }

  function chooseAvatar(file) {
    setError("");
    setFields({ ...fields, avatar: "" });

    if (!file) {
      setAvatarFile(null);
      return;
    }

    const validationError = validateAvatarFile(file);
    if (validationError) {
      setAvatarFile(null);
      setFields({ ...fields, avatar: validationError });
      return;
    }

    setAvatarFile(file);
  }

  async function submit(event) {
    event.preventDefault();
    if (!session?.onboardingToken) return;

    setIsLoading(true);
    setError("");
    setFields({});

    try {
      const body = new FormData();
      body.append("onboardingToken", session.onboardingToken);
      body.append("username", form.username);
      body.append("city", form.city);
      body.append("avatarUrl", form.avatarUrl);
      if (avatarFile) body.append("avatar", avatarFile);

      const response = await fetch(`${API_URL}/api/auth/onboarding`, {
        method: "POST",
        body
      });
      const payload = await response.json();
      if (!response.ok) {
        if (payload.fields) setFields(payload.fields);
        throw new Error(payload.error ?? "Could not finish onboarding.");
      }

      window.sessionStorage.removeItem(ONBOARDING_KEY);
      auth.applySession(payload);
      router.push("/play");
    } catch (caughtError) {
      setError(caughtError.message);
    } finally {
      setIsLoading(false);
    }
  }

  if (!session) {
    return (
      <PageBackground>
        <div className="p-8 text-stone-100">Loading onboarding...</div>
      </PageBackground>
    );
  }

  return (
    <PageBackground>
      <BrandNav auth={auth} active="login" compact />
      <div className="mx-auto grid min-h-[calc(100vh-88px)] max-w-6xl items-center gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[390px_1fr] lg:px-8">
        <article className="wanted-poster">
          <p className="text-sm font-black uppercase text-stone-800">Profile Setup</p>
          <img
            src={avatar}
            alt=""
            className="my-4 aspect-square w-full rounded-md border-4 border-stone-950 object-cover"
          />
          <h1 className="text-4xl font-black uppercase tracking-normal text-stone-950">{form.username || "wanted_name"}</h1>
          <p className="mt-1 font-bold text-stone-800">{session.profile?.email}</p>
        </article>

        <PosterPanel className="p-5">
          <p className="text-xs font-black uppercase text-red-900">Verified by Google</p>
          <h2 className="mt-2 text-4xl font-black uppercase tracking-normal text-stone-950">
            Claim Your Wanted Name
          </h2>
          <p className="mt-2 font-bold text-stone-800">
            We already have your verified email and name. Choose the public identity that appears on the WANTED Board.
          </p>

          <form onSubmit={submit} className="mt-5 grid gap-4 sm:grid-cols-2">
            <Field
              label="Username"
              value={form.username}
              error={fields.username}
              onChange={(value) => update("username", value)}
            />
            <Field
              label="Select Your Region"
              value={form.city}
              error={fields.city}
              onChange={(value) => update("city", value)}
              options={KAZAKHSTAN_REGIONS}
            />
            <Field
              label="Avatar URL"
              value={form.avatarUrl}
              error={fields.avatarUrl}
              onChange={(value) => update("avatarUrl", value)}
              placeholder="Optional"
              className="sm:col-span-2"
            />
            <AvatarField error={fields.avatar} onChange={chooseAvatar} />

            {usernameStatus.message ? (
              <p className={`text-sm font-bold sm:col-span-2 ${
                usernameStatus.state === "available" ? "text-green-800" : "text-red-900"
              }`}>
                {usernameStatus.message}
              </p>
            ) : null}
            {error ? <p className="rounded-md bg-red-950/80 px-3 py-2 text-sm text-red-100 sm:col-span-2">{error}</p> : null}

            <div className="flex flex-wrap gap-3 sm:col-span-2">
              <CinematicButton type="submit" disabled={isLoading}>
                Finish Setup
              </CinematicButton>
              <CinematicButton href="/login" variant="dark">
                Back
              </CinematicButton>
            </div>
          </form>
        </PosterPanel>
      </div>
    </PageBackground>
  );
}

function Field({ label, value, onChange, error, placeholder = "", className = "", options = null }) {
  return (
    <label className={`block ${className}`}>
      <span className="text-sm font-black uppercase text-stone-800">{label}</span>
      {options ? (
        <select
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="mt-2 h-11 w-full rounded-md border border-stone-950/50 bg-stone-950/15 px-3 font-bold text-stone-950 outline-none transition focus:border-red-900"
          required
        >
          <option value="">Choose Kazakhstan region</option>
          {options.map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
      ) : (
        <input
          value={value}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
          className="mt-2 h-11 w-full rounded-md border border-stone-950/50 bg-stone-950/15 px-3 font-bold text-stone-950 outline-none transition placeholder:text-stone-700 focus:border-red-900"
        />
      )}
      {error ? <span className="mt-1 block text-xs font-bold text-red-900">{error}</span> : null}
    </label>
  );
}

function AvatarField({ error, onChange }) {
  return (
    <label className="block sm:col-span-2">
      <span className="text-sm font-black uppercase text-stone-800">Custom Avatar Upload</span>
      <input
        type="file"
        accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
        onChange={(event) => onChange(event.target.files?.[0] ?? null)}
        className="mt-2 block w-full rounded-md border border-stone-950/50 bg-stone-950/15 px-3 py-2 text-sm font-bold text-stone-950 outline-none transition file:mr-3 file:rounded-md file:border-0 file:bg-stone-950 file:px-3 file:py-2 file:font-bold file:text-amber-200 focus:border-red-900"
      />
      <span className="mt-1 block text-xs font-semibold text-stone-700">JPG, PNG, or WebP. Max 2MB.</span>
      {error ? <span className="mt-1 block text-xs font-bold text-red-900">{error}</span> : null}
    </label>
  );
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
