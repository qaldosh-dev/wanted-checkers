"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../auth-context";
import { GoogleSignInButton } from "../components/google-sign-in-button";
import {
  BrandNav,
  PageBackground,
  PosterPanel
} from "../components/wanted-ui";

const ONBOARDING_KEY = "wanted-checkers-onboarding";

export default function LoginPage() {
  const router = useRouter();
  const auth = useAuth();
  const [error, setError] = useState("");

  const handleGoogleSuccess = useCallback((payload) => {
    setError("");

    if (payload.onboardingRequired) {
      window.sessionStorage.setItem(
        ONBOARDING_KEY,
        JSON.stringify({
          onboardingToken: payload.onboardingToken,
          profile: payload.profile,
          suggestedUsername: payload.suggestedUsername
        })
      );
      router.push("/onboarding");
      return;
    }

    auth.applySession(payload);
    router.push("/play");
  }, [auth, router]);

  return (
    <PageBackground>
      <BrandNav auth={auth} active="login" compact />
      <div className="mx-auto grid min-h-[calc(100vh-88px)] max-w-6xl items-center gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[1fr_440px] lg:px-8">
        <section>
          <p className="text-xs font-black uppercase text-red-300">WANTED CHECKERS</p>
          <h1 className="mt-3 text-5xl font-black uppercase tracking-normal text-amber-100 sm:text-7xl">
            Join the Most Wanted Checkers Platform
          </h1>
          <p className="mt-5 max-w-xl text-lg text-stone-300">
            Continue with Google, claim your poster, and start raising your bounty.
          </p>
        </section>

        <PosterPanel className="p-5">
          <p className="mb-2 text-sm font-black uppercase text-stone-800">One secure entrance</p>
          <h2 className="text-3xl font-black uppercase tracking-normal text-stone-950">Enter the Arena</h2>
          <p className="mt-2 text-sm font-bold text-stone-800">
            Your verified Google account protects your bounty, profile, and match history.
          </p>

          {error ? <p className="mt-4 rounded-md bg-red-950/80 px-3 py-2 text-sm text-red-100">{error}</p> : null}

          <GoogleSignInButton
            className="mt-5"
            onSuccess={handleGoogleSuccess}
            onError={setError}
          />
        </PosterPanel>
      </div>
    </PageBackground>
  );
}
