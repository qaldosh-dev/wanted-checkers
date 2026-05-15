"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../../auth-context";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export default function GoogleCallbackPage() {
  const router = useRouter();
  const auth = useAuth();
  const [message, setMessage] = useState("Completing Google login...");

  useEffect(() => {
    async function completeLogin() {
      const params = new URLSearchParams(window.location.search);
      const code = params.get("code");
      const state = params.get("state");
      const error = params.get("error");
      const expectedState = window.localStorage.getItem("wanted-checkers-google-state");

      if (error) {
        setMessage(`Google login failed: ${error}`);
        return;
      }

      if (!code || !state || state !== expectedState) {
        setMessage("Google login could not be verified. Please try again.");
        return;
      }

      try {
        const response = await fetch(`${API_URL}/api/auth/google/callback`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code })
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error ?? "Google login failed.");

        window.localStorage.removeItem("wanted-checkers-google-state");
        auth.applySession(payload);
        router.push("/play");
      } catch (caughtError) {
        setMessage(caughtError.message);
      }
    }

    completeLogin();
  }, [auth, router]);

  return (
    <main className="min-h-screen bg-[#15110c] px-4 py-8 text-stone-100">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-3xl flex-col justify-center">
        <p className="text-xs font-semibold uppercase text-amber-400">WANTED CHECKERS</p>
        <h1 className="mt-3 text-5xl font-black tracking-normal">Google Login</h1>
        <p className="mt-5 rounded-lg border border-stone-700 bg-stone-950/70 p-5 text-stone-300">
          {message}
        </p>
        <a href="/login" className="mt-5 w-fit rounded-md border border-amber-400/70 px-4 py-2 font-bold text-amber-200">
          Back to Login
        </a>
      </div>
    </main>
  );
}
