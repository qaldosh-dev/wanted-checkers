"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const TOKEN_KEY = "wanted-checkers-token";
const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState("");
  const [user, setUser] = useState(null);
  const [stats, setStats] = useState(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);

  useEffect(() => {
    const storedToken = window.localStorage.getItem(TOKEN_KEY) ?? "";
    if (!storedToken) {
      setIsAuthLoading(false);
      return;
    }

    setToken(storedToken);
    loadMe(storedToken).finally(() => setIsAuthLoading(false));
  }, []);

  async function loadMe(activeToken = token) {
    if (!activeToken) return null;

    const response = await fetch(`${API_URL}/api/auth/me`, {
      headers: authHeaders(activeToken),
      cache: "no-store"
    });

    if (!response.ok) {
      logout();
      return null;
    }

    const payload = await response.json();
    setUser(payload.user);
    setStats(payload.stats);
    return payload;
  }

  function applySession(payload) {
    window.localStorage.setItem(TOKEN_KEY, payload.token);
    setToken(payload.token);
    setUser(payload.user);
    setStats(payload.stats);
  }

  function logout() {
    window.localStorage.removeItem(TOKEN_KEY);
    setToken("");
    setUser(null);
    setStats(null);
  }

  const value = useMemo(
    () => ({
      token,
      user,
      stats,
      isAuthenticated: Boolean(token && user),
      isAuthLoading,
      applySession,
      loadMe,
      logout,
      authHeaders: () => authHeaders(token)
    }),
    [token, user, stats, isAuthLoading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider.");
  return context;
}

export function authHeaders(token) {
  return token ? { Authorization: `Bearer ${token}` } : {};
}
