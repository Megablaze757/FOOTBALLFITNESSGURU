"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [canReset, setCanReset] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    // The recovery link puts a temporary session in the URL; the browser client
    // exchanges it on load. Confirm we have that session before showing the form.
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || session) setCanReset(true);
    });
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setCanReset(true);
      setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) return setError("Passwords don't match.");
    if (password.length < 6) return setError("Use at least 6 characters.");
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });
    if (error) { setError(error.message); setSaving(false); return; }
    setDone(true);
    setTimeout(() => router.replace("/home"), 1200);
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-5">
      <div className="w-full max-w-sm animate-scale-in">
        <div className="mb-8 text-center">
          <div className="text-4xl font-extrabold tracking-tight">
            <span className="bg-gradient-to-br from-pitch-400 to-pitch-600 bg-clip-text text-transparent">PocketAthlete</span>
          </div>
          <p className="mt-2 text-sm text-slate-400">Set a new password.</p>
        </div>

        {!ready ? (
          <div className="flex justify-center py-8">
            <div className="h-7 w-7 animate-spin rounded-full border-2 border-white/20 border-t-pitch-400" />
          </div>
        ) : done ? (
          <div className="card p-6 text-center text-sm text-pitch-400">Password updated — signing you in…</div>
        ) : !canReset ? (
          <div className="card space-y-3 p-6 text-center text-sm text-slate-400">
            <p>This reset link is invalid or has expired.</p>
            <Link href="/login" className="btn-ghost">Back to sign in</Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="card space-y-4 p-6">
            <label className="block">
              <span className="field-label">New password</span>
              <input type="password" required minLength={6} className="field" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
            </label>
            <label className="block">
              <span className="field-label">Confirm password</span>
              <input type="password" required minLength={6} className="field" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="••••••••" />
            </label>
            {error && <p className="text-sm text-readiness-red">{error}</p>}
            <button type="submit" disabled={saving} className="btn-primary">{saving ? "Saving…" : "Update password"}</button>
          </form>
        )}
      </div>
    </main>
  );
}
