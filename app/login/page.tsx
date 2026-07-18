"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useSession } from "@/lib/auth";
import { captureRef, getRef, clearRef } from "@/lib/referral";

export default function LoginPage() {
  const router = useRouter();
  const { user } = useSession();

  const [mode, setMode] = useState<"sign_in" | "sign_up" | "forgot">("sign_in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => { captureRef(); }, []); // in case they land straight on /login?ref=

  useEffect(() => {
    if (user) router.replace("/home");
  }, [user, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);
    const supabase = createClient();

    if (mode === "forgot") {
      const base = process.env.NEXT_PUBLIC_BASE_PATH || "";
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}${base}/reset-password/`,
      });
      if (error) setError(error.message);
      else setInfo("If that email has an account, a reset link is on its way.");
    } else if (mode === "sign_in") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setError(error.message);
      else router.push("/home");
    } else {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName } },
      });
      if (error) setError(error.message);
      else {
        // Attribute the signup to the affiliate whose link they arrived on.
        const ref = getRef();
        if (ref && data.user) {
          await supabase.from("profiles").update({ referral_code: ref }).eq("id", data.user.id);
          clearRef();
        }
        if (data.session) router.push("/home");
        else setInfo("Check your email to confirm your account, then sign in.");
      }
    }
    setLoading(false);
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-5">
      <div className="w-full max-w-sm animate-scale-in">
        <div className="mb-8 text-center">
          <div className="text-4xl font-extrabold tracking-tight">
            <span className="bg-gradient-to-br from-pitch-400 to-pitch-600 bg-clip-text text-transparent">Apex</span>
          </div>
          <p className="mt-2 text-sm text-slate-400">
            {mode === "sign_in" ? "Welcome back, athlete." : mode === "sign_up" ? "Create your athlete account." : "Reset your password."}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="card space-y-4 p-6">
          {mode === "sign_up" && (
            <label className="block">
              <span className="field-label">Full name</span>
              <input className="field" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Alex Striker" />
            </label>
          )}
          <label className="block">
            <span className="field-label">Email</span>
            <input type="email" required className="field" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
          </label>
          {mode !== "forgot" && (
            <label className="block">
              <span className="field-label">Password</span>
              <input type="password" required minLength={6} className="field" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
            </label>
          )}

          {mode === "sign_in" && (
            <button type="button" onClick={() => { setMode("forgot"); setError(null); setInfo(null); }} className="block text-left text-xs text-slate-400 hover:text-pitch-400">
              Forgot password?
            </button>
          )}

          {error && <p className="text-sm text-readiness-red">{error}</p>}
          {info && <p className="text-sm text-pitch-400">{info}</p>}

          <button type="submit" disabled={loading} className="btn-primary">
            {loading ? "…" : mode === "sign_in" ? "Sign in" : mode === "sign_up" ? "Create account" : "Send reset link"}
          </button>
        </form>

        <button
          onClick={() => {
            setMode(mode === "sign_in" ? "sign_up" : "sign_in");
            setError(null);
            setInfo(null);
          }}
          className="mt-5 w-full text-sm text-slate-400 transition hover:text-pitch-400"
        >
          {mode === "sign_in" ? "Need an account? Sign up" : "Have an account? Sign in"}
        </button>
      </div>
    </main>
  );
}
