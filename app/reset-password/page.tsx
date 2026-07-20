"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [canReset, setCanReset] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    // A recovery link can arrive in three shapes, and the old code handled only
    // the one it was least likely to get:
    //
    //   ?token_hash=…&type=recovery  verifyOtp — works in ANY browser
    //   ?code=…                      PKCE — needs the verifier this browser stored
    //   #access_token=…              implicit — the client picks it up itself
    //
    // createBrowserClient defaults to PKCE, so opening the mail in a different
    // browser (Gmail's in-app viewer, say) leaves no verifier and nothing ever
    // exchanges the code — which surfaced as "invalid or expired".
    async function establish(): Promise<string | null> {
      const url = new URL(window.location.href);
      const hash = new URLSearchParams(url.hash.replace(/^#/, ""));

      // Supabase reports its own failures on the URL. Surface them verbatim
      // rather than replacing them with a guess.
      const err = url.searchParams.get("error_description") ?? hash.get("error_description");
      if (err) return err;

      const tokenHash = url.searchParams.get("token_hash");
      if (tokenHash) {
        const type = (url.searchParams.get("type") as "recovery" | null) ?? "recovery";
        const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
        return error?.message ?? null;
      }

      const code = url.searchParams.get("code");
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (!error) return null;
        return /verifier|code challenge/i.test(error.message)
          ? "This link has to be opened in the same browser you requested it from. Request a new one and open it here."
          : error.message;
      }

      return null; // implicit flow, or a session already exists
    }

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || session) setCanReset(true);
    });

    void establish().then(async (failure) => {
      if (cancelled) return;
      const { data } = await supabase.auth.getSession();
      if (data.session) setCanReset(true);
      else if (failure) setLinkError(failure);
      setReady(true);
    });

    return () => { cancelled = true; sub.subscription.unsubscribe(); };
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
            <span className="text-pitch-400">PocketAthlete</span>
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
          <div className="card space-y-3 p-6 text-sm text-slate-300">
            <p className="font-semibold text-slate-100">That link didn&apos;t work</p>
            {/* The real reason, not a generic line — it's what makes this fixable. */}
            <p className="text-slate-400">{linkError ?? "The link is missing its token, or it has already been used."}</p>
            <ul className="space-y-1.5 text-xs text-slate-400">
              <li>· Reset links work once — if you opened it twice, request another.</li>
              <li>· Open it in a normal browser rather than a preview inside your mail app.</li>
              <li>· Links expire, so always use the most recent email.</li>
            </ul>
            <Link href="/login" className="btn-ghost">Request a new link</Link>
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
