"use client";

import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type AuthMode = "login" | "signup";

export default function AuthPanel() {
  const [supabase] = useState(() => createSupabaseBrowserClient());
  const [user, setUser] = useState<User | null>(null);
  const [credits, setCredits] = useState<number | null>(null);
  const [plan, setPlan] = useState("free");
  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [authMessage, setAuthMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (active) {
        setUser(data.session?.user ?? null);
        setLoading(false);
      }
    });

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [supabase]);

  useEffect(() => {
    if (!user) {
      setCredits(null);
      setPlan("free");
      return;
    }

    let active = true;

    async function loadCredits() {
      const response = await fetch("/api/credits");
      const data = (await response.json()) as { credits?: number | null; plan?: string };
      if (active && typeof data.credits === "number") {
        setCredits(data.credits);
        setPlan(data.plan ?? "free");
      }
    }

    void loadCredits();

    function refreshCredits() {
      void loadCredits();
    }

    window.addEventListener("listingai:credits-updated", refreshCredits);
    return () => {
      active = false;
      window.removeEventListener("listingai:credits-updated", refreshCredits);
    };
  }, [user]);

  function switchMode(nextMode: AuthMode) {
    setMode(nextMode);
    setAuthError(null);
    setAuthMessage(null);
  }

  function closePanel() {
    setOpen(false);
    setAuthError(null);
    setAuthMessage(null);
    setPassword("");
  }

  async function submitAuth() {
    setSubmitting(true);
    setAuthError(null);
    setAuthMessage(null);

    const result = mode === "login"
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password });

    if (result.error) {
      setAuthError(result.error.message);
    } else if (mode === "signup" && !result.data.session) {
      setAuthMessage("Check your email to confirm your account, then sign in.");
    } else {
      closePanel();
    }

    setSubmitting(false);
  }

  async function logout() {
    setAuthError(null);
    const { error } = await supabase.auth.signOut();
    if (error) {
      setAuthError(error.message);
    }
  }

  if (loading) {
    return <div className="h-9 w-24 animate-pulse rounded-full bg-white/5" />;
  }

  if (user) {
    return (
      <div className="flex items-center gap-3">
        <span className="hidden max-w-48 truncate text-sm text-slate-300 sm:block">
          {user.email}
        </span>
        <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-2 text-sm text-emerald-300">
          {credits === null ? "Credits..." : `${credits} credits`}
        </span>
        <span className="hidden rounded-full border border-blue-400/20 bg-blue-400/10 px-3 py-2 text-sm capitalize text-blue-300 sm:block">
          {plan}
        </span>
        <button
          type="button"
          onClick={logout}
          className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-300 transition hover:border-blue-400/50 hover:text-white"
        >
          Log out
        </button>
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          setAuthError(null);
          setAuthMessage(null);
        }}
        className="rounded-full border border-blue-400/40 bg-blue-500/10 px-4 py-2 text-sm font-medium text-blue-300 transition hover:bg-blue-500/20"
      >
        Sign in
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-6 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-slate-900 p-6 shadow-2xl">
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-blue-300">ListingAI account</p>
                <h2 className="mt-1 text-2xl font-semibold text-white">
                  {mode === "login" ? "Welcome back" : "Create your account"}
                </h2>
                <p className="mt-2 text-sm text-slate-400">
                  {mode === "login"
                    ? "Sign in to keep your ListingAI session across devices."
                    : "Create an account to get started with ListingAI."}
                </p>
              </div>
              <button
                type="button"
                onClick={closePanel}
                aria-label="Close authentication dialog"
                className="text-2xl leading-none text-slate-500 transition hover:text-white"
              >
                ×
              </button>
            </div>

            <div className="mb-5 grid grid-cols-2 rounded-xl border border-white/10 bg-slate-950 p-1">
              <button
                type="button"
                onClick={() => switchMode("login")}
                className={`rounded-lg px-3 py-2 text-sm font-medium transition ${mode === "login" ? "bg-white/10 text-white" : "text-slate-500 hover:text-slate-300"}`}
              >
                Log in
              </button>
              <button
                type="button"
                onClick={() => switchMode("signup")}
                className={`rounded-lg px-3 py-2 text-sm font-medium transition ${mode === "signup" ? "bg-white/10 text-white" : "text-slate-500 hover:text-slate-300"}`}
              >
                Sign up
              </button>
            </div>

            <form
              onSubmit={(event) => {
                event.preventDefault();
                void submitAuth();
              }}
              className="space-y-4"
            >
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-300">Email</span>
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  autoComplete="email"
                  required
                  className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-white outline-none placeholder:text-slate-600 focus:border-blue-400"
                  placeholder="you@example.com"
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-300">Password</span>
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  minLength={6}
                  required
                  className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-white outline-none placeholder:text-slate-600 focus:border-blue-400"
                  placeholder="At least 6 characters"
                />
              </label>

              {authError ? (
                <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                  {authError}
                </div>
              ) : null}

              {authMessage ? (
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
                  {authMessage}
                </div>
              ) : null}

              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-xl bg-blue-500 px-5 py-3 font-semibold text-white transition hover:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting
                  ? "Please wait..."
                  : mode === "login"
                    ? "Log in"
                    : "Create account"}
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
