"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../auth-context";
import {
  BrandNav,
  PageBackground,
  PosterPanel
} from "../components/wanted-ui";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export default function LoginPage() {
  const router = useRouter();
  const auth = useAuth();
  const [form, setForm] = useState({ identifier: "", password: "" });
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleEnabled, setIsGoogleEnabled] = useState(false);
  const [isGoogleStatusLoading, setIsGoogleStatusLoading] = useState(true);

  useEffect(() => {
    async function loadGoogleStatus() {
      try {
        const response = await fetch(`${API_URL}/api/auth/google/status`, { cache: "no-store" });
        const payload = await response.json();
        setIsGoogleEnabled(Boolean(payload.enabled));
      } catch {
        setIsGoogleEnabled(false);
      } finally {
        setIsGoogleStatusLoading(false);
      }
    }

    loadGoogleStatus();
  }, []);

  async function startGoogleLogin() {
    if (!isGoogleEnabled) return;

    setIsLoading(true);
    setError("");

    try {
      const response = await fetch(`${API_URL}/api/auth/google/url`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Google login is unavailable.");

      window.localStorage.setItem("wanted-checkers-google-state", payload.state);
      window.location.href = payload.authUrl;
    } catch (caughtError) {
      setError(caughtError.message);
      setIsLoading(false);
    }
  }

  async function submit(event) {
    event.preventDefault();
    setIsLoading(true);
    setError("");

    try {
      const response = await fetch(`${API_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form)
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Login failed.");
      auth.applySession(payload);
      router.push("/play");
    } catch (caughtError) {
      setError(caughtError.message);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <AuthScreen title="Enter the Wanted Hall" eyebrow="WANTED CHECKERS">
      <form onSubmit={submit} className="space-y-4">
        <Field
          label="Email or Username"
          value={form.identifier}
          onChange={(value) => setForm({ ...form, identifier: value })}
        />
        <Field
          label="Password"
          type="password"
          value={form.password}
          onChange={(value) => setForm({ ...form, password: value })}
        />

        {error ? <p className="rounded-md bg-red-950/80 px-3 py-2 text-sm text-red-100">{error}</p> : null}

        <button
          type="submit"
          disabled={isLoading}
          className="poster-button w-full disabled:cursor-wait disabled:opacity-60"
        >
          Login
        </button>

        <button
          type="button"
          disabled={!isGoogleEnabled || isGoogleStatusLoading || isLoading}
          onClick={startGoogleLogin}
          className="dark-button w-full disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isGoogleEnabled ? "Continue with Google" : "Google login coming soon"}
        </button>

        <p className="text-center text-sm text-stone-400">
          No bounty record yet?{" "}
          <a href="/register" className="font-bold text-amber-300 hover:text-amber-200">
            Register
          </a>
        </p>
      </form>
    </AuthScreen>
  );
}

function AuthScreen({ eyebrow, title, children }) {
  return (
    <PageBackground>
      <BrandNav active="login" compact />
      <div className="mx-auto grid min-h-[calc(100vh-88px)] max-w-6xl items-center gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[1fr_440px] lg:px-8">
        <section>
          <p className="text-xs font-black uppercase text-red-300">{eyebrow}</p>
          <h1 className="mt-3 text-5xl font-black uppercase tracking-normal text-amber-100 sm:text-7xl">{title}</h1>
          <p className="mt-5 max-w-xl text-lg text-stone-300">
            Claim your name, stack impossible bounties, and climb the board.
          </p>
        </section>
        <PosterPanel className="p-5">
          <p className="mb-4 text-sm font-black uppercase text-stone-800">Signed contract</p>
          {children}
        </PosterPanel>
      </div>
    </PageBackground>
  );
}

function Field({ label, value, onChange, type = "text" }) {
  return (
    <label className="block">
      <span className="text-sm font-black uppercase text-stone-800">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 h-11 w-full rounded-md border border-stone-950/50 bg-stone-950/15 px-3 font-bold text-stone-950 outline-none transition placeholder:text-stone-700 focus:border-red-900"
      />
    </label>
  );
}
