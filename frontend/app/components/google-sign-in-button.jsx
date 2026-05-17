"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export function GoogleSignInButton({ onSuccess, onError, className = "" }) {
  const [googleClientId, setGoogleClientId] = useState("");
  const [googleReady, setGoogleReady] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState("Google login is not configured");
  const [isStatusLoading, setIsStatusLoading] = useState(true);
  const buttonRef = useRef(null);

  useEffect(() => {
    async function loadGoogleStatus() {
      try {
        const response = await fetch(`${API_URL}/api/auth/google/status`, { cache: "no-store" });
        const payload = await response.json();
        if (payload.enabled && payload.clientId) {
          setGoogleClientId(payload.clientId);
          setStatusMessage("");
        } else {
          setGoogleClientId("");
          setStatusMessage(payload.message ?? "Google login is not configured");
        }
      } catch {
        setGoogleClientId("");
        setStatusMessage("Google login is not configured");
      } finally {
        setIsStatusLoading(false);
      }
    }

    loadGoogleStatus();
  }, []);

  const completeGoogleLogin = useCallback(async (response) => {
    setIsLoading(true);

    try {
      if (!response?.credential) throw new Error("Google did not return a login credential.");
      const authResponse = await fetch(`${API_URL}/api/auth/google`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credential: response.credential })
      });
      const payload = await authResponse.json();
      if (!authResponse.ok) throw new Error(payload.error ?? "Google login failed.");
      onSuccess(payload);
    } catch (caughtError) {
      onError(caughtError.message);
    } finally {
      setIsLoading(false);
    }
  }, [onError, onSuccess]);

  useEffect(() => {
    if (!googleClientId) return undefined;

    function renderGoogleButton() {
      if (!window.google?.accounts?.id || !buttonRef.current) return;

      window.google.accounts.id.initialize({
        client_id: googleClientId,
        callback: completeGoogleLogin
      });
      buttonRef.current.innerHTML = "";
      window.google.accounts.id.renderButton(buttonRef.current, {
        theme: "filled_black",
        size: "large",
        type: "standard",
        shape: "rectangular",
        text: "continue_with",
        logo_alignment: "left",
        width: Math.min(420, buttonRef.current.offsetWidth || 420)
      });
      setGoogleReady(true);
    }

    if (window.google?.accounts?.id) {
      renderGoogleButton();
      return undefined;
    }

    const existingScript = document.getElementById("google-identity-services");
    if (existingScript) {
      existingScript.addEventListener("load", renderGoogleButton, { once: true });
      return () => existingScript.removeEventListener("load", renderGoogleButton);
    }

    const script = document.createElement("script");
    script.id = "google-identity-services";
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = renderGoogleButton;
    script.onerror = () => onError("Google login failed to load. Please try again later.");
    document.head.appendChild(script);
    return undefined;
  }, [completeGoogleLogin, googleClientId, onError]);

  if (!googleClientId) {
    return (
      <button
        type="button"
        disabled
        className={`dark-button w-full disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      >
        {isStatusLoading ? "Checking Google login..." : statusMessage}
      </button>
    );
  }

  return (
    <div className={`relative min-h-11 overflow-hidden rounded-md border border-amber-700/40 bg-stone-950 ${className}`}>
      {!googleReady || isLoading ? (
        <button
          type="button"
          disabled
          className="dark-button absolute inset-0 z-10 w-full disabled:cursor-wait disabled:opacity-90"
        >
          {isLoading ? "Signing in with Google..." : "Loading Google..."}
        </button>
      ) : null}
      <div ref={buttonRef} className="flex min-h-11 w-full items-center justify-center" />
    </div>
  );
}
