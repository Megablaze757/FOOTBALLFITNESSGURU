"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { EmailOtpType } from "@supabase/supabase-js";
import { useSession } from "@/lib/auth";
import { captureRef, getRef, clearRef } from "@/lib/referral";
import { Logo } from "@/components/Logo";
import { track } from "@/lib/funnel";
import { PAID_TIER } from "@/lib/subscription";

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
  const [awaitingConfirm, setAwaitingConfirm] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  // Set when they arrived from a plan card on the public pricing page. Carried
  // through signup so they land back on checkout instead of the home screen
  // having forgotten why they came.
  const [wantedPlan, setWantedPlan] = useState<string | null>(null);
  // Typed by hand OR prefilled from ?ref=. A visible field matters because a
  // code heard out loud — "use SACHA20" — has no link to stash.
  const [refCode, setRefCode] = useState("");
  const [refState, setRefState] = useState<"idle" | "checking" | "ok" | "bad">("idle");

  useEffect(() => { captureRef(); }, []); // in case they land straight on /login?ref=

  // Prefill from the link they arrived on, so the common path needs no typing.
  useEffect(() => { const r = getRef(); if (r) setRefCode(r); }, []);

  // Check the code as they type. A silently-wrong code is the whole problem
  // here — the affiliate never finds out their referrals didn't count.
  useEffect(() => {
    const code = refCode.trim();
    if (!code) { setRefState("idle"); return; }
    setRefState("checking");
    const t = setTimeout(async () => {
      const { data } = await createClient().rpc("referral_code_valid", { p_code: code });
      setRefState(data === true ? "ok" : "bad");
    }, 400);
    return () => clearTimeout(t);
  }, [refCode]);

  useEffect(() => {
    const plan = new URLSearchParams(window.location.search).get("plan");
    // Only the plan on sale. An old ?plan=gold link shouldn't send someone
    // into a signup expecting a tier they can no longer buy.
    if (plan === PAID_TIER) {
      setWantedPlan(plan);
      setMode("sign_up"); // they came to buy, not to sign in
    }
  }, []);

  // Tick the resend cooldown down to zero.
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  /**
   * Confirmation and magic links that carry a token hash.
   *
   * The email templates in supabase/email-templates point here as
   *   /login/?token_hash=<hash>&type=email
   * and nothing on this page consumed it, so the link landed on a plain sign-in
   * form and the address was never confirmed. The reset-password page has had
   * this for a while; this is the same handling for the other direction.
   *
   * Why token_hash rather than Supabase's own {{ .ConfirmationURL }}: that URL
   * points at /auth/v1/verify, which SPENDS the token and then redirects with
   * ?code=, and the code exchange needs the PKCE verifier stored by the browser
   * that made the request. Open the mail in Gmail's in-app viewer, on another
   * device, or let a corporate link-scanner prefetch it, and the exchange fails
   * against a token that is already gone — the link can never work again.
   * verifyOtp takes the hash directly and works in any browser.
   */
  const [verifying, setVerifying] = useState(false);
  useEffect(() => {
    const url = new URL(window.location.href);
    const tokenHash = url.searchParams.get("token_hash");
    if (!tokenHash) return;

    // Supabase reports its own failures on the URL — an expired link arrives
    // here as an error, not as a token. Say what it said.
    const urlErr = url.searchParams.get("error_description");
    if (urlErr) { setError(urlErr); return; }

    const type = (url.searchParams.get("type") ?? "email") as EmailOtpType;
    setVerifying(true);
    void (async () => {
      const { error: vErr } = await createClient().auth.verifyOtp({ token_hash: tokenHash, type });
      // Clean the token out of the address bar either way, so a refresh or a
      // shared URL doesn't retry a hash that's now spent.
      window.history.replaceState({}, "", url.pathname);
      if (vErr) {
        setError(
          /expired|invalid/i.test(vErr.message)
            ? "That link has expired or has already been used. Sign in below, or request a new one."
            : vErr.message
        );
        setVerifying(false);
        return;
      }
      // verifyOtp signs them in; the redirect effect below takes it from here.
      setInfo("Email confirmed — signing you in…");
      setVerifying(false);
    })();
  }, []);

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
      if (error) {
        setError(error.message);
        // The likeliest reason a correct password is refused: they never got
        // the confirmation mail. Offer the resend rather than leaving them
        // stuck on an error they can't act on.
        if (/confirm/i.test(error.message)) setAwaitingConfirm(true);
      } else router.push("/home");
    } else {
      // The referral code travels in the signup METADATA, not as a follow-up
      // update. The old code wrote to profiles straight after signUp — but on
      // an email-confirmation signup there is no session yet, so RLS rejected
      // it, no error surfaced, and the attribution vanished. Every affiliate
      // referral that needed email confirmation was lost this way.
      // handle_new_user() now reads it server-side as the row is created.
      const ref = refCode.trim() || getRef() || "";
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName, ...(ref ? { referral_code: ref } : {}) } },
      });
      if (error) setError(error.message);
      else if (data.user && (data.user.identities?.length ?? 0) === 0) {
        // Supabase returns a session-less success for an email that already has
        // an account, so attackers can't probe which addresses are registered.
        // Without this branch we tell the person to check their email for a
        // confirmation that will never arrive, because nothing was sent.
        setInfo("That email already has an account. Try signing in, or use “Forgot password?” below.");
      } else {
        // Attribution already happened server-side, in handle_new_user().
        if (ref) clearRef();
        // Only recordable once there's a session — the insert is RLS'd to the
        // signed-in user. On a confirm-by-email flow the row lands on first
        // sign-in instead, which is the right moment anyway: an unconfirmed
        // address isn't a signup yet.
        if (data.session) {
          track("signup", { referred: !!ref, ...(wantedPlan ? { plan: wantedPlan } : {}) });
          router.push(wantedPlan ? "/pricing" : "/home");
        }
        else {
          setInfo("Check your email to confirm your account, then sign in.");
          setAwaitingConfirm(true);
        }
      }
    }
    setLoading(false);
  }

  /**
   * Send the confirmation email again. Auth mail genuinely does go missing —
   * greylisting, spam folders, a typo'd address — and without this the only
   * recovery was signing up again, which fails because the account exists.
   *
   * Supabase rate-limits this server-side; the local cooldown just stops people
   * hammering the button into that error.
   */
  async function resendConfirmation() {
    if (cooldown > 0 || !email) return;
    setError(null);
    setInfo(null);
    const { error } = await createClient().auth.resend({ type: "signup", email });
    if (error) {
      setError(
        /rate|limit|seconds/i.test(error.message)
          ? "Too many requests just now — wait a minute and try again."
          : error.message
      );
      return;
    }
    setInfo(`Sent again to ${email}. It can take a minute — check your spam folder too.`);
    setCooldown(60);
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-5">
      <div className="w-full max-w-sm animate-scale-in">
        <div className="mb-8 text-center">
          <Logo size={64} className="mx-auto mb-4" />
          {/* An h1, not a styled div. This is the page's title and the only
              thing on it that names where you are — a screen reader announcing
              "heading level 1, PocketAthlete" is the difference between landing
              here and being lost. Caught by the e2e h1 check. */}
          <h1 className="text-4xl font-extrabold tracking-tight">
            <span className="text-pitch-400">PocketAthlete</span>
          </h1>
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
          {/* A visible field, not just the ?ref= link. Codes get passed on by
              word of mouth — "use SACHA20" — and there's no link to stash in
              that case, so the referral was simply lost. */}
          {mode === "sign_up" && (
            <label className="block">
              <span className="field-label">Referral code <span className="normal-case text-slate-500">(optional)</span></span>
              <input
                className="field"
                value={refCode}
                onChange={(e) => setRefCode(e.target.value)}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                placeholder="Got a code from a coach or a mate?"
              />
              {refState === "ok" && <span className="mt-1 block text-xs text-readiness-green">✓ Code applied.</span>}
              {refState === "bad" && (
                <span className="mt-1 block text-xs text-readiness-red">
                  We don&apos;t recognise that code — check it, or leave it blank.
                </span>
              )}
            </label>
          )}
          <label className="block">
            <span className="field-label">Email</span>
            <input type="email" required className="field" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
          </label>
          {mode !== "forgot" && (
            <label className="block">
              <span className="field-label">Password</span>
              {/* SHOW/HIDE. Typing a password blind on a phone keyboard is where
                  people fail and give up, and there was no way to check it — so a
                  fat-fingered character became "wrong password" with no clue
                  which. Standard on every login form for exactly this reason. */}
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  minLength={6}
                  autoComplete={mode === "sign_up" ? "new-password" : "current-password"}
                  className="field pr-16"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-pressed={showPassword}
                  className="tap-target absolute right-1 top-1/2 -translate-y-1/2 px-2 text-xs font-semibold text-slate-400 hover:text-pitch-400"
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
              {/* Said up front rather than left to a native browser popup after
                  they've already tried to submit. */}
              {mode === "sign_up" && (
                <span className="mt-1 block text-xs text-slate-500">At least 6 characters.</span>
              )}
            </label>
          )}

          {mode === "sign_in" && (
            <button
              type="button"
              onClick={() => { setMode("forgot"); setError(null); setInfo(null); }}
              className="tap-target block text-left text-xs text-slate-400 hover:text-pitch-400"
            >
              Forgot password?
            </button>
          )}

          {verifying && (
            <p className="flex items-center gap-2 text-sm text-pitch-400">
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-pitch-500 border-t-transparent" />
              Confirming your email…
            </p>
          )}
          {error && <p className="text-sm text-readiness-red">{error}</p>}
          {info && <p className="text-sm text-pitch-400">{info}</p>}

          {/* Confirmation mail goes missing often enough that "sign up again"
              being the only recovery is a real dead end — the second attempt
              fails because the account already exists. */}
          {awaitingConfirm && (
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
              <p className="text-xs text-slate-400">Didn&apos;t get the email? Check spam, then:</p>
              <button
                type="button"
                onClick={resendConfirmation}
                disabled={cooldown > 0}
                className="mt-2 text-sm font-semibold text-pitch-400 hover:underline disabled:text-slate-500 disabled:no-underline"
              >
                {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend confirmation email"}
              </button>
            </div>
          )}

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
